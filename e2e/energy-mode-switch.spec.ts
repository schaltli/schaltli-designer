import { test, expect } from "@playwright/test"
import { SWITCH_TAP, defaultDiagram, modeSwitchLayout, nodeAtTap, resolveEnergy, sankeyLayoutBeside, switchAtTap, type SwitchCorner } from "../lib/energy-diagram"
import { exportedEnergyDiagram } from "../lib/energy-diagram-object"

// The energy diagram's own switch (docs/2026-11-11-energy-mode-switch.md):
// two icons in a corner, each in a 44 px tap area; the Sankey keeps the
// corner's row free; the export carries the layout for the devices.

const SIZE = { width: 540, height: 400 }
const d = defaultDiagram(SIZE)
const nodes = d.nodes.map((n) => ({ ...n, ...(n.role !== "bus" && n.role !== "rest" ? { topic: n.id } : {}) }))
const resolved = resolveEnergy(nodes, { solar: { watts: 600 }, storage: { watts: 300 } })

test("the two icons in each corner, Flow first, a finger's area each", () => {
  const at = (c: SwitchCorner) => {
    const l = modeSwitchLayout(c, SIZE)!
    return [l.flow.tap.x, l.flow.tap.y, l.sankey.tap.x, l.sankey.tap.y]
  }
  expect(modeSwitchLayout("none", SIZE)).toBeNull()
  expect(at("top-left")).toEqual([0, 0, 44, 0])
  expect(at("top-right")).toEqual([452, 0, 496, 0])
  expect(at("bottom-left")).toEqual([0, 356, 44, 356])
  expect(at("bottom-right")).toEqual([452, 356, 496, 356])
  const l = modeSwitchLayout("top-right", SIZE)!
  expect(l.flow.tap.width).toBe(SWITCH_TAP)
  // The icons inside their areas.
  for (const sh of [...l.flow.shapes, ...l.sankey.shapes]) {
    const xs = sh.kind === "disc" ? [sh.cx - sh.r, sh.cx + sh.r] : [sh.x0, sh.x1]
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(l.flow.tap.x)
    expect(Math.max(...xs)).toBeLessThanOrEqual(l.sankey.tap.x + SWITCH_TAP)
  }
})

test("a tap on an icon asks for its mode; elsewhere nothing, and a node still answers", () => {
  expect(switchAtTap("top-right", SIZE, 470, 20)).toBe("flow")
  expect(switchAtTap("top-right", SIZE, 520, 20)).toBe("sankey")
  expect(switchAtTap("top-right", SIZE, 300, 20)).toBeUndefined()
  expect(switchAtTap("none", SIZE, 520, 20)).toBeUndefined()
  const solar = nodes.find((n) => n.id === "solar")!
  expect(nodeAtTap("flow", nodes, resolved, SIZE, 1000, solar.x, solar.y, "top-right")).toBe("solar")
})

test("the Sankey keeps the switch's row free", () => {
  const top = sankeyLayoutBeside(resolved, SIZE, 1000, "top-right")
  for (const s of top.slots) expect(s.y).toBeGreaterThanOrEqual(SWITCH_TAP)
  const bottom = sankeyLayoutBeside(resolved, SIZE, 1000, "bottom-left")
  for (const s of bottom.slots) expect(s.y + s.height).toBeLessThanOrEqual(SIZE.height - SWITCH_TAP)
  // A tap on a node of the shifted Sankey finds it.
  const bar = top.bars.find((b) => b.id === "solar")!
  expect(nodeAtTap("sankey", nodes, resolved, SIZE, 1000, bar.x + 2, bar.y + bar.height / 2, "top-right")).toBe("solar")
})

test("the export carries the switch's layout; none without one", () => {
  const obj = { id: "e", type: "energy-diagram", x: 0, y: 0, ...SIZE, zIndex: 1, properties: { ...d, modeSwitch: "top-right" } } as any
  const out = exportedEnergyDiagram(obj, { name: "p", fonts: [] }, () => undefined)
  expect(out.properties.modeSwitch).toEqual(modeSwitchLayout("top-right", SIZE))
  const plain = exportedEnergyDiagram({ ...obj, properties: d }, { name: "p", fonts: [] }, () => undefined)
  expect(plain.properties.modeSwitch).toBeUndefined()
})

test("an exported diagram names its corner in the layout: drawn from the export, the same switch", async () => {
  const { switchCornerOf } = await import("../lib/energy-diagram")
  expect(switchCornerOf(modeSwitchLayout("bottom-left", SIZE))).toBe("bottom-left")
  expect(switchCornerOf({ corner: "sideways" })).toBe("none")
})
