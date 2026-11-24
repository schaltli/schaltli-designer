/**
 * The night cluster (2024): a light-guide needle and a glowing ring on black
 * glass, the value also in digits in the middle. From the proposal's
 * nightG()/nightB() (artifact «Instrumentenkabinett»). The ring's light,
 * the bar's light strip and the needle are lib/instrument-needles.ts's; the
 * digits come with the readout (tasks/instrument-styles-todo.md I12).
 */
import { gaugeAngle, type InstrumentProps, type InstrumentScale, type ZoneKind } from "@/lib/instrument"
import { arcPath, disc, fitFaceLine, gaugeLabels, gaugeTicks, glassCrescent, linear, radial, roundRect, type BarFrame, type Ctx } from "./common"

/** The light's colours, from the start of the scale to its end. */
export const NIGHT_LIGHT = { from: "#ff2a12", to: "#ff9a4a" }
export const NIGHT_NEEDLE = "#ff4a1f"
/** The ring the light runs in, about the pivot (200-unit box). */
export const NIGHT_RING = { r: 84, width: 4 }
const TRACK = "#25272c"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#ff3b30", warning: "#ffb020", ok: "#34c759" }
const SAIRA = (weight: number, px: number) => `${weight} ${px}px "Schaltli Saira", sans-serif`

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintNightGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, [[0, "#55585e"], [0.45, "#121316"], [1, "#2e3035"]]))
  disc(ctx, 100, 100, 95, "#000000")
  disc(ctx, 100, 100, 93, radial(ctx, 100, 81.4, 121, [[0, "#1b1d22"], [1, "#050507"]]))

  // The dark ring the light runs in.
  ctx.lineCap = "round"
  ctx.lineWidth = NIGHT_RING.width
  ctx.strokeStyle = TRACK
  arcPath(ctx, 100, 100, NIGHT_RING.r, gaugeAngle("night", 0), gaugeAngle("night", 1))
  ctx.stroke()
  ctx.lineCap = "butt"
  // Zones as a fine line outside it.
  ctx.lineWidth = 1.6
  for (const z of scale.zones) {
    arcPath(ctx, 100, 100, 89.5, gaugeAngle("night", z.from), gaugeAngle("night", z.to))
    ctx.strokeStyle = ZONE_COLOURS[z.kind]
    ctx.stroke()
  }

  gaugeTicks(ctx, "night", { ...scale, ticks: scale.ticks.filter((t) => !t.major) }, 100, 100, 77, {
    major: { len: 7, width: 1.4 },
    minor: { len: 3, width: 0.8 },
    colour: "#80858f",
  })
  gaugeTicks(ctx, "night", { ...scale, ticks: scale.ticks.filter((t) => t.major) }, 100, 100, 77, {
    major: { len: 7, width: 1.4 },
    minor: { len: 3, width: 0.8 },
    colour: "#f2f4f7",
  })
  const size = scale.labels.length <= 7 ? 11.5 : 9.5
  const labelFont = SAIRA(300, size)
  gaugeLabels(ctx, "night", scale, 100, 100, 63, labelFont, "#e8eaee")
  // Inside the ring the light runs in.
  const room = { style: "night" as const, scale, labelR: 63, labelFont, faceR: NIGHT_RING.r - NIGHT_RING.width }

  // The hub the digits sit in.
  disc(ctx, 100, 100, 31, radial(ctx, 100, 87.6, 43.4, [[0, "#1f2228"], [1, "#0a0b0d"]]))
  ctx.lineWidth = 1
  ctx.strokeStyle = "#2c2f36"
  ctx.beginPath()
  ctx.arc(100, 100, 31, 0, Math.PI * 2)
  ctx.stroke()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#80858f"
  if (props.unit) {
    ctx.font = SAIRA(400, 8)
    ctx.fillText(props.unit, 100, 114)
  }
  if (props.caption) {
    fitFaceLine(ctx, props.caption.toUpperCase(), 146, (px) => SAIRA(400, px), 7, 2.5, room)
  }
  glassCrescent(ctx, 100, 100, 93, 0.45)
}

/** Where the bar's light strip lies across the scale (0..1 of the thickness). */
export const NIGHT_BAR_LIGHT = { from: 0.582, to: 0.618 }

/** The night cluster as a light strip. Drawn at the object's own pixels. */
export function paintNightBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [[0, "#55585e"], [0.45, "#121316"], [1, "#2e3035"]])
  roundRect(ctx, 0, 0, width, height, T * 0.164)
  ctx.fill()
  const inset = T * 0.036
  ctx.fillStyle = "#060709"
  roundRect(ctx, inset, inset, width - 2 * inset, height - 2 * inset, T * 0.136)
  ctx.fill()

  const [ax, ay] = f.point(0, NIGHT_BAR_LIGHT.from)
  const [bx, by] = f.point(1, NIGHT_BAR_LIGHT.to)
  ctx.fillStyle = TRACK
  roundRect(ctx, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), T * 0.018)
  ctx.fill()

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.64)
    const [x1, y1] = f.point(z.to, 0.655)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.69 : 0.7)
    const [x1, y1] = f.point(t.at, t.major ? 0.73 : 0.715)
    ctx.strokeStyle = t.major ? "#a6abb4" : "#80858f"
    ctx.lineWidth = Math.max(1, T * 0.009)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = SAIRA(300, Math.max(7, T * 0.073))
  ctx.fillStyle = "#a6abb4"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.82)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.caption?.toUpperCase(), props.unit].filter(Boolean).join("  ")
  if (words) {
    // Top right of a lying bar, along the middle of a standing one.
    const [x, y] = f.vertical ? f.point(0.5, 0.31) : [width - T * 0.09, T * 0.31]
    ctx.save()
    ctx.translate(x, y)
    if (f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = SAIRA(400, Math.max(6, T * 0.064))
    ctx.fillStyle = "#80858f"
    ctx.textAlign = f.vertical ? "center" : "end"
    ;(ctx as any).letterSpacing = "2px"
    ctx.fillText(words, 0, 0)
    ;(ctx as any).letterSpacing = "0px"
    ctx.restore()
  }
}

/** The gauge's readout (200-unit box): the middle of the hub, font size, no glow. */
export const NIGHT_GAUGE_READOUT = { x: 100, y: 97, px: 20, glow: 0 }
export const NIGHT_FONT = (px: number) => SAIRA(300, px)

/** The bar's readout box in pixels: right edge (or middle, standing), the text's middle line, font size. */
export function nightBarReadout(f: BarFrame, width: number): { x: number; y: number; px: number; align: "right" | "center"; glow: number } {
  const T = f.thickness
  if (f.vertical) return { x: width / 2, y: f.length * 0.065, px: T * 0.2, align: "center", glow: 0 }
  return { x: T * 0.873, y: T * 0.364, px: T * 0.255, align: "right", glow: 0 }
}
