import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { chooseDevice, createProject, devicePoint, getMainCanvas, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedWaveshareDdf } from "./ddf-seed"

// The property panel of a styled gauge (docs/2026-11-23-instrument-styles.md,
// tasks/instrument-styles-todo.md I4): the style picker, what a style hides,
// the face/scale/zones fields, presets that fill labels from the range, and
// one undo step per change.

const DEVICE_ID = "e2e-instrument-panel"
const SCREEN = { width: 360, height: 360 }

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  await page.keyboard.press("Escape")
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

function gaugesOf(project: any): any[] {
  const all: any[] = []
  const walk = (objects: any[]) => {
    for (const o of objects) {
      if (o.type === "gauge") all.push(o)
      if (o.children) walk(o.children)
    }
  }
  for (const s of project.screens) walk(s.objects)
  return all
}

async function drawGauge(page: Page) {
  const { box } = await getMainCanvas(page)
  await page.getByRole("button", { name: "Gauge", exact: true }).first().click()
  await page.waitForTimeout(150)
  const a = devicePoint(box, 80, 80, SCREEN)
  const b = devicePoint(box, 280, 280, SCREEN)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

test.describe("a styled gauge's panel", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await seedWaveshareDdf({ deviceId: DEVICE_ID })), "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    await drawGauge(page)
  })

  test("Flat keeps the panel as it was; a style hides what it fixes and adds its own sections", async ({ page }) => {
    const style = page.locator("#instrumentStyle")
    await expect(style).toHaveValue("")
    await expect(page.locator("#arcThickness")).toBeVisible()
    await expect(page.locator("#arcDisplayValue")).toBeVisible()
    await expect(page.locator("#instrumentCaption")).toHaveCount(0)

    await style.selectOption("fuel")
    await expect(page.locator("#arcThickness")).toHaveCount(0)
    await expect(page.locator("#arcDisplayValue")).toHaveCount(0)
    await expect(page.locator("#instrumentCaption")).toBeVisible()
    await expect(page.locator("#instrumentMajorStep")).toBeVisible()
    // The fuel gauge on a scale without labels gets E ½ F from the range.
    await expect(page.locator("#instrumentLabels")).toHaveValue("fuel")

    await style.selectOption("")
    await expect(page.locator("#arcThickness")).toBeVisible()
  })

  test("every field lands in the project, and the words preset fills from the range", async ({ page }) => {
    await page.locator("#instrumentStyle").selectOption("fuel")
    await page.locator("#instrumentCaption").fill("Fresh water")
    await page.locator("#instrumentUnit").fill("%")
    await page.locator("#instrumentMotion").selectOption("direct")
    await page.locator("#instrumentMajorStep").fill("25")
    await page.locator("#instrumentLabels").selectOption("words")
    await page.getByRole("button", { name: "Add zone" }).click()

    const [gauge] = gaugesOf(await downloadProjectJson(page))
    const p = gauge.properties
    expect(p.style).toBe("fuel")
    expect(p.caption).toBe("Fresh water")
    expect(p.unit).toBe("%")
    expect(p.motion).toBe("direct")
    expect(p.scale.majorStep).toBe(25)
    // A new gauge's range is 0-100: LEER at 0, HALB at 50, VOLL at 100.
    expect(p.scale.labels).toEqual([
      { value: 0, text: "LEER" },
      { value: 50, text: "HALB" },
      { value: 100, text: "VOLL" },
    ])
    expect(p.zones).toEqual([{ from: 0, to: 12, kind: "danger" }])
  })

  test("a preset's label can be changed by hand, and the preset then reads Custom", async ({ page }) => {
    await page.locator("#instrumentStyle").selectOption("fuel")
    // The list item for «½» opens, its text is edited.
    await page.getByText("½", { exact: true }).first().click()
    await page.getByLabel("Text", { exact: true }).fill("HALF")
    await expect(page.locator("#instrumentLabels")).toHaveValue("custom")
  })

  test("a change is one undo step", async ({ page }) => {
    await page.locator("#instrumentStyle").selectOption("fuel")
    await page.locator("#instrumentMotion").selectOption("direct")
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await expect(page.locator("#instrumentMotion")).toHaveValue("style")
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await expect(page.locator("#instrumentStyle")).toHaveValue("")
  })
})
