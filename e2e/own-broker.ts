import http from "node:http"
import mqtt from "mqtt"
import { Aedes } from "aedes"
import { WebSocketServer, createWebSocketStream } from "ws"
import type { Page } from "@playwright/test"

// A broker of a spec's own - a WebSocket aedes on a free port - for what the
// background listener hears (docs/2026-10-14-topic-discovery.md): the bench's
// devices never see its topics, and the bench broker's own topics never
// reach the spec.

export interface OwnBroker {
  url: string
  broker: Aedes
  publish: (topic: string, payload: string, retain?: boolean) => Promise<void>
  close: () => Promise<void>
}

export async function ownBroker(): Promise<OwnBroker> {
  const broker = await Aedes.createBroker()
  const server = http.createServer()
  const wss = new WebSocketServer({ server })
  wss.on("connection", (ws) => broker.handle(createWebSocketStream(ws) as never))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`
  const client = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(url, { clientId: `e2e-own-broker-${Date.now()}`, reconnectPeriod: 0 })
    c.once("connect", () => resolve(c))
    c.once("error", reject)
  })
  return {
    url,
    broker,
    publish: (topic, payload, retain = false) =>
      new Promise((resolve, reject) => client.publish(topic, payload, { qos: 0, retain }, (err) => (err ? reject(err) : resolve()))),
    close: async () => {
      client.end(true)
      wss.clients.forEach((c) => c.terminate())
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await new Promise<void>((resolve) => broker.close(() => resolve()))
    },
  }
}

/** The page told to use `url` as the designer's broker, before it loads. */
export async function useOwnBroker(page: Page, url: string): Promise<void> {
  await page.addInitScript((u) => {
    window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: u, discoveryPrefix: "" }))
  }, url)
}

type Heard = { count: number; retained: boolean; type: string; messages: { payload: string }[] } | null

/** What the background listener heard on `topic`, or null. */
export function heardOn(page: Page, topic: string): Promise<Heard> {
  return page.evaluate((t) => {
    const store = (window as unknown as { __schaltliHeard?: { current(): { topics: Map<string, Heard> } } }).__schaltliHeard
    return store?.current().topics.get(t) ?? null
  }, topic)
}
