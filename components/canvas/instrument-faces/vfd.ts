/**
 * The vacuum fluorescent display (1985 digital cockpit): glowing segments
 * behind smoked glass, the unlit ones faintly visible, a fine mesh, the
 * value in digits. From the proposal's vfdG()/vfdB() (artifact
 * «Instrumentenkabinett»). The lit segments are lib/instrument-needles.ts's,
 * the digits lib/instrument-readout.ts's; the face holds what never changes.
 */
import { gaugeAngle, type InstrumentProps, type InstrumentScale, type ZoneKind } from "@/lib/instrument"
import { disc, fitFaceLine, gaugeLabels, linear, polar, radial, roundRect, withAlpha, type BarFrame, type Ctx } from "./common"

export const VFD_CYAN = "#3df5d0"
/** Segments inside a zone light in its colour. */
export const VFD_ZONE: Record<ZoneKind, string> = { danger: "#ff6a5a", warning: "#ffb347", ok: VFD_CYAN }
const MONO = (px: number) => `400 ${px}px "Schaltli Share Tech Mono", monospace`
export const VFD_FONT = MONO

/** The gauge's ring of segments (200-unit box): count, inner and outer radius, the gap at each side (degrees). */
export const VFD_GAUGE_SEGMENTS = { n: 32, r0: 66, r1: 84, gap: 1 }
/** The bar's segments: count, and how far across the bar the shortest and longest reach from the base. */
export const VFD_BAR_SEGMENTS = { n: 30, base: 0.764, short: 0.127, long: 0.4 }

/** The colour of the segment whose middle lies at `at`. */
export function vfdSegmentColour(scale: { zones: { from: number; to: number; kind: ZoneKind }[] }, at: number): string {
  for (const z of scale.zones) if (at >= z.from && at <= z.to) return VFD_ZONE[z.kind]
  return VFD_CYAN
}

/** One segment of the gauge ring as a polygon in the 200-unit box. */
export function vfdGaugeSegment(i: number): [number, number][] {
  const { n, r0, r1, gap } = VFD_GAUGE_SEGMENTS
  const a0 = gaugeAngle("vfd", 0)
  const step = (gaugeAngle("vfd", 1) - a0) / n
  const s = a0 + i * step + gap
  const e = a0 + (i + 1) * step - gap
  return [polar(100, 100, r1, s), polar(100, 100, r1, e), polar(100, 100, r0, e), polar(100, 100, r0, s)]
}

/** One segment of the bar as the four corners of its rectangle, in the object's pixels. */
export function vfdBarSegment(f: BarFrame, i: number): [number, number, number, number] {
  const { n, base, short, long } = VFD_BAR_SEGMENTS
  const reach = short + ((long - short) * i) / (n - 1)
  const w = 1 / n
  // A sliver of gap each side, as the proposal's 1-unit gaps in 7.3-unit cells.
  const [ax, ay] = f.point(i * w + w * 0.14, base - reach)
  const [bx, by] = f.point((i + 1) * w - w * 0.14, base)
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}

function mesh(ctx: Ctx, x: number, y: number, w: number, h: number, cell: number, lineWidth: number) {
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = "#000000"
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  for (let gx = x; gx <= x + w; gx += cell) {
    ctx.moveTo(gx, y)
    ctx.lineTo(gx, y + h)
  }
  for (let gy = y; gy <= y + h; gy += cell) {
    ctx.moveTo(x, gy)
    ctx.lineTo(x + w, gy)
  }
  ctx.stroke()
  ctx.restore()
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintVfdGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  ctx.fillStyle = "#1b1d1d"
  roundRect(ctx, 3, 3, 194, 194, 28)
  ctx.fill()
  ctx.fillStyle = radial(ctx, 100, 82.2, 124.6, [[0, "#0d1715"], [1, "#030605"]])
  roundRect(ctx, 11, 11, 178, 178, 21)
  ctx.fill()

  // The unlit segments, faintly there.
  for (let i = 0; i < VFD_GAUGE_SEGMENTS.n; i++) {
    const pts = vfdGaugeSegment(i)
    ctx.beginPath()
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = withAlpha(vfdSegmentColour(scale, (i + 0.5) / VFD_GAUGE_SEGMENTS.n), 0.09)
    ctx.fill()
  }
  ctx.strokeStyle = withAlpha(VFD_CYAN, 0.22)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(100, 100, 60, 0, Math.PI * 2)
  ctx.stroke()
  const labelFont = MONO(scale.labels.length <= 6 ? 8 : 7)
  gaugeLabels(ctx, "vfd", scale, 100, 100, 52, labelFont, withAlpha(VFD_CYAN, 0.7))
  // Inside the ring at r 60.
  const room = { style: "vfd" as const, scale, labelR: 52, labelFont, faceR: 60 }

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  if (props.caption) {
    ctx.fillStyle = withAlpha(VFD_CYAN, 0.85)
    fitFaceLine(ctx, props.caption.toUpperCase(), 75, MONO, 8, 3, room)
  }
  if (props.unit) {
    ctx.fillStyle = VFD_CYAN
    fitFaceLine(ctx, props.unit, 127, MONO, 12, 0, room)
  }
  mesh(ctx, 11, 11, 178, 178, 3, 0.5)
  ctx.fillStyle = linear(ctx, 11, 11, 189, 189, [
    [0, "#ffffff", 0.1],
    [1, "#ffffff", 0],
  ])
  roundRect(ctx, 11, 11, 178, 178, 21)
  ctx.fill()
  void disc
}

/** The gauge's readout box (200-unit box): right edge, middle, font size. */
export const VFD_GAUGE_READOUT = { x: 133, y: 101, px: 34, glow: 1.8 }

/** The VFD as a bar: rising segments, the readout over the start. Drawn at the object's own pixels. */
export function paintVfdBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = "#1b1d1d"
  roundRect(ctx, 0, 0, width, height, T * 0.127)
  ctx.fill()
  const inset = T * 0.055
  ctx.fillStyle = "#050a09"
  roundRect(ctx, inset, inset, width - 2 * inset, height - 2 * inset, T * 0.09)
  ctx.fill()

  for (let i = 0; i < VFD_BAR_SEGMENTS.n; i++) {
    const [x0, y0, x1, y1] = vfdBarSegment(f, i)
    ctx.fillStyle = withAlpha(vfdSegmentColour(scale, (i + 0.5) / VFD_BAR_SEGMENTS.n), 0.09)
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
  }
  ctx.font = MONO(Math.max(6, T * 0.064))
  ctx.fillStyle = withAlpha(VFD_CYAN, 0.6)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.855)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.unit, props.caption?.toUpperCase()].filter(Boolean).join("  ")
  if (words) {
    const r = vfdBarReadout(f, width)
    ctx.save()
    ctx.font = MONO(Math.max(6, T * 0.091))
    ctx.fillStyle = VFD_CYAN
    ctx.textBaseline = "middle"
    if (f.vertical) {
      ctx.translate(width / 2, height - inset - T * 0.12)
      ctx.textAlign = "center"
      ctx.fillText(words, 0, 0)
    } else {
      ctx.textAlign = "left"
      ctx.fillText(words, r.x + T * 0.045, r.y + T * 0.018)
    }
    ctx.restore()
  }
  mesh(ctx, inset, inset, width - 2 * inset, height - 2 * inset, T * 0.027, Math.max(0.5, T * 0.0045))
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [
    [0, "#ffffff", 0.1],
    [1, "#ffffff", 0],
  ])
  roundRect(ctx, inset, inset, width - 2 * inset, height - 2 * inset, T * 0.09)
  ctx.fill()
}

/** The bar's readout box in pixels: right edge (or middle, standing) and the text's middle line, font size. */
export function vfdBarReadout(f: BarFrame, width: number): { x: number; y: number; px: number; align: "right" | "center"; glow: number } {
  const T = f.thickness
  if (f.vertical) return { x: width / 2, y: f.length * 0.065, px: T * 0.18, align: "center", glow: T * 0.0145 }
  return { x: T * 0.69, y: T * 0.245, px: T * 0.182, align: "right", glow: T * 0.0145 }
}
