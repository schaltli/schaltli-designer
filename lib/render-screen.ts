/**
 * Shared per-object render dispatch for a read-only (no selection/hover)
 * screen render: the headless HIL test harness (app/test-render/page.tsx)
 * and screen thumbnails (components/screens-panel) both need exactly this -
 * draw every object in a screen, in z-order, with no interactive chrome -
 * so it lives in one place instead of two copies that can drift apart.
 * canvas.tsx's own interactive drawObject() is deliberately NOT unified
 * with this: it also draws selection handles, hover state, and the
 * unsupported-object-type warning badge, none of which a read-only render
 * needs.
 */

import type { ScreenmanObject, ScreenmanFont, ScreenmanAsset, Topic } from "@/components/screenman-editor"
import type { BDFFont } from "@/lib/bdffont"
import type { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderLabel } from "@/components/canvas/renderers/render-label"
import { renderMqttField } from "@/components/canvas/renderers/render-mqtt-field"
import { renderLevelIndicator } from "@/components/canvas/renderers/render-level-indicator"
import { renderBox } from "@/components/canvas/renderers/render-box"
import { renderLine } from "@/components/canvas/renderers/render-line"
import { renderIcon } from "@/components/canvas/renderers/render-icon"
import { renderSoftwareButton } from "@/components/canvas/renderers/render-software-button"

// The live-editing preview value for a topic: its first example, or a
// placeholder when there's no topic/no examples/the example is blank after
// trimming. Shared by canvas.tsx (the interactive editor) and
// ScreenThumbnail (components/screens-panel) so they can't drift apart -
// they did once already: the thumbnail had its own simplified version that
// returned "" instead of the "Topic X has no Examples" placeholder for a
// blank first example, so a field bound to a topic whose first example was
// "" (a real case - the MQTT field test topics intentionally start with a
// blank example) rendered with no visible text in the thumbnail while the
// real canvas showed the placeholder (2026-07-22 finding). app/test-render/
// page.tsx has its own variant instead of using this one - it additionally
// supports per-call topicOverrides for HIL testing, a concept the live
// editor and thumbnails don't have.
export function getPreviewValueFromTopic(topicName: string | undefined, topics: Topic[]): string {
  if (!topicName) return "No topic selected"

  const topic = topics.find((t) => t.topic === topicName)
  if (!topic) return "No topic selected"

  if (!topic.examples || topic.examples.length === 0) {
    return `Topic ${topic.topic} has no Examples`
  }

  const firstExample = topic.examples[0]?.trim()
  return firstExample || `Topic ${topic.topic} has no Examples`
}

export function formatFieldValue(value: string, properties: Record<string, any>): string {
  const displayAs = properties.displayAs || "Display as-is"

  if (displayAs === "Formatted Number") {
    let formattedValue = value
    const numericValue = Number.parseFloat(value)
    if (!isNaN(numericValue)) {
      if (typeof properties.numberOfDecimals === "number") {
        formattedValue = numericValue.toFixed(properties.numberOfDecimals)
      } else {
        formattedValue = numericValue.toString()
      }
      if (properties.thousandsSeparator) {
        const parts = formattedValue.split(".")
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!d))/g, properties.thousandsSeparator)
        formattedValue = parts.join(".")
      }
      const prefix = properties.prefix || ""
      const postfix = properties.postfix || ""
      return `${prefix}${formattedValue}${postfix}`
    }
    return formattedValue
  }

  const prefix = properties.prefix || ""
  const postfix = properties.postfix || ""
  return `${prefix}${value}${postfix}`
}

export interface RenderScreenObjectsOptions {
  fonts: ScreenmanFont[]
  projectAssets: ScreenmanAsset[]
  topics: Topic[]
  colorDepth?: string
  bdfFontCache: Map<string, BDFFont>
  iconImageCache: Map<string, HTMLImageElement>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  placeholderContext?: ReturnType<typeof createPlaceholderContext>
  requestRedraw: () => void
}

// objects must already be in drawing order (see lib/object-order.ts's
// sortObjectsByDrawingOrder) - this function draws them as given.
export function renderScreenObjects(ctx: CanvasRenderingContext2D, objects: ScreenmanObject[], options: RenderScreenObjectsOptions): void {
  const { fonts, projectAssets, topics, colorDepth, bdfFontCache, iconImageCache, getPreviewValueFromTopic, placeholderContext, requestRedraw } = options

  for (const obj of objects) {
    switch (obj.type) {
      case "box":
        renderBox({ ctx, obj, zoom: 1, colorDepth })
        break

      case "label":
        renderLabel(ctx, obj, fonts, false, 1, bdfFontCache, placeholderContext, colorDepth)
        break

      case "MqttDataField":
      case "MQTTIconField":
      case "field":
        renderMqttField({
          ctx,
          obj,
          fonts,
          projectAssets,
          topics,
          isSelected: false,
          zoom: 1,
          bdfFontCache,
          iconImageCache,
          getPreviewValueFromTopic,
          formatFieldValue,
          requestRedraw,
          colorDepth,
        })
        break

      case "line":
        renderLine({ ctx, obj, zoom: 1, colorDepth })
        break

      case "icon":
        renderIcon({ ctx, obj, projectAssets, iconImageCache, requestRedraw })
        break

      case "level-indicator":
        renderLevelIndicator({
          ctx,
          obj,
          fonts,
          topics,
          zoom: 1,
          bdfFontCache,
          getPreviewValueFromTopic,
          colorDepth,
        })
        break

      case "SoftwareButton":
        renderSoftwareButton({
          ctx,
          obj,
          fonts,
          projectAssets,
          isSelected: false,
          zoom: 1,
          iconImageCache,
          requestRedraw,
        })
        break
    }
  }
}
