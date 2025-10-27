/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenmanObject, ScreenmanFont, Topic } from "@/components/screenman-editor"
import { BDFFont } from "@/lib/bdffont"
import { alignToPixel } from "@/lib/font-utils"

interface RenderLevelIndicatorOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  fonts: ScreenmanFont[]
  topics: Topic[]
  zoom: number
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
}

export function renderLevelIndicator(options: RenderLevelIndicatorOptions): void {
  const { ctx, obj, fonts, zoom, bdfFontCache, getPreviewValueFromTopic } = options

  // Draw background
  const levelBgColor = obj.properties.backgroundColor || "#ffffff"
  if (levelBgColor !== "transparent") {
    ctx.fillStyle = levelBgColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Draw border
  const levelBorderColor = obj.properties.borderColor || "#cccccc"
  if (levelBorderColor !== "transparent") {
    ctx.strokeStyle = levelBorderColor
    ctx.lineWidth = 1 // 1 canvas pixel - scales with zoom
    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
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
  
  if (displayValue !== "none") {
    const displayText = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawLevelValue
    
    // First pass: Draw text with fill color (will be visible outside bar)
    const fillColor = obj.properties.fillColor || "#4CAF50"
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, fillColor, false)
    
    // Draw the level indicator bar
    drawLevelBar(ctx, obj, fillPercent, zoom)
    
    // Second pass: Draw text with background color, clipped to bar region
    // This makes text visible over the bar
    drawLevelText(ctx, obj, displayText, levelFontMeta, fonts, bdfFontCache, levelBgColor, true, fillPercent)
  } else {
    // No text, just draw the bar
    drawLevelBar(ctx, obj, fillPercent, zoom)
  }
}

function calculateLevelIndicatorFill(value: number, calibrationPoints: any[]): number {
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

function drawLevelBar(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  fillPercent: number,
  zoom: number
): void {
  const barDirection = obj.properties.barDirection || "left-to-right"
  const fillColor = obj.properties.fillColor || "#4CAF50"
  const padding = 4

  ctx.fillStyle = fillColor

  const innerX = obj.x + padding
  const innerY = obj.y + padding
  const innerWidth = obj.width - padding * 2
  const innerHeight = obj.height - padding * 2

  switch (barDirection) {
    case "left-to-right":
      const fillWidth = (innerWidth * fillPercent) / 100
      ctx.fillRect(innerX, innerY, fillWidth, innerHeight)
      break
    case "right-to-left":
      const rightFillWidth = (innerWidth * fillPercent) / 100
      ctx.fillRect(innerX + innerWidth - rightFillWidth, innerY, rightFillWidth, innerHeight)
      break
    case "bottom-to-top":
      const fillHeight = (innerHeight * fillPercent) / 100
      ctx.fillRect(innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight)
      break
    case "top-to-bottom":
      const topFillHeight = (innerHeight * fillPercent) / 100
      ctx.fillRect(innerX, innerY, innerWidth, topFillHeight)
      break
  }
}

function drawLevelText(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  displayText: string,
  levelFontMeta: ScreenmanFont | undefined,
  fonts: ScreenmanFont[],
  bdfFontCache: Map<string, BDFFont>,
  textColor?: string,
  clipToBar: boolean = false,
  fillPercent?: number
): void {
  const finalTextColor = textColor || obj.properties.textColor || "#000000"
  ctx.fillStyle = finalTextColor
  
  const fontId = obj.properties.fontId
  let bdfFont: BDFFont | null = null
  
  if (fontId && levelFontMeta) {
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
    
    // Apply additional clipping to bar region if needed
    if (clipToBar && fillPercent !== undefined) {
      const barDirection = obj.properties.barDirection || "left-to-right"
      const padding = 4
      const innerX = obj.x + padding
      const innerY = obj.y + padding
      const innerWidth = obj.width - padding * 2
      const innerHeight = obj.height - padding * 2
      
      ctx.save()
      
      // Create clipping path based on bar direction
      switch (barDirection) {
        case "left-to-right": {
          const fillWidth = (innerWidth * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY, fillWidth, innerHeight)
          ctx.clip()
          break
        }
        case "right-to-left": {
          const rightFillWidth = (innerWidth * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX + innerWidth - rightFillWidth, innerY, rightFillWidth, innerHeight)
          ctx.clip()
          break
        }
        case "bottom-to-top": {
          const fillHeight = (innerHeight * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight)
          ctx.clip()
          break
        }
        case "top-to-bottom": {
          const topFillHeight = (innerHeight * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY, innerWidth, topFillHeight)
          ctx.clip()
          break
        }
      }
    }
    
    // Draw the text using BDF font
    bdfFont.drawText(ctx, displayText, textX, baselineY)
    
    // Restore twice if we added bar clipping (once for bar clip, once for bounding box clip)
    if (clipToBar && fillPercent !== undefined) {
      ctx.restore() // Restore bar clip
    }
    ctx.restore() // Restore bounding box clip
  } else {
    // Fall back to standard font rendering
    ctx.save()
    
    // Clip to level indicator bounding box
    ctx.beginPath()
    ctx.rect(obj.x, obj.y, obj.width, obj.height)
    ctx.clip()
    
    const fontSize = obj.properties.fontSize || 14
    const fontFamily = obj.properties.fontFamily || "Arial"
    const fontWeight = obj.properties.fontWeight || "normal"
    
    // Apply additional clipping to bar region if needed
    if (clipToBar && fillPercent !== undefined) {
      const barDirection = obj.properties.barDirection || "left-to-right"
      const padding = 4
      const innerX = obj.x + padding
      const innerY = obj.y + padding
      const innerWidth = obj.width - padding * 2
      const innerHeight = obj.height - padding * 2
      
      ctx.save()
      
      // Create clipping path based on bar direction
      switch (barDirection) {
        case "left-to-right": {
          const fillWidth = (innerWidth * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY, fillWidth, innerHeight)
          ctx.clip()
          break
        }
        case "right-to-left": {
          const rightFillWidth = (innerWidth * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX + innerWidth - rightFillWidth, innerY, rightFillWidth, innerHeight)
          ctx.clip()
          break
        }
        case "bottom-to-top": {
          const fillHeight = (innerHeight * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight)
          ctx.clip()
          break
        }
        case "top-to-bottom": {
          const topFillHeight = (innerHeight * fillPercent) / 100
          ctx.beginPath()
          ctx.rect(innerX, innerY, innerWidth, topFillHeight)
          ctx.clip()
          break
        }
      }
    }
    
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
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
