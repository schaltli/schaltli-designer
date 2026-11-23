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
import { bakedGaugeFace } from "@/lib/instrument-bake"
import { gaugeNeedle } from "@/lib/instrument-needles"
import { angle64Of, drawNeedle, type Rgb565Target } from "@/lib/needle-raster"
import { hasNoValue } from "@/lib/render-screen"

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

export function renderInstrumentGauge(o: RenderInstrumentOptions): boolean {
  const { ctx, obj } = o
  const props = normalizeInstrument(obj.properties)
  if (!props.style) return false
  const size = Math.max(1, Math.round(Math.min(obj.width, obj.height)))
  const ground = applyColorDepth(o.screenBackgroundColor || "#ffffff", o.colorDepth)
  const face = bakedGaugeFace(obj.properties, size, ground, o.requestRedraw)
  if (!face) return true // fonts still loading: drawn on the redraw

  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const at =
    o.at ?? (hasNoValue(o.rawValue) ? 0 : calibratedAt(Number.parseFloat(o.rawValue) || 0, calibrationPoints))

  const buffer = document.createElement("canvas")
  buffer.width = size
  buffer.height = size
  const bctx = buffer.getContext("2d", { willReadFrequently: true })
  if (!bctx) return true
  bctx.drawImage(face.canvas, 0, 0)
  const img = bctx.getImageData(0, 0, size, size)
  const d = img.data
  const g = parseInt(ground.replace("#", "").slice(0, 6), 16)
  const groundPacked = (((g >> 16) & 255) >> 3 << 11) | ((((g >> 8) & 255) >> 2) << 5) | ((g & 255) >> 3)
  const target: Rgb565Target = {
    width: size,
    height: size,
    get(x, y) {
      const i = (y * size + x) * 4
      if (d[i + 3] === 0) return groundPacked
      return ((d[i] >> 3) << 11) | ((d[i + 1] >> 2) << 5) | (d[i + 2] >> 3)
    },
    set(x, y, c) {
      const i = (y * size + x) * 4
      const r = (c >> 11) & 31
      const gg = (c >> 5) & 63
      const b = c & 31
      d[i] = (r << 3) | (r >> 2)
      d[i + 1] = (gg << 2) | (gg >> 4)
      d[i + 2] = (b << 3) | (b >> 2)
      d[i + 3] = 255
    },
  }
  drawNeedle(target, gaugeNeedle(props.style, size), {
    angle64: angle64Of(gaugeAngle(props.style, at)),
    shiftX: 0,
    shiftY: 0,
  })
  bctx.putImageData(img, 0, 0)

  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(buffer, Math.round(obj.x), Math.round(obj.y))
  ctx.imageSmoothingEnabled = smoothing
  return true
}
