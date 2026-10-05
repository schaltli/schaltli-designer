/**
 * Block descriptions, read (docs/2026-10-04-bridge-blocks.md).
 *
 * Home Assistant's discovery says what an entity is in Home Assistant's
 * terms, and that is too little for a finished block: a climate's fan modes
 * are a list of texts, and nothing says whether they are a scale. A
 * publisher that knows its device - our own bridge, or anyone - can say more
 * on a topic of Schaltli's own:
 *
 *   schaltli/blocks/<id>/config   retained JSON, an empty payload removes it
 *
 * A description says what the device is, never how it looks: which parts it
 * has, how each is read and written, its range, its words, and when it is
 * shown. Size, colour, arrangement and each part's look stay the designer's,
 * as for any Home Assistant entity (decided 2026-10-04). It becomes the same
 * CatalogEntry lib/ha-discovery.ts makes, so nothing after this file knows
 * where an entry came from.
 *
 * Keys follow Home Assistant's spelling where the meaning is the same. No
 * templates: a value is used as it is. `version` is the format's major; a
 * key this file does not know is ignored, so a minor addition never breaks
 * an older designer. Nothing here throws.
 */

import type { CatalogControl, CatalogEntry, UnsupportedEntity } from "@/lib/ha-discovery"

export const BLOCKS_PREFIX = "schaltli/blocks"
/** The format's major this designer reads. */
export const BLOCK_FORMAT_VERSION = 1

type Json = Record<string, any>

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * The description's id, or undefined for a topic that is not one. `prefix`
 * is fixed in use; tests on a shared broker each take their own.
 */
export function descriptionId(topic: string, prefix: string = BLOCKS_PREFIX): string | undefined {
  if (!topic.startsWith(`${prefix}/`)) return undefined
  return /^([a-zA-Z0-9_-]+)\/config$/.exec(topic.slice(prefix.length + 1))?.[1]
}

export type DescriptionResult = { entry: CatalogEntry } | { unsupported: UnsupportedEntity } | { removed: string }

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

function topic(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}

type Word = { value: string; label?: string; icon?: string }

/**
 * An option or payload: a plain value, or `{ value, label, icon }` - the
 * icon an Iconify name (`mdi:weather-sunny`), shown on its button.
 */
function word(value: unknown): Word | undefined {
  if (isObject(value)) {
    const v = text(value.value)
    if (v === undefined) return undefined
    const label = text(value.label)
    const icon = typeof value.icon === "string" && /^[a-z0-9-]+:[a-z0-9-]+$/i.test(value.icon) ? value.icon : undefined
    return { value: v, ...(label !== undefined && label !== "" ? { label } : {}), ...(icon ? { icon } : {}) }
  }
  const v = text(value)
  return v === undefined ? undefined : { value: v }
}

const KINDS = new Set(["switch", "state", "value", "level", "choice", "button", "text"])

/** A description's part, or why it cannot be one. */
function partOf(part: Json): { control: CatalogControl } | { skipped: string } {
  const kind = part.kind
  if (typeof kind !== "string" || !KINDS.has(kind)) return { skipped: `unknown kind "${String(kind)}"` }
  const read = topic(part.state_topic)
  const write = topic(part.command_topic)

  let control: CatalogControl
  switch (kind) {
    case "switch": {
      if (!write) return { skipped: "no command_topic" }
      const on = word(part.payload_on) ?? { value: "ON" }
      const off = word(part.payload_off) ?? { value: "OFF" }
      control = {
        kind,
        ...(read ? { read } : {}),
        write,
        on: { read: on.value, write: on.value, ...(on.label ? { label: on.label } : {}), ...(on.icon ? { icon: on.icon } : {}) },
        off: { read: off.value, write: off.value, ...(off.label ? { label: off.label } : {}), ...(off.icon ? { icon: off.icon } : {}) },
      }
      break
    }
    case "state": {
      if (!read) return { skipped: "no state_topic" }
      control = { kind, read, on: word(part.payload_on)?.value ?? "ON", off: word(part.payload_off)?.value ?? "OFF" }
      break
    }
    case "value": {
      if (!read) return { skipped: "no state_topic" }
      const unit = text(part.unit_of_measurement)
      control = { kind, read, ...(unit ? { unit } : {}), level: unit === "%" }
      break
    }
    case "level": {
      if (!write) return { skipped: "no command_topic" }
      const unit = text(part.unit_of_measurement)
      const min = num(part.min, 0)
      const max = num(part.max, 100)
      const step = num(part.step, 1)
      if (!(max > min)) return { skipped: `the range ${min}-${max}` }
      if (!(step > 0)) return { skipped: `the step ${step}` }
      // The measured value beside the setpoint `state_topic` reads.
      const current = topic(part.current_topic)
      control = { kind, ...(read ? { read } : {}), write, min, max, step, ...(unit ? { unit } : {}), ...(current ? { current } : {}) }
      break
    }
    case "text": {
      if (!read) return { skipped: "no state_topic" }
      control = { kind, read }
      break
    }
    case "choice": {
      if (!write) return { skipped: "no command_topic" }
      const options = (Array.isArray(part.options) ? part.options : []).map(word).filter((o): o is Word => !!o)
      if (options.length === 0) return { skipped: "no options" }
      const labelled = options.some((o) => o.label !== undefined)
      const iconed = options.some((o) => o.icon !== undefined)
      control = {
        kind,
        ...(read ? { read } : {}),
        write,
        options: options.map((o) => o.value),
        ...(labelled ? { labels: options.map((o) => o.label ?? o.value) } : {}),
        ...(iconed ? { icons: options.map((o) => o.icon ?? null) } : {}),
      }
      break
    }
    default: {
      if (!write) return { skipped: "no command_topic" }
      control = { kind: "button", write, payload: word(part.payload_press)?.value ?? "PRESS" }
    }
  }

  const name = text(part.name)
  if (name) control.part = name
  if (part.shown_when !== undefined) {
    const when = part.shown_when
    const whenTopic = isObject(when) ? topic(when.topic) : undefined
    const values = isObject(when) && Array.isArray(when.values) ? when.values.map(text).filter((v): v is string => v !== undefined) : []
    if (!whenTopic || values.length === 0) return { skipped: "shown_when needs a topic and values" }
    control.shownWhen = { topic: whenTopic, values }
  }
  const section = text(part.section)
  if (section) control.section = section
  // Two columns for a wide screen (docs/2026-10-05-autoterm-block.md).
  const column = num(part.column, 0)
  if (column === 1 || column === 2) control.column = column
  return { control }
}

/**
 * One retained message on `schaltli/blocks/<id>/config`: an entry, the
 * reason it cannot be one, or its removal. Undefined for any other topic.
 */
export function readDescription(topicName: string, payload: string, prefix: string = BLOCKS_PREFIX): DescriptionResult | undefined {
  const id = descriptionId(topicName, prefix)
  if (id === undefined) return undefined
  const entryId = `block ${id}`
  if (payload.trim() === "") return { removed: entryId }

  let json: unknown
  try {
    json = JSON.parse(payload)
  } catch {
    return { unsupported: { id: entryId, component: "block", name: id, label: id, reason: "not JSON" } }
  }
  if (!isObject(json)) return { unsupported: { id: entryId, component: "block", name: id, label: id, reason: "not a JSON object" } }

  const name = text(json.name) || id
  const device = isObject(json.device) ? deviceOf(json.device) : undefined
  const base = { id: entryId, component: "block", name, label: name, ...(device ? { device } : {}) }
  const unsupported = (reason: string): DescriptionResult => ({ unsupported: { ...base, reason } })

  const version = num(json.version, NaN)
  if (version !== BLOCK_FORMAT_VERSION) {
    return unsupported(Number.isFinite(version) ? `format version ${version}; this designer reads ${BLOCK_FORMAT_VERSION}` : "no format version")
  }

  const controls: CatalogControl[] = []
  const skipped: { part: string; reason: string }[] = []
  const parts = Array.isArray(json.parts) ? json.parts : []
  parts.forEach((part: unknown, i: number) => {
    const label = (isObject(part) && text(part.name)) || `part ${i + 1}`
    if (!isObject(part)) {
      skipped.push({ part: label, reason: "not an object" })
      return
    }
    const result = partOf(part)
    if ("skipped" in result) skipped.push({ part: label, reason: result.skipped })
    else controls.push(result.control)
  })
  if (controls.length === 0) {
    return unsupported(skipped.length > 0 ? skipped.map((s) => `${s.part}: ${s.reason}`).join("; ") : "no parts")
  }

  const icon = typeof json.icon === "string" && json.icon.startsWith("mdi:") ? { icon: json.icon } : {}
  const covers = (Array.isArray(json.covers) ? json.covers : []).filter((c: unknown): c is string => typeof c === "string" && c !== "")
  return {
    entry: {
      ...base,
      ...icon,
      controls,
      ...(skipped.length > 0 ? { skipped } : {}),
      ...(covers.length > 0 ? { covers } : {}),
    },
  }
}

/** A Home Assistant style device: its first identifier, and its name. */
function deviceOf(device: Json): { id: string; name?: string } | undefined {
  const ids = (Array.isArray(device.identifiers) ? device.identifiers : [device.identifiers]).filter(
    (id: unknown): id is string => typeof id === "string" && id !== "",
  )
  if (ids.length === 0) return undefined
  return { id: ids[0], ...(typeof device.name === "string" && device.name ? { name: device.name } : {}) }
}
