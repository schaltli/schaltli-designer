import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, loadProject, getMainCanvas, getSelectedHeader, devicePoint } from "./helpers"

// Every object type used to draw its own bespoke "creation drag" preview -
// some drew the real default fill/border colors, square-constrained types
// (icon, MQTTIconField) drew a dashed outline only, SoftwareButton faked a
// full 3D button render with a drop shadow and preview text. Unified
// 2026-07-26 into one shared dashed-rectangle style (drawCreationPreviewRect
// / drawCreationPreviewLine in canvas.tsx) so the look can be changed in one
// place. This test doesn't assert pixels (fragile, and a one-time visual
// check already confirmed the unified style renders identically across
// types) - it guards the functional side: that unifying the preview drawing
// didn't disturb the actual object each tool commits on mouse-up.
test("dragging out different tool types still creates the right kind of object", async ({ page }) => {
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByText("tab-control-tests", { exact: true }).click()
  await page.waitForTimeout(800)

  const { box } = await getMainCanvas(page)

  const cases: Array<{ tool: string; expectedHeader: string }> = [
    { tool: "Box", expectedHeader: "Box" },
    { tool: "Line", expectedHeader: "Line" },
    { tool: "Level", expectedHeader: "Level Indicator" },
  ]

  for (const { tool, expectedHeader } of cases) {
    await test.step(`create via ${tool} tool`, async () => {
      // exact: true - "Line" is now also a substring of "Data Line"
      // (MqttDataLine's shortLabel, added 2026-07-31) and sits earlier in
      // the toolbar, so a loose match would silently pick the wrong tool -
      // and expectedHeader's .toContain("Line") check below wouldn't even
      // catch it, since "MQTT Data Line" also contains "Line".
      await page.getByRole("button", { name: tool, exact: true }).first().click()
      await page.waitForTimeout(150)

      // Device pixels, not canvas-box fractions - see helpers.ts's
      // devicePoint. Every case deliberately draws over the same spot; the
      // tool is active, so each drag creates a fresh object regardless of
      // what the previous one left there.
      const from = devicePoint(box, 140, 170)
      const to = devicePoint(box, 200, 200)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(200)

      expect(await getSelectedHeader(page)).toContain(expectedHeader)
    })
  }
})
