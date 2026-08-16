"use client"

/**
 * Deploy a project straight to a physical device over MQTT, instead of the
 * "Export Project" zip download + manual setup-mode upload today's users
 * are stuck with. Design settled via a full grilling session (2026-08-01,
 * see the designer repo's plan history): the browser uploads the built zip
 * to this app's own backend (app/api/deploy), then publishes a *retained*
 * MQTT trigger naming that zip's URL + a CRC32 - the device downloads it
 * itself, verifies it, and only then applies it. No write endpoint on the
 * device at all.
 *
 * Device discovery, online/offline liveness, and live deploy progress all
 * ride the same WebSocket MQTT connection (useMqttConnection, shared with
 * components/mqtt-discovery-dialog.tsx) - no separate protocol.
 */

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, generateUuid } from "@/lib/utils"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { buildDeviceProjectZip } from "@/lib/project-zip"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"
import { crc32 } from "@/lib/crc32"
import { loadDeviceDescriptionByPath } from "@/lib/device-description"
import { collectObjectTypes } from "@/lib/object-tree"
import type { Project } from "./project-editor"
import { Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2, Rocket, AlertTriangle } from "lucide-react"

interface DeployDialogProps {
  project: Project
  children: React.ReactNode
  // Lets a successful deploy bind this project to the target device's
  // instanceId (see app/api/projects/by-instance/[instanceId]) and take a
  // version-history checkpoint - both no-ops if omitted, so this stays
  // backward compatible with any other DeployDialog caller.
  onProjectUpdate?: (project: Project) => void
}

interface DiscoveredDevice {
  instanceId: string
  deviceId: string
  name?: string
  firmwareVersion?: string
  online: boolean
  // From the device's own "hello" - both present only on firmware that
  // self-announces its DDF (see device-scan-section.tsx's identical
  // convention). Used below to check placed object types against this
  // specific device's actual supportedObjectTypes before deploy, and to
  // silently refresh the project's stored ddfVersion after a successful
  // one - docs/nested-provenance.md's "Version compatibility" > Fall 2,
  // steps 3-4.
  ddfVersion?: string
  ddfUrl?: string
}

type DeployStatusState =
  | "queued"
  | "downloading"
  | "download_complete"
  | "verifying"
  | "applying"
  | "rebooting"
  | "error"
  | "busy"
  | "up_to_date"

interface DeployStatus {
  deployId: string
  state: DeployStatusState
  percent?: number
  error?: string
}

export function DeployDialog({ project, children, onProjectUpdate }: DeployDialogProps) {
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<Map<string, DiscoveredDevice>>(new Map())
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null)
  // Which of the project's own placed object types this device's live DDF
  // doesn't support - null while unchecked/checking or once nothing's
  // wrong. A warning, never a block (docs/nested-provenance.md's "Version
  // compatibility" > Fall 2, step 3) - the device already gracefully
  // skips anything it can't render, this just tells the human before
  // deploy instead of them discovering it by staring at the device.
  const [unsupportedTypeWarning, setUnsupportedTypeWarning] = useState<string | null>(null)

  const activeDeployIdRef = useRef<string | null>(null)
  const { config, setConfig, isConnecting, isConnected, error: connectionError, connect, disconnect, clientRef } =
    useMqttConnection("screenbee-deploy")

  useEffect(() => {
    if (!open) {
      disconnect()
      setDevices(new Map())
      setSelectedInstanceId(null)
      setDeployStatus(null)
      setDeployError(null)
      setUnsupportedTypeWarning(null)
      activeDeployIdRef.current = null
    }
  }, [open])

  // Auto-connect the moment the dialog opens - the broker URL is derived
  // automatically now (useMqttConnection), so there's no real setup step
  // left for the common case. Deliberately keyed only on `open`, not
  // isConnected/isConnecting, so this fires once per dialog-open rather
  // than re-triggering as those flip during the attempt; the manual field
  // + Connect button below still work for editing/retrying.
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
        client.subscribe(`${TOPIC_PREFIX}/+/status`)
        client.subscribe(`${TOPIC_PREFIX}/+/deploy-status`)

        client.on("message", (topic, message) => {
          const parts = topic.split("/")
          if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX) return
          const instanceId = parts[1]
          const leaf = parts[2]
          const payload = message.toString()

          if (leaf === "hello") {
            try {
              const hello = JSON.parse(payload)
              setDevices((prev) => {
                const next = new Map(prev)
                const existing = next.get(instanceId)
                next.set(instanceId, {
                  instanceId,
                  deviceId: hello.deviceId,
                  name: hello.name,
                  firmwareVersion: hello.firmwareVersion,
                  online: existing?.online ?? true,
                  ddfVersion: hello.ddfVersion,
                  ddfUrl: hello.url,
                })
                return next
              })
            } catch {
              // Malformed hello payload - ignore, device will retry on its own retained publish.
            }
            return
          }

          if (leaf === "status") {
            setDevices((prev) => {
              const existing = prev.get(instanceId)
              if (!existing) return prev
              const next = new Map(prev)
              next.set(instanceId, { ...existing, online: payload === "online" })
              return next
            })
            return
          }

          if (leaf === "deploy-status") {
            try {
              const status: DeployStatus = JSON.parse(payload)
              if (status.deployId !== activeDeployIdRef.current) return
              setDeployStatus(status)
              if (status.state === "error") setDeployError(status.error || "Deploy failed")
            } catch {
              // Malformed status payload - ignore.
            }
          }
        })
      })
      .catch(() => {
        // Error surfaced via connectionError already.
      })
  }

  const compatibleDevices = Array.from(devices.values()).filter((d) => d.deviceId === project.settings.deviceId)

  // Checks the selected device's *live* supportedObjectTypes (fetched
  // fresh via the same /api/ddf/fetch proxy device-scan-section.tsx uses,
  // not whatever might already be cached from project creation - a
  // device's DDF can have moved on since then) against what this project
  // actually places, once a device that self-announces its DDF is
  // selected. docs/nested-provenance.md's "Version compatibility" > Fall
  // 2, step 3. Best-effort: any failure here (fetch error, or a device
  // whose hello carries no ddfVersion/url at all) just leaves the warning
  // unset rather than blocking anything - the device's own graceful
  // skip-unknown-type fallback (ColorScreenRenderer.cpp's "not
  // implemented yet, skipping") is still the real safety net, this is
  // only meant to save the user from discovering it by staring at a
  // device that's silently missing a widget.
  useEffect(() => {
    setUnsupportedTypeWarning(null)
    if (!selectedInstanceId) return
    const device = devices.get(selectedInstanceId)
    if (!device?.ddfVersion || !device?.ddfUrl) return

    let cancelled = false
    ;(async () => {
      try {
        const fetchRes = await fetch("/api/ddf/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: device.deviceId, ddfVersion: device.ddfVersion, url: device.ddfUrl }),
        })
        if (!fetchRes.ok || cancelled) return

        const fields = await loadDeviceDescriptionByPath(`/api/ddf/data/${device.deviceId}.ddf.zip`)
        if (cancelled) return

        const placedTypes = project.screens.reduce(
          (set, screen) => collectObjectTypes(screen.objects, set),
          new Set<string>(),
        )
        const unsupported = Array.from(placedTypes).filter((type) => !fields.supportedObjectTypes.includes(type))
        if (unsupported.length > 0) {
          setUnsupportedTypeWarning(
            `This project places ${unsupported.join(", ")} - "${device.name || device.deviceId}"'s current firmware doesn't support ${unsupported.length === 1 ? "that type" : "those types"}, so ${unsupported.length === 1 ? "it" : "they"} won't render on the device.`,
          )
        }
      } catch {
        // Best-effort - see this effect's own comment.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedInstanceId, devices, project.screens])

  const handleDeploy = async () => {
    if (!selectedInstanceId || !clientRef.current) return
    setIsDeploying(true)
    setDeployError(null)
    setDeployStatus(null)

    try {
      const zipBlob = await buildDeviceProjectZip(project)
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
      const checksum = crc32(zipBytes)

      const formData = new FormData()
      formData.append("instanceId", selectedInstanceId)
      formData.append("file", zipBlob, "project.zip")

      const res = await fetch("/api/deploy", { method: "POST", body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${res.status})`)
      }
      // The server determines this URL (from its own network interfaces,
      // see lib/server-lan-address.ts), not window.location.origin - a
      // browser reached via http://localhost:3000 would otherwise hand
      // the device a URL that only ever resolves back to the device
      // itself (2026-08-01, reported live: exactly this happened).
      const { url } = await res.json()

      const deployId = generateUuid()
      activeDeployIdRef.current = deployId

      clientRef.current.publish(
        `${TOPIC_PREFIX}/${selectedInstanceId}/deploy`,
        JSON.stringify({ deployId, url, crc32: checksum }),
        { retain: true, qos: 1 },
      )

      // The trigger is retained, so this always "succeeds" from the
      // browser's point of view whether or not the device is actually
      // there to receive it right now - an offline device picks it up on
      // its own next reconnect (that's the whole point of retaining it).
      // Claiming "Downloading" here regardless was a real bug (reported
      // live, 2026-08-01): with the device off, nothing ever corrects
      // that guess, since the device is the only thing that would
      // publish a real deploy-status - the UI just sat on a fake
      // "Downloading" forever. Show the honest state instead; if the
      // device is (or becomes) reachable, its own deploy-status messages
      // for this deployId still arrive on the same subscription and
      // naturally replace this.
      setDeployStatus({ deployId, state: selectedDevice?.online ? "downloading" : "queued", percent: 0 })

      // Bind this project to the device it was just sent to, and take a
      // version-history checkpoint of exactly what got deployed - see
      // app/api/projects/[projectId]/versions/route.ts's header comment
      // for why this trigger point (not periodic/every-edit) keeps the
      // checkpoint list meaningful. Best-effort: a failed autosave/
      // snapshot call shouldn't block or fail the deploy itself, which
      // has already genuinely succeeded (the retained trigger is
      // published) by this point.
      const boundProject: Project = {
        ...project,
        settings: {
          ...project.settings,
          boundInstanceId: selectedInstanceId,
          // Silent refresh, no dialog - nothing the project uses is
          // missing when the device is ahead, so this just keeps the
          // stored marker honest. docs/nested-provenance.md's "Version
          // compatibility" > Fall 2, step 4.
          ddfVersion: selectedDevice?.ddfVersion ?? project.settings.ddfVersion,
        },
      }
      onProjectUpdate?.(boundProject)
      fetch(`/api/projects/${project.settings.projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(boundProject),
      }).catch(() => {})
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : "Deploy failed")
    } finally {
      setIsDeploying(false)
    }
  }

  const selectedDevice = selectedInstanceId ? devices.get(selectedInstanceId) : null

  return (
    <>
      <div onClick={() => setOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deploy to Device
            </DialogTitle>
          </DialogHeader>

          {!isConnected ? (
            <div className="py-4 space-y-3">
              <div>
                <label htmlFor="deploy-broker-url" className="text-sm font-medium">
                  MQTT WebSocket URL
                </label>
                <Input
                  id="deploy-broker-url"
                  value={config.websocketUrl}
                  onChange={(e) => setConfig({ ...config, websocketUrl: e.target.value })}
                  placeholder="ws://screenbee.peka.way:9001"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Same broker your devices publish to - shared with the MQTT Discovery dialog.
                </p>
              </div>
              {connectionError && <p className="text-sm text-destructive">{connectionError}</p>}
              <Button onClick={handleConnect} disabled={isConnecting || !config.websocketUrl} className="w-full">
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          ) : deployStatus ? (
            <div className="py-4 space-y-4">
              <DeployProgress status={deployStatus} deviceName={selectedDevice?.name || selectedInstanceId || ""} />
              {(deployStatus.state === "error" ||
                deployStatus.state === "busy" ||
                deployStatus.state === "up_to_date" ||
                deployStatus.state === "queued") && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => setDeployStatus(null)}>
                  Back
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {!project.settings.deviceId && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  This project has no device assigned - open Project Settings and pick one first.
                </p>
              )}

              <ScrollArea className="max-h-64">
                {compatibleDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No matching devices found yet. Listening for devices on the broker...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {compatibleDevices.map((device) => (
                      <button
                        key={device.instanceId}
                        onClick={() => setSelectedInstanceId(device.instanceId)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border",
                          selectedInstanceId === device.instanceId ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        {device.online ? (
                          <Wifi className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="flex-1 truncate">{device.name || device.instanceId}</span>
                        {!device.online && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            will apply on reconnect
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {unsupportedTypeWarning && (
                <p className="text-sm text-amber-600 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {unsupportedTypeWarning}
                </p>
              )}

              {deployError && <p className="text-sm text-destructive">{deployError}</p>}

              <Button
                onClick={handleDeploy}
                disabled={!selectedInstanceId || isDeploying || !project.settings.deviceId}
                className="w-full"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Deploy"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

const STATE_LABELS: Record<DeployStatusState, string> = {
  queued: "Offline - will apply automatically when the device reconnects",
  downloading: "Downloading",
  download_complete: "Download complete",
  verifying: "Verifying",
  applying: "Applying",
  rebooting: "Rebooting",
  error: "Failed",
  busy: "Device is busy with another deploy",
  up_to_date: "Already up to date",
}

function DeployProgress({ status, deviceName }: { status: DeployStatus; deviceName: string }) {
  const isDone = status.state === "rebooting"
  const isError = status.state === "error" || status.state === "busy"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {isError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : status.state === "queued" ? (
          <WifiOff className="h-4 w-4 text-muted-foreground" />
        ) : isDone || status.state === "up_to_date" ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        <span>
          {deviceName}: {STATE_LABELS[status.state]}
        </span>
      </div>

      {status.state === "downloading" && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${status.percent ?? 0}%` }}
          />
        </div>
      )}

      {status.error && <p className="text-sm text-destructive">{status.error}</p>}
    </div>
  )
}
