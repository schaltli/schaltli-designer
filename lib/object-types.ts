/**
 * The sixteen object types, and the way back from the names they had until
 * 2026-09-20 (docs/2026-09-20-control-split.md).
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

import { ensureEveryScreenHasAMaster, migrateColorsToRoles } from "@/lib/themes"

export const OBJECT_TYPES = [
  "text",
  "live-text",
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
    case "live-text":
      return "Live Text"
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
    case "MqttDataField":
    case "field":
      return ["live-text"]
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

interface MigratableObject {
  type: string
  properties?: Record<string, any>
  children?: MigratableObject[]
}

/**
 * Renames an object tree in place and says whether anything changed. An
 * unknown type is left alone - it was unknown before too, and a reader that
 * skips it now skipped it then.
 */
export function migrateObjects(objects: MigratableObject[] | undefined): boolean {
  let changed = false
  for (const obj of objects ?? []) {
    const next = migrateObjectType(obj.type, obj.properties)
    if (next && next !== obj.type) {
      obj.type = next
      changed = true
    }
    if (obj.children && migrateObjects(obj.children)) changed = true
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
  for (const screen of project.screens ?? []) migrateObjects(screen.objects)
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
  return project
}
