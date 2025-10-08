/**
 * Label renderer - handles text label rendering with TTF fonts
 */

import type { ScreenmanObject, ScreenmanFont } from "@/components/screenman-editor"
import { getBaselineY, ensureTTFFont, calculateAlignedX } from "@/lib/font-utils"
import { processPlaceholders, type PlaceholderContext } from "@/lib/placeholder-utils"

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  fonts: ScreenmanFont[],
  isSelected: boolean,
  zoom: number,
  ttfFontLoadMap: Map<string, Promise<void>>,
  placeholderContext?: PlaceholderContext
): void {
  // Draw background
  const labelBgColor = obj.properties.backgroundColor || "#ffffff"
  if (labelBgColor !== "transparent") {
    ctx.fillStyle = labelBgColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Draw border
  const labelBorderColor = obj.properties.borderColor || "#cccccc"
  if (labelBorderColor !== "transparent") {
    ctx.strokeStyle = labelBorderColor
    ctx.lineWidth = 1
    // Draw crisp 1-pixel rectangle border exactly on pixel boundaries
    const crispX = Math.round(obj.x)
    const crispY = Math.round(obj.y)
    const crispWidth = Math.round(obj.width)
    const crispHeight = Math.round(obj.height)
    ctx.beginPath()
    ctx.moveTo(crispX, crispY)
    ctx.lineTo(crispX + crispWidth, crispY)
    ctx.lineTo(crispX + crispWidth, crispY + crispHeight)
    ctx.lineTo(crispX, crispY + crispHeight)
    ctx.lineTo(crispX, crispY)
    ctx.stroke()
  }

  // Process text and split into lines
  const rawText = obj.properties.text || "Label"
  const text = placeholderContext ? processPlaceholders(rawText, placeholderContext) : rawText
  const lines = text.split("\n")

  // Get font metadata
  ctx.fillStyle = obj.properties.color || "#000000"
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const requestedSize = fontMeta?.size || obj.properties.fontSize || 14
  const familyName = fontMeta?.name || obj.properties.fontFamily || "sans-serif"
  const fontWeight = obj.properties.fontWeight || "normal"

  // Ensure TTF font is loaded if URL is provided
  if (fontMeta?.url) {
    ensureTTFFont(fontMeta.id, familyName, fontMeta.url, ttfFontLoadMap)
  }

  // Set font and baseline
  ctx.font = `${fontWeight} ${requestedSize}px ${familyName}`
  ctx.textBaseline = "alphabetic"
  
  // Calculate baseline position
  const baselineForHandles = getBaselineY(obj, fonts)
  let currentBaselineY = baselineForHandles

  // Render each line
  for (const line of lines) {
    const m = ctx.measureText(line || "Hg")
    const ascent = (m as any).actualBoundingBoxAscent || requestedSize * 0.8
    const descent = (m as any).actualBoundingBoxDescent || requestedSize * 0.2
    const lineHeight = ascent + descent
    
    // Calculate aligned X position
    const alignedX = calculateAlignedX(
      obj.properties.textAlign || "left",
      obj.x,
      obj.width,
      m.width,
      2 // left padding
    )

    console.log(
      `[Label Debug] ${obj.properties.text || "Label"}: align=${obj.properties.textAlign}, obj.x=${obj.x}, obj.width=${obj.width}, textWidth=${m.width.toFixed(2)}, alignedX=${alignedX.toFixed(2)}`
    )

    // Draw baseline guide - ensure crisp pixel alignment at 100% zoom
    ctx.save()
    ctx.strokeStyle = "rgba(220, 38, 38, 0.35)" // red-500 @ 35%
    ctx.lineWidth = 1
    ctx.beginPath()
    const crispBaselineY = Math.round(currentBaselineY)
    ctx.moveTo(obj.x, crispBaselineY)
    ctx.lineTo(obj.x + obj.width, crispBaselineY)
    ctx.stroke()
    ctx.restore()

    // Draw text
    ctx.fillText(line, alignedX, currentBaselineY)
    currentBaselineY += lineHeight
  }

  // Draw baseline handles at rectangle edges when selected
  if (isSelected) {
    const handleSize = 8 / zoom
    const half = handleSize / 2
    ctx.save()
    ctx.fillStyle = "#3b82f6"
    ctx.strokeStyle = "#1d4ed8"
    ctx.lineWidth = 1 / zoom
    const crispBaselineForHandles = Math.round(baselineForHandles)
    ctx.fillRect(obj.x - half, crispBaselineForHandles - half, handleSize, handleSize)
    ctx.strokeRect(obj.x - half, crispBaselineForHandles - half, handleSize, handleSize)
    ctx.fillRect(obj.x + obj.width - half, crispBaselineForHandles - half, handleSize, handleSize)
    ctx.strokeRect(obj.x + obj.width - half, crispBaselineForHandles - half, handleSize, handleSize)
    ctx.restore()
  }
}
