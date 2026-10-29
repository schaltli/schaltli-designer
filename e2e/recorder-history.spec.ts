import { test, expect } from "@playwright/test"
import { matches as designerMatches } from "../lib/live-value"
import { extractJsonField } from "../lib/json-path"
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

  test("a value holds into the next steps, for 15 minutes at most", () => {
    const s = new Series("van/t", "level")
    s.ingest("20", DAY)
    s.advance(DAY + 30 * 60)
    const w = s.window("m1", DAY, 30)
    expect(w.mean.slice(0, 15).every((m: number | null) => m === 20)).toBe(true)
    expect(w.mean.slice(15)).toEqual(Array(15).fill(null))
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
