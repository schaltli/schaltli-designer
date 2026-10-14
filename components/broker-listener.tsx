"use client"

import { useEffect } from "react"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { brokerStore, useListening } from "@/lib/broker-store"

// The designer listens to its broker in the background
// (docs/2026-10-14-topic-discovery.md, decision 1): subscribed to `#` while
// the switch «Listening» is on, everything heard kept in lib/broker-store.
// Mounted once, with the editor. The broker and its login are the designer's
// (useMqttConnection, #67) - nothing to enter.

// A lost or refused connection is tried again after this long, while the
// switch is on.
const RETRY_MS = 5000

export function BrokerListener() {
  const [listening] = useListening()
  // For e2e/broker-listener.spec.ts: what was heard, read without a viewer.
  useEffect(() => {
    ;(window as unknown as { __schaltliHeard?: typeof brokerStore }).__schaltliHeard = brokerStore
  }, [])
  const { connect, disconnect } = useMqttConnection("schaltli-listen")

  useEffect(() => {
    if (!listening) {
      brokerStore.setState("off")
      return
    }
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | null = null
    const again = () => {
      if (stopped || retry) return
      brokerStore.setState("no broker")
      disconnect()
      retry = setTimeout(() => {
        retry = null
        start()
      }, RETRY_MS)
    }
    const start = () => {
      if (stopped) return
      brokerStore.setState("connecting")
      connect()
        .then((client) => {
          if (stopped) {
            client.end(true)
            return
          }
          client.on("message", (topic, payload, packet) => brokerStore.hear(topic, payload.toString(), packet.retain))
          client.on("offline", again)
          client.on("close", again)
          client.subscribe("#", (err) => {
            if (err) again()
            else brokerStore.setState("listening")
          })
        })
        .catch(again)
    }
    start()
    return () => {
      stopped = true
      if (retry) clearTimeout(retry)
      disconnect()
      brokerStore.setState("off")
    }
    // connect/disconnect read the stored broker on each call; the switch alone restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])

  return null
}
