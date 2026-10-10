"use client"

// «Your van», where the Projects panel is in the demo
// (docs/2026-10-09-demo-instance.md, decision 8): the demo's van drawn under
// its sky, lit by what the screens switch. What it reads and how it is drawn
// live beside the demo van (integrations/vanpi/demo-scene.js); this panel
// only listens to the broker for those topics and shows the drawing. It
// listens to the broker, not to the preview: what another visitor switches
// lights here too, as in a real van.

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import type { MqttClient } from "mqtt"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { trackDemo } from "@/hooks/use-demo-tracking"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import * as scene from "@/integrations/vanpi/demo-scene"

const COLLAPSED_KEY = "schaltli.demoScenePanelCollapsed"

/** The forum thread the demo is announced in, where the next stage is asked for. */
export const DEMO_FORUM_URL = "https://forum.pekaway.de/"

/**
 * The scene drawn from the broker's live values, as an SVG string, and what
 * a click on it does: a part marked data-action="<name>" sends that command
 * to the demo van (scene.COMMAND_PREFIX + name) - the shower behind the
 * sliding door, the canister at the filler.
 */
export function useDemoScene(): { svg: string; onClick: (event: MouseEvent<HTMLElement>) => void } {
  const [values, setValues] = useState<Record<string, string>>({})
  const { connect, disconnect } = useMqttConnection("schaltli-demo-scene")
  const clientRef = useRef<MqttClient | null>(null)

  useEffect(() => {
    let current = true
    connect()
      .then((client) => {
        if (!current) return
        clientRef.current = client
        client.on("message", (topic, payload) => {
          if (!current) return
          const value = payload.toString()
          setValues((prev) => (prev[topic] === value ? prev : { ...prev, [topic]: value }))
        })
        client.subscribe(scene.SCENE_TOPICS, { qos: 0 })
      })
      .catch(() => {
        // No broker: the scene shows its van at noon with everything off.
      })
    return () => {
      current = false
      clientRef.current = null
      disconnect()
    }
  }, [connect, disconnect])

  const svg = useMemo(() => scene.sceneSvg(values), [values])
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const part = (event.target as Element).closest?.("[data-action]")
    const action = part?.getAttribute("data-action")
    if (action && clientRef.current) {
      clientRef.current.publish(scene.COMMAND_PREFIX + action, "start")
      trackDemo("scene", action)
    }
  }
  return { svg, onClick }
}

// Twice as wide in the preview, where the demo shows no panel on the right
// (2026-10-10); the drawing grows with it.
export function DemoScenePanel({ wide = false }: { wide?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const { svg, onClick } = useDemoScene()

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true")
    } catch {
      // No storage: open, the default.
    }
  }, [])

  const toggle = (next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Not remembered, then.
    }
  }

  if (collapsed) {
    return (
      <div className="w-8 shrink-0 border-r border-border bg-card flex flex-col items-center pt-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Show your van" onClick={() => toggle(false)}>
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <aside
      aria-label="Your van"
      data-wide={wide}
      className={cn(
        "shrink-0 border-r border-border bg-card flex flex-col min-h-0 overflow-y-auto",
        wide ? "w-[632px]" : "w-[316px]",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Your van</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Hide your van" onClick={() => toggle(true)}>
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>
      <div
        data-testid="demo-scene"
        className="px-2 pt-2 text-foreground [&>svg]:h-auto [&>svg]:w-full"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className={cn("px-3 text-muted-foreground", wide ? "text-sm" : "text-xs")}>Tap the shower behind the door, or the filler under the rear window.</p>
      <p className={cn("px-3 pb-3 text-muted-foreground", wide ? "text-sm" : "text-xs")}>
        This van is a conversion in progress. So far: light and water. Next: solar?{" "}
        <a href={DEMO_FORUM_URL} target="_blank" rel="noreferrer" className="underline">
          Say what comes next
        </a>
      </p>
    </aside>
  )
}
