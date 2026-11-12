import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { STARTERS, startersFor } from "../lib/starters"
import { chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { createProjectStore } from "../lib/project-store"
import { buildStarterProject, STARTER_DEMO_NAME } from "../deploy/demo/starter-project"

// The starter (tasks/starter-project-plan.md): the project built in the
// starter film, offered in the New Project dialog for the Waveshare 4" -
// neutral, reading only `schaltli/…`, and for no other device.

const STARTER_FILE = path.join(__dirname, "..", "lib", "starters", "vanpi-4.json")
const FOUR_INCH = "waveshare-touch-lcd-4"
const starter = JSON.parse(fs.readFileSync(STARTER_FILE, "utf8"))
const walk = (o: any): any[] => [o, ...(o.children ?? []).flatMap(walk)]

test("the starter is neutral: every topic under schaltli/, no address of a van, the camera empty", () => {
  const off = starter.topics.map((t: any) => t.topic).filter((t: string) => !t.startsWith("schaltli/"))
  expect(off).toEqual([])
  const objects = starter.screens.flatMap((s: any) => (s.objects ?? []).flatMap(walk))
  const read = objects.flatMap((o: any) => [o.properties?.topic, o.properties?.writeTopic, ...(o.properties?.liveValues ?? []).map((lv: any) => lv.source?.path)]).filter(Boolean)
  expect(read.filter((t: string) => t.includes("/") && !t.startsWith("schaltli/"))).toEqual([])
  // No address of the user's van anywhere in it.
  expect(JSON.stringify(starter)).not.toMatch(/192\.168\.|https?:\/\/(?!www\.w3\.org)/)
  for (const camera of objects.filter((o: any) => o.type === "camera")) expect(camera.properties.url).toBe("")
  // What a project takes from its device is left to the device.
  expect(starter.settings.deviceId).toBeUndefined()
  expect(starter.embeddedDdfZipBase64).toBeUndefined()
  // Home is the screen it opens on: the first after the master.
  expect(starter.screens.find((s: any) => !s.isMaster).name).toBe("Home")
})

test("only the 4\" has a starter", () => {
  expect(startersFor(FOUR_INCH).map((s) => s.id)).toEqual(["vanpi-4"])
  for (const other of ["waveshare-touch-lcd-4v3b", "waveshare-knob-1v8", "m5stack-papers3", undefined]) expect(startersFor(other)).toEqual([])
  expect(STARTERS.map((s) => s.label)).toEqual(['VanPi-Starter (4")'])
})

const startWith = (page: Page) => page.getByRole("group", { name: "Start with" })

test.describe("New Project with a starter", () => {
  test("the 4\" offers Empty or the starter; created from it, the project opens on Home and is saved with its screens", async ({ page }, testInfo) => {
    const name = `e2e starter ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, FOUR_INCH, "curated")
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(startWith(page)).toBeVisible()
    await expect(startWith(page).getByRole("radio", { name: "Empty" })).toBeChecked()
    await startWith(page).getByRole("radio", { name: 'VanPi-Starter (4")' }).check()
    await createProject(page, name)
    await waitForEditorReady(page)
    await expect(page.getByTestId("project-title")).toHaveText(name)
    // It opens on Home.
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

  test("Empty stays as it was: no starter's screens", async ({ page }, testInfo) => {
    const name = `e2e starter empty ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, FOUR_INCH, "curated")
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await createProject(page, name)
    await waitForEditorReady(page)
    const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
    expect(saved.screens.some((s: any) => s.name === "Home")).toBe(false)
    // An empty project's own example topic, none of the starter's.
    expect(saved.topics.filter((t: any) => t.topic.startsWith("schaltli/"))).toEqual([])
    await page.request.delete(`/api/projects/${encodeURIComponent(name)}`)
  })

  test("a device without a starter is not asked", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, "waveshare-touch-lcd-4v3b", "curated")
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.locator("#new-project-name")).toBeVisible()
    await expect(startWith(page)).toHaveCount(0)
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
