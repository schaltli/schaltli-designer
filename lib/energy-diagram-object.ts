// The energy diagram as an object of the designer's (docs/2026-10-11-energy-
// diagram.md): what lib/energy-diagram.ts, the pure core, does not know -
// screens, projects, themes, exports.

import type { ScreenObject } from "@/components/project-editor"
import { DEFAULT_FULL_SCALE, FLOW_ICON, MAX_NODE_LINES, rowStep, type EnergyNode } from "@/lib/energy-diagram"
import { exportedTextProperties } from "@/lib/object-text"

/**
 * What a device below generation 1.7 would not show, for the deploy
 * dialog: each energy diagram, by the screen it is on (a master's by the
 * master), at every depth.
 */
export function energyDiagramsNotOnDevices(project: { screens: readonly { name: string; objects?: ScreenObject[] }[] }): string[] {
  const names: string[] = []
  for (const screen of project.screens) {
    const walk = (objects: readonly ScreenObject[]) => {
      for (const o of objects) {
        if (o.type === "energy-diagram") names.push(`the energy diagram on ${screen.name}`)
        if (o.children?.length) walk(o.children)
      }
    }
    walk(screen.objects ?? [])
  }
  return names
}

/** The colours the theme gave the diagram (lib/themes.ts applyTheme), with what stands in without one. */
export function diagramColours(p: Record<string, any>) {
  return {
    text: (p.textColor as string) ?? "#1d1b20",
    muted: (p.mutedColor as string) ?? "#49454f",
    bus: (p.busColor as string) ?? "#6750a4",
    idle: (p.idleColor as string) ?? "#cac4d0",
    charge: (p.chargeColor as string) ?? "#2f9a52",
    discharge: (p.dischargeColor as string) ?? "#d0453f",
  }
}

// ---- Icons, baked per look (device contract 2.8): a node draws its icon
// in its colour while it carries watts - a storage in the charge or the
// discharge colour - and muted at 0 W.

export type IconLook = "live" | "charge" | "discharge" | "muted"

/** The looks a node's icon has, in the order they are baked. */
export function iconLooks(node: Pick<EnergyNode, "role">): IconLook[] {
  return node.role === "storage" ? ["charge", "discharge", "muted"] : ["live", "muted"]
}

/** The colour a look draws a node's icon in. */
export function iconLookColour(p: Record<string, any>, node: EnergyNode, look: IconLook): string {
  const c = diagramColours(p)
  if (look === "charge") return c.charge
  if (look === "discharge") return c.discharge
  if (look === "muted") return c.muted
  return (node as { color?: string }).color ?? c.text
}

/** How big a node's icon is drawn: the Flow's in its circle, the Sankey's a row of the name's font high. */
export function iconSize(p: Record<string, any>, fonts: readonly { id: string; size?: number }[]): number {
  return p.mode === "sankey" ? rowStep(fontSizeOf(p.fontId, fonts)) : FLOW_ICON
}

/** The key one bake goes under: `<diagram>~<node>~<look>`, as a live icon's branches are keyed. */
export function iconBakeKey(diagramId: string, nodeId: string, look: IconLook): string {
  return `${diagramId}~${nodeId}~${look}`
}

/** Every icon bake a diagram needs: its node, look, asset, size and colour. */
export function iconBakes(obj: ScreenObject, fonts: readonly { id: string; size?: number }[]) {
  const p = obj.properties as Record<string, any>
  const nodes: EnergyNode[] = Array.isArray(p.nodes) ? p.nodes : []
  const size = iconSize(p, fonts)
  return nodes
    .filter((n) => n.role !== "bus" && n.iconAssetId)
    .flatMap((n) => iconLooks(n).map((look) => ({ key: iconBakeKey(obj.id, n.id, look), node: n, look, assetId: n.iconAssetId!, size, colour: iconLookColour(p, n, look) })))
}

function fontSizeOf(id: string | undefined, fonts: readonly { id: string; size?: number }[]): number {
  return fonts.find((f) => f.id === id)?.size ?? 16
}

/**
 * The diagram as a device gets it (device contract 2.8): its data, the
 * colours with their `…Dark` as the theme left them, the fonts' sizes, and
 * per node what it reads, its lines as live text and its icon's bakes
 * (`paths`: the light and dark file of one look, if there is one).
 */
export function exportedEnergyDiagram(
  obj: ScreenObject,
  project: { name: string; fonts?: { id: string; size?: number }[] },
  paths: (key: string, node: EnergyNode, look: IconLook) => { path: string; pathDark?: string } | undefined,
): ScreenObject {
  const p = obj.properties as Record<string, any>
  const fonts = project.fonts ?? []
  const valueFontId = p.valueFontId ?? p.fontId
  const colourKeys = ["textColor", "mutedColor", "busColor", "idleColor", "chargeColor", "dischargeColor"]
  const colours: Record<string, string> = {}
  const c = diagramColours(p)
  const fallback: Record<string, string> = { textColor: c.text, mutedColor: c.muted, busColor: c.bus, idleColor: c.idle, chargeColor: c.charge, dischargeColor: c.discharge }
  for (const key of colourKeys) {
    colours[key] = p[key] ?? fallback[key]
    if (typeof p[`${key}Dark`] === "string") colours[`${key}Dark`] = p[`${key}Dark`]
  }
  const nodes = (Array.isArray(p.nodes) ? (p.nodes as EnergyNode[]) : []).map((n) => {
    if (n.role === "bus") return { id: n.id, role: n.role, name: n.name, x: n.x, y: n.y }
    const node = n as EnergyNode & { color?: string; colorDark?: string }
    const icon: Record<string, unknown> = {}
    for (const look of n.iconAssetId ? iconLooks(n) : []) {
      const baked = paths(iconBakeKey(obj.id, n.id, look), n, look)
      if (!baked) continue
      icon[look] = baked.path
      if (baked.pathDark) icon[`${look}Dark`] = baked.pathDark
    }
    return {
      id: n.id,
      role: n.role,
      name: n.name,
      x: n.x,
      y: n.y,
      ...(n.role !== "rest" && n.topic ? { topic: n.topic } : {}),
      ...(n.role === "storage" && n.chargeTopic ? { chargeTopic: n.chargeTopic } : {}),
      ...(n.role !== "rest" && n.reverseSign ? { reverseSign: true } : {}),
      ...(node.color ? { color: node.color } : {}),
      ...(node.colorDark ? { colorDark: node.colorDark } : {}),
      ...(Object.keys(icon).length ? { icon: { size: iconSize(p, fonts), ...icon } } : {}),
      // The asset its looks were baked from: a device reads the bakes; a
      // reference render of the export draws from it (hil/android).
      ...(Object.keys(icon).length && n.iconAssetId ? { iconAssetId: n.iconAssetId } : {}),
      lines: (n.lines ?? []).slice(0, MAX_NODE_LINES).map((line, i) => {
        const text = exportedTextProperties({ id: `${obj.id}-${n.id}-line${i}`, type: "text", x: 0, y: 0, width: 0, height: 0, zIndex: 0, properties: { text: line.text, ...(line.liveValues?.length ? { liveValues: line.liveValues } : {}) } } as ScreenObject, project)
        return { text: text.text, ...(text.liveText !== undefined ? { liveText: text.liveText, liveValues: text.liveValues } : {}) }
      }),
      ...(n.action ? { action: n.action } : {}),
    }
  })
  return {
    ...obj,
    properties: {
      mode: p.mode === "sankey" ? "sankey" : "flow",
      motion: p.motion !== false,
      fullScale: p.fullScale > 0 ? p.fullScale : DEFAULT_FULL_SCALE,
      ...(p.fontId ? { fontId: p.fontId } : {}),
      fontSize: fontSizeOf(p.fontId, fonts),
      ...(valueFontId ? { valueFontId } : {}),
      valueFontSize: fontSizeOf(valueFontId, fonts),
      ...colours,
      nodes,
    },
  }
}
