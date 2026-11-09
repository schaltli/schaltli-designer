import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { chooseDevice, createProject, loadProject, objectTreeRow, openFrameSection, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedPapers3Ddf, seedRoundFixtureDdf, seedWaveshare4Ddf } from "./ddf-seed"
import { CAMERA_MAX, CAMERA_MIN, clampCameraSize } from "../lib/camera-size"
import { placedSize } from "../lib/placing"

// The Camera in the designer (docs/2026-11-09-camera.md, T4): its size, its
// fields, and only where the device declares it. Devices: hil/waveshare4v3b/camera.js.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

async function projectWithCamera(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects = [
    {
      id: "obj-camera",
      type: "camera",
      zIndex: 1,
      x: 40,
      y: 60,
      width: 200,
      height: 150,
      properties: { url: "http://192.168.1.50/capture", username: "", password: "" },
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `camera-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

test.describe("Camera size", () => {
  test("stays between what a device can draw", () => {
    expect(clampCameraSize(10, 10)).toEqual(CAMERA_MIN)
    expect(clampCameraSize(999, 999)).toEqual(CAMERA_MAX)
    expect(clampCameraSize(200, 150)).toEqual({ width: 200, height: 150 })
  })

  test("a new one is placed at the size a device shows best", () => {
    expect(placedSize("camera", 8)).toEqual(CAMERA_MAX)
  })
})

test.describe("Camera in the property panel", () => {
  test.beforeEach(async () => {
    await seedRoundFixtureDdf()
  })

  async function select(page: Page) {
    await loadProject(page, await projectWithCamera())
    await objectTreeRow(page, "obj-camera").click()
  }

  test("URL, Username and a masked Password", async ({ page }) => {
    await select(page)
    await expect(page.locator("#cameraUrl")).toHaveValue("http://192.168.1.50/capture")
    await page.locator("#cameraUrl").fill("http://10.0.0.7/shot.jpg")
    await expect(page.locator("#cameraUrl")).toHaveValue("http://10.0.0.7/shot.jpg")
    await page.locator("#cameraUsername").fill("van")
    await expect(page.locator("#cameraPassword")).toHaveAttribute("type", "password")
    await page.locator("#cameraPassword").fill("geheim")

    // The fields show the object's own values, so these were written to it.
    await expect(page.locator("#cameraUrl")).toHaveValue("http://10.0.0.7/shot.jpg")
    await expect(page.locator("#cameraUsername")).toHaveValue("van")
    await expect(page.locator("#cameraPassword")).toHaveValue("geheim")
  })

  test("the Frame cannot make it larger than a device draws", async ({ page }) => {
    await select(page)
    await openFrameSection(page)
    await page.locator("#width").fill("999")
    await page.locator("#width").blur()
    await expect(page.locator("#width")).toHaveValue(String(CAMERA_MAX.width))
  })
})

test.describe("Camera in the palette", () => {
  async function paletteOn(page: Page, deviceId: string) {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    return page.getByTestId("palette").getByRole("button", { name: "Camera", exact: true })
  }

  test("offered on a device that declares it", async ({ page }) => {
    const deviceId = "e2e-camera-waveshare-4"
    test.skip(!(await seedWaveshare4Ddf(deviceId)), "schaltli-firmware not checked out")
    await expect(await paletteOn(page, deviceId)).toBeVisible()
  })

  test("not offered on one that does not", async ({ page }) => {
    const deviceId = "e2e-camera-papers3"
    test.skip(!(await seedPapers3Ddf(deviceId)), "schaltli-firmware not checked out")
    await expect(await paletteOn(page, deviceId)).toHaveCount(0)
  })
})
