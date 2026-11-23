/**
 * What every styled face is drawn with (docs/2026-11-23-instrument-
 * styles.md): a face is painted on a Canvas 2D context in its own 200-unit
 * box - the proposals' coordinates (artifact «Instrumentenkabinett») - and
 * scaled to the object; every position on the scale comes from
 * lib/instrument.ts.
 */
import { gaugeAngle, type InstrumentScale, type InstrumentStyle, type ZoneKind } from "@/lib/instrument"

export type Ctx = CanvasRenderingContext2D

/** A point at `r` and `deg` (0 = up, clockwise) about (cx, cy). */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

/** An arc path from deg0 to deg1 (clockwise when deg1 > deg0). */
export function arcPath(ctx: Ctx, cx: number, cy: number, r: number, deg0: number, deg1: number) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, ((deg0 - 90) * Math.PI) / 180, ((deg1 - 90) * Math.PI) / 180, deg1 < deg0)
}

export function disc(ctx: Ctx, cx: number, cy: number, r: number, fill: string | CanvasGradient) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/** A linear gradient across a box, stops as [offset, colour, alpha?]. */
export function linear(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string, number?][],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c, a] of stops) g.addColorStop(o, a === undefined ? c : withAlpha(c, a))
  return g
}

export function radial(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  stops: [number, string, number?][],
  fx = cx,
  fy = cy,
): CanvasGradient {
  const g = ctx.createRadialGradient(fx, fy, 0, cx, cy, r)
  for (const [o, c, a] of stops) g.addColorStop(o, a === undefined ? c : withAlpha(c, a))
  return g
}

export function withAlpha(hex: string, a: number): string {
  const v = parseInt(hex.replace("#", ""), 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`
}

/** Gauge ticks from the scale: radial strokes inward from `r`. */
export function gaugeTicks(
  ctx: Ctx,
  style: InstrumentStyle,
  scale: InstrumentScale,
  cx: number,
  cy: number,
  r: number,
  look: { major: { len: number; width: number }; minor: { len: number; width: number }; colour: string },
) {
  ctx.strokeStyle = look.colour
  ctx.lineCap = "butt"
  for (const t of scale.ticks) {
    const l = t.major ? look.major : look.minor
    const deg = gaugeAngle(style, t.at)
    const [x0, y0] = polar(cx, cy, r, deg)
    const [x1, y1] = polar(cx, cy, r - l.len, deg)
    ctx.lineWidth = l.width
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
}

/** Gauge labels from the scale, centred on a circle of radius `r`. */
export function gaugeLabels(
  ctx: Ctx,
  style: InstrumentStyle,
  scale: InstrumentScale,
  cx: number,
  cy: number,
  r: number,
  font: string,
  colour: string,
) {
  ctx.font = font
  ctx.fillStyle = colour
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = polar(cx, cy, r, gaugeAngle(style, l.at))
    ctx.fillText(l.text, x, y)
  }
}

/** Zones as arcs of width `width` centred on radius `r`, in the style's colours for each kind. */
export function gaugeZones(
  ctx: Ctx,
  style: InstrumentStyle,
  scale: InstrumentScale,
  cx: number,
  cy: number,
  r: number,
  width: number,
  colours: Record<ZoneKind, string>,
) {
  ctx.lineWidth = width
  ctx.lineCap = "butt"
  for (const z of scale.zones) {
    arcPath(ctx, cx, cy, r, gaugeAngle(style, z.from), gaugeAngle(style, z.to))
    ctx.strokeStyle = colours[z.kind]
    ctx.stroke()
  }
}

/** The glass's crescent of light over the top of a round face of radius `r`. */
export function glassCrescent(ctx: Ctx, cx: number, cy: number, r: number, opacity: number) {
  const y = cy - r * 0.5
  const dx = r * 0.866
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.beginPath()
  ctx.moveTo(cx - dx, y)
  ctx.arc(cx, cy, r, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180)
  // Back along a flatter arc of radius 1.7 r below: the crescent's lower edge.
  const R = r * 1.7
  const ccy = y + Math.sqrt(R * R - dx * dx)
  ctx.arc(cx, ccy, R, Math.atan2(y - ccy, dx), Math.atan2(y - ccy, -dx), true)
  ctx.closePath()
  ctx.fillStyle = linear(ctx, 0, cy - r, 0, y, [
    [0, "#ffffff", 0.3],
    [1, "#ffffff", 0],
  ])
  ctx.fill()
  ctx.restore()
}

/**
 * Settles the baked face into what a device shows: a pixel the face only
 * partly covers is mixed into the screen's colour `ground` (as a ring's
 * edges are, render-arc-level.ts), then every pixel drops to what an RGB565
 * framebuffer holds - the low bits thrown away, as rgb565FromBytes() does -
 * and back to 8 bits as fromRgb565() expands them. Pixels the face does not
 * touch at all stay transparent, so a background image shows in the corners.
 */
export function settle565(ctx: Ctx, width: number, height: number, ground: { r: number; g: number; b: number }) {
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    // Canvas image data is not premultiplied: mix by alpha into the ground.
    const mix = (c: number, g: number) => Math.floor((c * a + g * (255 - a) + 127) / 255)
    const r = mix(d[i], ground.r) >> 3
    const g = mix(d[i + 1], ground.g) >> 2
    const b = mix(d[i + 2], ground.b) >> 3
    d[i] = (r << 3) | (r >> 2)
    d[i + 1] = (g << 2) | (g >> 4)
    d[i + 2] = (b << 3) | (b >> 2)
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export { barFrame, type BarFrame, type BarDirection } from "@/lib/instrument"

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
