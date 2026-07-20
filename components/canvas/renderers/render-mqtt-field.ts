/**
 * MQTT Data Field renderer - a label bound to an MQTT topic, plus an
 * optional icon display mode. Text-mode box/text pixels come from the same
 * shared renderer as static labels (render-text-box.ts) - a data field
 * really is just a label with its text resolved from a topic value instead
 * of a fixed string, and the drawing code must not diverge from that.
 */

import type { ScreenmanObject, ScreenmanFont, ScreenmanAsset, Topic } from "@/components/screenman-editor"
import { BDFFont } from "@/lib/bdffont"
import { drawTextBox, drawBoxBackground, drawBoxBorder, getTextBoxHeight } from "./render-text-box"
import { decodeSVGContent, encodeSVGContent } from "@/lib/svg-utils"

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
  colorDepth?: string
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
    colorDepth,
  } = options

  const boundingBoxHeight = getTextBoxHeight(obj, fonts)
  const isIconField = obj.type === "MQTTIconField"
  const displayAs = obj.properties.displayAs || "Display as-is"
  // getPreviewValueFromTopic() always returns a string, including real
  // topic values that happen to be "" or whitespace-only - `||` treats
  // those as falsy and substituted the raw topic name instead, which isn't
  // "no value", it's a legitimately empty one. Only fall back to the topic
  // name/placeholder when there's truly no resolvable value at all (empty
  // topicValue can't happen from getPreviewValueFromTopic itself, but keep
  // the guard for callers that pass an empty topic).
  const topicValue = getPreviewValueFromTopic(obj.properties.topic)
  const rawFieldValue = !obj.properties.topic
    ? "No topic selected"
    : topicValue.trim() === ""
      ? "" // whitespace-only or empty value: draw with no content, not a placeholder
      : topicValue
  const isIconMode = isIconField || displayAs === "Display as Icon" || displayAs === "Show Range Icon"

  if (isIconMode) {
    // Icon fields still get the same background as a label; MQTTIconField
    // just never draws a border (its icon asset is the whole visual).
    drawBoxBackground(ctx, obj, boundingBoxHeight, colorDepth)
    if (!isIconField) {
      drawBoxBorder(ctx, obj, boundingBoxHeight, colorDepth)
    }
    renderIconMode(ctx, obj, rawFieldValue, projectAssets, iconImageCache, requestRedraw)
    return
  }

  // Text-based display modes (Display as-is, Formatted Number) - background,
  // border, text, selection baseline/handles all come from the exact same
  // function a static label uses.
  const formattedFieldValue = formatFieldValue(rawFieldValue, obj.properties)
  drawTextBox({
    ctx,
    obj,
    text: formattedFieldValue,
    fonts,
    isSelected,
    zoom,
    bdfFontCache,
    colorDepth,
  })
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

    // Decode and encode the SVG (skip optimization for now)
    const svgContent = decodeSVGContent(asset.data)
    const modifiedDataUrl = encodeSVGContent(svgContent)
    img.src = modifiedDataUrl
  }

  if (img.complete && img.naturalWidth > 0) {
    try {
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
    } catch (error) {
      // Silently fail
    }
  }
}
