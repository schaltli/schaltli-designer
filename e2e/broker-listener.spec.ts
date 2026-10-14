import { test, expect, type Page } from "@playwright/test"
import http from "node:http"
import mqtt from "mqtt"
import { Aedes } from "aedes"
import { WebSocketServer, createWebSocketStream } from "ws"
import { COMBINED_TEST_PROJECT, loadProject, objectTreeRow } from "./helpers"

// The designer listens to its broker in the background
// (docs/2026-10-14-topic-discovery.md, module broker-listener): subscribed
// to `#` while «Listening» is on, what it hears kept per topic. On a broker
// of this spec's own - a WebSocket aedes - so the bench's devices never see
// its topics and its load never reaches them.

interface OwnBroker {
  url: string
  broker: Aedes
  publish: (topic: string, payload: string, retain?: boolean) => Promise<void>
  close: () => Promise<void>
}

async function ownBroker(): Promise<OwnBroker> {
  const broker = await Aedes.createBroker()
  const server = http.createServer()
  const wss = new WebSocketServer({ server })
  wss.on("connection", (ws) => broker.handle(createWebSocketStream(ws) as never))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}`
  const client = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(url, { clientId: `e2e-listener-pub-${Date.now()}`, reconnectPeriod: 0 })
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

async function openOn(page: Page, url: string) {
  await page.addInitScript((u) => {
    window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: u, discoveryPrefix: "" }))
  }, url)
  await loadProject(page, COMBINED_TEST_PROJECT)
}

type Heard = { count: number; retained: boolean; type: string; messages: { payload: string }[] } | null
const heard = (page: Page, topic: string): Promise<Heard> =>
  page.evaluate((t) => {
    const store = (window as unknown as { __schaltliHeard?: { current(): { topics: Map<string, Heard> } } }).__schaltliHeard
    return store?.current().topics.get(t) ?? null
  }, topic)

const listeningSwitch = (page: Page) => page.getByRole("switch", { name: "Listening" })

test.describe("the background listener", () => {
  let own: OwnBroker
  test.beforeEach(async () => {
    own = await ownBroker()
  })
  test.afterEach(async () => {
    await own.close()
  })

  test("hears a retained topic and one published after the page loaded, with value, count, retained and type", async ({ page }) => {
    await own.publish("van/tank/fresh", "64", true)
    await openOn(page, own.url)
    await expect(listeningSwitch(page)).toHaveAttribute("aria-checked", "true")
    await expect.poll(() => heard(page, "van/tank/fresh"), { timeout: 5000 }).toMatchObject({ count: 1, retained: true, type: "numeric" })

    // Within a second of being sent.
    await own.publish("van/door", "open")
    const sent = Date.now()
    await expect.poll(() => heard(page, "van/door"), { timeout: 1000, intervals: [50] }).toMatchObject({ retained: false, type: "text" })
    expect(Date.now() - sent).toBeLessThan(1000)

    for (let i = 0; i < 25; i++) await own.publish("van/battery/current", String(-4 - i / 10))
    await expect.poll(async () => (await heard(page, "van/battery/current"))?.count, { timeout: 3000 }).toBe(25)
    const current = await heard(page, "van/battery/current")
    expect(current!.messages).toHaveLength(20)
    expect(current!.messages[0].payload).toBe("-6.4")
  })

  test("switched off it unsubscribes and keeps what it heard; the switch survives a reload", async ({ page }) => {
    const unsubscribed: string[] = []
    own.broker.on("unsubscribe", (topics, client) => {
      if (client?.id.startsWith("schaltli-listen")) unsubscribed.push(...topics)
    })
    const closed: string[] = []
    own.broker.on("clientDisconnect", (client) => {
      if (client.id.startsWith("schaltli-listen")) closed.push(client.id)
    })
    await openOn(page, own.url)
    await own.publish("van/light", "ON")
    await expect.poll(() => heard(page, "van/light"), { timeout: 5000 }).not.toBeNull()

    await listeningSwitch(page).click()
    await expect(listeningSwitch(page)).toHaveAttribute("aria-checked", "false")
    // Off: the listener's connection gone (and with it its `#`).
    await expect.poll(() => closed.length + unsubscribed.length, { timeout: 3000 }).toBeGreaterThan(0)
    await own.publish("van/heater", "on")
    await page.waitForTimeout(600)
    expect(await heard(page, "van/heater")).toBeNull()
    expect(await heard(page, "van/light")).not.toBeNull()

    // The page afresh (a reload lands on the start page; the project again).
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect(listeningSwitch(page)).toHaveAttribute("aria-checked", "false")
    await listeningSwitch(page).click()
    await own.publish("van/heater", "off")
    await expect.poll(() => heard(page, "van/heater"), { timeout: 5000 }).not.toBeNull()
  })

  // The user's van sends several messages a second on `pkw` alone. 50 a
  // second across 300 topics for 30 s, and the editor still answers a click.
  // @alone: a time, measured with the machine's other workers idle - among
  // them, the click alone took up to 214 ms (test:quick, 2026-10-14).
  test("under 50 messages a second across 300 topics, a click selects an object within 200 ms @alone", async ({ page }) => {
    test.setTimeout(90_000)
    await openOn(page, own.url)
    let n = 0
    const load = setInterval(() => {
      for (let i = 0; i < 5; i++) {
        n++
        void own.publish(`load/device-${n % 300}/value`, String(n))
      }
    }, 100)
    try {
      await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __schaltliHeard: { current(): { topics: Map<string, unknown> } } }).__schaltliHeard.current().topics.size)), { timeout: 15_000 }).toBeGreaterThanOrEqual(300)
      const rows = page.locator("[data-object-id]")
      const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-object-id")!).slice(0, 2))
      expect(ids.length).toBe(2)
      const deadline = Date.now() + 30_000
      let worst = 0
      for (let i = 0; Date.now() < deadline; i++) {
        const id = ids[i % 2]
        const started = Date.now()
        await objectTreeRow(page, id).click()
        await expect(objectTreeRow(page, id)).toHaveClass(/bg-primary\/15/, { timeout: 2000 })
        worst = Math.max(worst, Date.now() - started)
        await page.waitForTimeout(500)
      }
      expect(worst).toBeLessThan(200)
    } finally {
      clearInterval(load)
    }
  })
})
