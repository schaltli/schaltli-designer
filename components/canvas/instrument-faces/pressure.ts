/**
 * The pressure gauge (1887, steampunk): a brass case with rivets, a cream
 * face with age spots, copperplate numerals, a red line at the top. As a
 * bar, a sight glass on a copper plate with brass fittings, the water rising
 * in it. From the proposal's steamG()/steamB() (artifact
 * «Instrumentenkabinett»). The needle, the water and its meniscus are
 * lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, fitFaceLine, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, polar, radial, roundRect, withAlpha, type BarFrame, type Ctx } from "./common"

export const PRESSURE_INK = "#1b120a"
export const BRASS = "#c9a050"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#9b1b1b", warning: "#b8860b", ok: "#3f6b2a" }
const FELL = (px: number, italic = false) => `${italic ? "italic " : ""}400 ${px}px "Schaltli IM Fell English", serif`
const BRASS_STOPS: [number, string][] = [
  [0, "#ffe49a"],
  [0.3, "#b07d2c"],
  [0.55, "#fff0b8"],
  [0.8, "#7a531b"],
  [1, "#d9ab55"],
]

function rivet(ctx: Ctx, x: number, y: number, r: number) {
  disc(ctx, x, y, r, radial(ctx, x, y, r * 1.3, [[0, "#fff3c0"], [0.5, "#c08f3a"], [1, "#4a300c"]], x - r * 0.3, y - r * 0.3))
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintPressureGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, BRASS_STOPS))
  disc(ctx, 100, 100, 90.5, "#4a300c")
  disc(ctx, 100, 100, 89, linear(ctx, 199, 199, 1, 1, BRASS_STOPS))
  disc(ctx, 100, 100, 84, radial(ctx, 100, 100, 84, [[0, "#f6ebcf"], [0.7, "#e6cf9c"], [1, "#b38c52"]]))
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(100, 100, 94.7, i * 30 + 15)
    rivet(ctx, x, y, 2.6)
  }
  // Age.
  for (const [x, y, r, a] of [
    [64, 132, 15, 0.07],
    [141, 66, 9, 0.08],
    [128, 140, 5, 0.07],
  ])
    disc(ctx, x, y, r, withAlpha("#7a4a14", a))

  gaugeZones(ctx, "pressure", scale, 100, 100, 76.5, 7, ZONE_COLOURS)
  ctx.strokeStyle = "#3a2614"
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(100, 100, 80.5, (-135 - 90) * (Math.PI / 180), (135 - 90) * (Math.PI / 180))
  ctx.stroke()
  gaugeTicks(ctx, "pressure", scale, 100, 100, 80, {
    major: { len: 11, width: 2.4 },
    minor: { len: 5, width: 0.9 },
    colour: "#3a2614",
  })
  const size = scale.labels.length <= 6 ? 20 : scale.labels.length <= 8 ? 16 : 13
  const labelFont = FELL(size)
  gaugeLabels(ctx, "pressure", scale, 100, 100, 59, labelFont, "#3a2614")
  const room = { style: "pressure" as const, scale, labelR: 59, labelFont, faceR: 84 }

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#5a3d20"
  ctx.font = FELL(6, true)
  ;(ctx as any).letterSpacing = "0.6px"
  ctx.fillText("PATENT No 1887", 100, 71)
  if (props.unit) {
    // Below the counterweight's circle (r 24 about the pivot, its shadow 3 lower).
    ctx.fillStyle = "#3a2614"
    fitFaceLine(ctx, props.unit.toUpperCase(), 135, (px) => FELL(px), 12, 2, room)
  }
  if (props.caption) {
    ctx.fillStyle = "#5a3d20"
    fitFaceLine(ctx, props.caption.toUpperCase(), 151, (px) => FELL(px), 6.2, 1.4, room)
  }
  ;(ctx as any).letterSpacing = "0px"
  glassCrescent(ctx, 100, 100, 84, 1)
}

/** Across the bar (0..1 of its thickness): the tube, the water inside it. */
export const SIGHT_GLASS = { tube: [0.408, 0.592] as const, water: [0.417, 0.583] as const }
/** The water's colours across the tube: dark at the walls, light in the middle. */
export const WATER = { wall: "#215a56", middle: "#6fc7bd", other: "#1f4f4b", meniscus: "#a8eee3" }

/** Fills the box between two scale positions and two depths. */
function band(ctx: Ctx, f: BarFrame, at0: number, at1: number, d0: number, d1: number, r = 0) {
  const [ax, ay] = f.point(at0, d0)
  const [bx, by] = f.point(at1, d1)
  roundRect(ctx, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), r)
}

/** The sight glass as a bar: copper plate, the tube between brass fittings, the scale beside it. */
export function paintPressureBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  const inset = T * 0.1
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [[0, "#e7a77a"], [0.4, "#b8693a"], [0.7, "#d88d5c"], [1, "#7d3e1d"]])
  roundRect(ctx, inset * 0.5, inset * 0.5, width - inset, height - inset, T * 0.04)
  ctx.fill()
  ctx.strokeStyle = withAlpha("#5a2a10", 0.55)
  ctx.lineWidth = 1
  ctx.stroke()
  const r = T * 0.023
  for (const [x, y] of [
    [inset * 0.5 + T * 0.075, inset * 0.5 + T * 0.075],
    [width - inset * 0.5 - T * 0.075, inset * 0.5 + T * 0.075],
    [inset * 0.5 + T * 0.075, height - inset * 0.5 - T * 0.075],
    [width - inset * 0.5 - T * 0.075, height - inset * 0.5 - T * 0.075],
  ])
    rivet(ctx, x, y, r)

  // The tube, a little longer than the scale, dark glass.
  ctx.fillStyle = withAlpha("#1d2a28", 0.8)
  band(ctx, f, -0.04, 1.04, SIGHT_GLASS.tube[0], SIGHT_GLASS.tube[1], T * 0.08)
  ctx.fill()
  ctx.strokeStyle = "#3a2614"
  ctx.lineWidth = 1
  ctx.stroke()
  // Brass fittings at both ends.
  const brass = (at0: number, at1: number, d0: number, d1: number) => {
    const [ax, ay] = f.point(at0, d0)
    const [bx, by] = f.point(at1, d1)
    ctx.fillStyle = linear(ctx, ax, ay, bx, ay === by ? ay + 1 : by, [[0, "#7a531b"], [0.25, "#ffe7a3"], [0.5, "#c4923a"], [0.8, "#fff0b8"], [1, "#6d4a17"]])
    band(ctx, f, at0, at1, d0, d1, T * 0.02)
    ctx.fill()
  }
  const fit = (T * 0.1) / (f.to - f.from)
  brass(-0.04 - fit, -0.04, 0.35, 0.65)
  brass(-0.04 - fit * 1.9, -0.04 - fit, 0.3, 0.7)
  brass(1.04, 1.04 + fit, 0.35, 0.65)
  brass(1.04 + fit, 1.04 + fit * 1.9, 0.3, 0.7)

  for (const z of scale.zones) {
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    band(ctx, f, z.from, z.to, 0.62, 0.635)
    ctx.fill()
  }
  ctx.strokeStyle = "#3a1d0c"
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, 0.633)
    const [x1, y1] = f.point(t.at, t.major ? 0.717 : 0.675)
    ctx.lineWidth = Math.max(1, T * (t.major ? 0.013 : 0.006))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = FELL(Math.max(7, T * 0.1))
  ctx.fillStyle = "#3a1d0c"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.8)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.unit?.toUpperCase(), props.caption?.toUpperCase()].filter(Boolean).join(" · ")
  if (words) {
    const [x, y] = f.point(0.5, 0.26)
    ctx.save()
    ctx.translate(x, y)
    if (f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = FELL(Math.max(6, T * 0.075))
    ;(ctx as any).letterSpacing = "2px"
    ctx.fillText(words, 0, 0)
    ;(ctx as any).letterSpacing = "0px"
    ctx.restore()
  }
}
