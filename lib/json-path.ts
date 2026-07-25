/**
 * Minimal dot-path JSON field access - deliberately NOT a JSONPath
 * implementation (no wildcards, filters, recursive descent, `$` root).
 * Researched and confirmed there's no well-maintained JSONPath library for
 * ESP32/Arduino either (see MqttEPaperDisplay2's ProjectLoader.cpp for the
 * mirrored C++ version), so this stays intentionally simple: a
 * dot-separated chain of field names, each optionally followed by one or
 * more `[N]` array indices, e.g. "temp", "nested.temp", "readings[0].value".
 * Both sides must agree on this syntax exactly, or a value that looks right
 * in the designer's preview could resolve to something else on the real
 * device.
 */

// Splits a single path segment like "readings[0][1]" into its field name
// ("readings", possibly empty for a leading bare index) and its array
// indices ([0, 1]).
function parseSegment(segment: string): { field: string; indices: number[] } {
  const indices: number[] = []
  let field = segment
  const bracketMatch = field.match(/^([^\[]*)((?:\[\d+\])*)$/)
  if (bracketMatch) {
    field = bracketMatch[1]
    const indexMatches = bracketMatch[2].matchAll(/\[(\d+)\]/g)
    for (const m of indexMatches) {
      indices.push(Number.parseInt(m[1], 10))
    }
  }
  return { field, indices }
}

// Walks `value` along `path` (e.g. "nested.temp" or "readings[0].value").
// Returns undefined if the path doesn't resolve (missing field, index out
// of range, or attempting to index into a non-object/non-array) rather
// than throwing - a malformed or stale path is a configuration problem to
// surface as "no value", not a crash.
export function getJsonPathValue(value: unknown, path: string): unknown {
  if (!path) return value

  let current: unknown = value
  const segments = path.split(".")

  for (const rawSegment of segments) {
    if (current === null || current === undefined) return undefined

    const { field, indices } = parseSegment(rawSegment)

    if (field) {
      if (typeof current !== "object" || Array.isArray(current)) return undefined
      current = (current as Record<string, unknown>)[field]
    }

    for (const index of indices) {
      if (!Array.isArray(current)) return undefined
      current = current[index]
    }
  }

  return current
}

// Parses `jsonText` and extracts `path`, formatting the result the same way
// a real MQTT payload value is used elsewhere in the app: strings, numbers,
// and booleans become their plain text representation; objects/arrays
// (a path that stops partway through a nested structure) are JSON-
// stringified rather than yielding "[object Object]"; a parse failure or
// unresolved path returns undefined.
export function extractJsonField(jsonText: string, path: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return undefined
  }

  const value = getJsonPathValue(parsed, path)
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

// Splits a composite "<topic>#<path>" string into its parts. `path` is ""
// when there's no "#" (a plain, non-JSON topic reference) - matches
// ProjectLoader::getTopicValue's split on the firmware side exactly.
export function splitTopicPath(composite: string): { topic: string; path: string } {
  const hashIndex = composite.indexOf("#")
  if (hashIndex === -1) return { topic: composite, path: "" }
  return { topic: composite.slice(0, hashIndex), path: composite.slice(hashIndex + 1) }
}
