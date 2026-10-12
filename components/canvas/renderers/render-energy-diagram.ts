// The energy diagram on a canvas (docs/2026-10-11-energy-diagram.md): the
// editor, the preview, the thumbnails and test-render all draw it here.
// Every place and size comes from lib/energy-diagram.ts; this file only
// paints them. A node's name and lines are text objects, its icon an icon
// object, drawn by their own renderers - so live text, rules, fonts and
// tinted icons are exactly a text's and an icon's.

import type { ScreenObject } from "@/components/project-editor"
import {
  DEFAULT_FULL_SCALE,
  FLOW_NODE_R,
  SANKEY_BAR_W,
  SANKEY_LABEL_W,
  advanceDots,
  advanceWave,
  dotsOnLine,
  flowLayout,
  resolveEnergy,
  sankeyLayout,
  waveColour,
  withWatts,
  type EnergyDiagramProperties,
  type EnergyNode,
  type EnergyValue,
  type ResolvedNode,
} from "@/lib/energy-diagram"
import { renderScreenObjects, type RenderScreenObjectsOptions } from "@/lib/render-screen"
import { applyColorDepth } from "@/lib/color-depth"

/**
 * Where the motion stands: one phase per Flow line - keyed `<diagram>/<node>`
 * (dotKey) - and one for every Sankey band on the screen.
 */
export interface EnergyMotion {
  dots: Readonly<Record<string, number>>
  wave: number
}

export const STILL: EnergyMotion = { dots: {}, wave: 0 }

/** A Flow line's key in EnergyMotion.dots. */
export function dotKey(diagramId: string, nodeId: string): string {
  return `${diagramId}/${nodeId}`
}

/**
 * The motion `seconds` later (spec decision 10): every line's dots on by
 * their own pace, the wave by its one pace. Lines of diagrams whose Motion
 * is off stay where they are.
 */
export function advanceEnergyMotion(motion: EnergyMotion, seconds: number, diagrams: readonly ScreenObject[], value: (topic: string | undefined) => string): EnergyMotion {
  const dots: Record<string, number> = { ...motion.dots }
  let moving = false
  for (const d of diagrams) {
    const p = d.properties as Record<string, any>
    if (p.motion === false || !Array.isArray(p.nodes)) continue
    moving = true
    for (const r of resolveEnergy(p.nodes, energyValues(p.nodes, value))) {
      if (r.watts > 0) dots[dotKey(d.id, r.id)] = advanceDots(dots[dotKey(d.id, r.id)] ?? 0, seconds, r.watts)
    }
  }
  return moving ? { dots, wave: advanceWave(motion.wave, seconds) } : motion
}

/**
 * The node a tap at `at` (screen coordinates) lands on, if any: in the
 * Flow its circle, in the Sankey its bar and its label beside it. The bus
 * is never one - it has no action.
 */
export function energyNodeAtTap(obj: ScreenObject, at: { x: number; y: number }, value: (topic: string | undefined) => string): EnergyNode | undefined {
  const p = obj.properties as Record<string, any>
  const nodes: EnergyNode[] = Array.isArray(p.nodes) ? p.nodes : []
  const x = at.x - obj.x, y = at.y - obj.y
  if (p.mode === "sankey") {
    const layout = sankeyLayout(resolveEnergy(nodes, energyValues(nodes, value)), { width: obj.width, height: obj.height }, p.fullScale > 0 ? p.fullScale : DEFAULT_FULL_SCALE)
    const slot = layout.slots.find((s) => y >= s.y && y < s.y + s.height && (s.side === "left" ? x < SANKEY_LABEL_W + SANKEY_BAR_W : x >= obj.width - SANKEY_LABEL_W - SANKEY_BAR_W))
    return slot ? nodes.find((n) => n.id === slot.id) : undefined
  }
  return nodes.find((n) => n.role !== "bus" && Math.hypot(x - n.x, y - n.y) <= FLOW_NODE_R)
}

/** Every diagram on a screen, at any depth. */
export function energyDiagramsIn(objects: readonly ScreenObject[]): ScreenObject[] {
  return objects.flatMap((o) => [...(o.type === "energy-diagram" ? [o] : []), ...energyDiagramsIn(o.children ?? [])])
}

/** The colours the theme gave the diagram (lib/themes.ts applyTheme), with what stands in without one. */
function look(p: Record<string, any>) {
  return {
    text: p.textColor ?? "#1d1b20",
    muted: p.mutedColor ?? "#49454f",
    bus: p.busColor ?? "#6750a4",
    idle: p.idleColor ?? "#cac4d0",
    charge: p.chargeColor ?? "#2f9a52",
    discharge: p.dischargeColor ?? "#d0453f",
  }
}

/** A number from a topic's value, or undefined: nothing arrived, or not a number. */
function numberOf(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined
  const n = Number(value.trim())
  return Number.isFinite(n) ? n : undefined
}

/** What each node's topics say now. */
export function energyValues(nodes: readonly EnergyNode[], value: (topic: string | undefined) => string): Record<string, EnergyValue> {
  const out: Record<string, EnergyValue> = {}
  for (const n of nodes) {
    if (n.role === "bus" || n.role === "rest") continue
    const watts = n.topic ? numberOf(value(n.topic)) : undefined
    const charge = n.role === "storage" && n.chargeTopic ? numberOf(value(n.chargeTopic)) : undefined
    out[n.id] = { ...(watts !== undefined ? { watts } : {}), ...(charge !== undefined ? { charge } : {}) }
  }
  return out
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hex([r, g, b]: readonly number[]): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
}

/** A node's colour: the storage's by its sign, a 0 W node grey in the Flow. */
function colourOf(node: EnergyNode | undefined, r: ResolvedNode, c: ReturnType<typeof look>): string {
  if (r.role === "storage") return r.gives ? c.discharge : c.charge
  return (node as { color?: string } | undefined)?.color ?? c.text
}

interface TextLook {
  fontId?: string
  valueFontId?: string
  fontSize: number
  valueFontSize: number
}

/**
 * A node's name and lines as text objects, one per line, `width` wide, the
 * first line in the value font and the text colour, the others muted.
 */
function labelObjects(
  node: EnergyNode,
  watts: number | undefined,
  at: { x: number; y: number; width: number; align: "left" | "center" | "right" },
  t: TextLook,
  c: ReturnType<typeof look>,
  name?: string,
): ScreenObject[] {
  const out: ScreenObject[] = []
  let y = at.y
  const line = (id: string, text: string, liveValues: unknown, fontId: string | undefined, size: number, colour: string) => {
    out.push({
      id: `${node.id}-${id}`,
      type: "text",
      x: at.x,
      y,
      width: at.width,
      height: size,
      zIndex: 3,
      properties: { text, ...(liveValues ? { liveValues } : {}), fontId, textColor: colour, textAlign: at.align, backgroundColor: "transparent", borderColor: "transparent" },
    } as ScreenObject)
    y += Math.round(size * 1.2)
  }
  // A name as a text: braces doubled, so it is never read as a placeholder.
  line("name", (name ?? node.name).replace(/\{/g, "{{").replace(/\}/g, "}}"), undefined, t.fontId, t.fontSize, c.muted)
  ;(node.lines ?? []).slice(0, 3).forEach((l, i) => {
    const first = i === 0
    line(`line${i}`, withWatts(l.text, watts), l.liveValues, first ? t.valueFontId : t.fontId, first ? t.valueFontSize : t.fontSize, first ? c.text : c.muted)
  })
  return out
}

function iconObject(node: EnergyNode, cx: number, cy: number, size: number, colour: string): ScreenObject[] {
  if (!node.iconAssetId) return []
  return [
    {
      id: `${node.id}-icon`,
      type: "icon",
      x: Math.round(cx - size / 2),
      y: Math.round(cy - size / 2),
      width: size,
      height: size,
      zIndex: 2,
      properties: { assetId: node.iconAssetId, iconColor: colour, backgroundColor: "transparent" },
    } as ScreenObject,
  ]
}

/** How tall a node's label is: its name and its lines. */
function labelHeight(node: EnergyNode, t: TextLook): number {
  const lines = (node.lines ?? []).slice(0, 3)
  return Math.round(t.fontSize * 1.2) * (1 + Math.max(0, lines.length - 1)) + (lines.length ? Math.round(t.valueFontSize * 1.2) : 0)
}

/**
 * The diagram at its place on the canvas, from the values its topics have
 * now, at a moment of its motion (STILL: everything at phase 0).
 */
export function renderEnergyDiagram(ctx: CanvasRenderingContext2D, obj: ScreenObject, options: RenderScreenObjectsOptions, motion: EnergyMotion = STILL): void {
  const p = obj.properties as EnergyDiagramProperties & Record<string, any>
  // Motion off: the picture at phase 0, as a device draws it.
  if (p.motion === false) motion = STILL
  const nodes: EnergyNode[] = Array.isArray(p.nodes) ? p.nodes : []
  const c = look(p)
  const depth = (colour: string) => applyColorDepth(colour, options.colorDepth)
  const fontSize = (id: string | undefined) => options.fonts.find((f) => f.id === id)?.size ?? 16
  const t: TextLook = { fontId: p.fontId, valueFontId: p.valueFontId ?? p.fontId, fontSize: fontSize(p.fontId), valueFontSize: fontSize(p.valueFontId ?? p.fontId) }
  const resolved = resolveEnergy(nodes, energyValues(nodes, options.getPreviewValueFromTopic))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // What the {watts} of a node says: nothing while its topic has not spoken.
  const known = energyValues(nodes, options.getPreviewValueFromTopic)
  const wattsOf = (r: ResolvedNode) => (r.role === "rest" || known[r.id]?.watts !== undefined ? (r.role === "storage" && r.gives ? -r.watts : r.watts) : undefined)
  const ground = options.screenBackgroundColor && options.screenBackgroundColor !== "transparent" ? options.screenBackgroundColor : "#ffffff"
  const labels: ScreenObject[] = []

  ctx.save()
  ctx.beginPath()
  ctx.rect(obj.x, obj.y, obj.width, obj.height)
  ctx.clip()
  ctx.translate(obj.x, obj.y)

  if (p.mode === "sankey") {
    const layout = sankeyLayout(resolved, { width: obj.width, height: obj.height }, p.fullScale > 0 ? p.fullScale : DEFAULT_FULL_SCALE)
    // A node without watts stands only when nothing flows at all: grey, as in the Flow.
    const colours = new Map(resolved.map((r) => [r.id, r.watts > 0 ? colourOf(byId.get(r.id), r, c) : c.idle]))
    // The bands first, each column one colour of its wave (decision 10), so
    // a device repaints a step as one stroke per column.
    for (const band of layout.bands) {
      const base = rgb(depth(colours.get(band.id) ?? c.text))
      const groundRgb = rgb(depth(ground))
      ctx.save()
      ctx.beginPath()
      band.polygon.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)))
      ctx.closePath()
      ctx.clip()
      const xs = band.polygon.map((pt) => pt.x), ys = band.polygon.map((pt) => pt.y)
      const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs))
      const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys))
      for (let x = x0; x < x1; x++) {
        ctx.fillStyle = hex(waveColour(base, groundRgb, x, motion.wave))
        ctx.fillRect(x, y0, 1, y1 - y0)
      }
      ctx.restore()
    }
    ctx.fillStyle = depth(c.bus)
    ctx.fillRect(layout.bus.x, layout.bus.y, layout.bus.width, layout.bus.height)
    for (const bar of layout.bars) {
      // Rounded outside, square towards the band (decision 8).
      ctx.fillStyle = depth(colours.get(bar.id) ?? c.text)
      const r = Math.min(3, bar.height / 2)
      ctx.beginPath()
      ctx.roundRect(bar.x, bar.y, bar.width, bar.height, bar.side === "left" ? [r, 0, 0, r] : [0, r, r, 0])
      ctx.fill()
    }
    const busNode = nodes.find((n) => n.role === "bus")
    if (busNode && layout.bars.length) {
      labels.push(...labelObjects({ ...busNode, lines: [] }, undefined, { x: layout.bus.x - 60, y: Math.max(0, layout.bus.y - Math.round(t.fontSize * 1.2) - 4), width: 120 + SANKEY_BAR_W, align: "center" }, t, c))
    }
    for (const slot of layout.slots) {
      const node = byId.get(slot.id)
      const r = resolved.find((x) => x.id === slot.id)
      if (!node || !r) continue
      const left = slot.side === "left"
      const iconSize = Math.round(t.fontSize * 1.2)
      const top = Math.round(slot.y + (slot.height - labelHeight(node, t)) / 2)
      const width = SANKEY_LABEL_W - 12 - iconSize - 6
      const x = left ? 0 : obj.width - SANKEY_LABEL_W + 12
      labels.push(...iconObject(node, left ? SANKEY_LABEL_W - 12 - iconSize / 2 : x + iconSize / 2, top + iconSize / 2, iconSize, depth(r.watts > 0 ? (colours.get(r.id) ?? c.text) : c.muted)))
      labels.push(...labelObjects(node, wattsOf(r), { x: left ? 0 : x + iconSize + 6, y: top, width, align: left ? "right" : "left" }, t, c))
    }
  } else {
    const layout = flowLayout(nodes, resolved)
    for (const line of layout.lines) {
      const r = resolved.find((x) => x.id === line.id)!
      ctx.strokeStyle = depth(line.live ? colourOf(byId.get(r.id), r, c) : c.idle)
      ctx.globalAlpha = line.live ? 0.5 : 1
      ctx.lineWidth = line.width
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(line.x0, line.y0)
      ctx.lineTo(line.x1, line.y1)
      ctx.stroke()
      ctx.globalAlpha = 1
      if (line.live) {
        ctx.fillStyle = depth(colourOf(byId.get(r.id), r, c))
        const dotR = Math.max(2.5, line.width / 2 + 0.5)
        for (const d of dotsOnLine(line, motion.dots[dotKey(obj.id, line.id)] ?? 0, r.gives)) {
          ctx.beginPath()
          ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.fillStyle = depth(c.bus)
    ctx.beginPath()
    ctx.arc(layout.bus.x, layout.bus.y, layout.bus.r, 0, Math.PI * 2)
    ctx.fill()
    const busNode = nodes.find((n) => n.role === "bus")
    if (busNode) labels.push(...labelObjects({ ...busNode, lines: [] }, undefined, { x: layout.bus.x + layout.bus.r + 8, y: layout.bus.y - Math.round(t.fontSize * 0.6), width: 120, align: "left" }, t, c))
    for (const fn of layout.nodes) {
      const node = byId.get(fn.id)!
      const r = resolved.find((x) => x.id === fn.id)!
      const colour = depth(fn.live ? colourOf(node, r, c) : c.idle)
      if (fn.ring) {
        ctx.lineWidth = 5
        ctx.strokeStyle = depth(c.idle)
        ctx.beginPath()
        ctx.arc(fn.x, fn.y, fn.ring.r, 0, Math.PI * 2)
        ctx.stroke()
        if (fn.ring.fraction > 0) {
          ctx.strokeStyle = depth(colourOf(node, r, c))
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.arc(fn.x, fn.y, fn.ring.r, -Math.PI / 2, -Math.PI / 2 + fn.ring.fraction * Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.fillStyle = depth(ground)
      ctx.strokeStyle = colour
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(fn.x, fn.y, fn.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      labels.push(...iconObject(node, fn.x, fn.y, Math.round(FLOW_NODE_R * 0.95), fn.live ? colour : depth(c.muted)))
      const width = 160
      const beside = fn.label.align === "start"
      // The core gives the name's baseline; a text object is placed by its top.
      const top = beside ? fn.y - FLOW_NODE_R : Math.max(fn.label.y - Math.round(t.fontSize * 0.8), fn.y + (fn.ring ? fn.ring.r + 4 : fn.r + 4))
      labels.push(...labelObjects(node, wattsOf(r), { x: beside ? fn.label.x : fn.label.x - width / 2, y: top, width, align: beside ? "left" : "center" }, t, c))
    }
  }
  renderScreenObjects(ctx, labels, { ...options, nested: true })
  ctx.restore()
}

/**
 * Every icon a diagram may draw, in every colour it may draw it in - what
 * has to be loaded before it can be drawn in one go (test-render's preload).
 */
export function everyEnergyIcon(obj: ScreenObject): ScreenObject[] {
  const p = obj.properties as Record<string, any>
  const c = look(p)
  const nodes: EnergyNode[] = Array.isArray(p.nodes) ? p.nodes : []
  return nodes.flatMap((n) =>
    [c.idle, c.muted, c.text, c.charge, c.discharge, (n as { color?: string }).color]
      .filter((colour): colour is string => !!colour)
      .flatMap((colour) => iconObject(n, 0, 0, 16, colour)),
  )
}
