/**
 * Level Indicator renderer - handles level indicator bars with calibration points
 */

import type { ScreenmanObject, ScreenmanFont, Topic } from "@/components/screenman-editor"
import { ensureTTFFont } from "@/lib/font-utils"

interface RenderLevelIndicatorOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  fonts: ScreenmanFont[]
  topics: Topic[]
  zoom: number
  ttfFontLoadMap: Map<string, Promise<void>>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
}

export function renderLevelIndicator(options: RenderLevelIndicatorOptions): void {
  const { ctx, obj, fonts, zoom, ttfFontLoadMap, getPreviewValueFromTopic } = options

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
    ctx.lineWidth = 1 / zoom
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

  // Draw the level indicator bar
  drawLevelBar(ctx, obj, fillPercent, zoom)

  // Draw the value text
  const levelFontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const displayValue = obj.properties.displayValue || "value"
  
  if (displayValue !== "none") {
    const displayText = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawLevelValue
    drawLevelText(ctx, obj, displayText, levelFontMeta, ttfFontLoadMap)
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
  ttfFontLoadMap: Map<string, Promise<void>>
): void {
  ctx.fillStyle = obj.properties.textColor || "#000000"

  // Use TTF font if available
  if (levelFontMeta?.url) {
    const requestedSize = levelFontMeta.size || obj.properties.fontSize || 14
    const familyName = levelFontMeta.name || obj.properties.fontFamily || "sans-serif"
    const fontWeight = obj.properties.fontWeight || "normal"

    // Ensure TTF font is loaded if URL is provided
    ensureTTFFont(levelFontMeta.id, familyName, levelFontMeta.url, ttfFontLoadMap)

    ctx.font = `${fontWeight} ${requestedSize}px ${familyName}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(displayText, obj.x + obj.width / 2, obj.y + obj.height / 2)
  } else {
    // Fallback to canvas text rendering
    ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(displayText, obj.x + obj.width / 2, obj.y + obj.height / 2)
  }
}
