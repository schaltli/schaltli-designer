/**
 * Each style's moving part as a needle description (lib/needle-raster.ts),
 * at an object's pixel size. Drawn from the proposals' needles in their
 * 200-unit box (artifact «Instrumentenkabinett»), scaled to the object and
 * put on the eighth-pixel grid here, once - a device receives the result
 * and never needs this file.
 */
import { angle64Of, type FillGrow, type NeedleDescription, type NeedleLayer } from "@/lib/needle-raster"
import { barFrame, STYLE_META, type BarDirection, type BarFrame, type InstrumentStyle } from "@/lib/instrument"
import { NIGHT_BAR_LIGHT, NIGHT_LIGHT, NIGHT_NEEDLE, NIGHT_RING } from "@/components/canvas/instrument-faces/night"
import { RALLY_BAR_FILL, RALLY_ORANGE } from "@/components/canvas/instrument-faces/rally"
import { VFD_BAR_SEGMENTS, VFD_GAUGE_SEGMENTS, vfdBarSegment, vfdGaugeSegment, vfdSegmentColour } from "@/components/canvas/instrument-faces/vfd"
import type { InstrumentScale } from "@/lib/instrument"
import { BRASS, PRESSURE_INK, SIGHT_GLASS, WATER } from "@/components/canvas/instrument-faces/pressure"
import { COIL_INK, COIL_PIVOT, COIL_WINDOW, PROFILE_FACE } from "@/components/canvas/instrument-faces/coil"
import { DECO_BLUE, DECO_GOLD } from "@/components/canvas/instrument-faces/deco"
import { CHROME, NEEDLE_CREAM } from "@/components/canvas/instrument-faces/roadster"
import { LUME, LUME_GREEN, LUME_NEEDLE } from "@/components/canvas/instrument-faces/cockpit"
import { NEEDLE_RED } from "@/components/canvas/instrument-faces/bluered"
import { ENGRAVING_TRACK, INK as ENGRAVING_INK, PAPER } from "@/components/canvas/instrument-faces/engraving"
import type { NeedleShape } from "@/lib/needle-raster"

/** RGB565 from "#rrggbb", bits dropped as the framebuffers drop them. */
export function hex565(hex: string): number {
  const v = parseInt(hex.replace("#", ""), 16)
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
}

/**
 * A packed RGB565 colour as a panel of sixteen greys shows it: its
 * luminance to the nearest grey, quantizeColorFor4Bit()'s rule, packed again.
 */
export function grey565(c: number): number {
  const r5 = (c >> 11) & 31
  const g6 = (c >> 5) & 63
  const b5 = c & 31
  const r = (r5 << 3) | (r5 >> 2)
  const g = (g6 << 2) | (g6 >> 4)
  const b = (b5 << 3) | (b5 >> 2)
  const luma = (77 * r + 150 * g + 29 * b + 128) >> 8
  const grey = Math.floor((luma * 15 + 127) / 255) * 17
  return ((grey >> 3) << 11) | ((grey >> 2) << 5) | (grey >> 3)
}

/** A needle for a grey panel: every colour in it, and its gradient's, to grey. */
export function greyNeedle(desc: NeedleDescription): NeedleDescription {
  return {
    ...desc,
    layers: desc.layers.map((l) => ({
      ...l,
      color: grey565(l.color),
      ...(l.gradient ? { gradient: { ...l.gradient, to: grey565(l.gradient.to) } } : {}),
    })),
  }
}

/** A 200-unit length on an object `size` pixels across, in eighths of a pixel. */
const e8 = (units: number, size: number) => Math.round((units * size * 8) / 200)

/** A soft edge `px` pixels wide whose inside is `inner`/256, fading linearly. */
export function softTable(inner: number, px: number): number[] {
  const out = [inner]
  for (let k = 1; k <= px; k++) out.push(Math.round((inner * (px + 1 - k)) / (px + 1)))
  return out
}

function poly(points: [number, number][], size: number): { poly: [number, number][] } {
  return { poly: points.map(([x, y]) => [e8(x, size), e8(y, size)]) }
}
function circle(cx: number, cy: number, r: number, size: number, rIn = 0) {
  return { circle: [e8(cx, size), e8(cy, size), e8(r, size), e8(rIn, size)] as [number, number, number, number] }
}

/** The fuel gauge: a broad white needle about a low pivot, its shadow, a black cap. */
function fuelGauge(size: number): NeedleDescription {
  const body: [number, number][] = [
    [96.8, 162],
    [103.2, 162],
    [101.5, 68],
    [98.5, 68],
  ]
  const shadowPx = Math.max(1, Math.round((1.8 * size) / 200))
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [poly(body, size)], color: 0, alpha: 256, soft: softTable(180, shadowPx), dy: e8(3, size) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565("#f4f4f4"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 150, 13, size)], color: hex565("#1c1c1c"), alpha: 256 },
    { motion: "static", shapes: [circle(97, 146, 5, size)], color: hex565("#5a5a5a"), alpha: 90, soft: undefined },
  ]
  return { pivot: { x: e8(100, size), y: e8(150, size) }, layers }
}

/** The rally gauge: a broad orange needle with a hard shadow, a black cap with an orange dot. */
function rallyGauge(size: number): NeedleDescription {
  const body: [number, number][] = [
    [96.3, 114],
    [103.7, 114],
    [101.3, 20],
    [98.7, 20],
  ]
  const shadowPx = Math.max(1, Math.round((2 * size) / 200))
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [poly(body, size)], color: 0, alpha: 256, soft: softTable(190, shadowPx), dy: e8(3, size) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(RALLY_ORANGE), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 14, size)], color: hex565("#333333"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 12, size)], color: hex565("#1c1c1c"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 3.5, size)], color: hex565(RALLY_ORANGE), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/**
 * The night cluster: the ring's light grows to the value - a band with
 * round ends, red to orange across the face, glowing - and a slim
 * light-guide needle glows over it.
 */
function nightGauge(size: number): NeedleDescription {
  const m = STYLE_META.night
  const ring = {
    arc: [e8(NIGHT_RING.r, size), e8(NIGHT_RING.width / 2, size), angle64Of(m.sweepFrom), angle64Of(m.sweepTo)] as [number, number, number, number],
  }
  const x0 = Math.floor(((100 - NIGHT_RING.r - NIGHT_RING.width / 2) * size) / 200)
  const x1 = Math.ceil(((100 + NIGHT_RING.r + NIGHT_RING.width / 2) * size) / 200)
  const gradient = { to: hex565(NIGHT_LIGHT.to), axis: "x" as const, start: x0, length: Math.max(1, x1 - x0) }
  const glowPx = Math.max(1, Math.round((4 * size) / 200))
  const body: [number, number][] = [
    [98.4, 69],
    [101.6, 69],
    [100.5, 15],
    [99.5, 15],
  ]
  const layers: NeedleLayer[] = [
    { motion: "fill", shapes: [ring], color: hex565(NIGHT_LIGHT.from), alpha: 256, soft: softTable(130, glowPx), gradient },
    { motion: "fill", shapes: [ring], color: hex565(NIGHT_LIGHT.from), alpha: 256, gradient },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(NIGHT_NEEDLE), alpha: 256, soft: softTable(140, glowPx) },
    { motion: "rotate", shapes: [poly(body, size)], color: hex565(NIGHT_NEEDLE), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** A rectangle (200-unit box) turned by `deg` about its middle, as a polygon. */
function turnedRect(x0: number, y0: number, x1: number, y1: number, deg: number): [number, number][] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const a = (deg * Math.PI) / 180
  return (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as [number, number][]
  ).map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)])
}

/** The pressure gauge: a dark needle with a ring and an arrow, a counterweight, a soft shadow, a brass cap. */
function pressureGauge(size: number): NeedleDescription {
  const shapes = [
    circle(100, 117, 7, size),
    poly(
      [
        [98.2, 117],
        [101.8, 117],
        [100.9, 40],
        [99.1, 40],
      ],
      size,
    ),
    poly(
      [
        [100, 21],
        [103.6, 40],
        [96.4, 40],
      ],
      size,
    ),
    circle(100, 54, 6.1, size, 3.9),
  ]
  const shadowPx = Math.max(1, Math.round((2.7 * size) / 200))
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes, color: 0, alpha: 256, soft: softTable(115, shadowPx), dy: e8(3, size) },
    { motion: "rotate", shapes, color: hex565(PRESSURE_INK), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 8, size)], color: hex565(BRASS), alpha: 256 },
    { motion: "static", shapes: [poly(turnedRect(95, 99.2, 105, 100.8, 32), size)], color: hex565("#4a300c"), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** The moving-coil meter: a thin black needle with a knife edge, about a pivot below the window, cut off at its edges. */
function coilGauge(size: number): NeedleDescription {
  const k = size / 200
  const clip: [number, number, number, number] = [
    Math.ceil(COIL_WINDOW.x0 * k),
    Math.ceil(COIL_WINDOW.y0 * k),
    Math.floor(COIL_WINDOW.x1 * k),
    Math.floor(COIL_WINDOW.y1 * k),
  ]
  const { x, y } = COIL_PIVOT
  const shapes = [
    poly(
      [
        [x - 0.9, y],
        [x + 0.9, y],
        [x + 0.35, 72],
        [x - 0.35, 72],
      ],
      size,
    ),
    // The knife edge: never thinner than a third of a pixel, or it would vanish.
    poly(
      [
        [x - Math.max(0.35, 70 / size), 72],
        [x + Math.max(0.35, 70 / size), 72],
        [x + Math.max(0.35, 70 / size), 58],
        [x - Math.max(0.35, 70 / size), 58],
      ],
      size,
    ),
  ]
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes, color: 0, alpha: 256, soft: softTable(60, Math.max(1, Math.round((1.5 * size) / 200))), dx: e8(1.5, size), dy: e8(1.5, size), clip },
    { motion: "rotate", shapes, color: hex565(COIL_INK), alpha: 256, clip },
  ]
  return { pivot: { x: e8(x, size), y: e8(y, size) }, layers }
}

/** Art deco: a blued Breguet needle - shaft, arrow tip, open ring, tail and its weight - its soft shadow, a gold cap. */
function decoGauge(size: number): NeedleDescription {
  const shapes = [
    poly(
      [
        [99.3, 100],
        [100.7, 100],
        [100.35, 28],
        [99.65, 28],
      ],
      size,
    ),
    poly(
      [
        [100, 17],
        [101.7, 28],
        [98.3, 28],
      ],
      size,
    ),
    poly(
      [
        [99, 100],
        [101, 100],
        [101, 118],
        [99, 118],
      ],
      size,
    ),
    circle(100, 121, 4, size),
    circle(100, 46, 5.4, size, 3.8),
  ]
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes, color: 0, alpha: 256, soft: softTable(90, Math.max(1, Math.round((2.1 * size) / 200))), dy: e8(2.5, size) },
    { motion: "rotate", shapes, color: hex565(DECO_BLUE), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 6.5, size)], color: hex565(DECO_GOLD), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 2, size)], color: hex565(DECO_BLUE), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** The engraving: a needle outlined in ink, its right half inked in - an engraver's shading - and an open cap. */
function engravingGauge(size: number): NeedleDescription {
  const ink = hex565(ENGRAVING_INK)
  const paper = hex565(PAPER)
  const layers: NeedleLayer[] = [
    {
      motion: "rotate",
      shapes: [
        poly(
          [
            [100, 20],
            [104, 44],
            [101.6, 114],
            [98.4, 114],
            [96, 44],
          ],
          size,
        ),
      ],
      color: ink,
      alpha: 256,
    },
    {
      motion: "rotate",
      shapes: [
        poly(
          [
            [99.55, 24],
            [99.55, 113.1],
            [99.1, 113.1],
            [96.95, 44.2],
          ],
          size,
        ),
      ],
      color: paper,
      alpha: 256,
    },
    { motion: "static", shapes: [circle(100, 100, 7.7, size)], color: ink, alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 6.3, size)], color: paper, alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 2, size)], color: ink, alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** The roadster: a slim cream needle with a short tail, its shadow, a chrome cap. */
function roadsterGauge(size: number): NeedleDescription {
  const shapes = [
    poly(
      [
        [98.5, 112],
        [101.5, 112],
        [100.5, 22],
        [99.5, 22],
      ],
      size,
    ),
    poly(
      [
        [98.5, 100],
        [101.5, 100],
        [101.5, 116],
        [98.5, 116],
      ],
      size,
    ),
  ]
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes, color: 0, alpha: 256, soft: softTable(155, Math.max(1, Math.round((2.2 * size) / 200))), dy: e8(2.5, size) },
    { motion: "rotate", shapes, color: hex565(NEEDLE_CREAM), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 9, size)], color: hex565(CHROME), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 3, size)], color: hex565("#1a1a1a"), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** The cockpit instrument: a broad luminous needle with a green lume strip, a dark counterweight, a hard shadow. */
function cockpitGauge(size: number): NeedleDescription {
  const body = poly(
    [
      [100, 22],
      [104, 38],
      [104, 100],
      [96, 100],
      [96, 38],
    ],
    size,
  )
  const tail = poly(
    [
      [97.2, 99.7],
      [102.8, 99.7],
      [102.8, 126.3],
      [97.2, 126.3],
    ],
    size,
  )
  const tailInner = poly(
    [
      [97.8, 100.3],
      [102.2, 100.3],
      [102.2, 125.7],
      [97.8, 125.7],
    ],
    size,
  )
  const lume = poly(
    [
      [100, 30],
      [102, 40],
      [102, 90],
      [98, 90],
      [98, 40],
    ],
    size,
  )
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [tail, body], color: 0, alpha: 256, soft: softTable(180, Math.max(1, Math.round((2.4 * size) / 200))), dy: e8(3, size) },
    { motion: "rotate", shapes: [tail], color: hex565("#4a4c50"), alpha: 256 },
    { motion: "rotate", shapes: [tailInner], color: hex565("#202124"), alpha: 256 },
    { motion: "rotate", shapes: [body], color: hex565(LUME_NEEDLE), alpha: 256 },
    { motion: "rotate", shapes: [lume], color: hex565(LUME_GREEN), alpha: 191 },
    { motion: "static", shapes: [circle(100, 100, 7.5, size)], color: hex565("#55575c"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 6.5, size)], color: hex565("#1b1c1e"), alpha: 256 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** Blue and red: a self-luminous red needle with its glow, under a large dark hub. */
function blueredGauge(size: number): NeedleDescription {
  const body = poly(
    [
      [98.2, 118],
      [101.8, 118],
      [100.7, 18],
      [99.3, 18],
    ],
    size,
  )
  const layers: NeedleLayer[] = [
    { motion: "rotate", shapes: [body], color: hex565(NEEDLE_RED), alpha: 256, soft: softTable(120, Math.max(1, Math.round((3.6 * size) / 200))) },
    { motion: "rotate", shapes: [body], color: hex565(NEEDLE_RED), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 15.5, size)], color: hex565("#000000"), alpha: 256 },
    { motion: "static", shapes: [circle(100, 100, 15, size)], color: hex565("#17191c"), alpha: 256 },
    { motion: "static", shapes: [circle(97, 96, 7, size)], color: hex565("#34373c"), alpha: 70 },
  ]
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers }
}

/** A segment's threshold: lit once the position reaches its middle. */
const threshold = (i: number, n: number) => Math.floor(((i + 0.5) / n) * 4096 + 0.5)

/** Segments grouped by colour, each colour a glow and a body layer. */
function segmentLayers(shapes: { shape: NeedleShape; colour: string }[], glowPx: number): NeedleLayer[] {
  const byColour = new Map<string, NeedleShape[]>()
  for (const { shape, colour } of shapes) byColour.set(colour, [...(byColour.get(colour) ?? []), shape])
  const layers: NeedleLayer[] = []
  for (const [colour, list] of byColour) {
    layers.push({ motion: "segments", shapes: list, color: hex565(colour), alpha: 256, soft: softTable(110, glowPx) })
    layers.push({ motion: "segments", shapes: list, color: hex565(colour), alpha: 256 })
  }
  return layers
}

/** The VFD's ring: 32 segments that light up to the value, in the zones' colours. */
function vfdGauge(size: number, scale: Pick<InstrumentScale, "zones">): NeedleDescription {
  const n = VFD_GAUGE_SEGMENTS.n
  const shapes = Array.from({ length: n }, (_, i) => ({
    shape: { ...poly(vfdGaugeSegment(i), size), t: threshold(i, n) },
    colour: vfdSegmentColour(scale, (i + 0.5) / n),
  }))
  return { pivot: { x: e8(100, size), y: e8(100, size) }, layers: segmentLayers(shapes, Math.max(1, Math.round((3 * size) / 200))) }
}

/**
 * The gauge needle of a style on a square object `size` pixels across.
 * Styles without their own needle yet fall back to the fuel gauge's - until
 * their task draws them (tasks/instrument-styles-todo.md).
 */
export function gaugeNeedle(style: InstrumentStyle, size: number, scale: Pick<InstrumentScale, "zones"> = { zones: [] }): NeedleDescription {
  switch (style) {
    case "vfd":
      return vfdGauge(size, scale)
    case "pressure":
      return pressureGauge(size)
    case "coil":
      return coilGauge(size)
    case "deco":
      return decoGauge(size)
    case "roadster":
      return roadsterGauge(size)
    case "cockpit":
      return cockpitGauge(size)
    case "bluered":
      return blueredGauge(size)
    case "engraving":
      return engravingGauge(size)
    case "rally":
      return rallyGauge(size)
    case "night":
      return nightGauge(size)
    case "fuel":
    default:
      return fuelGauge(size)
  }
}

export interface BarNeedle {
  desc: NeedleDescription
  /** Where the pointer moves at full scale, in eighths: shift = at × travel. */
  travelX: number
  travelY: number
}

/** The fill's full rectangle between depths d0 and d1, in eighths, the way it grows, and its travel. */
function fillRect(f: BarFrame, direction: BarDirection | undefined, d0: number, d1: number) {
  const [ax, ay] = f.point(0, d0)
  const [bx, by] = f.point(1, d1)
  const X0 = Math.round(Math.min(ax, bx) * 8)
  const X1 = Math.round(Math.max(ax, bx) * 8)
  const Y0 = Math.round(Math.min(ay, by) * 8)
  const Y1 = Math.round(Math.max(ay, by) * 8)
  const dir = direction ?? "left-to-right"
  const grow: FillGrow = dir === "left-to-right" ? "right" : dir === "right-to-left" ? "left" : dir === "top-to-bottom" ? "down" : "up"
  const travelX = grow === "right" ? X1 - X0 : grow === "left" ? X0 - X1 : 0
  const travelY = grow === "down" ? Y1 - Y0 : grow === "up" ? Y0 - Y1 : 0
  return { rect: [X0, Y0, X1, Y1] as [number, number, number, number], grow, travelX, travelY }
}

/** The rally bar: the orange fill, cut into twenty by black stripes that stand still over it. */
function rallyBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const fill = fillRect(f, direction, RALLY_BAR_FILL.from, RALLY_BAR_FILL.to)
  const [X0, Y0, X1, Y1] = fill.rect
  const stripe = Math.max(8, Math.round((f.thickness * 2 * 8) / 110))
  const stripes: { rect: [number, number, number, number] }[] = []
  for (let i = 1; i < 20; i++) {
    if (f.vertical) {
      const y = Math.round(Y0 + ((Y1 - Y0) * i) / 20 - stripe / 2)
      stripes.push({ rect: [X0, y, X1, y + stripe] })
    } else {
      const x = Math.round(X0 + ((X1 - X0) * i) / 20 - stripe / 2)
      stripes.push({ rect: [x, Y0, x + stripe, Y1] })
    }
  }
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: hex565(RALLY_ORANGE), alpha: 256 },
    { motion: "static", shapes: stripes, color: hex565("#0d0d0d"), alpha: 256 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: fill.travelX, travelY: fill.travelY }
}

/**
 * The sight glass: water rising in the tube - dark at the walls, light in
 * the middle, as two fills with a gradient across - its meniscus riding on
 * top, and the glass's highlights standing over it.
 */
function pressureBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const [w0, w1] = SIGHT_GLASS.water
  const mid = (w0 + w1) / 2
  const left = fillRect(f, direction, w0, mid)
  const right = fillRect(f, direction, mid, w1)
  const across = (r: [number, number, number, number]) =>
    f.vertical ? { start: Math.floor(r[0] / 8), length: Math.max(1, Math.ceil(r[2] / 8) - Math.floor(r[0] / 8)) } : { start: Math.floor(r[1] / 8), length: Math.max(1, Math.ceil(r[3] / 8) - Math.floor(r[1] / 8)) }
  const axis = f.vertical ? ("x" as const) : ("y" as const)
  // The meniscus: a flat ellipse across the tube at the water's edge, at position 0.
  const [cx, cy] = f.point(0, mid)
  const half = ((w1 - w0) / 2) * f.thickness
  const flat = f.thickness * 0.017
  const ellipse: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const u = Math.cos(a) * half
    const v = Math.sin(a) * flat
    ellipse.push(f.vertical ? [Math.round((cx + u) * 8), Math.round((cy + v) * 8)] : [Math.round((cx + v) * 8), Math.round((cy + u) * 8)])
  }
  const shine = (d0: number, d1: number) => {
    const [ax, ay] = f.point(-0.02, d0)
    const [bx, by] = f.point(1.02, d1)
    return { rect: [Math.round(Math.min(ax, bx) * 8), Math.round(Math.min(ay, by) * 8), Math.round(Math.max(ax, bx) * 8), Math.round(Math.max(ay, by) * 8)] as [number, number, number, number] }
  }
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: left.grow, shapes: [{ rect: left.rect }], color: hex565(WATER.wall), alpha: 256, gradient: { to: hex565(WATER.middle), axis, ...across(left.rect) } },
    { motion: "fill", grow: right.grow, shapes: [{ rect: right.rect }], color: hex565(WATER.middle), alpha: 256, gradient: { to: hex565(WATER.other), axis, ...across(right.rect) } },
    { motion: "translate", shapes: [{ poly: ellipse }], color: hex565(WATER.meniscus), alpha: 217 },
    { motion: "static", shapes: [shine(0.44, 0.467)], color: hex565("#ffffff"), alpha: 90 },
    { motion: "static", shapes: [shine(0.533, 0.543)], color: hex565("#ffffff"), alpha: 46 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: left.travelX, travelY: left.travelY }
}

/** The profile meter: a black line with a red tip, moved along the scale; the window's sheen over it. */
function coilBar(f: BarFrame): BarNeedle {
  const T = f.thickness
  const q = (at: number, d: number, alongPx = 0): [number, number] => {
    const [x, y] = f.point(at, d)
    const [x1, y1] = f.point(at + 0.001, d)
    const len = Math.hypot(x1 - x, y1 - y) || 1
    return [Math.round((x + ((x1 - x) / len) * alongPx) * 8), Math.round((y + ((y1 - y) / len) * alongPx) * 8)]
  }
  const lw = Math.max(0.6, T * 0.008)
  const line: [number, number][] = [q(0, 0.225, -lw), q(0, 0.7, -lw), q(0, 0.7, lw), q(0, 0.225, lw)]
  const tip: [number, number][] = [q(0, 0.775), q(0, 0.675, -T * 0.0275), q(0, 0.675, T * 0.0275)]
  const [a0x, a0y] = f.point(-0.09, PROFILE_FACE[0])
  const [a1x, a1y] = f.point(1.09, PROFILE_FACE[0] + 0.125)
  const sheen = { rect: [Math.round(Math.min(a0x, a1x) * 8), Math.round(Math.min(a0y, a1y) * 8), Math.round(Math.max(a0x, a1x) * 8), Math.round(Math.max(a0y, a1y) * 8)] as [number, number, number, number] }
  const [x0, y0] = f.point(0, 0)
  const [x1, y1] = f.point(1, 0)
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: line }], color: hex565(COIL_INK), alpha: 256 },
    { motion: "translate", shapes: [{ poly: tip }], color: hex565("#b3201a"), alpha: 256 },
    { motion: "static", shapes: [sheen], color: hex565("#ffffff"), alpha: 31 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: Math.round((x1 - x0) * 8), travelY: Math.round((y1 - y0) * 8) }
}

/** Art deco's band thermometer: the red rising in its tube, dark at the walls. */
function decoBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const [b0, b1] = [0.4545, 0.5455]
  const mid = (b0 + b1) / 2
  const left = fillRect(f, direction, b0, mid)
  const right = fillRect(f, direction, mid, b1)
  const axis = f.vertical ? ("x" as const) : ("y" as const)
  const across = (r: [number, number, number, number]) =>
    f.vertical ? { start: Math.floor(r[0] / 8), length: Math.max(1, Math.ceil(r[2] / 8) - Math.floor(r[0] / 8)) } : { start: Math.floor(r[1] / 8), length: Math.max(1, Math.ceil(r[3] / 8) - Math.floor(r[1] / 8)) }
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: left.grow, shapes: [{ rect: left.rect }], color: hex565("#5c1414"), alpha: 256, gradient: { to: hex565("#a33a2a"), axis, ...across(left.rect) } },
    { motion: "fill", grow: right.grow, shapes: [{ rect: right.rect }], color: hex565("#a33a2a"), alpha: 256, gradient: { to: hex565("#5c1414"), axis, ...across(right.rect) } },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: left.travelX, travelY: left.travelY }
}

/**
 * The engraving's bar: ink rising in the track, cut into hatching by paper
 * lines at 45° that stand over the whole track (over paper they vanish).
 */
function engravingBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const fill = fillRect(f, direction, ENGRAVING_TRACK[0], ENGRAVING_TRACK[1])
  const [X0, Y0, X1, Y1] = fill.rect
  const period = Math.max(16, Math.round(f.thickness * 0.029 * 8))
  const inkLine = Math.max(5, Math.round(f.thickness * 0.009 * 8))
  const h = Y1 - Y0
  const stripes: { poly: [number, number][] }[] = []
  for (let x = X0 - h - period; x < X1 + period; x += period) {
    // A paper band from the track's bottom edge up and to the right.
    stripes.push({
      poly: [
        [x + inkLine, Y1],
        [x + period, Y1],
        [x + period + h, Y0],
        [x + inkLine + h, Y0],
      ],
    })
  }
  const clip: [number, number, number, number] = [Math.ceil(X0 / 8), Math.ceil(Y0 / 8), Math.floor(X1 / 8), Math.floor(Y1 / 8)]
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: hex565(ENGRAVING_INK), alpha: 256 },
    { motion: "static", shapes: stripes, color: hex565(PAPER), alpha: 256, clip },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: fill.travelX, travelY: fill.travelY }
}

/** A pointer at position 0 from its points given as (depth, along px) across a bar - moved by translate. */
function pointer(f: BarFrame, pts: [number, number][]): [number, number][] {
  return pts.map(([d, alongPx]) => {
    const [x, y] = f.point(0, d)
    const [x1, y1] = f.point(0.001, d)
    const len = Math.hypot(x1 - x, y1 - y) || 1
    return [Math.round((x + ((x1 - x) / len) * alongPx) * 8), Math.round((y + ((y1 - y) / len) * alongPx) * 8)]
  })
}

function travelOf(f: BarFrame) {
  const [x0, y0] = f.point(0, 0)
  const [x1, y1] = f.point(1, 0)
  return { travelX: Math.round((x1 - x0) * 8), travelY: Math.round((y1 - y0) * 8) }
}

/** The roadster's bar: a slim cream needle standing across the scale, with its shadow. */
function roadsterBar(f: BarFrame): BarNeedle {
  const T = f.thickness
  const w = Math.max(0.6, T * 0.0127)
  const needle = pointer(f, [
    [0.327, -T * 0.0045],
    [0.836, -w],
    [0.836, w],
    [0.327, T * 0.0045],
  ])
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: needle }], color: 0, alpha: 256, soft: softTable(150, Math.max(1, Math.round(T * 0.016))), dy: Math.max(8, Math.round(T * 0.018 * 8)) },
    { motion: "translate", shapes: [{ poly: needle }], color: hex565(NEEDLE_CREAM), alpha: 256 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, ...travelOf(f) }
}

/** The cockpit's bar: a luminous triangle pointing at the scale. */
function cockpitBar(f: BarFrame): BarNeedle {
  const T = f.thickness
  const tri = pointer(f, [
    [0.41, 0],
    [0.52, -T * 0.06],
    [0.52, T * 0.06],
  ])
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: tri }], color: hex565(LUME), alpha: 256, soft: softTable(70, Math.max(1, Math.round(T * 0.012))) },
    { motion: "translate", shapes: [{ poly: tri }], color: hex565(LUME_NEEDLE), alpha: 256 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, ...travelOf(f) }
}

/** Blue and red's bar: a slim red needle across the scale, glowing. */
function blueredBar(f: BarFrame): BarNeedle {
  const T = f.thickness
  const w = Math.max(0.6, T * 0.0118)
  const needle = pointer(f, [
    [0.327, -T * 0.0045],
    [0.709, -w],
    [0.709, w],
    [0.327, T * 0.0045],
  ])
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: needle }], color: hex565(NEEDLE_RED), alpha: 256, soft: softTable(120, Math.max(1, Math.round(T * 0.03))) },
    { motion: "translate", shapes: [{ poly: needle }], color: hex565(NEEDLE_RED), alpha: 256 },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, ...travelOf(f) }
}

/** The night strip: a thin light, red to orange along the scale, glowing. */
function nightBar(f: BarFrame, direction: BarDirection | undefined): BarNeedle {
  const fill = fillRect(f, direction, NIGHT_BAR_LIGHT.from, NIGHT_BAR_LIGHT.to)
  const [X0, Y0, X1, Y1] = fill.rect
  // The gradient runs from the start of the scale to its end, whichever way that is.
  const reversed = fill.grow === "left" || fill.grow === "up"
  const axis = f.vertical ? ("y" as const) : ("x" as const)
  const start = Math.floor((f.vertical ? Y0 : X0) / 8)
  const length = Math.max(1, Math.ceil((f.vertical ? Y1 : X1) / 8) - start)
  const from = hex565(reversed ? NIGHT_LIGHT.to : NIGHT_LIGHT.from)
  const gradient = { to: hex565(reversed ? NIGHT_LIGHT.from : NIGHT_LIGHT.to), axis, start, length }
  const glowPx = Math.max(1, Math.round(f.thickness * 0.03))
  const layers: NeedleLayer[] = [
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: from, alpha: 256, soft: softTable(130, glowPx), gradient },
    { motion: "fill", grow: fill.grow, shapes: [{ rect: fill.rect }], color: from, alpha: 256, gradient },
  ]
  return { desc: { pivot: { x: 0, y: 0 }, layers }, travelX: fill.travelX, travelY: fill.travelY }
}

/**
 * A styled bar's moving part, `width` × `height` running `direction`: a
 * pointer given at position 0 and moved along the scale by the needle
 * raster's translate, or a fill that grows to the value.
 */
export function barNeedle(
  style: InstrumentStyle,
  width: number,
  height: number,
  direction: BarDirection | undefined,
  scale: Pick<InstrumentScale, "zones"> = { zones: [] },
): BarNeedle {
  const f = barFrame(width, height, direction, STYLE_META[style].barTrack)
  if (style === "vfd") {
    const n = VFD_BAR_SEGMENTS.n
    const shapes = Array.from({ length: n }, (_, i) => {
      const [x0, y0, x1, y1] = vfdBarSegment(f, i)
      return {
        shape: { rect: [Math.round(x0 * 8), Math.round(y0 * 8), Math.round(x1 * 8), Math.round(y1 * 8)] as [number, number, number, number], t: threshold(i, n) },
        colour: vfdSegmentColour(scale, (i + 0.5) / n),
      }
    })
    return { desc: { pivot: { x: 0, y: 0 }, layers: segmentLayers(shapes, Math.max(1, Math.round(f.thickness * 0.025))) }, travelX: 0, travelY: 0 }
  }
  if (style === "rally") return rallyBar(f, direction)
  if (style === "pressure") return pressureBar(f, direction)
  if (style === "coil") return coilBar(f)
  if (style === "deco") return decoBar(f, direction)
  if (style === "roadster") return roadsterBar(f)
  if (style === "cockpit") return cockpitBar(f)
  if (style === "bluered") return blueredBar(f)
  if (style === "engraving") return engravingBar(f, direction)
  if (style === "night") return nightBar(f, direction)
  const T = f.thickness
  const q = (at: number, d: number, alongPx = 0): [number, number] => {
    // `alongPx` nudges along the scale (for the triangle's base), whichever way it runs.
    const [x, y] = f.point(at, d)
    const [x1, y1] = f.point(at + 0.001, d)
    const len = Math.hypot(x1 - x, y1 - y) || 1
    return [Math.round((x + ((x1 - x) / len) * alongPx) * 8), Math.round((y + ((y1 - y) / len) * alongPx) * 8)]
  }
  const half = T * 0.07
  const triangle: [number, number][] = [q(0, 0.47), q(0, 0.35, -half), q(0, 0.35, half)]
  const [x0, y0] = f.point(0, 0)
  const [x1, y1] = f.point(1, 0)
  const shadowPx = Math.max(1, Math.round(T * 0.015))
  const layers: NeedleLayer[] = [
    { motion: "translate", shapes: [{ poly: triangle }], color: 0, alpha: 256, soft: softTable(170, shadowPx), dy: Math.max(8, Math.round(T * 0.02 * 8)) },
    { motion: "translate", shapes: [{ poly: triangle }], color: hex565("#f4f4f4"), alpha: 256 },
  ]
  return {
    desc: { pivot: { x: 0, y: 0 }, layers },
    travelX: Math.round((x1 - x0) * 8),
    travelY: Math.round((y1 - y0) * 8),
  }
}
