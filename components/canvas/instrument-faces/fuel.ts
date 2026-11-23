/**
 * The fuel gauge (1992, utility vehicle): gloss-black case, E-½-F or numbers
 * about a low pivot, a red and yellow reserve, a drop below the pivot. From
 * the proposal's truckG() (artifact «Instrumentenkabinett»), in its 200-unit
 * box. The needle is not drawn here - it is lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, type Ctx } from "./common"

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
  gaugeLabels(ctx, "fuel", scale, cx, cy, 61, `700 ${size}px "Schaltli Oswald", sans-serif`, WHITE)

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
    ;(ctx as any).letterSpacing = "1.5px"
    ctx.fillText(props.caption.toUpperCase(), 100, 178)
    ;(ctx as any).letterSpacing = "0px"
  } else {
    drop(ctx, 100, 180, 1.1)
  }
  // The cap is the needle's (it lies over it); the glass lies over both on
  // a real gauge, but over the face only here - over the needle it would
  // have to be redrawn each frame (spec, «Spike results»).
  glassCrescent(ctx, 100, 100, 89, 0.7)
}
