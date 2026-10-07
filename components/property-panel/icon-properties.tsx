"use client"

/**
 * An icon: one picture from the project's library.
 *
 * Round 8 of the rebuild (docs/2026-09-20-property-panel.md), and the
 * shortest panel of the nineteen - three rows and a frame. It is also where
 * the fourth copy of the icon slot goes: the thumbnail, the name and the
 * clear button were written out again here, with the same `atob` and the
 * same placeholder square as in three other files.
 *
 * The height is the width's. An icon's artwork is square and the canvas has
 * always enforced that when one is drawn or resized (`isSquareType`); this
 * panel was the one place left where a number could be typed into an oval
 * the canvas would never produce.
 */

import type { ScreenObject, ProjectAsset, Topic } from "../project-editor"
import { nextLiveValueId, type LiveValue } from "@/lib/live-value"
import { referenceEntries } from "@/lib/placeholder-completion"
import { liveIconValue } from "@/lib/object-text"
import { cn } from "@/lib/utils"
import { LiveValueEditor, type IconTarget } from "./live-value-editor"
import {
  ColorField,
  FieldNote,
  FrameFields,
  IconField,
  IconTintField,
  PropertySection,
  PropertySections,
  SizeStepField,
  frameSummary,
} from "./fields"
import type { TextScale } from "@/lib/size-scale"

interface IconPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  /** The device's scale, when it gives one: the edge is then S, M or L. */
  textScale?: TextScale
  onOpenIconSelector?: () => void
  /** The project's topics, for a live icon's source. */
  topics?: Topic[]
  /** Opens the icon library for a live icon's result. */
  onOpenLiveIconSelector?: (liveValueId: string, target: IconTarget) => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
}

export function IconProperties({
  selectedObject,
  onUpdateObject,
  projectAssets,
  colorDepth,
  onOpenIconSelector,
  allScreens,
  textScale,
  topics = [],
  onOpenLiveIconSelector,
}: IconPropertiesProps) {
  const liveValue = liveIconValue(selectedObject)

  // Fixed or Live (docs/2026-10-07-live-values.md, decision 9). Live keeps
  // the fixed icon as what shows when no rule applies; Fixed keeps that one.
  const makeLive = () => {
    const first = referenceEntries("", topics)[0]?.reference ?? "topic:"
    const colon = first.indexOf(":")
    const lv: LiveValue = {
      id: nextLiveValueId([]),
      source: { namespace: first.slice(0, colon) as LiveValue["source"]["namespace"], path: first.slice(colon + 1) },
      rules: [],
      ...(selectedObject.properties.assetId ? { otherwise: { kind: "icon" as const, icon: selectedObject.properties.assetId } } : {}),
    }
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, liveIconId: lv.id, liveValues: [lv] } })
  }
  const makeFixed = () => {
    const otherwise = liveValue?.otherwise?.kind === "icon" ? liveValue.otherwise.icon : undefined
    const { liveIconId: _id, liveValues: _values, ...properties } = selectedObject.properties
    onUpdateObject(selectedObject.id, { properties: { ...properties, assetId: otherwise ?? properties.assetId } })
  }
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    if (key === "width") {
      const size = Math.max(1, value)
      onUpdateObject(selectedObject.id, { width: size, height: size })
      return
    }
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  return (
    <PropertySections>
      <PropertySection title="Content">
        <div role="radiogroup" aria-label="Icon" className="flex w-fit rounded-md bg-muted p-0.5 text-xs">
          {(["Fixed", "Live"] as const).map((mode) => {
            const on = (mode === "Live") === Boolean(liveValue)
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-label={mode}
                aria-checked={on}
                onClick={() => (mode === "Live" ? !liveValue && makeLive() : liveValue && makeFixed())}
                className={cn("rounded px-3 py-1", on ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              >
                {mode}
              </button>
            )
          })}
        </div>
        {liveValue ? (
          <LiveValueEditor
            liveValue={liveValue}
            position={1}
            count={1}
            title="Live icon"
            closable={false}
            resultKind="icon"
            projectAssets={projectAssets}
            topics={topics}
            onChange={(changed) =>
              onUpdateObject(selectedObject.id, {
                properties: {
                  ...selectedObject.properties,
                  liveValues: (selectedObject.properties.liveValues as LiveValue[]).map((lv) => (lv.id === changed.id ? changed : lv)),
                },
              })
            }
            onClose={() => {}}
            onPickIcon={(target) => onOpenLiveIconSelector?.(liveValue.id, target)}
          />
        ) : (
          <IconField
            label="Icon"
            assetId={selectedObject.properties.assetId}
            projectAssets={projectAssets}
            onSelect={onOpenIconSelector}
            onClear={() => updateProperty("assetId", null)}
          />
        )}
        {!liveValue && selectedObject.properties.assetId ? (
          <FieldNote>
            The picture itself lives in Project Settings &rarr; Assets. Change it there and every icon using it
            follows.
          </FieldNote>
        ) : null}
      </PropertySection>

      {/* Only where the device gives a scale: the edge in millimetres. */}
      {textScale ? (
        <PropertySection title="Shape">
          <SizeStepField
            object={selectedObject}
            pixelsPerMm={textScale.pixelsPerMm}
            fonts={[]}
            onChange={(updates) => onUpdateObject(selectedObject.id, updates)}
          />
        </PropertySection>
      ) : null}

      <PropertySection title="Colour">
        <IconTintField
          // A live icon's colour is every icon its rules can show.
          assetIds={
            liveValue
              ? [...liveValue.rules.map((r) => r.result), liveValue.otherwise, liveValue.noValueYet].flatMap((r) => (r?.kind === "icon" && r.icon ? [r.icon] : []))
              : [selectedObject.properties.assetId]
          }
          projectAssets={projectAssets}
          iconColor={selectedObject.properties.iconColor}
          iconColorFlatten={selectedObject.properties.iconColorFlatten}
          onUpdate={updateProperty}
          colorDepth={colorDepth}
        />
        <ColorField
          label="Background"
          value={selectedObject.properties.backgroundColor || "transparent"}
          onChange={(value) => updateProperty("backgroundColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}
      >
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={updatePosition}
          // "Width", not "Size": Size is the step in Shape (2026-09-30).
          captions={{ width: "Width" }}
          locked={["height"]}
          lockedHint="An icon's artwork is square, so the height follows the width."
        />
      </PropertySection>
    </PropertySections>
  )
}
