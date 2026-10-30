// A chart's shapes as fills (tasks/charts-firmware-plan.md F4): every
// outline in eighths of a pixel, its colour and how much of it, in drawing
// order - what the designer and a board fill with the same polygon raster
// (lib/polygon-raster.ts ↔ firmware PolygonRaster) into RGB565 pixels over
// the screen's ground, as the energy diagram's shapes are. Texts are not
// here: they are Text objects on both sides (ChartLayout.texts). Pure, and
// ported to the firmware's ChartShapes, held to the vectors.

import type { Box, ChartLayout, Fade } from "@/lib/chart-layout"
import { toEighths, type Point8 } from "@/lib/polygon-raster"

export interface Fill {
  points: Point8[]
  /** "#rrggbb". */
  colour: string
  /** Of 256. */
  alpha: number
  /** Drawn only inside it (the plot, for what a fixed axis cuts off). */
  clip?: Box
  /** Instead of `alpha`, an alpha by row: fadeAlpha(fade, y) for the pixel row y. */
  fade?: Fade
}

/**
 * A fading fill's alpha on pixel row y (2026-10-30, the artifact's
 * gradients): a0 at y0, a1 at y1, straight between, held beyond either.
 */
export function fadeAlpha(f: Fade, y: number): number {
  if (f.y1 === f.y0) return f.a1
  const t = Math.min(1, Math.max(0, (y + 0.5 - f.y0) / (f.y1 - f.y0)))
  return Math.round(f.a0 + (f.a1 - f.a0) * t)
}

export interface ShapeLook {
  grid: string
  /** The device's depth: on grey and 1 bit, rectangles are hatched and lines dashed. */
  grey: boolean
  /**
   * The NowPoint's pulse (docs/2026-10-16-charts.md decisions 9 and 13), its
   * phase 0..1: a ring widening from the point and fading. Only a display
   * that animates has one; without it the point stands still.
   */
  pulse?: number
  /**
   * The chart's now colour: the line at now, and a stack's NowPoint
   * (2026-10-30, the user: «die rote Jetzt-Linie fehlt»). None, no line.
   */
  now?: string
}

/** How much of the now colour the line at now is, of 256 - the artifact's 0.35. */
export const NOW_LINE_ALPHA = 90

/** One pulse lasts this long, in ms. */
export const PULSE_MS = 1800

/**
 * The pulse's ring at a phase: its radius and how much of its colour. Made
 * stronger on 2026-10-30 (the user: «zu dezent»): from 5 to 22 px, from
 * 220 of 256, 3 px wide; it was 4 to 16, 141, 2.
 */
export function pulseRing(phase: number): { r: number; alpha: number } {
  return { r: 5 + 17 * phase, alpha: Math.round(220 * (1 - phase)) }
}

/** How wide the pulse's ring is, in px. */
export const PULSE_WIDTH = 3

/** The NowPoint's radius, in px. */
export const NOW_POINT_R = 5

const DASHES: number[][] = [[], [6, 4], [2, 3], [8, 3, 2, 3]]
const HATCH_GAP = 5

const pt = (x: number, y: number): Point8 => ({ x: toEighths(x), y: toEighths(y) })

function rect(x: number, y: number, w: number, h: number): Point8[] {
  return [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)]
}

/** A segment as a quad `width` px wide. */
function quad(x1: number, y1: number, x2: number, y2: number, width: number): Point8[] | null {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return null
  const nx = (-dy / len) * (width / 2)
  const ny = (dx / len) * (width / 2)
  return [pt(x1 + nx, y1 + ny), pt(x2 + nx, y2 + ny), pt(x2 - nx, y2 - ny), pt(x1 - nx, y1 - ny)]
}

/** A circle as a 16-gon. */
function disc(cx: number, cy: number, r: number): Point8[] {
  const out: Point8[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8
    out.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
  return out
}

/** A polyline as quads `width` px wide (2 unless said), dashed by `pattern` where it has one. */
function polyline(points: [number, number][], pattern: number[], width = 2): Point8[][] {
  const out: Point8[][] = []
  if (pattern.length === 0) {
    for (let i = 1; i < points.length; i++) {
      const q = quad(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width)
      if (q) out.push(q)
    }
    return out
  }
  // Along the line: on for pattern[0], off for pattern[1], …, carried over corners.
  let k = 0
  let left = pattern[0]
  for (let i = 1; i < points.length; i++) {
    let [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    let len = Math.hypot(x2 - x1, y2 - y1)
    const ux = len === 0 ? 0 : (x2 - x1) / len
    const uy = len === 0 ? 0 : (y2 - y1) / len
    while (len > 0) {
      const take = Math.min(left, len)
      const xe = x1 + ux * take
      const ye = y1 + uy * take
      if (k % 2 === 0) {
        const q = quad(x1, y1, xe, ye, 2)
        if (q) out.push(q)
      }
      x1 = xe
      y1 = ye
      len -= take
      left -= take
      if (left <= 1e-9) {
        k = (k + 1) % pattern.length
        left = pattern[k]
      }
    }
  }
  return out
}

/** A segment clipped to a box (Liang–Barsky); null where nothing is left. */
function clipped(x1: number, y1: number, x2: number, y2: number, b: Box): [number, number, number, number] | null {
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const edges: [number, number][] = [
    [-dx, x1 - b.x],
    [dx, b.x + b.w - x1],
    [-dy, y1 - b.y],
    [dy, b.y + b.h - y1],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return null
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy]
}

/** A rectangle hatched: one of four kinds by the series' place, lines 1 px wide. */
function hatched(b: Box, pattern: number): Point8[][] {
  const out: Point8[][] = []
  const kind = pattern % 4
  if (kind === 2) {
    for (let y = b.y; y < b.y + b.h; y += HATCH_GAP) out.push(rect(b.x, y, b.w, Math.min(1, b.y + b.h - y)))
    return out
  }
  for (let d = -b.h; d <= b.w + b.h; d += HATCH_GAP) {
    const lines: [number, number, number, number][] = []
    if (kind === 0 || kind === 3) lines.push([b.x + d, b.y + b.h, b.x + d + b.h, b.y])
    if (kind === 1 || kind === 3) lines.push([b.x + d, b.y, b.x + d + b.h, b.y + b.h])
    for (const [x1, y1, x2, y2] of lines) {
      const c = clipped(x1, y1, x2, y2, b)
      const q = c ? quad(c[0], c[1], c[2], c[3], 1) : null
      if (q) out.push(q)
    }
  }
  return out
}

/** A rectangle's frame, 1 px inside it. */
function frame(b: Box): Point8[][] {
  return [rect(b.x, b.y, b.w, 1), rect(b.x, b.y + b.h - 1, b.w, 1), rect(b.x, b.y, 1, b.h), rect(b.x + b.w - 1, b.y, 1, b.h)]
}

/**
 * The fills of a chart, in the order they are drawn: zones, grid, then per
 * series its ranges, areas, bands and bars, starts and lines (clipped to the
 * plot), then marks and the NowPoint, then the legend's swatches.
 */
export function chartShapes(l: ChartLayout, look: ShapeLook): Fill[] {
  const out: Fill[] = []
  const { plot } = l
  const add = (points: Point8[], colour: string, alpha = 256, clip?: Box, fade?: Fade) =>
    out.push({ points, colour, alpha, ...(clip ? { clip } : {}), ...(fade ? { fade } : {}) })

  for (const z of l.zones) {
    if (look.grey) for (const h of hatched(z, 2)) add(h, z.color)
    else add(rect(z.x, z.y, z.w, z.h), z.color, 46)
  }
  for (const t of l.left.ticks) add(rect(plot.x, Math.round(t.y), plot.w, 1), look.grid)
  for (const m of l.midnights) add(rect(Math.round(m.x) - 1, plot.y, 2, plot.h), look.grid)

  for (const s of l.series) {
    for (const r of s.ranges) add(r.map(([x, y]) => pt(x, y)), s.color, 38, plot)
    s.areas.forEach((a, k) => add(a.map(([x, y]) => pt(x, y)), s.color, s.draw === "stacked" ? 154 : 77, plot, s.areaFades[k]))
    for (const b of [...s.bands, ...s.bars]) {
      if (look.grey) {
        for (const h of hatched(b, s.pattern)) add(h, s.color, 256, plot)
        for (const f of frame(b)) add(f, s.color, 256, plot)
      } else add(rect(b.x, b.y, b.w, b.h), s.color, 256, plot)
    }
    for (const x of s.starts) {
      const top = (s.bands[0]?.y ?? plot.y + plot.h) - 2
      add([pt(x - 4, top - 6), pt(x + 4, top - 6), pt(x, top)], s.color, 256, plot)
    }
    const dash = look.grey ? DASHES[s.pattern % DASHES.length] : []
    for (const line of s.lines) for (const q of polyline(line, dash)) add(q, s.color, 256, plot)
  }
  // The line at now, over the curves and under the NowPoints.
  if (look.now && l.now && "x" in l.now) add(rect(Math.round(l.now.x), plot.y, 1, plot.h), look.now, NOW_LINE_ALPHA, plot)
  for (const s of l.series) {
    const colour = s.nowOnStack && look.now ? look.now : s.color
    for (const m of s.marks) add(disc(m.x, m.y, 3), s.color)
    if (s.nowPoint && look.pulse !== undefined) {
      const { r, alpha } = pulseRing(look.pulse)
      const ring: [number, number][] = []
      for (let i = 0; i <= 16; i++) ring.push([s.nowPoint[0] + r * Math.cos((i * Math.PI) / 8), s.nowPoint[1] + r * Math.sin((i * Math.PI) / 8)])
      if (alpha > 0) for (const q of polyline(ring, [], PULSE_WIDTH)) add(q, colour, alpha)
    }
    if (s.nowPoint) add(disc(s.nowPoint[0], s.nowPoint[1], NOW_POINT_R), colour)
  }
  for (const row of l.legend) add(rect(row.swatch.x, row.swatch.y, row.swatch.w, row.swatch.h), row.color)
  return out
}
