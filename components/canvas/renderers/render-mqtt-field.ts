/**
 * MQTT Data Field renderer - handles MQTT data field rendering with text and icons
 */

import type { ScreenmanObject, ScreenmanFont, ScreenmanAsset, Topic } from "@/components/screenman-editor"
import { getBaselineY, ensureTTFFont, calculateAlignedX } from "@/lib/font-utils"

interface RenderMqttFieldOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  fonts: ScreenmanFont[]
  projectAssets: ScreenmanAsset[]
  topics: Topic[]
  isSelected: boolean
  zoom: number
  ttfFontLoadMap: Map<string, Promise<void>>
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
    ttfFontLoadMap,
    iconImageCache,
    getPreviewValueFromTopic,
    formatFieldValue,
    requestRedraw,
  } = options

  // Draw background
  const fieldBgColor = obj.properties.backgroundColor || "#ffffff"
  if (fieldBgColor !== "transparent") {
    ctx.fillStyle = fieldBgColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Draw border
  const fieldBorderColor = obj.properties.borderColor || "#cccccc"
  if (fieldBorderColor !== "transparent") {
    ctx.strokeStyle = fieldBorderColor
    ctx.lineWidth = 1
    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
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
      ttfFontLoadMap,
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
  const cacheKey = asset.id
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

    let svgContent = asset.data
    if (asset.data.startsWith("data:image/svg+xml;base64,")) {
      svgContent = atob(asset.data.split(",")[1])
    } else if (asset.data.startsWith("data:image/svg+xml,")) {
      svgContent = decodeURIComponent(asset.data.split(",")[1])
    } else {
      svgContent = asset.data
    }

    const modifiedDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`
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
  ttfFontLoadMap: Map<string, Promise<void>>,
  formatFieldValue: (value: string, properties: any) => string
): void {
  const formattedFieldValue = formatFieldValue(rawFieldValue, obj.properties)

  ctx.fillStyle = obj.properties.textColor || "#000000"
  const size = mqttFontMeta?.size || obj.properties.fontSize || 14
  const fam = mqttFontMeta?.name || obj.properties.fontFamily || "sans-serif"
  const fontWeight = obj.properties.fontWeight || "normal"

  // Ensure TTF font is loaded if URL is provided
  if (mqttFontMeta?.url) {
    ensureTTFFont(mqttFontMeta.id, fam, mqttFontMeta.url, ttfFontLoadMap)
  }

  ctx.font = `${fontWeight} ${size}px ${fam}`
  ctx.textBaseline = "alphabetic"

  // Calculate baseline position
  const baselineY = getBaselineY(obj, fonts)

  // Draw baseline guide - ensure crisp pixel alignment at 100% zoom
  ctx.save()
  ctx.strokeStyle = "rgba(220, 38, 38, 0.35)"
  ctx.lineWidth = 1
  ctx.beginPath()
  const crispBaselineY = Math.round(baselineY)
  ctx.moveTo(obj.x, crispBaselineY)
  ctx.lineTo(obj.x + obj.width, crispBaselineY)
  ctx.stroke()
  ctx.restore()

  // Use manual text alignment calculation to match label behavior exactly
  ctx.textAlign = "left" // Always use left alignment for manual positioning
  const textToMeasure = formattedFieldValue
  const m = ctx.measureText(textToMeasure)
  
  const alignedX = calculateAlignedX(
    obj.properties.textAlign || "left",
    obj.x,
    obj.width,
    m.width,
    2 // left padding
  )

  console.log(
    `[MQTT Debug] "${textToMeasure}": align=${obj.properties.textAlign}, obj.x=${obj.x}, obj.width=${obj.width}, textWidth=${m.width.toFixed(2)}, alignedX=${alignedX.toFixed(2)}`
  )

  ctx.fillText(textToMeasure, alignedX, baselineY)

  // Draw baseline handles at rectangle edges when selected
  if (isSelected) {
    const handleSize = 8 / zoom
    const half = handleSize / 2
    ctx.save()
    ctx.fillStyle = "#3b82f6"
    ctx.strokeStyle = "#1d4ed8"
    ctx.lineWidth = 1 / zoom
    const crispBaselineY = Math.round(baselineY)
    ctx.fillRect(obj.x - half, crispBaselineY - half, handleSize, handleSize)
    ctx.strokeRect(obj.x - half, crispBaselineY - half, handleSize, handleSize)
    ctx.fillRect(obj.x + obj.width - half, crispBaselineY - half, handleSize, handleSize)
    ctx.strokeRect(obj.x + obj.width - half, crispBaselineY - half, handleSize, handleSize)
    ctx.restore()
  }
}
