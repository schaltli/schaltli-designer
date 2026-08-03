"use client"

// Shared WebSocket MQTT connection lifecycle, extracted from
// components/mqtt-discovery-dialog.tsx (2026-08-01) so the deploy flow
// (components/deploy-dialog.tsx) doesn't duplicate the same connect/
// timeout/error boilerplate, and so both features share one remembered
// broker config instead of asking the user to re-enter it twice.

import { useCallback, useEffect, useRef, useState } from "react"
import mqtt from "mqtt"

export interface MqttConnectionConfig {
  websocketUrl: string
  username: string
  password: string
  clientId: string
}

const STORAGE_KEY = "screenbee-mqtt-connection"

function loadStoredConfig(): Partial<MqttConnectionConfig> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function storeConfig(config: MqttConnectionConfig) {
  if (typeof window === "undefined") return
  try {
    // Only the broker URL is worth remembering across sessions/features -
    // username/password stay session-only, not written to localStorage.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ websocketUrl: config.websocketUrl }))
  } catch {
    // localStorage unavailable (private browsing, quota) - not fatal.
  }
}

// The broker and the designer app always run on the same host in every
// documented deployment (this dev server + hil/local-broker.js on
// localhost, or a real Pekaway's nginx-fronted app + mosquitto on
// screenbee.peka.way/a LAN IP - see README.md) - only the port differs
// (mosquitto's added WebSocket listener, 9001). Deriving this from the
// page's own host means every self-hosted instance works with zero setup,
// instead of every user having to find and type their own LAN IP/hostname.
// A previously-stored override (below) still takes precedence, for the
// rare case app and broker really are on different hosts.
function defaultWebsocketUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:9001"
  return `ws://${window.location.hostname}:9001`
}

export function useMqttConnection(clientIdPrefix: string) {
  const [config, setConfig] = useState<MqttConnectionConfig>(() => ({
    websocketUrl: defaultWebsocketUrl(),
    username: "",
    password: "",
    clientId: `${clientIdPrefix}-${Date.now()}`,
    ...loadStoredConfig(),
  }))
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<mqtt.MqttClient | null>(null)
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }, [])

  const connect = useCallback(
    (overrides?: Partial<MqttConnectionConfig>) => {
      return new Promise<mqtt.MqttClient>((resolve, reject) => {
        const effective = { ...config, ...overrides }
        const websocketUrl = effective.websocketUrl.trim()
        if (!websocketUrl.startsWith("ws://") && !websocketUrl.startsWith("wss://")) {
          const message = "WebSocket URL must start with ws:// or wss://"
          setError(message)
          reject(new Error(message))
          return
        }

        setIsConnecting(true)
        setError(null)
        storeConfig(effective)

        const client = mqtt.connect(websocketUrl, {
          clientId: effective.clientId,
          username: effective.username || undefined,
          password: effective.password || undefined,
          connectTimeout: 5000,
          reconnectPeriod: 0,
          clean: true,
        })

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
    [config],
  )

  // Disconnect on unmount only - not on every `disconnect` identity change
  // (it's stable via useCallback, but this mirrors the discovery dialog's
  // original cleanup-on-unmount intent exactly).
  useEffect(() => disconnect, [disconnect])

  return { config, setConfig, isConnecting, isConnected, error, setError, connect, disconnect, clientRef }
}
