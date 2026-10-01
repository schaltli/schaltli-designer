"use client"

// The Block menu's catalog (block plan Task 6b, docs/2026-09-30-block-
// discovery.md): what the broker's retained Home Assistant discovery configs
// announce, read each time the menu opens, and the values its entries read,
// so a placed block shows them as they are. It publishes nothing - no birth
// message, no homeassistant/status.

import { useEffect, useRef, useState } from "react"
import type mqtt from "mqtt"
import { storedDiscoveryPrefix, useMqttConnection } from "@/hooks/use-mqtt-connection"
import { readCatalog, readTopicsOf, type Catalog } from "@/lib/ha-discovery"

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
  | { status: "found"; broker: string; prefix: string; catalog: Catalog; values: Record<string, string> }

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
        const configs = await collectRetained(client, [`${prefix}/+/+/config`, `${prefix}/+/+/+/config`], cancelled)
        const catalog = readCatalog(configs, prefix)
        if (cancelled()) {
          client.end(true)
          return
        }
        if (catalog.entries.length + catalog.unsupported.length === 0) {
          client.end(true)
          setState({ status: "empty", broker, prefix })
          return
        }
        // The menu lists the catalog at once; the values its entries read
        // follow - they are only needed once an entry is placed, and a topic
        // nobody retained would otherwise hold the menu for seconds.
        setState({ status: "found", broker, prefix, catalog, values: {} })
        const reads = readTopicsOf(catalog.entries)
        const values = reads.length > 0 ? await collectRetained(client, reads, cancelled) : {}
        client.end(true)
        if (!cancelled()) setState({ status: "found", broker, prefix, catalog, values })
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
