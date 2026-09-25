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
// every value the installation has under schaltli/state/... retained
// (docs/device-contract.md §4), including a name where the source knows one -
// "schaltli/state/relay/3/name = Frischwasserpumpe". So the question the
// wizard asks is not "which topic" but "which relay", and the answer carries
// the label the van itself uses, which every block then writes on its own
// label object.

import type { ScreenObject, Topic } from "@/components/project-editor"
import type { ControlPalette } from "@/lib/control-palette"
import { LEVEL_DEFAULT_THICKNESS } from "@/lib/level-shape"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { SWITCH_MIN_HEIGHT, minKnobSwitchWidth } from "@/components/canvas/renderers/render-switch"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"

// Built from TOPIC_PREFIX rather than spelled out, so the rename of
// 2026-09-23 cannot leave these two behind - they are the half of the
// contract an outside Node-RED binds to, and the half that is retained.
export const STATE_PREFIX = `${TOPIC_PREFIX}/state/`
export const COMMAND_PREFIX = `${TOPIC_PREFIX}/cmnd/`

export interface BausteinInstance {
  /** The instance's number as the installation counts it: tank 1, relay 3. */
  key: string
  /** What the installation calls it, where it says so - else a fallback. */
  label: string
  /** The topic the built control binds to. */
  valueTopic: string
  /**
   * Where the installation publishes the instance's name, for a block that
   * has one - declared in the project beside the value (2026-09-25,
   * docs/2026-09-25-block-topics.md), so the Topics list is the whole of what
   * the block depends on.
   */
  nameTopic?: string
}

export interface BausteinFont {
  id: string
  size: number
  /** Carried so a block can measure text in the font it is about to write in. */
  internalName?: string
  name?: string
  format?: "bdf" | "ttf"
}

export interface BausteinBuildInput {
  instance: BausteinInstance
  rect: { x: number; y: number; width: number; height: number }
  palette: ControlPalette
  /** The project font a block writes in - see blockFont(). */
  font?: BausteinFont
}

/**
 * The font a block writes in: the project font closest to 5% of the screen's
 * shorter side (chosen 2026-09-16). A block is placed without anyone picking
 * a font, so the size has to follow the panel rather than the project's font
 * list - the same block reads the same on a 400x300 e-paper (15px) and on an
 * 800x480 panel (24px), and the first font in a list happened to be neither.
 *
 * Closest, not nearest-below: a project rarely carries a font at exactly that
 * size. A tie goes to the smaller one, which can only ever fit better.
 */
export const BLOCK_FONT_SHARE = 0.05

export function blockFont(
  fonts: BausteinFont[] | undefined,
  screenWidth: number,
  screenHeight: number,
): BausteinFont | undefined {
  if (!fonts || fonts.length === 0) return undefined
  const target = Math.min(screenWidth, screenHeight) * BLOCK_FONT_SHARE
  let best = fonts[0]
  for (const font of fonts) {
    const closer = Math.abs(font.size - target) < Math.abs(best.size - target)
    const tieButSmaller = Math.abs(font.size - target) === Math.abs(best.size - target) && font.size < best.size
    if (closer || tieButSmaller) best = font
  }
  return { id: best.id, size: best.size, internalName: best.internalName, name: best.name, format: best.format }
}

/**
 * How wide a piece of text will be in the font a block writes in.
 *
 * Measured rather than guessed, because a block that sizes a control by a
 * rule of thumb hands over something whose label is cut off - and the person
 * placing it never asked for a size at all.
 *
 * The same font string the canvas builds for a switch's label
 * (setBrowserFont in render-switch.ts). A pixel font is measured through the
 * browser's fallback at the same size: not the exact advance widths of the
 * bitmap, but a sans-serif at a given size is reliably no narrower than a
 * compact pixel font at it, and erring wide is the safe direction here.
 *
 * Outside a browser - a test importing this module, say - there is nothing
 * to measure with, so it falls back to a width per character that is wider
 * than any of the bundled fonts produce.
 */
export function measureBlockText(text: string, font?: BausteinFont): number {
  const size = font?.size ?? 14
  if (typeof document === "undefined") return Math.ceil(text.length * size * 0.7)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return Math.ceil(text.length * size * 0.7)
  const family = font?.format === "ttf" ? `"${font.internalName ?? font.name}"` : "sans-serif"
  ctx.font = `normal ${size}px ${family}`
  return Math.ceil(ctx.measureText(text).width)
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

/** The dragged rectangle, rounded - what a control that carries its own name gets. */
function whole(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(Math.abs(rect.width)),
    height: Math.round(Math.abs(rect.height)),
  }
}

/**
 * The label's share of a block's rectangle, and the control's beside it.
 *
 * The label gets whichever is wider: its share of what was drawn, or the
 * room its own text needs. A text object draws clipped to its box
 * (render-text-box.ts), so a share that comes out too small does not shrink
 * the writing - it cuts it off, and "Abwasserventil" becomes
 * "Abwasserventi". Reported from a real screen on 2026-09-21, from a block
 * dropped into a narrow rectangle.
 *
 * Growing past the rectangle is the right way to be wrong here: nobody
 * picked these widths - a block is dropped, not laid out - and a control
 * that is a little wider than the gesture is fixable by dragging, while a
 * name that is cut off looks broken.
 */
function split(
  rect: { x: number; y: number; width: number; height: number },
  labelText = "",
  font?: BausteinFont,
) {
  const width = Math.round(Math.abs(rect.width))
  const height = Math.round(Math.abs(rect.height))
  const share = Math.max(MIN_PART, Math.min(width - MIN_PART - GAP, Math.round(width * LABEL_SHARE)))
  const labelWidth = Math.max(share, measureBlockText(labelText, font))
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
    type: "text",
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
      // No background of its own, like every new label (user, 2026-09-25):
      // it stands on the screen's surface in whatever theme that is.
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
  }
}

// Examples are for designing, never for showing (decision 6 of
// docs/2026-09-15-live-data.md): the canvas needs something to draw while
// editing, the device and the live preview ignore them. The first one is
// what the editor draws, so it is a half-full tank and a relay that is on -
// a control that starts empty looks like one that is not working.
// What a van really reports, three each, the first being what the preview
// shows (2026-09-25, docs/2026-09-25-block-topics.md). Until then every tank
// and battery said 45/0/100: an empty or full tank is the least telling
// picture of one, and nobody's van sits at exactly 45.
const TANK_EXAMPLES = ["72", "35", "8"]
const BATTERY_EXAMPLES = ["87", "54", "12"]
const POWER_EXAMPLES = ["on", "off"]
// A dimmer's example is one of its own steps, so the editor draws the block
// with a step marked. An example between the steps - 43 - matches none of
// them and draws a switch that looks broken while it is only being designed.
const DIMMER_EXAMPLES = ["60", "25", "100"]

/**
 * The examples for one topic: a value the van reported first, if there was
 * one and it fits, then the defaults without repeating it, three at most.
 * Exported for the block spec, which checks it without a browser.
 */
export function examplesWith(reported: string | undefined, defaults: string[], fits: (value: string) => boolean = () => true): string[] {
  const first = reported !== undefined && reported.trim() !== "" && fits(reported) ? [reported] : []
  return [...first, ...defaults.filter((value) => !first.includes(value))].slice(0, 3)
}

// The name topic's one example is the name itself - found on the broker, or
// the fallback label when nothing answered.
function nameTopicEntry(instance: BausteinInstance): Omit<Topic, "id">[] {
  return instance.nameTopic ? [{ topic: instance.nameTopic, type: "text", examples: [instance.label] }] : []
}

const LINEAR_CALIBRATION = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

// One object, name included. Until 2026-09-19 a block laid down a label beside
// the bar and the two had to be kept in step by hand; the name belongs to the
// control now and is drawn on a line above it
// (docs/2026-09-19-slider-look.md, decision 9), so the bar simply gets the
// whole rectangle the author dragged.
function levelObject(
  type: "bar" | "slider",
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
  label?: string,
): Omit<ScreenObject, "id" | "zIndex"> {
  return {
    type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    properties: {
      topic,
      direction: "left-to-right",
      // The bridge publishes tank level and state of charge as percentages,
      // so the calibration is the identity - it is still written out,
      // because an object without calibration points falls back to a
      // different rule in every renderer.
      calibrationPoints: LINEAR_CALIBRATION,
      displayValue: "percentage",
      label,
      fillColor: palette.fill,
      thickness: LEVEL_DEFAULT_THICKNESS,
      textColor: palette.text,
      fontId: font?.id,
      fontSize: font?.size,
    },
  }
}

interface SwitchStateSpec {
  id: string
  label: string
  /** What the state topic reports for this state, and what a tap writes. */
  value: string
  /** Whether a switch showing this state is drawn in colour rather than quietly. */
  on?: boolean
}

function switchObject(
  topic: string,
  writeTopic: string,
  states: SwitchStateSpec[],
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  // A switch, not a button group: this block is called "Switch" and a relay
  // that is on or off is the thing everybody already knows from a phone
  // (docs/2026-09-20-switch-look.md's own reasoning for the form). It built a
  // button group until 2026-09-21.
  const height = Math.max(box.height, SWITCH_MIN_HEIGHT)
  const widestLabel = states.reduce((widest, state) => Math.max(widest, measureBlockText(state.label, font)), 0)
  return {
    type: "switch",
    x: box.x,
    y: box.y,
    // Wide enough for the track and the longest of the labels beside it,
    // measured in the font this object will be written in - a label that does
    // not fit is simply clipped, and nobody asked for a width here.
    width: Math.max(box.width, minKnobSwitchWidth(height, states.length, widestLabel)),
    height,
    properties: {
      topic,
      writeTopic,
      // readValue and writeValue are the same word on purpose: what a tap
      // writes is what the state topic then reports back, so the state that
      // was asked for is the one that lights up.
      states: states.map((state) => ({
        id: state.id,
        label: state.label,
        readValue: state.value,
        writeValue: state.value,
        // Which state counts as "on", and so whether the track takes the
        // colour or stays quiet (switchStateIsOn).
        showAsOn: state.on ?? false,
      })),
      switchStyle: "filled",
      switchColor: palette.fill,
      fontId: font?.id,
    },
  }
}

// The command topic is the state topic's counterpart, one level shorter:
// schaltli/state/relay/3/power is read, schaltli/cmnd/relay/3 is sent
// (docs/device-contract.md §4).
function commandTopic(group: string, key: string): string {
  return `${COMMAND_PREFIX}${group}/${key}`
}

export const TANK: BausteinDef = {
  id: "tank",
  label: "Tank",
  description: "A level indicator on a tank's level, with its name on it",
  requiredObjectTypes: ["bar"],
  group: "tank",
  keyed: true,
  valueLeaf: "level",
  nameLeaf: "name",
  // Pekaway's level API reports level1..level4; a system with fewer simply
  // publishes fewer, and the broker's answer is what is offered when there
  // is one.
  fallbackKeys: ["1", "2", "3", "4"],
  fallbackLabel: (key) => `Tank ${key}`,
  build: ({ instance, rect, palette, font }) => ({
    objects: [levelObject("bar", instance.valueTopic, whole(rect), palette, font, instance.label)],
    topics: [{ topic: instance.valueTopic, type: "numeric", examples: examplesWith(undefined, TANK_EXAMPLES) }, ...nameTopicEntry(instance)],
  }),
}

export const BATTERY: BausteinDef = {
  id: "battery",
  label: "Battery",
  description: "A level indicator on the battery's state of charge",
  requiredObjectTypes: ["bar"],
  group: "battery",
  // One battery, so its value has no number in it: schaltli/state/battery/soc.
  keyed: false,
  valueLeaf: "soc",
  fallbackKeys: ["soc"],
  fallbackLabel: () => "Battery",
  build: ({ instance, rect, palette, font }) => ({
    objects: [levelObject("bar", instance.valueTopic, whole(rect), palette, font, instance.label)],
    topics: [{ topic: instance.valueTopic, type: "numeric", examples: examplesWith(undefined, BATTERY_EXAMPLES) }],
  }),
}

export const SWITCH: BausteinDef = {
  id: "switch",
  label: "Switch",
  description: "A switch on a relay: reads its state, and switches it for real",
  requiredObjectTypes: ["text", "switch"],
  group: "relay",
  keyed: true,
  valueLeaf: "power",
  nameLeaf: "name",
  fallbackKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  fallbackLabel: (key) => `Relay ${key}`,
  build: ({ instance, rect, palette, font }) => {
    const parts = split(rect, instance.label, font)
    const writeTopic = commandTopic("relay", instance.key)
    return {
      objects: [
        labelObject(instance.label, parts.label, palette, font),
        switchObject(
          instance.valueTopic,
          writeTopic,
          [
            { id: "off", label: "Aus", value: "off" },
            { id: "on", label: "An", value: "on", on: true },
          ],
          parts.control,
          palette,
          font,
        ),
      ],
      topics: [
        { topic: instance.valueTopic, type: "text", examples: examplesWith(undefined, POWER_EXAMPLES) },
        // The command topic is registered too: it is what the Switch writes,
        // and a topic the project does not declare is one no device knows
        // about.
        { topic: writeTopic, type: "text", examples: examplesWith(undefined, POWER_EXAMPLES) },
        ...nameTopicEntry(instance),
      ],
    }
  },
}

// A dimmer is a brightness, so it gets a bar a finger sets rather than a row
// of steps (docs/2026-09-17-settable-level.md): a tap or a drag publishes the
// value at that point, the marker shows what was asked for, and the fill
// keeps showing what the installation reports - the two coincide once the
// command has landed.
//
// Five fixed steps was what this block shipped with on 2026-09-16, because
// nothing in the object set could set a free number yet. That is what the
// settable level was built for.
//
// A step of 5: fine enough to feel continuous, coarse enough that a finger
// does not report 37 and then 38 on its way. The command topic takes any
// number from 0 to 100.
const DIMMER_STEP = 5

export const DIMMER: BausteinDef = {
  id: "dimmer",
  label: "Dimmer",
  description: "A bar a finger sets, from off to full",
  requiredObjectTypes: ["slider"],
  group: "dimmer",
  keyed: true,
  valueLeaf: "level",
  nameLeaf: "name",
  fallbackKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  fallbackLabel: (key) => `Dimmer ${key}`,
  build: ({ instance, rect, palette, font }) => {
    const writeTopic = commandTopic("dimmer", instance.key)
    const level = levelObject("slider", instance.valueTopic, whole(rect), palette, font, instance.label)
    return {
      objects: [
        {
          ...level,
          properties: {
            ...level.properties,
            writeTopic,
            step: DIMMER_STEP,
            // Nothing here about the marker's colour or style any more. A
            // dimmer has one value on the broker and no second topic for
            // "asked for", so the device and the app remember the request
            // themselves (decision 6c) and draw it as the handle - which is
            // the fill's own colour, always, because handle and fill are one
            // object that the gap separates (2026-09-19, decision 3).
            //
            // The old `markerColor: palette.text` is gone with the marker it
            // named, and so is `markerStyle`: the shape follows from what the
            // object can do, not from a menu.
          },
        },
      ],
      topics: [
        { topic: instance.valueTopic, type: "numeric", examples: examplesWith(undefined, DIMMER_EXAMPLES) },
        { topic: writeTopic, type: "numeric", examples: examplesWith(undefined, DIMMER_EXAMPLES) },
        ...nameTopicEntry(instance),
      ],
    }
  },
}

export const BAUSTEINE: BausteinDef[] = [TANK, BATTERY, SWITCH, DIMMER]

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
      nameTopic: nameTopicOf(def, key),
    })
  }
  return instances.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
}

// A keyed block's name sits beside its value: relay/3/name next to
// relay/3/power. A single group (the battery) and a block without a name leaf
// have none.
function nameTopicOf(def: BausteinDef, key: string): string | undefined {
  return def.keyed && def.nameLeaf ? `${STATE_PREFIX}${def.group}/${key}/${def.nameLeaf}` : undefined
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
    nameTopic: nameTopicOf(def, key),
  }))
}
