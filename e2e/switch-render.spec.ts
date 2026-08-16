import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { loadProject, objectTreeRow, getSelectedHeader, getMainCanvas } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import path from "path"

// Covers the Switch object type added 2026-08-12 (see the "next feature"
// design discussion in this session): data model, canvas rendering (segment
// layout, active-segment resolution from a read topic's preview value),
// property panel editing, and asset-export bitmap baking for state icons
// (added 2026-08-14 once a real M5 Dial deploy showed no icon at all - see
// exportSwitchStateIcon() in lib/asset-export.ts). Deliberately does NOT
// cover: creating a Switch via the toolbar (its tool is gated by
// DeviceDescriptionFile.supportedObjectTypes, same as every other tool -
// see toolbar.tsx), or the tap-to-select/pending-indicator/timeout-rollback
// interaction (live round-trip behavior that only exists once a real
// device is running, not something the design-time canvas simulates) - the
// M5 Dial DDF now does declare "Switch" support and the firmware now does
// implement it (screenbee-m5dial), but neither is exercisable from this
// repo's own test suite. This fixture project already contains a Switch
// object (built directly, bypassing the toolbar) so the non-export tests
// don't depend on any DDF enabling it either.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test.describe("Switch object", () => {
  // This fixture predates nested provenance (no embeddedDdfZipBase64) and
  // targets m5stack-m5dial-v1-1, so loadProject()'s upload path needs that
  // device resolvable via .data/ddf/ - the M5 Dial's DDF stopped being
  // baked into this repo on 2026-08-16 (see e2e/ddf-seed.ts's own header
  // comment). Every test here loads this same fixture.
  test.beforeEach(async () => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")
  })

  test("loads, renders, and its states are editable in the property panel", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)

    await objectTreeRow(page, "obj-switch-1").click()
    expect(await getSelectedHeader(page)).toContain("Switch")

    // The three states baked into the fixture (test/switch-mode -> off/low/high)
    // are each their own segment - confirms properties.states round-tripped
    // through load and the property panel renders one row per state, in
    // order. Every state row's label input shares the same placeholder
    // (switch-properties.tsx), so they're addressed by position.
    const labelInputs = page.locator('input[placeholder="Display text"]')
    await expect(labelInputs).toHaveCount(3)
    await expect(labelInputs.nth(0)).toHaveValue("Off")
    await expect(labelInputs.nth(1)).toHaveValue("Low")
    await expect(labelInputs.nth(2)).toHaveValue("High")
    await expect(page.getByText("State #1")).toBeVisible()
    await expect(page.getByText("State #2")).toBeVisible()
    await expect(page.getByText("State #3")).toBeVisible()

    // Read/write topic fields reflect the fixture's bound topic and command
    // destination - both are TopicSelector dropdowns (2026-08-14: Write
    // Topic used to be a free-text Input, see switch-properties.tsx's own
    // comment for why it now matches Read Topic exactly, restricted to
    // registered project Topics the same way).
    await expect(page.getByText("test/switch-mode", { exact: true })).toBeVisible()
    await expect(page.getByText("test/switch-cmd", { exact: true })).toBeVisible()

    // Font selector (added after this was flagged missing) - shared across
    // every segment's label, same "Manage Fonts" pattern as SoftwareButton.
    // The fixture's Switch defaults to font-helvR08 (see the fixture's own
    // comment for why an M5 Dial font id, not "System Default").
    await expect(page.getByText("Manage Fonts")).toBeVisible()
    const fontSelect = page.locator("select").filter({ has: page.getByText("System Default") })
    await expect(fontSelect).toHaveValue("font-helvR08")

    // Editing a state's label updates the object (and, since it's the
    // active segment's label, redraws on canvas) - the cheapest signal that
    // updateState()/updateProperty() actually write back to the object
    // rather than just being a local input.
    await labelInputs.nth(2).fill("Max")
    await expect(labelInputs.nth(2)).toHaveValue("Max")

    // Canvas actually drew something for this object - a totally broken
    // renderer (e.g. a thrown exception in renderSwitch) would leave the
    // property panel working (it doesn't touch the renderer) while the
    // canvas silently shows nothing, so this asserts the render path
    // specifically rather than trusting the property panel alone.
    const canvasErrors: string[] = []
    page.on("pageerror", (err) => canvasErrors.push(err.message))
    await page.waitForTimeout(300)
    expect(canvasErrors, `Uncaught page errors: ${canvasErrors.join("; ")}`).toEqual([])
  })

  // Regression test for a 2026-08-14 request: Write Topic must be built
  // exactly like Read Topic - the same TopicSelector dropdown, the same
  // restriction to already-registered project Topics, no free-text
  // fallback. (An earlier version of this feature kept Write Topic as a
  // free-text Input with a quick-pick dropdown alongside it; this replaced
  // that with a literal reuse of TopicSelector instead.) The fixture
  // registers a second Topic ("test/switch-cmd") specifically so there's a
  // real, different destination to switch to - it deliberately isn't
  // "test/switch-mode/set" (nested under the existing "test/switch-mode")
  // because TopicSelector's tree renderer treats any topic that's itself a
  // leaf as terminal and never descends into its children (topic-selector.tsx
  // renderTreeNodes), which would make a topic nested under another
  // permanently unpickable - a real, separate bug worth fixing on its own.
  test("write topic is a TopicSelector dropdown restricted to registered topics, same as read topic", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const writeTopicSelect = page.locator("label", { hasText: "Write Topic" }).locator("..").getByRole("combobox")
    await expect(writeTopicSelect).toContainText("test/switch-cmd")

    await writeTopicSelect.click()
    const listbox = page.getByRole("listbox")
    // Both registered topics share the "test/" prefix, so the tree groups
    // them under a "test" node (an abstract, non-leaf header) - already
    // auto-expanded on open, since it's an ancestor of the current
    // selection ("test/switch-cmd") - no click needed (clicking it now
    // would toggle it closed instead). Leaf options show only their last
    // path segment ("switch-mode"), not the full topic string - the full
    // string only appears on the closed trigger.
    await expect(listbox.getByRole("option", { name: "switch-mode" })).toBeVisible()
    await expect(page.getByRole("option", { name: "Manage Topics..." })).toBeVisible()
    await listbox.getByRole("option", { name: "switch-mode" }).click()
    await expect(writeTopicSelect).toContainText("test/switch-mode")
    await expect(writeTopicSelect).not.toContainText("test/switch-cmd")
  })

  // Regression test for a 2026-08-13 finding: the font selector visibly
  // changed the property panel's selected value, but render-switch.ts drew
  // segment labels with a generic fallback canvas font whose numeric size
  // was the only thing that ever changed - the same limitation
  // render-software-button.ts documents as deliberate for SoftwareButton.
  // Fixed by routing segment labels through the same real BDF/TTF glyph
  // rendering render-text-box.ts uses for labels. This fixture's device
  // (m5stack-m5dial-v1-1) is deliberately chosen because uploading a
  // project overwrites its embedded fonts with the resolved device's live
  // DDF fonts (device-description.ts's deviceDescriptionToProjectFields),
  // so font-helvR08/font-helvR24 are real, differently-sized BDF fonts by
  // the time this runs, not fixture-authored placeholders.
  test("selecting a different (real BDF) font changes the rendered pixels", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const hashCanvas = () =>
      page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll("canvas"))
        let best = canvases[0]
        let bestArea = 0
        for (const c of canvases) {
          const r = c.getBoundingClientRect()
          if (r.width * r.height > bestArea) {
            bestArea = r.width * r.height
            best = c
          }
        }
        const ctx = best.getContext("2d")!
        const data = ctx.getImageData(0, 0, best.width, best.height).data
        let hash = 0
        for (let i = 0; i < data.length; i += 4) {
          hash = (hash * 31 + data[i] + data[i + 1] * 7 + data[i + 2] * 13) >>> 0
        }
        return hash
      })

    const beforeHash = await hashCanvas()

    // font-helvR08 (fixture default, 12px) -> font-helvR24 (35px) - the
    // largest size jump available, so a real change is unambiguous.
    const fontSelect = page.locator("select").filter({ has: page.getByText("System Default") })
    await fontSelect.selectOption("font-helvR24")
    await page.waitForTimeout(200)

    const afterHash = await hashCanvas()
    expect(afterHash, "canvas pixels should change when a differently-sized BDF font is selected").not.toBe(
      beforeHash,
    )
  })

  // Regression test for a 2026-08-13 finding: a large enough font drew
  // label glyphs past a segment's own boundary, bleeding into the
  // neighboring segment (or past the control's outer edge for the last
  // segment) instead of being cropped to the segment it belongs to. Fixed
  // by clipping each segment's icon+label drawing to that segment's own
  // rect before drawing anything into it - the same crop boundary a future
  // per-segment bitmap export would apply, so the live preview can't show
  // an uncropped impression the export wouldn't actually produce. Verified
  // by spying on CanvasRenderingContext2D.rect() (what ctx.clip() clips to)
  // rather than sampling pixels, since it asserts the actual clip region
  // directly instead of an indirect, anti-aliasing-sensitive pixel proxy.
  test("each segment clips its own drawing to its own rect", async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__clipRects = []
      const origRect = CanvasRenderingContext2D.prototype.rect
      CanvasRenderingContext2D.prototype.rect = function (x: number, y: number, w: number, h: number) {
        ;(window as any).__clipRects.push({ x, y, w, h })
        return origRect.call(this, x, y, w, h)
      }
    })

    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()
    await page.waitForTimeout(300)

    const clipRects = await page.evaluate(
      () => (window as any).__clipRects as Array<{ x: number; y: number; w: number; h: number }>,
    )

    // Fixture: Switch is 220px wide, 3 states -> ~73.3px per segment, 50px
    // tall (see the fixture generator). A per-segment clip rect should be
    // that size, not the full 220px control width.
    const segmentClipRects = clipRects.filter((r) => r.w > 60 && r.w < 85 && r.h === 50)
    expect(
      segmentClipRects.length,
      `expected at least 3 per-segment (~73x50) clip rects, got: ${JSON.stringify(clipRects)}`,
    ).toBeGreaterThanOrEqual(3)

    // No clip rect should span the whole control's width - that would mean
    // segments share one clip region again (the bug: a segment's overflow
    // clipped only at the control's outer edge, not at its neighbor).
    expect(clipRects.some((r) => r.w >= 200)).toBe(false)
  })

  // Regression test for a 2026-08-14 finding: a Switch state's icon never
  // rendered on a real M5 Dial deploy - lib/asset-export.ts never baked a
  // bitmap for it at all (states[i].path always stayed unset), even though
  // the firmware side was already wired to draw one if present. Mirrors
  // software-button-render.spec.ts's own deploy-flow bitmap check (same
  // reasoning: the bitmap needs a real canvas render, not just JSON, so a
  // hand-built fixture can't catch this - only driving the actual "Deploy
  // to Device" flow can). Requires the local MQTT broker (npm run
  // hil:broker) - see hil/README.md.
  test("deploying a project with a Switch icon bakes a real per-state bitmap", async ({ page }, testInfo) => {
    const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
    const deviceId = `e2e-m5dial-switch-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-m5dial-switch-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${deviceId}/hello`,
        JSON.stringify({ deviceId: "m5stack-m5dial-v1-1", name: `Switch Icon Test ${deviceId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "online", { retain: true })

      await loadProject(page, SWITCH_TEST_PROJECT)
      await getMainCanvas(page) // waits for the canvas to actually be there before proceeding

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`Switch Icon Test ${deviceId}`)).toBeVisible()
      await page.getByText(`Switch Icon Test ${deviceId}`).click()

      const triggerPromise = new Promise<{ url: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${deviceId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${deviceId}/deploy` && message.length > 0) {
            resolve(JSON.parse(message.toString()))
          }
        })
      })
      await page.getByRole("button", { name: "Deploy", exact: true }).click()
      const trigger = await triggerPromise

      const zipResponse = await page.request.get(trigger.url)
      expect(zipResponse.ok()).toBe(true)
      const zip = await JSZip.loadAsync(await zipResponse.body())
      const projectJson = JSON.parse(await zip.file("project.json")!.async("string"))

      const allObjects = projectJson.screens.flatMap((s: any) => s.objects)
      const sw = allObjects.find((o: any) => o.type === "Switch")
      expect(sw, "Switch object missing from exported project.json").toBeTruthy()

      const offState = sw.properties.states.find((s: any) => s.id === "sw-state-0")
      expect(offState.path, "path not set on the Switch state with an icon configured").toBeTruthy()
      // pathActive - the same icon baked a second time against
      // activeBackgroundColor instead of backgroundColor, so it doesn't
      // show its normal-state backdrop once the segment goes active
      // (2026-08-14 finding, fixed the same day exportSwitchStateIcon()
      // was first added).
      expect(offState.pathActive, "pathActive not set on the Switch state with an icon configured").toBeTruthy()
      expect(offState.pathActive).not.toBe(offState.path)
      // The other two states have no iconAssetId - must stay unset, not
      // fall back to some other state's bitmap.
      const lowState = sw.properties.states.find((s: any) => s.id === "sw-state-1")
      expect(lowState.path).toBeFalsy()
      expect(lowState.pathActive).toBeFalsy()

      const bitmaps: Buffer[] = []
      for (const path of [offState.path, offState.pathActive]) {
        const bitmapEntry = zip.file(path)
        expect(bitmapEntry, `${path} missing from the deployed zip`).toBeTruthy()
        const bitmapBytes = await bitmapEntry!.async("nodebuffer")

        // "BM" magic bytes = a real BMP file header, not an empty/placeholder
        // stub - proves exportSwitchStateIcon() actually rendered something.
        expect(bitmapBytes.length).toBeGreaterThan(50)
        expect(bitmapBytes.subarray(0, 2).toString("ascii")).toBe("BM")
        bitmaps.push(bitmapBytes)
      }

      // The fixture's sw-state-0 sets activeIconAssetId to a genuinely
      // different (white-stroke, not black-stroke) icon asset - the two
      // baked bitmaps must actually differ in content, not just in
      // filename (2026-08-14 Active Icon addition: without this,
      // exportSwitchStateIcon() would silently keep baking the same
      // (normal) icon for both variants and only the background fill
      // would ever change).
      expect(bitmaps[0].equals(bitmaps[1]), "active-icon bitmap is byte-identical to the normal-icon bitmap").toBe(
        false,
      )
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
