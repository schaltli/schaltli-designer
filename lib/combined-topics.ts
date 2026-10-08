// Combined topics: a topic the project defines and the device computes - yes
// when all, or any, of its conditions apply (docs/2026-10-07-live-values.md,
// decisions 10-15). A condition may read another combined topic, so they nest
// by name; a circular reference is refused, and so is more than 8 levels.
//
// Written to be ported, like lib/live-value.ts; the cases are in
// lib/live-value/vectors.json («combined»).

import { matches, type RuleOperator, type Source } from "@/lib/live-value"

export interface CombinedCondition {
  source: Source
  op: RuleOperator
  operand?: string
}

export interface CombinedTopic {
  id: string
  /** What a live value reads it as: `combined:<name>`. */
  name: string
  mode: "all" | "any"
  conditions: CombinedCondition[]
}

/** More levels than this, and the export refuses: what a device recomputes per message stays small. */
export const MAX_COMBINED_DEPTH = 8

/** What a combined topic reads as, as any topic value: "true", "false", or undefined for no value yet. */
export type CombinedValue = "true" | "false" | undefined

function combinedUses(ct: CombinedTopic): string[] {
  const names: string[] = []
  for (const c of ct.conditions) if (c.source.namespace === "combined" && !names.includes(c.source.path)) names.push(c.source.path)
  return names
}

/**
 * The combined topics in the order they are computed - each after everything
 * it uses - or the circular reference that makes an order impossible, as the
 * chain of names it runs through, starting and ending at the first by name
 * («glaette → nass → glaette»). `tooDeep` names the first that is more than
 * MAX_COMBINED_DEPTH levels deep. A name nothing defines is left to read as
 * no value yet.
 */
export function evaluationOrder(cts: readonly CombinedTopic[]): { order: CombinedTopic[]; circular?: string[]; tooDeep?: string } {
  const byName = new Map(cts.map((ct) => [ct.name, ct] as const))
  const order: CombinedTopic[] = []
  const state = new Map<string, "visiting" | "done">()
  const depth = new Map<string, number>()
  let circular: string[] | undefined

  const visit = (name: string, path: string[]): void => {
    if (circular) return
    const ct = byName.get(name)
    if (!ct) return
    if (state.get(name) === "done") return
    if (state.get(name) === "visiting") {
      const cycle = path.slice(path.indexOf(name))
      // The same cycle reads the same whichever topic the walk began at.
      let start = 0
      for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[start]) start = i
      const rotated = [...cycle.slice(start), ...cycle.slice(0, start)]
      circular = [...rotated, rotated[0]]
      return
    }
    state.set(name, "visiting")
    let deepest = 0
    for (const used of combinedUses(ct)) {
      visit(used, [...path, name])
      if (circular) return
      deepest = Math.max(deepest, depth.get(used) ?? 0)
    }
    state.set(name, "done")
    depth.set(name, deepest + 1)
    order.push(ct)
  }
  for (const ct of cts) visit(ct.name, [])
  if (circular) return { order: [], circular }
  const tooDeep = order.find((ct) => (depth.get(ct.name) ?? 0) > MAX_COMBINED_DEPTH)?.name
  return tooDeep ? { order, tooDeep } : { order }
}

/**
 * One combined topic from the values its conditions read: «any» is yes as
 * soon as one condition is yes, «all» is no as soon as one is no; otherwise
 * no value until every source has one. No conditions: no value.
 */
export function evaluateCombined(ct: CombinedTopic, read: (source: Source) => string | undefined): CombinedValue {
  if (ct.conditions.length === 0) return undefined
  let unknown = false
  for (const condition of ct.conditions) {
    const value = read(condition.source)
    if (value === undefined) {
      unknown = true
      continue
    }
    const yes = matches(value, condition.op, condition.operand)
    if (ct.mode === "any" && yes) return "true"
    if (ct.mode === "all" && !yes) return "false"
  }
  if (unknown) return undefined
  return ct.mode === "any" ? "false" : "true"
}

/**
 * Every combined topic's value, computed in evaluation order from `topic`
 * values (`path`, a JSON field after `#` included). Nothing is computed
 * where there is a circular reference.
 */
export function computeCombined(cts: readonly CombinedTopic[], topic: (path: string) => string | undefined): Map<string, CombinedValue> {
  const values = new Map<string, CombinedValue>()
  const { order, circular } = evaluationOrder(cts)
  if (circular) return values
  const read = (source: Source) =>
    source.namespace === "combined" ? values.get(source.path) : source.namespace === "topic" ? topic(source.path) : undefined
  for (const ct of order) values.set(ct.name, evaluateCombined(ct, read))
  return values
}

/**
 * The combined topics that read `name` - directly or through others - in
 * evaluation order: what a message on it makes the device recompute.
 * `namespace` "topic" asks after a topic (a `#` field counts as its topic).
 */
export function dependentsOf(cts: readonly CombinedTopic[], name: string, namespace: "combined" | "topic" = "combined"): string[] {
  const { order } = evaluationOrder(cts)
  const affected = new Set<string>()
  const reads = (source: Source) =>
    source.namespace === "combined"
      ? affected.has(source.path) || (namespace === "combined" && source.path === name)
      : namespace === "topic" && source.namespace === "topic" && source.path.split("#")[0] === name
  for (const ct of order) if (ct.conditions.some((c) => reads(c.source))) affected.add(ct.name)
  return order.filter((ct) => affected.has(ct.name)).map((ct) => ct.name)
}

interface ProjectLike {
  combinedTopics?: CombinedTopic[]
  screens?: { name: string; objects?: ObjectLike[]; iconLive?: { source?: Source } }[]
}
interface ObjectLike {
  type: string
  properties?: Record<string, any>
  children?: ObjectLike[]
}

// Every object, and a screen's live icon as the icon object it amounts to
// (lib/screen-icon.ts) - its live value the screen's own, so a rename
// reaches it.
function forEachObject(project: ProjectLike, visit: (obj: ObjectLike, screen: { name: string }) => void) {
  for (const screen of project.screens ?? []) {
    if (screen.iconLive) visit({ type: "screen-icon", properties: { liveValues: [screen.iconLive] } }, screen)
    const walk = (objects: ObjectLike[]) => {
      for (const obj of objects) {
        visit(obj, screen)
        if (obj.children?.length) walk(obj.children)
      }
    }
    walk(screen.objects ?? [])
  }
}

const readsCombined = (source: Source | undefined, name: string) => source?.namespace === "combined" && source.path === name

/**
 * What reads a combined topic: texts (named by their text, a chip as "…"),
 * icons, and other combined topics - so one still in use is not deleted and
 * the refusal says where.
 */
export function combinedUsage(project: ProjectLike, name: string): string[] {
  const users: string[] = []
  forEachObject(project, (obj, screen) => {
    const liveValues: { source?: Source }[] = Array.isArray(obj.properties?.liveValues) ? obj.properties!.liveValues : []
    if (!liveValues.some((lv) => readsCombined(lv.source, name))) return
    if (obj.type === "screen-icon") users.push(`the screen icon of ${screen.name}`)
    else if (obj.type === "icon") users.push(`an icon on ${screen.name}`)
    else {
      const text = String(obj.properties?.text ?? "").replace(/\{live:[^}]*\}/g, "…").replace(/\{\{/g, "{").replace(/\}\}/g, "}")
      users.push(`"${text}" on ${screen.name}`)
    }
  })
  for (const ct of project.combinedTopics ?? []) {
    if (ct.name !== name && ct.conditions.some((c) => readsCombined(c.source, name))) users.push(`combined ${ct.name}`)
  }
  return users
}

/** The project with a combined topic renamed, every live value and condition reading it along. A copy. */
export function renameCombined<T extends ProjectLike>(project: T, from: string, to: string): T {
  const copy = structuredClone(project)
  const rename = (source: Source | undefined) => {
    if (readsCombined(source, from)) source!.path = to
  }
  for (const ct of copy.combinedTopics ?? []) {
    if (ct.name === from) ct.name = to
    ct.conditions.forEach((c) => rename(c.source))
  }
  forEachObject(copy, (obj) => {
    if (Array.isArray(obj.properties?.liveValues)) obj.properties!.liveValues.forEach((lv: { source?: Source }) => rename(lv.source))
  })
  return copy
}

/**
 * The combined topics a condition of `name` may read: not itself, and none
 * that reads it, directly or through others - either would close a circular
 * reference. In the list's order.
 */
export function combinedReadableFrom(cts: readonly CombinedTopic[], name: string): string[] {
  const readers = new Set(dependentsOf(cts, name))
  return cts.map((ct) => ct.name).filter((n) => n !== name && !readers.has(n))
}

/**
 * Refuses an export the device could not compute: a circular reference, or
 * more than MAX_COMBINED_DEPTH levels. The message names the chain and says
 * where to break it.
 */
export function assertCombinedExportable(project: { combinedTopics?: CombinedTopic[] }): void {
  const { circular, tooDeep } = evaluationOrder(project.combinedTopics ?? [])
  if (circular) throw new Error(`Circular reference among combined topics: ${circular.join(" → ")}. Break it in Project Settings › Topics.`)
  if (tooDeep) throw new Error(`The combined topic ${tooDeep} is more than ${MAX_COMBINED_DEPTH} levels deep.`)
}
