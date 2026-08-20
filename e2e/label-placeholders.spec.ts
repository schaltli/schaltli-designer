import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { chooseDevice, M5DIAL_DEVICE_ID, getMainCanvas, devicePoint } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// Label placeholder tokens ({screen}/{project}/etc, lib/placeholder-utils.ts)
// used to only ever get resolved by the designer's own live renderers
// (canvas.tsx, screen-thumbnail.tsx, app/test-render) - the firmware has no
// idea they exist and rendered the raw "{screen}" text literally (live user
// report, 2026-08-18: "funktionieren im Designer, versagen aber auf dem
// Device"). Fixed by resolving them into the label's actual text at export
// time (lib/project-zip.ts's buildDeviceProjectZip). Covers both halves:
// the *device* export (Export Project/Deploy) must get the resolved text,
// while the *editable* export (Download Project, meant to be re-opened and
// re-edited) must keep the raw token, so the template survives a round trip
// instead of freezing at whatever value it last resolved to.
//
// Also fixes a related bug found while wiring this up: canvas.tsx's own
// live {project} resolution was hardcoded to a stub "ScreenBee Project"
// string (a leftover TODO, never actually wired to a real prop) - now
// threaded through from the real project.name via a new projectName prop.

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

test.describe("Label placeholder tokens", () => {
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("{screen}/{project} resolve at device-export time, but stay raw tokens in the editable/re-openable project file", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Label", exact: true }).first().click()
    await page.waitForTimeout(150)
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 20)
    const to = devicePoint(box, 180, 60)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)

    // Mix of literal text + tokens inserted via the property panel's own
    // "Insert Placeholder" dropdown, the same way a real user would - not
    // hand-typed braces.
    await page.locator("#text").fill("On ")
    await page.waitForTimeout(100)
    await page.getByRole("button", { name: "Insert Placeholder" }).click()
    await page.getByRole("menuitem", { name: "{screen}" }).click()
    await page.getByRole("button", { name: "Insert Placeholder" }).click()
    await page.getByRole("menuitem", { name: "{project}" }).click()
    await expect(page.locator("#text")).toHaveValue("On {screen}{project}")

    // Device export: both tokens must be resolved into real text.
    const deviceProject = await downloadZipProjectJson(page, "Export Project")
    const deviceScreen = deviceProject.screens.find((s: any) => s.name === "Screen 1")
    const deviceLabel = deviceScreen.objects.find((o: any) => o.type === "label")
    expect(deviceLabel.properties.text).toBe(`On Screen 1${deviceProject.name}`)
    expect(deviceLabel.properties.text).not.toContain("{screen}")
    expect(deviceLabel.properties.text).not.toContain("{project}")

    // Editable project (Download Project): the raw template must survive so
    // re-opening it can still edit/re-resolve it later.
    const editableProject = await downloadZipProjectJson(page, "Download Project")
    const editableScreen = editableProject.screens.find((s: any) => s.name === "Screen 1")
    const editableLabel = editableScreen.objects.find((o: any) => o.type === "label")
    expect(editableLabel.properties.text).toBe("On {screen}{project}")
  })
})
