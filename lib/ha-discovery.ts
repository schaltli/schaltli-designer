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
 * object's own number format.
 */
export type TemplateRead = { path: string } | { unsupported: string }

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
  while (src[i] === "|") {
    i++
    skip()
    const filter = word()
    if (!HARMLESS_FILTERS.has(filter)) return { unsupported: `the filter ${filter || rest(i)}` }
    skip()
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
  return { path: root === "value" ? "" : formatPath(segments) }
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
   * says where its value is not the word to show (a block description's).
   */
  | {
      kind: "switch"
      read?: string
      write: string
      on: { read: string; write: string; label?: string }
      off: { read: string; write: string; label?: string }
    }
  /** Two states only read: shown as text. */
  | { kind: "state"; read: string; on: string; off: string }
  /** A value only read, with its unit; `level` when it reads as a fill (%, device class battery). */
  | { kind: "value"; read: string; unit?: string; level: boolean }
  /** A number set by a finger, within min and max in steps. */
  | { kind: "level"; read?: string; write: string; min: number; max: number; step: number; unit?: string }
  /**
   * One of its options, read and written: a button group, one button each.
   * `labels`, beside `options` and as long, are the buttons' words where the
   * values are not (a block description's).
   */
  | { kind: "choice"; read?: string; write: string; options: string[]; labels?: string[] }
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

/** A topic and a template as one Schaltli binding, or why they cannot be. */
function binding(topic: unknown, template: unknown): { read: string } | { unsupported: string } | undefined {
  if (typeof topic !== "string" || topic === "") return undefined
  const read = readPath(typeof template === "string" ? template : undefined)
  if ("unsupported" in read) return { unsupported: `the value template: ${read.unsupported}` }
  return { read: read.path ? `${topic}#${read.path}` : topic }
}

/**
 * One part of an entity, as the keys of its config name it: where it is read
 * (a topic and its template), where it is written (a topic and the command
 * template that would make writing unsupported).
 */
interface PartKeys {
  read?: string
  readTemplate?: string
  write?: string
  writeTemplate?: string
}

/** A part made, a part that cannot be, or no part at all (none of its keys set). */
type PartResult = { control: CatalogControl } | { skipped: string } | undefined

/** What the keys of one part give: the topics, or why they cannot be used. */
function partTopics(config: Json, keys: PartKeys): { read?: string; write?: string; writeRefused?: string } | { skipped: string } {
  const read = keys.read ? binding(config[keys.read], keys.readTemplate ? config[keys.readTemplate] : undefined) : undefined
  if (read && "unsupported" in read) return { skipped: read.unsupported }
  const topic = keys.write ? config[keys.write] : undefined
  const write = typeof topic === "string" && topic !== "" ? topic : undefined
  const writeRefused = write && keys.writeTemplate && config[keys.writeTemplate] !== undefined ? "a command template" : undefined
  return { ...(read ? { read: read.read } : {}), ...(write && !writeRefused ? { write } : {}), ...(writeRefused ? { writeRefused } : {}) }
}

/** Two states: a switch where it can be written, a state where it can only be read. */
function switchPart(config: Json, keys: PartKeys, on: { read: string; write: string }, off: { read: string; write: string }): PartResult {
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  if (t.write) return { control: { kind: "switch", ...(t.read ? { read: t.read } : {}), write: t.write, on, off } }
  if (t.read) return { control: { kind: "state", read: t.read, on: on.read, off: off.read } }
  return t.writeRefused ? { skipped: t.writeRefused } : undefined
}

/** A number: a level where it can be written, a value where it can only be read. */
function levelPart(config: Json, keys: PartKeys, range: { min: number; max: number; step: number }, unit?: string): PartResult {
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  const withUnit = unit ? { unit } : {}
  if (t.write) return { control: { kind: "level", ...(t.read ? { read: t.read } : {}), write: t.write, ...range, ...withUnit } }
  if (t.read) return { control: { kind: "value", read: t.read, ...withUnit, level: false } }
  return t.writeRefused ? { skipped: t.writeRefused } : undefined
}

/** One of several options, read and written. */
function choicePart(config: Json, keys: PartKeys, options: unknown): PartResult {
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  if (!t.write) return t.writeRefused ? { skipped: t.writeRefused } : undefined
  const list = Array.isArray(options) ? options.map((o: unknown) => str(o, "")).filter(Boolean) : []
  // As many buttons as options: whether a wide group fits a screen is the
  // placing's to say, not a reason to leave the entity out (user,
  // 2026-10-01 - the spec's limit of four was dropped).
  if (list.length === 0) return { skipped: "no options" }
  return { control: { kind: "choice", ...(t.read ? { read: t.read } : {}), write: t.write, options: list } }
}

/** A value only read. */
function valuePart(config: Json, keys: PartKeys, unit: string | undefined, level: boolean): PartResult {
  const t = partTopics(config, keys)
  if ("skipped" in t) return t
  return t.read ? { control: { kind: "value", read: t.read, ...(unit ? { unit } : {}), level } } : undefined
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

/**
 * The parts of an entity with several controls - light, fan, climate - by
 * name, in the order a block shows them (block plan Task 4). A part none of
 * whose keys are set is absent; one that cannot be used is skipped, with
 * its reason, and the others stay.
 */
function partsOf(component: string, config: Json): [string, PartResult][] | undefined {
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
      const t = partTopics(config, { read: "state_topic", readTemplate: "value_template" })
      if ("skipped" in t) return t
      if (!t.read) return undefined
      return { control: { kind: "state", read: t.read, on: str(config.payload_on, "ON"), off: str(config.payload_off, "OFF") } }
    }
    case "sensor":
      return valuePart(config, { read: "state_topic", readTemplate: "value_template" }, unit, unit === "%" || config.device_class === "battery")
    case "number":
      return levelPart(
        config,
        { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" },
        { min: num(config.min, 1), max: num(config.max, 100), step: num(config.step, 1) },
        unit,
      )
    case "select":
      return choicePart(config, { read: "state_topic", readTemplate: "value_template", write: "command_topic", writeTemplate: "command_template" }, config.options)
    case "button": {
      const t = partTopics(config, { write: "command_topic", writeTemplate: "command_template" })
      if ("skipped" in t) return t
      if (!t.write) return t.writeRefused ? { skipped: t.writeRefused } : undefined
      return { control: { kind: "button", write: t.write, payload: str(config.payload_press, "PRESS") } }
    }
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
  select: "no command topic",
  button: "no command topic",
}

/**
 * What an expanded config becomes: a catalog entry, or the reason it cannot
 * be one. A `command_template` makes a part's writing unsupported: what can
 * still be read is offered read-only - a switch that cannot switch is a
 * state, a number a value. Of an entity with several parts, those that
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
    }
  }
  return [...topics]
}
