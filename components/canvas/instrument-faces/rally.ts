/**
 * The rally gauge (1974): big white numerals on matt black, a broad orange
 * needle, red at the bottom of the scale - loud and flat, readable from two
 * metres. From the proposal's rallyG()/rallyB() (artifact
 * «Instrumentenkabinett»). The needle, and the bar's orange fill with its
 * black stripes, are lib/instrument-needles.ts's.
 */
import type { InstrumentProps, InstrumentScale, ZoneKind } from "@/lib/instrument"
import { disc, fitFaceLine, gaugeLabels, gaugeTicks, gaugeZones, glassCrescent, linear, roundRect, type BarFrame, type Ctx } from "./common"

export const RALLY_ORANGE = "#ff6a13"
const ZONE_COLOURS: Record<ZoneKind, string> = { danger: "#e8361b", warning: "#f2a705", ok: "#3fae49" }
const WHITE = "#ffffff"

/** Paints the gauge's face on `ctx`, already scaled so the face's box is 200 units. */
export function paintRallyGauge(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps) {
  disc(ctx, 100, 100, 99, linear(ctx, 1, 1, 199, 199, [[0, "#4a4a4a"], [0.5, "#151515"], [1, "#2e2e2e"]]))
  disc(ctx, 100, 100, 93, "#000000")
  disc(ctx, 100, 100, 90, "#121212")

  gaugeZones(ctx, "rally", scale, 100, 100, 83, 7, ZONE_COLOURS)
  gaugeTicks(ctx, "rally", scale, 100, 100, 87, {
    major: { len: 15, width: 3.6 },
    minor: { len: 7, width: 1.6 },
    colour: WHITE,
  })
  const size = scale.labels.length <= 6 ? 21 : scale.labels.length <= 8 ? 17 : 14
  const labelFont = `700 ${size}px "Schaltli Oswald", sans-serif`
  gaugeLabels(ctx, "rally", scale, 100, 100, 61, labelFont, WHITE)
  const room = { style: "rally" as const, scale, labelR: 61, labelFont, faceR: 90 }

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  if (props.caption) {
    ctx.fillStyle = RALLY_ORANGE
    fitFaceLine(ctx, props.caption.toUpperCase(), 136, (px) => `700 ${px}px "Schaltli Oswald", sans-serif`, 12, 3, room)
  }
  if (props.unit) {
    ctx.fillStyle = "#9a9a9a"
    fitFaceLine(ctx, props.unit, 151, (px) => `500 ${px}px "Schaltli Oswald", sans-serif`, 10, 0, room)
  }
  glassCrescent(ctx, 100, 100, 90, 0.8)
}

/** Where the bar's fill lies across the scale (0..1 of the thickness): the needle file draws it there. */
export const RALLY_BAR_FILL = { from: 0.527, to: 0.727 }

/**
 * The rally gauge as a bar: numerals and ticks on one side, the fill's dark
 * track, the reserve strip below it. Drawn at the object's own pixels.
 */
export function paintRallyBar(ctx: Ctx, scale: InstrumentScale, props: InstrumentProps, f: BarFrame, width: number, height: number) {
  const T = f.thickness
  ctx.fillStyle = "#0d0d0d"
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, T * 0.073)
  ctx.fill()
  ctx.strokeStyle = "#333333"
  ctx.lineWidth = Math.max(1, T * 0.014)
  ctx.stroke()

  // The track the fill runs in.
  const [ax, ay] = f.point(0, RALLY_BAR_FILL.from)
  const [bx, by] = f.point(1, RALLY_BAR_FILL.to)
  ctx.fillStyle = "#222222"
  ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))

  for (const z of scale.zones) {
    const [x0, y0] = f.point(z.from, 0.764)
    const [x1, y1] = f.point(z.to, 0.791)
    ctx.fillStyle = ZONE_COLOURS[z.kind]
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1)
  }
  ctx.strokeStyle = WHITE
  for (const t of scale.ticks) {
    const [x0, y0] = f.point(t.at, t.major ? 0.345 : 0.4)
    const [x1, y1] = f.point(t.at, 0.473)
    ctx.lineWidth = Math.max(1, T * (t.major ? 0.027 : 0.013))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.font = `700 ${Math.max(7, T * 0.136)}px "Schaltli Oswald", sans-serif`
  ctx.fillStyle = WHITE
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const l of scale.labels) {
    const [x, y] = f.point(l.at, 0.22)
    ctx.fillText(l.text, x, y)
  }
  const words = [props.caption?.toUpperCase(), props.unit].filter(Boolean).join(" ")
  if (words) {
    const [x, y] = f.point(0.5, 0.873)
    ctx.save()
    ctx.translate(x, y)
    if (f.vertical) ctx.rotate(-Math.PI / 2)
    ctx.font = `700 ${Math.max(6, T * 0.082)}px "Schaltli Oswald", sans-serif`
    ctx.fillStyle = RALLY_ORANGE
    ;(ctx as any).letterSpacing = "2px"
    ctx.fillText(words, 0, 0)
    ;(ctx as any).letterSpacing = "0px"
    ctx.restore()
  }
  if (!f.vertical) {
    // The glass's sheen over the top of a flat window.
    const inset = T * 0.036
    ctx.globalAlpha = 0.5
    ctx.fillStyle = linear(ctx, 0, inset, 0, T * 0.31, [
      [0, "#ffffff", 0.3],
      [1, "#ffffff", 0],
    ])
    roundRect(ctx, inset, inset, width - 2 * inset, T * 0.27, T * 0.055)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}
