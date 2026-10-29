import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import mqtt from "mqtt"
import { ownBroker, type OwnBroker } from "./own-broker"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRecorder } = require("../recorder/service")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { midnightOf } = require("../recorder/history")

// The recorder against a broker (tasks/charts-recorder-plan.md R3, R4): wants
// in, history out, one recorder per broker, and its file across a restart.
// Its clock is the test's, and it lays everything when told to (tick).

const TZ = "Europe/Zurich"
const DAY = midnightOf("2026-10-14", TZ)
const quiet = () => {}

/** The retained message on `topic` now, "" for none. */
async function retained(url: string, topic: string): Promise<string> {
  const client = await mqtt.connectAsync(url, { reconnectPeriod: 0 })
  const got = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve(""), 400)
    client.on("message", (t, payload) => {
      if (t !== topic) return
      clearTimeout(timer)
      resolve(payload.toString())
    })
    client.subscribe(topic)
  })
  await client.endAsync()
  return got
}

async function until(check: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out")
    await new Promise((r) => setTimeout(r, 50))
  }
}

test.describe("the recorder on a broker (R3, R4)", () => {
  let broker: OwnBroker
  let now: number
  const recorders: any[] = []
  const recorder = (extra: Record<string, unknown> = {}) => {
    const r = createRecorder({ broker: broker.url, tz: TZ, clock: () => now, tickMs: 3_600_000, settleMs: 300, log: quiet, ...extra })
    recorders.push(r)
    return r
  }

  test.beforeEach(async () => {
    broker = await ownBroker()
    now = DAY + 3600
  })
  test.afterEach(async () => {
    for (const r of recorders.splice(0)) await r.stop().catch(() => {})
    await broker.close()
  })

  test("what a display wants is recorded and laid on the broker; what nobody wants any more is not", async () => {
    const r = recorder({ id: "pi" })
    await r.start()
    expect(r.active).toBe(true)
    expect(JSON.parse(await retained(broker.url, "schaltli/history/recorder"))).toMatchObject({ state: "online", id: "pi" })

    await broker.publish("schaltli/history/wants/dev1", JSON.stringify({ series: [{ topic: "van/t#value", kind: "level" }, { topic: "van/heater", kind: "state", onMeans: [{ op: "==", value: "on" }] }] }), true)
    await until(() => r.series.size === 2)
    await new Promise((res) => setTimeout(res, 100))
    await broker.publish("van/t", JSON.stringify({ value: 20 }))
    await broker.publish("van/heater", "on")
    await until(() => r.series.get("van/t#value").last !== null && r.series.get("van/heater").periods.length === 1)
    now += 120
    r.tick()

    // A `#` cannot be in a topic name: the path follows a `~`.
    const recent = JSON.parse(await retained(broker.url, "schaltli/history/van/t~value/recent"))
    // 01:00 to 01:02, the step now is in not yet begun.
    expect(recent.mean.slice(-3)).toEqual([20, 20, null])
    const day = JSON.parse(await retained(broker.url, "schaltli/history/van/t~value/day/2026-10-14"))
    expect(day.mean[4]).toBe(20)
    const heater = JSON.parse(await retained(broker.url, "schaltli/history/van/heater/day/2026-10-14"))
    expect(heater.on).toEqual([[60, 62]])
    expect(JSON.parse(await retained(broker.url, "schaltli/history/now"))).toEqual({ time: now, tz: TZ })

    // The display deployed without charts: nobody wants it, nothing more recorded.
    await broker.publish("schaltli/history/wants/dev1", "", true)
    await until(() => !r.series.get("van/t#value").wanted)
    await broker.publish("van/t", JSON.stringify({ value: 99 }))
    await new Promise((res) => setTimeout(res, 200))
    expect(r.series.get("van/t#value").last.value).toBe(20)
  })

  test("its clock goes out once a minute, not on every tick", async () => {
    // tickMs left to the default here: each payload at the end of its step.
    const r = recorder({ id: "pi", tickMs: undefined })
    await r.start()
    const heard: string[] = []
    const client = await mqtt.connectAsync(broker.url, { reconnectPeriod: 0 })
    client.on("message", (_t, m) => heard.push(m.toString()))
    await client.subscribeAsync("schaltli/history/now")
    await until(() => heard.length === 1)
    now += 10
    r.tick()
    now += 10
    r.tick()
    await new Promise((res) => setTimeout(res, 200))
    expect(heard).toHaveLength(1)
    now += 60
    r.tick()
    await until(() => heard.length === 2)
    await client.endAsync()
  })

  test("a second recorder on the same broker waits until the first is gone", async () => {
    const first = recorder({ id: "pi" })
    await first.start()
    const second = recorder({ id: "nas" })
    await second.start()
    expect(first.active).toBe(true)
    expect(second.active).toBe(false)
    await first.stop()
    await until(() => second.active)
    expect(JSON.parse(await retained(broker.url, "schaltli/history/recorder"))).toMatchObject({ state: "online", id: "nas" })
  })

  test("stopped and started again, it lays the same history from its file", async () => {
    const file = path.join(os.tmpdir(), `recorder-${process.pid}-${Date.now()}`, "history.json")
    const first = recorder({ id: "pi", file })
    await first.start()
    await broker.publish("schaltli/history/wants/dev1", JSON.stringify({ series: [{ topic: "van/t", kind: "level" }] }), true)
    await until(() => first.series.size === 1)
    await new Promise((res) => setTimeout(res, 100))
    await broker.publish("van/t", "42")
    await until(() => first.series.get("van/t").last !== null)
    now += 60
    await first.stop()
    expect(fs.existsSync(file)).toBe(true)

    // The broker forgets (a Mosquitto without persistence, restarted).
    await broker.publish("schaltli/history/van/t/day/2026-10-14", "", true)
    const second = recorder({ id: "pi", file })
    await second.start()
    const day = JSON.parse(await retained(broker.url, "schaltli/history/van/t/day/2026-10-14"))
    expect(day.mean[4]).toBe(42)
  })

  test("a write cut short leaves the last good file", async () => {
    const dir = path.join(os.tmpdir(), `recorder-torn-${process.pid}-${Date.now()}`)
    const file = path.join(dir, "history.json")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("../recorder/store")
    store.write(file, { series: [], published: [["van/t", ["2026-10-14"]]] }, quiet)
    fs.writeFileSync(`${file}.tmp`, '{"series": [')
    expect(store.read(file, quiet)).toEqual({ series: [], published: [["van/t", ["2026-10-14"]]] })
  })
})
