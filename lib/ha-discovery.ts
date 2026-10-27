/**
 * Home Assistant MQTT Discovery, read (docs/2026-09-30-block-discovery.md).
 *
 * The blocks come from what the MQTT world already announces: retained
 * configs on `<prefix>/<component>/[<node_id>/]<object_id>/config`, the
 * format Zigbee2MQTT, ESPHome, Shelly scripts, OpenMQTTGateway and our own
 * VanPi bridge publish. This file turns one such message into configs with
 * every key spelled out; what an entity becomes is decided elsewhere.
 *
 * The rules are Home Assistant's own, from
 * homeassistant/components/mqtt/discovery.py at commit 9e443bcd (2026-09-11),
 * so that a config reads here exactly as Home Assistant reads it:
 *
 * - Abbreviations (lib/ha-abbreviations.ts): the component table at the top
 *   level and in each `availability` entry, the device table in `device`,
 *   the origin table in `origin`, the component table again in each
 *   component under `components`.
 * - `~` is the topic base: at the start or the end of a value whose key ends
 *   in `topic`, and of each `availability` entry's `topic`, it becomes the
 *   `~` value. Per config, after the split below - a `~` beside `components`
 *   is not passed down, as in Home Assistant.
 * - `<prefix>/device/…/config` (device-based discovery, 2024) carries
 *   `device`, `origin` and `components`; each component becomes a config of
 *   its own, its `platform` naming the component, inheriting `device`,
 *   `origin` and the shared options below unless it sets them itself. A
 *   component with nothing but `platform` is a removal.
 * - An empty payload is a removal, and `migrate_discovery` (or
 *   `migr_discvry`) a hand-over between the two forms: neither is a config.
 *
 * Nothing here throws: a message that is not a config gives none.
 */

import { ABBREVIATIONS, DEVICE_ABBREVIATIONS, ORIGIN_ABBREVIATIONS } from "@/lib/ha-abbreviations"
import { BLOCKS_PREFIX, readDescription } from "@/lib/block-description"
import { type Scale, type WriteFormat } from "@/lib/scaled-value"
import { TEXT_FIELD_MAX_LENGTH } from "@/lib/text-field"
import {
  decimalPlaces,
  Dict,
  linearForm,
  namesUsed,
  parseTemplate,
  payloadVariables,
  readSource,
  renderTemplate,
  str as pythonStr,
  TemplateError,
  type Template,
  type Value,
} from "@/lib/ha-template"

export const DEFAULT_DISCOVERY_PREFIX = "homeassistant"

/** One entity's config, every key in full and `~` resolved. */
export interface DiscoveryConfig {
  /** The platform: "switch", "sensor", "light" … */
  component: string
  /** The topic's node_id - for a device-based config, the device's object_id. */
  nodeId?: string
  /** The topic's object_id - for a device-based config, the component's key. */
  objectId: string
  /** Home Assistant's discovery id: node and object, space-separated. */
  discoveryId: string
  /** The config topic the message came on. */
  topic: string
  config: Record<string, any>
}

/**
 * What a device-based config passes down to its components (Home Assistant's
 * SHARED_OPTIONS, schemas.py, same commit).
 */
const SHARED_OPTIONS = [
  "availability",
  "availability_mode",
  "availability_template",
  "availability_topic",
  "command_topic",
  "encoding",
  "message_expiry_interval",
  "payload_available",
  "payload_not_available",
  "state_topic",
  "qos",
] as const

// Home Assistant's TOPIC_MATCHER, below the prefix.
const TOPIC_MATCHER = /^(\w+)\/(?:([a-zA-Z0-9_-]+)\/)?([a-zA-Z0-9_-]+)\/config$/

type Json = Record<string, any>

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

/** A copy with each abbreviated key replaced by its full name. */
function expandKeys(object: Json, table: Readonly<Record<string, string>>): Json {
  const out: Json = {}
  for (const [key, value] of Object.entries(object)) out[Object.hasOwn(table, key) ? table[key] : key] = value
  return out
}

function expandAvailability(config: Json): void {
  if (config.availability === undefined) return
  const entries = asList(config.availability).map((entry) => (isObject(entry) ? expandKeys(entry, ABBREVIATIONS) : entry))
  config.availability = Array.isArray(config.availability) ? entries : entries[0]
}

/** A component's keys: the component table, and its availability entries. */
function expandComponent(object: Json): Json {
  const config = expandKeys(object, ABBREVIATIONS)
  expandAvailability(config)
  return config
}

/** A whole config: the component's keys, and `device`, `origin`, `components` in theirs. */
function expandAll(object: Json): Json {
  const config = expandComponent(object)
  if (isObject(config.origin)) config.origin = expandKeys(config.origin, ORIGIN_ABBREVIATIONS)
  if (isObject(config.device)) config.device = expandKeys(config.device, DEVICE_ABBREVIATIONS)
  if (isObject(config.components)) {
    const components: Json = {}
    for (const [id, component] of Object.entries(config.components)) {
      components[id] = isObject(component) ? expandComponent(component) : component
    }
    config.components = components
  }
  return config
}

/** `~` into the topics, as Home Assistant's _replace_topic_base does it. */
function replaceTopicBase(config: Json): void {
  if (!("~" in config)) return
  const base = String(config["~"])
  delete config["~"]
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "string" || value === "" || !key.endsWith("topic")) continue
    // Two separate tests on the original value, so a value with `~` at both
    // ends gets its end replaced, not both - which is what Home Assistant does.
    if (value.startsWith("~")) config[key] = base + value.slice(1)
    if (value.endsWith("~")) config[key] = value.slice(0, -1) + base
  }
  if (config.availability) {
    for (const entry of asList(config.availability)) {
      if (!isObject(entry) || typeof entry.topic !== "string" || entry.topic === "") continue
      const topic = entry.topic
      if (topic.startsWith("~")) entry.topic = base + topic.slice(1)
      if (topic.endsWith("~")) entry.topic = topic.slice(0, -1) + base
    }
  }
}

function isMigration(payload: Json): boolean {
  return "migrate_discovery" in payload || "migr_discvry" in payload
}

/**
 * The configs one discovery message announces: none for a removal, a
 * migration or anything malformed; one for a component config; one per
 * component for a device config. `prefix` is the discovery prefix the
 * message was subscribed under.
 */
export function expandConfig(topic: string, payload: string, prefix: string = DEFAULT_DISCOVERY_PREFIX): DiscoveryConfig[] {
  if (!topic.startsWith(`${prefix}/`)) return []
  const match = TOPIC_MATCHER.exec(topic.slice(prefix.length + 1))
  if (!match) return []
  const [, component, nodeId, objectId] = match
  if (payload === "") return []

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return []
  }
  if (!isObject(parsed) || isMigration(parsed)) return []

  const configs: DiscoveryConfig[] = []
  const add = (entityComponent: string, entityNode: string | undefined, entityObject: string, config: Json) => {
    replaceTopicBase(config)
    configs.push({
      component: entityComponent,
      ...(entityNode ? { nodeId: entityNode } : {}),
      objectId: entityObject,
      discoveryId: entityNode ? `${entityNode} ${entityObject}` : entityObject,
      topic,
      config,
    })
  }

  const expanded = expandAll(parsed)
  if (component !== "device") {
    add(component, nodeId, objectId, expanded)
    return configs
  }

  // Device-based: Home Assistant requires the device, the origin and the
  // components, and refuses the message without any of them.
  if (!isObject(expanded.device) || !isObject(expanded.origin) || !isObject(expanded.components)) return []
  for (const [componentId, raw] of Object.entries(expanded.components)) {
    if (!isObject(raw) || typeof raw.platform !== "string") continue
    const { platform, ...rest } = raw
    // Nothing but the platform: this component is being removed.
    if (Object.keys(rest).length === 0) continue
    const config: Json = { ...rest, device: expanded.device, origin: expanded.origin }
    for (const option of SHARED_OPTIONS) {
      if (option in expanded && !(option in config)) config[option] = expanded[option]
    }
    // The device's object_id is the components' node; a node in the topic
    // goes in front of each component's key, as in Home Assistant.
    add(platform, objectId, nodeId ? `${nodeId} ${componentId}` : componentId, config)
  }
  return configs
}

/**
 * What a `*_template` reads: a path into the payload, or why it cannot be
 * read (block plan Task 2). Only the templates real publishers use to pull
 * one value out are understood - none at all (the raw payload), `{{ value }}`,
 * and a path into `value_json` in dot, bracket or index spelling, with
 * filters that leave the value as it is for showing it. Anything that
 * computes - a `{% … %}` block, arithmetic, a method, another filter - is
 * not, and the reason says which it is.
 *
 * The path is Schaltli's own (lib/json-path.ts): `a.b`, `a[0]`, `['a b']`;
 * empty for the raw payload. The filters are dropped - rounding is the
 * object's own number format: `decimals` where the last of them rounds,
 * `round(1)`, for a number shown as text to take as `F1`.
 */
export type TemplateRead = { path: string; decimals?: number } | { unsupported: string }

// The filters that change nothing a display needs (docs/2026-09-30-block-discovery.md).
const HARMLESS_FILTERS = new Set(["int", "float", "round", "lower", "upper", "is_defined", "default"])

type Segment = { name: string } | { index: number }

function formatPath(segments: Segment[]): string {
  let out = ""
  for (const segment of segments) {
    if ("index" in segment) out += `[${segment.index}]`
    else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.name)) out += out === "" ? segment.name : `.${segment.name}`
    else out += `['${segment.name}']`
  }
  return out
}

export function readPath(template: string | undefined): TemplateRead {
  const t = (template ?? "").trim()
  if (t === "") return { path: "" }
  const block = /\{%-?\s*(\w+)/.exec(t)
  if (block) return { unsupported: `a {% ${block[1]} %} block` }
  const whole = /^\{\{([\s\S]*)\}\}$/.exec(t)
  if (!whole) return { unsupported: "text outside {{ … }}" }
  const src = whole[1]
  if (src.includes("{{") || src.includes("}}")) return { unsupported: "more than one {{ … }}" }

  let i = 0
  const skip = () => {
    while (i < src.length && /\s/.test(src[i])) i++
  }
  const word = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (!m) return ""
    i += m[0].length
    return m[0]
  }
  // The rest of the expression from `from`, for a reason that shows it.
  const rest = (from: number) => src.slice(from).trim()

  skip()
  const start = i
  const root = word()
  if (root !== "value" && root !== "value_json") {
    if (src[i] === "(") return { unsupported: `the function ${root}()` }
    return { unsupported: root ? `\`${root}\`` : `\`${rest(start)}\`` }
  }

  const segments: Segment[] = []
  while (root === "value_json" && (src[i] === "." || src[i] === "[")) {
    if (src[i] === ".") {
      i++
      const name = word()
      if (!name) return { unsupported: `\`${rest(start)}\`` }
      if (src[i] === "(") return { unsupported: `the method ${name}()` }
      segments.push({ name })
      continue
    }
    i++
    skip()
    const quote = src[i]
    if (quote === '"' || quote === "'") {
      const close = src.indexOf(quote, i + 1)
      if (close === -1) return { unsupported: `\`${rest(start)}\`` }
      segments.push({ name: src.slice(i + 1, close) })
      i = close + 1
    } else {
      const digits = /^\d+/.exec(src.slice(i))
      if (!digits) return { unsupported: `\`${rest(start)}\`` }
      segments.push({ index: Number(digits[0]) })
      i += digits[0].length
    }
    skip()
    if (src[i] !== "]") return { unsupported: `\`${rest(start)}\`` }
    i++
  }

  skip()
  let decimals: number | undefined
  while (src[i] === "|") {
    i++
    skip()
    const filter = word()
    if (!HARMLESS_FILTERS.has(filter)) return { unsupported: `the filter ${filter || rest(i)}` }
    skip()
    // round, round(n): the decimals a number keeps. Another method - floor,
    // ceil, half - is not the format's rounding, so it keeps none.
    if (filter === "round") {
      const args = /^\(\s*(\d+)?\s*(?:,\s*(?:method\s*=\s*)?["']common["']\s*)?\)/.exec(src.slice(i))
      decimals = src[i] !== "(" ? 0 : args ? Number(args[1] ?? 0) : undefined
    } else if (filter !== "float") decimals = undefined
    if (src[i] === "(") {
      // Arguments, however many: nested brackets and quoted text skipped whole.
      let depth = 0
      for (; i < src.length; i++) {
        const c = src[i]
        if (c === '"' || c === "'") {
          const close = src.indexOf(c, i + 1)
          if (close === -1) return { unsupported: `\`${rest(start)}\`` }
          i = close
        } else if (c === "(") depth++
        else if (c === ")" && --depth === 0) break
      }
      if (depth !== 0) return { unsupported: `\`${rest(start)}\`` }
      i++
    }
    skip()
  }

  if (i < src.length) {
    const tail = rest(i)
    if (/^[-+*/%]/.test(tail)) return { unsupported: `arithmetic (${tail})` }
    if (/^(if|and|or|not|in)\b/.test(tail)) return { unsupported: `an expression (${tail})` }
    return { unsupported: `\`${tail}\`` }
  }
  return { path: root === "value" ? "" : formatPath(segments), ...(decimals !== undefined ? { decimals } : {}) }
}

/**
 * What one entity offers the Block menu (block plan Task 3): a name, an
 * icon, the device it belongs to, and its controls - each a thing Schaltli
 * can draw and bind. Bindings are Schaltli topics, a JSON path after `#`
 * (lib/json-path.ts). Nothing here knows what the entity is in the world:
 * a plug, a pump and a fill level are all just their component.
 */
export interface CatalogEntry {
  /** Component and discovery id: unique per broker. */
  id: string
  component: string
  /** As Home Assistant names it: the device's name and the entity's. */
  name: string
  /**
   * The name under its device, in the Block menu and on a placed block: the
   * entity's own, or the device's where the entity has none - "Cabin
   * temperature" of the device "van-sensors", where Home Assistant says
   * "van-sensors Cabin temperature".
   */
  label: string
  /** The config's `mdi:…` icon, if it names one. */
  icon?: string
  /** The device, for grouping: its first identifier, and its name. */
  device?: { id: string; name?: string }
  controls: CatalogControl[]
  /** The parts of an entity with several that cannot be used, and why. */
  skipped?: { part: string; reason: string }[]
  /** Home Assistant's `unique_id`, what a block description's `covers` names. */
  uniqueId?: string
  /**
   * From a block description (lib/block-description.ts): the `unique_id`s of
   * the entries it replaces in the Block menu.
   */
  covers?: string[]
}

export type CatalogControl = (
  /**
   * Two states read and written: a switch. `label` is what a state's button
   * says where its value is not the word to show, `icon` the `mdi:…` icon it
   * shows (a block description's).
   */
  | {
      kind: "switch"
      read?: string
      write: string
      on: { read: string; write: string; label?: string; icon?: string }
      off: { read: string; write: string; label?: string; icon?: string }
    }
  /** Two states only read: shown as text. */
  | { kind: "state"; read: string; on: string; off: string }
  /**
   * A value only read, with its unit; `level` when it reads as a fill (%,
   * device class battery); `decimals` where its template rounds, for the
   * number shown as text.
   */
  | { kind: "value"; read: string; unit?: string; level: boolean; decimals?: number; scale?: Scale }
  /**
   * A number set by a finger, within min and max in steps. `current` is the
   * measured value beside the setpoint `read` (a block description's
   * `current_topic`): placed, it is the fill and `read` the handle.
   * `percent`: its number is the fill in percent, not the value - a light's
   * brightness, which Home Assistant shows so whatever its scale (#72).
   */
  | {
      kind: "level"
      read?: string
      write: string
      min: number
      max: number
      step: number
      unit?: string
      current?: string
      percent?: true
      /** `read` scaled, where its template scales it (tasks/ha-templates-stage2-plan.md, decision 5). */
      scale?: Scale
      /** What is published, where its command template puts the value into a text or scales it. */
      writeFormat?: WriteFormat
    }
  /** A text shown as it comes: a sensor that is not a number, a cover's state, a block description's. */
  | { kind: "text"; read: string }
  /**
   * A text typed on the device and sent as it is: an MQTT `text`
   * (tasks/ha-text-plan.md, decision 8). Its bounds count characters;
   * `hidden` is Home Assistant's `password` mode.
   */
  | { kind: "text-field"; read?: string; write: string; minLength: number; maxLength: number; hidden?: true }
  /** A time of day set on the device and sent as `HH:MM:00`: an MQTT `time` (tasks/ha-time-plan.md, decision 6). */
  | { kind: "time-field"; read?: string; write: string }
  /**
   * One of its options, read and written: a button group, one button each.
   * `labels`, beside `options` and as long, are the buttons' words where the
   * values are not, `icons` their `mdi:…` icons (a block description's).
   * `writes`, as long, what each button sends where it is not the option -
   * a command template's rendering; `reads` what lights it where that is
   * not the option - a state template's, run backwards - "" for an option
   * no reported value gives.
   */
  | { kind: "choice"; read?: string; write: string; options: string[]; labels?: string[]; icons?: (string | null)[]; writes?: string[]; reads?: string[] }
  /** A press that publishes one payload. */
  | { kind: "button"; write: string; payload: string }
) & {
  /** Which part of an entity with several - light, fan, climate - it is: "Brightness", "Speed" … */
  part?: string
  /**
   * Shown only while `topic` holds one of `values` (a block description's
   * `shown_when`): the placed block puts it in a switcher on that topic.
   */
  shownWhen?: { topic: string; values: string[] }
  /**
   * The section it belongs to (a block description's `section`): the Insert
   * dialog ticks a section's parts together. Without one it is always placed.
   */
  section?: string
  /**
   * The column it stands in, 1 or 2 (a block description's `column`): a
   * block with parts in column 2 lays those of 1 and 2 side by side, each
   * column one below the other on its own; a part without one spans both.
   */
  column?: 1 | 2
  /**
   * The row of two columns it stands in (a block description's `row`): parts
   * in columns 1 and 2 with the same row stand side by side; a new row
   * starts another pair below.
   */
  row?: string
  /** Set small: a text in the Caption style rather than the Label (a description's `small`). */
  small?: boolean
  /** The look it comes in first, where it has several (a description's `look`: "switch"). */
  look?: string
  /** Its size step where not M (a description's `size`: "xs" for a button seldom pressed). */
  size?: "xs" | "s" | "m" | "l"
}

/** An entity the Block menu lists but cannot place, and why. */
export interface UnsupportedEntity {
  id: string
  component: string
  name: string
  /** As CatalogEntry's. */
  label: string
  device?: { id: string; name?: string }
  reason: string
}

// Home Assistant's DEFAULT_NAME of each platform (homeassistant/components/
// mqtt/<platform>.py, 2026-09-30), for an entity whose config has no name
// and no device class to be named after.
const DEFAULT_NAMES: Record<string, string> = {
  switch: "MQTT Switch",
  sensor: "MQTT Sensor",
  binary_sensor: "MQTT Binary sensor",
  number: "MQTT Number",
  select: "MQTT Select",
  button: "MQTT Button",
}

// The components whose entity takes its device class's name when it has no
// name of its own (Home Assistant's _default_to_device_class_name).
const NAMED_BY_DEVICE_CLASS = new Set(["sensor", "binary_sensor", "number", "button"])

function deviceOf(config: Json): { id: string; name?: string } | undefined {
  const device = config.device
  if (!isObject(device)) return undefined
  const ids = asList(device.identifiers).filter((id) => typeof id === "string" && id !== "")
  const connections = asList(device.connections).filter(Array.isArray).map((c) => (c as unknown[]).join(":"))
  const id = (ids[0] as string | undefined) ?? connections[0]
  if (!id) return undefined
  return { id, ...(typeof device.name === "string" && device.name ? { name: device.name } : {}) }
}

/**
 * The name Home Assistant shows (its entity.py _set_entity_name, and
 * has_entity_name): the config's `name` - `null` meaning the device's
 * alone - else the device class's name, else the platform's default; with
 * the device's name in front where there is a device.
 */
function entityName(component: string, config: Json, device: { name?: string } | undefined): { name: string; label: string } {
  let own: string | null
  if ("name" in config) own = typeof config.name === "string" ? config.name : null
  else if (NAMED_BY_DEVICE_CLASS.has(component) && typeof config.device_class === "string") {
    const words = config.device_class.replace(/_/g, " ")
    own = words.charAt(0).toUpperCase() + words.slice(1)
  } else own = DEFAULT_NAMES[component] ?? component
  const parts = [device?.name, own].filter((p): p is string => typeof p === "string" && p !== "")
  const name = parts.length > 0 ? parts.join(" ") : component
  return { name, label: own || device?.name || name }
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : fallback
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

/**
 * A topic and a template as one Schaltli binding, or why they cannot be.
 * `scalable`: a number, which a template may scale - read then through a
 * scaled topic the device computes (tasks/ha-templates-stage2-plan.md,
 * decision 5).
 */
function binding(topic: unknown, template: unknown, scalable = false): { read: string; decimals?: number; scale?: Scale } | { unsupported: string } | undefined {
  if (typeof topic !== "string" || topic === "") return undefined
  const read = readPath(typeof template === "string" ? template : undefined)
  if ("unsupported" in read) {
    const scaled = scalable && typeof template === "string" ? linearRead(template) : undefined
    if (scaled) return { read: scaled.path ? `${topic}#${scaled.path}` : topic, scale: scaled.scale, ...(scaled.decimals !== undefined ? { decimals: scaled.decimals } : {}) }
    return { unsupported: `the value template: ${read.unsupported}` }
  }
  return { read: read.path ? `${topic}#${read.path}` : topic, ...(read.decimals !== undefined ? { decimals: read.decimals } : {}) }
}

// Without a round(n) of its own a scaled number keeps two decimals, or the
// offset's where it has more: a chip's own format rounds further.
const SCALED_DECIMALS = 2

/** A read template that scales one value linearly: the path, the scale, the decimals it rounds to. */
function linearRead(template: string): { path: string; scale: Scale; decimals?: number } | undefined {
  const parsed = parseTemplate(template)
  if ("unsupported" in parsed) return undefined
  const form = linearForm(parsed)
  if ("unsupported" in form) return undefined
  const offsetPlaces = (form.offset.split(".")[1] ?? "").length
  const path = form.path === "value" ? "" : formatPath(form.path.map((key) => (typeof key === "number" ? { index: key } : { name: key })))
  return {
    path,
    scale: { numerator: form.numerator, denominator: form.denominator, ...(form.offset !== "0" ? { offset: form.offset } : {}), decimals: form.decimals ?? Math.max(SCALED_DECIMALS, offsetPlaces) },
    ...(form.decimals !== undefined ? { decimals: form.decimals } : {}),
  }
}

/** A write format that changes what is sent; `{value}` alone sends the number as it is. */
function needed(format: WriteFormat | undefined): { writeFormat?: WriteFormat } {
  if (!format) return {}
  const plain = format.text === "{value}" && format.numerator === undefined && format.denominator === undefined && format.offset === undefined && format.decimals === undefined
  return plain ? {} : { writeFormat: format }
}

/**
 * What a number's command template publishes, as a write format a device
 * fills in itself (decision 5): text around one linear expression of
 * `variable`, or - a dict through tojson, say - a rendering that puts the
 * value in one place as it is. Undefined where it is neither.
 */
function writeFormatOf(template: Template, variable: string, step: number): WriteFormat | undefined {
  const form = linearForm(template, variable)
  if (!("unsupported" in form)) {
    if ((form.before + form.after).includes("{value}")) return undefined
    const text = form.before + "{value}" + form.after
    const identity = form.numerator === 1 && form.denominator === 1 && form.offset === "0"
    if (identity && form.decimals === undefined) return { text }
    // Without a rounding of its own: the step's places and the factor's.
    const offsetPlaces = (form.offset.split(".")[1] ?? "").length
    const stepPlaces = (String(step).split(".")[1] ?? "").length
    const decimals = form.decimals ?? Math.min(6, Math.max(offsetPlaces, stepPlaces + (decimalPlaces(form.numerator, form.denominator) ?? SCALED_DECIMALS)))
    return { text, numerator: form.numerator, denominator: form.denominator, ...(form.offset !== "0" ? { offset: form.offset } : {}), decimals }
  }
  // The value put in once, unchanged: a whole number and a fraction both
  // come out as themselves, in the same place.
  const probe = (num: number, int: boolean) => {
    try {
      return renderTemplate(template, { [variable]: { num, int } })
    } catch (e) {
      if (e instanceof TemplateError) return undefined
      throw e
    }
  }
  const whole = probe(1234567, true)
  const fraction = probe(12.5, false)
  if (whole === undefined || fraction === undefined) return undefined
  const at = whole.indexOf("1234567")
  if (at < 0 || whole.indexOf("1234567", at + 1) >= 0) return undefined
  const before = whole.slice(0, at)
  const after = whole.slice(at + "1234567".length)
  if (fraction !== before + "12.5" + after || (before + after).includes("{value}")) return undefined
  return { text: before + "{value}" + after }
}

/**
 * One part of an entity, as the keys of its config name it: where it is read
 * (a topic and its template), where it is written (a topic and its command
 * template).
 */
interface PartKeys {
  read?: string
  readTemplate?: string
  write?: string
  writeTemplate?: string
  /** A number: its read template may scale it. */
  scalable?: boolean
  /** The name its command template is given the value as, where not `value` - a cover's `position`. */
  variable?: string
}

/** A part made, a part that cannot be, or no part at all (none of its keys set). */
type PartResult = { control: CatalogControl } | { skipped: string } | undefined

/**
 * What a part sends for a value: the payload its command template renders, as
 * Home Assistant would render it, or why it cannot be sent
 * (docs/2026-10-26-ha-templates.md). `extra` are the variables Home Assistant
 * passes beside `value` - a siren's tone.
 */
type Send = (value: Value, extra?: Record<string, Value>) => { payload: string } | { refused: string }

const AS_IT_IS: Send = (value) => ({ payload: typeof value === "string" ? value : pythonStr(value) })

/**
 * A command template as a Send; `{{ value }}` and none send the value as it
 * is. A template the subset does not know, or one reading a name Home
 * Assistant fills from what the designer cannot know - a lock's code, the
 * entity id - is refused, with what it lacks.
 */
function commandOf(template: unknown, variables: string[] = []): { send: Send; templated: boolean; template?: Template } | { refused: string } {
  if (template === undefined || template === null || isPayloadTemplate(template)) return { send: AS_IT_IS, templated: false }
  if (typeof template !== "string") return { refused: "a command template" }
  const parsed = parseTemplate(template)
  if ("unsupported" in parsed) return { refused: `the command template: ${parsed.unsupported}` }
  const known = new Set(["value", ...variables])
  const lacking = [...namesUsed(parsed)].find((name) => !known.has(name))
  if (lacking) return { refused: `the command template: \`${lacking}\`` }
  return { send: (value, extra) => render(parsed, { value, ...extra }), templated: true, template: parsed }
}

function render(template: Template, variables: Record<string, Value>): { payload: string } | { refused: string } {
  try {
    return { payload: renderTemplate(template, variables) }
  } catch (e) {
    if (e instanceof TemplateError) return { refused: `the command template: ${e.message}` }
    throw e
  }
}

/** What the keys of one part give: the topics and how to send, or why they cannot be used. */
function partTopics(
  config: Json,
  keys: PartKeys,
):
  | { read?: string; decimals?: number; scale?: Scale; write?: string; send?: Send; templated?: boolean; template?: Template; writeRefused?: string }
  | { skipped: string } {
  const read = keys.read ? binding(config[keys.read], keys.readTemplate ? config[keys.readTemplate] : undefined, keys.scalable) : undefined
  if (read && "unsupported" in read) return { skipped: read.unsupported }
  const topic = keys.write ? config[keys.write] : undefined
  const write = typeof topic === "string" && topic !== "" ? topic : undefined
  const command = write ? commandOf(keys.writeTemplate ? config[keys.writeTemplate] : undefined, keys.variable ? [keys.variable] : []) : undefined
  const readPart = read ? { read: read.read, ...(read.decimals !== undefined ? { decimals: read.decimals } : {}), ...(read.scale ? { scale: read.scale } : {}) } : {}
  if (!write || !command) return readPart
  if ("refused" in command) return { ...readPart, writeRefused: command.refused }
  return { ...readPart, write, send: command.send, templated: command.templated, ...(command.template ? { template: command.template } : {}) }
}

/** Each value sent, or the first reason one cannot be. */
function sendAll(send: Send, values: Value[]): { payloads: string[] } | { refused: string } {
  const payloads: string[] = []
  for (const value of values) {
    const sent = send(value)
    if ("refused" in sent) return sent
    payloads.push(sent.payload)
  }
  return { payloads }
}

/** Two states: a switch where it can be written, a state where it can only be read. */
type SwitchState = { read: string; write: string; label?: string }

function switchPart(config: Json, keys: PartKeys, on: SwitchState, off: SwitchState): PartResult {
  // A state template that maps the payload onto the two states: read the
  // payload itself, and the values that give each state.
  const mapped = mappedState(config, keys, on.read, off.read)
  if (mapped && "skipped" in mapped) return mapped
  const t = partTopics(config, mapped ? { ...keys, read: undefined, readTemplate: undefined } : keys)
  if ("skipped" in t) return t
  const read = mapped ? mapped.read : t.read
  const reads = mapped ? { on: mapped.on, off: mapped.off } : { on: seenInField(t.read, on.read), off: seenInField(t.read, off.read) }
  if (t.write && t.send) {
    const sent = sendAll(t.send, [on.write, off.write])
    if ("payloads" in sent) {
      const [onWrite, offWrite] = sent.payloads
      return {
        control: { kind: "switch", ...(read ? { read } : {}), write: t.write, on: { ...on, read: reads.on, write: onWrite }, off: { ...off, read: reads.off, write: offWrite } },
      }
    }
    if (read) return { control: { kind: "state", read, on: reads.on, off: reads.off } }
    return { skipped: sent.refused }
  }
  if (read) return { control: { kind: "state", read, on: reads.on, off: reads.off } }
  return t.writeRefused ? { skipped: t.writeRefused } : undefined
}

/**
 * A read template that maps the payload onto states, run backwards
 * (docs/2026-10-26-ha-templates.md): `{% if value_json.output %}ON{% else %}OFF{% endif %}`
 * reads `output`, and true is ON, false OFF. Tried with true, false and every
 * constant the template compares the payload with; a state none of them
 * gives is tried as itself, for a template that passes most values through
 * (`"fan_only" if value_json.value == "ventilation" else value_json.value`).
 * Each state comes from one value or from none (`undefined`); a state from
 * two is no state to light, and the reason says which. Undefined where the
 * template is a plain path, or there is none.
 */
function mappedStates(config: Json, keys: PartKeys, states: string[]): { read: string; reads: (string | undefined)[] } | { skipped: string } | undefined {
  const topic = keys.read ? config[keys.read] : undefined
  const template = keys.readTemplate ? config[keys.readTemplate] : undefined
  if (typeof topic !== "string" || topic === "" || typeof template !== "string") return undefined
  const plain = readPath(template)
  if ("path" in plain) return undefined
  const reason = { skipped: `the value template: ${plain.unsupported}` }
  const parsed = parseTemplate(template)
  if ("unsupported" in parsed) return { skipped: `the value template: ${parsed.unsupported}` }
  const source = readSource(parsed)
  if (!source) return reason
  const path = source.path
  const variablesFor = (candidate: Value): Record<string, Value> | undefined => {
    if (path === "value") return payloadVariables(typeof candidate === "string" ? candidate : pythonStr(candidate))
    let json: Value = candidate
    for (const key of [...path].reverse()) {
      if (typeof key === "number") return undefined
      json = new Dict(new Map([[key, json]]))
    }
    return { value: JSON.stringify(toPlain(json)), value_json: json }
  }
  const renders = (candidate: Value): string | undefined => {
    const variables = variablesFor(candidate)
    if (!variables) return undefined
    try {
      return renderTemplate(parsed, variables)
    } catch (e) {
      if (!(e instanceof TemplateError)) throw e
      return undefined
    }
  }
  const gives = new Map(states.map((state) => [state, new Set<string>()]))
  const candidates: Value[] = path === "value" ? source.constants.map((c) => (typeof c === "string" ? c : pythonStr(c))) : [true, false, ...source.constants]
  for (const candidate of candidates) gives.get(renders(candidate) ?? "\u0000")?.add(seenAs(candidate))
  for (const state of states) if (gives.get(state)!.size === 0 && renders(state) === state) gives.get(state)!.add(state)
  // Not one state from anything: not a mapping, so say what is in the way.
  if (states.every((state) => gives.get(state)!.size === 0)) return reason
  for (const state of states) if (gives.get(state)!.size > 1) return { skipped: `the value template: more than one value gives ${state}` }
  const field = path === "value" ? "" : formatPath(path.map((key) => ({ name: String(key) })))
  return { read: field ? `${topic}#${field}` : topic, reads: states.map((state) => [...gives.get(state)!][0]) }
}

/** Two states run backwards: both must come from a value. */
function mappedState(config: Json, keys: PartKeys, onState: string, offState: string): { read: string; on: string; off: string } | { skipped: string } | undefined {
  const mapped = mappedStates(config, keys, [onState, offState])
  if (!mapped || "skipped" in mapped) return mapped
  const [on, off] = mapped.reads
  if (on === undefined) return { skipped: `the value template: no value gives ${onState}` }
  if (off === undefined) return { skipped: `the value template: no value gives ${offState}` }
  return { read: mapped.read, on, off }
}

/**
 * A state as a device reads it from a JSON field. Home Assistant writes a
 * field's true as Python does, "True"; the device reads the JSON, "true" -
 * so a Shelly's `{{ value_json.output }}` with state_on "True" never lit
 * before 2026-10-26. Read from the payload itself, the state stays as it is.
 */
function seenInField(read: string | undefined, state: string): string {
  if (!read?.includes("#")) return state
  return state === "True" ? "true" : state === "False" ? "false" : state
}

/** A value as a device reads it from a JSON field (lib/json-path.ts): true as "true", 2.0 as "2". */
function seenAs(value: Value): string {
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value !== null && typeof value === "object" && "num" in value) return String(value.num)
  return pythonStr(value)
}

function toPlain(value: Value): unknown {
  if (value instanceof Dict) return Object.fromEntries([...value.entries].map(([k, v]) => [k, toPlain(v)]))
  if (Array.isArray(value)) return value.map(toPlain)
  if (value !== null && typeof value === "object" && "num" in value) return value.num
  return typeof value === "symbol" ? null : value
}

/** A number: a level where it can be written, a value where it can only be read. */
function levelPart(config: Json, keys: PartKeys, range: { min: number; max: number; step: number }, unit?: string, percent?: true): PartResult {
  const t = partTopics(config, { ...keys, scalable: true })
  if ("skipped" in t) return t
  const withUnit = unit ? { unit } : {}
  const rounded = t.decimals !== undefined ? { decimals: t.decimals } : {}
  const scaled = t.scale ? { scale: t.scale } : {}
  // A number through a command template: a write format where the device can
  // fill it in, else only read.
  const writeFormat = t.templated && t.template ? writeFormatOf(t.template, keys.variable ?? "value", range.step) : undefined
  if (t.templated && !writeFormat) return t.read ? { control: { kind: "value", read: t.read, ...withUnit, level: false, ...rounded, ...scaled } } : { skipped: "a command template" }
  if (t.write) {
    return {
      control: { kind: "level", ...(t.read ? { read: t.read } : {}), write: t.write, ...range, ...withUnit, ...(percent ? { percent } : {}), ...scaled, ...needed(writeFormat) },
    }
  }
  if (t.read) return { control: { kind: "value", read: t.read, ...withUnit, level: false, ...rounded, ...scaled } }
  return t.writeRefused ? { skipped: t.writeRefused } : undefined
}

/** One of several options, read and written. */
function choicePart(config: Json, keys: PartKeys, options: unknown): PartResult {
  const list = Array.isArray(options) ? options.map((o: unknown) => str(o, "")).filter(Boolean) : []
  // A state template mapping the payload onto the options: read the payload,
  // each option lit by the value that gives it - none where nothing does.
  const mapped = list.length > 0 ? mappedStates(config, keys, list) : undefined
  if (mapped && "skipped" in mapped) return mapped
  const t = partTopics(config, mapped ? { ...keys, read: undefined, readTemplate: undefined } : keys)
  if ("skipped" in t) return t
  if (!t.write || !t.send) return t.writeRefused ? { skipped: t.writeRefused } : undefined
  // As many buttons as options: whether a wide group fits a screen is the
  // placing's to say, not a reason to leave the entity out (user,
  // 2026-10-01 - the spec's limit of four was dropped).
  if (list.length === 0) return { skipped: "no options" }
  const sent = sendAll(t.send, list)
  if ("refused" in sent) return { skipped: sent.refused }
  const writes = sent.payloads.some((payload, i) => payload !== list[i]) ? { writes: sent.payloads } : {}
  const read = mapped ? mapped.read : t.read
  const reads = mapped && mapped.reads.some((r, i) => r !== list[i]) ? { reads: mapped.reads.map((r) => r ?? "") } : {}
  return { control: { kind: "choice", ...(read ? { read } : {}), write: t.write, options: list, ...writes, ...reads } }
}

/** A template that gives the payload itself: `{{ value }}`. */
function isPayloadTemplate(template: unknown): boolean {
  return typeof template === "string" && /^\{\{\s*value\s*\}\}$/.test(template.trim())
}

/** A part only where it can be written: what it would read, the State part shows already. */
function writtenOnly(part: PartResult): PartResult {
  return part && "control" in part && part.control.kind === "state" ? undefined : part
}

/** A text only read, shown as it comes. */
/**
 * An MQTT text (text.py): typed on the device and sent as it is, read back
 * from its state topic. Where it cannot be written as typed it is only
 * read, as a text - a switch that cannot switch is a state, too:
 * - a command template other than `{{ value }}`: a typed text put into
 *   JSON would need escaping, which Home Assistant does not do either;
 * - a `pattern`: Home Assistant checks it before it sends, a device does
 *   not run a regular expression, and sending what HA would refuse is
 *   worse than not sending (the same choice as a lock with a code).
 */
function textFieldPart(config: Json): PartResult {
  const t = partTopics(config, { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" })
  if ("skipped" in t) return t
  const onlyRead = (reason: string | undefined): PartResult =>
    t.read ? { control: { kind: "text", read: t.read } } : reason ? { skipped: reason } : undefined
  if (!t.write || !t.send) return onlyRead(t.writeRefused)
  if (t.templated) return onlyRead("the command template")
  if (typeof config.pattern === "string" && config.pattern !== "") return onlyRead("a pattern")
  const bound = (value: unknown, fallback: number) => Math.max(0, Math.min(TEXT_FIELD_MAX_LENGTH, Math.trunc(num(value, fallback))))
  const maxLength = Math.max(1, bound(config.max, TEXT_FIELD_MAX_LENGTH))
  const minLength = Math.min(maxLength, bound(config.min, 0))
  return {
    control: {
      kind: "text-field",
      ...(t.read ? { read: t.read } : {}),
      write: t.write,
      minLength,
      maxLength,
      ...(config.mode === "password" ? { hidden: true as const } : {}),
    },
  }
}

/**
 * An MQTT time (time.py): set on the device's picker and sent as Home
 * Assistant writes one, `HH:MM:00`, read back from its state topic. A
 * command template other than `{{ value }}` leaves it read only, as a
 * text: what it would put around the time is not the device's to know.
 */
function timeFieldPart(config: Json): PartResult {
  const t = partTopics(config, { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" })
  if ("skipped" in t) return t
  const onlyRead = (reason: string | undefined): PartResult =>
    t.read ? { control: { kind: "text", read: t.read } } : reason ? { skipped: reason } : undefined
  if (!t.write || !t.send) return onlyRead(t.writeRefused)
  if (t.templated) return onlyRead("the command template")
  return { control: { kind: "time-field", ...(t.read ? { read: t.read } : {}), write: t.write } }
}

function textPart(config: Json, keys: PartKeys): PartResult {
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  return t.read ? { control: { kind: "text", read: t.read } } : undefined
}

/**
 * A press that publishes `payload`; none where the payload is null, as Home
 * Assistant drops the feature. `value`: what its command template is given,
 * where that is not the payload - a valve's position, a number.
 */
function buttonPart(config: Json, keys: PartKeys, payload: string | null, value?: Value): PartResult {
  if (payload === null) return undefined
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  if (!t.write || !t.send) return t.writeRefused ? { skipped: t.writeRefused } : undefined
  const sent = t.send(value ?? payload)
  if ("refused" in sent) return { skipped: sent.refused }
  return { control: { kind: "button", write: t.write, payload: sent.payload } }
}

/** A value only read. */
function valuePart(config: Json, keys: PartKeys, unit: string | undefined, level: boolean): PartResult {
  const t = partTopics(config, { ...keys, scalable: true })
  if ("skipped" in t) return t
  return t.read
    ? { control: { kind: "value", read: t.read, ...(unit ? { unit } : {}), level, ...(t.decimals !== undefined ? { decimals: t.decimals } : {}), ...(t.scale ? { scale: t.scale } : {}) } }
    : undefined
}

// The sensor device classes whose state is not a number - Home Assistant's
// NON_NUMERIC_DEVICE_CLASSES (homeassistant/components/sensor/const.py,
// https://www.home-assistant.io/integrations/sensor/#device-class). Every
// other one measures something.
const NON_NUMERIC_DEVICE_CLASSES = new Set(["date", "enum", "timestamp"])

/**
 * Whether Home Assistant takes a sensor's state for a number: only when its
 * config says so - a unit, a state class, or a device class that measures.
 * Any other sensor is text: IDs, versions, states. Until 2026-10-14 every
 * sensor was a number, and Rajiva's «Service ID», which reports
 * `CamperVan_BiberTest`, was placed as a number block (#71).
 */
export function numericSensor(config: Json): boolean {
  if (unitOf(config)) return true
  if (typeof config.state_class === "string" && config.state_class) return true
  return typeof config.device_class === "string" && !!config.device_class && !NON_NUMERIC_DEVICE_CLASSES.has(config.device_class)
}

function unitOf(config: Json): string | undefined {
  return typeof config.unit_of_measurement === "string" && config.unit_of_measurement ? config.unit_of_measurement : undefined
}

function onOff(config: Json, onKey: string, offKey: string, on: string, off: string, stateOn?: string, stateOff?: string) {
  const payloadOn = str(config[onKey], on)
  const payloadOff = str(config[offKey], off)
  return {
    on: { read: stateOn ? str(config[stateOn], payloadOn) : payloadOn, write: payloadOn },
    off: { read: stateOff ? str(config[stateOff], payloadOff) : payloadOff, write: payloadOff },
  }
}

// Home Assistant's defaults (mqtt/const.py, climate/const.py and the
// platforms' schemas, 2026-09-30).
const BRIGHTNESS_SCALE = 255
const SPEED_RANGE = { min: 1, max: 100 }
const CLIMATE_TEMPERATURE = { min: 7, max: 35, step: 1 }
const CLIMATE_MODES = ["auto", "off", "cool", "heat", "dry", "fan_only"]
// A `water_heater`'s range is 110 to 140 °F (water_heater/const.py), in its
// unit; in °C to one decimal, as its slider then steps.
const WATER_HEATER_TEMPERATURE = { F: { min: 110, max: 140, step: 1 }, C: { min: 43.3, max: 60, step: 0.1 } }
const WATER_HEATER_MODES = ["eco", "electric", "gas", "heat_pump", "high_demand", "performance", "off"]
const HUMIDITY = { min: 0, max: 100 }
const COVER_POSITION = { closed: 0, open: 100 }
const COVER_TILT = { min: 0, max: 100 }

/** A cover's payload: its own, the default where it has none, null where it drops the action. */
function coverPayload(config: Json, key: string, fallback: string): string | null {
  return config[key] === null ? null : str(config[key], fallback)
}

/**
 * A position or a tilt: a level in percent where it can be set; only read, a
 * fill - a cover's position always is one.
 */
function positionPart(config: Json, keys: PartKeys, range: { min: number; max: number }): PartResult {
  const t = partTopics(config, { ...keys, scalable: true })
  if ("skipped" in t) return t
  const scaled = t.scale ? { scale: t.scale } : {}
  const writeFormat = t.templated && t.template ? writeFormatOf(t.template, keys.variable ?? "value", 1) : undefined
  if (t.templated && !writeFormat) return t.read ? { control: { kind: "value", read: t.read, unit: "%", level: true, ...scaled } } : { skipped: "a command template" }
  if (t.write) return { control: { kind: "level", ...(t.read ? { read: t.read } : {}), write: t.write, ...range, step: 1, percent: true, ...scaled, ...needed(writeFormat) } }
  if (t.read) return { control: { kind: "value", read: t.read, unit: "%", level: true, ...scaled } }
  return t.writeRefused ? { skipped: t.writeRefused } : undefined
}

// The read templates for which `value_template` stands in where they are not
// set (VALUE_TEMPLATE_KEYS of Home Assistant's climate.py and
// water_heater.py, 2026-10-26); those of a climate it does not offer as parts
// are left out.
const VALUE_TEMPLATE_FALLBACK: Record<string, string[]> = {
  climate: [
    "current_temperature_template",
    "fan_mode_state_template",
    "mode_state_template",
    "preset_mode_value_template",
    "swing_horizontal_mode_state_template",
    "swing_mode_state_template",
    "temperature_state_template",
  ],
  water_heater: ["current_temperature_template", "mode_state_template", "temperature_state_template"],
}

/** The config with `value_template` in each read template it stands in for. */
function withValueTemplate(component: string, config: Json): Json {
  const keys = VALUE_TEMPLATE_FALLBACK[component]
  if (!keys || config.value_template === undefined) return config
  const filled: Json = { ...config }
  for (const key of keys) if (filled[key] === undefined) filled[key] = config.value_template
  return filled
}

/**
 * The parts of an entity with several controls - light, fan, climate - by
 * name, in the order a block shows them (block plan Task 4). A part none of
 * whose keys are set is absent; one that cannot be used is skipped, with
 * its reason, and the others stay.
 */
function partsOf(component: string, raw: Json): [string, PartResult][] | undefined {
  const config = withValueTemplate(component, raw)
  switch (component) {
    case "light": {
      const { on, off } = onOff(config, "payload_on", "payload_off", "ON", "OFF")
      return [
        ["Power", switchPart(config, { read: "state_topic", readTemplate: "state_value_template", write: "command_topic" }, on, off)],
        [
          "Brightness",
          levelPart(
            config,
            { read: "brightness_state_topic", readTemplate: "brightness_value_template", write: "brightness_command_topic", writeTemplate: "brightness_command_template" },
            { min: 0, max: num(config.brightness_scale, BRIGHTNESS_SCALE), step: 1 },
            undefined,
            true,
          ),
        ],
      ]
    }
    case "fan": {
      const power = onOff(config, "payload_on", "payload_off", "ON", "OFF")
      const oscillation = onOff(config, "payload_oscillation_on", "payload_oscillation_off", "oscillate_on", "oscillate_off")
      // From the coarse to the detail: on or off, the mode, then how fast.
      return [
        ["Power", switchPart(config, { read: "state_topic", readTemplate: "state_value_template", write: "command_topic", writeTemplate: "command_template" }, power.on, power.off)],
        [
          "Preset",
          choicePart(
            config,
            { read: "preset_mode_state_topic", readTemplate: "preset_mode_value_template", write: "preset_mode_command_topic", writeTemplate: "preset_mode_command_template" },
            config.preset_modes,
          ),
        ],
        [
          "Speed",
          levelPart(
            config,
            { read: "percentage_state_topic", readTemplate: "percentage_value_template", write: "percentage_command_topic", writeTemplate: "percentage_command_template" },
            { min: num(config.speed_range_min, SPEED_RANGE.min), max: num(config.speed_range_max, SPEED_RANGE.max), step: 1 },
          ),
        ],
        [
          "Direction",
          switchPart(
            config,
            { read: "direction_state_topic", readTemplate: "direction_value_template", write: "direction_command_topic", writeTemplate: "direction_command_template" },
            { read: "forward", write: "forward" },
            { read: "reverse", write: "reverse" },
          ),
        ],
        [
          "Oscillation",
          switchPart(
            config,
            { read: "oscillation_state_topic", readTemplate: "oscillation_value_template", write: "oscillation_command_topic", writeTemplate: "oscillation_command_template" },
            oscillation.on,
            oscillation.off,
          ),
        ],
      ]
    }
    case "climate": {
      const power = onOff(config, "payload_on", "payload_off", "ON", "OFF")
      const temperature = {
        min: num(config.min_temp, CLIMATE_TEMPERATURE.min),
        max: num(config.max_temp, CLIMATE_TEMPERATURE.max),
        step: num(config.temp_step, CLIMATE_TEMPERATURE.step),
      }
      // Each mode reads through `<mode>_state_template` - but the preset
      // through `preset_mode_value_template` (Home Assistant's climate.py).
      const choice = (name: string, options: unknown, readTemplate = `${name}_state_template`): PartResult =>
        choicePart(
          config,
          { read: `${name}_state_topic`, readTemplate, write: `${name}_command_topic`, writeTemplate: `${name}_command_template` },
          options,
        )
      // A climate's unit is `temperature_unit`, C or F.
      const unit = config.temperature_unit === "F" ? "°F" : config.temperature_unit === "C" ? "°C" : undefined
      return [
        ["Mode", choice("mode", config.modes ?? CLIMATE_MODES)],
        [
          "Target temperature",
          levelPart(
            config,
            { read: "temperature_state_topic", readTemplate: "temperature_state_template", write: "temperature_command_topic", writeTemplate: "temperature_command_template" },
            temperature,
            unit,
          ),
        ],
        ["Current temperature", valuePart(config, { read: "current_temperature_topic", readTemplate: "current_temperature_template" }, unit, false)],
        ["Power", switchPart(config, { write: "power_command_topic", writeTemplate: "power_command_template" }, power.on, power.off)],
        ["Preset", choice("preset_mode", config.preset_modes, "preset_mode_value_template")],
        ["Fan mode", choice("fan_mode", config.fan_modes)],
        ["Swing", choice("swing_mode", config.swing_modes)],
        ["Swing horizontal", choice("swing_horizontal_mode", config.swing_horizontal_modes)],
      ]
    }
    case "siren": {
      // Power: Home Assistant sends JSON - {"state":"ON"} - unless a command
      // template makes something else of it, given the payload and whichever
      // of tone, duration and volume were asked for. The off command takes
      // command_off_template, else command_template (siren.py). Each tone is
      // a button turning it on with that tone.
      const SIREN_VARIABLES = ["tone", "duration", "volume_level"]
      const json: Send = (value, extra) => ({ payload: JSON.stringify({ state: value, ...(extra?.tone !== undefined ? { tone: extra.tone } : {}) }) })
      const commandFor = (template: unknown) => (template === undefined ? { send: json } : commandOf(template, SIREN_VARIABLES))
      const onCommand = commandFor(config.command_template)
      const offCommand = commandFor(config.command_off_template ?? config.command_template)
      const payloadOn = str(config.payload_on, "ON")
      const payloadOff = str(config.payload_off, "OFF")
      const sentOn = "send" in onCommand ? onCommand.send(payloadOn) : onCommand
      const sentOff = "send" in offCommand ? offCommand.send(payloadOff) : offCommand
      const states = { on: str(config.state_on, payloadOn), off: str(config.state_off, payloadOff) }
      const read: PartKeys = { read: "state_topic", readTemplate: "state_value_template" }
      const command = typeof config.command_topic === "string" && config.command_topic !== "" ? config.command_topic : undefined
      // A template it cannot follow leaves it to be read, as everywhere.
      const writable = command !== undefined && "payload" in sentOn && "payload" in sentOff
      const refused = "refused" in sentOn ? sentOn.refused : "refused" in sentOff ? sentOff.refused : undefined
      const power: PartResult =
        switchPart(
          config,
          { ...read, write: writable ? "command_topic" : undefined },
          { read: states.on, write: "payload" in sentOn ? sentOn.payload : payloadOn },
          { read: states.off, write: "payload" in sentOff ? sentOff.payload : payloadOff },
        ) ?? (command && refused ? { skipped: refused } : undefined)
      const tones: string[] = Array.isArray(config.available_tones) ? config.available_tones.map((t: unknown) => str(t, "")).filter(Boolean) : []
      let tone: PartResult
      if (tones.length > 0 && command) {
        const sent = "send" in onCommand ? tones.map((t) => onCommand.send(payloadOn, { tone: t })) : [onCommand]
        const failed = sent.find((x): x is { refused: string } => "refused" in x)
        const payloads = sent.map((x) => (x as { payload: string }).payload)
        // A template that leaves the tone out would make each button the same.
        if (failed) tone = { skipped: failed.refused }
        else if (new Set(payloads).size < tones.length) tone = { skipped: "the command template leaves out the tone" }
        else tone = { control: { kind: "choice", write: command, options: payloads, labels: tones } }
      }
      return [
        ["Power", power],
        ["Tone", tone],
      ]
    }
    case "update": {
      // Its state is the installed version, or JSON with installed_version
      // and latest_version beside it (update.py). Without a template and
      // without a topic of its own for the latest version, only the JSON can
      // say both, so both are read from it; otherwise each as it comes.
      // Install only where payload_install is set: it has no default.
      const json = config.value_template === undefined && config.latest_version_topic === undefined
      const field = (name: string): PartResult => {
        const topic = config.state_topic
        return typeof topic === "string" && topic !== "" ? { control: { kind: "text", read: `${topic}#${name}` } } : undefined
      }
      const install = typeof config.payload_install === "string" ? config.payload_install : null
      return [
        ["Installed version", json ? field("installed_version") : textPart(config, { read: "state_topic", readTemplate: "value_template" })],
        ["Latest version", json ? field("latest_version") : textPart(config, { read: "latest_version_topic", readTemplate: "latest_version_template" })],
        ["Install", buttonPart(config, { write: "command_topic" }, install)],
      ]
    }
    case "humidifier": {
      // As a fan: on or off, the mode, then the humidity it aims for and the
      // one it measures (Home Assistant's humidifier.py, 0 to 100 % unless
      // its config says). Its action - humidifying, drying, idle - is left
      // out, as a climate's is.
      const power = onOff(config, "payload_on", "payload_off", "ON", "OFF")
      return [
        ["Power", switchPart(config, { read: "state_topic", readTemplate: "state_value_template", write: "command_topic", writeTemplate: "command_template" }, power.on, power.off)],
        [
          "Mode",
          choicePart(
            config,
            { read: "mode_state_topic", readTemplate: "mode_state_template", write: "mode_command_topic", writeTemplate: "mode_command_template" },
            config.modes,
          ),
        ],
        [
          "Target humidity",
          levelPart(
            config,
            {
              read: "target_humidity_state_topic",
              readTemplate: "target_humidity_state_template",
              write: "target_humidity_command_topic",
              writeTemplate: "target_humidity_command_template",
            },
            { min: num(config.min_humidity, HUMIDITY.min), max: num(config.max_humidity, HUMIDITY.max), step: 1 },
            "%",
          ),
        ],
        ["Current humidity", valuePart(config, { read: "current_humidity_topic", readTemplate: "current_humidity_template" }, "%", true)],
      ]
    }
    case "water_heater": {
      // Climate's keys, fewer of them (Home Assistant's water_heater.py).
      // Without a unit, °C: Home Assistant would take its own system's unit,
      // which the designer cannot know.
      const fahrenheit = config.temperature_unit === "F"
      const unit = fahrenheit ? "°F" : config.temperature_unit === "C" ? "°C" : undefined
      const range = fahrenheit ? WATER_HEATER_TEMPERATURE.F : WATER_HEATER_TEMPERATURE.C
      const power = onOff(config, "payload_on", "payload_off", "ON", "OFF")
      return [
        [
          "Mode",
          choicePart(
            config,
            { read: "mode_state_topic", readTemplate: "mode_state_template", write: "mode_command_topic", writeTemplate: "mode_command_template" },
            config.modes ?? WATER_HEATER_MODES,
          ),
        ],
        [
          "Target temperature",
          levelPart(
            config,
            { read: "temperature_state_topic", readTemplate: "temperature_state_template", write: "temperature_command_topic", writeTemplate: "temperature_command_template" },
            { min: num(config.min_temp, range.min), max: num(config.max_temp, range.max), step: num(config.precision, range.step) },
            unit,
          ),
        ],
        ["Current temperature", valuePart(config, { read: "current_temperature_topic", readTemplate: "current_temperature_template" }, unit, false)],
        ["Power", switchPart(config, { write: "power_command_topic", writeTemplate: "power_command_template" }, power.on, power.off)],
      ]
    }
    case "cover": {
      // The state first, beside the name; then each action on its own, so
      // one can be left out or made large; then the detail (decided
      // 2026-10-26, tasks/ha-cover-plan.md).
      const command: PartKeys = { write: "command_topic" }
      return [
        ["State", textPart(config, { read: "state_topic", readTemplate: "value_template" })],
        ["Open", buttonPart(config, command, coverPayload(config, "payload_open", "OPEN"))],
        ["Stop", buttonPart(config, command, coverPayload(config, "payload_stop", "STOP"))],
        ["Close", buttonPart(config, command, coverPayload(config, "payload_close", "CLOSE"))],
        [
          "Position",
          positionPart(
            config,
            { read: "position_topic", readTemplate: "position_template", write: "set_position_topic", writeTemplate: "set_position_template", variable: "position" },
            { min: num(config.position_closed, COVER_POSITION.closed), max: num(config.position_open, COVER_POSITION.open) },
          ),
        ],
        [
          "Tilt",
          positionPart(
            config,
            { read: "tilt_status_topic", readTemplate: "tilt_status_template", write: "tilt_command_topic", writeTemplate: "tilt_command_template", variable: "tilt_position" },
            { min: num(config.tilt_min, COVER_TILT.min), max: num(config.tilt_max, COVER_TILT.max) },
          ),
        ],
      ]
    }
    case "lock": {
      // The state on its own, a lock reports more than two (jammed,
      // locking …); Lock and Unlock as a switch; Open where its payload is
      // set, it has no default (Home Assistant's lock.py). A lock asking for
      // a code is only read: Home Assistant checks the code before it
      // sends, a button here would not.
      const coded = typeof config.code_format === "string" && config.code_format !== ""
      const command: PartKeys = coded ? {} : { write: "command_topic", writeTemplate: "command_template" }
      const open = typeof config.payload_open === "string" ? config.payload_open : null
      return [
        ["State", textPart(config, { read: "state_topic", readTemplate: "value_template" })],
        [
          "Lock",
          coded ? { skipped: "a code" } : writtenOnly(
            switchPart(
              config,
              { read: "state_topic", readTemplate: "value_template", ...command },
              { read: str(config.state_locked, "LOCKED"), write: str(config.payload_lock, "LOCK"), label: "Lock" },
              { read: str(config.state_unlocked, "UNLOCKED"), write: str(config.payload_unlock, "UNLOCK"), label: "Unlock" },
            ),
          ),
        ],
        ["Open", coded && open !== null ? { skipped: "a code" } : buttonPart(config, command, open)],
      ]
    }
    case "valve": {
      // As a cover's, but one topic each way (Home Assistant's valve.py):
      // a valve without a position is sent its payloads and reports its
      // state; one that reports a position is sent the position - Open and
      // Close the open and the closed one - and reports it on the state
      // topic, where its state is that number: no State part beside it.
      // Stop only where its payload is set, it has no default.
      const command: PartKeys = { write: "command_topic", writeTemplate: "command_template" }
      const stop = typeof config.payload_stop === "string" ? config.payload_stop : null
      if (config.reports_position === true) {
        const range = { min: num(config.position_closed, COVER_POSITION.closed), max: num(config.position_open, COVER_POSITION.open) }
        return [
          ["Open", buttonPart(config, command, String(range.max), { num: range.max, int: Number.isInteger(range.max) })],
          ["Stop", buttonPart(config, command, stop)],
          ["Close", buttonPart(config, command, String(range.min), { num: range.min, int: Number.isInteger(range.min) })],
          ["Position", positionPart(config, { read: "state_topic", readTemplate: "value_template", ...command }, range)],
        ]
      }
      return [
        ["State", textPart(config, { read: "state_topic", readTemplate: "value_template" })],
        ["Open", buttonPart(config, command, coverPayload(config, "payload_open", "OPEN"))],
        ["Stop", buttonPart(config, command, stop)],
        ["Close", buttonPart(config, command, coverPayload(config, "payload_close", "CLOSE"))],
      ]
    }
    default:
      return undefined
  }
}

/**
 * The single control of a simple component (block plan Task 3), as a part.
 */
function singlePart(component: string, config: Json): PartResult | { unknown: true } {
  const unit = unitOf(config)
  switch (component) {
    case "switch": {
      const { on, off } = onOff(config, "payload_on", "payload_off", "ON", "OFF", "state_on", "state_off")
      return switchPart(config, { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" }, on, off)
    }
    case "binary_sensor": {
      const keys: PartKeys = { read: "state_topic", readTemplate: "value_template" }
      const on = str(config.payload_on, "ON")
      const off = str(config.payload_off, "OFF")
      // A template mapping the payload onto the two: read the payload, run backwards.
      const mapped = mappedState(config, keys, on, off)
      if (mapped) return "skipped" in mapped ? mapped : { control: { kind: "state", read: mapped.read, on: mapped.on, off: mapped.off } }
      const t = partTopics(config, keys)
      if ("skipped" in t) return t
      if (!t.read) return undefined
      return { control: { kind: "state", read: t.read, on: seenInField(t.read, on), off: seenInField(t.read, off) } }
    }
    case "sensor": {
      if (numericSensor(config)) return valuePart(config, { read: "state_topic", readTemplate: "value_template" }, unit, unit === "%" || config.device_class === "battery")
      return textPart(config, { read: "state_topic", readTemplate: "value_template" })
    }
    case "number":
      return levelPart(
        config,
        { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" },
        { min: num(config.min, 1), max: num(config.max, 100), step: num(config.step, 1) },
        unit,
      )
    case "text":
      return textFieldPart(config)
    case "time":
      return timeFieldPart(config)
    case "select":
      return choicePart(config, { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" }, config.options)
    case "button":
      return buttonPart(config, { write: "command_topic", writeTemplate: "command_template" }, str(config.payload_press, "PRESS"))
    // An event: the type of the last one, from the JSON Home Assistant
    // reads it from (event.py). A value template giving that JSON from
    // deeper in the payload is not followed.
    case "event": {
      if (config.value_template !== undefined && !isPayloadTemplate(config.value_template)) return { skipped: "the value template" }
      const topic = config.state_topic
      return typeof topic === "string" && topic !== "" ? { control: { kind: "text", read: `${topic}#event_type` } } : undefined
    }
    // A scene is a press too. Its payload defaults to "ON" as the docs say;
    // scene.py itself has no default (2026-10-26).
    case "scene":
      return buttonPart(config, { write: "command_topic" }, str(config.payload_on, "ON"))
    default:
      return { unknown: true }
  }
}

// What a simple component lacks when nothing of it can be used.
const MISSING: Record<string, string> = {
  switch: "neither a state topic nor a command topic",
  binary_sensor: "no state topic",
  sensor: "no state topic",
  number: "no command topic",
  text: "no command topic",
  time: "no command topic",
  select: "no command topic",
  button: "no command topic",
  scene: "no command topic",
  event: "no state topic",
}

/**
 * What an expanded config becomes: a catalog entry, or the reason it cannot
 * be one. A `command_template` makes a part's writing unsupported, unless it
 * is `{{ value }}`, the payload as it is: what can still be read is offered
 * read-only - a switch that cannot switch is a state, a number a value. Of an entity with several parts, those that
 * cannot be used are skipped with their reason and the rest offered; only
 * when none is left is the entity unsupported.
 */
export function toCatalogEntry(discovered: DiscoveryConfig): { entry: CatalogEntry } | { unsupported: UnsupportedEntity } {
  const { component, config } = discovered
  const device = deviceOf(config)
  const base = {
    id: `${component} ${discovered.discoveryId}`,
    component,
    ...entityName(component, config, device),
    ...(device ? { device } : {}),
    ...(typeof config.unique_id === "string" && config.unique_id !== "" ? { uniqueId: config.unique_id } : {}),
  }
  const icon = typeof config.icon === "string" && config.icon.startsWith("mdi:") ? { icon: config.icon } : {}
  const unsupported = (reason: string) => ({ unsupported: { ...base, reason } })

  if (component === "light" && config.schema !== undefined && config.schema !== "basic" && config.schema !== "default") {
    return unsupported(`the light schema ${str(config.schema, "?")}`)
  }

  const parts = partsOf(component, config)
  if (parts) {
    const controls: CatalogControl[] = []
    const skipped: { part: string; reason: string }[] = []
    for (const [part, result] of parts) {
      if (!result) continue
      if ("skipped" in result) skipped.push({ part, reason: result.skipped })
      else controls.push({ ...result.control, part })
    }
    if (controls.length === 0) {
      return unsupported(skipped.length > 0 ? skipped.map((s) => `${s.part}: ${s.reason}`).join("; ") : "no part it can show")
    }
    return { entry: { ...base, ...icon, controls, ...(skipped.length > 0 ? { skipped } : {}) } }
  }

  const single = singlePart(component, config)
  if (single && "unknown" in single) return unsupported(`the component ${component}`)
  if (!single) return unsupported(MISSING[component])
  if ("skipped" in single) return unsupported(single.skipped)
  return { entry: { ...base, ...icon, controls: [single.control] } }
}

/** The catalog as the Block menu lists it: entries and what cannot be one, by device. */
export interface Catalog {
  entries: CatalogEntry[]
  unsupported: UnsupportedEntity[]
}

/** One device's entities, as a group of the menu; no device: grouped as "". */
export interface CatalogGroup {
  device: string
  entries: CatalogEntry[]
  unsupported: UnsupportedEntity[]
}

/**
 * The catalog from the retained config messages read under `prefix`
 * (block plan Task 6b): every config expanded, each entity once, in name
 * order. Block descriptions on `schaltli/blocks/<id>/config`
 * (lib/block-description.ts) are entries too, and an entry whose
 * `unique_id` a description covers is left out: the description is the
 * finished block of the same thing (docs/2026-10-04-bridge-blocks.md).
 */
export function readCatalog(
  messages: Record<string, string>,
  prefix: string = DEFAULT_DISCOVERY_PREFIX,
  blocksPrefix: string = BLOCKS_PREFIX,
): Catalog {
  const entries = new Map<string, CatalogEntry>()
  const unsupported = new Map<string, UnsupportedEntity>()
  for (const [topic, payload] of Object.entries(messages)) {
    const described = readDescription(topic, payload, blocksPrefix)
    if (described) {
      if ("entry" in described) entries.set(described.entry.id, described.entry)
      else if ("unsupported" in described) unsupported.set(described.unsupported.id, described.unsupported)
      continue
    }
    for (const config of expandConfig(topic, payload, prefix)) {
      const result = toCatalogEntry(config)
      if ("entry" in result) entries.set(result.entry.id, result.entry)
      else unsupported.set(result.unsupported.id, result.unsupported)
    }
  }
  const covered = new Set([...entries.values()].flatMap((entry) => entry.covers ?? []))
  const shown = [...entries.values()].filter((entry) => !(entry.uniqueId && covered.has(entry.uniqueId)))
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true })
  return { entries: shown.sort(byName), unsupported: [...unsupported.values()].sort(byName) }
}

/** The catalog by device, devices in name order; entities without one last. */
export function catalogGroups(catalog: Catalog): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>()
  const groupOf = (device?: { id: string; name?: string }) => {
    const name = device ? (device.name ?? device.id) : ""
    let group = groups.get(name)
    if (!group) {
      group = { device: name, entries: [], unsupported: [] }
      groups.set(name, group)
    }
    return group
  }
  for (const entry of catalog.entries) groupOf(entry.device).entries.push(entry)
  for (const entity of catalog.unsupported) groupOf(entity.device).unsupported.push(entity)
  return [...groups.values()].sort((a, b) => (a.device === "" ? 1 : b.device === "" ? -1 : a.device.localeCompare(b.device, undefined, { numeric: true })))
}

/** The topics an entry reads, without their JSON paths: what to ask the broker for examples. */
export function readTopicsOf(entries: CatalogEntry[]): string[] {
  const topics = new Set<string>()
  for (const entry of entries) {
    for (const control of entry.controls) {
      if ("read" in control && control.read) topics.add(control.read.split("#")[0])
      if (control.kind === "level" && control.current) topics.add(control.current.split("#")[0])
    }
  }
  return [...topics]
}
