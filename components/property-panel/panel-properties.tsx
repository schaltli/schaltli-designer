"use client"

/**
 * A panel: one of a switcher's several layouts, and the condition that
 * decides which one is showing.
 *
 * First panel rebuilt on the shared fields (round 1 of
 * docs/2026-09-20-property-panel.md) - deliberately the smallest one, to
 * prove the field set before anything large leans on it.
 *
 * A panel has no geometry of its own: it always fills its switcher's box
 * exactly. It has no name either - it is known by the value it answers to,
 * which is what the object tree shows ("Panel: auto"). So of the seven
 * positions it uses two, and the Frame section exists only to say why there
 * is nothing in it.
 */

import type { ScreenObject } from "../project-editor"
import type { ComparisonOperator } from "@/lib/comparison-operators"
import { ConditionRow, FieldNote, PropertySection, PropertySections } from "./fields"
import { AreaSections } from "./free-properties"

interface PanelPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  parentTabControl: ScreenObject | null
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  colorDepth: "1bit" | "4bit" | "24bit"
}

export function PanelProperties({
  selectedObject,
  onUpdateObject,
  parentTabControl,
  onSelectObject,
  colorDepth,
}: PanelPropertiesProps) {
  const updateProperty = (key: string, value: unknown) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const topic = parentTabControl?.properties?.topic as string | undefined

  return (
    <PropertySections>
      <PropertySection title="Visibility">
        <ConditionRow
          label="Shown when"
          operator={selectedObject.properties.comparisonOperator}
          value={selectedObject.properties.comparisonValue}
          onOperatorChange={(op: ComparisonOperator) => updateProperty("comparisonOperator", op)}
          onValueChange={(value) => updateProperty("comparisonValue", value)}
          placeholder="e.g. TEMP or 42"
          hint="Only the first panel whose condition matches is shown. Open a panel for editing from the tab strip on the canvas, or from the switcher's own panel list."
        />
        {parentTabControl ? (
          <FieldNote>
            Compared against{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onSelectObject(parentTabControl.id)}
            >
              {parentTabControl.id}
            </button>
            {topic ? (
              <>
                {"'s topic "}
                <span className="font-mono">{topic}</span>
              </>
            ) : (
              "'s topic, once it has one"
            )}
            .
          </FieldNote>
        ) : null}
      </PropertySection>

      {/* A panel is an area (docs/2026-11-16-areas.md): the sections an
          area standing alone has - what stands in it docks inside its
          padding, and it can look like a card. */}
      <AreaSections
        selectedObject={selectedObject}
        onUpdateObject={onUpdateObject}
        colorDepth={colorDepth}
        title="Area"
        note="What is put into it stays where it is placed, or is docked to an edge, as its Position says. It looks like a Box, if you give it a fill or an edge."
      />

      <PropertySection title="Frame" defaultCollapsed summary="Follows the switcher">
        <FieldNote>
          A panel fills its switcher's box exactly, so it has no position or size of its own. Move or resize the
          switcher instead. The switcher is never smaller than what its panels hold.
        </FieldNote>
      </PropertySection>
    </PropertySections>
  )
}
