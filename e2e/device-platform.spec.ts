import { test, expect } from "@playwright/test"
import fs from "node:fs"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { seedWaveshareDdf } from "./ddf-seed"

// Reported from the van, 2026-09-27: a project made for the 4.3B was given the
// phone's DDF, and every device field came across except the platform - it
// still said "firmware", so it was exported and deployed as a board's bundle
// (BMPs, every Switch icon in a white or black box). The platform is the
// device's, like its name and its fonts, and comes with the DDF wherever a
// project takes one: when it is opened, and when another is loaded in its
// settings.
test("a project on a phone's DDF is exported for the phone, whatever it said before", async ({ page }, testInfo) => {
  const deviceId = `e2e-android-platform-${testInfo.testId}`
  const seeded = await seedWaveshareDdf({
    deviceId,
    mutateDeviceJson: (manifest) => {
      manifest.device.platform = "android"
    },
  })
  test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")

  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.settings.deviceId = deviceId
  project.settings.devicePlatform = "firmware"
  // Opened from the device on this instance, not from a copy in the file.
  delete project.embeddedDdfZipBase64
  zip.file("project.json", JSON.stringify(project))
  const projectPath = testInfo.outputPath("was-a-board.zip")
  fs.writeFileSync(projectPath, await zip.generateAsync({ type: "nodebuffer" }))

  await loadProject(page, projectPath)
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export Project" }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/-android\.zip$/)
})
