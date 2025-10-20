/**
 * Font utility functions for text rendering and metrics calculation
 */

import type { ScreenmanObject, ScreenmanFont } from "@/components/screenman-editor"

/**
 * Calculate the appropriate height for text objects based on font size.
 * Uses 1.3x multiplier to account for ascenders, descenders, and line spacing.
 */
export function calculateTextObjectHeight(fontSize: number): number {
  return Math.round(fontSize * 1.3)
}

/**
 * Get font height from font object or calculate from BDF font data.
 * Prefers using pre-calculated values from font object for performance.
 */
export function getFontHeight(font: ScreenmanFont): number {
  // Use pre-calculated size from font object
  if (font.size) {
    return font.size
  }
  
  // Fallback: calculate from BDF data if available
  if (font.data) {
    return getBDFFontHeight(font.data)
  }
  
  return 16 // Default fallback
}

/**
 * Get font ascent from font object or parse from BDF font data.
 * Prefers using pre-calculated values from font object for performance.
 */
export function getFontAscent(font: ScreenmanFont): number {
  // Use pre-calculated ascent from font object
  if (font.ascent !== undefined) {
    return font.ascent
  }
  
  // Fallback: parse from BDF data if available
  if (font.data) {
    return getBDFFontAscent(font.data)
  }
  
  return 14 // Default fallback
}

/**
 * Get font descent from font object or parse from BDF font data.
 * Prefers using pre-calculated values from font object for performance.
 */
export function getFontDescent(font: ScreenmanFont): number {
  // Use pre-calculated descent from font object
  if (font.descent !== undefined) {
    return font.descent
  }
  
  // Fallback: parse from BDF data if available
  if (font.data) {
    return getBDFFontDescent(font.data)
  }
  
  return 4 // Default fallback
}

/**
 * Calculate the font height from BDF font data.
 * NEW APPROACH: Height = Ascent + Descent
 * This provides a more accurate representation of the actual text height.
 */
export function getBDFFontHeight(bdfContent: string): number {
  try {
    // Calculate height as ascent + descent
    const ascent = getBDFFontAscent(bdfContent)
    const descent = getBDFFontDescent(bdfContent)
    const calculatedHeight = ascent + descent
    
    console.log(`[v0] Font height calculation: ascent=${ascent}, descent=${descent}, height=${calculatedHeight}`)
    
    return calculatedHeight
  } catch (error) {
    console.warn("[v0] Error calculating BDF font height:", error)
    return 16 // Default fallback
  }
}

/**
 * Extract the font ascent from BDF font data.
 * This function parses the BDF content and returns the FONT_ASCENT or ASCENT property,
 * which represents the distance from baseline to the top of the font.
 */
export function getBDFFontAscent(bdfContent: string): number {
  try {
    const lines = bdfContent.split(/\n/)
    
    // Look for FONT_ASCENT or ASCENT in properties
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const d = line.split(" ")
      
      if (d[0] === "FONT_ASCENT") {
        const ascent = parseInt(d[1], 10)
        return isNaN(ascent) ? 14 : ascent
      } else if (d[0] === "ASCENT") {
        const ascent = parseInt(d[1], 10)
        return isNaN(ascent) ? 14 : ascent
      }
    }
    
    // Fallback: estimate ascent as 80% of default height
    return Math.round(16 * 0.8) // Use 16 as default height
  } catch (error) {
    console.warn("[v0] Error parsing BDF font ascent:", error)
    return 14
  }
}

/**
 * Extract the font descent from BDF font data.
 * This function parses the BDF content and returns the FONT_DESCENT or DESCENT property,
 * which represents the distance from baseline to the bottom of the font.
 */
export function getBDFFontDescent(bdfContent: string): number {
  try {
    const lines = bdfContent.split(/\n/)
    
    // Look for FONT_DESCENT or DESCENT in properties
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const d = line.split(" ")
      
      if (d[0] === "FONT_DESCENT") {
        const descent = parseInt(d[1], 10)
        return isNaN(descent) ? 4 : descent
      } else if (d[0] === "DESCENT") {
        const descent = parseInt(d[1], 10)
        return isNaN(descent) ? 4 : descent
      }
    }
    
    // Fallback: estimate descent as 20% of default height
    return Math.round(16 * 0.2) // Use 16 as default height
  } catch (error) {
    console.warn("[v0] Error parsing BDF font descent:", error)
    return 4
  }
}

/**
 * Calculate the actual baseline position for BDF font rendering.
 * This takes into account the FONTBOUNDINGBOX and how the BDF font is actually rendered.
 */
export function calculateBDFBaseline(fontHeight: number, fontBoundingBox: any): number {
  // The baseline is typically at the bottom of the FONTBOUNDINGBOX minus the y-offset
  // In BDF fonts, characters are rendered from the baseline upward
  if (fontBoundingBox && fontBoundingBox.y !== undefined) {
    // FONTBOUNDINGBOX.y is typically negative, representing how far below the baseline
    // the bounding box extends
    return fontHeight + fontBoundingBox.y
  }
  
  // Fallback: assume baseline is at the bottom of the font
  return fontHeight
}

/**
 * Ensure pixel-perfect alignment for canvas coordinates.
 * This prevents anti-aliasing and blurry rendering of pixel fonts.
 */
export function alignToPixel(value: number): number {
  return Math.round(value)
}

/**
 * Align coordinates to pixel boundaries for pixel-perfect rendering.
 * This is more aggressive than alignToPixel and ensures crisp rendering.
 */
export function alignToPixelBoundary(value: number): number {
  return Math.floor(value) + 0.5
}

/**
 * Force coordinates to be true integer values for pixel-perfect rendering.
 * This prevents any fractional coordinates that could cause anti-aliasing.
 */
export function forceIntegerCoordinates(value: number): number {
  return Math.round(value)
}

/**
 * Set up canvas context for pixel-perfect rendering.
 * This ensures all drawing operations are aligned to pixel boundaries.
 */
export function setupPixelPerfectRendering(ctx: CanvasRenderingContext2D): void {
  // Disable all smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false
  ctx.mozImageSmoothingEnabled = false
  ctx.webkitImageSmoothingEnabled = false
  ctx.msImageSmoothingEnabled = false
  ctx.imageSmoothingQuality = 'low'
}

/**
 * Set up canvas context for pixel-perfect rendering of BDF fonts.
 * This ensures crisp, non-blurry rendering of pixel fonts.
 */
export function setupPixelPerfectCanvas(ctx: CanvasRenderingContext2D): void {
  // Disable image smoothing to prevent anti-aliasing
  ctx.imageSmoothingEnabled = false
  
  // Set pixel-perfect rendering mode
  ctx.translate(0.5, 0.5)
  
  // Ensure crisp rendering
  ctx.imageSmoothingEnabled = false
}

/**
 * Restore canvas context after pixel-perfect rendering.
 */
export function restoreCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.translate(-0.5, -0.5)
  ctx.imageSmoothingEnabled = true
}

/**
 * Set up canvas for BDF font rendering with proper pixel alignment.
 * This function emulates the u8g2 library's pixel-perfect rendering.
 */
export function setupBDFCanvas(ctx: CanvasRenderingContext2D): void {
  // Disable all smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false
  
  // Set crisp rendering properties for all browsers
  ctx.mozImageSmoothingEnabled = false
  ctx.webkitImageSmoothingEnabled = false
  ctx.msImageSmoothingEnabled = false
  
  // Force pixel-perfect rendering mode
  ctx.imageSmoothingQuality = 'low'
  
  // Note: Removed translate(0.5, 0.5) to avoid baseline misalignment
}

/**
 * Calculate the baseline Y position for a text object using BDF font.
 * BDF fonts use FONT_ASCENT property for baseline calculation.
 * Falls back to simple calculation if BDF font is not available.
 */
export function getBaselineY(obj: ScreenmanObject, fonts: ScreenmanFont[]): number {
  if (obj.type === "label" || obj.type === "MqttDataField") {
    const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
    
    // For BDF fonts, baseline is calculated from font ascent at render time
    // This function is now mainly for fallback/legacy support
    const size = fontMeta?.size || obj.properties.fontSize || 14
    const baselineY = obj.y + size * 0.8 // Simple approximation
    return Math.round(baselineY)
  }
  return obj.y
}

/**
 * Calculate text alignment X position based on alignment type.
 * @param textAlign - Alignment type: "left", "center", or "right"
 * @param objX - Object X position
 * @param objWidth - Object width
 * @param textWidth - Measured text width
 * @param leftPadding - Padding for left alignment (default: 2)
 * @returns Aligned X position for text rendering
 */
export function calculateAlignedX(
  textAlign: string,
  objX: number,
  objWidth: number,
  textWidth: number,
  leftPadding: number = 2
): number {
  if (textAlign === "center") {
    return objX + objWidth / 2 - textWidth / 2
  } else if (textAlign === "right") {
    return objX + objWidth - textWidth
  } else {
    // left alignment - ensure text doesn't go outside the bounding box
    // Use a minimum padding to account for font left bearing
    const minPadding = Math.max(leftPadding, 4)
    return objX + minPadding
  }
}
