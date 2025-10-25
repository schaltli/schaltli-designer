/**
 * MQTT Data Field renderer - handles MQTT data field rendering with text and icons
 */

import type { ScreenmanObject, ScreenmanFont, ScreenmanAsset, Topic } from "@/components/screenman-editor"
import { BDFFont } from "@/lib/bdffont"
import { getFontHeight, getFontAscent, getFontDescent, getBDFFontAscent, getBDFFontDescent, getBDFFontHeight, alignToPixel, setupBDFCanvas, calculateBDFBaseline, setupPixelPerfectRendering, alignToPixelBoundary, forceIntegerCoordinates } from "@/lib/font-utils"
import { optimizeSVGViewBox, decodeSVGContent, encodeSVGContent } from "@/lib/svg-utils"

interface RenderMqttFieldOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  fonts: ScreenmanFont[]
  projectAssets: ScreenmanAsset[]
  topics: Topic[]
  isSelected: boolean
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  iconImageCache: Map<string, HTMLImageElement>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  formatFieldValue: (value: string, properties: any) => string
  requestRedraw: () => void
}

export function renderMqttField(options: RenderMqttFieldOptions): void {
  const {
    ctx,
    obj,
    fonts,
    projectAssets,
    isSelected,
    zoom,
    bdfFontCache,
    iconImageCache,
    getPreviewValueFromTopic,
    formatFieldValue,
    requestRedraw,
  } = options

  // Get font info to calculate proper bounding box height
  const fontId = obj.properties.fontId
  let boundingBoxHeight = obj.height // Default to object height
  
  if (fontId) {
    const font = fonts.find((f) => f.id === fontId)
    if (font) {
      // Use font object's size property (ascent + descent)
      boundingBoxHeight = getFontHeight(font)
    }
  }
  
  // Draw background with pixel-perfect positioning
  const fieldBgColor = obj.properties.backgroundColor || "transparent"
  if (fieldBgColor !== "transparent") {
    ctx.save()
    setupPixelPerfectRendering(ctx)
    ctx.fillStyle = fieldBgColor
    ctx.fillRect(forceIntegerCoordinates(obj.x), forceIntegerCoordinates(obj.y), forceIntegerCoordinates(obj.width), forceIntegerCoordinates(boundingBoxHeight))
    ctx.restore()
  }

  // Draw border with pixel-perfect positioning (only for MqttDataField, not MQTTIconField)
  if (obj.type !== "MQTTIconField") {
    const fieldBorderColor = obj.properties.borderColor || "#cccccc"
    if (fieldBorderColor !== "transparent") {
      ctx.save()
      ctx.strokeStyle = fieldBorderColor
      ctx.lineWidth = 1 // Fixed 1px border that scales with zoom
      // Use integer coordinates for crisp lines
      ctx.strokeRect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
      ctx.restore()
    } else {
      // Draw thin border when border color is transparent
      ctx.save()
      ctx.strokeStyle = "#cccccc"
      ctx.lineWidth = 1 / zoom // Thin line that doesn't scale with zoom
      ctx.strokeRect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
      ctx.restore()
    }
  }

  const displayAs = obj.properties.displayAs || "Display as-is"
  const rawFieldValue = getPreviewValueFromTopic(obj.properties.topic) || obj.properties.topic || "No topic selected"

  const mqttFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)

  // Handle icon-based display modes
  if (obj.type === "MQTTIconField" || displayAs === "Display as Icon" || displayAs === "Show Range Icon") {
    renderIconMode(
      ctx,
      obj,
      rawFieldValue,
      projectAssets,
      iconImageCache,
      requestRedraw
    )
  } else {
    // Text-based display modes (Display as-is, Formatted Number)
    renderTextMode(
      ctx,
      obj,
      rawFieldValue,
      mqttFontMeta,
      fonts,
      isSelected,
      zoom,
      bdfFontCache,
      formatFieldValue
    )
  }
}

function renderIconMode(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  rawFieldValue: string,
  projectAssets: ScreenmanAsset[],
  iconImageCache: Map<string, HTMLImageElement>,
  requestRedraw: () => void
): void {
  // Find matching value-icon pair
  const valueIconPairs = obj.properties.valueIconPairs || []
  const numericValue = Number.parseFloat(rawFieldValue)
  const matchingPair = valueIconPairs.find((pair: any) => {
    if (pair.comparisonOperator && pair.value !== undefined) {
      // New format: comparison operator matching
      const operator = pair.comparisonOperator
      const compareValue = pair.value

      if (operator === "=") {
        // For equality, support both text and numeric comparison
        return (
          rawFieldValue === String(compareValue) ||
          (!isNaN(numericValue) && numericValue === Number(compareValue))
        )
      } else {
        // For other operators, only numeric comparison
        if (isNaN(numericValue)) return false
        const numCompareValue = Number(compareValue)

        switch (operator) {
          case ">":
            return numericValue > numCompareValue
          case ">=":
            return numericValue >= numCompareValue
          case "<":
            return numericValue < numCompareValue
          case "<=":
            return numericValue <= numCompareValue
          default:
            return false
        }
      }
    } else if (pair.ifGreaterOrEqualThan !== undefined && pair.andLessThan !== undefined) {
      // Legacy format: range match (keep for backward compatibility)
      if (isNaN(numericValue)) return false
      return numericValue >= pair.ifGreaterOrEqualThan && numericValue < pair.andLessThan
    } else if (pair.value !== undefined) {
      // Legacy format: exact value match (keep for backward compatibility)
      return pair.value === rawFieldValue
    }
    return false
  })

  if (matchingPair && matchingPair.thenShowIcon) {
    // Render icon from asset
    const asset = projectAssets.find((a) => a.id === matchingPair.thenShowIcon)
    if (asset && asset.type === "icon" && asset.data) {
      renderIconFromAsset(ctx, obj, asset, iconImageCache, requestRedraw)
    }
  }
}

function renderIconFromAsset(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  asset: ScreenmanAsset,
  iconImageCache: Map<string, HTMLImageElement>,
  requestRedraw: () => void
): void {
  const cacheKey = `${asset.id}_optimized`
  let img = iconImageCache.get(cacheKey)

  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    iconImageCache.set(cacheKey, img)

    img.onload = () => {
      if (img!.complete && img!.naturalWidth > 0) {
        requestAnimationFrame(() => {
          requestRedraw()
        })
      }
    }

    img.onerror = () => {
      iconImageCache.delete(cacheKey)
    }

    // Decode, optimize, and encode the SVG
    const svgContent = decodeSVGContent(asset.data)
    const optimizedSvgContent = optimizeSVGViewBox(svgContent)
    const modifiedDataUrl = encodeSVGContent(optimizedSvgContent)
    img.src = modifiedDataUrl
  }

  if (img.complete && img.naturalWidth > 0) {
    try {
      // Center the icon in the field
      const iconSize = Math.min(obj.width - 16, obj.height - 16) // Leave 8px padding on each side
      const iconX = obj.x + (obj.width - iconSize) / 2
      const iconY = obj.y + (obj.height - iconSize) / 2
      ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
    } catch (error) {
      // Silently fail
    }
  }
}

function renderTextMode(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  rawFieldValue: string,
  mqttFontMeta: ScreenmanFont | undefined,
  fonts: ScreenmanFont[],
  isSelected: boolean,
  zoom: number,
  bdfFontCache: Map<string, BDFFont>,
  formatFieldValue: (value: string, properties: any) => string
): void {
  const formattedFieldValue = formatFieldValue(rawFieldValue, obj.properties)

  const fontId = obj.properties.fontId
  let bdfFont: BDFFont | null = null

  if (fontId) {
    // Try to get from cache first
    bdfFont = bdfFontCache.get(fontId) || null

    // If not in cache, try to parse and cache it
    if (!bdfFont) {
      const font = fonts.find((f) => f.id === fontId)
      if (font && font.data) {
        try {
          console.log("[v0] Loading BDF font for MQTT field:", font.name, "Data length:", font.data.length)
          bdfFont = new BDFFont(font.data)
          bdfFontCache.set(fontId, bdfFont)
          console.log("[v0] BDF font loaded successfully for MQTT field:", font.name)
        } catch (error) {
          console.error("[v0] Failed to parse BDF font for MQTT field:", error)
          bdfFont = null
        }
      } else {
        console.warn("[v0] Font not found or no data for MQTT field:", fontId, font ? "found font" : "no font", font?.data ? "has data" : "no data")
      }
    } else {
    }
  } else {
  }

  // NEW RENDERING ORDER: 1. Baseline first, 2. Text, 3. Handles
  
  // 1. Draw baseline indicator first (if selected)
  if (isSelected && zoom > 0.5) {
    let fontAscent: number
    let fontHeight: number
    let baselineY: number
    let metricsText: string

    if (bdfFont) {
      // For BDF fonts, get ascent from font data
    const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
    if (fontMeta) {
      fontAscent = getFontAscent(fontMeta)
      const fontDescent = getFontDescent(fontMeta)
      const calculatedHeight = getFontHeight(fontMeta)
      
      // Calculate the actual baseline position based on how BDF fonts are rendered
      baselineY = obj.y + fontAscent
      metricsText = `Height: ${calculatedHeight}px (${fontAscent}+${fontDescent}), Ascent: ${fontAscent}px`
    } else {
      return // Can't draw baseline without font metadata
    }
    } else {
      // For standard fonts, estimate ascent as 80% of font size
      const fontSize = obj.properties.fontSize || 14
      fontAscent = Math.round(fontSize * 0.8)
      fontHeight = fontSize
      baselineY = obj.y + fontAscent
      metricsText = `Height: ${fontHeight}px, Ascent: ${fontAscent}px (est)`
    }

    ctx.save()
    
    // Draw baseline with handle color
    ctx.strokeStyle = "#3b82f6" // Blue color (same as handles)
    ctx.lineWidth = 1 / zoom // Scale line width with zoom
    ctx.setLineDash([]) // Solid line
    ctx.beginPath()
    // Use integer coordinates for crisp lines
    ctx.moveTo(Math.round(obj.x), Math.round(baselineY))
    ctx.lineTo(Math.round(obj.x + obj.width), Math.round(baselineY))
    ctx.stroke()
    
    // Draw font metrics text
    ctx.fillStyle = "#666666" // Gray color for metrics
    ctx.font = `10px monospace`
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText(metricsText, alignToPixel(obj.x), alignToPixel(baselineY + 3))
    
    ctx.restore()
  }

  // 2. Draw text
  ctx.fillStyle = obj.properties.textColor || "#000000"

  if (bdfFont) {
    // Canvas is already set up for pixel-perfect rendering at the canvas level
    ctx.save()
    
    // Use BDF font rendering with pixel-perfect alignment
    const textMetrics = bdfFont.measureText(formattedFieldValue)
    let textX = alignToPixel(obj.x)

    // Handle text alignment
    const textAlign = obj.properties.textAlign || "left"
    if (textAlign === "center") {
      textX = alignToPixel(obj.x + (obj.width - textMetrics.width) / 2)
    } else if (textAlign === "right") {
      textX = alignToPixel(obj.x + obj.width - textMetrics.width)
    } else {
      textX = alignToPixel(obj.x)
    }

    // Get font ascent from BDF font properties
    const fontAscent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
    const baselineY = alignToPixel(obj.y + fontAscent)

    // Draw the text using BDF font
    bdfFont.drawText(ctx, formattedFieldValue, textX, baselineY)
    
    // Restore canvas state
    ctx.restore()
  } else {
    // Fall back to standard font rendering
    ctx.font = `${obj.properties.fontWeight || "normal"} ${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
    ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
    ctx.textBaseline = "top"

    let textX = obj.x
    if (obj.properties.textAlign === "center") {
      textX = obj.x + obj.width / 2
    } else if (obj.properties.textAlign === "right") {
      textX = obj.x + obj.width
    }

    ctx.fillText(formattedFieldValue, textX, obj.y)
  }

  // 3. Draw handles at the end of the baseline (if selected)
  if (isSelected && zoom > 0.5) {
    const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
    let baselineY: number
    
    if (fontMeta && bdfFont) {
      // For BDF fonts, use actual ascent from font object
      const fontAscent = getFontAscent(fontMeta)
      baselineY = obj.y + fontAscent
    } else {
      // For standard fonts, estimate ascent
      const fontSize = obj.properties.fontSize || 14
      const fontAscent = Math.round(fontSize * 0.8)
      baselineY = obj.y + fontAscent
    }
    
    const handleSize = 8 / zoom
    const half = handleSize / 2
    
    ctx.save()
    
    // Style handles like other handles
    ctx.fillStyle = "#3b82f6" // Blue fill
    ctx.strokeStyle = "#ffffff" // White stroke
    ctx.lineWidth = 1 / zoom
    
    // Draw handles at the start and end of the baseline
    const leftHandleX = obj.x - half
    const rightHandleX = obj.x + obj.width - half
    const handleY = baselineY - half
    
    // Left handle
    ctx.fillRect(leftHandleX, handleY, handleSize, handleSize)
    ctx.strokeRect(leftHandleX, handleY, handleSize, handleSize)
    
    // Right handle
    ctx.fillRect(rightHandleX, handleY, handleSize, handleSize)
    ctx.strokeRect(rightHandleX, handleY, handleSize, handleSize)
    
    ctx.restore()
  }
}
