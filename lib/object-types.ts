/**
 * The sixteen object types a device draws, the designer's own group, and
 * the way back from the names they had until 2026-09-20
 * (docs/2026-09-20-control-split.md).
 *
 * One type is one component. What used to be one object with two faces -
 * a Level Indicator that a finger could or could not set, a Switch that was
 * a knob or a group - is two types, and the device's `supportedObjectTypes`
 * can say which of the two it draws. That is how an e-paper display, which
 * has no touch, declares `bar` and `gauge` and nothing from `OPERATE_TYPES`,
 * and how the toolbar knows not to offer it a slider.
 *
 * The names are kebab-case throughout, which the three youngest types
 * already were; `MqttDataField` and `MQTTIconField` disagreed even with each
 * other about how to spell MQTT, and no reader anywhere cares - the firmware
 * keeps the type as a plain string (ProjectTypes.h), Android compares
 * strings, and this file holds literals.
 */

import { DEFAULT_SEPARATORS, projectSeparators, type Separators } from "@/lib/placeholders"
import { placeholdersToLiveValues, type LiveValue } from "@/lib/live-value"
import { migrateScreenToTables } from "@/lib/table"
import { migrateToFreeScreens } from "@/lib/free-screens"
import { ensureEveryScreenHasAMaster, migrateColorsToRoles } from "@/lib/themes"

export const OBJECT_TYPES = [
  "text",
  "icon",
  "live-icon",
  "bar",
  "gauge",
  "slider",
  "dial",
  "switch",
  "button-group",
  "button",
  "line",
  "live-line",
  "box",
  "switcher",
  "panel",
  // The designer's alone (lib/object-groups.ts): every export dissolves it
  // into the objects it holds, so no device declares or draws it.
  "group",
  // The designer's alone too (lib/layout.ts, lib/table.ts,
  // docs/2026-10-02-layout-tables.md): a free area, and a table that places
  // each object in the cell it names; dissolved at export like a group.
  "free",
  "table",
] as const

export type ObjectType = (typeof OBJECT_TYPES)[number]

/** What a person can put a finger on. Also the line an e-paper DDF stops at. */
export const OPERATE_TYPES: readonly ObjectType[] = ["slider", "dial", "switch", "button-group", "button"]

export function isObjectType(type: string): type is ObjectType {
  return (OBJECT_TYPES as readonly string[]).includes(type)
}

/** A straight level - the read-only bar or the slider, which share a shape. */
export function isLevelType(type: string | undefined): type is "bar" | "slider" {
  return type === "bar" || type === "slider"
}

/** A round level - the gauge or the dial. */
export function isArcType(type: string | undefined): type is "gauge" | "dial" {
  return type === "gauge" || type === "dial"
}

/** A switch with a knob or a connected button group. */
export function isSwitchType(type: string | undefined): type is "switch" | "button-group" {
  return type === "switch" || type === "button-group"
}

/** The level types a finger can set: they carry a write topic and a step. */
export function isSettableLevel(type: string | undefined): type is "slider" | "dial" {
  return type === "slider" || type === "dial"
}

export function isOperateType(type: string | undefined): boolean {
  return type !== undefined && (OPERATE_TYPES as readonly string[]).includes(type)
}

/**
 * Whether a device can be touched, read from what it declares it draws.
 * Until the split this was guessed from `includes("SoftwareButton")`; now a
 * device that declares anything from Operate has a way to operate it. Old
 * names are accepted so a DDF that has not been re-issued still answers.
 */
export function declaresTouch(supportedObjectTypes: readonly string[] | undefined): boolean {
  if (!supportedObjectTypes) return false
  return supportedObjectTypes.flatMap(migrateTypeName).some(isOperateType)
}

/** The name the toolbar and the property panel show for a type. */
export function objectTypeLabel(type: string): string {
  switch (type) {
    case "text":
      return "Text"
    case "icon":
      return "Icon"
    case "live-icon":
      return "Live Icon"
    case "bar":
      return "Bar"
    case "gauge":
      return "Gauge"
    case "slider":
      return "Slider"
    case "dial":
      return "Dial"
    case "switch":
      return "Switch"
    case "button-group":
      return "Button Group"
    case "button":
      return "Button"
    case "line":
      return "Line"
    case "live-line":
      return "Live Line"
    case "box":
      return "Box"
    case "switcher":
      return "Switcher"
    case "panel":
      return "Panel"
    case "group":
      return "Group"
    case "free":
      return "Free"
    case "table":
      return "Table"
    default:
      return type
  }
}

// ---------------------------------------------------------------- migration

/**
 * The old name's new names, for a list that only names types (a DDF's
 * `supportedObjectTypes`, a building block's `requiredObjectTypes`). A type
 * that was split names both halves: a device that drew a Level Indicator
 * drew both a bar and a slider.
 */
export function migrateTypeName(type: string): ObjectType[] {
  switch (type) {
    // Live Text went into Text on 2026-10-07: a text with a `{topic:…}`
    // placeholder does all it did (liveTextToText below).
    case "MqttDataField":
    case "field":
    case "live-text":
      return ["text"]
    case "MQTTIconField":
      return ["live-icon"]
    case "MqttDataLine":
      return ["live-line"]
    case "label":
      return ["text"]
    case "SoftwareButton":
      return ["button"]
    case "tab-control":
      return ["switcher"]
    case "level-indicator":
      return ["bar", "slider"]
    case "arc-level":
      return ["gauge", "dial"]
    case "Switch":
      return ["switch", "button-group"]
    default:
      return isObjectType(type) ? [type] : []
  }
}

/**
 * The new names a *device declaration* should carry - a DDF's
 * `supportedObjectTypes` or the copy of it a project keeps.
 *
 * Not the same as mapping each name on its own. A device that declared
 * `level-indicator` drew both halves of it, but only one of them is a
 * control: without touch it can show a bar and never a slider. Splitting
 * every old declaration into both halves would tell the designer that the
 * e-paper display has touch - `declaresTouch` reads exactly this list - and
 * it would go on to offer swipe actions and a Slider tool for a panel with
 * no digitizer at all. That is the mistake the split was made to end, and
 * it would have arrived through the back door.
 *
 * So the old declaration is asked whether it meant touch: it did if it
 * declared a `SoftwareButton` or a `Switch`, the two types that were
 * unusable without one. A DDF already on the new names passes through.
 */
export function migrateDeclaredTypes(types: readonly string[] | undefined): ObjectType[] {
  if (!types) return []
  const touch = types.some((t) => t === "SoftwareButton" || t === "Switch" || isOperateType(t))
  const out: ObjectType[] = []
  for (const t of types) {
    let names: ObjectType[]
    if (t === "level-indicator") names = touch ? ["bar", "slider"] : ["bar"]
    else if (t === "arc-level") names = touch ? ["gauge", "dial"] : ["gauge"]
    else names = migrateTypeName(t)
    for (const n of names) if (!out.includes(n)) out.push(n)
  }
  return out
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== ""
}

/**
 * An object's new type from its old one and its properties. Only the write
 * topic decides whether a level was a slider: a target marker alone is a bar
 * that shows where the value should be, which is what an e-paper thermostat
 * is. A Switch was a knob only in `mode: "single"`.
 */
export function migrateObjectType(type: string, properties: Record<string, any> | undefined): ObjectType | null {
  switch (type) {
    case "level-indicator":
      return hasText(properties?.writeTopic) ? "slider" : "bar"
    case "arc-level":
      return hasText(properties?.writeTopic) ? "dial" : "gauge"
    case "Switch":
      return properties?.mode === "single" ? "switch" : "button-group"
    default: {
      const [single] = migrateTypeName(type)
      return single ?? (isObjectType(type) ? type : null)
    }
  }
}

/** What a Bar or Slider carried for its header line until 2026-09-29. */
const LEVEL_HEADER_PROPERTIES = ["label", "iconAssetId"] as const

/**
 * A Bar or Slider without the name and icon it no longer has - for an export
 * whose project did not come in through migrateProject. A copy; the object is
 * returned as it is when it carries neither.
 */
export function withoutLevelHeader<T extends { properties?: Record<string, any> }>(obj: T): T {
  if (!obj.properties || !LEVEL_HEADER_PROPERTIES.some((key) => key in obj.properties!)) return obj
  const properties = { ...obj.properties }
  for (const key of LEVEL_HEADER_PROPERTIES) delete properties[key]
  return { ...obj, properties }
}

interface MigratableObject {
  type: string
  properties?: Record<string, any>
  children?: MigratableObject[]
}

/** The names a Live Text went by. */
const LIVE_TEXT_NAMES = new Set(["live-text", "MqttDataField", "field"])

/** What a Live Text carried that a Text says in its placeholder instead. */
const LIVE_TEXT_PROPERTIES = [
  "topic",
  "displayAs",
  "prefix",
  "postfix",
  "numberOfDecimals",
  "thousandsSeparator",
  "valueIconPairs",
] as const

/** Braces a prefix or suffix means literally, doubled (lib/placeholders.ts). */
function literal(text: unknown): string {
  return typeof text === "string" ? text.replace(/[{}]/g, (brace) => brace + brace) : ""
}

/**
 * A Live Text as the Text that does the same (the user, 2026-10-07: "seine
 * Fähigkeiten sind im Text enthalten"): its topic as a `{topic:…}`
 * placeholder, a JSON field's path with it, prefix and suffix around it. A
 * formatted number keeps its decimals as `F<n>`, or `N<n>` where it grouped
 * thousands - in the project's thousands character now, as every placeholder
 * does. One kept in icon mode, which only an old project has, becomes the
 * Live Icon that drew it that way. Font, alignment and colours stay. In place.
 */
export function liveTextToText(obj: MigratableObject): void {
  const p = obj.properties ?? {}
  if (p.displayAs === "Display as Icon" || p.displayAs === "Show Range Icon") {
    obj.type = "live-icon"
    return
  }
  const topic = typeof p.topic === "string" ? p.topic.trim() : ""
  const decimals = typeof p.numberOfDecimals === "number" ? Math.min(9, Math.max(0, Math.round(p.numberOfDecimals))) : undefined
  const format =
    p.displayAs === "Formatted Number" && decimals !== undefined
      ? `:${hasText(p.thousandsSeparator) ? "N" : "F"}${decimals}`
      : ""
  const placeholder = topic ? `{topic:${topic}${format}}` : ""
  const properties: Record<string, any> = { ...p, text: literal(p.prefix) + placeholder + literal(p.postfix) }
  for (const key of LIVE_TEXT_PROPERTIES) delete properties[key]
  obj.type = "text"
  obj.properties = properties
}

/**
 * Renames an object tree in place and says whether anything changed. An
 * unknown type is left alone - it was unknown before too, and a reader that
 * skips it now skipped it then.
 */
export function migrateObjects(objects: MigratableObject[] | undefined, separators: Separators = DEFAULT_SEPARATORS): boolean {
  let changed = false
  for (const obj of objects ?? []) {
    if (LIVE_TEXT_NAMES.has(obj.type)) {
      liveTextToText(obj)
      changed = true
    }
    const next = migrateObjectType(obj.type, obj.properties)
    if (next && next !== obj.type) {
      obj.type = next
      changed = true
    }
    // A Bar or Slider no longer has a name or an icon of its own: a label beside
    // it is a Text object, an icon an Icon object (2026-09-29). What an older
    // project still carries is dropped rather than carried over - no migration
    // into separate objects, by decision - so it is never exported again.
    if (isLevelType(obj.type) && obj.properties) {
      for (const key of LEVEL_HEADER_PROPERTIES) {
        if (key in obj.properties) {
          delete obj.properties[key]
          changed = true
        }
      }
    }
    // A text's placeholders become live values (docs/2026-10-07-live-values.md,
    // decision 17), a fallback written in the project's number format as the
    // placeholder wrote it. A text without one is left untouched.
    if (obj.type === "text" && typeof obj.properties?.text === "string") {
      const existing = Array.isArray(obj.properties.liveValues) ? (obj.properties.liveValues as LiveValue[]) : []
      const converted = placeholdersToLiveValues(obj.properties.text, existing, separators)
      if (converted.liveValues.length > existing.length) {
        obj.properties = { ...obj.properties, text: converted.text, liveValues: converted.liveValues }
        changed = true
      }
    }
    if (obj.children && migrateObjects(obj.children, separators)) changed = true
  }
  return changed
}

/**
 * Brings a project of any age to the current names, in place, and returns
 * it. Called at every place a project enters the designer from JSON - the
 * file import, the project zip, the version list and the API load - because
 * a snapshot that comes in through a door without it opens with names
 * nothing renders any more. Idempotent: a current project passes through
 * untouched.
 */
export function migrateProject<T extends { screens?: Array<{ objects?: MigratableObject[] }>; settings?: Record<string, any> }>(
  project: T,
): T {
  const separators = projectSeparators((project.settings ?? {}) as { decimalSeparator?: string; thousandsSeparator?: string })
  for (const screen of project.screens ?? []) migrateObjects(screen.objects, separators)
  // Colours become roles of a theme (lib/themes.ts). Throws on a colour it
  // cannot give a role, naming the object.
  migrateColorsToRoles(project as Parameters<typeof migrateColorsToRoles>[0])
  // Every screen has a master, which is where it takes its theme from.
  ensureEveryScreenHasAMaster(project as Parameters<typeof ensureEveryScreenHasAMaster>[0])
  const declared = project.settings?.supportedObjectTypes
  if (Array.isArray(declared)) {
    const migrated = migrateDeclaredTypes(declared)
    if (migrated.length !== declared.length || migrated.some((t, i) => t !== declared[i])) {
      project.settings!.supportedObjectTypes = migrated
    }
  }
  for (const screen of project.screens ?? []) {
    // What layout Tasks 1-12 saved - stacks, rows, grids, spacers - as tables
    // (lib/table.ts, docs/2026-10-02-layout-tables.md); idempotent.
    migrateScreenToTables(screen as Parameters<typeof migrateScreenToTables>[0])
  }
  // Screens are always free (docs/2026-10-03-free-screens.md).
  migrateToFreeScreens(project)
  return project
}
