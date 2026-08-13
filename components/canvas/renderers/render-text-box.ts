/**
 * Shared background/border/text drawing for anything that's fundamentally a
 * text label in a box: static labels (render-label.ts) and MQTT data fields
 * in text display mode (render-mqtt-field.ts). A data field is a label plus
 * a value bound to an MQTT topic - the actual pixels (background fill,
 * border stroke, BDF/fallback text rendering, pixel-perfect clipping,
 * selection baseline/handles) must come from the exact same code, not two
 * copies that can drift apart. Verified pixel-perfect against real hardware
 * for labels via HIL testing (2026-07-20); MqttDataField had silently
 * drifted from that (missing the center/right-align "+1" cursor-bias fix,
 * a different text-color property fallback order) before this file existed.
 */

import type { ScreenObject, ProjectFont } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { getFontHeight, getFontAscent, alignToPixelBoundary, forceIntegerCoordinates, setupPixelPerfectRendering } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"

export interface TextBoxOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  text: string
  fonts: ProjectFont[]
  isSelected: boolean
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  colorDepth?: string
  drawBorder?: boolean // default true; MQTTIconField draws its own icon instead
  // Called once a not-yet-loaded TTF font finishes loading, so the caller
  // can redraw with the real font instead of that frame's fallback. Optional
  // only because a couple of call sites (selection-handle-only redraws)
  // don't have a redraw loop to hook into - fine, they'll pick up the real
  // font on the next redraw that does pass it.
  requestRedraw?: () => void
}

// Resolves the text color the same way on both properties a field might use
// - `color` (what labels use) takes precedence, `textColor` (what MQTT
// fields historically used) is the fallback. Both renderers now agree on
// this order; the firmware (ScreenRenderer.cpp) already checked `color`
// first, so this makes the designer match it instead of drifting further.
function resolveTextColor(obj: ScreenObject): string {
  return obj.properties.color || obj.properties.textColor || "#000000"
}

function getBoundingBoxHeight(obj: ScreenObject, fonts: ProjectFont[]): number {
  const fontId = obj.properties.fontId
  if (fontId) {
    const font = fonts.find((f) => f.id === fontId)
    if (font) return getFontHeight(font)
  }
  return obj.height
}

export function loadBdfFont(obj: ScreenObject, fonts: ProjectFont[], bdfFontCache: Map<string, BDFFont>): BDFFont | null {
  const fontId = obj.properties.fontId
  if (!fontId) return null

  const cached = bdfFontCache.get(fontId)
  if (cached) return cached

  const font = fonts.find((f) => f.id === fontId)
  // TTF fonts are handled entirely by the caller's TTF branch - BDFFont's
  // parser doesn't throw on non-BDF input (it just silently produces an
  // empty-glyph font object from whatever text it can split into lines),
  // so without this guard a TTF font's base64 data would "successfully"
  // parse into a font with nothing to draw instead of correctly falling
  // through to the TTF branch below.
  if (!font || !font.data || font.format === "ttf") return null

  try {
    const bdfFont = new BDFFont(font.data)
    bdfFontCache.set(fontId, bdfFont)
    return bdfFont
  } catch {
    return null
  }
}

// Background fill only - exported standalone so callers that don't draw
// text at all (e.g. MQTT icon-mode fields) still get the exact same box
// background as a label/data field, not a second implementation.
export function drawBoxBackground(ctx: CanvasRenderingContext2D, obj: ScreenObject, boundingBoxHeight: number, colorDepth?: string): void {
  const bgColor = obj.properties.backgroundColor || "#ffffff"
  if (bgColor === "transparent") return
  ctx.save()
  setupPixelPerfectRendering(ctx)
  ctx.fillStyle = applyColorDepth(bgColor, colorDepth)
  ctx.fillRect(forceIntegerCoordinates(obj.x), forceIntegerCoordinates(obj.y), forceIntegerCoordinates(obj.width), forceIntegerCoordinates(boundingBoxHeight))
  ctx.restore()
}

// Border stroke only - see drawBoxBackground for why this is standalone too.
export function drawBoxBorder(ctx: CanvasRenderingContext2D, obj: ScreenObject, boundingBoxHeight: number, colorDepth?: string): void {
  const borderColor = obj.properties.borderColor !== undefined && obj.properties.borderColor !== null ? obj.properties.borderColor : "#cccccc"
  if (borderColor === "transparent") return
  ctx.save()
  ctx.strokeStyle = applyColorDepth(borderColor, colorDepth)
  ctx.lineWidth = 1
  // A 1px stroke centered on an integer coordinate straddles the pixel
  // boundary and gets anti-aliased across two rows/columns instead of
  // landing on one crisp pixel - offsetting by 0.5 (alignToPixelBoundary)
  // centers it on the pixel instead. Width/height shrink by 1 so the
  // stroke's outer edge lands on the same pixel column/row the fill
  // already occupies, rather than one pixel further out.
  ctx.strokeRect(
    alignToPixelBoundary(Math.round(obj.x)),
    alignToPixelBoundary(Math.round(obj.y)),
    Math.round(obj.width) - 1,
    Math.round(boundingBoxHeight) - 1
  )
  ctx.restore()
}

export function getTextBoxHeight(obj: ScreenObject, fonts: ProjectFont[]): number {
  return getBoundingBoxHeight(obj, fonts)
}

export function drawTextBox(options: TextBoxOptions): void {
  const { ctx, obj, text, fonts, isSelected, zoom, bdfFontCache, colorDepth, drawBorder = true, requestRedraw } = options

  const boundingBoxHeight = getBoundingBoxHeight(obj, fonts)
  const fontId = obj.properties.fontId

  // 1. Background
  drawBoxBackground(ctx, obj, boundingBoxHeight, colorDepth)

  // 2. Border - drawn BEFORE text so text always ends up on top (matches
  // ScreenRenderer.cpp's draw order, fixed 2026-07-20: drawing border last
  // let its stroke erase text ink wherever a glyph's descender reached the
  // box's bottom row).
  if (drawBorder) {
    drawBoxBorder(ctx, obj, boundingBoxHeight, colorDepth)
  }

  // 3. Text
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)
  const lines = text.split("\n")
  const textColor = resolveTextColor(obj)

  if (isSelected && zoom > 0.5) {
    drawBaselineDebug(ctx, obj, fonts, bdfFont, zoom)
  }

  ctx.fillStyle = applyColorDepth(textColor, colorDepth)

  if (bdfFont) {
    ctx.save()
    // Clip glyph drawing to the box's own bounds. Text that's wider than its
    // box (a long string, or a font-metric measurement that's slightly off)
    // would otherwise bleed ink past the box edge - a real HIL pixel-
    // comparison mismatch source (2026-07-20), since the real device
    // doesn't clip either.
    ctx.beginPath()
    ctx.rect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
    ctx.clip()

    const fontHeight = bdfFont.FONTBOUNDINGBOX?.h || 16
    const lineHeight = fontHeight * 1.2
    const fontMeta = fonts.find((f) => f.id === fontId)
    const fontAscent = fontMeta?.ascent || bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14

    lines.forEach((line, index) => {
      const textMetrics = bdfFont.measureText(line)
      const textAlign = obj.properties.textAlign || "left"
      let textX: number
      if (textAlign === "center") {
        textX = forceIntegerCoordinates(obj.x + (obj.width - textMetrics.width) / 2)
      } else if (textAlign === "right") {
        textX = forceIntegerCoordinates(obj.x + obj.width - textMetrics.width)
      } else {
        textX = forceIntegerCoordinates(obj.x)
      }

      const baselineY = forceIntegerCoordinates(obj.y + fontAscent + index * lineHeight)
      bdfFont.drawText(ctx, line, textX, baselineY)
    })

    ctx.restore()
  } else {
    const fontMeta = fonts.find((f) => f.id === fontId)

    if (fontMeta?.format === "ttf") {
      // Real TTF font, resolved from fontId - use its own family/size/
      // ascent (the same metrics the BDF branch above reads), so text
      // positions the same way regardless of which font kind ends up
      // loaded; only the glyph source differs (ctx.fillText vs
      // bdfFont.drawText). Kick off loading if it hasn't started - this
      // frame still draws with whatever the browser currently resolves
      // "familyName" to (a system fallback until the real font lands), and
      // requestRedraw fires once it's actually ready.
      if (!isTtfFontLoaded(fontMeta)) {
        ensureTtfFontRegistered(fontMeta, requestRedraw ?? (() => {}))
      }
      const familyName = fontMeta.internalName ?? fontMeta.name
      const fontAscent = getFontAscent(fontMeta)
      const lineHeight = getFontHeight(fontMeta) * 1.2

      ctx.font = `${obj.properties.fontWeight || "normal"} ${fontMeta.size}px "${familyName}"`
      ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
      ctx.textBaseline = "alphabetic"

      let textX = obj.x
      if (obj.properties.textAlign === "center") {
        textX = obj.x + obj.width / 2
      } else if (obj.properties.textAlign === "right") {
        textX = obj.x + obj.width
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
      ctx.clip()
      lines.forEach((line, index) => {
        ctx.fillText(line, textX, obj.y + fontAscent + index * lineHeight)
      })
      ctx.restore()
    } else {
      // No font resolved at all (no fontId, or a dangling/BDF-without-data
      // reference) - the original generic fallback: won't pixel-match a
      // real device, but keeps the designer usable/previewable.
      ctx.font = `${obj.properties.fontWeight || "normal"} ${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
      ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
      ctx.textBaseline = "top"

      const lineHeight = (obj.properties.fontSize || 14) * 1.2
      let textX = obj.x
      if (obj.properties.textAlign === "center") {
        textX = obj.x + obj.width / 2
      } else if (obj.properties.textAlign === "right") {
        textX = obj.x + obj.width
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
      ctx.clip()
      lines.forEach((line, index) => {
        ctx.fillText(line, textX, obj.y + index * lineHeight)
      })
      ctx.restore()
    }
  }

  // 4. Selection handles
  if (isSelected && zoom > 0.5) {
    drawBaselineHandles(ctx, obj, fonts, bdfFont, zoom)
  }
}

function drawBaselineDebug(ctx: CanvasRenderingContext2D, obj: ScreenObject, fonts: ProjectFont[], bdfFont: BDFFont | null, zoom: number): void {
  const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
  let baselineY: number
  let metricsText: string

  if (fontMeta && bdfFont) {
    const fontAscent = getFontAscent(fontMeta)
    const fontDescent = fontMeta.descent || 0
    const calculatedHeight = getFontHeight(fontMeta)
    baselineY = obj.y + fontAscent
    metricsText = `Height: ${calculatedHeight}px (${fontAscent}+${fontDescent}), Ascent: ${fontAscent}px`
  } else {
    const fontSize = obj.properties.fontSize || 14
    const fontAscent = Math.round(fontSize * 0.8)
    baselineY = obj.y + fontAscent
    metricsText = `Height: ${fontSize}px, Ascent: ${fontAscent}px (est)`
  }

  ctx.save()
  ctx.strokeStyle = "#3b82f6"
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(Math.round(obj.x), Math.round(baselineY))
  ctx.lineTo(Math.round(obj.x + obj.width), Math.round(baselineY))
  ctx.stroke()

  ctx.fillStyle = "#666666"
  ctx.font = `10px monospace`
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillText(metricsText, alignToPixelBoundary(obj.x), alignToPixelBoundary(baselineY + 3))
  ctx.restore()
}

function drawBaselineHandles(ctx: CanvasRenderingContext2D, obj: ScreenObject, fonts: ProjectFont[], bdfFont: BDFFont | null, zoom: number): void {
  const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
  let baselineY: number

  if (fontMeta && bdfFont) {
    baselineY = obj.y + getFontAscent(fontMeta)
  } else {
    const fontSize = obj.properties.fontSize || 14
    baselineY = obj.y + Math.round(fontSize * 0.8)
  }

  const handleSize = 8 / zoom
  const half = handleSize / 2

  ctx.save()
  ctx.fillStyle = "#3b82f6"
  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = 1 / zoom

  const leftHandleX = obj.x - half
  const rightHandleX = obj.x + obj.width - half
  const handleY = baselineY - half

  ctx.fillRect(leftHandleX, handleY, handleSize, handleSize)
  ctx.strokeRect(leftHandleX, handleY, handleSize, handleSize)
  ctx.fillRect(rightHandleX, handleY, handleSize, handleSize)
  ctx.strokeRect(rightHandleX, handleY, handleSize, handleSize)
  ctx.restore()
}
