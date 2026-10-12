"use client"

/**
 * The energy diagram (docs/2026-10-11-energy-diagram.md, «Behaviour»): its
 * mode, whether it moves, the Sankey's full scale, its fonts - and the list
 * «Nodes». A node is where energy comes from or goes: a source, a sink, a
 * storage with its charge, the one rest that is worked out, and the bus
 * every line runs through. A row opens its fields.
 *
 * In the Sankey the list is in the order the diagram stands, top to bottom,
 * and dragging a row changes it; in the Flow a node stands where it is
 * dragged on the canvas, and the list keeps the order nodes were added.
 */

import type { CombinedTopic } from "@/lib/combined-topics"
import type { Separators } from "@/lib/placeholders"
import type { LiveValue } from "@/lib/live-value"
import { DEFAULT_FULL_SCALE, MAX_NODE_LINES, WATTS_PLACEHOLDER, listedNodes, reorderedNodes, type EnergyLine, type EnergyNode, type EnergyRole } from "@/lib/energy-diagram"
import { isMainScreen, isPopup } from "@/lib/popup"
import type { HardwareButtonAction, ProjectAsset, ProjectFont, ScreenObject, Topic } from "../project-editor"
import { LiveTextEditor } from "./live-text-editor"
import {
  AddListItem,
  ColorField,
  FontField,
  IconField,
  ListItem,
  NumberField,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  ToggleRow,
  TopicField,
  listSummary,
} from "./fields"

interface EnergyDiagramPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  fonts: ProjectFont[]
  onManageFonts?: () => void
  topics: Topic[]
  onManageTopics: () => void
  combinedTopics?: CombinedTopic[]
  numberSeparators?: Separators
  onDeclareTopics?: (topics: string[]) => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  /** Opens the icon picker for one node. */
  onOpenNodeIcon: (nodeId: string) => void
  allScreens?: Array<{ id: string; name: string; screenType?: string; isMaster?: boolean }>
}

const MODES = [
  { value: "flow", label: "Flow" },
  { value: "sankey", label: "Sankey" },
]

/** What a node is, as the list and its role field call it. */
export const ROLE_LABELS: Record<EnergyRole, string> = {
  source: "Source",
  sink: "Sink",
  storage: "Storage",
  rest: "Rest",
  bus: "Bus",
}

const ROLE_HINTS: Record<EnergyRole, string> = {
  source: "Gives: the sun, the grid, the engine.",
  sink: "Takes: something measured on its own.",
  storage: "Takes while positive, gives while negative.",
  rest: "What comes in and is not measured going out - worked out, no topic.",
  bus: "Where every line meets.",
}

/** What a new node of a role is coloured. */
const NEW_COLOUR: Record<EnergyRole, string | undefined> = {
  source: "energySun",
  sink: "energyLoad",
  storage: "energyCharge",
  rest: "energyLoad",
  bus: undefined,
}

const NEW_NAME: Record<EnergyRole, string> = {
  source: "Source",
  sink: "Sink",
  storage: "Storage",
  rest: "Consumers",
  bus: "12 V",
}

const ACTIONS = [
  { value: "none", label: "Nothing" },
  { value: "open-popup", label: "Open a popup" },
  { value: "goto-screen", label: "Go to a screen" },
  { value: "send-mqtt", label: "Send an MQTT message" },
]

export function EnergyDiagramProperties({
  selectedObject,
  onUpdateObject,
  fonts,
  onManageFonts,
  topics,
  onManageTopics,
  combinedTopics,
  numberSeparators,
  onDeclareTopics,
  projectAssets,
  colorDepth,
  onOpenNodeIcon,
  allScreens,
}: EnergyDiagramPropertiesProps) {
  const p = selectedObject.properties
  const mode: string = p.mode === "sankey" ? "sankey" : "flow"
  const nodes: EnergyNode[] = Array.isArray(p.nodes) ? p.nodes : []
  const hasRest = nodes.some((n) => n.role === "rest")

  const update = (patch: Record<string, unknown>) => onUpdateObject(selectedObject.id, { properties: { ...p, ...patch } })
  const setNodes = (next: EnergyNode[]) => update({ nodes: next })
  const updateNode = (id: string, patch: Partial<EnergyNode>) => setNodes(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)))

  const addNode = (role: EnergyRole) => {
    if (role === "rest" && hasRest) return
    const taken = new Set(nodes.map((n) => n.id))
    let k = nodes.length
    while (taken.has(`n${k}`)) k++
    // Givers on the left, takers on the right, below the ones already there.
    const left = role === "source"
    const side = nodes.filter((n) => n.role !== "bus" && (n.x < selectedObject.width / 2) === left)
    const y = Math.min(selectedObject.height - 40, 40 + side.length * 90)
    const colour = NEW_COLOUR[role]
    setNodes([
      ...nodes,
      {
        id: `n${k}`,
        role,
        name: NEW_NAME[role],
        x: Math.round(selectedObject.width * (left ? 0.18 : 0.82)),
        y: Math.round(y),
        ...(colour ? { colorRole: colour } : {}),
        lines: [{ text: `${WATTS_PLACEHOLDER} W` }],
      },
    ])
  }

  const popups = (allScreens ?? []).filter((s) => isPopup(s as any))
  const screens = (allScreens ?? []).filter((s) => isMainScreen(s as any))
  const listed = listedNodes(nodes, mode)

  return (
    <PropertySections>
      <PropertySection title="Diagram">
        <SelectField id="energyMode" label="Mode" value={mode} options={MODES} onChange={(value) => update({ mode: value })} hint="The same nodes, as bands or as circles and lines." />
        <ToggleRow label="Motion" checked={p.motion !== false} onChange={(checked) => update({ motion: checked })} text="Dots and waves move" hint="Off: drawn still, on a device too." />
        {mode === "sankey" ? (
          <NumberField
            id="energyFullScale"
            label="Full scale"
            value={typeof p.fullScale === "number" ? p.fullScale : DEFAULT_FULL_SCALE}
            onChange={(value) => update({ fullScale: Math.max(1, Math.round(value)) })}
            unit="W"
            min={1}
            step={100}
            hint="The most that should still be told apart: from it on the bands fill the diagram."
          />
        ) : null}
        <FontField label="Font" value={p.fontId} fonts={fonts} onChange={(fontId) => update({ fontId })} onManageFonts={onManageFonts} hint="Names and the quieter lines." />
        <FontField label="Value font" value={p.valueFontId ?? p.fontId} fonts={fonts} onChange={(valueFontId) => update({ valueFontId })} onManageFonts={onManageFonts} hint="Each node's first line." />
      </PropertySection>

      <PropertySection title="Nodes" summary={listSummary(nodes.length, "node")}>
        {listed.map((node, index) => (
          <ListItem
            key={node.id}
            title={node.name || ROLE_LABELS[node.role]}
            summary={ROLE_LABELS[node.role]}
            onRemove={node.role === "bus" ? undefined : () => setNodes(nodes.filter((n) => n.id !== node.id))}
            {...(mode === "sankey" && node.role !== "bus" ? { index, onReorder: (from: number, to: number) => setNodes(reorderedNodes(nodes, from, to)) } : {})}
          >
            <NodeFields
              node={node}
              hasRest={hasRest}
              onChange={(patch) => updateNode(node.id, patch)}
              topics={topics}
              onManageTopics={onManageTopics}
              combinedTopics={combinedTopics}
              numberSeparators={numberSeparators}
              onDeclareTopics={onDeclareTopics}
              projectAssets={projectAssets}
              colorDepth={colorDepth}
              onOpenIcon={() => onOpenNodeIcon(node.id)}
              popups={popups}
              screens={screens}
            />
          </ListItem>
        ))}
        <SelectField
          id="energyAddNode"
          label="+ Add node"
          value=""
          placeholder="Choose a role..."
          options={(["source", "sink", "storage", "rest"] as const).filter((r) => r !== "rest" || !hasRest).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          onChange={(value) => addNode(value as EnergyRole)}
          hint="A diagram has one rest at most."
        />
      </PropertySection>
    </PropertySections>
  )
}

interface NodeFieldsProps {
  node: EnergyNode
  hasRest: boolean
  onChange: (patch: Partial<EnergyNode>) => void
  topics: Topic[]
  onManageTopics: () => void
  combinedTopics?: CombinedTopic[]
  numberSeparators?: Separators
  onDeclareTopics?: (topics: string[]) => void
  projectAssets: ProjectAsset[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIcon: () => void
  popups: Array<{ id: string; name: string }>
  screens: Array<{ id: string; name: string }>
}

function NodeFields({ node, hasRest, onChange, topics, onManageTopics, combinedTopics, numberSeparators, onDeclareTopics, projectAssets, colorDepth, onOpenIcon, popups, screens }: NodeFieldsProps) {
  const id = (field: string) => `energy-${node.id}-${field}`
  if (node.role === "bus") {
    return <TextField id={id("name")} label="Name" value={node.name} onChange={(name) => onChange({ name })} hint={ROLE_HINTS.bus} />
  }
  const lines: EnergyLine[] = node.lines ?? []
  const setLine = (i: number, line: EnergyLine | null) => {
    const next = [...lines]
    if (line) next[i] = line
    else next.splice(i, 1)
    onChange({ lines: next })
  }
  const action = node.action as HardwareButtonAction | undefined | null
  const setAction = (type: string) => {
    if (type === "none") onChange({ action: undefined })
    else if (type === "send-mqtt") onChange({ action: { type, mqttTopic: action?.mqttTopic ?? "", mqttMessage: action?.mqttMessage ?? "" } })
    else onChange({ action: { type, targetScreenId: action?.targetScreenId ?? "" } })
  }
  const roles = (["source", "sink", "storage", "rest"] as const).filter((r) => r !== "rest" || !hasRest || node.role === "rest")

  return (
    <>
      <TextField id={id("name")} label="Name" value={node.name} onChange={(name) => onChange({ name })} />
      <IconField label="Icon" assetId={node.iconAssetId} projectAssets={projectAssets} onSelect={onOpenIcon} onClear={() => onChange({ iconAssetId: undefined })} />
      <SelectField
        id={id("role")}
        label="Role"
        value={node.role}
        options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        onChange={(role) => onChange({ role: role as EnergyRole, ...(role === "rest" ? { topic: undefined, chargeTopic: undefined } : {}) })}
        hint={ROLE_HINTS[node.role]}
      />
      {node.role !== "rest" ? (
        <>
          <TopicField label="Reads" selectedTopicId={node.topic} topics={topics} onTopicChange={(topic) => onChange({ topic })} onManageTopics={onManageTopics} allowSubtopics hint="Its watts." />
          <ToggleRow label="Reverse sign" checked={node.reverseSign === true} onChange={(reverseSign) => onChange({ reverseSign })} text="The topic counts the other way" hint={node.role === "storage" ? "The diagram wants positive while charging." : undefined} />
        </>
      ) : null}
      {node.role === "storage" ? (
        <TopicField label="Charge" selectedTopicId={node.chargeTopic} topics={topics} onTopicChange={(chargeTopic) => onChange({ chargeTopic })} onManageTopics={onManageTopics} allowSubtopics hint="In %, for the ring round it." />
      ) : null}
      {node.role !== "storage" ? (
        <ColorField label="Colour" value={node.colorRole ?? "energyLoad"} onChange={(colorRole) => onChange({ colorRole })} colorDepth={colorDepth} />
      ) : null}
      {lines.map((line, i) => (
        <div key={i} className="space-y-1">
          <LiveTextEditor
            id={id(`line${i}`)}
            label={`Line ${i + 1}`}
            text={line.text}
            liveValues={(line.liveValues ?? []) as LiveValue[]}
            onChange={(text, liveValues) => setLine(i, { text, ...(liveValues ? { liveValues } : {}) })}
            onDeclareTopics={onDeclareTopics}
            topics={topics}
            combinedTopics={combinedTopics}
            numberSeparators={numberSeparators}
            resetKey={node.id}
            hint={i === 0 ? `${WATTS_PLACEHOLDER} is its watts.` : undefined}
          />
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setLine(i, null)} aria-label={`Remove line ${i + 1}`}>
            Remove line
          </button>
        </div>
      ))}
      {lines.length < MAX_NODE_LINES ? <AddListItem label="Add line" onClick={() => onChange({ lines: [...lines, { text: "" }] })} /> : null}
      <SelectField id={id("action")} label="Tap" value={action?.type ?? "none"} options={ACTIONS} onChange={setAction} />
      {action?.type === "open-popup" ? (
        <SelectField
          id={id("popup")}
          label="Popup"
          value={popups.some((s) => s.id === action.targetScreenId) ? action.targetScreenId : ""}
          placeholder="Select a popup..."
          options={popups.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(targetScreenId) => onChange({ action: { ...action, targetScreenId } })}
        />
      ) : null}
      {action?.type === "goto-screen" ? (
        <SelectField
          id={id("screen")}
          label="Screen"
          value={action.targetScreenId ?? ""}
          placeholder="Select screen..."
          options={screens.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(targetScreenId) => onChange({ action: { ...action, targetScreenId } })}
        />
      ) : null}
      {action?.type === "send-mqtt" ? (
        <>
          <TextField id={id("mqttTopic")} label="Topic" value={action.mqttTopic} onChange={(mqttTopic) => onChange({ action: { ...action, mqttTopic } })} />
          <TextField id={id("mqttMessage")} label="Message" value={action.mqttMessage} onChange={(mqttMessage) => onChange({ action: { ...action, mqttMessage } })} />
        </>
      ) : null}
    </>
  )
}
