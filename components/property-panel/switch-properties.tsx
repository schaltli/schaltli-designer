"use client"

/**
 * A switch and a button group: one area that cycles, and several segments
 * side by side.
 *
 * Round 4 of the rebuild (docs/2026-09-20-property-panel.md). Two types from
 * one file again, and this time they differ in exactly two rows - which is
 * the argument for keeping them together. A knob asks which states count as
 * switched on; a group asks each state for a second icon to wear while it is
 * the chosen one. Everything else is the same panel.
 *
 * The States list is the first one after Calibration, and the one that pays
 * for the shared `ListItem`: a state used to be a bordered card about 180 px
 * tall holding five controls, so three states filled the panel twice over.
 * Closed, a state is now one line that says what it is - "1  Off · off" -
 * and the first one opens so its fields are not hidden.
 *
 * Gone with it: a local icon picker (the fourth copy in the codebase, and
 * the one whose `atob` had no `try`), four hand-drawn SVG icons, and the
 * mode selector, which the split already removed the need for.
 */

import { switchColorOf, switchStateIsOn, switchStyleOf } from "@/lib/switch-shape"
import type { ScreenObject, Topic, ProjectAsset, ProjectFont } from "../project-editor"
import {
  AddListItem,
  ColorField,
  FieldNote,
  FontField,
  FrameFields,
  IconField,
  ListItem,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  TextPair,
  ToggleRow,
  TopicField,
  frameSummary,
  listSummary,
} from "./fields"

/**
 * How loud the chosen state is. One colour drives everything else - the
 * container, the chosen state's pill, the quiet track and every label are
 * worked out from it and from what the switch stands on
 * (docs/2026-09-20-switch-look.md).
 */
const STYLES = [
  { value: "filled", label: "Full colour" },
  { value: "tonal", label: "Tint" },
] as const

interface SwitchPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  projectAssets: ProjectAsset[]
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector: (stateIndex: number, slot: "normal" | "active") => void
  onManageFonts?: () => void
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

export function SwitchProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  projectAssets,
  fonts,
  colorDepth,
  onOpenIconSelector,
  onManageFonts,
  allScreens,
  nextId,
  onIncrementNextId,
}: SwitchPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const states: any[] = selectedObject.properties.states || []
  const knob = selectedObject.type === "switch"

  const updateState = (index: number, updates: Record<string, any>) => {
    const newStates = [...states]
    newStates[index] = { ...newStates[index], ...updates }
    updateProperty("states", newStates)
  }

  // A group's states are its segments, left to right, so their order is what
  // the device draws. There was no way to change it before round 9 gave the
  // list's grip something to do.
  const moveState = (from: number, to: number) => {
    const next = [...states]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    updateProperty("states", next)
  }

  const addState = () => {
    updateProperty("states", [
      ...states,
      {
        id: `switchstate-${nextId}`,
        label: `State ${states.length + 1}`,
        readValue: "",
        writeValue: "",
      },
    ])
    onIncrementNextId()
  }

  return (
    <PropertySections>
      <PropertySection title="Data">
        {/* Retained: it drives which state shows as the active one. */}
        <TopicField
          label="Read topic"
          selectedTopicId={selectedObject.properties.topic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("topic", topic)}
          onManageTopics={onManageTopics}
        />
        {/* The same picker as the read topic, restricted to registered
            topics the same way (2026-08-14: this was free text with a
            quick-pick beside it, and was deliberately made to match).
            allowSubtopics=false because a publish destination is a whole
            topic - you can send a payload to "sensor/data", never to a
            virtual "sensor/data#field" path. */}
        <TopicField
          label="Write topic"
          selectedTopicId={selectedObject.properties.writeTopic}
          topics={topics}
          onTopicChange={(topic) => updateProperty("writeTopic", topic)}
          onManageTopics={onManageTopics}
          allowSubtopics={false}
        />
      </PropertySection>

      <PropertySection title="Shape">
        <SelectField
          id="switchStyle"
          label="Style"
          value={switchStyleOf(selectedObject)}
          options={STYLES}
          onChange={(value) => updateProperty("switchStyle", value)}
          hint="How loud the chosen state is. Everything else - the container, the quiet track, the labels - follows from the one colour below."
        />
      </PropertySection>

      <PropertySection title="States" summary={listSummary(states.length, "state")}>
        <FieldNote>
          {knob
            ? "One area showing whichever state's read value matches the read topic. Tapping it publishes the next state's write value, wrapping around at the end; with no match yet it shows “?”."
            : "Segments side by side, in this order. Tapping one publishes its write value, and the active segment is whichever state's read value matches the read topic."}
        </FieldNote>

        {states.map((state, index) => (
          <ListItem
            key={state.id || `state-${index}`}
            title={String(index + 1)}
            summary={[state.label, state.readValue].filter(Boolean).join(" · ")}
            defaultOpen={index === 0}
            index={index}
            onReorder={moveState}
            onRemove={() => updateProperty("states", states.filter((_, i) => i !== index))}
          >
            <TextField
              label="Label"
              value={state.label}
              onChange={(value) => updateState(index, { label: value })}
              placeholder="Display text"
            />
            <TextPair
              label="Read / write"
              names={["Read value", "Write value"]}
              placeholders={["e.g. high", "e.g. high"]}
              values={[state.readValue, state.writeValue]}
              onChange={(which, value) =>
                updateState(index, which === 0 ? { readValue: value } : { writeValue: value })
              }
              hint="What arrives on the read topic for this state, and what is published when it is chosen. Often the same word."
            />
            <IconField
              label="Icon"
              assetId={state.iconAssetId}
              projectAssets={projectAssets}
              onSelect={() => onOpenIconSelector(index, "normal")}
              onClear={() => updateState(index, { iconAssetId: undefined })}
            />

            {/* Knob only: which states count as "on" is a question only the
                author can answer - "Auto" on a thermostat is neither
                obviously on nor obviously off - and the list has no
                reordering UI, so a positional convention would be
                uncorrectable. In a group every state is one of several and
                this is not asked. */}
            {knob ? (
              <ToggleRow
                label="Shows as on"
                text="Track takes the colour"
                checked={switchStateIsOn(state)}
                onChange={(checked) => updateState(index, { showAsOn: checked, showMarker: undefined })}
              />
            ) : (
              /* Group only. In a knob a state is only ever drawn while it is
                 active, so its own icon already is its active picture and a
                 second slot would leave the first unreachable. */
              <IconField
                label="Icon when active"
                assetId={state.activeIconAssetId}
                projectAssets={projectAssets}
                onSelect={() => onOpenIconSelector(index, "active")}
                onClear={() => updateState(index, { activeIconAssetId: undefined })}
                hint="A different picture while this segment is the chosen one - a filled bulb against an outlined one, say. Falls back to Icon when unset."
              />
            )}
          </ListItem>
        ))}

        <AddListItem label="Add state" onClick={addState} />
        {states.length === 0 ? (
          <FieldNote>{knob ? "A switch with no states shows nothing." : "Each state is one segment."}</FieldNote>
        ) : null}
      </PropertySection>

      <PropertySection title="Text">
        <FontField
          value={selectedObject.properties.fontId}
          fonts={fonts}
          onChange={(value) => updateProperty("fontId", value)}
          onManageFonts={onManageFonts}
        />
      </PropertySection>

      <PropertySection title="Colour">
        <ColorField
          label={knob ? "Switch" : "Buttons"}
          value={switchColorOf(selectedObject, colorDepth)}
          onChange={(value) => updateProperty("switchColor", value)}
          colorDepth={colorDepth}
          allowTransparent={false}
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
        />
      </PropertySection>
    </PropertySections>
  )
}
