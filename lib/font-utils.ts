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
 * Calculate the baseline Y position for a text object.
 * Uses stored baselineOffset from font metadata for accurate positioning.
 * Falls back to calculated metrics if baselineOffset is not available.
 */
export function getBaselineY(obj: ScreenmanObject, fonts: ScreenmanFont[]): number {
  if (obj.type === "label" || obj.type === "MqttDataField") {
    const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
    
    if (fontMeta && fontMeta.baselineOffset !== undefined) {
      // Use stored baseline offset from font (single source of truth)
      // Round to integer for crisp pixel alignment at 100% zoom
      const baselineY = obj.y + fontMeta.baselineOffset
      console.log(
        `[Font Metrics] Using stored baselineOffset for ${obj.type} "${obj.id}": ${fontMeta.name} ${fontMeta.size}px -> baselineOffset=${fontMeta.baselineOffset.toFixed(2)}px, object.y=${obj.y}, finalBaseline=${baselineY.toFixed(2)} -> rounded=${Math.round(baselineY)}`
      )
      return Math.round(baselineY)
    }
    
    // Fallback for fonts without baselineOffset (legacy or default fonts)
    const size = fontMeta?.size || obj.properties.fontSize || 14
    const fontWeight = obj.properties.fontWeight || "normal"
    const familyName = fontMeta?.name || obj.properties.fontFamily || "Arial"

    const tempCanvas = document.createElement("canvas")
    const tempCtx = tempCanvas.getContext("2d")!
    tempCtx.font = `${fontWeight} ${size}px ${familyName}`
    const text = obj.type === "label" ? (obj.properties.text || "Hg") : "Hg"
    const m = tempCtx.measureText(text)
    const ascent = (m as any).actualBoundingBoxAscent || size * 0.8
    const baselineY = obj.y + ascent
    console.log(
      `[Font Metrics] Calculated fallback baselineOffset for ${obj.type} "${obj.id}": ${familyName} ${size}px -> ascent=${ascent.toFixed(2)}px, object.y=${obj.y}, finalBaseline=${baselineY.toFixed(2)} -> rounded=${Math.round(baselineY)}`
    )
    return Math.round(baselineY)
  }
  return obj.y
}

/**
 * Load a TTF font dynamically using the FontFace API.
 * Returns a promise that resolves when the font is loaded and ready to use.
 */
export async function loadTTFFont(familyName: string, url: string): Promise<void> {
  const ff = new FontFace(familyName, `url(${url})`)
  await ff.load()
  ;(document as any).fonts.add(ff)
}

/**
 * Ensure a TTF font is loaded, using a cache to avoid duplicate loads.
 * @param fontId - Unique font identifier
 * @param familyName - Font family name
 * @param url - Font URL (data URL or path)
 * @param loadMap - Cache map to track loading promises
 */
export function ensureTTFFont(
  fontId: string,
  familyName: string,
  url: string,
  loadMap: Map<string, Promise<void>>
): void {
  if (!loadMap.has(fontId)) {
    const loadPromise = loadTTFFont(familyName, url).catch(() => {
      // Silently fail - browser will use fallback font
    })
    loadMap.set(fontId, loadPromise)
  }
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
    // left alignment
    return objX + leftPadding
  }
}
