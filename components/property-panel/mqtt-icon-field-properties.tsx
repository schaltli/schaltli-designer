"use client"

/**
 * Live Icon: a picture chosen by what arrives on a topic.
 *
 * Round 9 of the rebuild (docs/2026-09-20-property-panel.md), and the
 * biggest saving of the nineteen - 531 lines to under 200. Most of what went
 * was written out by hand: an operator list that disagreed with the other
 * three (it offered `=` where they offer `==` and had no `!=` at all,
 * lib/comparison-operators.ts), a fifth copy of the icon slot, and a rule
 * card about 210 px tall so three rules filled the panel.
 *
 * Order is the meaning here: the rules are read top to bottom and the first
 * match chooses the icon. That is why this is the round that made the list's
 * grip real - it was `cursor-grab` over nothing until now, and the two
 * arrow buttons this panel used to carry were the only working reordering
 * in the app.
 */

import { normalizeOperator, type ComparisonOperator } from "@/lib/comparison-operators"
import type { ScreenObject, Topic, ProjectAsset } from "../project-editor"
import {
  AddListItem,
  ColorField,
  ConditionRow,
  FieldNote,
  FrameFields,
  IconField,
  IconTintField,
  ListItem,
  PropertySection,
  PropertySections,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

interface MqttIconFieldPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector: (index: number) => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
  nextId: number
  onIncrementNextId: () => void
}

export function MqttIconFieldProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  projectAssets,
  colorDepth,
  onOpenIconSelector,
  allScreens,
  nextId,
  onIncrementNextId,
}: MqttIconFieldPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    // Square, like the plain icon: the artwork is, and the canvas enforces it.
    if (key === "width") {
      const size = Math.max(1, value)
      onUpdateObject(selectedObject.id, { width: size, height: size })
      return
    }
    if (key === "height") return
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const rules: any[] = selectedObject.properties.valueIconPairs || []
  const setRules = (next: any[]) => updateProperty("valueIconPairs", next)
  const editRule = (index: number, patch: Record<string, any>) =>
    setRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const addRule = () => {
    setRules([...rules, { id: `iconpair-${nextId}`, comparisonOperator: "==", value: "", thenShowIcon: "" }])
    onIncrementNextId()
  }

  const moveRule = (from: number, to: number) => {
    const next = [...rules]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setRules(next)
  }

  const iconName = (assetId: string | undefined) =>
    assetId ? projectAssets.find((a) => a.id === assetId)?.name || "an icon" : "nothing"

  return (
    <PropertySections>
      <PropertySection title="Data">
        <TopicField
          label="Topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />
      </PropertySection>

      <PropertySection title="Rules" summary={listSummary(rules.length, "rule")}>
        <FieldNote>Read from the top. The first rule that matches chooses the icon.</FieldNote>

        {rules.map((rule, index) => (
          <ListItem
            key={rule.id || `pair-${index}`}
            title={String(index + 1)}
            summary={`${normalizeOperator(rule.comparisonOperator)} ${rule.value ?? ""} → ${iconName(
              rule.thenShowIcon,
            )}`}
            defaultOpen={index === 0}
            index={index}
            onReorder={moveRule}
            onRemove={() => setRules(rules.filter((_, i) => i !== index))}
          >
            <ConditionRow
              label="If value"
              operator={rule.comparisonOperator}
              value={rule.value === undefined || rule.value === null ? "" : String(rule.value)}
              onOperatorChange={(operator: ComparisonOperator) => editRule(index, { comparisonOperator: operator })}
              onValueChange={(value) => editRule(index, { value })}
              placeholder="text or number"
            />
            <IconField
              label="Then"
              noun="icon"
              assetId={rule.thenShowIcon}
              projectAssets={projectAssets}
              onSelect={() => onOpenIconSelector(index)}
              onClear={() => editRule(index, { thenShowIcon: "" })}
            />
          </ListItem>
        ))}

        <AddListItem label="Add rule" onClick={addRule} />
        {rules.length === 0 ? <FieldNote>With no rules the object draws nothing.</FieldNote> : null}
      </PropertySection>

      <PropertySection title="Colour">
        {/* One colour for every rule's icon, the way a switch has one text
            colour for all its states. */}
        <IconTintField
          assetIds={rules.map((rule) => rule.thenShowIcon)}
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
          captions={{ width: "Size" }}
          locked={["height"]}
          lockedHint="An icon's artwork is square, so the height follows the size."
        />
      </PropertySection>
    </PropertySections>
  )
}
