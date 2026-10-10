"use client"

// The demo on a phone (docs/2026-10-09-demo-instance.md, decision 9): the
// designer is made for a mouse and a large screen, so a small or touch-only
// screen gets this page first - the van, live, what Schaltli is, and the way
// on: the handbook, the install, or the designer anyway.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { HANDBOOK_URL } from "@/lib/handbook"
import { DEMO_INSTALL_URL } from "@/hooks/use-demo-mode"
import { useDemoScene } from "@/components/demo-scene-panel"
import { DEMO_COUNTING_URL, trackDemo } from "@/hooks/use-demo-tracking"

const ANYWAY_KEY = "schaltli.demoOpenAnyway"

/** Below this width, or with no fine pointer at all, the phone page comes first. */
export const DEMO_PHONE_MAX_WIDTH = 900

/**
 * Whether this screen gets the phone page: small or touch-only, and the
 * visitor has not chosen the designer anyway in this session. null until
 * known (the first render on the client).
 */
export function useDemoPhonePage(): [boolean | null, () => void] {
  const [phone, setPhone] = useState<boolean | null>(null)
  useEffect(() => {
    let anyway = false
    try {
      anyway = window.sessionStorage.getItem(ANYWAY_KEY) === "1"
    } catch {
      // No storage: ask again, harmless.
    }
    const small = window.innerWidth < DEMO_PHONE_MAX_WIDTH
    const touchOnly = window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(any-pointer: fine)").matches
    setPhone(!anyway && (small || !!touchOnly))
  }, [])
  const openAnyway = () => {
    trackDemo("mode", "designer from the phone page")
    try {
      window.sessionStorage.setItem(ANYWAY_KEY, "1")
    } catch {
      // Not remembered for this session, then.
    }
    setPhone(false)
  }
  return [phone, openAnyway]
}

export function DemoPhoneStart({ onOpenAnyway }: { onOpenAnyway: () => void }) {
  const { svg, onClick } = useDemoScene()
  return (
    <main data-testid="demo-phone-start" className="min-h-screen bg-background text-foreground flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Schaltli</h1>
        <p className="text-base">Design the displays in your van yourself - without programming.</p>
        <div className="rounded-lg overflow-hidden border border-border [&_svg]:w-full [&_svg]:h-auto" onClick={onClick} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-sm text-muted-foreground">
          This is the demo&apos;s van, live - tap the shower behind its door, or the filler under the rear window. On a
          computer you design its screens here and switch its lights from them.
          The designer is made for a mouse and a large screen.
        </p>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <a href={DEMO_INSTALL_URL} target="_blank" rel="noreferrer">
              Install Schaltli
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={HANDBOOK_URL} target="_blank" rel="noreferrer">
              Read the handbook
            </a>
          </Button>
          <Button variant="ghost" onClick={onOpenAnyway}>
            Open the designer anyway
          </Button>
        </div>
        <a href={DEMO_COUNTING_URL} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">
          Visits counted anonymously, no cookies
        </a>
      </div>
    </main>
  )
}
