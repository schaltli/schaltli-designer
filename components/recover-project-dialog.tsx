"use client"

/**
 * "Recover project from device" (2026-08-15, docs/nested-provenance.md's
 * "Version compatibility" > Fall 3) - the actual designer-side entry point
 * for the recovery chain built this session: DeployManager.cpp (M5 Dial
 * firmware) now retains every verified deploy's full export at
 * RECOVERY_PROJECT_PATH, which itself embeds the editable project as
 * _source/project.zip (which embeds _source/ddf.zip in turn). This dialog
 * finds a device on the broker, fetches that retained copy over plain
 * HTTP (GET /recovery-project on the device's own always-on server), and
 * unwraps it one level to get the editable project zip - the outer
 * export's baked bitmaps aren't useful here, only what's nested inside it.
 *
 * Lives in the Startup Gate (not a File-menu dialog like Deploy) because
 * the motivating case is "the project file is gone" - there's no project
 * open yet to attach a menu item to. Only offers devices whose "hello"
 * carries ddfVersion+url (the same self-announcing capability
 * device-scan-section.tsx/deploy-dialog.tsx already key off of), since
 * that's the only way this dialog can derive a device's HTTP origin to
 * even ask it for anything - a device that's never announced either just
 * doesn't show up here, no error needed.
 */

import type React from "react"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"
import JSZip from "jszip"
import { Wifi, WifiOff, Loader2, AlertCircle, LifeBuoy } from "lucide-react"

interface RecoverProjectDialogProps {
  children: React.ReactNode
  // Reuses project-editor.tsx's processUploadedProjectFile - the exact same
  // parsing/device-resolution path a real file-picker upload goes through,
  // just fed a synthetic File instead of one from an <input>.
  onRecoverProject: (file: File) => void | Promise<void>
}

interface AnnouncedDevice {
  instanceId: string
  deviceId: string
  name?: string
  ddfUrl?: string
}

interface HelloPayload {
  deviceId?: string
  name?: string
  ddfVersion?: string
  url?: string
}

export function RecoverProjectDialog({ children, onRecoverProject }: RecoverProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<Map<string, AnnouncedDevice>>(new Map())
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)

  const { config, setConfig, isConnecting, isConnected, error: connectionError, connect, disconnect } =
    useMqttConnection("screenbee-recover")

  useEffect(() => {
    if (!open) {
      disconnect()
      setDevices(new Map())
      setSelectedInstanceId(null)
      setRecoverError(null)
    }
  }, [open])

  useEffect(() => {
    if (open && !isConnected && !isConnecting) {
      handleConnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleConnect() {
    connect()
      .then((client) => {
        client.subscribe(`${TOPIC_PREFIX}/+/hello`)
        client.on("message", (topic, message) => {
          const parts = topic.split("/")
          if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX || parts[2] !== "hello") return
          const instanceId = parts[1]

          let hello: HelloPayload
          try {
            hello = JSON.parse(message.toString())
          } catch {
            return
          }
          // No ddfVersion+url means no known way to reach this device's own
          // HTTP server from here - not an error, just not offered.
          if (!hello.deviceId || !hello.url) return

          setDevices((prev) => {
            const next = new Map(prev)
            next.set(instanceId, {
              instanceId,
              deviceId: hello.deviceId!,
              name: hello.name,
              ddfUrl: hello.url,
            })
            return next
          })
        })
      })
      .catch(() => {
        // Error surfaced via connectionError already.
      })
  }

  const handleRecover = async () => {
    const device = selectedInstanceId ? devices.get(selectedInstanceId) : null
    if (!device?.ddfUrl) return
    setIsRecovering(true)
    setRecoverError(null)

    try {
      const origin = new URL(device.ddfUrl).origin
      // Server-side proxy, not a direct browser fetch to the device's own
      // IP - see app/api/recovery/fetch/route.ts's header comment for why
      // (CORS: no device firmware here sends
      // Access-Control-Allow-Origin, same reasoning as device-scan-
      // section.tsx going through /api/ddf/fetch instead of fetching a
      // device directly).
      const res = await fetch("/api/recovery/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `${origin}/recovery-project` }),
      })
      if (res.status === 404) {
        throw new Error(`"${device.name || device.deviceId}" has never had a project deployed to it - nothing to recover.`)
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Fetching the recovery copy failed (${res.status})`)
      }

      // The retained file is the *export* (baked bitmaps + object model),
      // not the editable project directly - it only carries the editable
      // project nested one level in, as _source/project.zip (see
      // lib/project-zip.ts's buildDeviceProjectZip). Unwrap exactly that
      // one entry; the rest of the export is of no use here.
      const exportZip = await JSZip.loadAsync(await res.arrayBuffer())
      const embeddedProjectEntry = exportZip.file("_source/project.zip")
      if (!embeddedProjectEntry) {
        throw new Error(
          `"${device.name || device.deviceId}"'s retained copy predates project embedding - nothing recoverable in it.`,
        )
      }
      const projectBytes = await embeddedProjectEntry.async("blob")

      // Re-sync the embedded DDF to what this device's *currently running*
      // firmware serves live (docs/nested-provenance.md's Fall 3, revised
      // 2026-08-17), rather than keeping whatever vintage was frozen into
      // the retained deploy. Fall 1 still opens a plain uploaded project
      // file strictly against its own frozen DDF - unchanged, and correct
      // there: you don't want opening a project someone hands you to
      // quietly rebind against whatever hardware happens to be connected to
      // your instance right now. Recovery is different - its whole premise
      // is "the project file is gone, all that's left is this device", so
      // there's no independent frozen copy worth protecting; the device's
      // own live DDF is the only thing that can still open successfully
      // long-term, since a DDF's *format* itself can break (e.g.
      // 2026-08-16's declarative adornment.drawingArea -> a
      // <rect id="screen"> in the SVG) without a schemaVersion bump to
      // catch it and gate a fallback parse - a real gap, not yet closed for
      // Fall 1's plain-upload path either. Old hardware-button-action
      // bindings that no longer match the current adornment's ids are
      // silently orphaned by this swap, not fixed up - the same
      // "gracefully degradable" tolerance Fall 2 step 3 already accepts for
      // a ddfVersion content mismatch, just reached via a different door.
      // Reuses hello's own "url" (already http://<ip>/ddf.zip - see
      // main.cpp's publishHello()) through the same generic proxy the
      // recovery-project fetch above just used. Best-effort: device.ddfUrl
      // being unreachable for this second request (unlikely, the same
      // origin just answered /recovery-project) falls back to the frozen
      // copy rather than failing the whole recovery.
      let finalProjectBytes: Blob = projectBytes
      try {
        const liveDdfRes = await fetch("/api/recovery/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: device.ddfUrl }),
        })
        if (liveDdfRes.ok) {
          const liveDdfBytes = await liveDdfRes.arrayBuffer()
          const projectZip = await JSZip.loadAsync(projectBytes)
          projectZip.file("_source/ddf.zip", liveDdfBytes)
          finalProjectBytes = await projectZip.generateAsync({ type: "blob" })
        }
      } catch {
        // Best-effort resync only - see comment above.
      }

      const file = new File([finalProjectBytes], "recovered_project.zip", { type: "application/zip" })
      await onRecoverProject(file)
      setOpen(false)
    } catch (error) {
      setRecoverError(error instanceof Error ? error.message : "Recovery failed")
    } finally {
      setIsRecovering(false)
    }
  }

  return (
    <>
      <div onClick={() => setOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4" />
              Recover Project from Device
            </DialogTitle>
          </DialogHeader>

          {!isConnected ? (
            <div className="py-4 space-y-3">
              <div>
                <label htmlFor="recover-broker-url" className="text-sm font-medium">
                  MQTT WebSocket URL
                </label>
                <Input
                  id="recover-broker-url"
                  value={config.websocketUrl}
                  onChange={(e) => setConfig({ ...config, websocketUrl: e.target.value })}
                  placeholder="ws://screenbee.peka.way:9001"
                  className="mt-1"
                />
              </div>
              {connectionError && <p className="text-sm text-destructive">{connectionError}</p>}
              <Button onClick={handleConnect} disabled={isConnecting || !config.websocketUrl} className="w-full">
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick the device whose last-deployed project you want back. Only recovers what was actually deployed -
                edits made since then are lost.
              </p>

              <ScrollArea className="max-h-64">
                {devices.size === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No devices announcing yet. Listening on the broker...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {Array.from(devices.values()).map((device) => (
                      <button
                        key={device.instanceId}
                        onClick={() => setSelectedInstanceId(device.instanceId)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border",
                          selectedInstanceId === device.instanceId
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        <Wifi className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="flex-1 truncate">{device.name || device.instanceId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {recoverError && (
                <p className="text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {recoverError}
                </p>
              )}

              <Button onClick={handleRecover} disabled={!selectedInstanceId || isRecovering} className="w-full">
                {isRecovering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Recovering...
                  </>
                ) : (
                  "Recover"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
