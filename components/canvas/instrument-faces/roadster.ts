/**
 * The roadster (1962): a double chrome ring, a black face, cream numerals,
 * a red low range; as a bar a chrome-framed edgewise scale with a slim
 * needle. From the proposal's roadG()/roadB() (artifact
 * «Instrumentenkabinett»). The needles are lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, radial, roundRect, type BarFrame, type Ctx } from "./common"

export const CREAM = "#efe8d2"
export const NEEDLE_CREAM = "#f2efe6"
export const CHROME = "#cfcfcf"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#c0392b", warning: "#d68910", ok: "#58a05a" }
const OSWALD = (weight: number, px: number) => `${weight} ${px}px "Schaltli Oswald", sans-serif`
export const CHROME_STOPS: [number, string][] = [
  [0, "#fbfbfb"],
  [0.35, "#9a9a9a"],
  [0.5, "#ffffff"],
  [0.75, "#646464"],
  [1, "#d9d9d9"],
]

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintRoadsterGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, CHROME_STOPS))
  disc(ctx, 100, 100, 91, "#2b2b2b")
  disc(ctx, 100, 100, 89, linear(ctx, 199, 199, 1, 1, CHROME_STOPS))
  disc(ctx, 100, 100, 85, radial(ctx, 100, 85, 102, [[0, "#2a2c2e"], [1, "#0b0c0d"]]))
  gaugeZones(ctx, "roadster", scale, 100, 100, 82, 3, ZONE_COLOURS)
  gaugeTicks(ctx, "roadster", scale, 100, 100, 80, {
    major: { len: 11, width: 2.6 },
    minor: { len: 5, width: 1 },
    colour: CREAM,
  })
  gaugeLabels(ctx, "roadster", scale, 100, 100, 61, OSWALD(500, scale.labels.length <= 7 ? 15 : 12), CREAM)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  if (props.caption) {
    ctx.font = OSWALD(500, 9)
    ctx.fillStyle = CREAM
    ;(ctx as any).letterSpacing = "2.5px"
    ctx.fillText(props.caption.toUpperCase(), 100, 133)
  }
  if (props.unit) {
    ctx.font = OSWALD(400, 6)
    ctx.fillStyle = "#8d8a80"
    ;(ctx as any).letterSpacing = "1.5px"
    ctx.fillText(props.unit.toUpperCase(), 100, 145)
  }
  ;(ctx as any).letterSpacing = "0px"
  glassCrescent(ctx, 100, 100, 85, 1)
}

/** The roadster as a bar: a chrome frame round a dark window, the scale, a needle across it. */
export function paintRoadsterBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, CHROME_STOPS)
  roundRect(ctx, T * 0.027, T * 0.027, width - T * 0.055, height - T * 0.055, T * 0.145)
  ctx.fill()
  ctx.fillStyle = "#2b2b2b"
  roundRect(ctx, T * 0.09, T * 0.09, width - T * 0.18, height - T * 0.18, T * 0.09)
  ctx.fill()
  ctx.fillStyle = f.vertical ? linear(ctx, 0, 0, width, 0, [[0, "#26282a"], [1, "#0b0c0d"]]) : linear(ctx, 0, 0, 0, height, [[0, "#26282a"], [1, "#0b0c0d"]])
  roundRect(ctx, T * 0.118, T * 0.118, width - T * 0.236, height - T * 0.236, T * 0.073)
  ctx.fill()

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.5)
    const [x1, y1] = f.point(z.to, 0.527)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  ctx.strokeStyle = CREAM
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.364 : 0.418)
    const [x1, y1] = f.point(t.at, 0.482)
    ctx.lineWidth = Math.max(1, T * (t.major ? 0.022 : 0.009))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = OSWALD(500, Math.max(7, T * 0.118))
  ctx.fillStyle = CREAM
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.255)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.caption?.toUpperCase(), props.unit?.toUpperCase()].filter(Boolean).join("  ")
  if (words) {
    const [x, y] = f.point(0.5, 0.745)
    ctx.save()
    ctx.translate(x, y)
    if (f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = OSWALD(500, Math.max(6, T * 0.082))
    ;(ctx as any).letterSpacing = "2.5px"
    ctx.fillText(words, 0, 0)
    ;(ctx as any).letterSpacing = "0px"
    ctx.restore()
  }
}
