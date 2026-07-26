import path from "path"
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
