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
 * a tank, a relay and a pump are all just their component.
 */
export interface CatalogEntry {
  /** Component and discovery id: unique per broker. */
  id: string
  component: string
  /** As Home Assistant names it: the device's name and the entity's. */
  name: string
  /** The config's `mdi:…` icon, if it names one. */
  icon?: string
  /** The device, for grouping: its first identifier, and its name. */
  device?: { id: string; name?: string }
  controls: CatalogControl[]
}

export type CatalogControl =
  /** Two states read and written: a switch. */
  | { kind: "switch"; read?: string; write: string; on: { read: string; write: string }; off: { read: string; write: string } }
  /** Two states only read: shown as text. */
  | { kind: "state"; read: string; on: string; off: string }
  /** A value only read, with its unit; `level` when it reads as a fill (%, battery). */
  | { kind: "value"; read: string; unit?: string; level: boolean }
  /** A number set by a finger, within min and max in steps. */
  | { kind: "level"; read?: string; write: string; min: number; max: number; step: number; unit?: string }
  /** One of its options, read and written: a button group, one button each. */
  | { kind: "choice"; read?: string; write: string; options: string[] }
  /** A press that publishes one payload. */
  | { kind: "button"; write: string; payload: string }

/** An entity the Block menu lists but cannot place, and why. */
export interface UnsupportedEntity {
  id: string
  component: string
  name: string
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
function entityName(component: string, config: Json, device: { name?: string } | undefined): string {
  let own: string | null
  if ("name" in config) own = typeof config.name === "string" ? config.name : null
  else if (NAMED_BY_DEVICE_CLASS.has(component) && typeof config.device_class === "string") {
    const words = config.device_class.replace(/_/g, " ")
    own = words.charAt(0).toUpperCase() + words.slice(1)
  } else own = DEFAULT_NAMES[component] ?? component
  const parts = [device?.name, own].filter((p): p is string => typeof p === "string" && p !== "")
  return parts.length > 0 ? parts.join(" ") : component
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
 * What an expanded config becomes: a catalog entry, or the reason it cannot
 * be one. The six simple components here (Task 3); light, fan and climate
 * follow (Task 4). A `command_template` makes the writing half unsupported:
 * what can still be read is offered read-only - a switch that cannot switch
 * is a state, a number a value.
 */
export function toCatalogEntry(discovered: DiscoveryConfig): { entry: CatalogEntry } | { unsupported: UnsupportedEntity } {
  const { component, config } = discovered
  const device = deviceOf(config)
  const base = {
    id: `${component} ${discovered.discoveryId}`,
    component,
    name: entityName(component, config, device),
    ...(device ? { device } : {}),
  }
  const icon = typeof config.icon === "string" && config.icon.startsWith("mdi:") ? { icon: config.icon } : {}
  const entry = (...controls: CatalogControl[]) => ({ entry: { ...base, ...icon, controls } })
  const unsupported = (reason: string) => ({ unsupported: { ...base, reason } })

  const read = binding(config.state_topic, config.value_template)
  if (read && "unsupported" in read) return unsupported(read.unsupported)
  const readTopic = read?.read
  const write = typeof config.command_topic === "string" && config.command_topic !== "" ? config.command_topic : undefined
  const writeRefused = write && config.command_template !== undefined ? "a command template" : undefined
  const unit = typeof config.unit_of_measurement === "string" && config.unit_of_measurement ? config.unit_of_measurement : undefined

  switch (component) {
    case "switch": {
      const payloadOn = str(config.payload_on, "ON")
      const payloadOff = str(config.payload_off, "OFF")
      const on = { read: str(config.state_on, payloadOn), write: payloadOn }
      const off = { read: str(config.state_off, payloadOff), write: payloadOff }
      if (write && !writeRefused) return entry({ kind: "switch", ...(readTopic ? { read: readTopic } : {}), write, on, off })
      if (readTopic) return entry({ kind: "state", read: readTopic, on: on.read, off: off.read })
      return unsupported(writeRefused ?? "neither a state topic nor a command topic")
    }
    case "binary_sensor":
      if (!readTopic) return unsupported("no state topic")
      return entry({ kind: "state", read: readTopic, on: str(config.payload_on, "ON"), off: str(config.payload_off, "OFF") })
    case "sensor":
      if (!readTopic) return unsupported("no state topic")
      return entry({ kind: "value", read: readTopic, ...(unit ? { unit } : {}), level: unit === "%" || config.device_class === "battery" })
    case "number":
      if (write && !writeRefused) {
        return entry({
          kind: "level",
          ...(readTopic ? { read: readTopic } : {}),
          write,
          min: num(config.min, 1),
          max: num(config.max, 100),
          step: num(config.step, 1),
          ...(unit ? { unit } : {}),
        })
      }
      if (readTopic) return entry({ kind: "value", read: readTopic, ...(unit ? { unit } : {}), level: false })
      return unsupported(writeRefused ?? "no command topic")
    case "select": {
      const options = Array.isArray(config.options) ? config.options.map((o: unknown) => str(o, "")).filter(Boolean) : []
      // As many buttons as options: whether a wide group fits a screen is the
      // placing's to say, not a reason to leave the entity out (user,
      // 2026-10-01 - the spec's limit of four was dropped).
      if (options.length === 0) return unsupported("no options")
      if (write && !writeRefused) return entry({ kind: "choice", ...(readTopic ? { read: readTopic } : {}), write, options })
      return unsupported(writeRefused ?? "no command topic")
    }
    case "button":
      if (!write) return unsupported("no command topic")
      if (writeRefused) return unsupported(writeRefused)
      return entry({ kind: "button", write, payload: str(config.payload_press, "PRESS") })
    default:
      return unsupported(`the component ${component}`)
  }
}
