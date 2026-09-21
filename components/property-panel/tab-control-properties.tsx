"use client"

/**
 * A switcher: one box holding several layouts, and the value that picks one.
 *
 * Round 13 of the rebuild (docs/2026-09-20-property-panel.md). Its panels
 * are the fifth list, and the only one whose entries are objects in their
 * own right - each has its own property panel (panel-properties.tsx, round
 * 1), which is why an entry here opens it for editing rather than repeating
 * its fields.
 *
 * "Open" is what the old panel called "Edit": it pins that panel open on the
 * canvas whatever its condition says, so the things inside it can be
 * arranged. The button says "Open" and, while that panel is the pinned one,
 * "Open" is replaced by the accent-coloured state the list entry already
 * carries.
 */

import type { ScreenObject, Topic } from "../project-editor"
import type { ComparisonOperator } from "@/lib/comparison-operators"
import { normalizeOperator } from "@/lib/comparison-operators"
import {
  AddListItem,
  ButtonGroupRow,
  ConditionRow,
  FieldNote,
  FrameFields,
  ListItem,
  PropertySection,
  PropertySections,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

interface TabControlPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  editingTabContext: { tabControlId: string; panelId: string } | null
  onSetEditingTabContext: (context: { tabControlId: string; panelId: string } | null) => void
  onAddPanel: (tabControlId: string) => void
}

export function TabControlProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  onSelectObject,
  editingTabContext,
  onSetEditingTabContext,
  onAddPanel,
}: TabControlPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const panels = selectedObject.children ?? []

  const updatePanelProperty = (panelId: string, key: string, value: any) => {
    const panel = panels.find((p) => p.id === panelId)
    if (!panel) return
    onUpdateObject(selectedObject.id, {
      children: panels.map((p) => (p.id === panelId ? { ...p, properties: { ...p.properties, [key]: value } } : p)),
    })
  }

  const deletePanel = (panelId: string) => {
    onUpdateObject(selectedObject.id, { children: panels.filter((panel) => panel.id !== panelId) })
    if (editingTabContext?.panelId === panelId) onSetEditingTabContext(null)
  }

  const movePanel = (from: number, to: number) => {
    const next = [...panels]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onUpdateObject(selectedObject.id, { children: next })
  }

  const openPanel = (panelId: string) => {
    onSetEditingTabContext({ tabControlId: selectedObject.id, panelId })
    onSelectObject(panelId)
  }

  return (
    <PropertySections>
      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
          hint="Every panel's condition is compared against this one value."
        />
      </PropertySection>

      <PropertySection title="Panels" summary={listSummary(panels.length, "panel")}>
        <FieldNote>Read from the top. The first panel whose condition matches is the one drawn.</FieldNote>

        {panels.map((panel, index) => {
          const editing =
            editingTabContext?.tabControlId === selectedObject.id && editingTabContext.panelId === panel.id
          const operator = normalizeOperator(panel.properties?.comparisonOperator)
          const value = panel.properties?.comparisonValue ?? ""
          return (
            <ListItem
              key={panel.id}
              title={String(index + 1)}
              summary={`${operator} ${value}${editing ? " · open" : ""}`}
              defaultOpen={index === 0}
              index={index}
              onReorder={movePanel}
              onRemove={() => deletePanel(panel.id)}
            >
              <ConditionRow
                label="Shown when"
                operator={panel.properties?.comparisonOperator}
                value={value}
                onOperatorChange={(next: ComparisonOperator) =>
                  updatePanelProperty(panel.id, "comparisonOperator", next)
                }
                onValueChange={(next) => updatePanelProperty(panel.id, "comparisonValue", next)}
                placeholder="e.g. TEMP or 42"
              />
              {/* A panel is an object with a panel of its own, so this hands
                  it over rather than repeating its fields here. */}
              <ButtonGroupRow
                label=""
                buttons={[
                  {
                    label: editing ? "Editing this panel" : "Open for editing",
                    onClick: () => openPanel(panel.id),
                    disabled: editing,
                  },
                ]}
              />
            </ListItem>
          )
        })}

        <AddListItem label="Add panel" onClick={() => onAddPanel(selectedObject.id)} />
        {panels.length === 0 ? (
          <FieldNote>Nothing is drawn until there is at least one panel.</FieldNote>
        ) : null}
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
        />
        <FieldNote>Every panel fills this box exactly.</FieldNote>
      </PropertySection>
    </PropertySections>
  )
}
