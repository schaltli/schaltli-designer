/**
 * The moving-coil meter (1952): a bakelite case with four screws, a cream
 * face behind a window, a mirror strip against parallax, a knife-edge
 * needle about a pivot below the window, the class mark. As a bar, an edgewise
 * profile meter. From the proposal's coilG()/coilB() (artifact
 * «Instrumentenkabinett»). The needles are lib/instrument-needles.ts's.
 */
import { gaugeAngle, type InstrumentProps, type InstrumentScale, type ZoneKind } from "@/lib/instrument"
import { arcPath, disc, fitLine, gaugeLabels, gaugeTicks, linear, radial, roundRect, withAlpha, type BarFrame, type Ctx } from "./common"

/** The pivot, below the window (200-unit box), and the window the needle shows through. */
export const COIL_PIVOT = { x: 100, y: 182 }
export const COIL_WINDOW = { x0: 14, y0: 24, x1: 186, y1: 160 }
export const COIL_INK = "#111111"
const SCALE_INK = "#1d1a16"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#b3201a", warning: "#c98a12", ok: "#2f7a3a" }
const SAIRA = (weight: number, px: number) => `${weight} ${px}px "Schaltli Saira", sans-serif`

function screw(ctx: Ctx, x: number, y: number, deg: number) {
  disc(ctx, x, y, 5.5, radial(ctx, x, y, 7.7, [[0, "#d9d1c4"], [0.6, "#8a7f70"], [1, "#3b342c"]], x - 1.9, y - 1.9))
  ctx.strokeStyle = "#0a0a0a"
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(x, y, 5.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.fillStyle = "#1a1a1a"
  ctx.fillRect(-4, -0.7, 8, 1.4)
  ctx.restore()
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintCoilGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  const { x: cx, y: cy } = COIL_PIVOT
  const w = COIL_WINDOW
  ctx.fillStyle = linear(ctx, 2, 2, 198, 198, [[0, "#5a4030"], [0.5, "#3a281d"], [1, "#22160f"]])
  roundRect(ctx, 2, 2, 196, 196, 10)
  ctx.fill()
  screw(ctx, 14, 13, 20)
  screw(ctx, 186, 13, -35)
  screw(ctx, 14, 187, 60)
  screw(ctx, 186, 187, 5)
  ctx.fillStyle = linear(ctx, 0, w.y0, 0, w.y1, [[0, "#f4ecd6"], [1, "#e4d7b6"]])
  roundRect(ctx, w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0, 4)
  ctx.fill()

  ctx.save()
  roundRect(ctx, w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0, 4)
  ctx.clip()
  const a0 = gaugeAngle("coil", 0)
  const a1 = gaugeAngle("coil", 1)
  // The mirror strip.
  ctx.lineWidth = 6
  ctx.strokeStyle = linear(ctx, 20, 0, 180, 0, [[0, "#f2f4f5"], [0.5, "#9aa3a8"], [1, "#e8ecee"]])
  arcPath(ctx, cx, cy, 123, a0, a1)
  ctx.stroke()
  ctx.lineWidth = 3
  for (const z of scale.zones) {
    ctx.strokeStyle = ZONE_COLOURS[z.kind]
    arcPath(ctx, cx, cy, 113, gaugeAngle("coil", z.from), gaugeAngle("coil", z.to))
    ctx.stroke()
  }
  ctx.lineWidth = 0.8
  ctx.strokeStyle = SCALE_INK
  arcPath(ctx, cx, cy, 118, a0, a1)
  ctx.stroke()
  gaugeTicks(ctx, "coil", scale, cx, cy, 118, {
    major: { len: 11, width: 1.6 },
    minor: { len: 5, width: 0.6 },
    colour: SCALE_INK,
  })
  gaugeLabels(ctx, "coil", scale, cx, cy, 100, SAIRA(400, scale.labels.length <= 6 ? 12 : 10), SCALE_INK)

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = SCALE_INK
  if (props.unit) {
    ctx.font = SAIRA(400, 20)
    ctx.fillText(props.unit, 100, 128)
  }
  if (props.caption) {
    // Between the magnet symbol (to x 38) and the class mark (from about x 139).
    fitLine(ctx, props.caption.toUpperCase(), 100, 146, 70, (px) => SAIRA(400, px), 7, 1.5)
  }
  // The magnet symbol and the class mark.
  ctx.strokeStyle = SCALE_INK
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(28, 152)
  ctx.lineTo(28, 145)
  ctx.arc(33, 145, 5, Math.PI, 0)
  ctx.lineTo(38, 152)
  ctx.moveTo(30.5, 152)
  ctx.lineTo(35.5, 152)
  ctx.lineTo(35.5, 148)
  ctx.lineTo(30.5, 148)
  ctx.closePath()
  ctx.stroke()
  ctx.font = SAIRA(400, 7)
  ctx.textAlign = "right"
  ctx.fillText("Kl. 1,5  DC", 172, 149)
  // The window's reflection.
  ctx.fillStyle = withAlpha("#ffffff", 0.07)
  ctx.beginPath()
  ctx.moveTo(14, 24)
  ctx.lineTo(120, 24)
  ctx.lineTo(40, 160)
  ctx.lineTo(14, 160)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // The pivot's cover, in the case below the window.
  disc(ctx, 100, 177, 6.5, "#2a1d14")
  ctx.strokeStyle = "#120c08"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(100, 177, 6.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.save()
  ctx.translate(100, 177)
  ctx.rotate((-20 * Math.PI) / 180)
  ctx.fillStyle = "#0c0805"
  ctx.fillRect(-4.5, -0.7, 9, 1.4)
  ctx.restore()
}

/** Across the profile meter (0..1 of its thickness): the cream face. */
export const PROFILE_FACE = [0.175, 0.825] as const

/** The moving-coil meter as an edgewise profile meter. Drawn at the object's own pixels. */
export function paintCoilBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = f.vertical
    ? linear(ctx, 0, 0, width, 0, [[0, "#3a3a3a"], [0.5, "#1a1a1a"], [1, "#2c2c2c"]])
    : linear(ctx, 0, 0, 0, height, [[0, "#3a3a3a"], [0.5, "#1a1a1a"], [1, "#2c2c2c"]])
  roundRect(ctx, T * 0.04, T * 0.04, width - T * 0.08, height - T * 0.08, T * 0.06)
  ctx.fill()
  // The face runs almost the whole length.
  const [ax, ay] = f.point(-0.09, PROFILE_FACE[0])
  const [bx, by] = f.point(1.09, PROFILE_FACE[1])
  ctx.fillStyle = f.vertical
    ? linear(ctx, Math.min(ax, bx), 0, Math.max(ax, bx), 0, [[0, "#f4ecd6"], [1, "#e4d7b6"]])
    : linear(ctx, 0, Math.min(ay, by), 0, Math.max(ay, by), [[0, "#f4ecd6"], [1, "#e4d7b6"]])
  roundRect(ctx, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), T * 0.025)
  ctx.fill()

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.735)
    const [x1, y1] = f.point(z.to, 0.77)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  ctx.strokeStyle = SCALE_INK
  ctx.lineWidth = Math.max(1, T * 0.01)
  const [l0x, l0y] = f.point(0, 0.725)
  const [l1x, l1y] = f.point(1, 0.725)
  ctx.beginPath()
  ctx.moveTo(l0x, l0y)
  ctx.lineTo(l1x, l1y)
  ctx.stroke()
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.6 : 0.65)
    const [x1, y1] = f.point(t.at, 0.725)
    ctx.lineWidth = Math.max(1, T * (t.major ? 0.019 : 0.0075))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = SAIRA(400, Math.max(7, T * 0.1375))
  ctx.fillStyle = SCALE_INK
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.41)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.unit, props.caption?.toUpperCase()].filter(Boolean).join(" ")
  if (words) {
    // Below a standing scale; over the numerals of a lying one, small.
    const [x, y] = f.vertical ? f.point(-0.068, 0.5) : f.point(0.5, 0.235)
    ctx.save()
    ctx.translate(x, y)
    ctx.font = SAIRA(400, Math.max(6, T * (f.vertical ? 0.1 : 0.075)))
    ctx.fillText(words, 0, 0)
    ctx.restore()
  }
}
