"use client"

/**
 * A group: objects kept together in the designer (lib/object-groups.ts).
 *
 * It has nothing of its own to set. Its size is its objects' bounding box,
 * worked out after every change, so of the four frame values only the
 * position can be typed - the other two are shown locked, with the reason.
 * What the panel adds is how to get at the objects inside, and the way out
 * of the group again.
 */

import type { ScreenObject } from "../project-editor"
import { ButtonGroupRow, FieldNote, FrameFields, PropertySection, PropertySections, frameSummary } from "./fields"

interface GroupPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  onUngroup?: () => void
}

export function GroupProperties({ selectedObject, onUpdateObject, onUngroup }: GroupPropertiesProps) {
  const count = selectedObject.children?.length ?? 0
  return (
    <PropertySections>
      <PropertySection title="Group" summary={`${count} ${count === 1 ? "object" : "objects"}`}>
        <FieldNote>
          Double-click the group on the canvas, or pick one of its objects in the object list, to work on a single
          object inside it. Only the designer knows groups: the device gets the objects themselves.
        </FieldNote>
        {onUngroup ? <ButtonGroupRow label="" buttons={[{ label: "Ungroup", onClick: onUngroup }]} /> : null}
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
          onChange={(key, value) => {
            if (key === "x" || key === "y") onUpdateObject(selectedObject.id, { [key]: value })
          }}
          locked={["width", "height"]}
          lockedHint="A group is always as big as the objects in it."
        />
      </PropertySection>
    </PropertySections>
  )
}
