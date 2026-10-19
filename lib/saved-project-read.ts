// Reads a saved project's newest version from /api/projects/<name>, telling
// apart a project that is not there from one whose download broke off. A
// large project (a few MB of fonts and images) over a weak link - the van's
// router on a poor WiFi or mobile connection - can be cut mid-body; the
// response was 200 then, and only reading its body fails (2026-10-19).

export type SavedProjectData = { name: string; versionId: string; savedAt: string; project: unknown }

export type SavedProjectRead = { data: SavedProjectData } | { missing: true } | { broken: true }

export async function readSavedProject(name: string): Promise<SavedProjectRead> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(name)}`)
    if (res.status === 404) return { missing: true }
    if (!res.ok) return { broken: true }
    return { data: (await res.json()) as SavedProjectData }
  } catch {
    return { broken: true }
  }
}

// What the start page or the toast says when a read gave no project.
export function couldNotOpen(name: string, read: { missing: true } | { broken: true }): string {
  return "missing" in read
    ? `No project "${name}"`
    : `"${name}" could not be loaded: the connection broke off. Try again.`
}
