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
import { parse, referencedTopics, type PlaceholderScope, type Separators } from "@/lib/placeholders"
import { renderLabel } from "@/components/canvas/renderers/render-label"
import { renderMqttField } from "@/components/canvas/renderers/render-mqtt-field"
import { renderArcLevel } from "@/components/canvas/renderers/render-arc-level"
import { renderLevelIndicator } from "@/components/canvas/renderers/render-level-indicator"
import { renderBox } from "@/components/canvas/renderers/render-box"
import { renderLine } from "@/components/canvas/renderers/render-line"
import { renderMqttDataLine } from "@/components/canvas/renderers/render-mqtt-data-line"
import { renderIcon } from "@/components/canvas/renderers/render-icon"
import { renderSoftwareButton } from "@/components/canvas/renderers/render-software-button"
import { renderSwitch } from "@/components/canvas/renderers/render-switch"
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

// The live preview's counterpart of getPreviewValueFromTopic: what the
// broker last delivered on the topic, and "" - no value - until something
// has (docs/2026-09-15-live-data.md, decisions 5 and 6). No placeholders and
// no examples, because the device has neither: this answers exactly what
// ProjectLoader::getTopicValue answers on a panel subscribed to the same
// broker, including a "#path" into a JSON payload.
export function getLiveValueFromTopic(topicName: string | undefined, liveValues: Record<string, string>): string {
  if (!topicName) return ""
  const { topic, path } = splitTopicPath(topicName)
  const raw = liveValues[topic] ?? ""
  if (!path) return raw
  return extractJsonField(raw, path) ?? ""
}

// The scope placeholders in texts and level labels are resolved in, in the
// designer (docs/2026-09-25-text-placeholders.md). Unlike the two functions
// above it answers `undefined` for a value that is not there - no example in
// the editor, nothing delivered yet in the live preview - because that is the
// one case `??` stands in for, and "" is a value that did arrive.
export function placeholderScope(options: {
  topics: Topic[]
  liveValues?: Record<string, string> | null
  projectName?: string
  device?: { model?: string; id?: string }
  separators: Separators
}): PlaceholderScope {
  const { topics, liveValues, projectName, device, separators } = options
  const topicValue = (topicName: string): string | undefined => {
    const { topic, path } = splitTopicPath(topicName)
    let raw: string | undefined
    if (liveValues) {
      raw = topic in liveValues ? liveValues[topic] : undefined
    } else {
      raw = topics.find((t) => t.topic === topic)?.examples?.[0]
    }
    if (raw === undefined || !path) return raw
    return extractJsonField(raw, path)
  }
  return {
    separators,
    lookup: (reference) => {
      if (reference.namespace === "topic") return topicValue(reference.path)
      if (reference.namespace === "device") return reference.path === "model" ? device?.model : device?.id
      return reference.path === "name" ? projectName : undefined
    },
  }
}

// The texts of an object that may carry placeholders: a text's text and a
// level's label (docs/2026-09-25-text-placeholders.md, "Where placeholders
// apply").
export function placeholderTexts(obj: ScreenObject): string[] {
  const texts: string[] = []
  if (obj.type === "text" && typeof obj.properties?.text === "string") texts.push(obj.properties.text)
  if (typeof obj.properties?.label === "string") texts.push(obj.properties.label)
  return texts
}

// Whether anything on any screen needs a device that resolves placeholders
// itself: a topic: or device: reference. project: fields are written in at
// export and need nothing of the device.
export function projectUsesLivePlaceholders(project: { screens?: { objects: ScreenObject[] }[] }): boolean {
  const walk = (objects: ScreenObject[]): boolean =>
    objects.some(
      (obj) =>
        placeholderTexts(obj).some((text) =>
          parse(text).some((segment) => segment.kind === "placeholder" && segment.reference.namespace !== "project"),
        ) || walk(obj.children ?? []),
    )
  return (project.screens ?? []).some((screen) => walk(screen.objects ?? []))
}

// Every topic a live preview has to hear: the project's declared topics and
// every binding on every screen - nested objects and an arc's setpoint
// included - as bare topics, without their "#path". A binding missing from
// project.topics still shows on a device subscribed to it, so it is not
// left out here either.
export function projectSubscriptionTopics(project: { topics?: Topic[]; screens?: { objects: ScreenObject[] }[] }): string[] {
  const set = new Set<string>()
  for (const t of project.topics ?? []) if (t.topic) set.add(t.topic)
  const walk = (objects: ScreenObject[]) => {
    for (const obj of objects) {
      for (const binding of [obj.properties?.topic, obj.properties?.setpointTopic]) {
        if (typeof binding === "string" && binding) set.add(splitTopicPath(binding).topic)
      }
      // And every topic a placeholder in its text or label names
      // (docs/2026-09-25-text-placeholders.md).
      for (const text of placeholderTexts(obj)) {
        for (const topic of referencedTopics(text)) set.add(splitTopicPath(topic).topic)
      }
      if (obj.children?.length) walk(obj.children)
    }
  }
  for (const screen of project.screens ?? []) walk(screen.objects ?? [])
  return [...set]
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

// No value yet - nothing arrived on the topic - is the empty string, on the
// device (ProjectLoader starts every topic empty) and in the designer's live
// preview. Each type then draws nothing of its value (docs/2026-09-15-live-data.md,
// decision 6); what that means per type is tabled in device-contract.md §4
// "No value until one arrives", and e2e/empty-values.spec.ts holds this side
// to it. The editor never sees
// it: there getPreviewValueFromTopic() answers with the first example, or a
// placeholder when there is none.
export function hasNoValue(value: string | undefined): boolean {
  return value === undefined || value.trim() === ""
}

// Walks a tab-control's panel children in order, returns the first whose
// condition matches the tab-control's own topic value - undefined if none
// match (renders nothing, the same "no match = draw nothing" behavior
// MQTTIconField already has via getIconPathForValue()).
//
// Without a value the first panel in drawing order is shown, so a screen
// built from tabs can still be navigated before anything has arrived - and
// no panel's condition gets to match an empty string by accident ("< 5"
// would, since an empty value reads as 0).
export function getActivePanel(
  tabControl: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
): ScreenObject | undefined {
  const topicValue = getPreviewValueFromTopic(tabControl.properties.topic)
  if (tabControl.properties.topic && hasNoValue(topicValue)) return sortChildrenByZIndex(tabControl.children ?? [])[0]
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
  /**
   * What a finger asked a control to become, where anything is outstanding: a
   * level's marker, a switch's ring (docs/2026-09-17-settable-level.md,
   * decision 6c). Absent means nothing is.
   */
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  /** Placeholders in texts and level labels (placeholderScope above). */
  placeholders?: PlaceholderScope
  requestRedraw: () => void
  // What an arc-level's anti-aliased edges mix into when its own background
  // is transparent, which is the usual case for a ring. See
  // render-arc-level.ts for why this is a declared colour rather than
  // whatever happens to be on the canvas.
  screenBackgroundColor?: string

  // Set when drawing a tab-control panel's children rather than the screen's
  // own top-level objects.
  //
  // It matters for exactly one thing today, and only for icons: the export
  // flattens the STATIC top-level objects into the screen background and
  // bakes everything else as its own bitmap (asset-export.ts's
  // flattenedIds). A top-level icon therefore reaches the device through the
  // background, drawn in place on the screen's grid, while a nested one
  // reaches it as a separate bitmap rasterised at the origin on its own
  // grid. The preview has to take whichever route the pixels really take, or
  // it shows an anti-aliased edge the device cannot produce.
  nested?: boolean
}

// Sorts by zIndex itself (frontmost last) - matches firmware's
// ScreenRenderer, which sorts every sibling list (top-level and nested) the
// same way, so callers no longer need to pre-sort. Recurses into
// "switcher" children: only the one panel whose condition matches the
// control's own topic value is rendered (ctx.translate()'d to the
// tab-control's origin, since panel children carry coordinates relative to
// it, not absolute screen coordinates), everything else in that subtree is
// skipped entirely. A tab-control/panel never draws anything of its own -
// pure layout/condition scaffolding around ordinary leaf objects.
export function renderScreenObjects(ctx: CanvasRenderingContext2D, objects: ScreenObject[], options: RenderScreenObjectsOptions): void {
  const { fonts, projectAssets, topics, colorDepth, bdfFontCache, iconImageCache, getPreviewValueFromTopic, getAskedValueFromTopic, placeholders, requestRedraw, screenBackgroundColor } = options

  for (const obj of sortChildrenByZIndex(objects)) {
    switch (obj.type) {
      case "switcher": {
        const activePanel = getActivePanel(obj, getPreviewValueFromTopic)
        if (!activePanel) break
        ctx.save()
        ctx.translate(obj.x, obj.y)
        renderScreenObjects(ctx, activePanel.children ?? [], { ...options, nested: true })
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

      case "text":
        renderLabel(ctx, obj, fonts, false, 1, bdfFontCache, placeholders, colorDepth)
        break

      case "live-text":
      case "live-icon":
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

      case "live-line":
        renderMqttDataLine({ ctx, obj, zoom: 1, colorDepth, topics, getPreviewValueFromTopic })
        break

      case "icon":
        renderIcon({ ctx, obj, projectAssets, iconImageCache, requestRedraw, nested: options.nested })
        break

      case "gauge":

      case "dial":
        renderArcLevel({
          ctx,
          obj,
          fonts,
          topics,
          zoom: 1,
          bdfFontCache,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          colorDepth,
          screenBackgroundColor,
          requestRedraw,
        })
        break

      case "bar":

      case "slider":
        renderLevelIndicator({
          ctx,
          obj,
          fonts,
          topics,
          zoom: 1,
          bdfFontCache,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          placeholders,
          colorDepth,
          // What the bar sits on, and so half of its track's colour
          // (levelTrackLook). Missing here until 2026-09-19, which mixed every
          // reference render's track with white whatever the screen was.
          screenBackgroundColor,
          projectAssets,
          iconImageCache,
          requestRedraw,
        })
        break

      case "button":
        renderSoftwareButton({
          ctx,
          obj,
          fonts,
          projectAssets,
          isSelected: false,
          zoom: 1,
          iconImageCache,
          bdfFontCache,
          requestRedraw,
          colorDepth,
          screenBackgroundColor,
        })
        break

      case "switch":

      case "button-group":
        renderSwitch({
          ctx,
          obj,
          screenBackgroundColor,
          fonts,
          projectAssets,
          isSelected: false,
          zoom: 1,
          iconImageCache,
          bdfFontCache,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          requestRedraw,
          colorDepth,
        })
        break
    }
  }
}
