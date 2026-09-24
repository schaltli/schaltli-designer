import { test, expect, type APIRequestContext } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

// The project API (docs/2026-09-23-explicit-save.md, "API") against the
// running server, hit directly rather than through the UI: the name checks
// here exist to keep untrusted route params away from filesystem paths, which
// is worth pinning directly, not only through a UI that never sends a bad
// name. What the store does on disk in detail is e2e/project-store.spec.ts;
// this checks that the routes pass it through with the right status codes.

const PROJECTS_DIR = join(__dirname, "..", ".data", "projects")

// Parallel workers share .data, so every test works under its own names.
function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e api ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

const url = (name: string) => `/api/projects/${encodeURIComponent(name)}`

async function create(request: APIRequestContext, name: string, project: object) {
  const res = await request.post("/api/projects", { data: { name, project } })
  expect(res.status(), await res.text()).toBe(201)
  return res.json()
}

test.describe("Projects API", () => {
  test("creates, saves, lists, reads, marks a deploy, renames and deletes a project", async ({ request }, testInfo) => {
    const name = uniqueName(testInfo, "life")
    const renamed = `${name} renamed`
    const instanceId = `e2e-api-${Math.random().toString(36).slice(2, 10)}`
    const project = { name, settings: { deviceName: "Test Display" }, screens: [{ id: "screen-1", objects: [] }] }

    const first = await create(request, name, project)
    expect(first.name).toBe(name)

    const second = await (await request.post(`${url(name)}/versions`, { data: { ...project, nextId: 2 } })).json()
    expect(second.versionId > first.versionId).toBe(true)

    const listed = (await (await request.get("/api/projects")).json()).projects
    expect(listed.find((p: { name: string }) => p.name === name)).toMatchObject({ deviceName: "Test Display" })

    const newest = await (await request.get(url(name))).json()
    expect(newest).toMatchObject({ name, versionId: second.versionId, project: { name, nextId: 2 } })

    const versions = (await (await request.get(`${url(name)}/versions`)).json()).versions
    expect(versions.map((v: { versionId: string }) => v.versionId)).toEqual([second.versionId, first.versionId])
    const old = await (await request.get(`${url(name)}/versions/${first.versionId}`)).json()
    expect(old.project.nextId).toBeUndefined()

    const deploy = await request.post(`${url(name)}/deploys`, {
      data: { versionId: second.versionId, instanceId, deviceName: "Knob" },
    })
    expect(deploy.ok()).toBe(true)
    expect(await (await request.get(`/api/by-instance/${instanceId}`)).json()).toEqual({ name })

    const rename = await request.post(`${url(name)}/rename`, { data: { newName: renamed } })
    expect(rename.ok(), await rename.text()).toBe(true)
    expect((await request.get(url(name))).status()).toBe(404)
    expect((await (await request.get(url(renamed))).json()).project.name).toBe(renamed)
    expect(await (await request.get(`/api/by-instance/${instanceId}`)).json()).toEqual({ name: renamed })

    expect((await request.delete(url(renamed))).ok()).toBe(true)
    expect((await request.get(url(renamed))).status()).toBe(404)
    expect((await request.get(`/api/by-instance/${instanceId}`)).status()).toBe(404)
  })

  test("keeps fonts and the DDF out of the version on disk and puts them back when read", async ({ request }, testInfo) => {
    const name = uniqueName(testInfo, "payload")
    const fontData = `STARTFONT 2.1\n${"BITMAP\n00\n".repeat(2000)}ENDFONT\n`
    const ddf = Buffer.alloc(20_000, 7).toString("base64")
    const project = { name, settings: {}, fonts: [{ id: "font-a", data: fontData }], embeddedDdfZipBase64: ddf }
    const { versionId } = await create(request, name, project)

    const onDisk = await readFile(join(PROJECTS_DIR, name, "versions", `${versionId}.json`), "utf-8")
    expect(onDisk).not.toContain("STARTFONT")
    expect(onDisk).not.toContain(ddf.slice(0, 100))
    expect(onDisk.length).toBeLessThan(1024)

    const read = await (await request.get(url(name))).json()
    expect(read.project).toEqual(project)
    await request.delete(url(name))
  })

  test("refuses a taken name in another spelling with 409 and names the existing one", async ({ request }, testInfo) => {
    const name = uniqueName(testInfo, "Taken")
    await create(request, name, { settings: {} })
    const again = await request.post("/api/projects", { data: { name: `  ${name.toUpperCase()} `, project: {} } })
    expect(again.status()).toBe(409)
    expect(await again.json()).toMatchObject({ code: "taken", name })

    const other = uniqueName(testInfo, "other")
    await create(request, other, { settings: {} })
    const clash = await request.post(`${url(other)}/rename`, { data: { newName: name.toLowerCase() } })
    expect(clash.status()).toBe(409)

    await request.delete(url(name))
    await request.delete(url(other))
  })

  test("answers 400 for names that are no folder name, and creates nothing", async ({ request }) => {
    const badNames = ["a/b", "a\\b", "..", "nul.txt", "CON", "Van Knob.", "x".repeat(81), "   "]
    for (const bad of badNames) {
      const post = await request.post("/api/projects", { data: { name: bad, project: {} } })
      expect(post.status(), JSON.stringify(bad)).toBe(400)
      expect((await post.json()).code).toBe("invalid-name")
    }
    for (const bad of ["a%2Fb", "nul.txt", "a%5Cb"]) {
      expect((await request.get(`/api/projects/${bad}`)).status(), bad).toBe(400)
    }
    // "%2E%2E" never reaches the route: the URL is normalised to /api/ on the
    // way and answers 404 - also nothing that touches a project folder.
    expect((await request.get("/api/projects/%2E%2E")).ok()).toBe(false)
    expect((await request.post("/api/projects", { data: { name: "no project" } })).status()).toBe(400)
    // Only the names this test sent: parallel workers create projects of their
    // own meanwhile, so the whole listing is no measure (the full run of
    // 2026-09-24 caught exactly that).
    const folders = (await readdir(PROJECTS_DIR).catch(() => [] as string[])).map((f) => f.toLowerCase())
    for (const bad of [...badNames, "nul", "con"]) {
      expect(folders, bad).not.toContain(bad.trim().toLowerCase())
    }
  })

  test("answers 404 for what is not there and 400 for malformed version and device ids", async ({ request }, testInfo) => {
    const missing = uniqueName(testInfo, "never saved")
    expect((await request.get(url(missing))).status()).toBe(404)
    expect((await request.get(`${url(missing)}/versions`)).status()).toBe(404)
    expect((await request.delete(url(missing))).status()).toBe(404)
    expect((await request.get(`/api/by-instance/e2e-never-bound-${testInfo.testId}`)).status()).toBe(404)
    expect((await request.get("/api/by-instance/bad!id")).status()).toBe(400)

    const name = uniqueName(testInfo, "versions")
    await create(request, name, { settings: {} })
    expect((await request.get(`${url(name)}/versions/not-a-version`)).status()).toBe(400)
    expect((await request.get(`${url(name)}/versions/2020-01-01T00-00-00.000Z`)).status()).toBe(404)
    const deploy = await request.post(`${url(name)}/deploys`, {
      data: { versionId: "2020-01-01T00-00-00.000Z", instanceId: "e2e-x", deviceName: "X" },
    })
    expect(deploy.status()).toBe(404)
    await request.delete(url(name))
  })
})
