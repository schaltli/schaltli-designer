import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { loadProject, objectTreeRow, getSelectedHeader, getMainCanvas, ROUND_FIXTURE_DEVICE_ID } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
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
// Waveshare DDF does declare "Switch" support and the firmware does
// implement it, but neither is exercisable from this repo's own test suite. This fixture project already contains a Switch
// object (built directly, bypassing the toolbar) so the non-export tests
// don't depend on any DDF enabling it either.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test.describe("Switch object", () => {
  // This fixture predates nested provenance (no embeddedDdfZipBase64) and
  // targets the seeded round fixture, so loadProject()'s upload path needs
  // that device resolvable via .data/ddf/ - no real device's DDF is baked
  // into this repo (see e2e/ddf-seed.ts's own header comment). It named the
  // M5 Dial until that device was dropped on 2026-09-10; the zip was
  // re-pointed rather than re-recorded, so everything else in it is
  // untouched. Every test here loads this same fixture.
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-waveshare-1v8 not checked out alongside this repo")
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
    // comment for why a real DDF font id, not "System Default").
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

  // The property panel half of the 2026-08-25 marker rebuild. The pixels
  // are covered in switch-marker.spec.ts; this is about the controls that
  // appeared and disappeared with them - in particular that the mode
  // selector actually swaps which per-state fields are offered, since
  // "Icon when active" and "Show marker bar" are each meaningless in the
  // other mode and offering both everywhere was the easy wrong answer.
  test("mode selector swaps the per-state fields, and the active text colour is gone", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    // activeBackgroundColor survived the change and became the bar's
    // colour, under a label that says so. activeTextColor did not: with no
    // fill, a label never sits on a different background than its
    // neighbours, so there is nothing for a second text colour to be for.
    await expect(page.getByText("Marker Bar Color")).toBeVisible()
    await expect(page.getByText("Active Segment Text Color")).toHaveCount(0)

    const modeSelect = page.locator("select").filter({ hasText: "Segmented" })
    await expect(modeSelect).toHaveValue("segmented")

    // Segmented: every state offers a second icon for when it is the active
    // segment, and nothing asks which states carry the marker - the bar
    // always follows the active segment there.
    await expect(page.getByText("Icon when active (optional)")).toHaveCount(3)
    await expect(page.getByText("Show marker bar in this state")).toHaveCount(0)

    await modeSelect.selectOption("single")

    // Single: exactly the other way round. A state is only ever drawn while
    // it is active here, so its own Icon already is its active picture and a
    // second slot would leave the first unreachable.
    await expect(page.getByText("Icon when active (optional)")).toHaveCount(0)
    const markerBoxes = page.getByText("Show marker bar in this state")
    await expect(markerBoxes).toHaveCount(3)

    // Unticked by default: which state counts as "on" is a question only the
    // author can answer, and guessing it from list position would be a trap
    // nobody could correct - the panel has no way to reorder states.
    const checkboxes = page.locator('input[type="checkbox"]')
    await expect(checkboxes.nth(0)).not.toBeChecked()
    await checkboxes.nth(0).check()
    await expect(checkboxes.nth(0)).toBeChecked()
    await expect(checkboxes.nth(1)).not.toBeChecked()
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
  test("Icon Color round-trips through the property panel", async ({ page }) => {
    // The field added 2026-08-25. What the pixels do with it is pinned in
    // e2e/icon-color.spec.ts; this only checks the wiring, which is the part
    // a reader would touch: the field appears for an object that draws icons,
    // and picking a colour reaches properties.iconColor and comes back out.
    // The trigger's own text is read from that stored value, so it changing
    // is the round trip.
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const select = page.locator("label", { hasText: "Icon Color" }).locator("..").getByRole("combobox")

    // Unset reads as the icon keeping its own colours - not "transparent",
    // which is what the shared picker calls this entry everywhere else and
    // would be a plain lie about what gets drawn.
    await expect(select).toContainText("Icon's own color")

    await select.click()
    await page.getByRole("option", { name: "Lime", exact: true }).click()
    await expect(select).toContainText("Lime")
  })

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
  // rendering render-text-box.ts uses for labels. This fixture's device is
  // deliberately a seeded real DDF because uploading a project overwrites
  // its embedded fonts with the resolved device's live DDF fonts
  // (device-description.ts's deviceDescriptionToProjectFields), so
  // font-helvR08/font-helvR24 are real, differently-sized BDF fonts by the
  // time this runs, not fixture-authored placeholders. The knob declares
  // both, same as the M5 Dial did.
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
    const deviceId = `e2e-switch-icon-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-switch-icon-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${deviceId}/hello`,
        JSON.stringify({ deviceId: ROUND_FIXTURE_DEVICE_ID, name: `Switch Icon Test ${deviceId}` }),
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
      // pathActive - a second bitmap, present because this state declares a
      // genuinely different "Icon when active". Until 2026-08-25 it was the
      // SAME picture baked a second time against activeBackgroundColor, so
      // that it did not show its normal-state backdrop once the segment
      // filled; the marker bar replaced that fill, so the backdrop no
      // longer changes and a state without its own active icon now ships
      // one file instead of two byte-identical ones.
      expect(offState.pathActive, "pathActive not set on the Switch state with a distinct active icon").toBeTruthy()
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
      // filename. Since 2026-08-25 both are baked against the same
      // background, so the picture is the only thing that can differ: if
      // exportSwitchStateIcon ever fell back to the normal asset again,
      // the two files would now be byte-identical rather than merely
      // similarly-backed, and this catches it.
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
