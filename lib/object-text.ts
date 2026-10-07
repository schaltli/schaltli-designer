// What an object's text reads (docs/2026-10-07-live-values.md): kept apart
// from lib/render-screen.ts so the text renderer, which render-screen itself
// draws with, can use it without importing render-screen back.

import type { ScreenObject } from "@/components/project-editor"
import { resolveIn, type PlaceholderScope } from "@/lib/placeholders"
import { resolveLiveText, type LiveValue } from "@/lib/live-value"

// An object's live values (docs/2026-10-07-live-values.md, decision 17).
export function liveValuesOf(obj: ScreenObject): LiveValue[] {
  const list = obj.properties?.liveValues
  return Array.isArray(list) ? (list as LiveValue[]) : []
}

// A text as drawn: through its live values where it has them, else through
// the placeholders it may still carry (until migrateProject turns them into
// live values). Without a scope a placeholder is drawn as written and a live
// value as before anything arrived.
export function objectText(obj: ScreenObject, text: string, scope?: PlaceholderScope): string {
  const liveValues = liveValuesOf(obj)
  if (liveValues.length === 0) return resolveIn(text, scope)
  const lookup = (source: LiveValue["source"]) =>
    scope && source.namespace !== "combined" ? scope.lookup({ namespace: source.namespace, path: source.path }) : undefined
  return resolveLiveText(text, liveValues, lookup, scope?.separators ?? { decimal: ".", thousands: "'" })
}
