/**
 * MQTT Data Field renderer - a label bound to an MQTT topic, plus an
 * optional icon display mode. Text-mode box/text pixels come from the same
 * shared renderer as static labels (render-text-box.ts) - a data field
 * really is just a label with its text resolved from a topic value instead
 * of a fixed string, and the drawing code must not diverge from that.
 */

import type { ScreenObject, ProjectFont, ProjectAsset, Topic } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { drawTextBox, drawBoxBackground, drawBoxBorder, getTextBoxHeight } from "./render-text-box"
import { tintedIconDataUrl, iconCacheKey, rasterisedIcon } from "@/lib/svg-utils"

interface RenderMqttFieldOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
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
    requestRedraw,
  })
}

function renderIconMode(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  rawFieldValue: string,
  projectAssets: ProjectAsset[],
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
  obj: ScreenObject,
  asset: ProjectAsset,
  iconImageCache: Map<string, HTMLImageElement>,
  requestRedraw: () => void
): void {
  // One iconColor for every rule of the field - whichever icon a value
  // selects, it is painted the same.
  const cacheKey = iconCacheKey(asset.id, obj.properties.iconColor, obj.properties.iconColorFlatten)
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

    img.src = tintedIconDataUrl(asset.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
  }

  if (img.complete && img.naturalWidth > 0) {
    try {
      // Rasterised on the object's own grid and then blitted, not scaled
      // into place - because that is the route this icon reaches the device
      // by. A field's icon depends on a value, so it is not flattened into
      // the screen background the way a plain "icon" object is: the export
      // bakes it alone onto a width x height canvas at the origin
      // (asset-export.ts's exportIconUsage) and the device blits that
      // bitmap. Scaling the SVG straight onto the screen grid instead leaves
      // the preview's anti-aliased edge on a different sub-pixel phase than
      // the bitmap that actually ships.
      //
      // One pixel, on one edge, found by the generated type-coverage run on
      // the knob (2026-09-10). Worth fixing rather than tolerating: the
      // device was faithfully showing what it had been handed, and the
      // comparison was blaming it for two of the designer's own
      // rasterisations disagreeing. A plain icon is deliberately the other
      // way round - drawn in place here because it is baked in place too,
      // see render-icon.ts.
      const raster = rasterisedIcon(img, obj.width, obj.height, cacheKey)
      if (raster) ctx.drawImage(raster, obj.x, obj.y)
      else ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
    } catch (error) {
      // Silently fail
    }
  }
}
