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

import type { ScreenObject, ProjectFont, ProjectAsset, Topic } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import type { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderLabel } from "@/components/canvas/renderers/render-label"
import { renderMqttField } from "@/components/canvas/renderers/render-mqtt-field"
import { renderLevelIndicator } from "@/components/canvas/renderers/render-level-indicator"
import { renderBox } from "@/components/canvas/renderers/render-box"
import { renderLine } from "@/components/canvas/renderers/render-line"
import { renderMqttDataLine } from "@/components/canvas/renderers/render-mqtt-data-line"
import { renderIcon } from "@/components/canvas/renderers/render-icon"
import { renderSoftwareButton } from "@/components/canvas/renderers/render-software-button"
import { sortChildrenByZIndex } from "@/lib/object-order"
import { extractJsonField, splitTopicPath } from "@/lib/json-path"

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
//
// `topicName` may be a plain topic string or a "<topic>#<path>" composite
// referencing one field of a "json"-type topic's payload (see
// lib/json-path.ts) - ProjectLoader::getTopicValue on the firmware side
// resolves the same composite string the same way, so a value that looks
// right here is what the real device will actually extract too.
export function getPreviewValueFromTopic(topicName: string | undefined, topics: Topic[]): string {
  if (!topicName) return "No topic selected"

  const { topic: realTopicName, path } = splitTopicPath(topicName)
  const topic = topics.find((t) => t.topic === realTopicName)
  if (!topic) return "No topic selected"

  if (!topic.examples || topic.examples.length === 0) {
    return `Topic ${topic.topic} has no Examples`
  }

  const firstExample = topic.examples[0]?.trim()
  if (!firstExample) return `Topic ${topic.topic} has no Examples`

  if (!path) return firstExample

  const extracted = extractJsonField(firstExample, path)
  return extracted !== undefined ? extracted : `Field "${path}" not found in ${topic.topic}`
}

// Arduino's String::toFloat() returns 0.0 for a string with no parseable
// leading number, NOT NaN like JS's Number.parseFloat() - "TEMP" toFloat()s
// to 0.0f on the device, but Number.parseFloat("TEMP") is NaN, and any
// comparison against NaN is always false. Matching Arduino's fallback here
// is what keeps a numeric-operator panel condition evaluating identically
// on both sides, the same reasoning behind every other pixel-parity fix
// this session.
function arduinoToFloat(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isNaN(n) ? 0 : n
}

// Mirrors ScreenRenderer::evaluateCondition() exactly (currently used
// firmware-side for MQTTIconField's ValueIconPair, generalized here for
// panel/tab-control use): "==" / "!=" compare as trimmed strings (so an
// enum-style mode like "TEMP" works), the four numeric operators parse both
// sides with arduinoToFloat().
export function evaluateCondition(actualValue: string, operator: string, comparisonValue: string): boolean {
  if (operator === "==") return actualValue.trim() === comparisonValue.trim()
  if (operator === "!=") return actualValue.trim() !== comparisonValue.trim()

  const a = arduinoToFloat(actualValue)
  const b = arduinoToFloat(comparisonValue)
  switch (operator) {
    case ">":
      return a > b
    case ">=":
      return a >= b
    case "<":
      return a < b
    case "<=":
      return a <= b
    default:
      return false
  }
}

// Walks a tab-control's panel children in order, returns the first whose
// condition matches the tab-control's own topic value - undefined if none
// match (renders nothing, the same "no match = draw nothing" behavior
// MQTTIconField already has via getIconPathForValue()).
export function getActivePanel(
  tabControl: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
): ScreenObject | undefined {
  const topicValue = getPreviewValueFromTopic(tabControl.properties.topic)
  return (tabControl.children ?? []).find((panel) =>
    evaluateCondition(topicValue, panel.properties.comparisonOperator || "==", panel.properties.comparisonValue ?? ""),
  )
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
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  topics: Topic[]
  colorDepth?: string
  bdfFontCache: Map<string, BDFFont>
  iconImageCache: Map<string, HTMLImageElement>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  placeholderContext?: ReturnType<typeof createPlaceholderContext>
  requestRedraw: () => void
}

// Sorts by zIndex itself (frontmost last) - matches firmware's
// ScreenRenderer, which sorts every sibling list (top-level and nested) the
// same way, so callers no longer need to pre-sort. Recurses into
// "tab-control" children: only the one panel whose condition matches the
// control's own topic value is rendered (ctx.translate()'d to the
// tab-control's origin, since panel children carry coordinates relative to
// it, not absolute screen coordinates), everything else in that subtree is
// skipped entirely. A tab-control/panel never draws anything of its own -
// pure layout/condition scaffolding around ordinary leaf objects.
export function renderScreenObjects(ctx: CanvasRenderingContext2D, objects: ScreenObject[], options: RenderScreenObjectsOptions): void {
  const { fonts, projectAssets, topics, colorDepth, bdfFontCache, iconImageCache, getPreviewValueFromTopic, placeholderContext, requestRedraw } = options

  for (const obj of sortChildrenByZIndex(objects)) {
    switch (obj.type) {
      case "tab-control": {
        const activePanel = getActivePanel(obj, getPreviewValueFromTopic)
        if (!activePanel) break
        ctx.save()
        ctx.translate(obj.x, obj.y)
        renderScreenObjects(ctx, activePanel.children ?? [], options)
        ctx.restore()
        break
      }

      case "panel":
        // Only ever meaningful as a tab-control's direct child, handled
        // above - a stray top-level "panel" (malformed data) draws nothing.
        break

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

      case "MqttDataLine":
        renderMqttDataLine({ ctx, obj, zoom: 1, colorDepth, topics, getPreviewValueFromTopic })
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
