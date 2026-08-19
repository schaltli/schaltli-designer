// The one version number in this system - see docs/nested-provenance.md's
// "Version compatibility". It replaces three independently-bumped
// `schemaVersion` integers (the editable project file, the device export,
// and the DDF), which is the arrangement that let DDF 1.7 and 1.9 ship a
// file-format break on the *capability* axis instead, where no reader was
// gated on it. One number, one place, so there is no "which one do I bump"
// question left to get wrong.
//
// - `major` is bumped when a reader on the other side of the change would
//   **silently produce something wrong**, rather than failing cleanly or
//   degrading gracefully. Default to major: only a new *optional* field, or
//   a new value in a list that already has a skip-or-default convention,
//   may be called a minor. See "What counts as a major bump" for the
//   worked examples.
// - `minor` is additive by definition and never needs a migration in
//   either direction - "unknown type -> skip and log" and "missing field ->
//   default" already cover it, which is what makes a 7.13 device able to
//   run a 7.14 project.
export const SYSTEM_GENERATION = { major: 1, minor: 0 } as const

export const SYSTEM_GENERATION_STRING = `${SYSTEM_GENERATION.major}.${SYSTEM_GENERATION.minor}`

export interface Generation {
  major: number
  minor: number
}

const IMPLICIT: Generation = { major: 1, minor: 0 }

/**
 * Reads a `systemGeneration` field.
 *
 * Absent or unparseable is 1.0 - the implicit generation every artifact
 * written before this field existed carries. Lacking the field *is* the
 * signal that a file predates it, and there is no generation below 1 to
 * distinguish that from, so this defaults rather than throwing. A bare
 * number is accepted as `major.0` so `2` and `"2.0"` mean the same thing.
 */
export function parseGeneration(raw: unknown): Generation {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { major: Math.trunc(raw), minor: 0 }
  }
  if (typeof raw !== "string") return IMPLICIT
  const match = raw.trim().match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) return IMPLICIT
  return { major: Number(match[1]), minor: match[2] === undefined ? 0 : Number(match[2]) }
}

export function formatGeneration(generation: Generation): string {
  return `${generation.major}.${generation.minor}`
}

/**
 * True when this app can correctly read an artifact of that generation.
 *
 * Only `major` is compared: a *newer minor* is readable by construction,
 * since minor changes are additive and the skip/default conventions
 * already handle the parts this app doesn't know about. An *older* major
 * is accepted here too - whether it then needs a migration is a separate,
 * per-case question (docs/nested-provenance.md's "Upgrade scripts"), not a
 * readability one.
 */
export function isReadableGeneration(raw: unknown): boolean {
  return parseGeneration(raw).major <= SYSTEM_GENERATION.major
}

/**
 * Throws a message meant to be shown to a human when an artifact is from a
 * newer major than this app understands.
 *
 * A clean refusal is not half an answer - for most artifacts it is the
 * whole one (edit the source, re-fetch, or redeploy), so the message has
 * to say what to do rather than only what went wrong.
 */
export function assertReadableGeneration(raw: unknown, artifactDescription: string): void {
  const generation = parseGeneration(raw)
  if (generation.major > SYSTEM_GENERATION.major) {
    throw new Error(
      `This ${artifactDescription} is system generation ${formatGeneration(generation)}, ` +
        `which is newer than this app understands (${SYSTEM_GENERATION_STRING}) - ` +
        `update the app before opening it.`,
    )
  }
}
