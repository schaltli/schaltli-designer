import { test, expect } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT } from "./helpers"
import { checkProjectName, sameProjectName } from "../lib/project-name"
import { createProjectStore, MAX_VERSIONS_KEPT } from "../lib/project-store"

// The name rule and the server-side project store
// (docs/2026-09-23-explicit-save.md), tested in the test process against a
// temp directory - no page, no server. It lives under e2e/ only because
// Playwright is this repo's only test runner.
//
// Why the disk layout is pinned this closely: the store runs on a Pi's SD
// card in a van. How much a save writes, and that no write can be left half
// done, are the reasons it exists.

type Project = Record<string, any>

// COMBINED_TEST_PROJECT as the editor holds it: fonts with their BDF text
// inline, an uploaded image, a small SVG icon, and an embedded DDF zip - the
// payloads a real project carries and the store must keep out of versions.
async function fullProject(): Promise<Project> {
  const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  for (const font of project.fonts) font.data = await zip.file(font.path)!.async("string")
  project.assets = [
    { id: "asset-photo", name: "photo.png", type: "image", data: randomBytes(30_000).toString("base64") },
    { id: "asset-dot", name: "dot.svg", type: "svg", data: '<svg viewBox="0 0 2 2"><circle r="1"/></svg>' },
  ]
  project.embeddedDdfZipBase64 = randomBytes(200_000).toString("base64")
  return project
}

// The project with its payloads taken out: the size a version is measured
// against.
function withoutPayloads(project: Project): Project {
  return {
    ...project,
    fonts: project.fonts.map((f: Project) => ({ ...f, data: undefined })),
    assets: project.assets.map((a: Project) => (a.data.length > 4096 ? { ...a, data: undefined } : a)),
    embeddedDdfZipBase64: undefined,
  }
}

async function filesUnder(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  async function walk(d: string) {
    for (const entry of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) await walk(path)
      else out.set(relative(dir, path), (await stat(path)).size)
    }
  }
  await walk(dir)
  return out
}

let root: string
test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "schaltli-store-"))
})
test.afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test.describe("Project names", () => {
  test("refuses every kind of name that is not a folder name on the Pi and on Windows, with the reason", () => {
    const refused: Array<[string, RegExp]> = [
      ["", /Enter a name/],
      ["   ", /Enter a name/],
      ["x".repeat(81), /at most 80/],
      ["a/b", /cannot contain \//],
      ["a\\b", /cannot contain \\/],
      ["a:b", /cannot contain :/],
      ["a*b", /cannot contain \*/],
      ["a?b", /cannot contain \?/],
      ['a"b', /cannot contain "/],
      ["a<b", /cannot contain </],
      ["a>b", /cannot contain >/],
      ["a|b", /cannot contain \|/],
      ["tab\there", /control characters/],
      [".", /other than/],
      ["..", /other than/],
      ["Van Knob.", /end with a dot/],
      ["CON", /reserved by Windows/],
      ["nul.txt", /reserved by Windows/],
      ["com1", /reserved by Windows/],
      ["LPT9.json", /reserved by Windows/],
    ]
    for (const [name, reason] of refused) {
      const check = checkProjectName(name)
      expect(check.ok, JSON.stringify(name)).toBe(false)
      if (!check.ok) expect(check.reason, JSON.stringify(name)).toMatch(reason)
    }
  })

  test("accepts ordinary names, trimmed, and compares them without case", () => {
    for (const name of ["Van Knob", "Küche 2", "x".repeat(80), "Console", "com10", "a.b", "Licht (hinten)"]) {
      expect(checkProjectName(name).ok, name).toBe(true)
    }
    expect(checkProjectName("  Van Knob ")).toEqual({ ok: true, name: "Van Knob" })
    expect(sameProjectName("Van Knob", " van knob")).toBe(true)
    // "ü" as one code point and as u + combining diaeresis are one name.
    expect(sameProjectName("Küche", "Küche")).toBe(true)
    expect(sameProjectName("Van Knob", "Van Knob 2")).toBe(false)
  })
})

test.describe("Project store", () => {
  test("keeps payloads out of versions: a second save writes one file no bigger than the design", async () => {
    const store = createProjectStore(root)
    const project = await fullProject()
    await store.create("Van Knob", project)

    const before = await filesUnder(root)
    const edited = { ...project, screens: project.screens.map((s: Project) => ({ ...s, name: `${s.name} 2` })) }
    await store.addVersion("Van Knob", edited)
    const after = await filesUnder(root)

    const added = [...after.keys()].filter((f) => !before.has(f))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/^projects[\\/]Van Knob[\\/]versions[\\/].+\.json$/)
    const designSize = JSON.stringify(withoutPayloads({ ...edited, name: "Van Knob" })).length
    expect(after.get(added[0])!).toBeLessThanOrEqual(designSize + 1024)
    // Nothing that was there changed either: blobs are written once.
    for (const [file, size] of before) expect(after.get(file), file).toBe(size)

    const read = await store.readNewest("Van Knob")
    expect(read.project).toEqual({ ...edited, name: "Van Knob" })
  })

  test("stores a payload once, however many projects use it", async () => {
    const store = createProjectStore(root)
    const project = await fullProject()
    await store.create("One", project)
    const blobsAfterOne = (await readdir(join(root, "blobs"))).length
    // 4 fonts + photo + DDF; the small SVG stays inline.
    expect(blobsAfterOne).toBe(6)
    await store.create("Two", project)
    expect((await readdir(join(root, "blobs"))).length).toBe(blobsAfterOne)
  })

  test("names the folder exactly as given, refuses a taken name in any case, and refuses invalid names", async () => {
    const store = createProjectStore(root)
    const project = await fullProject()
    await store.create("  Van Knob ", project)
    expect(await readdir(join(root, "projects"))).toEqual(["Van Knob"])
    await expect(store.create("van knob", project)).rejects.toMatchObject({ code: "taken" })
    await expect(store.create("nul.txt", project)).rejects.toMatchObject({ code: "invalid-name" })
    expect(await readdir(join(root, "projects"))).toEqual(["Van Knob"])
    // Found by the name rule, not by exact spelling.
    expect((await store.readNewest("VAN KNOB")).name).toBe("Van Knob")
  })

  test("renames the folder, records the rename as a version, and moves the device pointer", async () => {
    const store = createProjectStore(root)
    const project = await fullProject()
    const { versionId } = await store.create("Van Knob", project)
    await store.create("Galley", project)
    await store.markDeploy("Van Knob", { versionId, instanceId: "knob-c00f1e13cfd0", deviceName: "Knob" })

    await expect(store.rename("Van Knob", "galley")).rejects.toMatchObject({ code: "taken" })
    await expect(store.rename("Van Knob", "a/b")).rejects.toMatchObject({ code: "invalid-name" })

    await store.rename("Van Knob", "Cab Knob")
    expect((await readdir(join(root, "projects"))).sort()).toEqual(["Cab Knob", "Galley"])
    const versions = await store.listVersions("Cab Knob")
    expect(versions).toHaveLength(2)
    expect(versions[1].deployedTo).toEqual(["Knob"])
    expect((await store.readNewest("Cab Knob")).project.name).toBe("Cab Knob")
    expect(await store.byInstance("knob-c00f1e13cfd0")).toBe("Cab Knob")

    // A change of case only is a rename too.
    await store.rename("cab knob", "CAB KNOB")
    expect((await readdir(join(root, "projects"))).sort()).toEqual(["CAB KNOB", "Galley"])
  })

  test("reads a project under its folder name when a power cut left the old name inside", async () => {
    const store = createProjectStore(root)
    const { versionId } = await store.create("Van Knob", await fullProject())
    const path = join(root, "projects", "Van Knob", "versions", `${versionId}.json`)
    const file = JSON.parse(await readFile(path, "utf-8"))
    file.project.name = "Old Name"
    await writeFile(path, JSON.stringify(file))
    expect((await store.readNewest("Van Knob")).project.name).toBe("Van Knob")
  })

  test("lists only folders in this store's format, newest save first", async () => {
    const store = createProjectStore(root)
    const project = await fullProject()
    // An old autosave folder, named by UUID, and one whose UUID would even
    // pass as a name.
    const old = join(root, "projects", "0368fc67-d5ca-4f7c-9968-7cd0401be4bd")
    await mkdir(join(old, "versions"), { recursive: true })
    await writeFile(join(old, "current.json"), JSON.stringify(project))
    await writeFile(join(old, "versions", "2026-08-02T10-00-00.000Z.json"), JSON.stringify(project))
    await mkdir(join(root, "projects", "by-instance"))

    await store.create("First", project)
    await store.create("Second", project)
    const list = await store.list()
    expect(list.map((p) => p.name)).toEqual(["Second", "First"])
    expect(list[0].deviceName).toBe(project.settings.deviceName)
  })

  test("keeps 20 versions, and never the newest one deployed to each device", async () => {
    const store = createProjectStore(root, { blobGraceMs: 0 })
    const project = await fullProject()
    const { versionId: deployed } = await store.create("Van Knob", project)
    await store.markDeploy("Van Knob", { versionId: deployed, instanceId: "knob-1", deviceName: "Knob" })
    for (let i = 0; i < MAX_VERSIONS_KEPT + 4; i++) await store.addVersion("Van Knob", { ...project, nextId: i })

    const versions = await store.listVersions("Van Knob")
    expect(versions).toHaveLength(MAX_VERSIONS_KEPT + 1)
    expect(versions[versions.length - 1].versionId).toBe(deployed)
    expect((await store.readVersion("Van Knob", deployed)).project.nextId).toBe(project.nextId)
  })

  test("deletes a project with its versions, device pointers and the blobs only it used", async () => {
    const store = createProjectStore(root, { blobGraceMs: 0 })
    const shared = await fullProject()
    const own = { ...shared, embeddedDdfZipBase64: randomBytes(50_000).toString("base64") }
    await store.create("Shared", shared)
    const { versionId } = await store.create("Own", own)
    await store.markDeploy("Own", { versionId, instanceId: "epaper-1", deviceName: "ePaper" })
    const blobsBefore = (await readdir(join(root, "blobs"))).length

    await store.remove("own")
    expect(await readdir(join(root, "projects"))).toEqual(["Shared"])
    expect(await store.byInstance("epaper-1")).toBeNull()
    // Own's DDF was its only payload no other project used.
    expect((await readdir(join(root, "blobs"))).length).toBe(blobsBefore - 1)
    expect((await store.readNewest("Shared")).project).toEqual({ ...shared, name: "Shared" })
    await expect(store.readNewest("Own")).rejects.toMatchObject({ code: "not-found" })
  })

  test("leaves no temporary file behind", async () => {
    const store = createProjectStore(root, { blobGraceMs: 0 })
    const project = await fullProject()
    const { versionId } = await store.create("A", project)
    await store.addVersion("A", project)
    await store.markDeploy("A", { versionId, instanceId: "i-1", deviceName: "D" })
    await store.rename("A", "B")
    await store.create("C", project)
    await store.remove("C")
    const leftovers = [...(await filesUnder(root)).keys()].filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })
})
