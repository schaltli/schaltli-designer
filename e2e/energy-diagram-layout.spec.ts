import { test, expect } from "@playwright/test"
import { resolveEnergy, type EnergyNode } from "../lib/energy-diagram"

// lib/energy-diagram.ts, the energy diagram's core (docs/2026-10-11-energy-
// diagram.md, tasks/energy-diagram-plan.md L1-L5): pure, shared by the
// designer's renderer and, through lib/energy-diagram/vectors.json, by the
// firmware and the app. The numbers are the target picture's
// (https://claude.ai/artifact/RcPpfG1xFaarXN4VbuUKf3), worked out by hand.

// The target picture's nodes: three sources, the battery, the rest, the bus.
const NODES: EnergyNode[] = [
  { id: "bus", role: "bus", name: "12 V", x: 338, y: 186 },
  { id: "solar", role: "source", name: "Solar", x: 114, y: 52 },
  { id: "shore", role: "source", name: "Landstrom", x: 338, y: 52 },
  { id: "engine", role: "source", name: "Ladebooster", x: 562, y: 52 },
  { id: "battery", role: "storage", name: "Batterie", x: 202, y: 302 },
  { id: "load", role: "rest", name: "Verbraucher", x: 474, y: 302 },
]
// The four situations, watts as the topics bring them; the battery + while charging.
const SITUATIONS = {
  night: { solar: 0, shore: 0, engine: 0, battery: -92 },
  drive: { solar: 120, shore: 0, engine: 414, battery: 446 },
  evening: { solar: 0, shore: 241, engine: 0, battery: 225 },
  full: { solar: 0, shore: 101, engine: 0, battery: 9 },
}
const watts = (s: Record<string, number>) => Object.fromEntries(Object.entries(s).map(([id, w]) => [id, { watts: w }]))
const byId = (nodes: ReturnType<typeof resolveEnergy>) => Object.fromEntries(nodes.map((n) => [n.id, n]))

test.describe("resolve (L1)", () => {
  test("the rest is what comes in and does not go into the battery", () => {
    expect(byId(resolveEnergy(NODES, watts(SITUATIONS.night))).load.watts).toBe(92)
    expect(byId(resolveEnergy(NODES, watts(SITUATIONS.drive))).load.watts).toBe(88)
    expect(byId(resolveEnergy(NODES, watts(SITUATIONS.evening))).load.watts).toBe(16)
    expect(byId(resolveEnergy(NODES, watts(SITUATIONS.full))).load.watts).toBe(92)
  })

  test("who gives and who takes: sources give, the rest takes, the storage by its sign", () => {
    const night = byId(resolveEnergy(NODES, watts(SITUATIONS.night)))
    expect([night.solar.gives, night.load.gives, night.battery.gives]).toEqual([true, false, true])
    expect(night.battery.watts).toBe(92)
    const drive = byId(resolveEnergy(NODES, watts(SITUATIONS.drive)))
    expect(drive.battery.gives).toBe(false)
    expect(drive.battery.watts).toBe(446)
    // The bus neither gives nor takes; it is not among the resolved nodes.
    expect(drive.bus).toBeUndefined()
  })

  test("a negative source or sink counts as nothing; reverse sign turns a value round", () => {
    const nodes: EnergyNode[] = [
      { id: "bus", role: "bus", name: "12 V", x: 0, y: 0 },
      { id: "sun", role: "source", name: "Sun", x: 0, y: 0 },
      { id: "fridge", role: "sink", name: "Fridge", x: 0, y: 0 },
      { id: "bat", role: "storage", name: "Battery", x: 0, y: 0, reverseSign: true },
      { id: "rest", role: "rest", name: "Rest", x: 0, y: 0 },
    ]
    const r = byId(resolveEnergy(nodes, { sun: { watts: -5 }, fridge: { watts: 40 }, bat: { watts: 60 } }))
    expect(r.sun.watts).toBe(0)
    // Reversed: 60 reported means 60 out of the battery.
    expect(r.bat.gives).toBe(true)
    expect(r.bat.watts).toBe(60)
    // 60 in, the fridge measured with 40: 20 left for the rest.
    expect(r.rest.watts).toBe(20)
    expect(byId(resolveEnergy(nodes, { fridge: { watts: -3 } })).fridge.watts).toBe(0)
  })

  test("never a negative rest; nothing known is nothing", () => {
    const r = byId(resolveEnergy(NODES, { battery: { watts: 300 }, shore: { watts: 100 } }))
    expect(r.load.watts).toBe(0)
    const none = byId(resolveEnergy(NODES, {}))
    expect(Object.values(none).every((n) => n.watts === 0)).toBe(true)
  })

  test("the storage carries its charge", () => {
    expect(byId(resolveEnergy(NODES, { battery: { watts: 10, charge: 82 } })).battery.charge).toBe(82)
  })
})
