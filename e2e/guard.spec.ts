import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import {
  GUARD_ANIM_MS,
  GUARD_RELOCK_MS,
  GUARD_TOPUP_MS,
  canGuard,
  exportedGuard,
  guardArrowRuns,
  guardChanged,
  guardDown,
  guardFeature,
  guardLockRuns,
  guardMove,
  guardTick,
  guardUnlockTravel,
  guardUnlocked,
  guardUp,
  withExportedGuard,
} from "../lib/guard"
import { planDeploy } from "../lib/deploy-plan"
import { convertObject } from "../lib/convert-object"

// Guard: a cover pushed up before a control changes (docs/2026-11-15-guard.md).

// The shapes every renderer is held to: the designer here, the firmware's
// native test and the Android app's unit test read the same file.
const FIXTURE = path.join(__dirname, "..", "lib", "fixtures", "guard-spans.json")
const SIZES = [8, 9, 10, 12, 13, 14, 16, 18, 20, 24, 28]

const art = (runs: Array<Array<[number, number]>>, size: number) =>
  runs.map((row) => {
    const line = Array(size).fill(".")
    for (const [a, b] of row) for (let x = a; x < b; x++) line[x] = "#"
    return line.join("")
  })

const guarded = (type: string, extra: Partial<ScreenObject> = {}): ScreenObject =>
  ({
    id: "g1",
    type,
    x: 40,
    y: 100,
    width: 200,
    height: 60,
    zIndex: 1,
    properties: {
      guard: true,
      writeTopic: "van/heater/set",
      states: [
        { id: "s0", label: "Off", readValue: "off", writeValue: "off" },
        { id: "s1", label: "On", readValue: "on", writeValue: "on", showAsOn: true },
      ],
    },
    ...extra,
  }) as unknown as ScreenObject

test.describe("guard: the shapes", () => {
  test("record the fixture", () => {
    test.skip(!process.env.GUARD_RECORD, "only to record the fixture")
    const cases = SIZES.map((size) => ({ size, lock: guardLockRuns(size), arrows: guardArrowRuns(size) }))
    fs.writeFileSync(
      FIXTURE,
      JSON.stringify({ about: "Runs [start, end) per row of the Guard's lock and double arrow, size x size - lib/guard.ts", cases }, null, 1) + "\n",
    )
  })

  test("the runs match the fixture every renderer is held to", () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"))
    expect(fixture.cases.map((c: any) => c.size)).toEqual(SIZES)
    for (const c of fixture.cases) {
      expect(guardLockRuns(c.size), `lock ${c.size}`).toEqual(c.lock)
      expect(guardArrowRuns(c.size), `arrows ${c.size}`).toEqual(c.arrows)
    }
  })

  test("a lock: a full body at the bottom, a shackle of two legs above it, symmetric", () => {
    for (const size of SIZES) {
      const rows = art(guardLockRuns(size), size)
      expect(rows.length).toBe(size)
      // The body: full rows at the bottom, the corners round.
      expect(rows.some((row) => /^#+$/.test(row)), rows.join("\n")).toBe(true)
      // Some row above the body has two runs: the legs.
      expect(guardLockRuns(size).some((r) => r.length === 2), rows.join("\n")).toBe(true)
      for (const row of rows) expect(row, rows.join("\n")).toBe(row.split("").reverse().join(""))
    }
  })

  test("the arrows: two chevrons pointing up, symmetric about the middle column", () => {
    for (const size of SIZES) {
      const runs = guardArrowRuns(size)
      const rows = art(runs, size)
      const tips = runs.map((r, y) => (r.length === 1 && r[0][1] - r[0][0] <= 3 ? y : -1)).filter((y) => y >= 0)
      expect(tips.length, rows.join("\n")).toBeGreaterThanOrEqual(2)
      const width = 2 * Math.trunc((size - 1) / 2) + 1
      for (const row of rows) expect(row.slice(0, width), rows.join("\n")).toBe(row.slice(0, width).split("").reverse().join(""))
    }
  })
})

test.describe("guard: the gesture", () => {
  const travel = guardUnlockTravel(60)

  test("45 % of the height, never less than 20 px at the 4\"'s density, scaled with the density (E1)", () => {
    expect(guardUnlockTravel(60)).toBe(27)
    expect(guardUnlockTravel(30)).toBe(20)
    expect(guardUnlockTravel(30, 480 / 71.28)).toBe(20)
    // Twice the density, twice the minimum.
    expect(guardUnlockTravel(30, (2 * 480) / 71.28)).toBe(40)
  })

  test("finger down shows the cover, switches nothing; lifting at once is a plain tap: the cover goes, a hint", () => {
    const down = guardDown(0, 100, 130)
    expect(down.phase).toBe("pushing")
    expect(guardUnlocked(down)).toBe(false)
    const up = guardUp(guardMove(down, 50, 102, 129, travel), 80)
    expect(up.hint).toBe(true)
    expect(up.cover!.phase).toBe("dropping")
    expect(guardTick(up.cover!, 80 + GUARD_ANIM_MS)).toBeNull()
  })

  test("a push not far enough: the cover goes, no hint", () => {
    const cover = guardMove(guardDown(0, 100, 130), 50, 100, 130 - travel, travel)
    expect(cover.phase).toBe("pushing")
    const up = guardUp(cover, 80)
    expect(up.hint).toBe(false)
    expect(guardUnlocked(up.cover)).toBe(false)
  })

  test("the cover never goes down, and a sideways push does not move it", () => {
    let cover = guardMove(guardDown(0, 100, 130), 10, 100, 160, travel)
    expect(cover.offset).toBe(0)
    cover = guardMove(cover, 20, 180, 130, travel)
    expect(cover.offset).toBe(0)
    expect(cover.phase).toBe("pushing")
  })

  test("past the travel it locks in while the finger is down; the lift does nothing then", () => {
    const cover = guardMove(guardDown(0, 100, 130), 100, 100, 130 - travel - 1, travel)
    expect(cover.phase).toBe("opening")
    expect(guardUnlocked(cover)).toBe(true)
    const up = guardUp(cover, 150)
    expect(up.cover).toBe(cover)
    expect(up.hint).toBe(false)
    expect(guardTick(cover, 100 + GUARD_ANIM_MS)!.phase).toBe("open")
  })

  test("it waits 5 s, then drops in 0.2 s and is gone", () => {
    let cover: any = guardMove(guardDown(0, 100, 130), 100, 100, 50, travel)
    cover = guardTick(cover, 400)
    expect(cover.phase).toBe("open")
    expect(guardTick(cover, 100 + GUARD_RELOCK_MS - 1)!.phase).toBe("open")
    const dropping = guardTick(cover, 100 + GUARD_RELOCK_MS)!
    expect(dropping.phase).toBe("dropping")
    expect(guardUnlocked(dropping)).toBe(false)
    expect(guardTick(dropping, 100 + GUARD_RELOCK_MS + GUARD_ANIM_MS)).toBeNull()
  })

  test("a change with less than 2 s left moves the drop to 2 s after it; with more left it does not (decision 13)", () => {
    const open = guardTick(guardMove(guardDown(0, 100, 130), 100, 100, 50, travel), 400)!
    const lockedIn = 100
    // 4 s left: stays.
    expect(guardChanged(open, lockedIn + 1000).until).toBe(lockedIn + GUARD_RELOCK_MS)
    // 0.5 s left: 2 s from the change.
    const late = lockedIn + GUARD_RELOCK_MS - 500
    expect(guardChanged(open, late).until).toBe(late + GUARD_TOPUP_MS)
    // Stepping through a group: each change tops up again.
    const again = guardChanged(guardChanged(open, late), late + 1500)
    expect(again.until).toBe(late + 1500 + GUARD_TOPUP_MS)
  })
})

test.describe("guard: the object", () => {
  test("only the switch family and the button can be guarded (decision 1)", () => {
    for (const t of ["switch", "button-group", "toggle-button", "button"]) expect(canGuard(t)).toBe(true)
    for (const t of ["slider", "dial", "text-field", "time-field", "text", "icon"]) expect(canGuard(t)).toBe(false)
  })

  test("Convert to between the switch types keeps it", () => {
    const sw = guarded("switch")
    for (const to of ["button-group", "toggle-button"] as const) {
      const next = convertObject(sw, to)
      expect(next?.properties.guard, to).toBe(true)
    }
    expect(convertObject(guarded("button-group"), "switch")?.properties.guard).toBe(true)
  })

  test("export: the geometry beside it, per type; dropped on a type that cannot be guarded", () => {
    const sw = withExportedGuard(guarded("switch"), [], 480 / 71.28) as any
    expect(sw.guard.cover).toEqual({ x: 40, y: 100, width: 200, height: 60, radius: 30 })
    expect(sw.guard.travel).toBe(27)
    expect(sw.guard.lock).toBeUndefined()
    const group = withExportedGuard(guarded("button-group"), []) as any
    expect(group.guard.badge.r).toBeGreaterThan(5)
    // The badge stays inside the group's box.
    expect(group.guard.badge.cx + group.guard.badge.r).toBeLessThanOrEqual(40 + 200)
    expect(group.guard.badge.cy - group.guard.badge.r).toBeGreaterThanOrEqual(100)
    const button = withExportedGuard(guarded("button"), []) as any
    expect(button.guard.lock.size).toBeGreaterThanOrEqual(8)
    expect(button.guard.lock.x + button.guard.lock.size).toBeLessThanOrEqual(240)
    expect(exportedGuard(guarded("toggle-button"), []).lock).toBeDefined()
    const slider = withExportedGuard(guarded("slider"), []) as any
    expect(slider.guard).toBeUndefined()
    expect(slider.properties.guard).toBeUndefined()
    const plain = guarded("switch")
    delete (plain.properties as any).guard
    expect(withExportedGuard(plain, [])).toBe(plain)
  })

  test("Deploy refuses a guarded project for a device without the feature", () => {
    const project = { screens: [{ objects: [{ ...guarded("button"), id: "p", type: "switcher", properties: {}, children: [{ ...guarded("panel"), children: [guarded("button")] }] }] }] } as any
    const need = guardFeature(project)
    expect(need).toEqual({ feature: "guard", label: "guarded controls (1)" })
    expect(guardFeature({ screens: [{ objects: [guarded("slider")] }] } as any)).toBeNull()
    const plan = planDeploy({
      device: { name: "Knob", platform: "esp32", online: true, systemGeneration: 1.7, firmwareBuild: "fw-2026.11.02.1", firmwareVersion: "" },
      release: undefined,
      needs: [],
      unsupportedFeatures: [need!],
    } as any)
    expect(plan.kind).toBe("blocked")
  })
})
