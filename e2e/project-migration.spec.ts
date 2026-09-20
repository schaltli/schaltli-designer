import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { loadProject, objectTreeRow, chooseDevice, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedRoundFixtureDdf, seedWaveshareDdf } from "./ddf-seed"

// A project written before 2026-09-20 still opens
// (docs/2026-09-20-control-split.md, `migrateProject`).
//
// Every fixture in test-projects/ carries the new names now, so nothing else
// in the suite would notice if the migration stopped working - and what it
// protects is not a test fixture but the 3000-odd snapshots under .data/
// and every project file the user has on disk. A Level Indicator whose type
// no longer resolves does not fail loudly: it renders as nothing.
//
// The split is decided by the write topic alone, which is the one rule worth
// pinning twice: a level with a target marker but nothing to publish is a
// Bar that shows where the value should be - a thermostat readout on a
// display with no touch - not a Slider nobody can move.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

const box = (n: number) => ({ x: 10, y: 10 + n * 30, width: 60, height: 24, zIndex: n + 1 })

// The names as they were, with the properties that decide each split.
const OLD_OBJECTS = [
  { id: "old-label", type: "label", ...box(0), properties: { text: "Wohnzimmer" } },
  { id: "old-field", type: "MqttDataField", ...box(1), properties: { topic: "diag/plain" } },
  // The legacy alias, which was never creatable and is now gone entirely.
  { id: "old-ghost", type: "field", ...box(2), properties: { topic: "diag/plain" } },
  { id: "old-icon-field", type: "MQTTIconField", ...box(3), properties: { topic: "diag/plain", valueIconPairs: [] } },
  { id: "old-bar", type: "level-indicator", ...box(4), properties: { topic: "diag/plain" } },
  // A target to show, nothing to publish: still only a Bar.
  { id: "old-bar-setpoint", type: "level-indicator", ...box(5), properties: { topic: "diag/plain", setpointTopic: "diag/plain/nested" } },
  { id: "old-slider", type: "level-indicator", ...box(6), properties: { topic: "diag/plain", writeTopic: "test/switch-cmd", step: 1 } },
  { id: "old-gauge", type: "arc-level", ...box(7), properties: { topic: "diag/plain" } },
  { id: "old-dial", type: "arc-level", ...box(8), properties: { topic: "diag/plain", writeTopic: "test/switch-cmd", step: 1 } },
  { id: "old-group", type: "Switch", ...box(9), properties: { topic: "diag/plain", writeTopic: "test/switch-cmd", mode: "segmented", states: [] } },
  { id: "old-knob", type: "Switch", ...box(10), properties: { topic: "diag/plain", writeTopic: "test/switch-cmd", mode: "single", states: [] } },
  { id: "old-button", type: "SoftwareButton", ...box(11), properties: { text: "Licht", action: { type: "next-screen" } } },
  {
    id: "old-tabs",
    type: "tab-control",
    ...box(12),
    properties: { topic: "diag/plain" },
    children: [
      { id: "old-panel", type: "panel", x: 0, y: 0, width: 60, height: 24, zIndex: 0, properties: { comparisonOperator: "==", comparisonValue: "a" }, children: [] },
    ],
  },
]

const EXPECTED_HEADER: Array<[string, string]> = [
  ["old-label", "Text"],
  ["old-field", "Live Text"],
  ["old-ghost", "Live Text"],
  ["old-icon-field", "Live Icon"],
  ["old-bar", "Bar"],
  ["old-bar-setpoint", "Bar"],
  ["old-slider", "Slider"],
  ["old-gauge", "Gauge"],
  ["old-dial", "Dial"],
  ["old-group", "Button Group"],
  ["old-knob", "Switch"],
  ["old-button", "Button"],
  ["old-tabs", "Switcher"],
  ["old-panel", "Panel"],
]

// A DDF of that age on a device with touch: it declared the two types that
// needed one.
const OLD_TOUCH_DECLARATION = [
  "MqttDataField", "MQTTIconField", "label", "level-indicator", "arc-level",
  "icon", "line", "box", "SoftwareButton", "Switch", "MqttDataLine", "tab-control", "panel",
]
// And the e-paper's, which declared neither.
const OLD_TOUCHLESS_DECLARATION = [
  "MqttDataField", "MQTTIconField", "icon", "label", "level-indicator", "arc-level",
  "line", "MqttDataLine", "box", "tab-control", "panel",
]

async function projectWithOldNames(declaration = OLD_TOUCH_DECLARATION): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects = OLD_OBJECTS
  project.settings.supportedObjectTypes = declaration
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `old-names-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

test.describe("a project written before the control split", () => {
  test("opens, and every object is the type it always was", async ({ page }) => {
    test.skip(!(await seedRoundFixtureDdf()), "screenbee-firmware not checked out alongside this repo")
    test.setTimeout(120_000)
    await loadProject(page, await projectWithOldNames())

    for (const [id, header] of EXPECTED_HEADER) {
      await objectTreeRow(page, id).click()
      await expect
        .poll(
          async () => (await page.locator("div.p-4.space-y-6 h3").first().textContent().catch(() => "")) || "",
          { timeout: 10000, message: `${id} should open as ${header}` },
        )
        .toContain(`${header} ${id}`)
    }
  })

  // The toolbar asks the device's *live* DDF what it draws, not the copy a
  // project keeps - so these two seed a DDF still on the old names rather
  // than loading an old project. That is also where `migrateDeclaredTypes`
  // earns its keep.
  async function openOnDdfDeclaring(page: any, deviceId: string, declared: string[]) {
    const seeded = await seedWaveshareDdf({
      deviceId,
      mutateDeviceJson: (manifest: any) => {
        manifest.supportedObjectTypes = declared
      },
    })
    test.skip(!seeded, "screenbee-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await waitForEditorReady(page)
  }

  test("a DDF still on the old names offers both halves of what it declared", async ({ page }) => {
    await openOnDdfDeclaring(page, "e2e-old-names-touch", OLD_TOUCH_DECLARATION)

    // It declared SoftwareButton and Switch, so it has a finger: its
    // `level-indicator` is a Bar *and* a Slider. Carried through
    // untranslated, neither tool would be there at all (decision 11:
    // undeclared is absent, not disabled).
    for (const name of ["Bar", "Slider", "Gauge", "Dial", "Switch", "Button Group", "Button", "Live Text", "Switcher"]) {
      await expect(page.getByRole("button", { name, exact: true }).first(), `${name} tool`).toBeVisible()
    }
  })

  test("a device that never had touch does not acquire a slider on the way", async ({ page }) => {
    await openOnDdfDeclaring(page, "e2e-old-names-touchless", OLD_TOUCHLESS_DECLARATION)

    // The e-paper's own declaration: `level-indicator` and `arc-level`, and
    // neither of the two types that needed a finger. Splitting each in two
    // would hand it a Slider and a Dial - and `declaresTouch` reads this very
    // list, so it would go on to offer swipe actions for a panel with no
    // digitizer. It gets the halves it can draw, and nothing from Operate.
    for (const name of ["Bar", "Gauge", "Live Text", "Live Icon", "Live Line", "Text", "Icon", "Line", "Box", "Switcher"]) {
      await expect(page.getByRole("button", { name, exact: true }).first(), `${name} tool`).toBeVisible()
    }
    for (const name of ["Slider", "Dial", "Switch", "Button Group", "Button"]) {
      await expect(page.getByRole("button", { name, exact: true }), `${name} tool`).toHaveCount(0)
    }
  })
})
