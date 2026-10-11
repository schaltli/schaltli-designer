import { test, expect } from "@playwright/test"
import { FLOW_BUS_R, FLOW_NODE_R, flowLayout, lineWidth, resolveEnergy, sankeyLayout, type EnergyNode } from "../lib/energy-diagram"

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

// The target picture's diagram: 676 x 396 px (x 116-792, y 74-470 on the 4.3B).
const BOX = { width: 676, height: 396 }

test.describe("Sankey (L2)", () => {
  // Drive, full scale 1000 W: 534 W through the bus is 53.4 % of the 340 px
  // for bands, 181.56 px; 0.34 px a watt.
  const drive = () => sankeyLayout(resolveEnergy(NODES, watts(SITUATIONS.drive)), BOX, 1000)

  test("givers left, takers right, ordered by y then x; nothing for a node with 0 W", () => {
    const l = drive()
    expect(l.bars.map((b) => [b.id, b.side])).toEqual([
      ["solar", "left"],
      ["engine", "left"],
      ["battery", "right"],
      ["load", "right"],
    ])
    // Night: the battery gives, so it stands on the left.
    const night = sankeyLayout(resolveEnergy(NODES, watts(SITUATIONS.night)), BOX, 1000)
    expect(night.bars.map((b) => [b.id, b.side])).toEqual([
      ["battery", "left"],
      ["load", "right"],
    ])
  })

  test("widths are linear in watts against the full scale; the bus carries the total", () => {
    const l = drive()
    const bar = (id: string) => l.bars.find((b) => b.id === id)!
    expect(bar("solar").height).toBeCloseTo(40.8, 2)
    expect(bar("engine").height).toBeCloseTo(140.76, 2)
    expect(bar("battery").height).toBeCloseTo(151.64, 2)
    expect(bar("load").height).toBeCloseTo(29.92, 2)
    expect(l.bus.height).toBeCloseTo(181.56, 2)
    expect(l.bus.y).toBeCloseTo((396 - 181.56) / 2, 2)
    // Above the full scale the bands fill the room, never more.
    const big = sankeyLayout(resolveEnergy(NODES, { engine: { watts: 2000 }, battery: { watts: 2000 } }), BOX, 1000)
    expect(big.bus.height).toBeCloseTo(340, 2)
    // A thread is still 3 px.
    const tiny = sankeyLayout(resolveEnergy(NODES, { shore: { watts: 1 }, battery: { watts: 1 } }), BOX, 1000)
    expect(tiny.bars.every((b) => b.height === 3)).toBe(true)
  })

  test("each node keeps a slot of 66 px for its label, the slots centred, 14 px apart", () => {
    const l = drive()
    const slot = (id: string) => l.slots.find((s) => s.id === id)!
    // Left: 66 (solar's slot, its band thinner) + 14 + 140.76 = 220.76, from (396 - 220.76) / 2.
    expect(slot("solar").y).toBeCloseTo(87.62, 2)
    expect(slot("solar").height).toBe(66)
    expect(slot("engine").y).toBeCloseTo(87.62 + 66 + 14, 2)
    expect(slot("engine").height).toBeCloseTo(140.76, 2)
    // A bar in the middle of its slot.
    const solar = l.bars.find((b) => b.id === "solar")!
    expect(solar.y).toBeCloseTo(87.62 + (66 - 40.8) / 2, 2)
  })

  test("bars and bus in their columns; bands run under them, so no notch shows", () => {
    const l = drive()
    expect(l.bars.find((b) => b.side === "left")!.x).toBe(170)
    expect(l.bars.find((b) => b.side === "right")!.x).toBe(676 - 170 - 12)
    expect(l.bus.x).toBe(330)
    expect(l.bus.width).toBe(16)
    const solarBand = l.bands.find((b) => b.id === "solar")!
    const xs = solarBand.polygon.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(170 + 12 - 4, 3)
    expect(Math.max(...xs)).toBeCloseTo(330 + 2, 3)
    // 25 points along the top, 25 back along the bottom.
    expect(solarBand.polygon).toHaveLength(50)
    // The bus end of the left bands stacks from the bus's top.
    expect(solarBand.polygon[24].y).toBeCloseTo(l.bus.y, 2)
    const loadBand = l.bands.find((b) => b.id === "load")!
    expect(Math.max(...loadBand.polygon.map((p) => p.x))).toBeCloseTo(676 - 170 - 12 + 4, 3)
  })

  test("labels that do not fit shrink the bands, not the slots", () => {
    // Eight givers of 1000 W each: 8 slots of 66 and 7 gaps are 626 px, more than 396.
    const many: EnergyNode[] = [
      { id: "bus", role: "bus", name: "", x: 0, y: 0 },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, role: "source" as const, name: "", x: 0, y: i })),
      { id: "rest", role: "rest", name: "", x: 0, y: 0 },
    ]
    const l = sankeyLayout(resolveEnergy(many, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i}`, { watts: 1000 }]))), BOX, 1000)
    const left = l.slots.filter((s) => s.side === "left")
    expect(left).toHaveLength(8)
    expect(left.every((s) => s.height === 66)).toBe(true)
  })
})

test.describe("Flow (L3)", () => {
  const drive = () => flowLayout(NODES, resolveEnergy(NODES, watts({ ...SITUATIONS.drive })))

  test("circles at their x/y, the bus at its own; a line from each circle's edge to the bus's", () => {
    const l = drive()
    expect(l.bus).toEqual({ x: 338, y: 186, r: FLOW_BUS_R })
    const solar = l.nodes.find((n) => n.id === "solar")!
    expect([solar.x, solar.y, solar.r]).toEqual([114, 52, FLOW_NODE_R])
    // From (114, 52) to (338, 186): 224 across, 134 down, 261.03 long.
    const line = l.lines.find((n) => n.id === "solar")!
    expect(line.x0).toBeCloseTo(114 + (224 / 261.0287) * (32 + 4), 2)
    expect(line.y0).toBeCloseTo(52 + (134 / 261.0287) * (32 + 4), 2)
    expect(line.x1).toBeCloseTo(338 - (224 / 261.0287) * 14, 2)
    expect(line.y1).toBeCloseTo(186 - (134 / 261.0287) * 14, 2)
  })

  test("a line is thicker with more watts, 3 to 12 px, and still and grey at 0 W", () => {
    const l = drive()
    const line = (id: string) => l.lines.find((n) => n.id === id)!
    // 2 + log10(121) * 3.4 = 9.08
    expect(line("solar").width).toBeCloseTo(9.081, 2)
    expect(line("solar").live).toBe(true)
    expect(line("shore").width).toBe(3)
    expect(line("shore").live).toBe(false)
    expect(lineWidth(1e6)).toBe(12)
    expect(lineWidth(0.5)).toBe(3)
  })

  test("the storage has a ring as full as its charge", () => {
    const l = flowLayout(NODES, resolveEnergy(NODES, { battery: { watts: 100, charge: 82 } }))
    const battery = l.nodes.find((n) => n.id === "battery")!
    expect(battery.ring).toEqual({ r: FLOW_NODE_R + 7, fraction: 0.82 })
    expect(l.nodes.find((n) => n.id === "solar")!.ring).toBeUndefined()
    // Over 100 % or below 0: the ring stays in its bounds.
    expect(flowLayout(NODES, resolveEnergy(NODES, { battery: { charge: 140 } })).nodes.find((n) => n.id === "battery")!.ring!.fraction).toBe(1)
  })
})
