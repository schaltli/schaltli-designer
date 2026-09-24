// Server-side project storage (docs/2026-09-23-explicit-save.md, "Server
// storage"). Projects behave like files in one flat folder: a project is a
// folder named exactly like the project, holding one slim version per save.
//
//   <root>/projects/<name>/versions/<versionId>.json
//   <root>/projects/<name>/deploys.json
//   <root>/by-instance/<instanceId>.json   { name }
//   <root>/blobs/<sha256>
//
// Two things drive the shape. The Pi runs from an SD card in a van: a save
// must write kilobytes, not the 3.4 MB of fonts and DDF a project carries
// (hence blobs, written once), and a power cut must never leave a broken
// file (hence writeFileAtomic everywhere). Server-only - node:fs.

import { createHash, randomBytes } from "node:crypto"
import { mkdir, open, readdir, readFile, rename, rm, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { isValidInstanceId } from "./deploy-utils"
import { checkProjectName, projectNameKey } from "./project-name"

export const STORE_FORMAT = 1
export const MAX_VERSIONS_KEPT = 20
// Payloads at or below this stay inline: a tiny SVG icon is not worth a file.
const BLOB_THRESHOLD = 4096
// A blob this young may belong to a save still in flight - its version not
// written yet - so orphan removal leaves it for the next round.
const BLOB_GRACE_MS = 60_000
const VERSION_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z(-\d{3})?$/
const BLOB_ID = /^[0-9a-f]{64}$/

export type ProjectStoreErrorCode = "invalid-name" | "taken" | "not-found" | "invalid-version" | "invalid-instance"

export class ProjectStoreError extends Error {
  constructor(
    public readonly code: ProjectStoreErrorCode,
    message: string,
    // For "taken": the existing project's spelling, which may differ from
    // the one asked for in case or spacing.
    public readonly existingName?: string,
  ) {
    super(message)
  }
}

// The stored project is the designer's Project; the store only needs to know
// where the payloads sit, so it stays loose about the rest.
type StoredProject = Record<string, unknown> & {
  name?: unknown
  settings?: Record<string, unknown>
  fonts?: Array<Record<string, unknown>>
  assets?: Array<Record<string, unknown>>
  embeddedDdfZipBase64?: unknown
}

interface VersionFile {
  storeFormat: number
  savedAt: string
  deviceName: string | null
  project: StoredProject
}

export interface DeployMarker {
  versionId: string
  instanceId: string
  deviceName: string
  at: string
}

export interface ProjectSummary {
  name: string
  deviceName: string | null
  savedAt: string
  deployedTo?: string
}

export interface VersionSummary {
  versionId: string
  savedAt: string
  deviceName: string | null
  deployedTo?: string[]
}

// Atomic on power loss (2026-09-23): a van's supply can drop mid-write.
// Write beside the target, flush it to the card, then rename - a rename
// replaces the file whole or not at all. The random part keeps two requests
// writing the same target from sharing a temp file.
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  const handle = await open(tmp, "w")
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, path)
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T
  } catch {
    return null
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

// ISO time with ":" swapped for "-" (Windows file names), so version ids sort
// as strings in time order. Two saves in the same millisecond get a suffix.
function newVersionId(existing: string[]): string {
  const base = new Date().toISOString().replace(/:/g, "-")
  let id = base
  for (let n = 2; existing.includes(id); n++) id = `${base}-${String(n).padStart(3, "0")}`
  return id
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function createProjectStore(
  root: string = join(process.cwd(), ".data"),
  { blobGraceMs = BLOB_GRACE_MS }: { blobGraceMs?: number } = {},
) {
  const projectsDir = join(root, "projects")
  const byInstanceDir = join(root, "by-instance")
  const blobsDir = join(root, "blobs")

  const versionsDir = (folder: string) => join(projectsDir, folder, "versions")
  const deploysPath = (folder: string) => join(projectsDir, folder, "deploys.json")

  function validName(raw: string): string {
    const check = checkProjectName(raw)
    if (!check.ok) throw new ProjectStoreError("invalid-name", check.reason)
    return check.name
  }

  // The folder a name refers to, compared by the name rule, or null. Any
  // folder counts, also one in an old format, so a new project can never
  // collide with a folder that is already there.
  async function findFolder(name: string): Promise<string | null> {
    const key = projectNameKey(name)
    for (const entry of await listDir(projectsDir)) {
      if (projectNameKey(entry) !== key) continue
      const info = await stat(join(projectsDir, entry)).catch(() => null)
      if (info?.isDirectory()) return entry
    }
    return null
  }

  async function requireFolder(name: string): Promise<string> {
    const folder = await findFolder(validName(name))
    if (!folder) throw new ProjectStoreError("not-found", `No project "${name}"`)
    return folder
  }

  async function versionIds(folder: string): Promise<string[]> {
    return (await listDir(versionsDir(folder)))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .filter((id) => VERSION_ID.test(id))
      .sort()
  }

  async function readVersionFile(folder: string, versionId: string): Promise<VersionFile | null> {
    const file = await readJson<VersionFile>(join(versionsDir(folder), `${versionId}.json`))
    return file && file.storeFormat === STORE_FORMAT ? file : null
  }

  async function readDeploys(folder: string): Promise<DeployMarker[]> {
    return (await readJson<DeployMarker[]>(deploysPath(folder))) ?? []
  }

  // --- payloads -----------------------------------------------------------

  async function putBlob(text: string): Promise<{ blob: string }> {
    const id = sha256(text)
    const path = join(blobsDir, id)
    try {
      await stat(path)
    } catch {
      await mkdir(blobsDir, { recursive: true })
      await writeFileAtomic(path, text)
    }
    return { blob: id }
  }

  async function getBlob(ref: unknown): Promise<unknown> {
    const id = (ref as { blob?: unknown } | null)?.blob
    if (typeof id !== "string" || !BLOB_ID.test(id)) return ref
    return readFile(join(blobsDir, id), "utf-8")
  }

  const isPayload = (value: unknown): value is string => typeof value === "string" && value.length > BLOB_THRESHOLD

  async function slim(project: StoredProject): Promise<StoredProject> {
    const out: StoredProject = { ...project }
    if (Array.isArray(project.fonts)) {
      out.fonts = await Promise.all(
        project.fonts.map(async (f) => (isPayload(f.data) ? { ...f, data: await putBlob(f.data) } : f)),
      )
    }
    if (Array.isArray(project.assets)) {
      out.assets = await Promise.all(
        project.assets.map(async (a) => (isPayload(a.data) ? { ...a, data: await putBlob(a.data) } : a)),
      )
    }
    if (isPayload(project.embeddedDdfZipBase64)) out.embeddedDdfZipBase64 = await putBlob(project.embeddedDdfZipBase64)
    return out
  }

  async function full(project: StoredProject): Promise<StoredProject> {
    const out: StoredProject = { ...project }
    if (Array.isArray(project.fonts)) {
      out.fonts = await Promise.all(project.fonts.map(async (f) => ({ ...f, data: await getBlob(f.data) })))
    }
    if (Array.isArray(project.assets)) {
      out.assets = await Promise.all(project.assets.map(async (a) => ({ ...a, data: await getBlob(a.data) })))
    }
    if (project.embeddedDdfZipBase64 !== undefined) {
      out.embeddedDdfZipBase64 = await getBlob(project.embeddedDdfZipBase64)
    }
    return out
  }

  function blobRefs(project: StoredProject): string[] {
    const refs: unknown[] = [
      ...(project.fonts ?? []).map((f) => f.data),
      ...(project.assets ?? []).map((a) => a.data),
      project.embeddedDdfZipBase64,
    ]
    return refs
      .map((r) => (r as { blob?: unknown } | null)?.blob)
      .filter((id): id is string => typeof id === "string")
  }

  // Removes blobs no version of any project refers to any more. Reads every
  // version - a few hundred small files at most on a real installation.
  async function removeOrphanBlobs(): Promise<void> {
    const used = new Set<string>()
    for (const folder of await listDir(projectsDir)) {
      for (const id of await versionIds(folder)) {
        const file = await readVersionFile(folder, id)
        if (file) blobRefs(file.project).forEach((ref) => used.add(ref))
      }
    }
    const now = Date.now()
    for (const id of await listDir(blobsDir)) {
      if (!BLOB_ID.test(id) || used.has(id)) continue
      const path = join(blobsDir, id)
      try {
        if (now - (await stat(path)).mtimeMs < blobGraceMs) continue
        await unlink(path)
      } catch {
        // Gone already, or taken by a concurrent removal - either is fine.
      }
    }
  }

  // --- versions -----------------------------------------------------------

  async function writeVersion(folder: string, project: StoredProject): Promise<{ versionId: string; savedAt: string }> {
    await mkdir(versionsDir(folder), { recursive: true })
    const versionId = newVersionId(await versionIds(folder))
    const savedAt = new Date().toISOString()
    const stored: StoredProject = { ...(await slim(project)), name: folder }
    const deviceName = typeof project.settings?.deviceName === "string" ? project.settings.deviceName : null
    const file: VersionFile = { storeFormat: STORE_FORMAT, savedAt, deviceName, project: stored }
    await writeFileAtomic(join(versionsDir(folder), `${versionId}.json`), JSON.stringify(file))
    await prune(folder)
    return { versionId, savedAt }
  }

  // Keeps the newest MAX_VERSIONS_KEPT, plus the newest version deployed to
  // each device, so "what is on device X" is never pruned away.
  async function prune(folder: string): Promise<void> {
    const ids = await versionIds(folder)
    if (ids.length <= MAX_VERSIONS_KEPT) return
    const keep = new Set(ids.slice(-MAX_VERSIONS_KEPT))
    const newestPerDevice = new Map<string, string>()
    for (const d of await readDeploys(folder)) {
      const current = newestPerDevice.get(d.instanceId)
      if (ids.includes(d.versionId) && (!current || d.versionId > current)) newestPerDevice.set(d.instanceId, d.versionId)
    }
    newestPerDevice.forEach((id) => keep.add(id))
    const dropped = ids.filter((id) => !keep.has(id))
    await Promise.all(dropped.map((id) => unlink(join(versionsDir(folder), `${id}.json`)).catch(() => {})))
    if (dropped.length > 0) await removeOrphanBlobs()
  }

  async function readProject(folder: string, versionId: string) {
    const file = await readVersionFile(folder, versionId)
    if (!file) return null
    // The folder name is authoritative: a power cut between the two steps of
    // a rename leaves a version with the old name inside the new folder.
    const project: StoredProject = { ...(await full(file.project)), name: folder }
    return { name: folder, versionId, savedAt: file.savedAt, project }
  }

  async function readNewest(folder: string) {
    const ids = await versionIds(folder)
    for (let i = ids.length - 1; i >= 0; i--) {
      const read = await readProject(folder, ids[i])
      if (read) return read
    }
    throw new ProjectStoreError("not-found", `No project "${folder}"`)
  }

  // --- by-instance --------------------------------------------------------

  async function pointInstancesAway(folder: string, to: string | null): Promise<void> {
    const key = projectNameKey(folder)
    for (const f of await listDir(byInstanceDir)) {
      if (!f.endsWith(".json")) continue
      const path = join(byInstanceDir, f)
      const entry = await readJson<{ name?: string }>(path)
      if (!entry?.name || projectNameKey(entry.name) !== key) continue
      if (to === null) await unlink(path).catch(() => {})
      else await writeFileAtomic(path, JSON.stringify({ name: to }))
    }
  }

  // --- public -------------------------------------------------------------

  return {
    // Every project, newest save first. Folders without a version in this
    // store's format - the old UUID folders - are not projects.
    async list(): Promise<ProjectSummary[]> {
      const out: ProjectSummary[] = []
      for (const folder of await listDir(projectsDir)) {
        const ids = await versionIds(folder)
        const newest = ids.length > 0 ? await readVersionFile(folder, ids[ids.length - 1]) : null
        if (!newest) continue
        const deploys = await readDeploys(folder)
        const summary: ProjectSummary = { name: folder, deviceName: newest.deviceName, savedAt: newest.savedAt }
        if (deploys.length > 0) summary.deployedTo = deploys[deploys.length - 1].deviceName
        out.push(summary)
      }
      return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },

    async create(rawName: string, project: StoredProject) {
      const name = validName(rawName)
      const existing = await findFolder(name)
      if (existing) throw new ProjectStoreError("taken", `"${existing}" already exists`, existing)
      await mkdir(projectsDir, { recursive: true })
      try {
        // Not recursive: of two requests creating the same name at once, the
        // second fails here instead of sharing the folder.
        await mkdir(join(projectsDir, name))
      } catch {
        throw new ProjectStoreError("taken", `"${name}" already exists`, (await findFolder(name)) ?? name)
      }
      const version = await writeVersion(name, project)
      return { name, ...version }
    },

    async addVersion(rawName: string, project: StoredProject) {
      const folder = await requireFolder(rawName)
      return { name: folder, ...(await writeVersion(folder, project)) }
    },

    async readNewest(rawName: string) {
      return readNewest(await requireFolder(rawName))
    },

    async readVersion(rawName: string, versionId: string) {
      if (!VERSION_ID.test(versionId)) throw new ProjectStoreError("invalid-version", "Invalid version id")
      const folder = await requireFolder(rawName)
      const read = await readProject(folder, versionId)
      if (!read) throw new ProjectStoreError("not-found", `No version ${versionId}`)
      return read
    },

    async listVersions(rawName: string): Promise<VersionSummary[]> {
      const folder = await requireFolder(rawName)
      const deploys = await readDeploys(folder)
      const out: VersionSummary[] = []
      for (const versionId of await versionIds(folder)) {
        const file = await readVersionFile(folder, versionId)
        if (!file) continue
        const summary: VersionSummary = { versionId, savedAt: file.savedAt, deviceName: file.deviceName }
        const to = deploys.filter((d) => d.versionId === versionId).map((d) => d.deviceName)
        if (to.length > 0) summary.deployedTo = to
        out.push(summary)
      }
      return out.reverse()
    },

    // Renames the folder, then records the rename as a version carrying the
    // new name, the way `git mv` is a commit.
    async rename(rawName: string, rawNewName: string) {
      const folder = await requireFolder(rawName)
      const newName = validName(rawNewName)
      const existing = await findFolder(newName)
      if (existing && existing !== folder) throw new ProjectStoreError("taken", `"${existing}" already exists`, existing)
      const newest = await readNewest(folder)
      if (newName === folder) return { name: folder, versionId: newest.versionId, savedAt: newest.savedAt }
      // A change of case only ("van knob" -> "Van Knob") is a rename too; it
      // finds its own folder above and is allowed.
      await rename(join(projectsDir, folder), join(projectsDir, newName))
      await pointInstancesAway(folder, newName)
      const version = await writeVersion(newName, { ...newest.project, name: newName })
      return { name: newName, ...version }
    },

    async remove(rawName: string): Promise<void> {
      const folder = await requireFolder(rawName)
      await rm(join(projectsDir, folder), { recursive: true, force: true })
      await pointInstancesAway(folder, null)
      await removeOrphanBlobs()
    },

    async markDeploy(rawName: string, marker: { versionId: string; instanceId: string; deviceName: string }) {
      const folder = await requireFolder(rawName)
      if (!isValidInstanceId(marker.instanceId)) throw new ProjectStoreError("invalid-instance", "Invalid instanceId")
      if (!(await versionIds(folder)).includes(marker.versionId)) {
        throw new ProjectStoreError("not-found", `No version ${marker.versionId}`)
      }
      const deploys = await readDeploys(folder)
      deploys.push({ ...marker, at: new Date().toISOString() })
      await writeFileAtomic(deploysPath(folder), JSON.stringify(deploys))
      await mkdir(byInstanceDir, { recursive: true })
      await writeFileAtomic(join(byInstanceDir, `${marker.instanceId}.json`), JSON.stringify({ name: folder }))
    },

    // For the e2e teardown, which removes a run's project folders directly.
    removeOrphanBlobs,

    async byInstance(instanceId: string): Promise<string | null> {
      if (!isValidInstanceId(instanceId)) throw new ProjectStoreError("invalid-instance", "Invalid instanceId")
      const entry = await readJson<{ name?: string }>(join(byInstanceDir, `${instanceId}.json`))
      return typeof entry?.name === "string" ? entry.name : null
    },
  }
}

export type ProjectStore = ReturnType<typeof createProjectStore>
