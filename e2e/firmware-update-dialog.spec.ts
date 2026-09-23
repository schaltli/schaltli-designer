import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { createHash, randomBytes } from "node:crypto"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// The firmware half of the Deploy dialog (docs/2026-09-15-firmware-ota.md,
// step 6), against the local broker like e2e/deploy-dialog.spec.ts: the
// "device" is this test's own MQTT client publishing hello and deploy-status
// the way the firmware's FirmwareUpdater does. The firmware side - download,
// checks, install - is hil/firmware-ota.js against real boards, which sends
// the same trigger this asserts the dialog publishes.
//
// The release shipped with the designer is stubbed per test through
// page.route(): firmware/manifest.json is one file for the whole dev server,
// and tests run in parallel with a device id each. What the server makes of a
// real manifest is e2e/firmware-build.spec.ts.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const TRIGGER_KEYS = ["build", "deviceId", "force", "sha256", "size", "updateId", "url"]

test.describe("Firmware in the Deploy dialog", () => {
  let deviceClient: mqtt.MqttClient
  let instanceId: string
  let deviceId: string
  let boundProject: string

  test.beforeEach(async ({}, testInfo) => {
    instanceId = `e2e-fw-${testInfo.testId}`
    deviceId = `e2e-fw-kind-${testInfo.testId}`.toLowerCase()
    boundProject = testInfo.outputPath("bound-project.zip")
    const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.settings.deviceId = deviceId
    zip.file("project.json", JSON.stringify(project, null, 2))
    await writeFile(boundProject, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
    deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-fw-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })
  })

  test.afterEach(async () => {
    for (const leaf of ["hello", "status", "firmware", "deploy"]) {
      deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/${leaf}`, "", { retain: true })
    }
    await new Promise((r) => setTimeout(r, 200))
    deviceClient.end()
    await rm(join(__dirname, "..", ".data", "firmware-uploads", `${instanceId}.bin`), { force: true })
    await rm(join(__dirname, "..", ".data", "ddf", `${deviceId}.ddf.zip`), { force: true })
  })

  const announce = (firmwareBuild: string | undefined, online = true) => {
    deviceClient.publish(
      `${TOPIC_PREFIX}/${instanceId}/hello`,
      JSON.stringify({ deviceId, name: `Van Panel ${instanceId}`, firmwareBuild, systemGeneration: "1.0" }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/status`, online ? "online" : "offline", { retain: true })
  }

  const stubRelease = async (page: Page, build: string, available = true) => {
    const release = {
      build,
      file: `${deviceId}-${build}.bin`,
      size: 1_808_192,
      sha256: "ab".repeat(32),
      systemGeneration: "1.0",
      url: `http://192.0.2.1:3000/api/firmware/release/${deviceId}-${build}.bin`,
      available,
    }
    await page.route("**/api/firmware/release", (route) =>
      route.fulfill({ json: { release: build, devices: { [deviceId]: release } } }),
    )
    return release
  }

  const openDialog = async (page: Page) => {
    await loadProject(page, boundProject)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
  }

  const row = (page: Page) => page.getByRole("button").filter({ hasText: `Van Panel ${instanceId}` })

  const nextTrigger = () =>
    new Promise<Record<string, unknown>>((resolve) => {
      const topic = `${TOPIC_PREFIX}/${instanceId}/firmware`
      deviceClient.subscribe(topic, () => {})
      deviceClient.on("message", (t, message) => {
        if (t === topic && message.length > 0) resolve(JSON.parse(message.toString()))
      })
    })

  const publishStatus = (id: string, state: string, extra: Record<string, unknown> = {}) =>
    deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/deploy-status`, JSON.stringify({ deployId: id, state, ...extra }))

  test("points out a newer release, and installs it through the retained trigger", async ({ page }) => {
    const release = await stubRelease(page, "fw-2026.09.15.2")
    announce("fw-2026.09.15.1")
    await openDialog(page)

    await expect(row(page).getByText("firmware update")).toBeVisible()
    await row(page).click()
    const section = page.getByTestId("firmware-section")
    await expect(section.getByText("A newer firmware is available.")).toBeVisible()
    await expect(section.getByText("fw-2026.09.15.1", { exact: true })).toBeVisible()
    await expect(section.getByText("fw-2026.09.15.2", { exact: true })).toBeVisible()

    const trigger = nextTrigger()
    await section.getByRole("button", { name: "Update firmware" }).click()
    // Asks once more before anything is sent.
    await expect(section.getByText(/Install fw-2026\.09\.15\.2 on Van Panel/)).toBeVisible()
    await section.getByRole("button", { name: "Install firmware" }).click()

    const sent = await trigger
    // Exactly the fields the firmware's FirmwareUpdater reads - a renamed one
    // would be ignored by the device without a word.
    expect(Object.keys(sent).sort()).toEqual(TRIGGER_KEYS)
    expect(sent).toMatchObject({
      url: release.url,
      sha256: release.sha256,
      size: release.size,
      deviceId,
      build: release.build,
      force: false,
    })

    const id = sent.updateId as string
    publishStatus(id, "downloading", { percent: 50 })
    await expect(page.getByText(`Van Panel ${instanceId}: Firmware update - Downloading`)).toBeVisible()
    publishStatus(id, "verifying")
    await expect(page.getByText(`Van Panel ${instanceId}: Firmware update - Verifying`)).toBeVisible()
    publishStatus(id, "rebooting")
    await expect(page.getByText(`Van Panel ${instanceId}: Firmware update - Rebooting`)).toBeVisible()
  })

  test("a release that has not been fetched is shown but cannot be installed", async ({ page }) => {
    await stubRelease(page, "fw-2026.09.15.2", false)
    announce("fw-2026.09.15.1")
    await openDialog(page)

    // No hint for an update the designer could not serve.
    await expect(row(page)).toBeVisible()
    await expect(row(page).getByText("firmware update")).not.toBeVisible()
    await row(page).click()
    const section = page.getByTestId("firmware-section")
    await expect(section.getByText(/has not been downloaded to this designer yet/)).toBeVisible()
    await expect(section.getByRole("button", { name: "Update firmware" })).toBeDisabled()
  })

  test("it names the way in for a board that never appeared", async ({ page }) => {
    // Everything else here updates a device already on the broker. Someone
    // whose new board is not in the list needs the USB way instead, and this
    // panel is where they find out it is missing - so the link out lives here
    // (docs/2026-09-18-factory-image.md, decision 10).
    await stubRelease(page, "fw-2026.09.15.2")
    announce("fw-2026.09.15.1")
    await openDialog(page)
    await row(page).click()

    const link = page.getByTestId("firmware-section").getByTestId("flasher-link")
    await expect(link).toHaveText("Flash it over USB")
    await expect(link).toHaveAttribute("href", "https://matthias-hess.github.io/schaltli-designer/flasher/")
    await expect(link).toHaveAttribute("target", "_blank")
  })

  test("a device on the release, or ahead of it, is not pointed at it", async ({ page }) => {
    await stubRelease(page, "fw-2026.09.15.2")
    announce("fw-2026.09.15.2-4-g0123456789")
    await openDialog(page)

    await expect(row(page)).toBeVisible()
    await expect(row(page).getByText("firmware update")).not.toBeVisible()
    await row(page).click()
    const section = page.getByTestId("firmware-section")
    await expect(section.getByText("The device runs a development build newer than the release.")).toBeVisible()

    // Installing the release over it anyway is allowed, and forced - the
    // device must not answer "up to date" to a deliberate downgrade.
    const trigger = nextTrigger()
    await section.getByRole("button", { name: "Install release" }).click()
    await section.getByRole("button", { name: "Install firmware" }).click()
    expect((await trigger).force).toBe(true)
  })

  test("an image from a file is uploaded, served back byte for byte, and installed forced", async ({ page }) => {
    await stubRelease(page, "fw-2026.09.15.2")
    announce("fw-2026.09.15.2")
    await openDialog(page)
    await row(page).click()
    const section = page.getByTestId("firmware-section")

    const image = Buffer.concat([randomBytes(60_000), Buffer.from(`<<schaltli-image device=${deviceId}>>`), randomBytes(20_000)])
    await section.getByTestId("firmware-file-input").setInputFiles({ name: "firmware.bin", mimeType: "application/octet-stream", buffer: image })
    await expect(section.getByText(/Install "firmware.bin" on Van Panel/)).toBeVisible()

    const trigger = nextTrigger()
    await section.getByRole("button", { name: "Install firmware" }).click()
    const sent = await trigger
    expect(sent).toMatchObject({
      deviceId,
      size: image.length,
      sha256: createHash("sha256").update(image).digest("hex"),
      force: true,
    })
    expect(sent.url).toContain(`/api/firmware/upload/${instanceId}`)

    // What the device would GET.
    const served = await page.request.get(sent.url as string)
    expect(served.status()).toBe(200)
    expect(createHash("sha256").update(await served.body()).digest("hex")).toBe(sent.sha256)

    publishStatus(sent.updateId as string, "error", { error: "Checksum mismatch" })
    await expect(page.getByText("Checksum mismatch").first()).toBeVisible()
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByTestId("firmware-section").getByText("Checksum mismatch")).toBeVisible()
  })

  test("an image for another device is refused before anything is sent", async ({ page }) => {
    await stubRelease(page, "fw-2026.09.15.2")
    announce("fw-2026.09.15.2")
    await openDialog(page)
    await row(page).click()
    const section = page.getByTestId("firmware-section")

    let triggered = false
    deviceClient.subscribe(`${TOPIC_PREFIX}/${instanceId}/firmware`)
    deviceClient.on("message", (t, message) => {
      if (t === `${TOPIC_PREFIX}/${instanceId}/firmware` && message.length > 0) triggered = true
    })

    const foreign = Buffer.concat([randomBytes(30_000), Buffer.from("<<schaltli-image device=some-other-board>>")])
    await section.getByTestId("firmware-file-input").setInputFiles({ name: "other.bin", mimeType: "application/octet-stream", buffer: foreign })
    await section.getByRole("button", { name: "Install firmware" }).click()
    // Far longer than the default wait, because the refusal comes from the
    // SERVER: the image is uploaded first and app/api/firmware/upload reads
    // its marker (the device is never told, which is the point of the test).
    // The section says "Uploading..." until that round trip returns, and on a
    // busy machine with a cold dev server it has taken well past twenty
    // seconds - the failure this spec kept showing in full-suite runs while
    // passing on its own. What is asserted is WHAT is refused, not how fast.
    await expect(section.getByText(`This firmware is for some-other-board, not ${deviceId}.`)).toBeVisible({
      timeout: 60000,
    })

    const unmarked = randomBytes(30_000)
    await section.getByTestId("firmware-file-input").setInputFiles({ name: "random.bin", mimeType: "application/octet-stream", buffer: unmarked })
    await section.getByRole("button", { name: "Install firmware" }).click()
    await expect(section.getByText(/not a Schaltli firmware image/)).toBeVisible({ timeout: 60000 })

    await page.waitForTimeout(500)
    expect(triggered).toBe(false)
  })

  test("offers a phone nothing, because a phone has no firmware", async ({ page }) => {
    // A phone announces `platform: "android"`; a board says nothing, and an
    // absent field reads as "firmware" - the same rule its DDF follows. The
    // app is this target's firmware and it comes from a shop, so every
    // control in this section is an offer nobody could take: there is no
    // release to serve it, no image to upload to it, and it does not restart
    // when an install is done.
    await stubRelease(page, "fw-2026.09.15.2")
    deviceClient.publish(
      `${TOPIC_PREFIX}/${instanceId}/hello`,
      JSON.stringify({
        deviceId,
        name: `Van Panel ${instanceId}`,
        firmwareVersion: "0.1.0",
        systemGeneration: "1.0",
        platform: "android",
      }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/status`, "online", { retain: true })
    await openDialog(page)
    await row(page).click()

    const section = page.getByTestId("firmware-section")
    await expect(section.getByText("This device runs the Schaltli app, so there is no firmware to update here.")).toBeVisible()
    // Where the app comes from instead - the signed APK on the app's own
    // Releases page, not a domain that serves nothing (issue #12).
    const app = section.getByTestId("android-app-link")
    await expect(app).toHaveAttribute("href", "https://github.com/Matthias-Hess/schaltli-android/releases/latest")
    await expect(app).toHaveAttribute("target", "_blank")
    await expect(section.getByRole("button")).toHaveCount(0)
    // Not even the "a newer firmware is available" line the stubbed release
    // would otherwise produce: there is nothing for it to be newer than.
    await expect(section.getByText("A newer firmware is available.")).toHaveCount(0)
    await expect(row(page).getByText("firmware update")).toHaveCount(0)
  })
})
