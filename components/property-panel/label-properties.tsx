"use client"

/**
 * Text: words the author writes, and placeholders such as
 * {topic:…:F0} that the device fills in (docs/2026-09-25-text-placeholders.md).
 *
 * Round 7 of the rebuild (docs/2026-09-20-property-panel.md). The "Insert"
 * row of {screen}-style tokens went on 2026-09-25 with the tokens; typing `{`
 * opens a picker instead (docs/2026-09-25-placeholder-picker.md).
 *
 * Align sits in Text with the font, not in Content. A value from a topic is
 * a `{topic:…}` placeholder in the text - Live Text, which did that as a type
 * of its own, went into Text on 2026-10-07.
 */

import { computeCombined, type CombinedTopic } from "@/lib/combined-topics"
import { useEffect, useState } from "react"
import { calculateTextObjectHeight, getFontHeight } from "@/lib/font-utils"
import { DEFAULT_SEPARATORS, parse, type Separators } from "@/lib/placeholders"
import { liveTextSegments, placeholdersToLiveValues, sourceShortName, textOf } from "@/lib/live-value"
import { LiveValueEditor } from "./live-value-editor"
import { topicExample } from "@/lib/placeholder-completion"
import { LiveTextField } from "./fields/live-text-field"
import { liveValuesOf } from "@/lib/object-text"
import type { TextScale } from "@/lib/size-scale"
import type { ScreenObject, ProjectFont, Topic } from "../project-editor"
import {
  ColorField,
  FontField,
  TextStyleField,
  FrameFields,
  PropertySection,
  PropertySections,
  SelectField,
  frameSummary,
} from "./fields"

const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const

interface LabelPropertiesProps {
  /** The project's combined topics, for a chip's source. */
  combinedTopics?: CombinedTopic[]
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  /**
   * Declares the topics a text's placeholders name, when the field is left
   * (docs/2026-09-25-text-placeholders.md) - not on every keystroke, which
   * would declare every half-typed path on the way.
   */
  onDeclareTopics?: (topics: string[]) => void
  /** What `{` in the Text offers, and the number format its previews use. */
  topics: Topic[]
  numberSeparators?: Separators
  fonts: ProjectFont[]
  /** The device's scale, when it gives one: text is then set in a style. */
  textScale?: TextScale
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function LabelProperties({
  selectedObject,
  onUpdateObject,
  onDeclareTopics,
  topics,
  combinedTopics = [],
  numberSeparators,
  fonts,
  textScale,
  colorDepth,
  onManageFonts,
  allScreens,
}: LabelPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const liveValues = liveValuesOf(selectedObject)
  // The live value whose editor is open under the field, and the chips in
  // the order the text has them, for ‹ and ›.
  const [openLiveValueId, setOpenLiveValueId] = useState<string | null>(null)
  useEffect(() => setOpenLiveValueId(null), [selectedObject.id])
  const chipOrder = [
    ...new Set(
      liveTextSegments(String(selectedObject.properties.text ?? ""), liveValues).flatMap((segment) => (segment.kind === "live" ? [segment.id] : [])),
    ),
  ]
  const openLiveValue = openLiveValueId && chipOrder.includes(openLiveValueId) ? liveValues.find((lv) => lv.id === openLiveValueId) : undefined
  const chipIndex = openLiveValue ? chipOrder.indexOf(openLiveValue.id) : -1

  // As tall as the font it is drawn in.
  const font = fonts.find((f) => f.id === selectedObject.properties.fontId)
  const derivedHeight = font
    ? getFontHeight(font)
    : calculateTextObjectHeight(selectedObject.properties.fontSize || 16)

  return (
    <PropertySections>
      <PropertySection title="Content">
        <LiveTextField
          id="text"
          label="Text"
          text={selectedObject.properties.text}
          liveValues={liveValues}
          onChange={(text, next) => {
            onUpdateObject(selectedObject.id, {
              properties: { ...selectedObject.properties, text, liveValues: next.length > 0 ? next : undefined },
            })
          }}
          onBlur={(text, current) => {
            // A placeholder typed in full becomes a chip; a live value whose
            // chip is gone goes with it (docs/2026-10-07-live-values.md).
            const typed = parse(text).some((segment) => segment.kind === "placeholder")
            const live = typed ? placeholdersToLiveValues(text, current, numberSeparators ?? DEFAULT_SEPARATORS) : { text, liveValues: current }
            const kept = live.liveValues.filter((lv) => live.text.includes(`{live:${lv.id}}`))
            onDeclareTopics?.(kept.filter((lv) => lv.source.namespace === "topic").map((lv) => lv.source.path))
            if (live.text !== text || kept.length !== current.length) {
              onUpdateObject(selectedObject.id, {
                properties: { ...selectedObject.properties, text: live.text, liveValues: kept.length > 0 ? kept : undefined },
              })
            }
          }}
          onOpenLiveValue={setOpenLiveValueId}
          openLiveValueId={openLiveValueId}
          chipLabel={(lv) => ({
            name: sourceShortName(lv.source),
            reads: textOf(
              lv,
              lv.source.namespace === "topic"
                ? topicExample(lv.source.path, topics)
                : lv.source.namespace === "combined"
                  ? computeCombined(combinedTopics, (path) => topicExample(path, topics)).get(lv.source.path)
                  : undefined,
              numberSeparators ?? DEFAULT_SEPARATORS,
            ),
          })}
          topics={topics}
          combinedTopics={combinedTopics}
          separators={numberSeparators}
        />
        {openLiveValue ? (
          <LiveValueEditor
            liveValue={openLiveValue}
            combinedTopics={combinedTopics}
            position={chipOrder.indexOf(openLiveValue.id) + 1}
            count={chipOrder.length}
            topics={topics}
            onChange={(changed) =>
              onUpdateObject(selectedObject.id, {
                properties: { ...selectedObject.properties, liveValues: liveValues.map((lv) => (lv.id === changed.id ? changed : lv)) },
              })
            }
            onPrevious={chipIndex > 0 ? () => setOpenLiveValueId(chipOrder[chipIndex - 1]) : undefined}
            onNext={chipIndex < chipOrder.length - 1 ? () => setOpenLiveValueId(chipOrder[chipIndex + 1]) : undefined}
            onClose={(backToText) => {
              setOpenLiveValueId(null)
              if (backToText) document.getElementById("text")?.focus()
            }}
          />
        ) : null}
      </PropertySection>

      <PropertySection title="Text">
        {textScale ? (
          // On a device with a scale the text is set in a style, and its
          // font follows from the device's typography
          // (docs/2026-09-30-size-scale.md). The height follows the font, as
          // it does below.
          <TextStyleField
            textStyle={selectedObject.properties.textStyle}
            textBold={selectedObject.properties.textBold === true}
            fontId={selectedObject.properties.fontId}
            fontSize={selectedObject.properties.fontSize}
            fonts={fonts}
            scale={textScale}
            onChange={(styled) =>
              onUpdateObject(selectedObject.id, {
                height: calculateTextObjectHeight(styled.fontSize),
                properties: { ...selectedObject.properties, ...styled },
              })
            }
          />
        ) : (
          <FontField
            value={selectedObject.properties.fontId}
            fonts={fonts}
            onManageFonts={onManageFonts}
            onChange={(value) => {
              const f = fonts.find((fn) => fn.id === value)
              const fontSize = f?.size || selectedObject.properties.fontSize || 16
              onUpdateObject(selectedObject.id, {
                height: calculateTextObjectHeight(fontSize),
                properties: { ...selectedObject.properties, fontId: value, fontSize },
              })
            }}
          />
        )}
        <SelectField
          id="textAlign"
          label="Align"
          value={selectedObject.properties.textAlign || "left"}
          options={ALIGN}
          onChange={(value) => updateProperty("textAlign", value)}
        />
      </PropertySection>

      <PropertySection title="Colour">
        {/* `color`, not `textColor`: the shared text-box renderer resolves
            `color` first and only falls back to `textColor` for what the MQTT
            field writes (render-text-box.ts), and the firmware's
            ScreenRenderer checks the same order. Writing the other one here
            would edit a property nothing reads. */}
        <ColorField
          label="Text"
          value={selectedObject.properties.color || selectedObject.properties.textColor || "text"}
          onChange={(value) => updateProperty("color", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
        <ColorField
          label="Background"
          value={selectedObject.properties.backgroundColor || "surface"}
          onChange={(value) => updateProperty("backgroundColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
        <ColorField
          label="Border"
          value={selectedObject.properties.borderColor || "outline"}
          onChange={(value) => updateProperty("borderColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, derivedHeight)}
      >
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={derivedHeight}
          onChange={updatePosition}
          locked={["height"]}
          lockedHint="As tall as the font it is drawn in. Choose another font to change it."
        />
      </PropertySection>
    </PropertySections>
  )
}
