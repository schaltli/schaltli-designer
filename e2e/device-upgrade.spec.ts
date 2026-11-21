import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { computeDdfHash } from "../lib/ddf-name"
import { deviceGain, findDeviceUpgrade } from "../lib/device-upgrade"
import type { DeviceDescriptionListEntry } from "../lib/device-description"

// A project keeps the description it was made with. After an update of the
// designer, the firmware or the app, its device can do more - and the offer
// to take that on sat in Settings › Device, where nobody looked (the user,
// 2026-11-21). Now a bar above the canvas says so for as long as the project
// has the older one, and never offers a step back.

test.describe("what a description gains", () => {
  test("only one that has everything and more is a gain", () => {
    const have = { supportedObjectTypes: ["text", "box"], supportedFeatures: ["charts"] }
    expect(deviceGain(have, { supportedObjectTypes: ["text", "box", "navigator"], supportedFeatures: ["charts"] })).toEqual({
      newTypes: ["navigator"],
      newFeatures: [],
    })
    expect(deviceGain(have, { supportedObjectTypes: ["text", "box"], supportedFeatures: ["charts", "guard"] })).toEqual({
      newTypes: [],
      newFeatures: ["guard"],
    })
    // The same, a step back, and a swap are none.
    expect(deviceGain(have, have)).toBeNull()
    expect(deviceGain(have, { supportedObjectTypes: ["text"], supportedFeatures: ["charts"] })).toBeNull()
    expect(deviceGain(have, { supportedObjectTypes: ["text", "navigator"], supportedFeatures: ["charts"] })).toBeNull()
  })

  test("the designer's own copy comes before one a device announced; a project without types gains nothing", () => {
    const entry = (source: "curated" | "auto-discovered", ddfHash: string, types: string[]): DeviceDescriptionListEntry => ({
      name: `${ddfHash}.zip`,
      path: `/${source}/${ddfHash}.zip`,
      deviceId: "dev",
      deviceName: "Dev",
      ddfHash,
      source,
      adornmentSvg: null,
      supportedObjectTypes: types,
      supportedFeatures: [],
    })
    const entries = [entry("auto-discovered", "b", ["text", "chart"]), entry("curated", "c", ["text", "navigator"])]
    const settings = { deviceId: "dev", ddfHash: "a", supportedObjectTypes: ["text"], supportedFeatures: [] }
    expect(findDeviceUpgrade(settings, entries)?.ddfHash).toBe("c")
    // Once on the designer's copy, the device's (with a chart, without the
    // navigator) is a swap, not a gain.
    expect(findDeviceUpgrade({ ...settings, ddfHash: "c", supportedObjectTypes: ["text", "navigator"] }, entries)).toBeNull()
    expect(findDeviceUpgrade({ ...settings, supportedObjectTypes: undefined }, entries)).toBeNull()
    expect(findDeviceUpgrade({ ...settings, deviceId: "other" }, entries)).toBeNull()
  })
})

async function ddf(id: string, name: string, types: string[]) {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      device: { id, name },
      screen: { width: 400, height: 300, colorDepth: "24bit" },
      adornment: { svgPath: "adornment.svg" },
      fonts: [],
      supportedObjectTypes: types,
    }),
  )
  zip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect id="screen" x="0" y="0" width="400" height="300" fill="none" stroke="none"/></svg>`,
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

test("a newer description of the project's device is offered above the canvas until taken; an older one never", async ({ page }, testInfo) => {
  const deviceId = `e2e-upgrade-${testInfo.testId}`
  const name = `Upgrade Device ${testInfo.testId}`
  // The one place a device's announced description lands - each upload
  // replaces the one before, as a device's new hello does.
  const store = async (types: string[]) => {
    const bytes = await ddf(deviceId, name, types)
    const res = await page.request.post(
      `/api/ddf/upload?deviceId=${encodeURIComponent(deviceId)}&ddfHash=${computeDdfHash(new Uint8Array(bytes))}`,
      { data: bytes, headers: { "Content-Type": "application/zip" } },
    )
    expect(res.ok(), await res.text()).toBe(true)
  }
  const lookAgain = () => page.evaluate(() => window.dispatchEvent(new Event("focus")))
  const bar = page.getByTestId("device-upgrade-bar")

  try {
    // A project made with the device's old description: nothing to offer.
    await store(["text", "box"])
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    await expect(bar).toHaveCount(0)

    // The device now has one with the navigator: offered, naming it.
    await store(["text", "box", "navigator"])
    await lookAgain()
    await expect(bar).toBeVisible({ timeout: 10000 })
    await expect(bar).toContainText("New: Navigator.")

    // Taken: the bar goes and stays gone.
    await bar.getByRole("button", { name: "Update device" }).click()
    await expect(bar).toHaveCount(0, { timeout: 10000 })
    await lookAgain()
    await page.waitForTimeout(1000)
    await expect(bar).toHaveCount(0)

    // The device back on an older one (a firmware not yet updated): no step
    // back is offered.
    await store(["text"])
    await lookAgain()
    await page.waitForTimeout(1000)
    await expect(bar).toHaveCount(0)
  } finally {
    await rm(join(__dirname, "..", ".data", "ddf", `${deviceId}.ddf.zip`), { force: true })
  }
})
