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
