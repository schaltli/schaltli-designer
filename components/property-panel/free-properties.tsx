"use client"

/**
 * A free area's properties (docs/2026-10-03-free-screens.md): what is put
 * into it stays where it is placed; it may look like a box.
 */

import type { ScreenObject } from "../project-editor"
import { ColorField, FieldNote, FrameFields, NumberField, PropertySection, PropertySections, SelectField, frameSummary } from "./fields"
import { areaAnchorOf, STRETCHES_HEIGHT_IN_AREA, STRETCHES_WIDTH_IN_AREA, type AnchorX, type AnchorY } from "@/lib/anchor"
import { dockOf, type Dock } from "@/lib/dock"
import { cardLookOf } from "@/lib/card"
import { freeMinSize } from "@/lib/free-min-size"
import { gapMmOf, SNAP_GAP_MM } from "@/lib/snap-table"
import type { LayoutScale } from "@/lib/layout"

const LOOK = [
  { value: "none", label: "None" },
  { value: "card", label: "Card" },
  { value: "card-accent", label: "Card, accent" },
]

/** A free area: only its frame - what is in it stays where it is placed. */
export function FreeProperties({
  selectedObject,
  onUpdateObject,
  colorDepth,
  scale,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  // For how small it can be made: its fonts and the panel's pixels per mm.
  scale?: LayoutScale
}) {
  const set = (key: string, value: unknown) =>
    onUpdateObject(selectedObject.id, { properties: { ...selectedObject.properties, [key]: value } })
  // A box's look (asked 2026-10-05): fill, edge and corners, the same
  // properties a Box has. A device gets it as a box behind what the area
  // holds (lib/object-groups.ts freeBox). Without them it draws nothing.
  // With a card's look (docs/2026-11-03-card.md) they come from Settings ›
  // Cards and the theme, and are not shown; set back to None, the area keeps
  // them as its own.
  const look = cardLookOf(selectedObject)
  const setLook = (value: string) => {
    const { look: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: value === "none" ? rest : { ...rest, look: value } })
  }
  return (
    <PropertySections>
      <PropertySection title="Free">
        <FieldNote>
          What is put into it stays where it is placed, as on a free screen, and follows its edges when it is resized as its Position says. It looks like a
          Box, if you give it a fill or an edge.
        </FieldNote>
        <SelectField id="freeLook" label="Look" value={look ?? "none"} options={LOOK} onChange={setLook} />
        {look ? (
          <FieldNote>
            {look === "card-accent" ? "Panel with an Accent edge" : "Panel with an Outline edge"}, from the theme; corner radius, edge and padding from
            Settings › Cards. Set Look to None to change them here.
          </FieldNote>
        ) : null}
        {look ? null : <NumberField
          id="padding"
          label="Padding"
          value={selectedObject.properties.padding ?? 0}
          onChange={(value) => set("padding", value > 0 ? value : undefined)}
          min={0}
          max={20}
          step={0.5}
          unit="mm"
          hint="Room left free inside its edge for what is docked in it."
        />}
        <NumberField
          id="freeGap"
          label="Gap"
          value={gapMmOf(selectedObject)}
          onChange={(value) => set("gapMm", value === SNAP_GAP_MM ? undefined : value)}
          min={0}
          max={10}
          step={0.5}
          unit="mm"
          hint="Between the objects docked in it."
        />
      </PropertySection>
      {look ? null : <PropertySection title="Shape">
        <NumberField
          id="strokeWidth"
          label="Stroke width"
          value={selectedObject.properties.strokeWidth ?? 0}
          onChange={(value) => set("strokeWidth", value)}
          min={0}
          max={10}
          unit="px"
          hint="Zero draws no edge at all."
        />
        <NumberField
          id="cornerRadius"
          label="Corner radius"
          value={selectedObject.properties.cornerRadius || 0}
          onChange={(value) => set("cornerRadius", value)}
          min={0}
          max={20}
          unit="px"
        />
      </PropertySection>}
      {look ? null : <PropertySection title="Colour">
        <ColorField
          label="Fill"
          value={selectedObject.properties.fillColor || "transparent"}
          onChange={(value) => set("fillColor", value)}
          colorDepth={colorDepth}
          allowTransparent={true}
        />
        <ColorField
          label="Stroke"
          value={selectedObject.properties.strokeColor || "text"}
          onChange={(value) => set("strokeColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
        />
      </PropertySection>}
      <PropertySection title="Frame" summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={(key, value) => {
            // Typed as dragged: no smaller than all it holds needs
            // (the user, 2026-11-06; lib/free-min-size.ts).
            const min = (key === "width" || key === "height") && scale ? freeMinSize(selectedObject, scale) : undefined
            onUpdateObject(selectedObject.id, { [key]: min ? Math.max(value, min[key as "width" | "height"]) : value })
          }}
        />
      </PropertySection>
    </PropertySections>
  )
}

const HORIZONTAL: Array<{ value: AnchorX; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "stretch", label: "Stretch" },
]
const DOCK: Array<{ value: Dock | "none"; label: string }> = [
  { value: "none", label: "None" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "fill", label: "Fill" },
]
const VERTICAL: Array<{ value: AnchorY; label: string }> = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
  { value: "stretch", label: "Stretch" },
]

/**
 * An object directly in a free area (docs/2026-11-03-anchor-dock.md): which
 * edges of the area it keeps its distance to when the area is resized.
 * Left/Top, the default, is not stored.
 */
export function FreePositionProperties({
  selectedObject,
  onUpdateObject,
}: {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}) {
  const anchor = areaAnchorOf(selectedObject)
  const set = (axis: "x" | "y", value: string) => {
    const next: Record<string, string> = { ...(selectedObject.properties?.anchor ?? {}), [axis]: value }
    if (next.x === "left") delete next.x
    if (next.y === "top") delete next.y
    const { anchor: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: Object.keys(next).length > 0 ? { ...rest, anchor: next } : rest })
  }
  const offer = <T extends { value: string }>(options: T[], stretches: boolean) => (stretches ? options : options.filter((o) => o.value !== "stretch"))
  const dock = dockOf(selectedObject)
  const setDock = (value: string) => {
    const { dock: _old, ...rest } = selectedObject.properties ?? {}
    onUpdateObject(selectedObject.id, { properties: value === "none" ? rest : { ...rest, dock: value } })
  }
  // Docked, an axis is the area's to set: along the dock always, across it
  // where the object can stretch that way (lib/dock.ts).
  const canW = STRETCHES_WIDTH_IN_AREA.has(selectedObject.type) || selectedObject.type === "table"
  const canH = STRETCHES_HEIGHT_IN_AREA.has(selectedObject.type)
  const showX = !dock || ((dock === "top" || dock === "bottom" || dock === "fill") && !canW)
  const showY = !dock || ((dock === "left" || dock === "right" || dock === "fill") && !canH)
  return (
    <PropertySection title="Position">
      <SelectField id="areaDock" label="Dock" value={dock ?? "none"} options={DOCK} onChange={setDock} />
      {showX ? (
        <SelectField id="areaHorizontal" label="Horizontal" value={anchor.x} options={offer(HORIZONTAL, !dock && STRETCHES_WIDTH_IN_AREA.has(selectedObject.type))} onChange={(x) => set("x", x)} />
      ) : null}
      {showY ? (
        <SelectField id="areaVertical" label="Vertical" value={anchor.y} options={offer(VERTICAL, !dock && STRETCHES_HEIGHT_IN_AREA.has(selectedObject.type))} onChange={(y) => set("y", y)} />
      ) : null}
      <FieldNote>
        {dock
          ? "The area places it along its edge, inside its padding, in the order of the object list."
          : "When the free area is resized, it keeps its distance to these edges; Center and Middle keep it to the middle, Stretch to both."}
      </FieldNote>
    </PropertySection>
  )
}
