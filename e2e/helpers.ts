import path from "path"
import { expect } from "@playwright/test"
import type { Page, Locator } from "@playwright/test"

// The canonical HIL/E2E test project, covering every object type and the
// tab-control/panel feature - see test-projects/combined-test-project.zip's
// own history for what each screen exercises (grep the designer repo's
// git log for "combined-test-project" if you need the full rationale).
export const COMBINED_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "combined-test-project.zip")

// Loads a project zip through the real upload UI (not by poking React
// state directly) - this is what actually exercises ProjectLoader parsing,
// same as a user opening a file.
export async function loadProject(page: Page, zipPath: string): Promise<void> {
  await page.goto("/")
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose File..." }).click(),
  ])
  await fileChooser.setFiles(zipPath)
  // The project parse + first screen render aren't awaitable through any
  // exposed signal yet - a fixed wait matches every prior HIL/manual
  // verification script this session. Revisit if this ever proves flaky.
  await page.waitForTimeout(2500)
}

// Multiple <canvas> elements exist at once (every screens-panel thumbnail
// plus the one interactive canvas) - the interactive one is always by far
// the largest, so picking the max-area canvas reliably finds it without
// depending on DOM order or a test-only selector.
export async function getMainCanvas(page: Page): Promise<{ canvas: Locator; box: { x: number; y: number; width: number; height: number } }> {
  // .all() resolves the current DOM synchronously, with no auto-wait - fine
  // once something else on the page has already been awaited (every prior
  // caller), but a caller that queries the canvas as its very first action
  // right after loadProject() can race React's initial mount and see zero
  // canvas elements (found live 2026-08-16, hardware-button-master-
  // inheritance.spec.ts). Wait for at least one to attach first.
  await page.locator("canvas").first().waitFor()
  const canvases = await page.locator("canvas").all()
  let canvas = canvases[0]
  let box = await canvas.boundingBox()
  for (const c of canvases) {
    const b = await c.boundingBox()
    if (b && box && b.width * b.height > box.width * box.height) {
      canvas = c
      box = b
    }
  }
  if (!box) throw new Error("Main canvas has no bounding box - is it rendered?")
  return { canvas, box }
}

// Picks a device on the startup gate by deviceId, from the curated
// (server-shipped) section by default. The M5 Dial is no longer a curated
// example (2026-08-16 - its DDF moved to the firmware repo, see
// e2e/ddf-seed.ts) - specs targeting it must pass source="auto-discovered"
// explicitly and call seedM5DialDdf() first.
//
// Never address these cards by their visible label: it carries the DDF's
// version badge, so every such locator silently goes stale the next time a
// DDF is bumped. Worse, the same deviceId appears in both the curated and
// the auto-discovered section (app/api/ddf/list stopped deduping them in
// 0477e0d), at whatever version each source happens to carry - so after
// the M5 Dial's DDF went 1.4 -> 1.5, nine "v1.4 M5Stack M5Dial (V1.1)"
// locators across this suite kept passing only because a real device on
// the LAN was announcing the older copy, and would have failed the moment
// it was switched off or updated.
export async function chooseDevice(
  page: Page,
  deviceId: string,
  source: "curated" | "auto-discovered" = "curated",
): Promise<void> {
  await page.locator(`[data-ddf-section="${source}"] [data-device-id="${deviceId}"]`).first().click()
}

export const M5DIAL_DEVICE_ID = "m5stack-m5dial-v1-1"

// The Waveshare Knob-1.8 - the device that declares deviceActions (see
// e2e/device-actions.spec.ts), seeded the same way the M5 Dial is.
export const WAVESHARE_DEVICE_ID = "waveshare-knob-1v8"

// Waits for the Startup Gate to have finished listing devices. /api/ddf/list
// parses every zip in .data/ddf on each request, so this is slow on a cold
// dev server and gets slower as specs seed more devices into that directory -
// not a fixed cost a default 5s expect timeout can be relied on to cover. Two
// specs already carried a hand-written 30s timeout for exactly this; the
// other call sites inherited the default and went red one at a time as the
// suite grew (2026-08-20).
export async function waitForDeviceGate(page: Page): Promise<void> {
  await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible({ timeout: 30000 })
}

// Waits for "Create Project" to have actually produced an editor, instead of
// assuming a fixed delay covers it. Creating a project parses a whole DDF
// (adornment SVG + every BDF font) and can take well over a second when the
// suite runs its specs in parallel - a fixed `waitForTimeout(1500)` made
// adornment-offscreen.spec.ts fail intermittently while the gate's button was
// still showing "Creating...", which read as a rendering bug three steps
// later rather than as "the project isn't there yet".
//
// The gate is an early return that replaces the whole app, so its heading
// disappearing is the readiness signal; its device cards contain canvases of
// their own, which is why waiting for "a canvas exists" would not work.
export async function waitForEditorReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Welcome to ScreenBee" })).toHaveCount(0, { timeout: 60000 })
  await expect(page.getByRole("button", { name: "File" })).toBeVisible({ timeout: 60000 })
}

// COMBINED_TEST_PROJECT's device screen (mqtt-epaper-display-2), the
// default devicePoint() assumes.
export const SCREEN_WIDTH = 400
export const SCREEN_HEIGHT = 300

// The M5 Dial's, for the specs that build a project on that device instead.
export const M5DIAL_SCREEN = { width: 240, height: 240 }

// Maps a device pixel (the coordinates objects are actually stored in) to
// its on-screen client position, for tests that have to drive the mouse.
// The device screen is a fixed width x height block that recenters - not
// scales - inside whatever canvas box is available, at the zoom 1 / pan 0
// every test starts from (project-editor.tsx's canvasZoom useState(1)), so
// a device pixel is a fixed offset from the canvas box's own center.
//
// Never place a mouse point at a *fraction* of the canvas box instead: the
// box is the full available area, not the device block, so the same
// fraction lands on a different device pixel - or clean off the device,
// where the drag creates nothing at all - whenever the surrounding layout
// changes width. That is exactly what silently broke master-screen.spec.ts
// and mqtt-data-line.spec.ts when the right panel went 320px -> 480px
// (6f9d03a), with no change to the behavior either was testing.
//
// Coordinates outside the screen rect are legal and useful: a negative one
// is a point that is reliably empty canvas, for tests that need to click
// "nowhere" to deselect.
export function devicePoint(
  box: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
  screen: { width: number; height: number } = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
): { x: number; y: number } {
  return {
    x: box.x + box.width / 2 - screen.width / 2 + x,
    y: box.y + box.height / 2 - screen.height / 2 + y,
  }
}

// The top-left physical button's on-screen position (SVG id "button-10",
// see docs/device-contract.md §5 - the name "clickButton0" itself is now
// slightly stale, kept for git-blame continuity rather than churning every
// call site), found via a fixed pixel offset from the main canvas's own
// bounding-box center, calibrated against this suite's fixed 1600x1000
// viewport (playwright.config.ts) against COMBINED_TEST_PROJECT's device.
// The device rendering is a fixed 400x300 px block that recenters (not
// scales) within whatever box height is available, which is why an
// offset-from-center is stable across the tools-ribbon being shown (normal
// mode) vs. hidden (preview mode) while a simple width/height-relative
// fraction is not.
// Creates a screen via the real "Add screen" menu (Screens Panel), waiting
// for the new screen to finish becoming current - screens-panel.tsx's
// addScreen() switches to whatever it just created, and (for a normal,
// non-master screen) auto-assigns the first existing master screen as its
// masterScreenId. Shared by every spec that needs a master screen or a
// screen known to inherit one (master-screen.spec.ts and any hardware-
// button-inheritance coverage), so the "Add screen" flow only needs
// updating in one place if it ever changes.
export async function createScreen(page: Page, name: string, isMaster: boolean): Promise<void> {
  await page.getByRole("button", { name: "Add screen" }).click()
  await page.getByRole("menuitem", { name: isMaster ? "Add Master Screen" : "Add Screen", exact: true }).click()
  await page.locator("#screenName").fill(name)
  await page.getByRole("button", { name: "Create Screen" }).click()
  await page.waitForTimeout(300)
}

export const BUTTON_0_OFFSET = { x: -175, y: -170 }

export async function clickButton0(page: Page): Promise<void> {
  const { box } = await getMainCanvas(page)
  await page.mouse.click(box.x + box.width / 2 + BUTTON_0_OFFSET.x, box.y + box.height / 2 + BUTTON_0_OFFSET.y)
}

// The property panel's header (e.g. "Label obj-29", "Tab Control
// fan-mode-control", "Panel panel-low", or "Screen Colors" text when
// nothing is selected) - the cheapest way to observe "what is currently
// selected" from outside React state.
export async function getSelectedHeader(page: Page): Promise<string> {
  return (await page.locator("h3").first().textContent().catch(() => "")) || ""
}

// Every object-tree row carries data-object-id (see
// components/object-tree/object-tree-panel.tsx) - this is the reliable way
// to target a specific object without guessing canvas pixel coordinates,
// which drift whenever zoom/layout changes.
export function objectTreeRow(page: Page, objectId: string): Locator {
  return page.locator(`[data-object-id="${objectId}"]`)
}
