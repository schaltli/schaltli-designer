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

import type { ProjectAsset, ScreenObject, Topic } from "@/components/project-editor"
import type { ControlPalette } from "@/lib/control-palette"
import { LEVEL_DEFAULT_THICKNESS } from "@/lib/level-shape"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { SWITCH_MIN_HEIGHT, minKnobSwitchWidth, minSwitchWidth } from "@/components/canvas/renderers/render-switch"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"
import { groupOfPieces } from "@/lib/object-groups"
import { resolve } from "@/lib/placeholders"

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
  /**
   * What the broker reported for the value while the block was being placed.
   * It becomes the first example, so the preview shows the van as it is
   * (2026-09-25). Absent when nothing answered.
   */
  reportedValue?: string
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
  /** What the Insert dialog's second step chose; absent, the defaults. */
  options?: Partial<BausteinOptions>
}

/**
 * What the Insert dialog lets the user choose before a block is placed
 * (docs/2026-09-29-block-options.md). Every field has a default that places
 * the block as it was placed before the dialog had options.
 */
export interface BausteinOptions {
  /** The label's text: labelText() unless typed over, then what was typed. */
  label: string
  /** One of the block's looks, by id. */
  look: string
  labelPosition: LabelPosition
  /** What each state of a switch says, by state id: «Aus», «An». */
  stateLabels: Record<string, string>
  /** A dimmer's step; ignored by the other blocks. */
  step: number
}

/** Above the control, or beside it on its left. */
export type LabelPosition = "above" | "left"

/**
 * One way a block can look - a tank as a bar, a gauge or a number. The object
 * types are what the device must draw for it; a look it cannot draw is shown
 * greyed out in the dialog.
 */
export interface BausteinLook {
  id: string
  label: string
  objectTypes: string[]
}

/** Whether a device declaring `types` draws this look; no list, no limit. */
export function lookSupported(look: BausteinLook, types?: string[]): boolean {
  return types === undefined || look.objectTypes.every((type) => types.includes(type))
}

/**
 * Whether a block is offered at all: the device draws what every look needs
 * (the label) and at least one look. A device with a gauge and no bar still
 * gets its Tank, as a gauge.
 */
export function blockSupported(def: BausteinDef, types?: string[]): boolean {
  return (
    (types === undefined || def.requiredObjectTypes.every((type) => types.includes(type))) &&
    def.looks.some((look) => lookSupported(look, types))
  )
}

/**
 * What the dialog starts from: the placeholder label, the first look the
 * device draws, and the label where this block always had it.
 */
export function defaultOptions(def: BausteinDef, instance: BausteinInstance, types?: string[]): BausteinOptions {
  const look = def.looks.find((l) => lookSupported(l, types)) ?? def.looks[0]
  return {
    label: labelText(instance),
    look: look.id,
    labelPosition: def.defaultLabelPosition,
    stateLabels: Object.fromEntries((def.states ?? []).map((state) => [state.id, state.label])),
    step: def.defaultStep ?? 1,
  }
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
  /**
   * Icons the objects draw, added to the project if it lacks one with the
   * same id - so a block placed twice brings its icon once.
   */
  assets?: ProjectAsset[]
}

/**
 * What placing a block puts on the screen: its label and its control inside
 * one group (lib/object-groups.ts), so the two move together and the label
 * stays the control's - without the control owning a name again, which is
 * what a Bar and a Slider stopped doing on 2026-09-29. The group is the
 * designer's alone; a device gets the two objects.
 *
 * Kept apart from build(), which still answers with the pieces: what a block
 * is made of and how it is placed are two questions.
 */
export function placedObjects(built: BausteinBuildResult): Omit<ScreenObject, "id" | "zIndex">[] {
  return built.objects.length > 1 ? [groupOfPieces(built.objects)] : built.objects
}

export interface BausteinDef {
  id: string
  label: string
  description: string
  /**
   * Object types the device must declare whatever the look - the label's.
   * What each look needs on top is in `looks`.
   */
  requiredObjectTypes: string[]
  /** The ways it can look; the first is the default. */
  looks: BausteinLook[]
  defaultLabelPosition: LabelPosition
  /** A switch's states, with what they say unless the dialog says otherwise. */
  states?: { id: string; label: string }[]
  /** A level a finger sets moves in steps of this, unless the dialog says otherwise. */
  defaultStep?: number
  /** State topics under this group identify the instances. */
  group: string
  /**
   * Keyed groups number their instances - relay/3/power, tank/1/level.
   * A single group has exactly one - battery/soc - and the wizard still asks,
   * so that what is about to be placed is visible before it is.
   */
  keyed: boolean
  /**
   * The leaf carrying the value, and the one carrying a display name. Empty
   * for a single group whose value is the group topic itself -
   * schaltli/state/theme has nothing below it.
   */
  valueLeaf: string
  nameLeaf?: string
  /** What to offer when no broker answers - what the API can report. */
  fallbackKeys: string[]
  fallbackLabel: (key: string) => string
  /**
   * Only for a colour device (24 bit). A grey or 1-bit device has one variant
   * of each theme, so a block about light and dark does nothing there.
   */
  colourOnly?: boolean
  build: (input: BausteinBuildInput) => BausteinBuildResult
}

// Every block is a label and one control beside it (a bar: under it, see
// stacked()): the label says which tank
// or which relay this is, taken from the installation's own name for it, and
// the control is the part that moves. Splitting the dragged rectangle rather
// than growing beyond it keeps "what you dragged is what you get" true.
//
// 40% label, 60% control, with a gap - and floors, because a rectangle can be
// dragged narrower than either part can usefully be.
const LABEL_SHARE = 0.4
const GAP = 4
const MIN_PART = 24
// Between a label and the bar under it: the one empty row the bar's own header
// line kept between the name and the bar.
const STACK_GAP = 1

/**
 * The label above a block's bar, and the bar below it - where the bar's own
 * header line used to put the name (2026-09-19 to 2026-09-29). A Bar and a
 * Slider have no name of their own any more, so the name is a Text object
 * again, one line of the block's font tall, and the bar takes the rest of the
 * rectangle.
 *
 * The label is as wide as the rectangle or as its text, whichever is wider -
 * a cut-off name looks broken (see split()). The bar is never shorter than
 * MIN_PART, which on a rectangle dragged too flat can take the block past its
 * bottom edge: fixable by dragging, where a bar squashed to nothing is not.
 */
function stacked(
  rect: { x: number; y: number; width: number; height: number },
  labelText = "",
  font?: BausteinFont,
) {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const width = Math.round(Math.abs(rect.width))
  const height = Math.round(Math.abs(rect.height))
  const labelHeight = calculateTextObjectHeight(font?.size ?? 14)
  const barY = y + labelHeight + STACK_GAP
  return {
    label: { x, y, width: Math.max(width, measureBlockText(labelText, font)), height: labelHeight },
    control: { x, y: barY, width, height: Math.max(MIN_PART, y + height - barY) },
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

// The label's box and the control's, as the dialog asked: above is stacked(),
// beside is split().
function arrange(
  rect: { x: number; y: number; width: number; height: number },
  labelShown: string,
  font: BausteinFont | undefined,
  position: LabelPosition,
) {
  return position === "above" ? stacked(rect, labelShown, font) : split(rect, labelShown, font)
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
// The examples on the dimmer's own step: with a step of 10, 25 is no value it
// can be at (2026-09-29).
function dimmerExamples(step: number): string[] {
  const onStep = DIMMER_EXAMPLES.map((example) => asDimmerStep(example, step)!)
  return onStep.filter((example, i) => onStep.indexOf(example) === i)
}

/**
 * The examples for one topic: a value the van reported first, if there was
 * one and it fits, then the defaults without repeating it, three at most.
 * Exported for the block spec, which checks it without a browser.
 */
export function examplesWith(reported: string | undefined, defaults: string[], fits: (value: string) => boolean = () => true): string[] {
  const first = reported !== undefined && reported.trim() !== "" && fits(reported) ? [reported] : []
  return [...first, ...defaults.filter((value) => !first.includes(value))].slice(0, 3)
}

// Which reported values may lead the examples. A percentage is any finite
// number from 0 to 100; a relay reports on or off; a dimmer's value is moved
// onto its own step, for the same reason its defaults sit on steps.
function asPercent(value: string | undefined): string | undefined {
  const n = Number(value)
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? value.trim() : undefined
}
function asPower(value: string | undefined): string | undefined {
  return value === "on" || value === "off" ? value : undefined
}
function asDimmerStep(value: string | undefined, step: number): string | undefined {
  const percent = asPercent(value)
  return percent === undefined ? undefined : String(Math.min(100, Math.round(Number(percent) / step) * step))
}

/**
 * What a block's label says: the van's own name for the instance, live, with
 * the name found while placing behind `??` (2026-09-29,
 * docs/2026-09-29-block-options.md) - renaming a tank in the van renames it on
 * the screen. A block without a name topic (Battery, Theme) keeps its literal
 * label. The fallback is quoted text, which cannot hold a `"`, so one in a
 * name becomes a `'`.
 */
export function labelText(instance: BausteinInstance): string {
  if (!instance.nameTopic) return instance.label
  return `{topic:${instance.nameTopic} ?? "${instance.label.replace(/"/g, "'")}"}`
}

// The label a block writes, and what it shows before any value has arrived -
// the fallback behind `??`, or a typed literal as it is. The layout is sized
// for what shows, not for the placeholder's own length.
function blockLabel(instance: BausteinInstance, options?: Partial<BausteinOptions>) {
  const text = options?.label ?? labelText(instance)
  return { text, shown: resolve(text, () => undefined) }
}

// The look and the label's place the dialog chose, or the block's defaults.
function chosenLayout(def: Pick<BausteinDef, "looks" | "defaultLabelPosition">, options?: Partial<BausteinOptions>) {
  const look = def.looks.find((l) => l.id === options?.look) ?? def.looks[0]
  return { look: look.id, position: options?.labelPosition ?? def.defaultLabelPosition }
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

// The bar alone. Its name is a Text object above it (stacked()): from
// 2026-09-19 to 2026-09-29 the name was the bar's own, drawn on a header line,
// and Bar and Slider have no name any more.
function levelObject(
  type: "bar" | "slider",
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
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
      fillColor: palette.fill,
      thickness: LEVEL_DEFAULT_THICKNESS,
      textColor: palette.text,
      fontId: font?.id,
      fontSize: font?.size,
    },
  }
}

/**
 * A round level - a Gauge that shows, or a Dial a finger turns - square, as
 * the ring is inscribed in its box, and as large as the box allows. Its
 * shape is the editor's own default (project-editor.tsx, the gauge tool):
 * 270 degrees with the gap at the bottom.
 */
function arcObject(
  type: "gauge" | "dial",
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  const size = Math.max(MIN_PART, Math.min(box.width, box.height))
  return {
    type,
    x: box.x,
    y: box.y,
    width: size,
    height: size,
    properties: {
      topic,
      calibrationPoints: LINEAR_CALIBRATION,
      minAngle: 225,
      maxAngle: 135,
      direction: "cw",
      thickness: LEVEL_DEFAULT_THICKNESS,
      displayValue: "percentage",
      fillColor: palette.fill,
      textColor: palette.textOnFill,
      fontId: font?.id,
      fontSize: font?.size,
    },
  }
}

// The value as a number and nothing else: a text with a placeholder, whole
// percent (docs/2026-09-25-text-placeholders.md).
function numberObject(
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  const width = Math.max(box.width, measureBlockText("100 %", font))
  return labelObject(`{topic:${topic}:F0} %`, { ...box, width }, palette, font)
}

/**
 * The switch's other look: a row of buttons, the one lit that the state topic
 * reports - what the Switch block placed until 2026-09-21. Wide enough for
 * every label side by side.
 */
function buttonGroupObject(
  topic: string,
  writeTopic: string,
  states: SwitchStateSpec[],
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  const widestLabel = states.reduce((widest, state) => Math.max(widest, measureBlockText(state.label, font)), 0)
  return {
    type: "button-group",
    x: box.x,
    y: box.y,
    width: Math.max(box.width, minSwitchWidth(states.length), states.length * (widestLabel + 4 * GAP)),
    height: Math.max(box.height, SWITCH_MIN_HEIGHT),
    properties: {
      topic,
      writeTopic,
      states: states.map((state) => ({
        id: state.id,
        label: state.label,
        readValue: state.value,
        writeValue: state.value,
        ...(state.iconAssetId ? { iconAssetId: state.iconAssetId } : {}),
      })),
      switchStyle: "filled",
      switchColor: palette.fill,
      fontId: font?.id,
    },
  }
}

// Switch or buttons, the same states either way.
function toggleObject(
  look: string,
  topic: string,
  writeTopic: string,
  states: SwitchStateSpec[],
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  return look === "buttons"
    ? buttonGroupObject(topic, writeTopic, states, box, palette, font)
    : switchObject(topic, writeTopic, states, box, palette, font)
}

// A level that only shows: bar, gauge or number.
function readLevelObject(
  look: string,
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  if (look === "gauge") return arcObject("gauge", topic, box, palette, font)
  if (look === "number") return numberObject(topic, box, palette, font)
  return levelObject("bar", topic, box, palette, font)
}

// A build() cannot name its own def while that def is being defined, so
// the looks and default position it lays out from are named once here.
const READ_LEVEL_LOOKS: BausteinLook[] = [
  { id: "bar", label: "Bar", objectTypes: ["bar"] },
  { id: "gauge", label: "Gauge", objectTypes: ["gauge"] },
  { id: "number", label: "Number", objectTypes: [] },
]
const TOGGLE_LOOKS: BausteinLook[] = [
  { id: "switch", label: "Switch", objectTypes: ["switch"] },
  { id: "buttons", label: "Buttons", objectTypes: ["button-group"] },
]
const SET_LEVEL_LOOKS: BausteinLook[] = [
  { id: "slider", label: "Slider", objectTypes: ["slider"] },
  { id: "dial", label: "Dial", objectTypes: ["dial"] },
]

const READ_LEVEL_DEFAULTS = { looks: READ_LEVEL_LOOKS, defaultLabelPosition: "above" as LabelPosition }
const TOGGLE_DEFAULTS = { looks: TOGGLE_LOOKS, defaultLabelPosition: "left" as LabelPosition }
const SET_LEVEL_DEFAULTS = { looks: SET_LEVEL_LOOKS, defaultLabelPosition: "above" as LabelPosition }

// What a switch's states say unless the dialog says otherwise. German, as
// the handbook's vans are (2026-09-21).
const RELAY_STATES = [
  { id: "off", label: "Aus" },
  { id: "on", label: "An" },
]
const THEME_STATES = [
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
]

// A state's words: typed in the dialog, or the default. An emptied field
// falls back too - a state that says nothing cannot be told apart.
function stateLabel(states: { id: string; label: string }[], options: Partial<BausteinOptions> | undefined, id: string): string {
  const typed = options?.stateLabels?.[id]?.trim()
  return typed || states.find((state) => state.id === id)!.label
}

interface SwitchStateSpec {
  id: string
  label: string
  /** What the state topic reports for this state, and what a tap writes. */
  value: string
  /** Whether a switch showing this state is drawn in colour rather than quietly. */
  on?: boolean
  /** An icon on the knob - drawn only while the state is the on one. */
  iconAssetId?: string
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
        ...(state.iconAssetId ? { iconAssetId: state.iconAssetId } : {}),
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
  description: "A level indicator on a tank's level, with its name above it",
  requiredObjectTypes: ["text"],
  ...READ_LEVEL_DEFAULTS,
  group: "tank",
  keyed: true,
  valueLeaf: "level",
  nameLeaf: "name",
  // Pekaway's level API reports level1..level4; a system with fewer simply
  // publishes fewer, and the broker's answer is what is offered when there
  // is one.
  fallbackKeys: ["1", "2", "3", "4"],
  fallbackLabel: (key) => `Tank ${key}`,
  build: ({ instance, rect, palette, font, options }) => {
    const label = blockLabel(instance, options)
    const layout = chosenLayout(READ_LEVEL_DEFAULTS, options)
    const parts = arrange(rect, label.shown, font, layout.position)
    return {
      objects: [
        labelObject(label.text, parts.label, palette, font),
        readLevelObject(layout.look, instance.valueTopic, parts.control, palette, font),
      ],
      topics: [{ topic: instance.valueTopic, type: "numeric", examples: examplesWith(asPercent(instance.reportedValue), TANK_EXAMPLES) }, ...nameTopicEntry(instance)],
    }
  },
}

export const BATTERY: BausteinDef = {
  id: "battery",
  label: "Battery",
  description: "A level indicator on the battery's state of charge",
  requiredObjectTypes: ["text"],
  ...READ_LEVEL_DEFAULTS,
  group: "battery",
  // One battery, so its value has no number in it: schaltli/state/battery/soc.
  keyed: false,
  valueLeaf: "soc",
  fallbackKeys: ["soc"],
  fallbackLabel: () => "Battery",
  build: ({ instance, rect, palette, font, options }) => {
    const label = blockLabel(instance, options)
    const layout = chosenLayout(READ_LEVEL_DEFAULTS, options)
    const parts = arrange(rect, label.shown, font, layout.position)
    return {
      objects: [
        labelObject(label.text, parts.label, palette, font),
        readLevelObject(layout.look, instance.valueTopic, parts.control, palette, font),
      ],
      topics: [{ topic: instance.valueTopic, type: "numeric", examples: examplesWith(asPercent(instance.reportedValue), BATTERY_EXAMPLES) }],
    }
  },
}

export const SWITCH: BausteinDef = {
  id: "switch",
  label: "Switch",
  description: "A switch on a relay: reads its state, and switches it for real",
  requiredObjectTypes: ["text"],
  ...TOGGLE_DEFAULTS,
  states: RELAY_STATES,
  group: "relay",
  keyed: true,
  valueLeaf: "power",
  nameLeaf: "name",
  fallbackKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  fallbackLabel: (key) => `Relay ${key}`,
  build: ({ instance, rect, palette, font, options }) => {
    const label = blockLabel(instance, options)
    const layout = chosenLayout(TOGGLE_DEFAULTS, options)
    const parts = arrange(rect, label.shown, font, layout.position)
    const writeTopic = commandTopic("relay", instance.key)
    return {
      objects: [
        labelObject(label.text, parts.label, palette, font),
        toggleObject(
          layout.look,
          instance.valueTopic,
          writeTopic,
          [
            { id: "off", label: stateLabel(RELAY_STATES, options, "off"), value: "off" },
            { id: "on", label: stateLabel(RELAY_STATES, options, "on"), value: "on", on: true },
          ],
          parts.control,
          palette,
          font,
        ),
      ],
      topics: [
        { topic: instance.valueTopic, type: "text", examples: examplesWith(asPower(instance.reportedValue), POWER_EXAMPLES) },
        // The command topic is registered too: it is what the Switch writes,
        // and a topic the project does not declare is one no device knows
        // about.
        { topic: writeTopic, type: "text", examples: examplesWith(asPower(instance.reportedValue), POWER_EXAMPLES) },
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
  requiredObjectTypes: ["text"],
  ...SET_LEVEL_DEFAULTS,
  defaultStep: DIMMER_STEP,
  group: "dimmer",
  keyed: true,
  valueLeaf: "level",
  nameLeaf: "name",
  fallbackKeys: ["1", "2", "3", "4", "5", "6", "7", "8"],
  fallbackLabel: (key) => `Dimmer ${key}`,
  build: ({ instance, rect, palette, font, options }) => {
    const label = blockLabel(instance, options)
    const writeTopic = commandTopic("dimmer", instance.key)
    const layout = chosenLayout(SET_LEVEL_DEFAULTS, options)
    const step = options?.step && options.step > 0 ? options.step : DIMMER_STEP
    const parts = arrange(rect, label.shown, font, layout.position)
    const level =
      layout.look === "dial"
        ? arcObject("dial", instance.valueTopic, parts.control, palette, font)
        : levelObject("slider", instance.valueTopic, parts.control, palette, font)
    return {
      objects: [
        labelObject(label.text, parts.label, palette, font),
        {
          ...level,
          properties: {
            ...level.properties,
            writeTopic,
            step,
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
        { topic: instance.valueTopic, type: "numeric", examples: examplesWith(asDimmerStep(instance.reportedValue, step), dimmerExamples(step)) },
        { topic: writeTopic, type: "numeric", examples: examplesWith(asDimmerStep(instance.reportedValue, step), dimmerExamples(step)) },
        ...nameTopicEntry(instance),
      ],
    }
  },
}

// Light or dark for the whole installation (docs/2026-09-25-theme-topic.md):
// a switch that reads schaltli/state/theme and asks on schaltli/cmnd/theme.
// The bridge answers with the state; a device never writes it. Dark is the
// on state, so the knob carries the moon while the screens are dark - a knob
// switch draws its icon only when on (render-switch.ts), and a sun on the
// small knob would not be read anyway.
const THEME_EXAMPLES = ["light", "dark"]
const MOON_ASSET: ProjectAsset = {
  id: "baustein-theme-moon",
  name: "Moon",
  type: "icon",
  data:
    "data:image/svg+xml;base64," +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'),
}

function asTheme(value: string | undefined): string | undefined {
  return value === "light" || value === "dark" ? value : undefined
}

export const THEME: BausteinDef = {
  id: "theme",
  label: "Theme",
  description: "A switch between light and dark, for every screen at once",
  requiredObjectTypes: ["text"],
  ...TOGGLE_DEFAULTS,
  states: THEME_STATES,
  group: "theme",
  keyed: false,
  valueLeaf: "",
  fallbackKeys: ["theme"],
  fallbackLabel: () => "Theme",
  colourOnly: true,
  build: ({ instance, rect, palette, font, options }) => {
    const label = blockLabel(instance, options)
    const layout = chosenLayout(TOGGLE_DEFAULTS, options)
    const parts = arrange(rect, label.shown, font, layout.position)
    const writeTopic = `${COMMAND_PREFIX}theme`
    // The examples lead with what the broker holds; an installation that
    // never switched holds nothing and is light.
    const examples = examplesWith(asTheme(instance.reportedValue), THEME_EXAMPLES)
    return {
      objects: [
        labelObject(label.text, parts.label, palette, font),
        toggleObject(
          layout.look,
          instance.valueTopic,
          writeTopic,
          [
            { id: "light", label: stateLabel(THEME_STATES, options, "light"), value: "light" },
            { id: "dark", label: stateLabel(THEME_STATES, options, "dark"), value: "dark", on: true, iconAssetId: MOON_ASSET.id },
          ],
          parts.control,
          palette,
          font,
        ),
      ],
      topics: [
        { topic: instance.valueTopic, type: "text", examples },
        { topic: writeTopic, type: "text", examples },
      ],
      assets: [MOON_ASSET],
    }
  },
}

export const BAUSTEINE: BausteinDef[] = [TANK, BATTERY, SWITCH, DIMMER, THEME]

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
    const topic = singleTopic(def)
    return topic in values ? [{ key: def.valueLeaf || def.group, label: def.label, valueTopic: topic, reportedValue: values[topic] }] : []
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
      reportedValue: values[topic],
    })
  }
  return instances.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
}

// A single group's one topic: battery/soc under its group, or the group topic
// itself where there is no leaf (theme).
function singleTopic(def: BausteinDef): string {
  return def.valueLeaf ? `${STATE_PREFIX}${def.group}/${def.valueLeaf}` : `${STATE_PREFIX}${def.group}`
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
    return [{ key: def.valueLeaf || def.group, label: def.label, valueTopic: singleTopic(def) }]
  }
  return def.fallbackKeys.map((key) => ({
    key,
    label: def.fallbackLabel(key),
    valueTopic: `${STATE_PREFIX}${def.group}/${key}/${def.valueLeaf}`,
    nameTopic: nameTopicOf(def, key),
  }))
}
