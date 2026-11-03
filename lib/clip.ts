/**
 * Clipping to a free area's shape (docs/2026-11-03-card-clip.md).
 *
 * A free area with Clip on cuts what it holds to the pixels its box fills
 * inside its edge: Adafruit GFX's fillRoundRect, the integer midpoint circle
 * every device draws the box with and render-box.ts mirrors. No
 * anti-aliasing - the box has none, so a clipped heading meets the card's
 * corner pixel for pixel. On export each object the area holds gets
 * `properties.clip`, the shapes it is clipped by, outermost first, in the
 * object's own coordinate space (device contract §2.1).
 */

import type { ScreenObject } from "@/components/project-editor"

/** The device feature (DDF `supportedFeatures`) that draws `clip`. */
export const CLIP_FEATURE = "clip"

export interface ClipShape {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

/**
 * The row spans of a rounded rectangle `w` × `h` with radius `r`, as
 * Adafruit_GFX::fillRoundRect fills it: for each row from the top, the
 * columns [start, end) it covers, relative to its left edge. The radius is
 * clamped as the library does (to half the shorter side). Rows it does not
 * cover are [0, 0).
 */
export function roundRectSpans(w: number, h: number, r: number): Array<[number, number]> {
  w = Math.trunc(w)
  h = Math.trunc(h)
  if (w <= 0 || h <= 0) return []
  const maxRadius = Math.floor(Math.min(w, h) / 2)
  r = Math.max(0, Math.min(maxRadius, Math.trunc(r)))
  const lo = new Array<number>(h).fill(w)
  const hi = new Array<number>(h).fill(-1)
  const column = (x: number, y: number, height: number) => {
    for (let row = Math.max(0, y); row < Math.min(h, y + height); row++) {
      if (x < lo[row]) lo[row] = x
      if (x > hi[row]) hi[row] = x
    }
  }
  // fillRect(x + r, y, w - 2r, h): its first and last column bound each row.
  if (w - 2 * r > 0) {
    column(r, 0, h)
    column(w - r - 1, 0, h)
  }
  // fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2r - 1) and (x + r, y + r, r, 2, ...).
  const helper = (x0: number, y0: number, corners: number, deltaIn: number) => {
    let f = 1 - r
    let ddFx = 1
    let ddFy = -2 * r
    let x = 0
    let y = r
    let px = x
    let py = y
    const delta = deltaIn + 1
    while (x < y) {
      if (f >= 0) {
        y--
        ddFy += 2
        f += ddFy
      }
      x++
      ddFx += 2
      f += ddFx
      if (x < y + 1) {
        if (corners & 1) column(x0 + x, y0 - y, 2 * y + delta)
        if (corners & 2) column(x0 - x, y0 - y, 2 * y + delta)
      }
      if (y !== py) {
        if (corners & 1) column(x0 + py, y0 - px, 2 * px + delta)
        if (corners & 2) column(x0 - py, y0 - px, 2 * px + delta)
        py = y
      }
      px = x
    }
  }
  if (r > 0) {
    helper(w - r - 1, r, 1, h - 2 * r - 1)
    helper(r, r, 2, h - 2 * r - 1)
  }
  return lo.map((start, row) => (hi[row] < 0 ? [0, 0] : [start, hi[row] + 1]))
}

/** Whether a pixel at (px, py) is inside `shape` (in the same space). */
export function insideShape(shape: ClipShape, px: number, py: number, spans = roundRectSpans(shape.width, shape.height, shape.radius)): boolean {
  const row = py - shape.y
  if (row < 0 || row >= spans.length) return false
  const col = px - shape.x
  return col >= spans[row][0] && col < spans[row][1]
}

/** Whether a free area clips what it holds: Clip as set, else on for a card (a Look). */
export function clipsContents(area: ScreenObject): boolean {
  if (area.type !== "free") return false
  const set = area.properties?.clipContents
  if (typeof set === "boolean") return set
  return area.properties?.look === "card" || area.properties?.look === "card-accent"
}

/**
 * The shape a free area clips to, in the space it stands in: its box inside
 * its edge - the edge always shows.
 */
export function areaShape(area: ScreenObject): ClipShape {
  const p = area.properties ?? {}
  const stroke = Number(p.strokeWidth) || 0
  const edge = stroke > 0 && p.strokeColor !== "transparent" ? stroke : 0
  return {
    x: area.x + edge,
    y: area.y + edge,
    width: Math.max(0, area.width - 2 * edge),
    height: Math.max(0, area.height - 2 * edge),
    radius: Math.max(0, (Number(p.cornerRadius) || 0) - edge),
  }
}

/** The shapes an object is clipped by, as export wrote them; none for most. */
export function clipsOf(obj: ScreenObject): ClipShape[] {
  const c = obj.properties?.clip
  return Array.isArray(c) ? (c as ClipShape[]) : []
}

/**
 * What a project needs of a device to clip: the feature, named by the areas
 * that clip something - or null where none does.
 */
export function clipFeature(project: { screens?: Array<{ name?: string; objects?: ScreenObject[] }> }): { feature: string; label: string } | null {
  let count = 0
  const walk = (objects: ScreenObject[] | undefined) => {
    for (const o of objects ?? []) {
      if (clipsContents(o) && (o.children?.length ?? 0) > 0) count++
      walk(o.children)
    }
  }
  for (const screen of project.screens ?? []) walk(screen.objects)
  return count > 0 ? { feature: CLIP_FEATURE, label: `cards that clip what they hold (${count})` } : null
}

/**
 * A canvas clipped to `shape` (in the canvas's current space), row by row as
 * the spans say: one path of one-pixel rows, so at whole pixels it is exactly
 * the device's set. The caller saves and restores the context around it.
 */
export function clipCanvasTo(ctx: CanvasRenderingContext2D, shape: ClipShape): void {
  const spans = roundRectSpans(shape.width, shape.height, shape.radius)
  ctx.beginPath()
  spans.forEach(([start, end], row) => {
    if (end > start) ctx.rect(shape.x + start, shape.y + row, end - start, 1)
  })
  ctx.clip()
}
