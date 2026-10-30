import { test, expect } from "@playwright/test"
import { matches as designerMatches } from "../lib/live-value"
import { extractJsonField } from "../lib/json-path"
import { historyName } from "../lib/chart"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compare = require("../recorder/compare")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const history = require("../recorder/history")

// The recorder's core (tasks/charts-recorder-plan.md R1, R2): steps, days and
// payloads, every time given from outside.

const { Series, dayPayload, recentPayload, dailyPayload, midnightOf, dateOf } = history
const TZ = "Europe/Zurich"
// 2026-10-14 00:00 in Zurich (UTC+2): a plain day.
const DAY = midnightOf("2026-10-14", TZ)

test.describe("the recorder's comparison is the designer's", () => {
  const values = ["on", " on ", "ON", "off", "1", "1.0", "0", "-2.5", "", "true", "12 V", "1e3", "abc"]
  const ops = ["==", "!=", "<", "<=", ">", ">=", "yes", "no"] as const
  const operands = ["on", "1", "0", "1.0", "-3", ""]
  test("every operator on every value", () => {
    for (const v of values) for (const op of ops) for (const o of operands) {
      expect(compare.matches(v, op, o), `${JSON.stringify(v)} ${op} ${JSON.stringify(o)}`).toBe(designerMatches(v, op, o))
    }
  })
  test("a JSON field the same", () => {
    const json = JSON.stringify({ value: 13.4, a: { b: [1, { c: "x" }] }, "d.e": true, n: null })
    for (const path of ["value", "$.value", ".value", "a.b[1].c", "a.b[0]", "a", "['d.e']", "n", "missing", "a.b[9]"]) {
      expect(compare.fieldOf(json, path), path).toBe(extractJsonField(json, path))
    }
    expect(compare.fieldOf("not json", "value")).toBeUndefined()
  })
  test("a history's name: the same rule on both sides, no # in it", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const recorderName = require("../recorder/service").historyName
    for (const topic of ["van/t", "ble/orion/in_volts#value", "a/b#c.d[0]"]) {
      expect(recorderName(topic)).toBe(historyName(topic))
      expect(historyName(topic)).not.toContain("#")
    }
  })
})

test.describe("the recorder's steps (R1)", () => {
  test("the mean is weighted by time, not by messages", () => {
    const s = new Series("van/p", "power")
    // 10 s at 100 W in one message each second, then 50 s at 0 W in one message.
    for (let i = 0; i < 10; i++) s.ingest("100", DAY + i)
    s.ingest("0", DAY + 10)
    s.advance(DAY + 60)
    const w = s.window("m1", DAY, 1)
    expect(w.mean[0]).toBeCloseTo((100 * 10) / 60, 3)
    expect(w.min[0]).toBe(0)
    expect(w.max[0]).toBe(100)
  })

  test("power holds into the next steps for 15 minutes at most: a quiet sensor adds no energy", () => {
    const s = new Series("van/p", "power")
    s.ingest("20", DAY)
    s.advance(DAY + 30 * 60)
    const w = s.window("m1", DAY, 30)
    expect(w.mean.slice(0, 15).every((m: number | null) => m === 20)).toBe(true)
    expect(w.mean.slice(15)).toEqual(Array(15).fill(null))
  })

  // 2026-10-30: the van's tanks report only a change, and their history was
  // a dash wherever one came - every quarter hour without one was empty.
  test("a level holds until the next value, for 24 hours at most", () => {
    const s = new Series("van/t", "level")
    s.ingest("20", DAY)
    s.advance(DAY + 26 * 3600)
    const day = dayPayload(s, "2026-10-14", TZ, DAY + 26 * 3600)
    expect(day.mean.every((m: number | null) => m === 20)).toBe(true)
    const next = dayPayload(s, "2026-10-15", TZ, DAY + 26 * 3600)
    expect(next.mean.slice(0, 2)).toEqual([null, null])
  })

  test("#path and messages that are no number", () => {
    const s = new Series("ble/orion/in_volts#value", "level")
    expect(s.ingest('{"value": 13.4}', DAY)).toBe(true)
    expect(s.ingest('{"value": "off"}', DAY + 5)).toBe(false)
    expect(s.ingest("13.5", DAY + 6)).toBe(false)
    s.advance(DAY + 60)
    expect(s.window("m1", DAY, 1).mean[0]).toBe(13.4)
  })

  test("a state's periods, cut at midnight", () => {
    const s = new Series("van/heater", "state", [{ op: "==", value: "on" }])
    s.ingest("on", DAY - 3600)
    s.ingest("off", DAY + 1800)
    s.ingest("on", DAY + 7200)
    const now = DAY + 7200 + 600
    expect(dayPayload(s, "2026-10-13", TZ, now)).toEqual({ date: "2026-10-13", on: [[1380, 1440]] })
    expect(dayPayload(s, "2026-10-14", TZ, now)).toEqual({ date: "2026-10-14", on: [[0, 30], [120, 130]] })
  })

  test("a state without a condition is on when the value says yes", () => {
    const s = new Series("van/pump", "state")
    s.ingest("1", DAY)
    s.ingest("0", DAY + 120)
    expect(dayPayload(s, "2026-10-14", TZ, DAY + 600).on).toEqual([[0, 2]])
  })
})

test.describe("the recorder's payloads (R2)", () => {
  test("a day is 96 steps of a quarter hour; the clock change's are 100 and 92", () => {
    const s = new Series("van/t", "level")
    s.ingest("20", DAY + 900)
    s.advance(DAY + 1800)
    const day = dayPayload(s, "2026-10-14", TZ, DAY + 1800)
    expect(day.date).toBe("2026-10-14")
    expect(day.step).toBe(900)
    expect(day.mean).toHaveLength(96)
    expect(day.mean.slice(0, 3)).toEqual([null, 20, null])
    expect(dayPayload(s, "2026-10-25", TZ, DAY).mean).toHaveLength(100)
    expect(dayPayload(s, "2026-03-29", TZ, DAY).mean).toHaveLength(92)
    expect(dateOf(midnightOf("2026-10-25", TZ), TZ)).toBe("2026-10-25")
  })

  test("a full day fits a knob's buffer", () => {
    const s = new Series("schaltli/state/tank/1/level", "level")
    for (let t = DAY; t < DAY + 86400; t += 60) s.ingest(String(50 + Math.sin(t) * 12.345), t)
    const bytes = JSON.stringify(dayPayload(s, "2026-10-14", TZ, DAY + 86400)).length
    expect(bytes).toBeLessThan(4096)
  })

  test("recent: two hours at a minute, the last 6 at five, ending with the step now is in", () => {
    const s = new Series("van/p", "power")
    const now = DAY + 3 * 3600 + 30
    s.ingest("40", now - 120)
    s.advance(now)
    const r = recentPayload(s, "m1", 2 * 3600, now)
    expect(r.end).toBe(DAY + 3 * 3600 + 60)
    expect(r.step).toBe(60)
    expect(r.mean).toHaveLength(120)
    expect(r.mean.slice(-3)).toEqual([40, 40, 40])
    expect(r.mean[0]).toBeNull()
    // recent6: 6 hours, 72 steps (tasks/charts-firmware-plan.md decision 1).
    expect(recentPayload(s, "m5", 6 * 3600, now).mean).toHaveLength(72)
    const st = new Series("van/heater", "state")
    st.ingest("on", now - 600)
    expect(recentPayload(st, "m1", 2 * 3600, now).on).toEqual([[now - 600, now]])
  })

  test("per day: energy in and out, a tank's decline without its refill, a state's run time and starts", () => {
    const p = new Series("van/battery/watts", "power")
    // 10 min at 100 W, 10 min at -50 W, then 40 min at 100 W, a message every 10 min.
    p.ingest("100", DAY)
    p.ingest("-50", DAY + 600)
    for (let t = DAY + 1200; t < DAY + 3600; t += 600) p.ingest("100", t)
    p.advance(DAY + 3600)
    const today = dailyPayload(p, TZ, DAY + 3600).days.at(-1)
    expect(today.date).toBe("2026-10-14")
    expect(today.energyIn).toBeCloseTo((100 * 3000) / 3600, 3)
    expect(today.energyOut).toBeCloseTo((50 * 600) / 3600, 3)

    const tank = new Series("van/tank", "level")
    const levels = [80, 70, 60, 95, 90]
    levels.forEach((v, i) => tank.ingest(String(v), DAY + i * 900))
    tank.advance(DAY + levels.length * 900)
    const t = dailyPayload(tank, TZ, DAY + 5 * 900).days.at(-1)
    expect(t.decline).toBe(25)
    expect(t.rise).toBe(35)
    expect([t.min, t.max]).toEqual([60, 95])

    const heater = new Series("van/heater", "state")
    heater.ingest("on", DAY + 600)
    heater.ingest("off", DAY + 1200)
    heater.ingest("on", DAY + 3000)
    const h = dailyPayload(heater, TZ, DAY + 3600).days
    expect(h).toHaveLength(30)
    expect(h.at(-1)).toEqual({ date: "2026-10-14", runtime: 20, starts: 2 })
    expect(h[0].date).toBe("2026-09-15")
  })

  test("what is older than kept is forgotten", () => {
    const s = new Series("van/t", "level")
    s.ingest("1", DAY)
    s.advance(DAY + 60)
    s.prune(DAY + 3 * 86400)
    expect(s.steps.m1.size).toBe(0)
    expect(s.steps.m15.size).toBe(1)
    s.prune(DAY + 32 * 86400)
    expect(s.steps.m15.size).toBe(0)
  })

  test("written and read back, a series is the same", () => {
    const s = new Series("van/heater", "state", [{ op: "==", value: "on" }])
    s.ingest("on", DAY)
    const back = Series.fromJSON(JSON.parse(JSON.stringify(s)))
    expect(dayPayload(back, "2026-10-14", TZ, DAY + 60)).toEqual(dayPayload(s, "2026-10-14", TZ, DAY + 60))
    const l = new Series("van/t", "level")
    l.ingest("5", DAY)
    l.advance(DAY + 120)
    expect(Series.fromJSON(JSON.parse(JSON.stringify(l))).window("m1", DAY, 2)).toEqual(l.window("m1", DAY, 2))
  })
})
