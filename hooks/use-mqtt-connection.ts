"use client"

// Shared WebSocket MQTT connection lifecycle, extracted from
// components/mqtt-discovery-dialog.tsx (2026-08-01) so the deploy flow
// (components/deploy-dialog.tsx) doesn't duplicate the same connect/
// timeout/error boilerplate, and so both features share one remembered
// broker config instead of asking the user to re-enter it twice.

import { useCallback, useEffect, useRef, useState } from "react"
import mqtt from "mqtt"
import { defaultBrokerUrl } from "@/lib/broker-url"
import { DEFAULT_DISCOVERY_PREFIX } from "@/lib/ha-discovery"
import { BLOCKS_PREFIX } from "@/lib/block-description"

export interface MqttConnectionConfig {
  websocketUrl: string
  username: string
  password: string
  clientId: string
  /**
   * Where devices announce themselves in Home Assistant's discovery format
   * (docs/2026-09-30-block-discovery.md): the Block menu reads its catalog
   * under it. Remembered with the broker, since it belongs to the broker's
   * world, not to a project. Empty means the default.
   */
  discoveryPrefix: string
}

const STORAGE_KEY = "schaltli-mqtt-connection"
// What the same thing was called before 2026-09-23. Read once, when the new
// key is empty, and written back under the new name: this key holds the
// broker a self-hosted instance was told to use, and renaming it silently
// would put a working installation back on its default and look like the
// setting had been forgotten.
const LEGACY_STORAGE_KEY = "screenbee-mqtt-connection"

function loadStoredConfig(): Partial<MqttConnectionConfig> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return {}
    window.localStorage.setItem(STORAGE_KEY, legacy)
    return JSON.parse(legacy)
  } catch {
    return {}
  }
}

function storeConfig(config: MqttConnectionConfig) {
  if (typeof window === "undefined") return
  try {
    // The broker URL and its discovery prefix are worth remembering across
    // sessions/features - username/password stay session-only, not written
    // to localStorage.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ websocketUrl: config.websocketUrl, discoveryPrefix: config.discoveryPrefix.trim() }),
    )
  } catch {
    // localStorage unavailable (private browsing, quota) - not fatal.
  }
}

// The page's own host decides (lib/broker-url.ts): ws://<host>:9001 over
// http, wss://<host>/mqtt over https. A previously-stored override (below)
// still takes precedence, for the rare case app and broker really are on
// different hosts.
function defaultWebsocketUrl(): string {
  return defaultBrokerUrl(typeof window === "undefined" ? undefined : window.location)
}

/**
 * The discovery prefix the catalog is read under: the one remembered with
 * the broker, else Home Assistant's `homeassistant`.
 */
export function storedDiscoveryPrefix(): string {
  return discoveryPrefixOf(loadStoredConfig().discoveryPrefix)
}

/**
 * Where block descriptions are read (docs/2026-10-04-bridge-blocks.md):
 * fixed, and not offered in the UI. A test on the shared local broker sets
 * `blocksPrefix` in the stored connection to stay apart from the others, as
 * it does with the discovery prefix.
 */
export function storedBlocksPrefix(): string {
  const stored = (loadStoredConfig() as { blocksPrefix?: unknown }).blocksPrefix
  return typeof stored === "string" && stored.trim() !== "" ? stored.trim() : BLOCKS_PREFIX
}

/** A prefix as typed, or the default where it is empty. */
export function discoveryPrefixOf(prefix: string | undefined): string {
  const trimmed = (prefix ?? "").trim()
  return trimmed === "" ? DEFAULT_DISCOVERY_PREFIX : trimmed
}

export function useMqttConnection(clientIdPrefix: string) {
  const [config, setConfig] = useState<MqttConnectionConfig>(() => ({
    websocketUrl: defaultWebsocketUrl(),
    username: "",
    password: "",
    clientId: `${clientIdPrefix}-${Date.now()}`,
    discoveryPrefix: "",
    ...loadStoredConfig(),
  }))
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<mqtt.MqttClient | null>(null)
  // A client still connecting. disconnect() ends it too: until 2026-10-07 it
  // only ended one already connected, so React's development double mount -
  // connect, clean up, connect - left the first one connecting, and it came
  // up under the same client id and threw the second off the broker. With
  // reconnectPeriod 0 nothing brought that one back: the deploy dialog then
  // listed no devices (e2e/deploy-dialog.spec.ts failed a different test on
  // most parallel runs).
  const pendingRef = useRef<mqtt.MqttClient | null>(null)
  // Whether someone typed a client id (the MQTT dialog offers the field).
  // Only then is it used as it is; otherwise every connection gets one of
  // its own, as the block catalog's do (use-block-catalog.ts).
  const clientIdEditedRef = useRef(false)
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Whether someone typed a broker address into THIS instance's field. Only
  // then is the address theirs to remember (connect stores it), and only
  // then does it win over what is stored.
  //
  // Until 2026-09-25 every connect stored whatever address its instance had
  // read when it mounted - and the block wizard is mounted with the editor, so
  // a broker set afterwards (another tab, another dialog) was written back to
  // the old one the next time a block was placed, and the wizard kept asking
  // localhost while the setting said otherwise.
  const editedRef = useRef(false)
  const setConfigTracked = useCallback<typeof setConfig>((next) => {
    setConfig((prev) => {
      const value = typeof next === "function" ? next(prev) : next
      if (value.websocketUrl !== prev.websocketUrl || value.discoveryPrefix !== prev.discoveryPrefix) editedRef.current = true
      if (value.clientId !== prev.clientId) clientIdEditedRef.current = true
      return value
    })
  }, [])

  const disconnect = useCallback(() => {
    setIsConnected(false)
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
    if (clientRef.current) {
      clientRef.current.end(true)
      clientRef.current = null
    }
    if (pendingRef.current) {
      pendingRef.current.end(true)
      pendingRef.current = null
    }
  }, [])

  const connect = useCallback(
    (overrides?: Partial<MqttConnectionConfig>) => {
      return new Promise<mqtt.MqttClient>((resolve, reject) => {
        // Read the stored address now rather than trusting the one from
        // mount, unless this instance's own field was edited - and show it,
        // so "Found on …" names the broker actually asked.
        const stored = editedRef.current ? undefined : loadStoredConfig().websocketUrl
        if (stored && stored !== config.websocketUrl) setConfig((prev) => ({ ...prev, websocketUrl: stored }))
        const effective = { ...config, ...(stored ? { websocketUrl: stored } : {}), ...overrides }
        const websocketUrl = effective.websocketUrl.trim()
        if (!websocketUrl.startsWith("ws://") && !websocketUrl.startsWith("wss://")) {
          const message = "WebSocket URL must start with ws:// or wss://"
          setError(message)
          reject(new Error(message))
          return
        }

        setIsConnecting(true)
        setError(null)
        // Only an address someone chose is remembered; a connection made in
        // the background (the wizard, the device scan) stores nothing.
        if (editedRef.current || overrides?.websocketUrl) storeConfig(effective)

        const clientId =
          overrides?.clientId ??
          (clientIdEditedRef.current ? effective.clientId : `${clientIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        const client = mqtt.connect(websocketUrl, {
          clientId,
          username: effective.username || undefined,
          password: effective.password || undefined,
          connectTimeout: 5000,
          reconnectPeriod: 0,
          clean: true,
        })
        pendingRef.current = client

        connectTimeoutRef.current = setTimeout(() => {
          setError("Connection timeout - unable to connect within 5 seconds")
          setIsConnecting(false)
          client.end(true)
          connectTimeoutRef.current = null
          reject(new Error("Connection timeout"))
        }, 5000)

        client.on("connect", () => {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current)
            connectTimeoutRef.current = null
          }
          if (pendingRef.current === client) pendingRef.current = null
          clientRef.current = client
          setIsConnected(true)
          setIsConnecting(false)
          resolve(client)
        })

        client.on("error", (err) => {
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current)
            connectTimeoutRef.current = null
          }
          setError(`Connection failed: ${err.message}`)
          setIsConnecting(false)
          client.end()
          reject(err)
        })

        client.on("offline", () => {
          setIsConnected(false)
        })
      })
    },
    [config, clientIdPrefix],
  )

  // Disconnect on unmount only - not on every `disconnect` identity change
  // (it's stable via useCallback, but this mirrors the discovery dialog's
  // original cleanup-on-unmount intent exactly).
  useEffect(() => disconnect, [disconnect])

  return { config, setConfig: setConfigTracked, isConnecting, isConnected, error, setError, connect, disconnect, clientRef }
}
