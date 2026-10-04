"use client"

// The Block menu's catalog (block plan Task 6b, docs/2026-09-30-block-
// discovery.md): what the broker's retained Home Assistant discovery configs
// announce, read each time the menu opens; and, once an entry is picked, the
// values it reads, so the placed block shows them as they are. Neither
// publishes anything - no birth message, no homeassistant/status.

import { useEffect, useRef, useState } from "react"
import type mqtt from "mqtt"
import { storedBlocksPrefix, storedDiscoveryPrefix, useMqttConnection } from "@/hooks/use-mqtt-connection"
import { readCatalog, type Catalog } from "@/lib/ha-discovery"

// Retained messages arrive in one burst, when depends on the broker: the
// burst is over once it has gone quiet this long - the block dialog's own
// rule (components/baustein-dialog.tsx) - and a broker that holds nothing is
// given up on after the second.
const SETTLE_QUIET_MS = 300
const SETTLE_MAX_MS = 5000

export type BlockCatalog =
  | { status: "looking"; broker: string; prefix: string }
  | { status: "offline"; broker: string; prefix: string }
  | { status: "empty"; broker: string; prefix: string }
  | { status: "found"; broker: string; prefix: string; catalog: Catalog }

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
export function useBlockCatalog(open: boolean): BlockCatalog {
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
  }, [open])

  return state
}

/**
 * What the broker holds on `topics`, as raw payloads by topic: read while the
 * options of a picked entry are being chosen, for the placed block's first
 * examples and for the dialog to show the entry is live. Empty until the
 * retained burst has settled, and where nobody retained anything. Not read
 * by the menu, which closes - and so would stop reading - the moment an
 * entry is picked.
 */
export function useRetainedValues(topics: string[] | null): Record<string, string> {
  const { connect, disconnect } = useMqttConnection("schaltli-values")
  const [values, setValues] = useState<Record<string, string>>({})
  const key = topics ? topics.join("\n") : null

  useEffect(() => {
    setValues({})
    if (!topics || topics.length === 0) return
    let current = true
    connect({ clientId: `schaltli-values-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
      .then(async (client) => {
        const found = await collectRetained(client, topics, () => !current)
        client.end(true)
        if (current) setValues(found)
      })
      .catch(() => {
        // No broker: no values, and the block takes examples of its own.
      })
    return () => {
      current = false
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return values
}
