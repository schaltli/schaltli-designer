import { splitTopicPath } from "@/lib/json-path"
import { referencedTopics } from "@/lib/placeholders"

// The project's topics nothing reads or writes - for «Remove unused topics»
// (Settings › Topics). Tester Arno, 2026-10-09: «Discover MQTT Topics» had
// every topic it found selected, «Add Selected Topics» took 293 into his
// project, and the only way out was a Delete button per topic.
//
// Used is anything the project names a topic in, found by walking all of
// it rather than by listing today's properties, so a binding added later is
// not mistaken for unused:
//
//   - any property whose key ends in "topic" (topic, writeTopic,
//     setpointTopic, an action's topic, ...), anywhere in an object, a
//     screen, a hardware button or a block;
//   - a live value's or a combined topic's source in the "topic" namespace;
//   - a `{topic:…}` placeholder in any text;
//   - a topic another topic's mock responses (`mock`) write to, when that topic is
//     itself used.
//
// A binding to a JSON field ("<topic>#<path>") uses its topic.

type Json = unknown

function walk(value: Json, found: Set<string>, key = ""): void {
  if (typeof value === "string") {
    if (/topics?$/i.test(key) && value) found.add(splitTopicPath(value).topic)
    if (value.includes("{topic:")) for (const t of referencedTopics(value)) found.add(splitTopicPath(t).topic)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found, key)
    return
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, Json>
    if (obj.namespace === "topic" && typeof obj.path === "string" && obj.path) found.add(splitTopicPath(obj.path).topic)
    for (const [k, v] of Object.entries(obj)) walk(v, found, k)
  }
}

export function usedTopics(project: {
  topics?: { topic: string; mock?: Json }[]
  screens?: Json[]
  hardwareButtons?: Json[]
  combinedTopics?: Json[]
}): Set<string> {
  const found = new Set<string>()
  walk(project.screens ?? [], found)
  walk(project.hardwareButtons ?? [], found)
  walk(project.combinedTopics ?? [], found)
  // A used command topic's mock responses keep the topics they answer on -
  // until nothing new turns up.
  let size = -1
  while (found.size !== size) {
    size = found.size
    for (const t of project.topics ?? []) if (found.has(t.topic) && t.mock) walk(t.mock, found)
  }
  return found
}

/** The project's topics nothing uses, in the project's order. */
export function unusedTopics<T extends { topic: string }>(project: {
  topics?: T[]
  screens?: Json[]
  hardwareButtons?: Json[]
  combinedTopics?: Json[]
}): T[] {
  const used = usedTopics(project as Parameters<typeof usedTopics>[0])
  return (project.topics ?? []).filter((t) => !used.has(t.topic))
}
