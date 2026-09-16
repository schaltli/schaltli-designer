// Building blocks: a ready-made control, bound to a real value of the
// installation, placed in one go instead of drawn and wired by hand.
//
// A block is a recipe, not a template file: it says which object types it
// needs (so a device whose DDF does not declare them is not offered it),
// which state topics identify its instances, and how to turn a rectangle the
// user dragged plus one chosen instance into objects and the topics those
// objects bind to.
//
// Instances come from the broker, not from a list here: the bridge publishes
// every value the installation has under screenbee/state/... retained
// (docs/device-contract.md §4), including a name where the source knows one -
// "screenbee/state/relay/3/name = Frischwasserpumpe". So the question the
// wizard asks is not "which topic" but "which relay", and the answer carries
// the label the van itself uses, which every block then writes on its own
// label object.

import type { ScreenObject, Topic } from "@/components/project-editor"
import type { ControlPalette } from "@/lib/control-palette"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { SWITCH_MIN_HEIGHT, minSwitchWidth } from "@/components/canvas/renderers/render-switch"

export const STATE_PREFIX = "screenbee/state/"
export const COMMAND_PREFIX = "screenbee/cmnd/"

export interface BausteinInstance {
  /** The instance's number as the installation counts it: tank 1, relay 3. */
  key: string
  /** What the installation calls it, where it says so - else a fallback. */
  label: string
  /** The topic the built control binds to. */
  valueTopic: string
}

export interface BausteinFont {
  id: string
  size: number
}

export interface BausteinBuildInput {
  instance: BausteinInstance
  rect: { x: number; y: number; width: number; height: number }
  palette: ControlPalette
  /**
   * Two fonts, as the hand tools use: the project's first font reads as its
   * normal text and goes on the label, the smallest one goes inside a
   * control, where a value has to fit into a bar or a ring.
   */
  fonts: { label?: BausteinFont; control?: BausteinFont }
}

export interface BausteinBuildResult {
  objects: Omit<ScreenObject, "id" | "zIndex">[]
  /** Topics the objects bind to, to be registered if the project lacks them. */
  topics: Omit<Topic, "id">[]
}

export interface BausteinDef {
  id: string
  label: string
  description: string
  /** Object types the device must declare, or the block is not offered. */
  requiredObjectTypes: string[]
  /** State topics under this group identify the instances. */
  group: string
  /**
   * Keyed groups number their instances - relay/3/power, tank/1/level.
   * A single group has exactly one - battery/soc - and the wizard still asks,
   * so that what is about to be placed is visible before it is.
   */
  keyed: boolean
  /** The leaf carrying the value, and the one carrying a display name. */
  valueLeaf: string
  nameLeaf?: string
  /** What to offer when no broker answers - what the API can report. */
  fallbackKeys: string[]
  fallbackLabel: (key: string) => string
  build: (input: BausteinBuildInput) => BausteinBuildResult
}

// Every block is a label and one control beside it: the label says which tank
// or which relay this is, taken from the installation's own name for it, and
// the control is the part that moves. Splitting the dragged rectangle rather
// than growing beyond it keeps "what you dragged is what you get" true.
//
// 40% label, 60% control, with a gap - and floors, because a rectangle can be
// dragged narrower than either part can usefully be.
const LABEL_SHARE = 0.4
const GAP = 4
const MIN_PART = 24

function split(rect: { x: number; y: number; width: number; height: number }) {
  const width = Math.round(Math.abs(rect.width))
  const height = Math.round(Math.abs(rect.height))
  const labelWidth = Math.max(MIN_PART, Math.min(width - MIN_PART - GAP, Math.round(width * LABEL_SHARE)))
  const controlWidth = Math.max(MIN_PART, width - labelWidth - GAP)
  return {
    label: { x: Math.round(rect.x), y: Math.round(rect.y), width: labelWidth, height },
    control: { x: Math.round(rect.x) + labelWidth + GAP, y: Math.round(rect.y), width: controlWidth, height },
  }
}

// The label beside a block's control, vertically centred against it: a label
// draws in a box of its font's own height (render-text-box.ts), not in the
// height it is given, so centring is this function's job rather than the
// renderer's.
function labelObject(
  text: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  const fontSize = font?.size ?? 14
  const labelHeight = calculateTextObjectHeight(fontSize)
  return {
    type: "label",
    x: box.x,
    y: box.y + Math.max(0, Math.round((box.height - labelHeight) / 2)),
    width: box.width,
    height: labelHeight,
    properties: {
      text,
      fontId: font?.id,
      fontSize,
      color: palette.text,
      textAlign: "left",
      fontWeight: "normal",
      backgroundColor: palette.background,
      borderColor: "transparent",
    },
  }
}

// Examples are for designing, never for showing (decision 6 of
// docs/2026-09-15-live-data.md): the canvas needs something to draw while
// editing, the device and the live preview ignore them. The first one is
// what the editor draws, so it is a half-full tank and a relay that is on -
// a control that starts empty looks like one that is not working.
const PERCENT_EXAMPLES = ["45", "0", "100"]
const POWER_EXAMPLES = ["on", "off"]

const LINEAR_CALIBRATION = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

function levelObject(
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  return {
    type: "level-indicator",
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    properties: {
      topic,
      barDirection: "left-to-right",
      // The bridge publishes tank level and state of charge as percentages,
      // so the calibration is the identity - it is still written out,
      // because an object without calibration points falls back to a
      // different rule in every renderer.
      calibrationPoints: LINEAR_CALIBRATION,
      displayValue: "percentage",
      backgroundColor: palette.background,
      borderColor: palette.border,
      fillColor: palette.fill,
      textColor: palette.text,
      fontId: font?.id,
      fontSize: font?.size,
    },
  }
}

export const TANK: BausteinDef = {
  id: "tank",
  label: "Tank",
  description: "A level indicator on a tank's level, with its name beside it",
  requiredObjectTypes: ["label", "level-indicator"],
  group: "tank",
  keyed: true,
  valueLeaf: "level",
  nameLeaf: "name",
  // Pekaway's level API reports level1..level4; a system with fewer simply
  // publishes fewer, and the broker's answer is what is offered when there
  // is one.
  fallbackKeys: ["1", "2", "3", "4"],
  fallbackLabel: (key) => `Tank ${key}`,
  build: ({ instance, rect, palette, fonts }) => {
    const parts = split(rect)
    return {
      objects: [
        labelObject(instance.label, parts.label, palette, fonts.label),
        levelObject(instance.valueTopic, parts.control, palette, fonts.control),
      ],
      topics: [{ topic: instance.valueTopic, type: "numeric", examples: PERCENT_EXAMPLES }],
    }
  },
}

export const BATTERY: BausteinDef = {
  id: "battery",
  label: "Battery",
  description: "A level indicator on the battery's state of charge",
  requiredObjectTypes: ["label", "level-indicator"],
  group: "battery",
  // One battery, so its value has no number in it: screenbee/state/battery/soc.
  keyed: false,
  valueLeaf: "soc",
  fallbackKeys: ["soc"],
  fallbackLabel: () => "Battery",
  build: ({ instance, rect, palette, fonts }) => {
    const parts = split(rect)
    return {
      objects: [
        labelObject(instance.label, parts.label, palette, fonts.label),
        levelObject(instance.valueTopic, parts.control, palette, fonts.control),
      ],
      topics: [{ topic: instance.valueTopic, type: "numeric", examples: PERCENT_EXAMPLES }],
    }
  },
}

export const SWITCH: BausteinDef = {
  id: "switch",
  label: "Switch",
  description: "A switch on a relay: reads its state, and switches it for real",
  requiredObjectTypes: ["label", "Switch"],
  group: "relay",
  keyed: true,
  valueLeaf: "power",
  nameLeaf: "name",
  fallbackKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  fallbackLabel: (key) => `Relay ${key}`,
  build: ({ instance, rect, palette, fonts }) => {
    const parts = split(rect)
    // The command topic is the state topic's counterpart, one level shorter:
    // screenbee/state/relay/3/power is read, screenbee/cmnd/relay/3 is sent
    // (docs/device-contract.md §4). The payloads are the values the state
    // topic itself reports, so what a segment writes and what comes back
    // are the same word.
    const writeTopic = `${COMMAND_PREFIX}relay/${instance.key}`
    return {
      objects: [
        labelObject(instance.label, parts.label, palette, fonts.label),
        {
          type: "Switch",
          x: parts.control.x,
          y: parts.control.y,
          // The same floors a drawn Switch gets and a resize clamps to: a
          // block placed below them would be one the very next resize is
          // forbidden to make.
          width: Math.max(parts.control.width, minSwitchWidth(2)),
          height: Math.max(parts.control.height, SWITCH_MIN_HEIGHT),
          properties: {
            topic: instance.valueTopic,
            writeTopic,
            mode: "segmented",
            states: [
              { id: "off", label: "Off", readValue: "off", writeValue: "off" },
              { id: "on", label: "On", readValue: "on", writeValue: "on" },
            ],
            backgroundColor: palette.background,
            activeBackgroundColor: palette.accent,
            borderColor: palette.border,
            textColor: palette.text,
            fontId: fonts.label?.id,
          },
        },
      ],
      topics: [
        { topic: instance.valueTopic, type: "text", examples: POWER_EXAMPLES },
        // The command topic is registered too: it is what the Switch writes,
        // and a topic the project does not declare is one no device knows
        // about.
        { topic: writeTopic, type: "text", examples: POWER_EXAMPLES },
      ],
    }
  },
}

export const BAUSTEINE: BausteinDef[] = [TANK, BATTERY, SWITCH]

export function bausteinById(id: string): BausteinDef | undefined {
  return BAUSTEINE.find((b) => b.id === id)
}

// The instances a block has, read off a snapshot of retained state topics:
// every "<prefix><group>/<key>/<valueLeaf>" is one (or the single
// "<prefix><group>/<valueLeaf>" for a group that is not numbered), and the
// sibling name leaf, where there is one, is its label.
export function discoverInstances(def: BausteinDef, values: Record<string, string>): BausteinInstance[] {
  const prefix = `${STATE_PREFIX}${def.group}/`
  if (!def.keyed) {
    const topic = `${prefix}${def.valueLeaf}`
    return topic in values ? [{ key: def.valueLeaf, label: def.label, valueTopic: topic }] : []
  }

  const instances: BausteinInstance[] = []
  for (const topic of Object.keys(values)) {
    if (!topic.startsWith(prefix)) continue
    const rest = topic.slice(prefix.length).split("/")
    if (rest.length !== 2 || rest[1] !== def.valueLeaf) continue
    const key = rest[0]
    const name = def.nameLeaf ? values[`${prefix}${key}/${def.nameLeaf}`] : undefined
    instances.push({
      key,
      label: name && name.trim() !== "" ? name : def.fallbackLabel(key),
      valueTopic: topic,
    })
  }
  return instances.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
}

// What to offer when no broker answers: the same topics the bridge would
// publish, named generically. Placing one then still produces a screen that
// works the moment the van is running.
export function fallbackInstances(def: BausteinDef): BausteinInstance[] {
  if (!def.keyed) {
    return [{ key: def.valueLeaf, label: def.label, valueTopic: `${STATE_PREFIX}${def.group}/${def.valueLeaf}` }]
  }
  return def.fallbackKeys.map((key) => ({
    key,
    label: def.fallbackLabel(key),
    valueTopic: `${STATE_PREFIX}${def.group}/${key}/${def.valueLeaf}`,
  }))
}
