"use client"

// The Prebuilt tab's catalog (block plan Task 6b, docs/2026-09-30-block-
// discovery.md, docs/2026-11-05-quick-blocks.md): what the broker's Home
// Assistant discovery configs and block descriptions announce - from what
// the background listener hears, or read once where it does not listen.
// Publishes nothing - no birth message, no homeassistant/status.

import { useEffect, useMemo, useRef, useState } from "react"
import type mqtt from "mqtt"
import { currentBrokerUrl, storedBlocksPrefix, storedDiscoveryPrefix, useMqttConnection } from "@/hooks/use-mqtt-connection"
import { readCatalog, type Catalog } from "@/lib/ha-discovery"
import { useHeardTopics, useListening, type HeardSnapshot } from "@/lib/broker-store"
import type { HeardTopic } from "@/lib/heard-topic"

// Retained messages arrive in one burst, when depends on the broker: the
// burst is over once it has gone quiet this long, and a broker that holds
// nothing is given up on after the second.
const SETTLE_QUIET_MS = 300
const SETTLE_MAX_MS = 5000

export type BlockCatalog =
  | { status: "looking"; broker: string; prefix: string }
  | { status: "offline"; broker: string; prefix: string }
  | { status: "empty"; broker: string; prefix: string }
  | { status: "found"; broker: string; prefix: string; catalog: Catalog }

/**
 * The catalog for the Prebuilt tab (docs/2026-11-05-quick-blocks.md,
 * decision 4): while the designer listens, from what its listener has heard
 * - no connection of its own, at once, and a device announcing itself or
 * taking its announcement back (an empty retained config) shows in the open
 * tab; while it does not, read once when the tab opens, as before, and again
 * on `refresh`. `live` says which.
 */
export function usePrebuiltCatalog(active: boolean): BlockCatalog & { live: boolean; refresh: () => void } {
  const [listening] = useListening()
  const heard = useHeardTopics()
  const [round, setRound] = useState(0)
  const live = useConfigsCatalog(listening && active ? heard : null)
  const once = useBlockCatalog(active && !listening, round)
  const refresh = () => setRound((r) => r + 1)
  return { ...(listening && live ? live : once), live: listening, refresh }
}

/**
 * The catalog of the config messages in `heard`, worked out again only when
 * one of them changed - the snapshot is new every quarter second the broker
 * is busy, the configs seldom.
 */
function useConfigsCatalog(heard: HeardSnapshot | null): BlockCatalog | null {
  const configsRef = useRef<HeardTopic[]>([])
  const configs = useMemo(() => {
    if (!heard) return configsRef.current
    const prefix = storedDiscoveryPrefix()
    const blocksPrefix = storedBlocksPrefix()
    const now = [...heard.topics.values()].filter(
      (t) => t.topic.endsWith("/config") && (t.topic.startsWith(`${prefix}/`) || t.topic.startsWith(`${blocksPrefix}/`)),
    )
    const prev = configsRef.current
    if (now.length === prev.length && now.every((t, i) => t === prev[i])) return prev
    configsRef.current = now
    return now
  }, [heard])
  const catalog = useMemo(() => {
    const messages: Record<string, string> = {}
    // The latest message counts: an empty one is an announcement taken back.
    for (const t of configs) messages[t.topic] = t.messages[0]?.payload ?? ""
    return readCatalog(messages, storedDiscoveryPrefix(), storedBlocksPrefix())
  }, [configs])
  if (!heard) return null
  // The broker as stored now: the listener asks that one on each try.
  const broker = currentBrokerUrl()
  const prefix = storedDiscoveryPrefix()
  if (heard.state === "connecting" || heard.state === "off") return { status: "looking", broker, prefix }
  if (heard.state === "no broker") return { status: "offline", broker, prefix }
  return catalog.entries.length + catalog.unsupported.length > 0 ? { status: "found", broker, prefix, catalog } : { status: "empty", broker, prefix }
}

/** The retained messages on `filters`, once their burst has settled. */
function collectRetained(client: mqtt.MqttClient, filters: string[], cancelled: () => boolean): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const messages: Record<string, string> = {}
    let settle: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      if (settle) clearTimeout(settle)
      clearTimeout(deadline)
      client.removeListener("message", onMessage)
      client.unsubscribe(filters)
      resolve(messages)
    }
    const onMessage = (topic: string, payload: Buffer, packet: mqtt.IPublishPacket) => {
      if (cancelled()) return
      // Only what the broker held: a value that happens to be published while
      // we listen is not part of the catalog.
      if (!packet.retain) return
      messages[topic] = payload.toString()
      if (settle) clearTimeout(settle)
      settle = setTimeout(finish, SETTLE_QUIET_MS)
    }
    const deadline = setTimeout(finish, SETTLE_MAX_MS)
    client.on("message", onMessage)
    client.subscribe(filters)
  })
}

/**
 * The catalog, read while `open` is true: "looking" until the broker's
 * configs have settled, then what it found - or that there is no broker, or
 * nothing under the prefix.
 */
export function useBlockCatalog(open: boolean, round = 0): BlockCatalog {
  const { config, connect, disconnect } = useMqttConnection("schaltli-catalog")
  const [state, setState] = useState<BlockCatalog>(() => ({ status: "looking", broker: config.websocketUrl, prefix: storedDiscoveryPrefix() }))
  const generationRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const generation = ++generationRef.current
    const cancelled = () => generation !== generationRef.current
    const prefix = storedDiscoveryPrefix()
    const blocksPrefix = storedBlocksPrefix()
    setState({ status: "looking", broker: config.websocketUrl, prefix })

    // An id of its own per reading: in development React runs this twice, and
    // two connections under one id knock each other off (as in the block
    // dialog, 2026-09-29).
    connect({ clientId: `schaltli-catalog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
      .then(async (client) => {
        // The broker actually asked: connect() may have taken a newer stored
        // address than the one this hook read when it mounted.
        const { protocol, hostname, port } = client.options
        const broker = hostname ? `${protocol ?? "ws"}://${hostname}${port ? `:${port}` : ""}` : config.websocketUrl
        // Block descriptions beside Home Assistant's configs, in the same
        // burst (docs/2026-10-04-bridge-blocks.md).
        const configs = await collectRetained(
          client,
          [`${prefix}/+/+/config`, `${prefix}/+/+/+/config`, `${blocksPrefix}/+/config`],
          cancelled,
        )
        const catalog = readCatalog(configs, prefix, blocksPrefix)
        if (cancelled()) {
          client.end(true)
          return
        }
        client.end(true)
        const found = catalog.entries.length + catalog.unsupported.length > 0
        setState(found ? { status: "found", broker, prefix, catalog } : { status: "empty", broker, prefix })
      })
      .catch(() => {
        if (!cancelled()) setState({ status: "offline", broker: config.websocketUrl, prefix })
      })

    return () => {
      generationRef.current++
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, round])

  return state
}
