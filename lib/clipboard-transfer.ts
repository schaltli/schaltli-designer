// Copy and paste between projects (2026-10-11): what is copied goes to the
// system's clipboard as text, with everything it needs from its project -
// the icons and images it shows, the fonts it is written in, the topics it
// reads and writes, the combined topics it asks -, so it can be pasted into
// another project, in another tab or another designer: the demo's «Energie»
// into a VanPi's own project.
//
// Until then the clipboard lived in the editor's memory: a copy reached no
// other tab, and an object pasted into another project would have pointed at
// icons and combined topics that project did not have.
//
// Merging into the project it is pasted into keeps what is there: an icon,
// font, topic or combined topic already there under the same id or name and
// the same content is used as it is; one that differs comes in beside it
// under a new id or name, and the pasted objects are pointed at that.

import type { Project, ProjectAsset, ProjectFont, ProjectScreen, ScreenObject, Topic } from "@/components/project-editor"
import type { CombinedTopic } from "@/lib/combined-topics"
import { withFreshIds } from "@/lib/object-groups"

/** The mark a clipboard text carries, so any other text is left alone. */
export const CLIPBOARD_MARK = "schaltli-clipboard"
export const CLIPBOARD_VERSION = 1

export interface ClipboardPayload {
  schaltli: typeof CLIPBOARD_MARK
  version: number
  /** Which copy this is, so a tab pasting its own copy can tell. */
  token: string
  /** The size of the screen it was made for. */
  screenWidth: number
  screenHeight: number
  objects?: ScreenObject[]
  screen?: ProjectScreen
  assets: ProjectAsset[]
  fonts: ProjectFont[]
  topics: Topic[]
  combinedTopics: CombinedTopic[]
}

type Json = unknown

/** Every string in `value`, with the key it stands under. */
function strings(value: Json, visit: (key: string, s: string) => void, key = ""): void {
  if (typeof value === "string") visit(key, value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, visit, key))
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, visit, k)
}

/** Every live value's source in `value`. */
function sources(value: Json, visit: (source: { namespace: string; path: string }) => void): void {
  if (Array.isArray(value)) value.forEach((v) => sources(v, visit))
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    if (typeof o.namespace === "string" && typeof o.path === "string") visit(o as { namespace: string; path: string })
    for (const v of Object.values(o)) sources(v, visit)
  }
}

/** A deep copy of `value` with every string `rename` changes changed, the key it stands under given. */
function renamed<T>(value: T, rename: (key: string, s: string) => string, key = ""): T {
  if (typeof value === "string") return rename(key, value) as T
  if (Array.isArray(value)) return value.map((v) => renamed(v, rename, key)) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = renamed(v, rename, k)
    return out as T
  }
  return value
}

// The keys a topic stands under in an object, a live value or a condition.
// An energy diagram's storage reads its charge from `chargeTopic`.
const TOPIC_KEYS = new Set(["topic", "writeTopic", "path", "chargeTopic"])

/** A topic as the project lists it: without a JSON field after `#`. */
const bareTopic = (t: string) => t.split("#")[0]

/** What `what` needs from `project`: the assets, fonts, topics and combined topics it names. */
function needs(what: Json, project: Project) {
  const assetIds = new Set(project.assets.map((a) => a.id))
  const fontIds = new Set(project.fonts.map((f) => f.id))
  const topicNames = new Set(project.topics.map((t) => t.topic))
  const combinedByName = new Map((project.combinedTopics ?? []).map((c) => [c.name, c]))

  const assets = new Set<string>()
  const fonts = new Set<string>()
  const topics = new Set<string>()
  const combined = new Set<string>()
  const look = (value: Json) => {
    strings(value, (key, s) => {
      if (assetIds.has(s)) assets.add(s)
      if (fontIds.has(s)) fonts.add(s)
      if (TOPIC_KEYS.has(key) && topicNames.has(bareTopic(s))) topics.add(bareTopic(s))
    })
    sources(value, (source) => {
      if (source.namespace === "combined" && combinedByName.has(source.path)) combined.add(source.path)
    })
  }
  look(what)
  // A combined topic asks topics and other combined topics, which come too.
  const seen = new Set<string>()
  for (let pending = [...combined]; pending.length > 0; ) {
    const name = pending.pop()!
    if (seen.has(name)) continue
    seen.add(name)
    const before = new Set(combined)
    const ct = combinedByName.get(name)!
    look([ct.conditions, ct.scale ?? null])
    for (const c of combined) if (!before.has(c)) pending.push(c)
  }
  return {
    assets: project.assets.filter((a) => assets.has(a.id)),
    fonts: project.fonts.filter((f) => fonts.has(f.id)),
    topics: project.topics.filter((t) => topics.has(t.topic)),
    combinedTopics: (project.combinedTopics ?? []).filter((c) => combined.has(c.name)),
  }
}

/** The clipboard text for objects of `project` (kept at their place on the screen) or for one of its screens. */
export function packClipboard(project: Project, what: { objects: ScreenObject[] } | { screen: ProjectScreen }, token: string): string {
  const payload: ClipboardPayload = {
    schaltli: CLIPBOARD_MARK,
    version: CLIPBOARD_VERSION,
    token,
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    ...("objects" in what ? { objects: what.objects } : { screen: what.screen }),
    ...needs("objects" in what ? what.objects : what.screen, project),
  }
  return JSON.stringify(payload)
}

/** The payload in a clipboard text, or null for any other text. */
export function unpackClipboard(text: string | null | undefined): ClipboardPayload | null {
  if (!text || !text.includes(CLIPBOARD_MARK)) return null
  try {
    const payload = JSON.parse(text)
    if (payload?.schaltli !== CLIPBOARD_MARK || typeof payload.version !== "number" || payload.version > CLIPBOARD_VERSION) return null
    if (!payload.objects && !payload.screen) return null
    return {
      ...payload,
      assets: payload.assets ?? [],
      fonts: payload.fonts ?? [],
      topics: payload.topics ?? [],
      combinedTopics: payload.combinedTopics ?? [],
    }
  } catch {
    return null
  }
}

/** A name not among `taken`: `base`, else `base 2`, `base 3`… (`sep` between). */
function unique(base: string, taken: Set<string>, sep = " "): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}${sep}${n}`)) return `${base}${sep}${n}`
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * `project` with what `payload` needs merged in, and how the payload's ids
 * and names are called there: an asset or font id, a combined topic's name.
 */
export function mergeNeeds(project: Project, payload: ClipboardPayload): { project: Project; rename: (key: string, s: string) => string } {
  const assetIds = new Map<string, string>()
  const fontIds = new Map<string, string>()
  const combinedNames = new Map<string, string>()

  const assets = [...project.assets]
  for (const asset of payload.assets) {
    const twin = assets.find((a) => a.data === asset.data && a.type === asset.type)
    if (twin) {
      assetIds.set(asset.id, twin.id)
      continue
    }
    const id = unique(asset.id, new Set(assets.map((a) => a.id)), "-")
    assets.push({ ...asset, id })
    assetIds.set(asset.id, id)
  }

  const fonts = [...project.fonts]
  for (const font of payload.fonts) {
    // A device's own fonts share their ids between projects of the same
    // device; one the project has under that id is the one to use.
    if (fonts.some((f) => f.id === font.id)) continue
    fonts.push(font)
  }

  const topics = [...project.topics]
  for (const topic of payload.topics) {
    if (topics.some((t) => t.topic === topic.topic)) continue
    topics.push({ ...topic, id: unique(topic.id, new Set(topics.map((t) => t.id)), "-") })
  }

  // Names first, for every combined topic, so a condition naming another
  // can be renamed with it.
  const combined = [...(project.combinedTopics ?? [])]
  const incoming: CombinedTopic[] = []
  for (const c of payload.combinedTopics) {
    const there = combined.find((x) => x.name === c.name)
    if (there && same(there.mode, c.mode) && same(there.conditions, c.conditions) && same(there.scale, c.scale)) {
      combinedNames.set(c.name, c.name)
      continue
    }
    const name = unique(c.name, new Set([...combined, ...incoming].map((x) => x.name)), "_")
    combinedNames.set(c.name, name)
    incoming.push({ ...c, name })
  }

  const rename = (key: string, s: string) => {
    if (assetIds.has(s)) return assetIds.get(s)!
    if (key === "path" && combinedNames.has(s)) return combinedNames.get(s)!
    return s
  }
  for (const c of incoming) {
    const id = unique(c.id, new Set(combined.map((x) => x.id)), "-")
    combined.push({ ...c, id, conditions: renameSources(c.conditions, combinedNames), ...(c.scale ? { scale: renameSources(c.scale, combinedNames) } : {}) })
  }

  return { project: { ...project, assets, fonts, topics, combinedTopics: combined }, rename }
}

/** Conditions with every combined topic they ask renamed as `names` says. */
function renameSources<T>(value: T, names: Map<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => renameSources(v, names)) as T
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) out[k] = renameSources(v, names)
    if (o.namespace === "combined" && typeof o.path === "string" && names.has(o.path)) out.path = names.get(o.path)
    return out as T
  }
  return value
}

/** Objects of a payload, renamed into the project they are pasted into. */
export function pastedObjects(payload: ClipboardPayload, rename: (key: string, s: string) => string): ScreenObject[] {
  return renamed(payload.objects ?? [], rename)
}

/**
 * `project` with the payload's screen added after `afterScreenId`: a new id
 * and a name of its own, fresh object ids, the project's master if it had
 * one, and what it needs merged in. Returns the project and the new screen.
 */
export function pasteScreen(project: Project, payload: ClipboardPayload, afterScreenId?: string): { project: Project; screen: ProjectScreen } {
  const { project: merged, rename } = mergeNeeds(project, payload)
  const source = renamed(payload.screen!, rename)
  let nextId = merged.nextId
  const objects = source.objects.map((obj) => {
    const fresh = withFreshIds(obj, nextId)
    nextId = fresh.nextId
    return fresh.object
  })
  const masters = merged.screens.filter((s) => s.isMaster)
  const master = source.isMaster ? undefined : masters[0]?.id
  const ids = new Set(merged.screens.map((s) => s.id))
  const screen: ProjectScreen = {
    ...source,
    id: unique(`screen-${nextId++}`, ids, "-"),
    name: unique(source.name, new Set(merged.screens.map((s) => s.name))),
    objects,
    masterScreenId: master,
  }
  if (!master) delete screen.masterScreenId
  // Drawn in the project's own look: its master's theme, not the one the
  // screen had where it came from - a theme for a colour panel on e-paper.
  if (!screen.isMaster) delete screen.themeId
  const at = afterScreenId ? merged.screens.findIndex((s) => s.id === afterScreenId) : -1
  const screens = [...merged.screens]
  screens.splice(at >= 0 ? at + 1 : screens.length, 0, screen)
  return { project: { ...merged, nextId, screens }, screen }
}
