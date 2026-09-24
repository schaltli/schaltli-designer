// The rule for project names (docs/2026-09-23-explicit-save.md, "Names").
// A project's name is its folder name on disk, on the Pi and on the Windows
// machines it is developed on, so a name has to be a valid folder name on
// both. Shared by the Save dialog, which shows the reason inline, and the
// server, which decides - one function, so the dialog can never accept what
// the server refuses.

export const MAX_PROJECT_NAME_LENGTH = 80

export type ProjectNameCheck = { ok: true; name: string } | { ok: false; reason: string }

const FORBIDDEN_CHARACTERS = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"]

// Windows refuses these as a file or folder name, with or without an
// extension ("nul.txt" is as reserved as "NUL").
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

// The spelling a name is stored under: trimmed, and in NFC so that "ü" typed
// on one system and on another end up as the same folder.
export function cleanProjectName(raw: string): string {
  return raw.trim().normalize("NFC")
}

// What two names are compared by. Case is ignored everywhere, also on the
// case-sensitive Pi, so "Van Knob" and "van knob" can never both exist.
export function projectNameKey(name: string): string {
  return cleanProjectName(name).toLowerCase()
}

export function sameProjectName(a: string, b: string): boolean {
  return projectNameKey(a) === projectNameKey(b)
}

// Reasons are shown to the user as they are, so they are English like the
// rest of the designer's UI. A name is refused rather than rewritten: the
// folder must be called exactly what the project list shows.
export function checkProjectName(raw: string): ProjectNameCheck {
  const name = cleanProjectName(raw)
  if (name.length === 0) return { ok: false, reason: "Enter a name." }
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    return { ok: false, reason: `Use at most ${MAX_PROJECT_NAME_LENGTH} characters.` }
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, reason: "Remove the control characters." }
  const forbidden = FORBIDDEN_CHARACTERS.find((c) => name.includes(c))
  if (forbidden) return { ok: false, reason: `A name cannot contain ${forbidden}` }
  if (name === "." || name === "..") return { ok: false, reason: "Choose a name other than . or .." }
  if (name.endsWith(".")) return { ok: false, reason: "A name cannot end with a dot." }
  if (WINDOWS_RESERVED.test(name)) return { ok: false, reason: `"${name}" is reserved by Windows.` }
  return { ok: true, name }
}
