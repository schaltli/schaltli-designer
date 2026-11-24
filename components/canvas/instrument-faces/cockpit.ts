/**
 * The cockpit instrument (1965): a square flange with four screws, luminous
 * numerals on matt black, read at a glance at night; as a bar a band scale
 * in the same flange. From the proposal's pilotG()/pilotB() (artifact
 * «Instrumentenkabinett»). The needles are lib/instrument-needles.ts's.
 */
import { gaugeAngle, type InstrumentProps, type InstrumentScale, type ZoneKind } from "@/lib/instrument"
import { arcPath, gaugeLabels, gaugeTicks, glassCrescent, linear, radial, roundRect, type BarFrame, type Ctx } from "./common"

export const LUME = "#e3f4d2"
export const LUME_NEEDLE = "#eef7e6"
export const LUME_GREEN = "#a6dc8e"
const GREY = "#8f988e"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#e2574c", warning: "#e0b040", ok: LUME_GREEN }
const OSWALD = (weight: number, px: number) => `${weight} ${px}px "Schaltli Oswald", sans-serif`

function screw(ctx: Ctx, x: number, y: number, deg: number, r: number) {
  ctx.fillStyle = radial(ctx, x, y, r * 1.4, [[0, "#c9cdd2"], [0.6, "#6b7076"], [1, "#2a2c30"]], x - r * 0.35, y - r * 0.35)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = "#0a0a0a"
  ctx.lineWidth = r * 0.15
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.fillStyle = "#1a1a1a"
  ctx.fillRect(-r * 0.73, -r * 0.13, r * 1.46, r * 0.26)
  ctx.restore()
}

/** Luminous paint glows a little: the lume drawn with a soft halo. */
function glowing(ctx: Ctx, blur: number, draw: () => void) {
  ctx.save()
  ctx.shadowColor = "rgba(227,244,210,0.55)"
  ctx.shadowBlur = blur
  draw()
  ctx.restore()
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintCockpitGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  ctx.fillStyle = linear(ctx, 2, 2, 198, 198, [[0, "#34363a"], [1, "#141518"]])
  roundRect(ctx, 2, 2, 196, 196, 22)
  ctx.fill()
  screw(ctx, 19, 19, 40, 5.5)
  screw(ctx, 181, 19, -10, 5.5)
  screw(ctx, 19, 181, 75, 5.5)
  screw(ctx, 181, 181, 15, 5.5)
  ctx.fillStyle = "#0b0c0e"
  ctx.beginPath()
  ctx.arc(100, 100, 90, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = "#3b3d42"
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = radial(ctx, 100, 90.3, 103, [[0, "#17181b"], [1, "#0a0b0c"]])
  ctx.beginPath()
  ctx.arc(100, 100, 86, 0, Math.PI * 2)
  ctx.fill()

  ctx.lineWidth = 3
  for (const z of scale.zones) {
    ctx.strokeStyle = ZONE_COLOURS[z.kind]
    arcPath(ctx, 100, 100, 84, gaugeAngle("cockpit", z.from), gaugeAngle("cockpit", z.to))
    ctx.stroke()
  }
  glowing(ctx, 1.4, () => {
    gaugeTicks(ctx, "cockpit", scale, 100, 100, 82, {
      major: { len: 13, width: 3.4 },
      minor: { len: 5, width: 0.9 },
      colour: LUME,
    })
    gaugeLabels(ctx, "cockpit", scale, 100, 100, 57, OSWALD(700, scale.labels.length <= 6 ? 21 : 16), LUME)
  })
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = GREY
  ctx.font = OSWALD(500, 8)
  if (props.caption) {
    ;(ctx as any).letterSpacing = "3px"
    ctx.fillText(props.caption.toUpperCase(), 100, 68)
  }
  if (props.unit) {
    ;(ctx as any).letterSpacing = "1.5px"
    ctx.fillText(props.unit, 100, 158)
  }
  ;(ctx as any).letterSpacing = "0px"
  glassCrescent(ctx, 100, 100, 86, 0.7)
}

/** Across the bar: the dark window the scale sits in. */
export const COCKPIT_WINDOW = [0.22, 0.78] as const

/** The cockpit instrument as a band scale in the same flange. Drawn at the object's own pixels. */
export function paintCockpitBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [[0, "#34363a"], [1, "#141518"]])
  roundRect(ctx, T * 0.02, T * 0.02, width - T * 0.04, height - T * 0.04, T * 0.14)
  ctx.fill()
  const s = T * 0.12
  screw(ctx, s, s, 30, T * 0.055)
  screw(ctx, width - s, s, -20, T * 0.055)
  screw(ctx, s, height - s, 80, T * 0.055)
  screw(ctx, width - s, height - s, 10, T * 0.055)

  const [ax, ay] = f.point(-0.07, COCKPIT_WINDOW[0])
  const [bx, by] = f.point(1.07, COCKPIT_WINDOW[1])
  ctx.fillStyle = "#0b0c0d"
  roundRect(ctx, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), T * 0.04)
  ctx.fill()
  ctx.strokeStyle = "#3b3d42"
  ctx.lineWidth = 1
  ctx.stroke()

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.24)
    const [x1, y1] = f.point(z.to, 0.265)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  glowing(ctx, T * 0.012, () => {
    ctx.strokeStyle = LUME
    for (const t of scale.ticks) {
      const [x0, y0] = f.point(t.at, 0.28)
      const [x1, y1] = f.point(t.at, t.major ? 0.4 : 0.34)
      ctx.lineWidth = Math.max(1, T * (t.major ? 0.026 : 0.009))
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
    ctx.font = OSWALD(700, Math.max(7, T * 0.15))
    ctx.fillStyle = LUME
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const l of scale.labels) {
      const [x, y] = f.point(l.at, 0.64)
      ctx.fillText(l.text, x, y)
    }
  })
  ctx.fillStyle = GREY
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = OSWALD(500, Math.max(6, T * 0.07))
  const ends: [string | undefined, number][] = [
    [props.caption?.toUpperCase(), 1.1],
    [props.unit, -0.1],
  ]
  for (const [text, pos] of ends) {
    if (!text) continue
    const [x, y] = f.point(pos, 0.5)
    ctx.save()
    ctx.translate(x, y)
    if (!f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
}
