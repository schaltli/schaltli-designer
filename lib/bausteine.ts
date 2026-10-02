// Building blocks: a ready-made control, bound to a real value, placed in one
// go instead of drawn and wired by hand.
//
// What a block can be comes from the broker, not from a list here: the
// devices on it announce themselves in Home Assistant's discovery format,
// and each entity they announce is a catalog entry (lib/ha-discovery.ts,
// docs/2026-09-30-block-discovery.md). This file turns one entry, a look
// and the rectangle the user dragged into objects and the topics they bind
// to. It knows nothing of what the entity is in the world - a fill level
// and a pump are a value and a switch like any other. The five built-in
// blocks it held until 2026-10-01, one per kind of thing in the van, went
// with that.

import type { ProjectAsset, ScreenObject, Topic } from "@/components/project-editor"
import type { ControlPalette } from "@/lib/control-palette"
import { LEVEL_DEFAULT_THICKNESS } from "@/lib/level-shape"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { SWITCH_MIN_HEIGHT, minKnobSwitchWidth, minSwitchWidth } from "@/components/canvas/renderers/render-switch"
import { groupOfPieces } from "@/lib/object-groups"
import { SPACER_TYPE } from "@/lib/layout"
import { splitTopicPath } from "@/lib/json-path"
import type { CatalogControl, CatalogEntry } from "@/lib/ha-discovery"

export interface BausteinFont {
  id: string
  size: number
  /** Carried so a block can measure text in the font it is about to write in. */
  internalName?: string
  name?: string
  format?: "bdf" | "ttf"
}

/**
 * What the Insert dialog lets the user choose before a block is placed
 * (docs/2026-09-29-block-options.md). Every field has a default.
 */
export interface BausteinOptions {
  /** The label's text: the entry's name unless given otherwise. */
  label: string
  /** One of the block's looks, by id. */
  look: string
  /** The icon before the label, or none. */
  icon: BlockIcon | null
  /**
   * Of an entry with several controls - light, fan, climate - the ones
   * ticked, by their index in the entry, each in its own look; in the
   * entry's order. Absent: the first control alone, in `look`.
   */
  parts?: { control: number; look: string }[]
}

/**
 * An icon for a block: found by name in the dialog, or picked there. With an
 * `assetId` it is one the project already has; without, the block brings it
 * as an asset of its own, named after the icon so that placing it twice
 * brings it once (as Theme's moon).
 */
export interface BlockIcon {
  name: string
  data: string
  size: number
  assetId?: string
}

export function blockIconAssetId(name: string): string {
  return `baustein-icon-${name.replace(/[^a-z0-9]+/gi, "-")}`
}

/**
 * Where a block's label sits: above its control, or beside it on its left.
 * Each block has its own; the dialog does not offer it (taken out
 * 2026-09-30 - the size scale, docs/2026-09-30-size-scale.md, is to lay
 * blocks out consistently, not a choice per placement).
 */
type LabelPosition = "above" | "left"

/**
 * One way a block can look - a fill level as a bar, a gauge or a number. The object
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
  /**
   * How many of `objects`, from the first, are the entry's name: its text,
   * and the icon before it when one was chosen. The rest are its controls,
   * one per part. Set by buildEntry().
   */
  labelCount?: number
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

// Every block is a label and one control beside it (a bar: under it, see
// stacked()): the label says which thing this is, by the name its device
// announces, and the control is the part that moves. Splitting the dragged rectangle rather
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
  lead = 0,
) {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const width = Math.round(Math.abs(rect.width))
  const height = Math.round(Math.abs(rect.height))
  const labelHeight = calculateTextObjectHeight(font?.size ?? 14)
  const barY = y + labelHeight + STACK_GAP
  return {
    label: { x, y, width: Math.max(width, lead + measureBlockText(labelText, font)), height: labelHeight },
    control: { x, y: barY, width, height: Math.max(MIN_PART, y + height - barY) },
  }
}

/**
 * The label's share of a block's rectangle, and the control's beside it.
 *
 * The label gets whichever is wider: its share of what was drawn, or the
 * room its own text needs. A text object draws clipped to its box
 * (render-text-box.ts), so a share that comes out too small does not shrink
 * the writing - it cuts it off, and a long name loses its last letter.
 * Reported from a real screen on 2026-09-21, from a block dropped into a
 * narrow rectangle.
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
  lead = 0,
) {
  const width = Math.round(Math.abs(rect.width))
  const height = Math.round(Math.abs(rect.height))
  const share = Math.max(MIN_PART, Math.min(width - MIN_PART - GAP, Math.round(width * LABEL_SHARE)))
  const labelWidth = Math.max(share, lead + measureBlockText(labelText, font))
  const controlWidth = Math.max(MIN_PART, width - labelWidth - GAP)
  return {
    label: { x: Math.round(rect.x), y: Math.round(rect.y), width: labelWidth, height },
    control: { x: Math.round(rect.x) + labelWidth + GAP, y: Math.round(rect.y), width: controlWidth, height },
  }
}

// The label's box and the control's, as the dialog asked: above is stacked(),
// beside is split(). An icon before the label takes room in the label's box.
function arrange(
  rect: { x: number; y: number; width: number; height: number },
  labelShown: string,
  font: BausteinFont | undefined,
  position: LabelPosition,
  options?: Partial<BausteinOptions>,
) {
  const lead = options?.icon ? iconSize(font) + GAP : 0
  return position === "above" ? stacked(rect, labelShown, font, lead) : split(rect, labelShown, font, lead)
}

// An icon before a label is as tall as the label's line.
function iconSize(font?: BausteinFont): number {
  return calculateTextObjectHeight(font?.size ?? 14)
}

/**
 * The label, and the icon before it when the dialog chose one: the icon at
 * the start of the label's box, the text after it. In the label's colour, so
 * it follows the theme as the text does.
 */
function labelPieces(
  text: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font: BausteinFont | undefined,
  options?: Partial<BausteinOptions>,
): Omit<ScreenObject, "id" | "zIndex">[] {
  const icon = options?.icon
  if (!icon) return [labelObject(text, box, palette, font)]
  const size = iconSize(font)
  const lead = size + GAP
  return [
    {
      type: "icon",
      x: box.x,
      y: box.y + Math.max(0, Math.round((box.height - size) / 2)),
      width: size,
      height: size,
      properties: {
        assetId: icon.assetId ?? blockIconAssetId(icon.name),
        iconName: "default",
        iconColor: palette.text,
        backgroundColor: "transparent",
      },
    },
    labelObject(text, { ...box, x: box.x + lead, width: Math.max(MIN_PART, box.width - lead) }, palette, font),
  ]
}

// The icon's asset, when the block brings it: none when the project had it.
function iconAssets(options?: Partial<BausteinOptions>): ProjectAsset[] {
  const icon = options?.icon
  if (!icon || icon.assetId) return []
  return [{ id: blockIconAssetId(icon.name), type: "icon", name: icon.name, data: icon.data, size: icon.size }]
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
      // A fill is a percentage (catalogLooks offers a bar or a gauge for
      // nothing else), so the calibration is the identity - it is still written out,
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
        writeValue: state.writeValue ?? state.value,
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

// A level that only shows: a bar or a gauge.
function readLevelObject(
  look: string,
  topic: string,
  box: { x: number; y: number; width: number; height: number },
  palette: ControlPalette,
  font?: BausteinFont,
): Omit<ScreenObject, "id" | "zIndex"> {
  if (look === "gauge") return arcObject("gauge", topic, box, palette, font)
  return levelObject("bar", topic, box, palette, font)
}

// The looks a value, a switch and a settable level can take (catalogLooks).
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

interface SwitchStateSpec {
  id: string
  label: string
  /** What the state topic reports for this state, and what a tap writes. */
  value: string
  /**
   * What a tap writes, where it is not what the state topic reports - a
   * discovered switch may read "True" and write "ON". Absent: `value`.
   */
  writeValue?: string
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
  // A switch, not a button group: something that is on or off is the
  // thing everybody already knows from a phone
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
        writeValue: state.writeValue ?? state.value,
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

// --- Blocks from the catalog (block plan Task 6a) ----------------------------
//
// A catalog entry (lib/ha-discovery.ts) placed as a block: the entry's name as
// fixed text, an icon if one was chosen, and one control in the look chosen
// for it. Nothing here knows what the entity is in the world - a fill level
// and a pump are a value and a switch like any other.

/** The looks a catalog control can take; the first is the default. */
export function catalogLooks(control: CatalogControl): BausteinLook[] {
  switch (control.kind) {
    case "switch":
      // Always buttons, one per state: what a switch's words say is right
      // there to tap, and a choice between a toggle and buttons was one more
      // question nobody needed (decided 2026-10-01).
      return [TOGGLE_LOOKS[1]]
    case "level":
      return SET_LEVEL_LOOKS
    case "value":
      // A bar or a gauge only where the value is a fill - a percentage, a
      // battery by its device class; anything else has no range to fill.
      return control.level ? READ_LEVEL_LOOKS : [{ id: "number", label: "Number", objectTypes: [] }]
    case "choice":
      return [{ id: "buttons", label: "Buttons", objectTypes: ["button-group"] }]
    case "state":
      return [{ id: "text", label: "Text", objectTypes: [] }]
    case "button":
      return [{ id: "button", label: "Button", objectTypes: ["button"] }]
  }
}

// Where the name sits for each look: above what reads across, beside what
// switches.
function catalogLabelPosition(look: string): LabelPosition {
  return look === "bar" || look === "gauge" || look === "slider" || look === "dial" ? "above" : "left"
}

export interface CatalogBuildInput {
  entry: CatalogEntry
  control: CatalogControl
  rect: { x: number; y: number; width: number; height: number }
  palette: ControlPalette
  font?: BausteinFont
  /** The look and the icon the dialog chose, and the label if typed over. */
  options?: Partial<BausteinOptions>
  /**
   * What the broker holds on the topics the control binds to, by topic, as
   * the raw payload: the first example of each, so the editor draws the
   * thing as it is.
   */
  reported?: Record<string, string>
  /**
   * The control alone, in the whole rectangle, without the name beside or
   * above it: a part's row in an entry with several, where a switch's words,
   * a choice's buttons and a slider's value say what it is.
   */
  bare?: boolean
}

// Words that say on and off: shown as «An» and «Aus» (the spec's default);
// any other pair - "forward" and "reverse" - stays the entity's own.
const ON_WORDS = new Set(["on", "true", "1", "yes", "open"])
const OFF_WORDS = new Set(["off", "false", "0", "no", "closed"])

function stateWords(on: string, off: string): { on: string; off: string } {
  return ON_WORDS.has(on.toLowerCase()) && OFF_WORDS.has(off.toLowerCase()) ? { on: "An", off: "Aus" } : { on, off }
}

/** A payload with `value` at `path` (lib/json-path.ts spelling), for an example. */
function payloadWith(path: string, value: string): string {
  const keys: (string | number)[] = []
  const re = /\[(\d+)\]|\['([^']*)'\]|\["([^"]*)"\]|\.?([^.[\]]+)/g
  for (let m = re.exec(path); m; m = re.exec(path)) keys.push(m[1] !== undefined ? Number(m[1]) : (m[2] ?? m[3] ?? m[4]))
  const leaf: unknown = Number.isFinite(Number(value)) && value.trim() !== "" ? Number(value) : value
  let node: unknown = leaf
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i]
    if (typeof key === "number") {
      const list: unknown[] = []
      list[key] = node
      node = list
    } else node = { [key]: node }
  }
  return JSON.stringify(node)
}

/**
 * The topic a binding reads from, declared as the project needs it: plain,
 * or a JSON topic with the path as its subtopic. Its example is what the
 * broker reported, else `sample` - a value the control can show.
 */
function readTopicEntry(
  binding: string,
  type: "numeric" | "text",
  sample: string,
  reported?: Record<string, string>,
): Omit<Topic, "id"> {
  const { topic, path } = splitTopicPath(binding)
  const heard = reported?.[topic]
  if (!path) return { topic, type, examples: [heard ?? sample] }
  return {
    topic,
    type: "json",
    examples: [heard ?? payloadWith(path, sample)],
    subtopics: [{ id: `sub-${path}`, path, type }],
  }
}

/**
 * The block for one control of a catalog entry (block plan Task 6a): the
 * objects, in the dragged rectangle, and the topics they read and write.
 */
export function buildFromCatalog({ entry, control, rect, palette, font, options, reported, bare }: CatalogBuildInput): BausteinBuildResult {
  const looks = catalogLooks(control)
  const look = (looks.find((l) => l.id === options?.look) ?? looks[0]).id
  const labelText = options?.label ?? entry.label
  const whole = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(Math.abs(rect.width)), height: Math.round(Math.abs(rect.height)) }
  const parts = bare ? { label: whole, control: whole } : arrange(rect, labelText, font, catalogLabelPosition(look), options)
  const label = () => (bare ? [] : labelPieces(labelText, parts.label, palette, font, options))
  const assets = iconAssets(options)

  switch (control.kind) {
    case "switch": {
      const words = stateWords(control.on.read, control.off.read)
      const states: SwitchStateSpec[] = [
        { id: "off", label: words.off, value: control.off.read, writeValue: control.off.write },
        { id: "on", label: words.on, value: control.on.read, writeValue: control.on.write, on: true },
      ]
      return {
        objects: [...label(), toggleObject(look, control.read ?? "", control.write, states, parts.control, palette, font)],
        topics: [
          ...(control.read ? [readTopicEntry(control.read, "text", control.on.read, reported)] : []),
          { topic: control.write, type: "text", examples: [control.on.write, control.off.write] },
        ],
        assets,
      }
    }
    case "state": {
      // The reported word as it is, in a text beside the name.
      const words = stateWords(control.on, control.off)
      const text = labelObject(`{topic:${control.read}}`, { ...parts.control, width: Math.max(parts.control.width, measureBlockText(words.on, font)) }, palette, font)
      return { objects: [...label(), text], topics: [readTopicEntry(control.read, "text", control.on, reported)], assets }
    }
    case "value": {
      const read = control.read
      let object: Omit<ScreenObject, "id" | "zIndex">
      if (look === "number") {
        const unit = control.unit ? ` ${control.unit}` : ""
        object = labelObject(`{topic:${read}}${unit}`, { ...parts.control, width: Math.max(parts.control.width, measureBlockText(`100.0${unit}`, font)) }, palette, font)
      } else object = readLevelObject(look, read, parts.control, palette, font)
      return { objects: [...label(), object], topics: [readTopicEntry(read, "numeric", "60", reported)], assets }
    }
    case "level": {
      const base = look === "dial" ? arcObject("dial", control.read ?? "", parts.control, palette, font) : levelObject("slider", control.read ?? "", parts.control, palette, font)
      // The middle of the range on a step, written with the step's own
      // decimals - -9 + 90 * 0.1 is not 0 in floating point.
      const decimals = (String(control.step).split(".")[1] ?? "").length
      const middle = Number((control.min + Math.round((control.max - control.min) / 2 / control.step) * control.step).toFixed(decimals))
      const object = {
        ...base,
        properties: {
          ...base.properties,
          writeTopic: control.write,
          step: control.step,
          // The entity's own range, end to end.
          calibrationPoints: [
            { value: control.min, barSizePercent: 0 },
            { value: control.max, barSizePercent: 100 },
          ],
          displayValue: "value",
        },
      }
      return {
        objects: [...label(), object],
        topics: [
          ...(control.read ? [readTopicEntry(control.read, "numeric", String(middle), reported)] : []),
          { topic: control.write, type: "numeric", examples: [String(middle)] },
        ],
        assets,
      }
    }
    case "choice": {
      const states: SwitchStateSpec[] = control.options.map((option, i) => ({ id: `option-${i}`, label: option, value: option }))
      return {
        objects: [...label(), buttonGroupObject(control.read ?? "", control.write, states, parts.control, palette, font)],
        topics: [
          ...(control.read ? [readTopicEntry(control.read, "text", control.options[0], reported)] : []),
          { topic: control.write, type: "text", examples: control.options.slice(0, 3) },
        ],
        assets,
      }
    }
    case "button": {
      // A button names itself: the entry's name is its text, with no label beside it.
      const box = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(Math.abs(rect.width)), height: Math.round(Math.abs(rect.height)) }
      return {
        objects: [
          {
            type: "button",
            ...box,
            width: Math.max(box.width, measureBlockText(labelText, font) + 4 * GAP),
            height: Math.max(box.height, SWITCH_MIN_HEIGHT),
            properties: {
              text: labelText,
              iconAssetId: options?.icon ? (options.icon.assetId ?? blockIconAssetId(options.icon.name)) : null,
              buttonStyle: "tonal",
              buttonColor: palette.fill,
              fontId: font?.id,
              action: { type: "send-mqtt", mqttTopic: control.write, mqttMessage: control.payload },
            },
          },
        ],
        topics: [{ topic: control.write, type: "text", examples: [control.payload] }],
        assets,
      }
    }
  }
}

/**
 * The block for a catalog entry as the dialog set it up (block plan Task 7):
 * one control placed as buildFromCatalog() places it, or - several parts of
 * a light, a fan, a climate ticked - the icon and the entry's name on a line
 * of their own, and under it one row per part, the rows sharing what is left
 * of the rectangle in the entry's order. A row is its control alone: «An»
 * and «Aus», «manual» and «auto», a value say what they are, and a label per
 * row («Power», «Preset») only repeated it (decided 2026-10-01).
 */
export function buildEntry(input: Omit<CatalogBuildInput, "control">): BausteinBuildResult {
  const { entry, rect, palette, font, options, reported } = input
  const parts = (options?.parts ?? [{ control: 0, look: options?.look ?? "" }]).filter((p) => entry.controls[p.control])
  // The name: its text, and the icon before it (labelPieces).
  const labelCount = options?.icon ? 2 : 1
  if (parts.length <= 1) {
    const part = parts[0] ?? { control: 0, look: options?.look ?? "" }
    return {
      ...buildFromCatalog({ ...input, control: entry.controls[part.control], options: { ...options, look: part.look } }),
      labelCount,
    }
  }

  const labelText = options?.label ?? entry.label
  const header = stacked(rect, labelText, font, options?.icon ? iconSize(font) + GAP : 0)
  const rows = header.control
  const rowHeight = Math.max(MIN_PART, Math.floor((rows.height - GAP * (parts.length - 1)) / parts.length))
  const built = parts.map((part, i) => {
    const control = entry.controls[part.control]
    return buildFromCatalog({
      entry,
      control,
      rect: { x: rows.x, y: rows.y + i * (rowHeight + GAP), width: rows.width, height: rowHeight },
      palette,
      font,
      options: { label: control.part ?? entry.label, look: part.look, icon: null },
      reported,
      bare: true,
    })
  })
  // A topic two parts share - a light's JSON state, its power and its
  // brightness read from different fields - is declared once, with the
  // fields of both.
  const topics: BausteinBuildResult["topics"] = []
  for (const topic of built.flatMap((b) => b.topics)) {
    const i = topics.findIndex((t) => t.topic === topic.topic)
    if (i < 0) topics.push(topic)
    else if (topics[i].subtopics || topic.subtopics) {
      const subtopics = [...(topics[i].subtopics ?? [])]
      for (const sub of topic.subtopics ?? []) if (!subtopics.some((x) => x.path === sub.path)) subtopics.push(sub)
      topics[i] = { ...topics[i], subtopics }
    }
  }
  return {
    objects: [...labelPieces(labelText, header.label, palette, font, options), ...built.flatMap((b) => b.objects)],
    topics,
    assets: iconAssets(options),
    labelCount,
  }
}

/**
 * What placing a block into a stack, a row or a grid puts there
 * (docs/2026-10-02-layout.md, layout plan Task 10): one group, as
 * placedObjects() gives, but made of cells - its name in one (an icon and
 * its text side by side, in a row of their own), then its control; an entry
 * with several parts gives each further part a cell of its own with a
 * spacer before it. In a «Name and control» grid the name falls into the
 * first column and every control into the second, row by row; the
 * container sizes them all. The cells' order is their stacking order, which
 * is the order a grid reads a group's pieces in (lib/layout.ts).
 */
export function placedInContainer(built: BausteinBuildResult): Omit<ScreenObject, "id" | "zIndex">[] {
  const count = built.labelCount ?? 0
  const name = built.objects.slice(0, count)
  const controls = built.objects.slice(count)
  if (controls.length === 0) return placedObjects(built)
  const nameCell: Omit<ScreenObject, "id" | "zIndex"> | undefined =
    name.length > 1
      ? (() => {
          const box = groupOfPieces(name)
          return { ...box, type: "horizontal-stack", properties: { align: "centre" } }
        })()
      : name[0]
  const spacer = (at: { x: number; y: number }): Omit<ScreenObject, "id" | "zIndex"> => ({
    type: SPACER_TYPE,
    x: at.x,
    y: at.y,
    width: 1,
    height: 1,
    properties: {},
  })
  const cells = controls.flatMap((control, i) => [i === 0 && nameCell ? nameCell : spacer(control), control])
  return [groupOfPieces(cells)]
}

/**
 * A block as a small table (docs/2026-10-02-layout-tables.md, tables Task
 * 8): its name in the first column - an icon and the name, if it has one,
 * as a table of their own in that cell - and its control in the second;
 * each further part in a row below, in the control's column. On `free` it
 * is placed as it is; dropped on a table's row line its rows are merged
 * into that table (lib/table.ts mergedRows); into a cell, nested there.
 */
export function blockTable(built: BausteinBuildResult): Omit<ScreenObject, "id" | "zIndex"> {
  const count = built.labelCount ?? 0
  const name = built.objects.slice(0, count)
  const controls = built.objects.slice(count)
  const inCell = <T extends { properties?: Record<string, any> }>(o: T, row: number, column: number): T => ({
    ...o,
    properties: { ...o.properties, cell: { row, column } },
  })
  const nameCell =
    name.length > 1
      ? (() => {
          const box = groupOfPieces(name)
          return {
            ...box,
            type: "table",
            properties: { columns: [{ width: "auto" }, { width: "auto" }], rows: 1 },
            children: (box.children ?? []).map((piece, column) => inCell(piece, 0, column)),
          } as Omit<ScreenObject, "id" | "zIndex">
        })()
      : name[0]
  const cells = [...(nameCell ? [inCell(nameCell, 0, 0)] : []), ...controls.map((control, row) => inCell(control, row, 1))]
  const box = groupOfPieces(cells)
  return {
    ...box,
    type: "table",
    properties: { columns: [{ width: "auto" }, { width: { share: 100 } }], rows: Math.max(1, controls.length) },
  }
}
