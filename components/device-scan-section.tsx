"use client"

/**
 * Auto-discovers new/updated device DDFs on the broker (2026-08-03,
 * grilling session) - listens for MQTT `hello` messages carrying a
 * `ddfVersion`+`url`, and calls app/api/ddf/fetch for any deviceId whose
 * announced version isn't what this instance already has cached. Mounted
 * only while the Startup Gate is shown (components/startup-device-gate.tsx),
 * so "bring a new device onto the network, it just shows up" only needs a
 * browser tab open on that gate - matches the only moment a new device's
 * DDF is actually needed (about to create a project for it).
 */

import { useEffect, useRef, useState } from "react"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { useToast } from "@/hooks/use-toast"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"
import { Wifi, WifiOff, Loader2 } from "lucide-react"

interface DeviceScanSectionProps {
  // deviceId -> currently-known ddfVersion (null if the device is known but
  // its DDF has no version field, e.g. hand-authored before this existed).
  // A deviceId simply absent from the map means "not seen locally at all".
  knownDdfVersions: Map<string, string | null>
  // Called after a fetch succeeds, so the Startup Gate's device list picks
  // up the newly-cached DDF.
  onDdfFetched: () => void
}

interface HelloPayload {
  deviceId?: string
  name?: string
  ddfVersion?: string
  url?: string
}

export function DeviceScanSection({ knownDdfVersions, onDdfFetched }: DeviceScanSectionProps) {
  const { toast } = useToast()
  const { isConnecting, isConnected, connect, disconnect } = useMqttConnection("screenbee-ddf-scan")
  const [fetchingDeviceIds, setFetchingDeviceIds] = useState<Set<string>>(new Set())

  // Long-lived MQTT message handler (set up once on mount) needs to see the
  // *current* props on every message, not whatever they were at mount time -
  // refs sidestep the stale-closure trap without re-subscribing on every
  // parent re-render (which happens on every DDF list refresh).
  const knownDdfVersionsRef = useRef(knownDdfVersions)
  useEffect(() => {
    knownDdfVersionsRef.current = knownDdfVersions
  }, [knownDdfVersions])
  const onDdfFetchedRef = useRef(onDdfFetched)
  useEffect(() => {
    onDdfFetchedRef.current = onDdfFetched
  }, [onDdfFetched])

  // Only attempt each deviceId+ddfVersion combo once per mount - hello is
  // retained, so it re-arrives on every (re)connect; without this a
  // permanently-unreachable device's hello would otherwise re-trigger (and
  // re-toast) a failing fetch attempt on every reconnect.
  const attemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    connect()
      .then((client) => {
        client.subscribe(`${TOPIC_PREFIX}/+/hello`)
        client.on("message", (topic, message) => {
          const parts = topic.split("/")
          if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX || parts[2] !== "hello") return

          let hello: HelloPayload
          try {
            hello = JSON.parse(message.toString())
          } catch {
            return
          }
          // Older/simpler firmware that doesn't announce a ddfVersion+url
          // yet just isn't eligible for auto-discovery - falls back to the
          // existing manual public/ddf/ path, no error, nothing to do here.
          if (!hello.deviceId || !hello.ddfVersion || !hello.url) return

          const { deviceId, ddfVersion, url } = hello as Required<HelloPayload>
          const attemptKey = `${deviceId}:${ddfVersion}`
          if (attemptedRef.current.has(attemptKey)) return
          if (knownDdfVersionsRef.current.get(deviceId) === ddfVersion) return

          attemptedRef.current.add(attemptKey)
          setFetchingDeviceIds((prev) => new Set(prev).add(deviceId))

          fetch("/api/ddf/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, ddfVersion, url }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const errBody = await res.json().catch(() => ({}))
                throw new Error(errBody.error || `Fetch failed (${res.status})`)
              }
              onDdfFetchedRef.current()
            })
            .catch((err) => {
              toast({
                variant: "destructive",
                title: `Couldn't load "${hello.name || deviceId}"'s device description`,
                description: err instanceof Error ? err.message : "DDF fetch failed",
              })
            })
            .finally(() => {
              setFetchingDeviceIds((prev) => {
                const next = new Set(prev)
                next.delete(deviceId)
                return next
              })
            })
        })
      })
      .catch(() => {
        // Connection error surfaced via the status line below.
      })
    return () => disconnect()
    // Connect once on mount - the ref pattern above keeps the message
    // handler's view of props fresh without needing to reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isConnected ? (
        fetchingDeviceIds.size > 0 ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Loading {fetchingDeviceIds.size === 1 ? "a new device" : `${fetchingDeviceIds.size} new devices`}...</span>
          </>
        ) : (
          <>
            <Wifi className="w-3.5 h-3.5 text-green-600" />
            <span>Scanning the network for new devices...</span>
          </>
        )
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>{isConnecting ? "Connecting to the broker..." : "Not connected - new devices won't be detected."}</span>
        </>
      )}
    </div>
  )
}
