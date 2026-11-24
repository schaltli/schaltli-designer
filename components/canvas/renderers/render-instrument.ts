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
import { bakedBarFace, bakedGaugeFace, isGreyDepth } from "@/lib/instrument-bake"
import { barNeedle, gaugeNeedle, greyNeedle } from "@/lib/instrument-needles"
import { angle64Of, drawNeedle, levelOf, type NeedleDescription, type NeedlePose, type Rgb565Target } from "@/lib/needle-raster"
import { drawReadout, formatReadout } from "@/lib/instrument-readout"
import type { BakedFace } from "@/lib/instrument-bake"
import { hasNoValue } from "@/lib/render-screen"
import { isSettableLevel } from "@/lib/object-types"
import { restingAt, stepSpring, type SpringState } from "@/lib/instrument-spring"
import { STYLE_META, type InstrumentProps } from "@/lib/instrument"

export interface RenderInstrumentOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  /** The value as text, as the level renderers get it (shownLevelValue). */
  rawValue: string
  colorDepth?: string
  screenBackgroundColor?: string
  requestRedraw?: () => void
  /** Overrides the value's position 0..1 (tests). */
  at?: number
  /**
   * Swing the needle to a new value with the style's spring, as the device
   * does - in Preview and the live view. The editor shows the value at rest.
   */
  animate?: boolean
}

/** Where each styled needle stands while it swings, by object id. */
const motion = new Map<string, SpringState>()

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** The position to draw: the value's, or on the way there when animating. */
function swungAt(o: RenderInstrumentOptions, props: InstrumentProps, target: number): number {
  // E-paper jumps: no motion on a grey panel (spec, «Motion»).
  if (!o.animate || props.motion === "direct" || isGreyDepth(o.colorDepth) || reducedMotion()) {
    motion.delete(o.obj.id)
    return target
  }
  let s = motion.get(o.obj.id)
  if (!s) {
    s = restingAt(target)
    motion.set(o.obj.id, s)
    return target
  }
  if (s.target === target && s.velocity === 0 && s.at === target) return target
  const moving = stepSpring(s, target, performance.now(), STYLE_META[props.style!].spring)
  if (moving && o.requestRedraw) {
    const redraw = o.requestRedraw
    requestAnimationFrame(() => redraw())
  }
  if (!moving) s.last = Number.NaN
  return s.at
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
  baked: BakedFace,
  ground: string,
  desc: NeedleDescription,
  pose: NeedlePose,
) {
  const face = baked.canvas
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
  // The digits show the value itself, at once - not the needle on its way.
  if (baked.readout && !hasNoValue(o.rawValue)) {
    drawReadout(target, baked.readout.desc, baked.readout.strip, formatReadout(o.rawValue, baked.readout.desc.decimals))
  }
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
  const face = bakedGaugeFace(o.obj.properties, size, ground, o.requestRedraw, o.colorDepth)
  if (!face) return true // fonts still loading: drawn on the redraw
  const at = swungAt(o, props, positionOf(o))
  const needle = gaugeNeedle(props.style, size, face.scale)
  compose(o, face, ground, isGreyDepth(o.colorDepth) ? greyNeedle(needle) : needle, {
    angle64: angle64Of(gaugeAngle(props.style, at)),
    shiftX: 0,
    shiftY: 0,
    level: levelOf(at),
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
  const face = bakedBarFace(o.obj.properties, w, h, ground, o.requestRedraw, o.colorDepth)
  if (!face) return true
  const needle = barNeedle(props.style, w, h, o.obj.properties.direction, face.scale)
  const at = swungAt(o, props, positionOf(o))
  compose(o, face, ground, isGreyDepth(o.colorDepth) ? greyNeedle(needle.desc) : needle.desc, {
    angle64: 0,
    shiftX: Math.round(at * needle.travelX),
    shiftY: Math.round(at * needle.travelY),
    level: levelOf(at),
  })
  return true
}
