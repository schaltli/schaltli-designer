/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenObject, ProjectFont, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel, alignToPixelBoundary } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"

interface RenderLevelIndicatorOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  topics: Topic[]
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  colorDepth?: string
  requestRedraw?: () => void
}

export function renderLevelIndicator(options: RenderLevelIndicatorOptions): void {
  const { ctx, obj, fonts, zoom, bdfFontCache, getPreviewValueFromTopic, colorDepth, requestRedraw } = options

  // Draw background - quantized to pure black/white on 1-bit devices, same
  // as labels/fields (lib/color-depth.ts). This used to draw the literal
  // CSS color unquantized, so e.g. "#cccccc" showed as light gray here but
  // resolved to solid white on the real (1-bit) device - a real HIL
  // mismatch that was never caught because no level-indicator test project
  // existed yet (2026-07-21 finding).
  const levelBgColor = applyColorDepth(obj.properties.backgroundColor || "#ffffff", colorDepth)
  if (levelBgColor !== "transparent") {
    ctx.fillStyle = levelBgColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Draw border - same quantization. A 1px stroke centered on an integer
  // coordinate straddles the pixel boundary and gets anti-aliased across two
  // rows/columns instead of landing on one crisp pixel - offsetting by 0.5
  // (alignToPixelBoundary) centers it on the pixel instead, matching the
  // same fix already applied to labels/fields (render-text-box.ts). Width/
  // height shrink by 1 so the stroke's outer edge lands on the same pixel
  // the fill already occupies rather than one pixel further out (2026-07-21
  // HIL finding - this box previously bled visible gray/blurred edges even
  // though both colors involved were pure black or white).
  const levelBorderColor = applyColorDepth(obj.properties.borderColor || "#cccccc", colorDepth)
  if (levelBorderColor !== "transparent") {
    ctx.strokeStyle = levelBorderColor
    ctx.lineWidth = 1 // 1 canvas pixel - scales with zoom
    ctx.strokeRect(
      alignToPixelBoundary(Math.round(obj.x)),
      alignToPixelBoundary(Math.round(obj.y)),
      Math.round(obj.width) - 1,
      Math.round(obj.height) - 1
    )
  }

  // Get current value from topic
  const rawLevelValue = getPreviewValueFromTopic(obj.properties.topic) || "50"
  const numericLevelValue = Number.parseFloat(rawLevelValue) || 0

  // Calculate fill percentage based on calibration points
  const calibrationPoints = obj.properties.calibrationPoints || [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  const fillPercent = calculateLevelIndicatorFill(numericLevelValue, calibrationPoints)

  // Draw the value text (first pass - with fill color, visible outside bar area)
  const levelFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const displayValue = obj.properties.displayValue || "value"
  
  const fillColor = applyColorDepth(obj.properties.fillColor || "#4CAF50", colorDepth)

  if (displayValue !== "none") {
    const displayText = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawLevelValue

    // First pass: Draw text with fill color (will be visible outside bar)
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, fillColor, false, undefined, requestRedraw)

    // Draw the level indicator bar
    drawLevelBar(ctx, obj, fillPercent, zoom, fillColor)

    // Second pass: Draw text with background color, clipped to bar region
    // This makes text visible over the bar
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, levelBgColor, true, fillPercent, requestRedraw)
  } else {
    // No text, just draw the bar
    drawLevelBar(ctx, obj, fillPercent, zoom, fillColor)
  }
}

// Exported for reuse by render-mqtt-data-line.ts: MqttDataLine's own
// {value, barSizePercent} calibration points (reinterpreted there as
// value->strokeWidth-in-px, not a literal percentage) drive through this
// exact same sort/clamp/linear-interpolate function rather than a
// duplicate copy - see that file's header comment for why the field name
// stays as-is (2026-07-31 grill-me session).
export function calculateLevelIndicatorFill(value: number, calibrationPoints: any[]): number {
  if (!calibrationPoints || calibrationPoints.length === 0) {
    return 0
  }

  // Sort calibration points by value
  const sortedPoints = [...calibrationPoints].sort((a, b) => a.value - b.value)

  // If value is below the lowest point, return the lowest bar size
  if (value <= sortedPoints[0].value) {
    return sortedPoints[0].barSizePercent
  }

  // If value is above the highest point, return the highest bar size
  if (value >= sortedPoints[sortedPoints.length - 1].value) {
    return sortedPoints[sortedPoints.length - 1].barSizePercent
  }

  // Find the two points to interpolate between
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const point1 = sortedPoints[i]
    const point2 = sortedPoints[i + 1]

    if (value >= point1.value && value <= point2.value) {
      // Linear interpolation
      const ratio = (value - point1.value) / (point2.value - point1.value)
      return point1.barSizePercent + ratio * (point2.barSizePercent - point1.barSizePercent)
    }
  }

  return 0
}

// Computes the filled sub-rect of the bar, matching the firmware exactly:
// `int fillWidth = (innerWidth * fillPercent) / 100;` truncates toward zero
// on assignment to an int. A plain JS float division left here produced a
// fractional-height/width fillRect, which the canvas anti-aliases into a
// partial-coverage (non-pure black/white) edge row/column - a real 1-pixel-
// row HIL mismatch even though every color involved was already quantized
// to pure black or white (2026-07-21 finding). Math.trunc (not Math.floor)
// mirrors C's toward-zero truncation, though for these non-negative inputs
// the two agree.
function computeBarFillRect(obj: ScreenObject, fillPercent: number): { x: number; y: number; w: number; h: number } {
  const barDirection = obj.properties.barDirection || "left-to-right"
  const padding = 4
  const innerX = obj.x + padding
  const innerY = obj.y + padding
  const innerWidth = obj.width - padding * 2
  const innerHeight = obj.height - padding * 2

  switch (barDirection) {
    case "right-to-left": {
      const fillWidth = Math.trunc((innerWidth * fillPercent) / 100)
      return { x: innerX + innerWidth - fillWidth, y: innerY, w: fillWidth, h: innerHeight }
    }
    case "bottom-to-top": {
      const fillHeight = Math.trunc((innerHeight * fillPercent) / 100)
      return { x: innerX, y: innerY + innerHeight - fillHeight, w: innerWidth, h: fillHeight }
    }
    case "top-to-bottom": {
      const fillHeight = Math.trunc((innerHeight * fillPercent) / 100)
      return { x: innerX, y: innerY, w: innerWidth, h: fillHeight }
    }
    case "left-to-right":
    default: {
      const fillWidth = Math.trunc((innerWidth * fillPercent) / 100)
      return { x: innerX, y: innerY, w: fillWidth, h: innerHeight }
    }
  }
}

function drawLevelBar(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  fillPercent: number,
  zoom: number,
  fillColor: string
): void {
  ctx.fillStyle = fillColor
  const r = computeBarFillRect(obj, fillPercent)
  ctx.fillRect(r.x, r.y, r.w, r.h)
}

function drawLevelText(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  displayText: string,
  levelFontMeta: ProjectFont | undefined,
  fonts: ProjectFont[],
  bdfFontCache: Map<string, BDFFont>,
  textColor?: string,
  clipToBar: boolean = false,
  fillPercent?: number,
  requestRedraw?: () => void
): void {
  // textColor is always passed explicitly by both call sites below (already
  // quantized), so this fallback is dead in practice - left unquantized
  // rather than threading colorDepth through for a path that never runs.
  const finalTextColor = textColor || obj.properties.textColor || "#000000"
  ctx.fillStyle = finalTextColor
  
  const fontId = obj.properties.fontId
  let bdfFont: BDFFont | null = null
  
  if (fontId && levelFontMeta && levelFontMeta.format !== "ttf") {
    // Try to get from cache first
    bdfFont = bdfFontCache.get(fontId) || null

    // If not in cache, try to parse and cache it
    if (!bdfFont && levelFontMeta.data) {
      try {
        bdfFont = new BDFFont(levelFontMeta.data)
        bdfFontCache.set(fontId, bdfFont)
      } catch (error) {
        console.error("Failed to parse BDF font for level indicator:", error)
        bdfFont = null
      }
    }
  }
  
  if (bdfFont) {
    // Use BDF font rendering with pixel-perfect alignment
    ctx.save()
    
    // Clip to level indicator bounding box
    ctx.beginPath()
    ctx.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.clip()
    
    const textMetrics = bdfFont.measureText(displayText)
    const textX = alignToPixel(obj.x + (obj.width - textMetrics.width) / 2)
    
    // Calculate baseline position for vertical centering
    const fontAscent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
    const fontDescent = bdfFont.properties["FONT_DESCENT"] || bdfFont.properties["DESCENT"] || 4
    const fontHeight = fontAscent + fontDescent
    
    // Center the text vertically in the bounding box
    // dist = (bb.height - (fontAscent + fontDescent)) / 2
    // baselineY = bb.y + dist + fontAscent
    const dist = (obj.height - fontHeight) / 2
    const baselineY = alignToPixel(obj.y + dist + fontAscent)
    
    // Apply additional clipping to bar region if needed - same truncated
    // geometry as the bar fill itself (computeBarFillRect), so the clip
    // edge lands on exactly the same pixel the bar's own edge does.
    if (clipToBar && fillPercent !== undefined) {
      ctx.save()
      const r = computeBarFillRect(obj, fillPercent)
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }
    
    // Draw the text using BDF font
    bdfFont.drawText(ctx, displayText, textX, baselineY)
    
    // Restore twice if we added bar clipping (once for bar clip, once for bounding box clip)
    if (clipToBar && fillPercent !== undefined) {
      ctx.restore() // Restore bar clip
    }
    ctx.restore() // Restore bounding box clip
  } else {
    // Fall back to standard font rendering - a real TTF font when fontId
    // resolves to one (registering it if needed), otherwise the original
    // generic fallback. Both use the same centered "middle" baseline
    // positioning; only the family/size source differs.
    ctx.save()

    // Clip to level indicator bounding box
    ctx.beginPath()
    ctx.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.clip()

    const isTtf = levelFontMeta?.format === "ttf"
    if (isTtf && !isTtfFontLoaded(levelFontMeta)) {
      ensureTtfFontRegistered(levelFontMeta, requestRedraw ?? (() => {}))
    }
    const fontSize = isTtf ? levelFontMeta.size : obj.properties.fontSize || 14
    const fontFamily = isTtf ? (levelFontMeta.internalName ?? levelFontMeta.name) : obj.properties.fontFamily || "Arial"
    const fontWeight = obj.properties.fontWeight || "normal"

    // Apply additional clipping to bar region if needed - same truncated
    // geometry as the bar fill itself (computeBarFillRect), so the clip
    // edge lands on exactly the same pixel the bar's own edge does.
    if (clipToBar && fillPercent !== undefined) {
      ctx.save()
      const r = computeBarFillRect(obj, fillPercent)
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }

    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(displayText, obj.x + obj.width / 2, obj.y + obj.height / 2)

    // Restore twice if we added bar clipping (once for bar clip, once for bounding box clip)
    if (clipToBar && fillPercent !== undefined) {
      ctx.restore() // Restore bar clip
    }
    ctx.restore() // Restore bounding box clip
  }
}
