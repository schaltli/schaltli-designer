/**
 * Art deco (1938): a gold bezel, an ivory face with a faint sunburst,
 * italic serif numerals and a blued Breguet needle; as a bar a stepped tower
 * with a band thermometer. From the proposal's decoG()/decoB() (artifact
 * «Instrumentenkabinett»). The needle and the band's red are
 * lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, polar, radial, type BarFrame, type Ctx } from "./common"

export const DECO_BLUE = "#1f2f5c"
export const DECO_GOLD = "#c9a24a"
const INK = "#2b2118"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#a33a2a", warning: "#c8902a", ok: "#4f7a4a" }
const PLAYFAIR = (px: number, italic = false, weight = 400) => `${italic ? "italic " : ""}${weight} ${px}px "Schaltli Playfair Display", serif`
const GOLD_STOPS: [number, string][] = [
  [0, "#fff1c1"],
  [0.3, "#c39a3e"],
  [0.5, "#fff6d6"],
  [0.75, "#8f6a22"],
  [1, "#e8c870"],
]

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintDecoGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, GOLD_STOPS))
  disc(ctx, 100, 100, 92.5, "#6b5534")
  disc(ctx, 100, 100, 91, linear(ctx, 199, 199, 1, 1, GOLD_STOPS))
  disc(ctx, 100, 100, 86, radial(ctx, 100, 100, 86, [[0, "#fbf6e8"], [0.75, "#efe4c6"], [1, "#d8c69c"]]))
  // The sunburst.
  ctx.strokeStyle = "#d3c08f"
  ctx.lineWidth = 0.7
  ctx.beginPath()
  for (let i = 0; i < 36; i++) {
    const [x0, y0] = polar(100, 100, 46, i * 10)
    const [x1, y1] = polar(100, 100, 18, i * 10)
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
  }
  ctx.stroke()
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.6
  for (const r of [74, 80]) {
    ctx.beginPath()
    ctx.arc(100, 100, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  gaugeZones(ctx, "deco", scale, 100, 100, 77, 5.4, ZONE_COLOURS)
  gaugeTicks(ctx, "deco", scale, 100, 100, 80, {
    major: { len: 11, width: 2 },
    minor: { len: 6, width: 0.6 },
    colour: INK,
  })
  gaugeLabels(ctx, "deco", scale, 100, 100, 60, PLAYFAIR(scale.labels.length <= 6 ? 15 : 12, true, 600), INK)

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = INK
  if (props.caption) {
    ctx.font = PLAYFAIR(8.5)
    ;(ctx as any).letterSpacing = "4px"
    ctx.fillText(props.caption.toUpperCase(), 100, 128)
    ;(ctx as any).letterSpacing = "0px"
  }
  if (props.unit) {
    ctx.font = PLAYFAIR(12, true)
    ctx.fillText(props.unit, 100, 142)
  }
  glassCrescent(ctx, 100, 100, 86, 1)
}

/**
 * Where the bar's parts lie along its length (0..1 from the start edge -
 * the tower's foot) and across it: the tube and the red band in it.
 */
export const DECO_BAR = { tube: [0.436, 0.564] as const, band: [0.4545, 0.5455] as const, tubeFrom: 0.12, tubeTo: 0.855 }

/** A point `u` of the bar's length from its start edge and `d` across it. */
export function decoPoint(f: BarFrame, u: number, d: number): [number, number] {
  return f.point((u * f.length - f.from) / (f.to - f.from), d)
}

function box(ctx: Ctx, f: BarFrame, u0: number, u1: number, d0: number, d1: number) {
  const [ax, ay] = decoPoint(f, u0, d0)
  const [bx, by] = decoPoint(f, u1, d1)
  ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
}

/** The stepped tower: its foot, two steps up to the top, as one outline. */
function tower(ctx: Ctx, f: BarFrame, inset: number) {
  const steps: [number, number, number][] = [
    [0.04, 0.87, 0.136],
    [0.87, 0.92, 0.227],
    [0.92, 0.965, 0.318],
  ]
  ctx.beginPath()
  for (const [u0, u1, d] of steps) box(ctx, f, u0 + (u0 === 0.04 ? inset : 0), u1 + (u1 === 0.965 ? -inset : 0.001), d + inset, 1 - d - inset)
}

/** The art deco bar: a gold tower, ivory inside, fan rays above the tube, the band and its scale. */
export function paintDecoBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, GOLD_STOPS)
  tower(ctx, f, 0)
  ctx.fill()
  ctx.fillStyle = f.vertical ? linear(ctx, 0, 0, 0, height, [[0, "#fbf6e8"], [1, "#e2d3ac"]]) : linear(ctx, 0, 0, width, 0, [[0, "#fbf6e8"], [1, "#e2d3ac"]])
  tower(ctx, f, 0.045)
  ctx.fill()

  // Fan rays from the tube's top.
  ctx.strokeStyle = "#b8913a"
  ctx.lineWidth = Math.max(0.7, T * 0.008)
  const [ox, oy] = decoPoint(f, 0.86, 0.5)
  ctx.beginPath()
  for (const d of [0.4, 0.445, 0.5, 0.555, 0.6]) {
    const [x, y] = decoPoint(f, 0.935, d)
    ctx.moveTo(ox, oy)
    ctx.lineTo(x, y)
  }
  ctx.stroke()

  ctx.fillStyle = "#e9dcc0"
  ctx.strokeStyle = "#6b5534"
  ctx.lineWidth = Math.max(0.6, T * 0.0055)
  ctx.beginPath()
  box(ctx, f, DECO_BAR.tubeFrom, DECO_BAR.tubeTo, DECO_BAR.tube[0], DECO_BAR.tube[1])
  ctx.fill()
  ctx.stroke()

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.6)
    const [x1, y1] = f.point(z.to, 0.62)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  ctx.strokeStyle = INK
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.327 : 0.364)
    const [x1, y1] = f.point(t.at, 0.41)
    ctx.lineWidth = Math.max(0.7, T * (t.major ? 0.013 : 0.0064))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = PLAYFAIR(Math.max(7, T * 0.09), true, 600)
  ctx.fillStyle = INK
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.69)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.unit, props.caption?.toUpperCase()].filter(Boolean).join(" ")
  if (words) {
    const [x, y] = decoPoint(f, 0.075, 0.5)
    ctx.save()
    ctx.translate(x, y)
    if (!f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = PLAYFAIR(Math.max(6, T * 0.08), true)
    ctx.fillText(words, 0, 0)
    ctx.restore()
  }
}
