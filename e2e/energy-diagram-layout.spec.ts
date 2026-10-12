import { test, expect } from "@playwright/test"
import vectors from "../lib/energy-diagram/vectors.json"
import { DOT_PACE, DOT_R, FLOW_BUS_R, flowBoxes, labelHeight, rowStep, sankeyBoxes, FLOW_LABEL_GAP, FLOW_NODE_R, WAVE_PX, WAVE_SECONDS, advanceDots, advanceWave, dotGap, dotsOnLine, flowLayout, lineWidth, resolveEnergy, sankeyLayout, waveColour, waveMix, type EnergyNode } from "../lib/energy-diagram"

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

test.describe("Dots and waves (L4)", () => {
  test("dots stand for current: one pace, a gap shrinking the same factor every tenfold, 120 px at 1 W to 8 px at 1000 W", () => {
    expect(DOT_PACE).toBe(40)
    expect(DOT_R).toBe(3.5)
    expect(dotGap(1)).toBe(120)
    expect(dotGap(0.2)).toBe(120)
    expect(dotGap(10)).toBeCloseTo(48.66, 2)
    expect(dotGap(100)).toBeCloseTo(19.73, 2)
    expect(dotGap(1000)).toBeCloseTo(8, 5)
    expect(dotGap(1e9)).toBeCloseTo(8, 5)
    expect(dotGap(-40)).toBe(dotGap(40))
    // More watts, never fewer dots.
    for (let w = 1; w < 1000; w *= 1.5) expect(dotGap(w * 1.5)).toBeLessThan(dotGap(w))
    // The phase is a share of the gap: at 1 W a dot moves 40 px of 120 a second.
    expect(advanceDots(0.9, 1.5, 1)).toBeCloseTo(0.4, 5)
    expect(advanceDots(0.25, 0.1, 1000)).toBeCloseTo(0.75, 5)
  })

  test("dots along a line, a gap apart: from the node to the bus while it gives, back while it takes", () => {
    const line = { x0: 0, y0: 0, x1: 300, y1: 0 }
    expect(dotsOnLine(line, 0, true, 1).map((p) => +p.x.toFixed(2))).toEqual([0, 120, 240])
    expect(dotsOnLine(line, 0.5, true, 1).map((p) => +p.x.toFixed(2))).toEqual([60, 180])
    expect(dotsOnLine(line, 0, false, 1).map((p) => +p.x.toFixed(2))).toEqual([300, 180, 60])
    // The user's case, 2026-10-12: 40 W into the storage shows closer dots
    // than 12 W of sun, whatever the lines' lengths.
    const hundred = { x0: 0, y0: 0, x1: 100, y1: 0 }
    expect(dotsOnLine(hundred, 0, false, 40)).toHaveLength(4)
    expect(dotsOnLine(hundred, 0, true, 12)).toHaveLength(3)
    // A line shorter than its gap may hold none for a moment.
    expect(dotsOnLine({ x0: 0, y0: 0, x1: 10, y1: 0 }, 0.5, true, 1)).toHaveLength(0)
  })

  test("the wave: a column's colour by its x only, 48 px a period, 4 s a period, the same for every band", () => {
    expect(WAVE_PX).toBe(48)
    expect(WAVE_SECONDS).toBe(4)
    expect(waveMix(0, 0)).toBeCloseTo(0.26, 5)
    expect(waveMix(24, 0)).toBeCloseTo(0.58, 5)
    expect(waveMix(12, 0)).toBeCloseTo(0.42, 5)
    // A quarter period on, the wave has moved 12 px to the right.
    expect(waveMix(12, 0.25)).toBeCloseTo(0.26, 5)
    expect(advanceWave(0.5, 2)).toBeCloseTo(0, 5)
    // The band's colour washed towards the ground by the mix, rounded.
    expect(waveColour([224, 108, 31], [0, 0, 0], 0, 0)).toEqual([166, 80, 23])
    expect(waveColour([224, 108, 31], [255, 255, 255], 24, 0)).toEqual([242, 193, 161])
  })
})

// The cases the firmware and the app run too (L5): lib/energy-diagram/vectors.json.
test.describe("shared vectors (L5)", () => {
  const nodes = vectors.nodes as EnergyNode[]
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 1)

  test("enough cases that a truncated copy cannot pass", () => {
    expect(vectors.resolve.length + vectors.sankey.length + vectors.flowLines.length).toBeGreaterThanOrEqual(9)
    expect(vectors.dots.length + vectors.wave.length + vectors.dotGap.length).toBeGreaterThanOrEqual(10)
  })
  for (const c of vectors.resolve) {
    test(`resolve: ${c.name}`, () => {
      const r = Object.fromEntries(resolveEnergy(nodes, c.values as any).map((n) => [n.id, [n.watts, n.gives]]))
      expect(r).toEqual(c.expected)
    })
  }
  for (const c of vectors.sankey) {
    test(`sankey: ${c.name}`, () => {
      const l = sankeyLayout(resolveEnergy(nodes, c.values as any), c.size, c.fullScale)
      expect(l.bars.map((b) => [b.id, b.side])).toEqual(c.expected.bars.map((b) => [b.id, b.side]))
      l.bars.forEach((b, i) => {
        const e = c.expected.bars[i]
        near(b.x, e.x)
        near(b.y, e.y)
        near(b.height, e.height)
      })
      for (const k of ["x", "y", "width", "height"] as const) near(l.bus[k], c.expected.bus[k])
    })
  }
  for (const c of vectors.flowLines) {
    test(`flow: ${c.name}`, () => {
      const line = flowLayout(nodes, resolveEnergy(nodes, c.values as any)).lines.find((l) => l.id === c.id)!
      for (const k of ["x0", "y0", "x1", "y1", "width"] as const) near(line[k], c.expected[k])
      expect(line.live).toBe(c.expected.live)
    })
  }
  for (const c of vectors.flowLabels) {
    test(`flow label: ${c.name}`, () => {
      expect(flowLayout(nodes, resolveEnergy(nodes, {})).nodes.find((n) => n.id === c.id)!.label).toEqual(c.expected)
    })
  }
  for (const c of vectors.boxes as any[]) {
    test(`boxes: ${c.name}`, () => {
      const withLines = nodes.map((n) => ({ ...n, lines: Array.from({ length: c.lines[n.id] ?? 0 }, () => ({ text: "{watts} W" })) }))
      const r = resolveEnergy(withLines, c.values)
      const b = c.mode === "flow" ? flowBoxes(flowLayout(withLines, r), c.metrics) : sankeyBoxes(sankeyLayout(r, c.size, c.fullScale), withLines, c.size, c.metrics)
      expect(b.bus).toEqual(c.expected.bus)
      for (const [id, e] of Object.entries(c.expected.nodes)) {
        const n = b.nodes.find((x) => x.id === id)!
        expect({ icon: n.icon, label: n.label }, id).toEqual(e)
      }
    })
  }
  test("dot gaps, dots and waves", () => {
    for (const c of vectors.dotGap) near(dotGap(c.watts), c.expected)
    for (const c of vectors.dots) {
      const pts = dotsOnLine(c.line, c.phase, c.gives, c.watts)
      expect(pts.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)])).toEqual(c.expected)
    }
    for (const c of vectors.wave) {
      near(waveMix(c.x, c.phase), c.mix)
      expect(waveColour(c.band as [number, number, number], c.ground as [number, number, number], c.x, c.phase)).toEqual(c.colour)
    }
  })
})

test.describe("names, lines and icons: boxes from the core (energy-contract C1)", () => {
  test("a row is 1.2 times its font, rounded; a label is its name, then its lines, the first in the value font", () => {
    expect(rowStep(16)).toBe(19)
    expect(rowStep(22)).toBe(26)
    const m = { fontSize: 16, valueFontSize: 22 }
    expect(labelHeight(0, m)).toBe(19)
    expect(labelHeight(1, m)).toBe(19 + 26)
    expect(labelHeight(3, m)).toBe(19 * 3 + 26)
    // Never more than three lines.
    expect(labelHeight(5, m)).toBe(labelHeight(3, m))
  })

  test("every box stands on whole pixels, for a device to place text by", () => {
    const m = { fontSize: 15, valueFontSize: 21 }
    const r = resolveEnergy(NODES, { solar: { watts: 77 }, battery: { watts: -33 } })
    for (const b of [flowBoxes(flowLayout(NODES, r), m), sankeyBoxes(sankeyLayout(r, { width: 601, height: 377 }, 700), NODES, { width: 601, height: 377 }, m)]) {
      for (const box of [b.bus!, ...b.nodes.flatMap((n) => [n.icon, n.label])]) {
        for (const v of [box.x, box.y]) expect(Number.isInteger(v), JSON.stringify(box)).toBe(true)
      }
    }
  })
})

test.describe("Flow labels (decided 2026-10-11)", () => {
  test("under the circle, centred - beside it, left-aligned, when its line leaves downwards", () => {
    const l = flowLayout(NODES, resolveEnergy(NODES, {}))
    const label = (id: string) => l.nodes.find((n) => n.id === id)!.label
    // Landstrom sits straight above the bus: its line leaves downwards.
    expect(label("shore")).toEqual({ x: 338 + FLOW_NODE_R + FLOW_LABEL_GAP, y: 52 - FLOW_NODE_R + 8, align: "start" })
    // The sun's line leaves at about 31° below the level: under the circle.
    expect(label("solar")).toEqual({ x: 114, y: 52 + FLOW_NODE_R + 20, align: "middle" })
    // The battery's ring takes room: its label 6 px further down.
    expect(label("battery")).toEqual({ x: 202, y: 302 + FLOW_NODE_R + 26, align: "middle" })
  })
})

// Nothing flows anywhere (the user, 2026-10-12: a Sankey left blank said
// nothing about why): the bus as its thinnest bar, every node on its side
// at the thinnest bar with its label, grey - no band.
test("Sankey: with nothing flowing, the bus and every node stand at the thinnest, without bands", () => {
  const nodes: EnergyNode[] = [
    { id: "bus", role: "bus", name: "12 V", x: 270, y: 200 },
    { id: "sun", role: "source", name: "Sun", x: 80, y: 60 },
    { id: "grid", role: "source", name: "Grid", x: 80, y: 160 },
    { id: "store", role: "storage", name: "Store", x: 80, y: 300 },
    { id: "fridge", role: "sink", name: "Fridge", x: 460, y: 100 },
    { id: "rest", role: "rest", name: "Rest", x: 460, y: 200 },
  ]
  const layout = sankeyLayout(resolveEnergy(nodes, {}), { width: 676, height: 396 }, 1000)
  expect(layout.bands).toEqual([])
  expect(layout.bus.height).toBe(3)
  expect(layout.bus.y).toBeCloseTo((396 - 3) / 2)
  // Givers left, the rest right - a storage that neither gives nor takes takes.
  expect(layout.bars.filter((b) => b.side === "left").map((b) => b.id)).toEqual(["sun", "grid"])
  expect(layout.bars.filter((b) => b.side === "right").map((b) => b.id)).toEqual(["fridge", "rest", "store"])
  for (const b of layout.bars) expect(b.height, b.id).toBe(3)
  expect(layout.slots.map((s) => s.height)).toEqual(Array(5).fill(66))
})
