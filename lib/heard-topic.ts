import { flattenJsonFields, type FlattenedJsonField } from "@/lib/json-path"

// What the designer keeps of one topic it heard on the broker
// (docs/2026-10-14-topic-discovery.md, decision 2): the latest message
// always, the last few to step through, and what they say about the topic.
// Pure - the store (lib/broker-store.ts) and «Listen to Broker» build on it.

/** How many messages a topic keeps to step through (decided 2026-10-14: 20 or fewer). */
export const KEPT_MESSAGES = 20

// A JSON topic's fields are merged across messages, because publishers
// legitimately vary their payload shape (optional fields, per-mode extra
// keys), and binding a field should not depend on which message happened
// to be sampled first. Unbounded merging is the risk on the other side - a
// topic keyed by a timestamp or device id would grow one field per message
// forever - so only a message that brings a field not seen before is kept
// as an example, and after this many the topic counts as characterized.
export const MAX_JSON_EXAMPLES = 10

export type HeardType = "numeric" | "text" | "json"

export interface HeardMessage {
  payload: string
  /** Milliseconds since the epoch, when it arrived. */
  at: number
  retained: boolean
}

export interface HeardTopic {
  topic: string
  /** Newest first, at most KEPT_MESSAGES. messages[0] is the latest. */
  messages: HeardMessage[]
  count: number
  /**
   * True once a message came with the retain flag: the broker delivered it
   * on subscribe as the topic's current value, not something that happened
   * to be published while listening. Kept once set - only a cleared
   * retained message could take it back, which listening cannot see.
   */
  retained: boolean
  type: HeardType
  /** A JSON topic's examples: the messages that brought a field not seen before. */
  jsonExamples: string[]
  /** A JSON topic's fields, merged across its messages. */
  fields: FlattenedJsonField[]
}

/** What a payload looks like: structured JSON, a number, or text. */
export function payloadType(payload: string): HeardType {
  const trimmed = payload.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      // A bare number or string parses too ("23" -> 23); only a structured
      // payload counts as JSON.
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === "object" && parsed !== null) return "json"
    } catch {
      // Not JSON - a number or text below.
    }
  }
  const num = Number(payload)
  return trimmed !== "" && !isNaN(num) && isFinite(num) ? "numeric" : "text"
}

// JSON wins once seen (a topic that ever sent structured JSON stays JSON
// rather than flip-flopping on a stray plain message); otherwise numeric
// only ever upgrades to text.
function mergedType(was: HeardType, now: HeardType): HeardType {
  if (was === now) return was
  if (was === "json" || now === "json") return "json"
  return "text"
}

function mergeJson(payload: string, examples: string[], fields: FlattenedJsonField[]): { examples: string[]; fields: FlattenedJsonField[] } | null {
  if (examples.length >= MAX_JSON_EXAMPLES) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  const known = new Set(fields.map((f) => f.path))
  const added = flattenJsonFields(parsed).filter((f) => !known.has(f.path))
  if (added.length === 0) return null
  return { examples: [...examples, payload], fields: [...fields, ...added] }
}

/** The topic after one more message. `prev` undefined: its first. */
export function heardMessage(topic: string, prev: HeardTopic | undefined, payload: string, retained: boolean, at: number): HeardTopic {
  const message: HeardMessage = { payload, at, retained }
  const type = prev ? mergedType(prev.type, payloadType(payload)) : payloadType(payload)
  const json = type === "json" ? mergeJson(payload, prev?.jsonExamples ?? [], prev?.fields ?? []) : null
  return {
    topic,
    messages: [message, ...(prev?.messages ?? [])].slice(0, KEPT_MESSAGES),
    count: (prev?.count ?? 0) + 1,
    retained: (prev?.retained ?? false) || retained,
    type,
    jsonExamples: json?.examples ?? prev?.jsonExamples ?? [],
    fields: json?.fields ?? prev?.fields ?? [],
  }
}
