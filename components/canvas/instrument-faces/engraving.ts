/**
 * The engraving (today, for e-paper): black on paper only, hatching instead
 * of colour and gradient, copperplate numerals, a half-inked needle. From the
 * proposal's inkG()/inkB() (artifact «Instrumentenkabinett»). The needle and
 * the bar's hatched fill are lib/instrument-needles.ts's.
 */
import { gaugeAngle, type InstrumentProps, type InstrumentScale } from "@/lib/instrument"
import { disc, fitFaceLine, gaugeLabels, gaugeTicks, polar, type BarFrame, type Ctx } from "./common"

export const PAPER = "#f3f1ea"
export const INK = "#111111"
const FELL = (px: number, italic = false) => `${italic ? "italic " : ""}400 ${px}px "Schaltli IM Fell English", serif`

/** Hatching at 45°, lines `period` apart (canvas units), as a fill. */
function hatch(ctx: Ctx, period: number, width: number): CanvasPattern | string {
  const size = Math.max(2, Math.round(period * 4))
  const tile = document.createElement("canvas")
  tile.width = size
  tile.height = size
  const t = tile.getContext("2d", { willReadFrequently: true })
  if (!t) return INK
  t.strokeStyle = INK
  t.lineWidth = width * 4
  t.beginPath()
  for (let k = -1; k <= 1; k++) {
    t.moveTo(k * size, size)
    t.lineTo(k * size + size, 0)
  }
  t.stroke()
  const p = ctx.createPattern(tile, "repeat")
  if (!p) return INK
  p.setTransform(new DOMMatrix().scale(0.25))
  return p
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintEngravingGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, PAPER)
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let i = 0; i < 180; i++) {
    const [x0, y0] = polar(100, 100, 97, i * 2)
    const [x1, y1] = polar(100, 100, 90, i * 2)
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
  }
  ctx.stroke()
  for (const [r, w] of [
    [97.5, 1.2],
    [89.5, 0.8],
    [86, 0.5],
  ]) {
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.arc(100, 100, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Zones hatched between radius 72 and 82 - danger densely, warning loosely, ok open.
  for (const z of scale.zones) {
    const a0 = ((gaugeAngle("engraving", z.from) - 90) * Math.PI) / 180
    const a1 = ((gaugeAngle("engraving", z.to) - 90) * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(100, 100, 82, a0, a1)
    ctx.arc(100, 100, 72, a1, a0, true)
    ctx.closePath()
    if (z.kind !== "ok") {
      ctx.fillStyle = hatch(ctx, z.kind === "danger" ? 3.2 : 5, 1)
      ctx.fill()
    }
    ctx.lineWidth = 0.7
    ctx.stroke()
  }
  gaugeTicks(ctx, "engraving", scale, 100, 100, 82, {
    major: { len: 12, width: 2.2 },
    minor: { len: 4, width: 0.8 },
    colour: INK,
  })
  const labelFont = FELL(scale.labels.length <= 6 ? 17 : 13)
  gaugeLabels(ctx, "engraving", scale, 100, 100, 60, labelFont, INK)
  const room = { style: "engraving" as const, scale, labelR: 60, labelFont, faceR: 88 }
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = INK
  if (props.unit) {
    fitFaceLine(ctx, props.unit, 129, (px) => FELL(px), 14, 2, room)
  }
  if (props.caption) {
    fitFaceLine(ctx, props.caption, 143, (px) => FELL(px, true), 7.5, 0, room)
  }
}

/** Across the bar: the track the hatched fill runs in. */
export const ENGRAVING_TRACK = [0.41, 0.59] as const

/** The engraving as a bar: a double frame, the caption, the zone strip, the track and its scale. */
export function paintEngravingBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1, T * 0.0127)
  const o = T * 0.027
  ctx.strokeRect(o, o, width - 2 * o, height - 2 * o)
  ctx.lineWidth = Math.max(0.6, T * 0.0055)
  const i = T * 0.073
  ctx.strokeRect(i, i, width - 2 * i, height - 2 * i)

  const [ax, ay] = f.point(0, ENGRAVING_TRACK[0])
  const [bx, by] = f.point(1, ENGRAVING_TRACK[1])
  ctx.lineWidth = Math.max(1, T * 0.009)
  ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.345)
    const [x1, y1] = f.point(z.to, 0.382)
    ctx.fillStyle = z.kind === "ok" ? PAPER : hatch(ctx, z.kind === "danger" ? T * 0.029 : T * 0.045, T * 0.009)
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
    ctx.lineWidth = Math.max(0.6, T * 0.0055)
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, 0.61)
    const [x1, y1] = f.point(t.at, t.major ? 0.68 : 0.645)
    ctx.lineWidth = Math.max(0.8, T * (t.major ? 0.016 : 0.007))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = FELL(Math.max(7, T * 0.1))
  ctx.fillStyle = INK
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.78)
    ctx.fillText(l.text, x, y)
  }
  if (props.unit || props.caption) {
    // The unit large, the caption in small italic after it, reading left to right.
    ctx.save()
    if (f.vertical) {
      const [x, y] = f.point(0.5, 0.2)
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 2)
    } else ctx.translate(Math.min(ax, bx), T * 0.245)
    const big = FELL(Math.max(7, T * 0.136))
    const small = FELL(Math.max(6, T * 0.073), true)
    const unit = props.unit ?? ""
    const gap = unit && props.caption ? T * 0.05 : 0
    ctx.font = big
    const wu = ctx.measureText(unit).width
    ctx.font = small
    const wc = ctx.measureText(props.caption ?? "").width
    let x = f.vertical ? -(wu + gap + wc) / 2 : 0
    ctx.textAlign = "left"
    ctx.font = big
    ctx.fillText(unit, x, 0)
    x += wu + gap
    ctx.font = small
    ctx.fillText(props.caption ?? "", x, T * 0.01)
    ctx.restore()
  }
}
