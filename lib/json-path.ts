/**
 * JSON field access using JSONPath's shorthand member/index syntax (RFC
 * 9535) - a real *subset* of JSONPath, not a look-alike invented syntax:
 * every path this accepts ("temp", "$.temp", "nested.temp",
 * "readings[0].value", "['odd key.with.dots']") is also valid, standard
 * JSONPath that a real JSONPath engine would evaluate identically. What's
 * intentionally NOT implemented is the rest of the query language -
 * wildcards (*), recursive descent (..), filter expressions (?()), slices
 * (start:end:step), unions - none of which a "pull one named field out of
 * a flat sensor payload" use case needs, and none of which has a
 * well-maintained ESP32/Arduino implementation to build on anyway
 * (researched: ArduinoJson's own JSONPath support request, upstream issue
 * #821, is still open/unimplemented; the one alternative with path-style
 * access, FirebaseJson, would just be a second JSON parser pulled in for
 * the same member/index capability ArduinoJson already provides).
 *
 * The leading "$" (root) is optional - "temp" and "$.temp" resolve
 * identically - so existing short paths keep working while a
 * copy-pasted real JSONPath expression also just works.
 *
 * Both sides (this file and MqttEPaperDisplay2's ProjectLoader.cpp) must
 * parse this identically, or a value that looks right in the designer's
 * preview could resolve to something else on the real device.
 */

type PathSegment = { type: "member"; name: string } | { type: "index"; index: number }

// Tokenizes a JSONPath shorthand expression into member/index segments.
// Handles three segment forms: ".name" (bare dot access), "[N]" (array
// index), and "['name']"/"[\"name\"]" (quoted member access - the escape
// hatch for a key containing a dot, space, or other character a bare
// ".name" can't express unambiguously). A leading "$" is stripped if
// present; the very first segment may also omit its own leading "." (so
// "temp" parses the same as ".temp" or "$.temp").
function tokenizePath(path: string): PathSegment[] {
  let s = path.trim()
  if (s.startsWith("$")) s = s.slice(1)

  const segments: PathSegment[] = []
  let i = 0

  while (i < s.length) {
    if (s[i] === ".") {
      i++
      let name = ""
      while (i < s.length && s[i] !== "." && s[i] !== "[") {
        name += s[i]
        i++
      }
      if (name) segments.push({ type: "member", name })
    } else if (s[i] === "[") {
      const closeIndex = s.indexOf("]", i)
      if (closeIndex === -1) break // malformed - stop parsing, resolve what we have so far
      const inner = s.slice(i + 1, closeIndex).trim()
      const quoted = (inner.startsWith("'") && inner.endsWith("'")) || (inner.startsWith('"') && inner.endsWith('"'))
      if (quoted) {
        segments.push({ type: "member", name: inner.slice(1, -1) })
      } else {
        segments.push({ type: "index", index: Number.parseInt(inner, 10) })
      }
      i = closeIndex + 1
    } else {
      // Bare leading name with no "." or "$" prefix - the ergonomic
      // shorthand this app's paths have always used ("temp" instead of
      // requiring "$.temp" or ".temp").
      let name = ""
      while (i < s.length && s[i] !== "." && s[i] !== "[") {
        name += s[i]
        i++
      }
      if (name) segments.push({ type: "member", name })
    }
  }

  return segments
}

// Walks `value` along `path`. Returns undefined if the path doesn't
// resolve (missing field, index out of range, or indexing into a
// non-object/non-array) rather than throwing - a malformed or stale path
// is a configuration problem to surface as "no value", not a crash.
export function getJsonPathValue(value: unknown, path: string): unknown {
  if (!path) return value

  let current: unknown = value

  for (const segment of tokenizePath(path)) {
    if (current === null || current === undefined) return undefined

    if (segment.type === "member") {
      if (typeof current !== "object" || Array.isArray(current)) return undefined
      current = (current as Record<string, unknown>)[segment.name]
    } else {
      if (!Array.isArray(current)) return undefined
      current = current[segment.index]
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
