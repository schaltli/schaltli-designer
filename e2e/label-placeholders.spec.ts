import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { createProject, chooseDevice, ROUND_FIXTURE_DEVICE_ID, getMainCanvas, devicePoint, waitForDeviceGate } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// What the export does with placeholders in a text (docs/2026-09-25-text-
// placeholders.md): {project:name} never changes after export, so it is
// written in; everything else - {topic:…}, {device:…}, escaped braces, and
// anything unknown such as the old {screen} - goes to the device as written,
// for the device to resolve live. The editable project (Download Project)
// keeps the text exactly as typed, so re-opening it edits the template, not
// a frozen copy.
//
// Until 2026-09-25 this file tested the seven export-time tokens ({screen},
// {project}, {export_date}, …), which the export resolved and the device
// never saw. They were never released and are gone; a leftover one is now
// just text.

async function downloadZipProjectJson(page: Page, menuItemName: string): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: menuItemName }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))

  // "Export Project"'s own DropdownMenuItem calls e.preventDefault() on
  // Radix's onSelect (project-editor.tsx), so the File menu doesn't auto-
  // close after triggering it like every other item does - close it
  // explicitly so a second call to this helper can reopen it cleanly.
  await page.keyboard.press("Escape")

  return project
}

test.describe("Placeholders in the export", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("{project:name} is written in for the device; the rest stays for the device; the editable file keeps what was typed", async ({
    page,
  }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    await page.waitForTimeout(150)
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 20)
    const to = devicePoint(box, 180, 60)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)

    const typed = "{project:name} - {topic:a/b:F1} {device:id} {screen} {{x}}"
    await page.locator("#text").fill(typed)
    await expect(page.locator("#text")).toHaveValue(typed)
    // The old tokens' button row is gone with them.
    await expect(page.getByRole("button", { name: "{screen}", exact: true })).toHaveCount(0)

    const deviceProject = await downloadZipProjectJson(page, "Export Project")
    const deviceScreen = deviceProject.screens.find((s: any) => s.name === "Screen 1")
    const deviceText = deviceScreen.objects.find((o: any) => o.type === "text")
    expect(deviceText.properties.text).toBe(`${deviceProject.name} - {topic:a/b:F1} {device:id} {screen} {{x}}`)

    const editableProject = await downloadZipProjectJson(page, "Download Project")
    const editableScreen = editableProject.screens.find((s: any) => s.name === "Screen 1")
    const editableText = editableScreen.objects.find((o: any) => o.type === "text")
    expect(editableText.properties.text).toBe(typed)
  })
})
