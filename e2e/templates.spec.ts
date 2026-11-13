import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { createProjectStore } from "../lib/project-store"
import { createTemplateStore } from "../lib/template-store"
import { templateFromProject, withTemplate } from "../lib/templates"
import { buildStarterProject, STARTER_DEMO_NAME } from "../deploy/demo/starter-project"

// Templates (lib/templates.ts, 2026-11-13): New Project offers, for every
// device, Empty or From template with the templates made for it. One comes
// with the designer, the VanPi starter for the Waveshare 4" built in the
// starter film; File > Save as Template adds the user's own.

const SHIPPED_DIR = path.join(__dirname, "..", "templates")
const STARTER_FILE = path.join(SHIPPED_DIR, "vanpi-4.json")
const STARTER_NAME = 'VanPi-Starter (4")'
const FOUR_INCH = "waveshare-touch-lcd-4"
const starter = JSON.parse(fs.readFileSync(STARTER_FILE, "utf8"))
const walk = (o: any): any[] => [o, ...(o.children ?? []).flatMap(walk)]

test("the shipped starter is neutral: every topic under schaltli/, no address of a van, the camera empty", () => {
  expect(starter.name).toBe(STARTER_NAME)
  expect(starter.deviceId).toBe(FOUR_INCH)
  const off = starter.topics.map((t: any) => t.topic).filter((t: string) => !t.startsWith("schaltli/"))
  expect(off).toEqual([])
  const objects = starter.screens.flatMap((s: any) => (s.objects ?? []).flatMap(walk))
  const read = objects
    .flatMap((o: any) => [o.properties?.topic, o.properties?.writeTopic, ...(o.properties?.liveValues ?? []).map((lv: any) => lv.source?.path)])
    .filter(Boolean)
  expect(read.filter((t: string) => t.includes("/") && !t.startsWith("schaltli/"))).toEqual([])
  // No address of the user's van anywhere in it.
  expect(JSON.stringify(starter)).not.toMatch(/192\.168\.|https?:\/\/(?!www\.w3\.org)/)
  for (const camera of objects.filter((o: any) => o.type === "camera")) expect(camera.properties.url).toBe("")
  // What a project takes from its device is left to the device.
  expect(starter.settings.deviceId).toBeUndefined()
  expect(starter.embeddedDdfZipBase64).toBeUndefined()
  expect(starter.fonts).toBeUndefined()
  // Home is the screen it opens on: the first after the master.
  expect(starter.screens.find((s: any) => !s.isMaster).name).toBe("Home")
})

test("the store: shipped and own per device, a name only once, a shipped one stays", async ({}, testInfo) => {
  const store = createTemplateStore(testInfo.outputPath("data"), SHIPPED_DIR)
  const OTHER = "waveshare-touch-lcd-4v3b"
  expect(await store.list(FOUR_INCH)).toEqual([{ name: STARTER_NAME, deviceId: FOUR_INCH, shipped: true }])
  expect(await store.list(OTHER)).toEqual([])

  const project = {
    screens: [{ id: "s1", name: "Mine", objects: [{ id: "o1", type: "label", properties: { topic: "a/b" } }] }],
    topics: [{ topic: "a/b" }, { topic: "unused/x" }],
    assets: [],
    nextId: 7,
    settings: { deviceId: OTHER, deviceName: "4.3B", gridSize: 10 },
  }
  const template = templateFromProject("Zweiter Screen", project)
  // The device's own is left out, and the topics no object reads.
  expect(template.deviceId).toBe(OTHER)
  expect(template.settings).toEqual({ gridSize: 10 })
  expect(template.topics).toEqual([{ topic: "a/b" }])

  await store.create(template)
  expect(await store.list(OTHER)).toEqual([{ name: "Zweiter Screen", deviceId: OTHER, shipped: false }])
  expect((await store.list()).map((t) => t.name)).toEqual([STARTER_NAME, "Zweiter Screen"])
  expect((await store.read("zweiter screen")).screens).toEqual(project.screens)
  await expect(store.create({ ...template, name: "ZWEITER SCREEN" })).rejects.toMatchObject({ code: "taken" })
  // A name a shipped template has is taken too, and a shipped one is never removed.
  const shippedDir = testInfo.outputPath("shipped")
  fs.mkdirSync(shippedDir, { recursive: true })
  fs.writeFileSync(path.join(shippedDir, "one.json"), JSON.stringify({ ...template, name: "Shipped One" }))
  const withShipped = createTemplateStore(testInfo.outputPath("data"), shippedDir)
  await expect(withShipped.create({ ...template, name: "shipped one" })).rejects.toMatchObject({ code: "taken" })
  await expect(withShipped.remove("Shipped One")).rejects.toMatchObject({ code: "taken" })
  await expect(store.create({ ...template, name: "a/b" })).rejects.toMatchObject({ code: "invalid-name" })
  await expect(store.remove(STARTER_NAME)).rejects.toMatchObject({ code: "taken" })
  await store.remove("Zweiter Screen")
  expect(await store.list(OTHER)).toEqual([])

  // Made into a project, the device's own stays the device's.
  const fresh = { screens: [], topics: [], assets: [], nextId: 3, settings: { deviceId: "x", deviceName: "X" } }
  const made = withTemplate(fresh, { ...template, settings: { ...template.settings, deviceId: "y" } })
  expect(made.settings).toEqual({ deviceId: "x", deviceName: "X", gridSize: 10 })
  expect(made.nextId).toBe(7)
})

const startWith = (page: Page) => page.getByRole("group", { name: "Start with" })
const uniqueName = (what: string, testId: string) => `e2e ${what} ${testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`

async function toNameStep(page: Page, deviceId: string) {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, deviceId, "curated")
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(startWith(page)).toBeVisible()
}

test.describe("New Project from a template", () => {
  test('the 4" offers Empty or From template with the starter; made from it, the project opens on Home and is saved with its screens', async ({ page }, testInfo) => {
    const name = uniqueName("template", testInfo.testId)
    await toNameStep(page, FOUR_INCH)
    await expect(startWith(page).getByRole("radio", { name: "Empty" })).toBeChecked()
    await startWith(page).getByRole("radio", { name: "From template" }).check()
    await expect(startWith(page).getByRole("combobox", { name: "Template" })).toHaveValue(STARTER_NAME)
    await createProject(page, name)
    await waitForEditorReady(page)
    await expect(page.getByTestId("project-title")).toHaveText(name)
    await expect(page.getByText("Home", { exact: true }).first()).toBeVisible()

    const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
    expect(saved.name).toBe(name)
    expect(saved.settings.deviceId).toBe(FOUR_INCH)
    expect(saved.screens.map((s: any) => s.name)).toEqual(starter.screens.map((s: any) => s.name))
    expect(saved.topics.length).toBe(starter.topics.length)
    // The device's own: its description and fonts, from the 4" chosen.
    expect(saved.embeddedDdfZipBase64?.length ?? 0).toBeGreaterThan(1000)
    expect(saved.fonts.length).toBeGreaterThan(0)
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Empty stays as it was: no template's screens", async ({ page }, testInfo) => {
    const name = uniqueName("template empty", testInfo.testId)
    await toNameStep(page, FOUR_INCH)
    await createProject(page, name)
    await waitForEditorReady(page)
    const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
    expect(saved.screens.some((s: any) => s.name === "Home")).toBe(false)
    expect(saved.topics.filter((t: any) => t.topic.startsWith("schaltli/"))).toEqual([])
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("Save as Template: the open project, offered from then on for its device", async ({ page }, testInfo) => {
    // The Knob: no other spec makes templates for it, so it has none of its own.
    const DEVICE = "waveshare-knob-1v8"
    const project = uniqueName("source", testInfo.testId)
    const template = uniqueName("own template", testInfo.testId)
    const made = uniqueName("from own", testInfo.testId)
    try {
      // A device without a template: From template is there, greyed out.
      await toNameStep(page, DEVICE)
      await expect(startWith(page).getByRole("radio", { name: "From template" })).toBeDisabled()
      await createProject(page, project)
      await waitForEditorReady(page)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Save as Template..." }).click()
      const dialog = page.getByRole("dialog", { name: "Save as Template" })
      await dialog.locator("#template-name").fill(template)
      await dialog.getByRole("button", { name: "Save Template" }).click()
      await expect(dialog).toHaveCount(0)

      const stored = (await (await page.request.get(`/api/templates/${encodeURIComponent(template)}`)).json()).template
      expect(stored.deviceId).toBe(DEVICE)
      expect(stored.fonts).toBeUndefined()
      expect(stored.embeddedDdfZipBase64).toBeUndefined()
      expect(stored.settings.deviceId).toBeUndefined()

      // New Project offers it for that device, and a project made from it has its screens.
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "New Project" }).click()
      await chooseDevice(page, DEVICE, "curated")
      await page.getByRole("button", { name: "Next", exact: true }).click()
      await startWith(page).getByRole("combobox", { name: "Template" }).selectOption(template)
      await expect(startWith(page).getByRole("radio", { name: "From template" })).toBeChecked()
      await createProject(page, made)
      await waitForEditorReady(page)
      await expect(page.getByTestId("project-title")).toHaveText(made)
      const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(made)}`)).json()).project
      expect(saved.screens.map((s: any) => s.name)).toEqual(stored.screens.map((s: any) => s.name))
      expect(saved.settings.deviceId).toBe(DEVICE)
    } finally {
      await page.request.delete(`/api/templates/${encodeURIComponent(template)}`)
      for (const p of [project, made]) await page.request.delete(`/api/projects/${encodeURIComponent(p)}`)
    }
  })
})

// demo.schaltli.com (T7): the starter seeded beside «Camper» by
// deploy/demo/deploy.sh, which runs this with DEMO_SEED_DIR set.
test("written into a project store, the demo's «VanPi-Starter» reads back for the 4\"", async ({}, testInfo) => {
  const project = await buildStarterProject(new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "public", "ddf", `${FOUR_INCH}.ddf.zip`))))
  expect(project.settings.deviceId).toBe(FOUR_INCH)
  expect((project.screens as any[]).map((s) => s.name)).toEqual(starter.screens.map((s: any) => s.name))
  const dir = process.env.DEMO_SEED_DIR || testInfo.outputPath("store")
  fs.rmSync(path.join(dir, "projects", STARTER_DEMO_NAME), { recursive: true, force: true })
  const store = createProjectStore(dir)
  await store.create(STARTER_DEMO_NAME, project as any)
  const back = await store.readNewest(STARTER_DEMO_NAME)
  expect(back.name).toBe(STARTER_DEMO_NAME)
  expect((back.project as any).screens.length).toBe(starter.screens.length)
})
