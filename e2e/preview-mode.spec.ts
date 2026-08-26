import { test, expect } from "@playwright/test"
import {
  COMBINED_TEST_PROJECT,
  loadProject,
  clickButton0,
  getMainCanvas,
  devicePoint,
  M5DIAL_SCREEN,
} from "./helpers"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"

// Preview mode makes buttons functional exactly as they would be at
// runtime (screen navigation / MQTT actions) and swaps the right-hand
// property panel for a Topic Values panel that simulates incoming MQTT
// messages purely client-side (see handlePreviewButtonAction /
// TopicValuesPanel in project-editor.tsx). These tests exercise the
// actual dispatch pipeline - button click -> action -> screen navigation /
// simulated publish - not just that the mode toggles visually.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// Built by patching a fixture that is known to load rather than by writing a
// project from scratch: a hand-written one did not get past the startup gate,
// and a test that cannot open its own fixture proves nothing about preview.
//
// The fixture's Switch already describes a full round trip - three states
// whose readValue and writeValue match ("off"/"low"/"high") on
// test/switch-cmd -> test/switch-mode. Added here: a button publishing to a
// command topic nothing on screen reads, and a Mock Response on that topic
// giving it its consequence.
async function projectWithSwitchAndRule(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))

  project.topics.push({
    id: "t-all",
    topic: "test/all-off",
    type: "text",
    examples: ["aus"],
    mock: [{ id: "r", when: "aus", then: [{ id: "e", topic: "test/switch-mode", kind: "set", value: "off" }] }],
  })

  project.screens[0].objects.push({
    id: "obj-all-off",
    type: "SoftwareButton",
    zIndex: 5,
    x: 10,
    y: 100,
    width: 220,
    height: 46,
    properties: {
      text: "Alles AUS",
      backgroundColor: "#ffffff",
      borderColor: "#000000",
      textColor: "#000000",
      borderWidth: 1,
      cornerRadius: 0,
      action: { type: "send-mqtt", mqttTopic: "test/all-off", mqttMessage: "aus" },
    },
  })

  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `preview-loop-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}


// Until 2026-08-25 a Switch tap in preview did nothing whatsoever - no
// handler for it existed anywhere in the UI - and a SoftwareButton's
// send-mqtt wrote its payload onto the *command* topic, which no object on
// screen reads. Both looked like preview limitations; both were the same
// missing half: the command-to-state loop, which on a device is Node-RED's
// job and here is lib/mock-engine.js's.
//
// That mattered beyond preview being dull. A Switch whose writeValue matched
// no state's readValue would have looked identical - inert - to one wired
// correctly, so preview could not tell you your project was wrong. Now the
// tap goes the way it goes on the device.
test.describe("preview drives the real round trip", () => {
  const modeValue = (page: import("@playwright/test").Page) =>
    page
      .locator("label", { hasText: "test/switch-mode" })
      .first()
      .locator("xpath=../..")
      .locator("input, textarea")
      .first()

  test("tapping a Switch publishes its command and the answer comes back", async ({ page }) => {
    const zipPath = await projectWithSwitchAndRule()
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await page.waitForTimeout(300)

      // devicePoint, not a fraction of the canvas box: the box is the whole
      // available area and the device block recenters inside it, so a
      // fraction lands somewhere else entirely as soon as a panel changes
      // width - see that helper's own comment for the two specs that broke
      // exactly that way.
      const { box } = await getMainCanvas(page)
      const tap = async (x: number, y: number) => {
        const point = devicePoint(box, x, y, M5DIAL_SCREEN)
        await page.mouse.click(point.x, point.y)
      }

      // The Switch spans x 10..230 with three segments, so the third one
      // ("high") starts around x 157.
      await tap(200, 45)
      await page.waitForTimeout(400)
      await expect(modeValue(page)).toHaveValue("high")

      // The first segment, the other value. A tap that always produced the
      // same answer would pass the assertion above on its own.
      await tap(40, 45)
      await page.waitForTimeout(400)
      await expect(modeValue(page)).toHaveValue("off")
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  test("a button's command gets its effect from the declared rule, not from a toast", async ({ page }) => {
    const zipPath = await projectWithSwitchAndRule()
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await page.waitForTimeout(300)

      // devicePoint, not a fraction of the canvas box: the box is the whole
      // available area and the device block recenters inside it, so a
      // fraction lands somewhere else entirely as soon as a panel changes
      // width - see that helper's own comment for the two specs that broke
      // exactly that way.
      const { box } = await getMainCanvas(page)
      const tap = async (x: number, y: number) => {
        const point = devicePoint(box, x, y, M5DIAL_SCREEN)
        await page.mouse.click(point.x, point.y)
      }

      await tap(200, 45)
      await page.waitForTimeout(400)
      await expect(modeValue(page)).toHaveValue("high")

      // "Alles AUS" publishes to test/all-off, which no object on screen
      // reads. Before the rules existed this could only ever raise a toast;
      // the declared Mock Response turns it into the state change it stands
      // for.
      await tap(120, 123)
      await page.waitForTimeout(400)
      await expect(modeValue(page)).toHaveValue("off")
    } finally {
      fs.unlinkSync(zipPath)
    }
  })
})

test("preview mode swaps the property panel for Topic Values and back", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)

  await expect(page.getByText("Objects", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)

  await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible()
  await expect(page.getByText("MQTT Topic Values")).toBeVisible()
  await expect(page.getByText("Objects", { exact: true })).toHaveCount(0)

  await page.getByRole("button", { name: "Exit Preview" }).click()
  await page.waitForTimeout(300)

  await expect(page.getByText("Objects", { exact: true })).toBeVisible()
  await expect(page.getByText("MQTT Topic Values")).toHaveCount(0)
})

test("editing a topic value in preview mode simulates a received message", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)

  const label = page.locator("label", { hasText: "test/zone-level" }).first()
  const input = label.locator("xpath=../..").locator("input, textarea").first()
  await input.fill("77")
  await expect(input).toHaveValue("77")
})

test("a hardware button dispatches its configured action instead of opening its config panel", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  // Scoped to a real <button> (screens-panel.tsx's row) rather than a plain
  // getByText - the object tree's "Screen" root (2026-08-16) shows the same
  // screen name as its own plain (non-button) row, which a bare text match
  // would otherwise also catch.
  const originalScreenRow = page.getByRole("button", { name: "label-tests-white-background" })
  await expect(originalScreenRow).toBeVisible()
  // The screen row's own button carries "bg-accent" only while it's the
  // one actually being edited (see screens-panel.tsx's isSelected) - this
  // is what distinguishes "currently editing" from "just visible in the
  // list", which every thumbnail always is.
  await expect(originalScreenRow).toHaveClass(/bg-accent/)

  // Configure button-10's action for this screen (normal mode). The panel
  // carries no heading of its own (2026-08-16 - trimmed down to just the
  // dropdown, see hardware-button-side-panel.tsx) - its button-name line
  // ("Button 10") is what stands in for "is the panel open" here.
  await clickButton0(page)
  const panelHeading = page.locator("div.font-medium", { hasText: "Button 10" }).first()
  await expect(panelHeading).toBeVisible()

  const actionTypeTrigger = page.locator("label:has-text('Action Type') + button, label:has-text('Action Type') ~ button").first()
  await actionTypeTrigger.click()
  await page.getByRole("option", { name: "Previous Screen" }).first().click()
  await expect(actionTypeTrigger).toHaveText("Previous Screen")

  // Enter preview mode - the still-open config panel must not be left
  // stranded on screen once the panel that would normally own closing it
  // (PropertyPanel) is swapped out.
  await page.getByRole("button", { name: "Preview", exact: true }).click()
  await page.waitForTimeout(300)
  await expect(panelHeading).toHaveCount(0)

  // Clicking the same button now dispatches its action instead of
  // reopening a config panel.
  await clickButton0(page)
  await expect(page.getByText("→ Previous screen").first()).toBeVisible()
  await expect(panelHeading).toHaveCount(0)

  // Navigating via a preview button must never change what's actually
  // being edited - exiting preview mode returns to the original screen.
  await page.getByRole("button", { name: "Exit Preview" }).click()
  await page.waitForTimeout(300)
  await expect(originalScreenRow).toHaveClass(/bg-accent/)
})
