"use client"

/**
 * Auto-discovers new/updated device DDFs on the broker (2026-08-03,
 * grilling session) - listens for MQTT `hello` messages carrying a DDF
 * `url`, and calls app/api/ddf/fetch for any deviceId whose announced DDF
 * isn't what this instance already has cached. Mounted
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
  // deviceId -> hash of the DDF this instance currently holds for it (null
  // if that copy couldn't be read). A deviceId simply absent from the map
  // means "not seen locally at all".
  knownDdfHashes: Map<string, string | null>
  // Called after a fetch succeeds, so the Startup Gate's device list picks
  // up the newly-cached DDF.
  onDdfFetched: () => void
  // Which deviceIds are announcing themselves on the broker right now, so
  // the gate can tell a device that is actually there from a DDF that was
  // merely cached at some point. `null` until the broker connection is up:
  // "we don't know yet" and "nothing is announcing" have to look different,
  // or every device would vanish from the picker for the first second (and
  // permanently, on an instance with no broker at all).
  onAnnouncedDevicesChange?: (deviceIds: Set<string> | null) => void
}

interface HelloPayload {
  deviceId?: string
  name?: string
  // Identity of the DDF served at `url` - see lib/ddf-name.ts. Optional:
  // firmware that doesn't announce one is still discoverable, it just
  // costs a fetch to find out whether anything changed (see below).
  ddfHash?: string
  url?: string
}

export function DeviceScanSection({ knownDdfHashes, onDdfFetched, onAnnouncedDevicesChange }: DeviceScanSectionProps) {
  const { toast } = useToast()
  const { isConnecting, isConnected, connect, disconnect } = useMqttConnection("screenbee-ddf-scan")
  const [fetchingDeviceIds, setFetchingDeviceIds] = useState<Set<string>>(new Set())

  // Long-lived MQTT message handler (set up once on mount) needs to see the
  // *current* props on every message, not whatever they were at mount time -
  // refs sidestep the stale-closure trap without re-subscribing on every
  // parent re-render (which happens on every DDF list refresh).
  const knownDdfHashesRef = useRef(knownDdfHashes)
  useEffect(() => {
    knownDdfHashesRef.current = knownDdfHashes
  }, [knownDdfHashes])
  const onDdfFetchedRef = useRef(onDdfFetched)
  useEffect(() => {
    onDdfFetchedRef.current = onDdfFetched
  }, [onDdfFetched])
  const onAnnouncedRef = useRef(onAnnouncedDevicesChange)
  useEffect(() => {
    onAnnouncedRef.current = onAnnouncedDevicesChange
  }, [onAnnouncedDevicesChange])

  // instanceId -> deviceId, not a bare set of deviceIds: `hello` is retained
  // per instance, and an emptied retained payload is how an instance says it
  // is gone. Without the mapping there is no way to know *which* deviceId
  // that removal referred to.
  const announcedByInstanceRef = useRef<Map<string, string>>(new Map())
  const publishAnnounced = () => {
    onAnnouncedRef.current?.(new Set(announcedByInstanceRef.current.values()))
  }

  // Only attempt each deviceId+DDF combo once per mount - hello is
  // retained, so it re-arrives on every (re)connect; without this a
  // permanently-unreachable device's hello would otherwise re-trigger (and
  // re-toast) a failing fetch attempt on every reconnect.
  const attemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    connect()
      .then((client) => {
        // Connected: from here on, "no hello for it" is real information
        // about a device rather than an absence of a broker.
        publishAnnounced()
        client.subscribe(`${TOPIC_PREFIX}/+/hello`)
        client.on("message", (topic, message) => {
          const parts = topic.split("/")
          if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX || parts[2] !== "hello") return

          const instanceId = parts[1]
          // An emptied retained payload is a deliberate "this instance is no
          // longer here" (the e2e specs clear theirs this way, and so does a
          // human tidying a broker) - so it retracts the announcement rather
          // than being ignored as a malformed message.
          if (message.length === 0) {
            if (announcedByInstanceRef.current.delete(instanceId)) publishAnnounced()
            return
          }

          let hello: HelloPayload
          try {
            hello = JSON.parse(message.toString())
          } catch {
            return
          }
          if (hello.deviceId) {
            announcedByInstanceRef.current.set(instanceId, hello.deviceId)
            publishAnnounced()
          }
          // Older/simpler firmware that doesn't announce a DDF url yet just
          // isn't eligible for auto-discovery - falls back to the existing
          // manual public/ddf/ path, no error, nothing to do here.
          if (!hello.deviceId || !hello.url) return

          const { deviceId, url } = hello as Required<HelloPayload>
          const announcedHash = hello.ddfHash
          // Without an announced hash there's nothing to compare against, so
          // the url alone keys the attempt: fetch once per mount and let the
          // bytes answer what changed. That's the same cost this had before
          // for a device announcing an unchanged version, and it keeps
          // firmware that predates the hash discoverable rather than
          // silently invisible.
          const attemptKey = `${deviceId}:${announcedHash ?? url}`
          if (attemptedRef.current.has(attemptKey)) return
          if (announcedHash !== undefined && knownDdfHashesRef.current.get(deviceId) === announcedHash) return

          attemptedRef.current.add(attemptKey)
          setFetchingDeviceIds((prev) => new Set(prev).add(deviceId))

          fetch("/api/ddf/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, ddfHash: announcedHash, url }),
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
    return () => {
      // Back to "unknown" rather than "nothing announcing": this component
      // unmounting is not evidence about the network.
      onAnnouncedRef.current?.(null)
      disconnect()
    }
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
