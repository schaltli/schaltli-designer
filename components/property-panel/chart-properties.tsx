"use client"

/**
 * A chart (docs/2026-10-16-charts.md): for now its frame alone
 * (tasks/charts-model-plan.md decision 6). Its series, axes and legend come
 * with charts-designer.
 */

import type { ScreenObject } from "../project-editor"
import { FrameFields, PropertySection, PropertySections, frameSummary } from "./fields"

interface ChartPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}

export function ChartProperties({ selectedObject, onUpdateObject }: ChartPropertiesProps) {
  return (
    <PropertySections>
      <PropertySection title="Frame" summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={(key, value) => onUpdateObject(selectedObject.id, { [key]: key === "width" || key === "height" ? Math.max(1, value) : value })}
        />
      </PropertySection>
    </PropertySections>
  )
}
