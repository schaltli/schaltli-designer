/**
 * Blue and red (1995, compact car): a black face, scale and numerals lit
 * blue from behind, a self-luminous red needle - the night lighting of
 * German compact cars of the nineties. From the proposal's golfG()/golfB()
 * (artifact «Instrumentenkabinett»). The needles are
 * lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, radial, roundRect, type BarFrame, type Ctx } from "./common"

export const BACKLIGHT = "#6fb4ff"
export const NEEDLE_RED = "#ff2a14"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#ff3322", warning: "#ffaa22", ok: "#44dd88" }
const SAIRA = (px: number) => `400 ${px}px "Schaltli Saira", sans-serif`

/** Backlit print glows a little in its own colour. */
function lit(ctx: Ctx, colour: string, blur: number, draw: () => void) {
  ctx.save()
  ctx.shadowColor = colour
  ctx.shadowBlur = blur
  draw()
  ctx.restore()
}

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintBlueredGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, [[0, "#3a3d42"], [0.5, "#0c0d0f"], [1, "#26282c"]]))
  disc(ctx, 100, 100, 94, "#000000")
  disc(ctx, 100, 100, 92, radial(ctx, 100, 91.6, 110, [[0, "#111620"], [1, "#030406"]]))
  lit(ctx, "#ff3322", 3, () => gaugeZones(ctx, "bluered", scale, 100, 100, 80, 3, ZONE_COLOURS))
  lit(ctx, BACKLIGHT, 2.4, () => {
    gaugeTicks(ctx, "bluered", scale, 100, 100, 86, {
      major: { len: 11, width: 2.6 },
      minor: { len: 4, width: 0.9 },
      colour: BACKLIGHT,
    })
    gaugeLabels(ctx, "bluered", scale, 100, 100, 64, SAIRA(scale.labels.length <= 6 ? 16 : 13), BACKLIGHT)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = BACKLIGHT
    if (props.caption) {
      ctx.font = SAIRA(8)
      ;(ctx as any).letterSpacing = "2.5px"
      ctx.fillText(props.caption.toUpperCase(), 100, 133)
      ;(ctx as any).letterSpacing = "0px"
    }
    if (props.unit) {
      ctx.font = SAIRA(9)
      ctx.fillText(props.unit, 100, 147)
    }
  })
  glassCrescent(ctx, 100, 100, 92, 0.55)
}

/** Blue and red as a bar: the backlit scale on black, a red needle across it. */
export function paintBlueredBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [[0, "#3a3d42"], [0.5, "#0c0d0f"], [1, "#26282c"]])
  roundRect(ctx, T * 0.018, T * 0.018, width - T * 0.036, height - T * 0.036, T * 0.11)
  ctx.fill()
  ctx.fillStyle = f.vertical ? linear(ctx, 0, 0, width, 0, [[0, "#111620"], [1, "#030406"]]) : linear(ctx, 0, 0, 0, height, [[0, "#111620"], [1, "#030406"]])
  roundRect(ctx, T * 0.064, T * 0.064, width - T * 0.128, height - T * 0.128, T * 0.073)
  ctx.fill()
  lit(ctx, "#ff3322", T * 0.03, () => {
    for (const z of scale.zones) {
      const [x0, y0] = f.point(z.from, 0.545)
      const [x1, y1] = f.point(z.to, 0.573)
      ctx.fillStyle = ZONE_COLOURS[z.kind]
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
    }
  })
  lit(ctx, BACKLIGHT, T * 0.022, () => {
    ctx.strokeStyle = BACKLIGHT
    for (const t of scale.ticks) {
      const [x0, y0] = f.point(t.at, t.major ? 0.364 : 0.455)
      const [x1, y1] = f.point(t.at, 0.509)
      ctx.lineWidth = Math.max(1, T * (t.major ? 0.022 : 0.008))
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
    ctx.font = SAIRA(Math.max(7, T * 0.118))
    ctx.fillStyle = BACKLIGHT
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (const l of scale.labels) {
      const [x, y] = f.point(l.at, 0.255)
      ctx.fillText(l.text, x, y)
    }
    const words = [props.caption?.toUpperCase(), props.unit].filter(Boolean).join(" ")
    if (words) {
      const [x, y] = f.point(0.5, 0.8)
      ctx.save()
      ctx.translate(x, y)
      if (f.vertical) ctx.rotate(-Math.PI / 2)
      ctx.font = SAIRA(Math.max(6, T * 0.073))
      ;(ctx as any).letterSpacing = "2px"
      ctx.fillText(words, 0, 0)
      ;(ctx as any).letterSpacing = "0px"
      ctx.restore()
    }
  })
}
