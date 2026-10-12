import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, waitForDeviceGate, chooseDevice, createProject, waitForEditorReady } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"
import { NAVIGATOR_SIZES } from "../lib/navigator"

// The user, 2026-10-12: after Settings › Device moved a project to another
// device - the 4.3B to a phone, 800x480 to 360x679 - the navigator kept the
// old screen's size until it was moved (lib/project-device.ts).

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

const NAV_DEVICE_ID = "e2e-navchange-4v3b"
const SQUARE = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#000"/></svg>').toString("base64")

test.beforeEach(async () => {
  test.skip(
    !(await seedWaveshare4v3bDdf(NAV_DEVICE_ID, (manifest) => {
      if (!manifest.supportedObjectTypes.includes("navigator")) manifest.supportedObjectTypes.push("navigator")
    })),
    "schaltli-firmware not checked out alongside this repo",
  )
})

test("moved to a phone, the navigator fills the phone's edge", async ({ page }) => {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, NAV_DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
  const saved = await downloadProjectJson(page)
  await page.keyboard.press("Escape")
  const master = saved.screens.find((s: any) => s.isMaster)
  saved.assets = [...(saved.assets ?? []), { id: "sq", name: "sq", type: "icon", data: SQUARE }]
  master.objects.push({ id: "nav", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 50, properties: { edge: "left", shows: "iconsAndText", backgroundColor: "#e5e5e5", textColor: "#000000", activeColor: "#6750a4", activeTextColor: "#ffffff" } })
  saved.topics = [...(saved.topics ?? []), { id: "t-level", topic: "Freshwater/Level", type: "numeric", examples: ["12"] }]
  for (const s of saved.screens) if (!s.isMaster && s.screenType !== "popup") s.iconLive = { id: "lv1", source: { namespace: "topic", path: "Freshwater/Level" }, rules: [], otherwise: { kind: "icon", icon: "sq" } }
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(saved))
  const file = path.join(os.tmpdir(), `navchange-${Date.now()}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, file)

  await page.getByRole("button", { name: "Settings", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Device", exact: true }).click()
  await dialog.locator("#ddf-select").click()
  // The phone on the bench announces itself; without one there is nothing to move to.
  const phone = page.getByRole("option", { name: /P20|Android/i }).first()
  test.skip((await phone.count()) === 0, "no phone announced on the network")
  await phone.click()
  await dialog.getByRole("button", { name: "Load Device" }).click()
  await page.waitForTimeout(1500)
  await dialog.getByRole("button", { name: "Close" }).click()

  const moved = await downloadProjectJson(page)
  await page.keyboard.press("Escape")
  const nav = moved.screens.find((s: any) => s.isMaster).objects.find((o: any) => o.type === "navigator")
  // Along the left edge, as tall as the phone's screen, as deep as «Icons and text» makes it.
  expect(moved.screenHeight).not.toBe(480)
  expect({ x: nav.x, y: nav.y, width: nav.width, height: nav.height }).toEqual({ x: 0, y: 0, width: NAVIGATOR_SIZES.iconsAndText.thickness, height: moved.screenHeight })
})
