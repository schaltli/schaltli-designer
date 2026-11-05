/**
 * «Convert to» (docs/2026-11-05-quick-blocks.md): an object turned into the
 * other type of its family, after it was placed - a block comes in its first
 * look, and this is how it gets another.
 *
 * Three families, two types each:
 * - a level a finger sets: Slider ↔ Dial
 * - a level to read: Bar ↔ Gauge
 * - on or off: Switch ↔ Button Group - a Button Group only with two states
 *   becomes a Switch (decided 2026-11-05: what is on or off is two).
 *
 * What the object is bound to stays: its id (a Knob binding, a reference to
 * it), its topics, range, step, calibration, send-as, the value shown, its
 * colours and font - the two types of a family keep these under the same
 * keys. What only one of the two has is the new type's default, as its tool
 * would place it. Free on a screen it keeps its top-left corner and gets
 * the new type's natural size for its width. Pure.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { controlMinWidth, levelAcross, snapDiameter } from "@/lib/size-scale"
import { levelThickness } from "@/lib/level-shape"
import { isSnapTable } from "@/lib/snap-table"
import { layoutObjects, type LayoutScale } from "@/lib/layout"
import { paddingOf } from "@/lib/dock"
import { cardLookOf } from "@/lib/card"

export type ConvertibleType = "slider" | "dial" | "bar" | "gauge" | "switch" | "button-group"

const PARTNER: Record<ConvertibleType, ConvertibleType> = {
  slider: "dial",
  dial: "slider",
  bar: "gauge",
  gauge: "bar",
  switch: "button-group",
  "button-group": "switch",
}

export interface ConvertTarget {
  type: ConvertibleType
  /** Why it cannot be had, when it cannot: shown greyed with this. */
  disabled?: string
}

/** Why `object` cannot become `type` on its own terms; undefined when it can. */
function refusal(object: ScreenObject, type: ConvertibleType): string | undefined {
  if (object.type === "button-group" && type === "switch") {
    const n = (object.properties.states ?? []).length
    if (n !== 2) return `Only a group of two becomes a switch; this has ${n}`
  }
  return undefined
}

/**
 * The types `object` can be converted to - its family's other one - each
 * greyed with the reason where it cannot: the loaded device does not draw
 * it, or a button group has more than two states. Empty for a type with no
 * family.
 */
export function convertTargets(object: ScreenObject, supportedObjectTypes?: readonly string[]): ConvertTarget[] {
  const type = PARTNER[object.type as ConvertibleType]
  if (!type) return []
  const own = refusal(object, type)
  if (own) return [{ type, disabled: own }]
  if (supportedObjectTypes && !supportedObjectTypes.includes(type)) return [{ type, disabled: "Not rendered by the loaded device's firmware" }]
  return [{ type }]
}

// The shape a ring is given by its tool (project-editor.tsx, the gauge
// tool; lib/bausteine.ts arcObject): 270 degrees, the gap at the bottom.
const RING_SHAPE = { minAngle: 225, maxAngle: 135, direction: "cw" }

function withoutKeys(properties: Record<string, any>, keys: string[]): Record<string, any> {
  const out = { ...properties }
  for (const key of keys) delete out[key]
  return out
}

// A switch draws the state that counts as on in colour; a button group has
// no such state. Kept when the group had it from a switch before; else the
// state whose word says on, or the second - a block's states come off, on.
function withOnState(states: any[]): any[] {
  if (states.some((s) => s.showAsOn === true)) return states
  const named = states.findIndex((s) => /^(on|true|1|an|ein|open|auf)$/i.test(String(s.readValue ?? s.label ?? "").trim()))
  const on = named >= 0 ? named : states.length - 1
  return states.map((s, i) => ({ ...s, showAsOn: i === on }))
}

/**
 * `object` as `type`, with the same id. The size is the free object's: the
 * same top-left corner, the new type's natural size for the old width - a
 * ring as wide as the bar was, a bar or slider as deep as its track needs,
 * a switch or group at its height and at least as wide as its labels.
 * undefined when `type` is not among its targets or is refused.
 */
export function convertObject(object: ScreenObject, type: ConvertibleType, fonts: readonly ProjectFont[] = []): ScreenObject | undefined {
  if (PARTNER[object.type as ConvertibleType] !== type || refusal(object, type)) return undefined
  const p = object.properties ?? {}
  switch (type) {
    case "dial":
    case "gauge": {
      const properties = { ...p, ...RING_SHAPE }
      const side = snapDiameter(object.width, levelThickness({ ...object, properties }))
      return { ...object, type, width: side, height: side, properties }
    }
    case "slider":
    case "bar": {
      const properties = { ...withoutKeys(p, ["minAngle", "maxAngle"]), direction: "left-to-right" }
      const next: ScreenObject = { ...object, type, properties }
      return { ...next, height: levelAcross(next, fonts) }
    }
    case "switch": {
      const next: ScreenObject = { ...object, type, properties: { ...p, states: withOnState(p.states ?? []) } }
      return { ...next, width: Math.max(object.width, Math.ceil(controlMinWidth(next, object.height, fonts))) }
    }
    case "button-group": {
      const next: ScreenObject = { ...object, type }
      return { ...next, width: Math.max(object.width, Math.ceil(controlMinWidth(next, object.height, fonts))) }
    }
  }
}

// The block's dial in a row of several parts (lib/bausteine.ts, the level
// control): six lines of its font, as a row's height alone gave too little.
const CELL_RING_LINES = 6

/** How tall a card is where it ends with what it holds: its content's bottom and its padding. */
function contentHeight(card: ScreenObject, scale: LayoutScale): number {
  const [laid] = layoutObjects([{ ...card, height: 100000 }], scale)
  const bottom = Math.max(0, ...(laid.children ?? []).map((c) => c.y + c.height))
  return bottom + Math.round(paddingOf(laid) * scale.pixelsPerMm)
}

// The path from the top of `objects` down to `id`, the object last.
function pathTo(objects: ScreenObject[], id: string): ScreenObject[] | undefined {
  for (const obj of objects) {
    if (obj.id === id) return [obj]
    const below = obj.children?.length ? pathTo(obj.children, id) : undefined
    if (below) return [obj, ...below]
  }
  return undefined
}

function replaced(objects: ScreenObject[], path: ScreenObject[], at: number, next: ScreenObject): ScreenObject[] {
  return objects.map((o) => {
    if (o !== path[at]) return o
    if (at === path.length - 1) return next
    return { ...o, children: replaced(o.children ?? [], path, at + 1, next) }
  })
}

/**
 * The object `id` in `objects`, at any depth, converted to `type`, the rest
 * as it was - undefined when it cannot be. In a table's cell it is sized as
 * a block builds that look for a cell: a ring six lines of its font across,
 * a bar or slider at the cell's width (the table gives it that); the row
 * follows when the table is laid out. A card that ended where its content
 * did ends there again, shorter or taller - a card given a height of its
 * own keeps it.
 */
export function convertInTree(objects: ScreenObject[], id: string, type: ConvertibleType, scale: LayoutScale): ScreenObject[] | undefined {
  const path = pathTo(objects, id)
  if (!path) return undefined
  const object = path[path.length - 1]
  const fonts = scale.fonts ?? []
  let next = convertObject(object, type, fonts)
  if (!next) return undefined
  const parent = path[path.length - 2]
  if (parent && isSnapTable(parent) && (type === "dial" || type === "gauge")) {
    const size = fonts.find((f) => f.id === next!.properties.fontId)?.size ?? 14
    const side = snapDiameter(Math.round(CELL_RING_LINES * size), levelThickness(next))
    next = { ...next, width: side, height: side }
  }
  // Which cards end with their content, asked before the change.
  const hugging = new Set(path.slice(0, -1).filter((o) => o.type === "free" && cardLookOf(o) && Math.abs(contentHeight(o, scale) - o.height) <= 1).map((o) => o.id))
  let tree = replaced(objects, path, 0, next)
  // Innermost first: an outer card measures the inner one as it now is.
  for (const card of [...path.slice(0, -1)].reverse()) {
    if (!hugging.has(card.id)) continue
    const now = pathTo(tree, card.id)!
    const current = now[now.length - 1]
    tree = replaced(tree, now, 0, { ...current, height: contentHeight(current, scale) })
  }
  return tree
}
