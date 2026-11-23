/**
 * A styled gauge (docs/2026-11-23-instrument-styles.md): the baked face
 * (lib/instrument-bake.ts) with the needle drawn into it at the value by
 * lib/needle-raster.ts - the integer code every device runs - at 1:1 in an
 * offscreen canvas, then put on the canvas as one picture, as a ring is
 * (render-arc-level.ts: drawImage keeps the zoom, smoothing off shows the
 * device's pixels magnified).
 *
 * Without a value the needle rests on its stop, as an instrument without
 * power does.
 */
import type { ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { calibratedAt, gaugeAngle, normalizeInstrument } from "@/lib/instrument"
import { bakedBarFace, bakedGaugeFace } from "@/lib/instrument-bake"
import { barNeedle, gaugeNeedle } from "@/lib/instrument-needles"
import { angle64Of, drawNeedle, type NeedleDescription, type NeedlePose, type Rgb565Target } from "@/lib/needle-raster"
import { hasNoValue } from "@/lib/render-screen"
import { isSettableLevel } from "@/lib/object-types"

export interface RenderInstrumentOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  /** The value as text, as the level renderers get it (shownLevelValue). */
  rawValue: string
  colorDepth?: string
  screenBackgroundColor?: string
  requestRedraw?: () => void
  /** Overrides the value's position 0..1 - for the preview's swinging needle (I6). */
  at?: number
}

const LINEAR = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

function positionOf(o: RenderInstrumentOptions): number {
  if (o.at !== undefined) return o.at
  if (hasNoValue(o.rawValue)) return 0
  return calibratedAt(Number.parseFloat(o.rawValue) || 0, o.obj.properties.calibrationPoints || LINEAR)
}

/** The face with the needle drawn into it at 1:1, put on `ctx` at the object's place. */
function compose(
  o: RenderInstrumentOptions,
  face: HTMLCanvasElement,
  ground: string,
  desc: NeedleDescription,
  pose: NeedlePose,
) {
  const w = face.width
  const h = face.height
  const buffer = document.createElement("canvas")
  buffer.width = w
  buffer.height = h
  const bctx = buffer.getContext("2d", { willReadFrequently: true })
  if (!bctx) return
  bctx.drawImage(face, 0, 0)
  const img = bctx.getImageData(0, 0, w, h)
  const d = img.data
  const g = parseInt(ground.replace("#", "").slice(0, 6), 16)
  const groundPacked = ((((g >> 16) & 255) >> 3) << 11) | ((((g >> 8) & 255) >> 2) << 5) | ((g & 255) >> 3)
  const target: Rgb565Target = {
    width: w,
    height: h,
    get(x, y) {
      const i = (y * w + x) * 4
      if (d[i + 3] === 0) return groundPacked
      return ((d[i] >> 3) << 11) | ((d[i + 1] >> 2) << 5) | (d[i + 2] >> 3)
    },
    set(x, y, c) {
      const i = (y * w + x) * 4
      const r = (c >> 11) & 31
      const gg = (c >> 5) & 63
      const b = c & 31
      d[i] = (r << 3) | (r >> 2)
      d[i + 1] = (gg << 2) | (gg >> 4)
      d[i + 2] = (b << 3) | (b >> 2)
      d[i + 3] = 255
    },
  }
  drawNeedle(target, desc, pose)
  bctx.putImageData(img, 0, 0)
  const smoothing = o.ctx.imageSmoothingEnabled
  o.ctx.imageSmoothingEnabled = false
  o.ctx.drawImage(buffer, Math.round(o.obj.x), Math.round(o.obj.y))
  o.ctx.imageSmoothingEnabled = smoothing
}

export function renderInstrumentGauge(o: RenderInstrumentOptions): boolean {
  // Only the read-only gauge is styled; a dial keeps its ring (spec, «Out of scope»).
  if (isSettableLevel(o.obj.type)) return false
  const props = normalizeInstrument(o.obj.properties)
  if (!props.style) return false
  const size = Math.max(1, Math.round(Math.min(o.obj.width, o.obj.height)))
  const ground = applyColorDepth(o.screenBackgroundColor || "#ffffff", o.colorDepth)
  const face = bakedGaugeFace(o.obj.properties, size, ground, o.requestRedraw)
  if (!face) return true // fonts still loading: drawn on the redraw
  compose(o, face.canvas, ground, gaugeNeedle(props.style, size), {
    angle64: angle64Of(gaugeAngle(props.style, positionOf(o))),
    shiftX: 0,
    shiftY: 0,
  })
  return true
}

/** A styled bar: its baked face and the pointer moved along the scale. */
export function renderInstrumentBar(o: RenderInstrumentOptions): boolean {
  if (isSettableLevel(o.obj.type)) return false
  const props = normalizeInstrument(o.obj.properties)
  if (!props.style) return false
  const w = Math.max(1, Math.round(o.obj.width))
  const h = Math.max(1, Math.round(o.obj.height))
  const ground = applyColorDepth(o.screenBackgroundColor || "#ffffff", o.colorDepth)
  const face = bakedBarFace(o.obj.properties, w, h, ground, o.requestRedraw)
  if (!face) return true
  const needle = barNeedle(props.style, w, h, o.obj.properties.direction)
  const at = positionOf(o)
  compose(o, face.canvas, ground, needle.desc, {
    angle64: 0,
    shiftX: Math.round(at * needle.travelX),
    shiftY: Math.round(at * needle.travelY),
  })
  return true
}
