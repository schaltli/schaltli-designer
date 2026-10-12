// The energy diagram on a canvas (docs/2026-10-11-energy-diagram.md): the
// editor, the preview, the thumbnails and test-render all draw it here.
// Every place and size comes from lib/energy-diagram.ts; this file only
// paints them. A node's name and lines are text objects, its icon an icon
// object, drawn by their own renderers - so live text, rules, fonts and
// tinted icons are exactly a text's and an icon's.

import type { ScreenObject } from "@/components/project-editor"
import {
  DEFAULT_FULL_SCALE,
  advanceDots,
  advanceWave,
  arcOutline,
  bandOutline,
  barOutline,
  capsuleOutline,
  discOutline,
  DOT_R,
  expand565,
  mix565,
  pack565,
  rectOutline,
  rgb565,
  ringOutline,
  dotsOnLine,
  flowBoxes,
  flowLayout,
  nodeAtTap,
  rowStep,
  sankeyBoxes,
  resolveEnergy,
  sankeyLayout,
  waveColour,
  withWatts,
  type Box,
  type EnergyDiagramProperties,
  type EnergyNode,
  type EnergyValue,
  type ResolvedNode,
} from "@/lib/energy-diagram"
import { diagramColours } from "@/lib/energy-diagram-object"
import { renderScreenObjects, type RenderScreenObjectsOptions } from "@/lib/render-screen"
import { applyColorDepth } from "@/lib/color-depth"
import { fillPolygon, type Point8 } from "@/lib/polygon-raster"

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
  const id = nodeAtTap(p.mode, nodes, resolveEnergy(nodes, energyValues(nodes, value)), { width: obj.width, height: obj.height }, p.fullScale > 0 ? p.fullScale : DEFAULT_FULL_SCALE, at.x - obj.x, at.y - obj.y)
  return id === undefined ? undefined : nodes.find((n) => n.id === id)
}

/** Every diagram on a screen, at any depth. */
export function energyDiagramsIn(objects: readonly ScreenObject[]): ScreenObject[] {
  return objects.flatMap((o) => [...(o.type === "energy-diagram" ? [o] : []), ...energyDiagramsIn(o.children ?? [])])
}

const look = diagramColours

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

/** A node's colour: the storage's by its sign, a 0 W node grey in the Flow. */
function colourOf(node: EnergyNode | undefined, r: ResolvedNode, c: ReturnType<typeof look>): string {
  if (r.role === "storage") return r.gives ? c.discharge : c.charge
  // Unthemed (a test's reference render), a colour of its own still counts.
  const own = node?.colorRole && /^#[0-9a-f]{6}$/i.test(node.colorRole) ? node.colorRole : undefined
  return (node as { color?: string } | undefined)?.color ?? own ?? c.text
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
    y += rowStep(size)
  }
  // A name as a text: braces doubled, so it is never read as a placeholder.
  line("name", (name ?? node.name).replace(/\{/g, "{{").replace(/\}/g, "}}"), undefined, t.fontId, t.fontSize, c.muted)
  ;(node.lines ?? []).slice(0, 3).forEach((l, i) => {
    const first = i === 0
    line(`line${i}`, withWatts(l.text, watts), l.liveValues, first ? t.valueFontId : t.fontId, first ? t.valueFontSize : t.fontSize, first ? c.text : c.muted)
  })
  return out
}

function iconObject(node: EnergyNode, box: Box, colour: string): ScreenObject[] {
  if (!node.iconAssetId) return []
  return [
    {
      id: `${node.id}-icon`,
      type: "icon",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      zIndex: 2,
      properties: { assetId: node.iconAssetId, iconColor: colour, backgroundColor: "transparent" },
    } as ScreenObject,
  ]
}

/**
 * The diagram's shapes as a board draws them: RGB565 pixels of the
 * diagram's own size, each shape an outline from the core filled by the
 * firmware's rules (lib/polygon-raster.ts), mixed in whole numbers. A pixel
 * no shape has touched yet takes the screen's ground as what it mixes into,
 * on a board as here; one never touched stays clear.
 */
class DiagramPixels {
  private readonly data: Uint16Array
  private readonly touched: Uint8Array

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly ground: number,
  ) {
    this.data = new Uint16Array(Math.max(0, width * height))
    this.touched = new Uint8Array(Math.max(0, width * height))
  }

  /** `colour` at (x, y) with weight w of 256. */
  put(x: number, y: number, colour: number, w: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = y * this.width + x
    this.data[i] = mix565(this.touched[i] ? this.data[i] : this.ground, colour, w)
    this.touched[i] = 1
  }

  /** An outline filled in `colour` at `alpha` of 256 (a live Flow line: 128). */
  fill(outline: Point8[], colour: number, alpha = 256): void {
    fillPolygon(outline, 0, this.height - 1, {
      fullRun: (y, x0, x1) => {
        for (let x = x0; x <= x1; x++) this.put(x, y, colour, alpha)
      },
      partial: (y, x, coverage) => this.put(x, y, colour, (coverage * alpha) / 16),
    })
  }

  /** Onto the canvas at the diagram's place (the context is already there). */
  drawOn(ctx: CanvasRenderingContext2D): void {
    if (this.width <= 0 || this.height <= 0 || typeof document === "undefined") return
    const off = document.createElement("canvas")
    off.width = this.width
    off.height = this.height
    const octx = off.getContext("2d")
    if (!octx) return
    const img = octx.createImageData(this.width, this.height)
    for (let i = 0; i < this.data.length; i++) {
      if (!this.touched[i]) continue
      const [r, g, b] = expand565(this.data[i])
      img.data[i * 4] = r
      img.data[i * 4 + 1] = g
      img.data[i * 4 + 2] = b
      img.data[i * 4 + 3] = 255
    }
    octx.putImageData(img, 0, 0)
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0)
    ctx.restore()
  }
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

  // Every shape into a picture of the diagram's own, pixel by pixel in
  // RGB565 as a board's canvas holds it (energy-firmware, 2026-10-12): an
  // outline from the core, filled by the firmware's rules. A pixel the
  // diagram touches first mixes into the screen's ground.
  const px = new DiagramPixels(obj.width, obj.height, rgb565(depth(ground)))
  const groundRgb = expand565(rgb565(depth(ground)))

  if (p.mode === "sankey") {
    const layout = sankeyLayout(resolved, { width: obj.width, height: obj.height }, p.fullScale > 0 ? p.fullScale : DEFAULT_FULL_SCALE)
    // A node without watts stands only when nothing flows at all: grey, as in the Flow.
    const colours = new Map(resolved.map((r) => [r.id, r.watts > 0 ? colourOf(byId.get(r.id), r, c) : c.idle]))
    // The bands first, each column one colour of its wave (decision 10), so
    // a device repaints a step as one stroke per column.
    for (const band of layout.bands) {
      const base = expand565(rgb565(depth(colours.get(band.id) ?? c.text)))
      const column = (x: number) => {
        const [r, g, b] = waveColour(base, groundRgb, x, motion.wave)
        return pack565(r, g, b)
      }
      fillPolygon(bandOutline(band), 0, obj.height - 1, {
        fullRun: (y, x0, x1) => {
          for (let x = x0; x <= x1; x++) px.put(x, y, column(x), 256)
        },
        partial: (y, x, coverage) => px.put(x, y, column(x), coverage * 16),
      })
    }
    px.fill(rectOutline(layout.bus.x, layout.bus.y, layout.bus.width, layout.bus.height), rgb565(depth(c.bus)))
    for (const bar of layout.bars) {
      // Rounded outside, square towards the band (decision 8).
      const r = Math.min(3, bar.height / 2)
      px.fill(barOutline(bar.x, bar.y, bar.width, bar.height, r, bar.side === "left"), rgb565(depth(colours.get(bar.id) ?? c.text)))
    }
    px.drawOn(ctx)
    const boxes = sankeyBoxes(layout, nodes, { width: obj.width, height: obj.height }, t)
    const busNode = nodes.find((n) => n.role === "bus")
    if (busNode && boxes.bus) labels.push(...labelObjects({ ...busNode, lines: [] }, undefined, boxes.bus, t, c))
    for (const b of boxes.nodes) {
      const node = byId.get(b.id)
      const r = resolved.find((x) => x.id === b.id)
      if (!node || !r) continue
      labels.push(...iconObject(node, b.icon, depth(r.watts > 0 ? (colours.get(r.id) ?? c.text) : c.muted)))
      labels.push(...labelObjects(node, wattsOf(r), b.label, t, c))
    }
  } else {
    const layout = flowLayout(nodes, resolved)
    for (const line of layout.lines) {
      const r = resolved.find((x) => x.id === line.id)!
      const colour = rgb565(depth(line.live ? colourOf(byId.get(r.id), r, c) : c.idle))
      // A live line at half strength, under its dots.
      px.fill(capsuleOutline(line.x0, line.y0, line.x1, line.y1, line.width), colour, line.live ? 128 : 256)
      if (!line.live) continue
      for (const d of dotsOnLine(line, motion.dots[dotKey(obj.id, line.id)] ?? 0, r.gives, r.watts)) px.fill(discOutline(d.x, d.y, DOT_R), colour)
    }
    px.fill(discOutline(layout.bus.x, layout.bus.y, layout.bus.r), rgb565(depth(c.bus)))
    for (const fn of layout.nodes) {
      const node = byId.get(fn.id)!
      const r = resolved.find((x) => x.id === fn.id)!
      const colour = depth(fn.live ? colourOf(node, r, c) : c.idle)
      if (fn.ring) {
        px.fill(ringOutline(fn.x, fn.y, fn.ring.r + 2.5, fn.ring.r - 2.5), rgb565(depth(c.idle)))
        const sweep = Math.round(fn.ring.fraction * 360)
        if (sweep > 0) px.fill(arcOutline(fn.x, fn.y, fn.ring.r, 5, sweep), rgb565(depth(colourOf(node, r, c))))
      }
      // The circle: a ring 3 px wide round the ground.
      px.fill(discOutline(fn.x, fn.y, fn.r + 1.5), rgb565(colour))
      px.fill(discOutline(fn.x, fn.y, fn.r - 1.5), rgb565(depth(ground)))
    }
    px.drawOn(ctx)
    const boxes = flowBoxes(layout, t)
    const busNode = nodes.find((n) => n.role === "bus")
    if (busNode && boxes.bus) labels.push(...labelObjects({ ...busNode, lines: [] }, undefined, boxes.bus, t, c))
    layout.nodes.forEach((fn, i) => {
      const b = boxes.nodes[i]
      const node = byId.get(fn.id)!
      const r = resolved.find((x) => x.id === fn.id)!
      const colour = depth(fn.live ? colourOf(node, r, c) : c.idle)
      labels.push(...iconObject(node, b.icon, fn.live ? colour : depth(c.muted)))
      labels.push(...labelObjects(node, wattsOf(r), b.label, t, c))
    })
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
      .flatMap((colour) => iconObject(n, { x: -8, y: -8, width: 16, height: 16 }, colour)),
  )
}
