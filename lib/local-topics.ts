import type { Topic } from "@/components/project-editor"
import { splitTopicPath } from "@/lib/json-path"

// Local topics (docs/2026-10-13-local-topics.md): a topic declared with
// `local: true` is kept by the display itself - never published, never
// subscribed. Whether a name is one is decided by its declaration alone
// (decision 1), so a real topic can never be taken for a local one by its
// name, and a name nobody declared is never local.

export function isLocalTopic(topics: readonly Topic[] | undefined, name: string | undefined): boolean {
  if (!name) return false
  const bare = splitTopicPath(name).topic
  return (topics ?? []).some((t) => t.local === true && t.topic === bare)
}

// The value each local topic starts with: its `initial`, where it has one.
export function localInitialValues(topics: readonly Topic[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const t of topics ?? []) if (t.local === true && t.topic && t.initial !== undefined && t.initial !== "") out[t.topic] = t.initial
  return out
}
