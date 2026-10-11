// The energy diagram's core (docs/2026-10-11-energy-diagram.md): what each
// node gives or takes, where the Sankey's bars, bands and bus go, where the
// Flow's circles and lines go, where the dots stand and what colour the
// wave has at a column. Pure, no canvas, no theme - the numbers the
// designer, the 4.3B and the Android app share. The cases all three must
// agree on are lib/energy-diagram/vectors.json.

export type EnergyRole = "source" | "sink" | "storage" | "rest" | "bus"

/** A node as the object holds it (spec decision 2). x/y: its centre in the Flow, relative to the diagram. */
export interface EnergyNode {
  id: string
  role: EnergyRole
  name: string
  x: number
  y: number
  iconAssetId?: string
  /** Its watts. */
  topic?: string
  /** A storage's charge in %. */
  chargeTopic?: string
  /** The topic's watts are the other way round (spec decision 5). */
  reverseSign?: boolean
  colorRole?: string
}

/** What a node's topics bring, as numbers; absent: nothing known. */
export interface EnergyValue {
  watts?: number
  charge?: number
}

/** A node as it is now: never negative watts, and whether it gives (to the bus) or takes. */
export interface ResolvedNode {
  id: string
  role: Exclude<EnergyRole, "bus">
  x: number
  y: number
  watts: number
  gives: boolean
  charge?: number
}

/**
 * What every node gives or takes (spec decisions 3-5): a source gives, a
 * sink takes, both never below nought; a storage takes while positive and
 * gives while negative; the rest takes what comes in and is not measured
 * going out, never below nought. «Reverse sign» turns a topic's value round
 * first. The bus is not among them.
 */
export function resolveEnergy(nodes: readonly EnergyNode[], values: Readonly<Record<string, EnergyValue>>): ResolvedNode[] {
  const out: ResolvedNode[] = []
  for (const n of nodes) {
    if (n.role === "bus") continue
    const raw = values[n.id]?.watts
    const w = typeof raw === "number" && Number.isFinite(raw) ? (n.reverseSign ? -raw : raw) : 0
    const charge = values[n.id]?.charge
    if (n.role === "storage") out.push({ id: n.id, role: n.role, x: n.x, y: n.y, watts: Math.abs(w), gives: w < 0, ...(typeof charge === "number" ? { charge } : {}) })
    else if (n.role === "source") out.push({ id: n.id, role: n.role, x: n.x, y: n.y, watts: Math.max(0, w), gives: true })
    else if (n.role === "sink") out.push({ id: n.id, role: n.role, x: n.x, y: n.y, watts: Math.max(0, w), gives: false })
    else out.push({ id: n.id, role: n.role, x: n.x, y: n.y, watts: 0, gives: false })
  }
  const given = out.filter((n) => n.gives).reduce((a, n) => a + n.watts, 0)
  const taken = out.filter((n) => !n.gives && n.role !== "rest").reduce((a, n) => a + n.watts, 0)
  const rest = out.find((n) => n.role === "rest")
  if (rest) rest.watts = Math.max(0, given - taken)
  return out
}

export interface Size {
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}
export interface Box extends Point, Size {}

// The Sankey's columns and spacing, in px of the diagram (spec decision 8;
// the target picture at 676 x 396).
export const SANKEY_LABEL_W = 170
export const SANKEY_BAR_W = 12
export const SANKEY_BUS_W = 16
export const SANKEY_GAP = 14
export const SANKEY_MIN_BAND = 3
export const SANKEY_SLOT_MIN = 66
/** How far a band runs under a bar, and under the bus, so no notch shows. */
export const SANKEY_UNDER_BAR = 4
export const SANKEY_UNDER_BUS = 2
/** Straight pieces a band's curved edge is drawn as - the same on every device. */
export const SANKEY_SEGMENTS = 24

export interface SankeyBar extends Box {
  id: string
  side: "left" | "right"
}
export interface SankeySlot {
  id: string
  side: "left" | "right"
  y: number
  height: number
}
export interface SankeyBand {
  id: string
  /** The outline: SEGMENTS + 1 points along the top, the same back along the bottom. */
  polygon: Point[]
}
export interface SankeyLayout {
  bars: SankeyBar[]
  slots: SankeySlot[]
  bands: SankeyBand[]
  bus: Box
}

/** A cubic from (x0, y0) to (x1, y1), its control points at the horizontal middle, as SEGMENTS + 1 points. */
function bandEdge(x0: number, y0: number, x1: number, y1: number): Point[] {
  const mx = (x0 + x1) / 2
  const pts: Point[] = []
  for (let i = 0; i <= SANKEY_SEGMENTS; i++) {
    const t = i / SANKEY_SEGMENTS
    const u = 1 - t
    pts.push({
      x: u * u * u * x0 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x1,
      y: u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1,
    })
  }
  return pts
}

const order = (a: ResolvedNode, b: ResolvedNode) => a.y - b.y || a.x - b.x

/**
 * The Sankey in a diagram of `size` (spec decision 8): givers left and
 * takers right, each side ordered by y then x, a node with 0 W left out;
 * a band as wide as the room for bands times its watts over `fullScale`,
 * all of them filling the room from the full scale on, never thinner than
 * 3 px; each node a slot of at least 66 px for its label, the slots centred
 * and 14 px apart - when the slots do not fit, the bands shrink, not the
 * slots; the bus in the middle as thick as the total; bands from just
 * under their bar to just under the bus, stacked at the bus in order.
 */
export function sankeyLayout(nodes: readonly ResolvedNode[], size: Size, fullScale: number): SankeyLayout {
  const left = nodes.filter((n) => n.gives && n.watts > 0).sort(order)
  const right = nodes.filter((n) => !n.gives && n.watts > 0).sort(order)
  const total = Math.max(
    left.reduce((a, n) => a + n.watts, 0),
    right.reduce((a, n) => a + n.watts, 0),
  )
  const room = size.height - SANKEY_GAP * 4
  const leftBarX = SANKEY_LABEL_W
  const rightBarX = size.width - SANKEY_LABEL_W - SANKEY_BAR_W
  const busX = Math.round(size.width / 2 - SANKEY_BUS_W / 2)
  if (total <= 0) return { bars: [], slots: [], bands: [], bus: { x: busX, y: size.height / 2, width: SANKEY_BUS_W, height: 0 } }

  let scale = (room * Math.min(1, total / Math.max(1, fullScale))) / total
  const band = (w: number) => Math.max(SANKEY_MIN_BAND, w * scale)
  const fits = (list: ResolvedNode[]) => list.reduce((a, n) => a + Math.max(SANKEY_SLOT_MIN, band(n.watts)), 0) + SANKEY_GAP * Math.max(0, list.length - 1)
  for (let i = 0; i < 40 && Math.max(fits(left), fits(right)) > size.height && scale * total > SANKEY_MIN_BAND; i++) scale *= 0.92

  const bars: SankeyBar[] = []
  const slots: SankeySlot[] = []
  const place = (list: ResolvedNode[], side: "left" | "right") => {
    let y = (size.height - fits(list)) / 2
    for (const n of list) {
      const h = band(n.watts)
      const slot = Math.max(SANKEY_SLOT_MIN, h)
      slots.push({ id: n.id, side, y, height: slot })
      bars.push({ id: n.id, side, x: side === "left" ? leftBarX : rightBarX, y: y + (slot - h) / 2, width: SANKEY_BAR_W, height: h })
      y += slot + SANKEY_GAP
    }
  }
  place(left, "left")
  place(right, "right")

  const busH = Math.max(SANKEY_MIN_BAND, total * scale)
  const bus: Box = { x: busX, y: (size.height - busH) / 2, width: SANKEY_BUS_W, height: busH }
  const bands: SankeyBand[] = []
  const stack = (list: ResolvedNode[], side: "left" | "right") => {
    let by = bus.y
    for (const n of list) {
      const bar = bars.find((b) => b.id === n.id)!
      const h = n.watts * scale
      const bh = Math.max(1.5, h)
      let top: Point[], bottom: Point[]
      if (side === "left") {
        const x0 = leftBarX + SANKEY_BAR_W - SANKEY_UNDER_BAR, x1 = busX + SANKEY_UNDER_BUS
        top = bandEdge(x0, bar.y, x1, by)
        bottom = bandEdge(x0, bar.y + bar.height, x1, by + bh)
      } else {
        const x0 = busX + SANKEY_BUS_W - SANKEY_UNDER_BUS, x1 = rightBarX + SANKEY_UNDER_BAR
        top = bandEdge(x0, by, x1, bar.y)
        bottom = bandEdge(x0, by + bh, x1, bar.y + bar.height)
      }
      bands.push({ id: n.id, polygon: [...top, ...bottom.reverse()] })
      by += h
    }
  }
  stack(left, "left")
  stack(right, "right")
  return { bars, slots, bands, bus }
}

// The Flow's circles (spec decision 9; the target picture).
export const FLOW_NODE_R = 32
export const FLOW_BUS_R = 14
/** The gap between a circle and where its line starts. */
export const FLOW_LINE_GAP = 4
export const FLOW_RING_GAP = 7
/** Between a circle and a label beside it. */
export const FLOW_LABEL_GAP = 10
/** A line leaving a circle steeper than this below the level (60°) would cross a label under it. */
const LABEL_BESIDE_BELOW = Math.cos(Math.PI / 6)

/** A line's width for its watts: 3 px still, up to 12 px, by the logarithm. */
export function lineWidth(watts: number): number {
  if (!(watts > 0)) return 3
  return Math.max(3, Math.min(12, 2 + Math.log10(watts + 1) * 3.4))
}

export interface FlowNode extends Point {
  id: string
  r: number
  live: boolean
  ring?: { r: number; fraction: number }
  /** Where its name's baseline starts; the live lines follow below it. */
  label: { x: number; y: number; align: "middle" | "start" }
}
export interface FlowLine {
  id: string
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  live: boolean
}
export interface FlowLayout {
  bus: Point & { r: number }
  nodes: FlowNode[]
  lines: FlowLine[]
}

/**
 * The Flow (spec decision 9): each node a circle at its own x/y, the bus at
 * the bus node's; a straight line from a circle's edge (and a gap) to the
 * bus's edge, as wide as `lineWidth` of its watts, live while it carries
 * any. The storage's ring is as full as its charge. A node's label goes
 * under its circle, or beside it when its line leaves downwards.
 */
export function flowLayout(nodes: readonly EnergyNode[], resolved: readonly ResolvedNode[]): FlowLayout {
  const busNode = nodes.find((n) => n.role === "bus")
  const bus = { x: busNode?.x ?? 0, y: busNode?.y ?? 0, r: FLOW_BUS_R }
  const out: FlowNode[] = []
  const lines: FlowLine[] = []
  for (const n of resolved) {
    const live = n.watts > 0
    const dx = bus.x - n.x, dy = bus.y - n.y
    const len = Math.hypot(dx, dy)
    const ux = len > 0 ? dx / len : 0, uy = len > 0 ? dy / len : 0
    const ringed = n.role === "storage"
    // The label under the circle, centred - beside it, to the right, when
    // the line leaves downwards and would run through it (the user,
    // 2026-10-11, after the target picture's Landstrom).
    const outer = FLOW_NODE_R + (ringed ? FLOW_RING_GAP : 0)
    const label: FlowNode["label"] =
      uy > LABEL_BESIDE_BELOW
        ? { x: n.x + outer + FLOW_LABEL_GAP, y: n.y - FLOW_NODE_R + 8, align: "start" }
        : { x: n.x, y: n.y + FLOW_NODE_R + (ringed ? 26 : 20), align: "middle" }
    const node: FlowNode = { id: n.id, x: n.x, y: n.y, r: FLOW_NODE_R, live, label }
    if (ringed) {
      const fraction = typeof n.charge === "number" ? Math.max(0, Math.min(1, n.charge / 100)) : 0
      node.ring = { r: FLOW_NODE_R + FLOW_RING_GAP, fraction }
    }
    out.push(node)
    if (len <= FLOW_NODE_R + FLOW_LINE_GAP + FLOW_BUS_R) continue
    lines.push({
      id: n.id,
      x0: n.x + ux * (FLOW_NODE_R + FLOW_LINE_GAP),
      y0: n.y + uy * (FLOW_NODE_R + FLOW_LINE_GAP),
      x1: bus.x - ux * FLOW_BUS_R,
      y1: bus.y - uy * FLOW_BUS_R,
      width: lineWidth(n.watts),
      live,
    })
  }
  return { bus, nodes: out, lines }
}

// ---- Motion (spec decision 10). A phase 0..1 per line or per diagram,
// advanced by the time that passed; every renderer draws the same picture
// for the same phase, so a test can freeze one and compare.

/**
 * How long a dot takes to move on by one spacing, in seconds: quicker with
 * more watts, never quicker than 0.35 s.
 */
export function dotSeconds(watts: number): number {
  return Math.max(0.35, 2.4 - Math.log10(Math.abs(watts) + 1) * 0.75)
}

/** A line's dot phase after `seconds`. */
export function advanceDots(phase: number, seconds: number, watts: number): number {
  return (((phase + seconds / dotSeconds(watts)) % 1) + 1) % 1
}

export const DOT_SPACING = 26

/**
 * The dots on a line at a phase: one every DOT_SPACING px (at least one),
 * from the line's start - the node - towards its end - the bus - while the
 * node gives, the other way while it takes.
 */
export function dotsOnLine(line: { x0: number; y0: number; x1: number; y1: number }, phase: number, gives: boolean): Point[] {
  const len = Math.hypot(line.x1 - line.x0, line.y1 - line.y0)
  const count = Math.max(1, Math.floor(len / DOT_SPACING))
  const out: Point[] = []
  for (let k = 0; k < count; k++) {
    let f = (k + phase) / count
    if (!gives) f = 1 - f
    out.push({ x: line.x0 + (line.x1 - line.x0) * f, y: line.y0 + (line.y1 - line.y0) * f })
  }
  return out
}

/** The wave's period across x, and the time it takes to move one. */
export const WAVE_PX = 48
export const WAVE_SECONDS = 4

/** The wave's phase after `seconds` - the same pace for every band. */
export function advanceWave(phase: number, seconds: number): number {
  return (((phase + seconds / WAVE_SECONDS) % 1) + 1) % 1
}

/**
 * How far a column of a band is washed towards the ground at a phase:
 * 0.42 ± 0.16, by its x alone - so a column is one colour, and a device
 * repaints a step as one stroke per column.
 */
export function waveMix(x: number, phase: number): number {
  return 0.42 - 0.16 * Math.cos((2 * Math.PI * (x - phase * WAVE_PX)) / WAVE_PX)
}

/** A column's colour: the band's colour washed towards the ground by `waveMix`, each channel rounded. */
export function waveColour(band: readonly [number, number, number], ground: readonly [number, number, number], x: number, phase: number): [number, number, number] {
  const t = waveMix(x, phase)
  return [0, 1, 2].map((i) => Math.round(band[i] + (ground[i] - band[i]) * t)) as [number, number, number]
}
