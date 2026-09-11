import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { chooseDevice, ROUND_FIXTURE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// Uploading an icon from this computer (2026-09-11), for the icons Iconify
// does not have: a vehicle's own logo, a symbol off a manual, anything drawn
// in-house.
//
// This spec deliberately installs no icon-service stub, and that is half of
// what it is here to prove. Every other icon spec has to replay recorded
// Iconify and translate responses (e2e/icon-service-stub.ts) because the
// picker's search reaches the internet; this path reaches nothing at all, so
// if it ever starts making a request the run says so by hanging on a route
// nobody stubbed rather than by quietly passing.
//
// The upload stores its SVG exactly the way a fetched icon is stored
// (lib/icon-search.ts's fetchIconSvgData): a data: URL on an "icon"-type
// asset. What is asserted here is that shape and the binding - the asset
// exists, it is an icon, and the screen points at it. What is not asserted
// is the bake: an uploaded icon reaches a device through exactly the same
// export path as a searched one precisely because it is indistinguishable by
// then, and pinning that down again here would be testing asset-export.ts
// through a very long straw.

// A ring, so the hole shows whether a tint painted the shape or its box, and
// distinctive enough that finding it in an export is unambiguous.
const RING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M12 1.5A10.5 10.5 0 1 0 12 22.5A10.5 10.5 0 1 0 12 1.5ZM12 6A6 6 0 1 1 12 18A6 6 0 1 1 12 6Z"/></svg>`

test.describe("Icon upload", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-waveshare-1v8 not checked out alongside this repo")
  })

  test("an SVG from this computer becomes a usable icon, with no icon service involved", async ({ page }) => {
    // Any request to the outside is a failure here, not a slow test: this
    // path is supposed to need none. Asserted rather than assumed, because
    // "it worked offline" is exactly the kind of claim that rots.
    const outside: string[] = []
    await page.route("https://api.iconify.design/**", async (route) => {
      outside.push(route.request().url())
      await route.abort()
    })

    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
    await page.getByRole("button", { name: "Select icon" }).click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()

    await page.getByTestId("icon-upload").setInputFiles({
      name: "werkstatt-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(RING_SVG),
    })

    // Picking an icon closes the picker and flips the button's label, the
    // same two things a searched icon does.
    await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible()

    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible()

    // The file name, minus its extension, is the asset's name - so the icon
    // is findable again in the picker's own list of what the project already
    // has, rather than being an anonymous blob.
    const project = await downloadProjectJson(page)
    const uploaded = project.assets.find((a: any) => a.name === "werkstatt-logo")
    expect(uploaded, "the uploaded icon is not in the project's assets").toBeTruthy()
    expect(uploaded.type).toBe("icon")

    // Whichever screen the picker was opened for, not screens[0]: a fresh
    // project starts with a master screen and a regular one, and a master
    // never shows the icon picker at all.
    const withIcon = project.screens.filter((s: any) => s.iconAssetId)
    expect(withIcon.map((s: any) => s.iconAssetId)).toEqual([uploaded.id])

    expect(outside, `the upload path reached an icon service: ${outside.join(", ")}`).toEqual([])
  })

  test("a file that is not an SVG is refused, with a reason", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
    await page.getByRole("button", { name: "Select icon" }).click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()

    // A PNG is the realistic mistake - it is what most people have when they
    // say "I have a logo". The picker has to say why rather than accept it
    // and fail later at the tint or the bake.
    await page.getByTestId("icon-upload").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })

    await expect(page.getByText(/not an SVG/i)).toBeVisible()
    // Still open, so the mistake can be corrected without starting over.
    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()
  })
})

async function downloadProjectJson(page: import("@playwright/test").Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}
