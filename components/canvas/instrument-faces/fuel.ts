/**
 * The fuel gauge (1992, utility vehicle): gloss-black case, E-½-F or numbers
 * about a low pivot, a red and yellow reserve, a drop below the pivot. From
 * the proposal's truckG() (artifact «Instrumentenkabinett»), in its 200-unit
 * box. The needle is not drawn here - it is lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, fitFaceLine, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, roundRect, type BarFrame, type Ctx } from "./common"

export const FUEL_PIVOT = { x: 100, y: 150 }

const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#e0322b", warning: "#f2b705", ok: "#2fa84f" }
const WHITE = "#f2f2f2"

function drop(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - 7 * s)
  ctx.bezierCurveTo(x + 2 * s, y - 3 * s, x + 5 * s, y, x + 5 * s, y + 2.5 * s)
  ctx.arc(x, y + 2.5 * s, 5 * s, 0, Math.PI)
  ctx.bezierCurveTo(x - 5 * s, y, x - 2 * s, y - 3 * s, x, y - 7 * s)
  ctx.closePath()
  ctx.fillStyle = "#e6e6e6"
  ctx.fill()
}

/** Paints the face on `ctx`, already scaled so the face's box is 200 units. */
export function paintFuelGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  const { x: cx, y: cy } = FUEL_PIVOT
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, [[0, "#4a4a4a"], [0.4, "#0a0a0a"], [1, "#222222"]]))
  disc(ctx, 100, 100, 92, "#000000")
  disc(ctx, 100, 100, 89, "#0e0f10")

  gaugeZones(ctx, "fuel", scale, cx, cy, 80, 8, ZONE_COLOURS)
  gaugeTicks(ctx, "fuel", scale, cx, cy, 86, {
    major: { len: 15, width: 4.2 },
    minor: { len: 8, width: 2.4 },
    colour: WHITE,
  })
  // Three letters stand large; a row of numbers has to be smaller to fit.
  const size = scale.labels.length <= 3 ? 20 : scale.labels.length <= 5 ? 15 : 12
  const labelFont = `700 ${size}px "Schaltli Oswald", sans-serif`
  gaugeLabels(ctx, "fuel", scale, cx, cy, 61, labelFont, WHITE)

  if (props.unit) {
    ctx.font = `500 9px "Schaltli Oswald", sans-serif`
    ctx.fillStyle = "#9aa0a6"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(props.unit, 100, 124)
  }
  if (props.caption) {
    ctx.font = `500 8px "Schaltli Oswald", sans-serif`
    ctx.fillStyle = "#c8ccd0"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    fitFaceLine(ctx, props.caption.toUpperCase(), 178, (px) => `500 ${px}px "Schaltli Oswald", sans-serif`, 8, 1.5, {
      style: "fuel",
      scale,
      labelR: 61,
      labelFont,
      faceR: 89,
      cx,
      cy,
    })
  } else {
    drop(ctx, 100, 180, 1.1)
  }
  // The cap is the needle's (it lies over it); the glass lies over both on
  // a real gauge, but over the face only here - over the needle it would
  // have to be redrawn each frame (spec, «Spike results»).
  glassCrescent(ctx, 100, 100, 89, 0.7)
}

/**
 * The fuel gauge as a bar (the proposal's truckB): the same black case,
 * labels on one side of the scale, ticks and the reserve strip on the
 * other; the pointer (lib/instrument-needles.ts) runs between them. Drawn
 * at the object's own pixels, not in a 200-unit box: a bar's length is the
 * author's.
 */
export function paintFuelBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = linear(ctx, 0, 0, width, height, [[0, "#4a4a4a"], [0.4, "#0a0a0a"], [1, "#222222"]])
  roundRect(ctx, 0, 0, width, height, T * 0.14)
  ctx.fill()
  const inset = T * 0.09
  ctx.fillStyle = "#0e0f10"
  roundRect(ctx, inset, inset, width - 2 * inset, height - 2 * inset, T * 0.07)
  ctx.fill()

  // Reserve strip, then ticks, across the far side of the scale.
  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.64)
    const [x1, y1] = f.point(z.to, 0.71)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  ctx.strokeStyle = WHITE
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.44 : 0.5)
    const [x1, y1] = f.point(t.at, 0.62)
    ctx.lineWidth = Math.max(1, T * (t.major ? 0.04 : 0.022))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  const size = Math.max(7, T * (scale.labels.length <= 3 ? 0.19 : 0.13))
  ctx.font = `700 ${size}px "Schaltli Oswald", sans-serif`
  ctx.fillStyle = WHITE
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.27)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.caption?.toUpperCase(), props.unit].filter(Boolean).join("  ")
  if (words) {
    const [x, y] = f.point(0.5, 0.85)
    ctx.save()
    ctx.translate(x, y)
    if (f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = `500 ${Math.max(6, T * 0.08)}px "Schaltli Oswald", sans-serif`
    ctx.fillStyle = "#c8ccd0"
    ;(ctx as any).letterSpacing = "1px"
    ctx.fillText(words, 0, 0)
    ;(ctx as any).letterSpacing = "0px"
    ctx.restore()
  }
}
