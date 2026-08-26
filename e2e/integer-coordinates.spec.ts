import { test, expect } from "@playwright/test"
import { loadProject, objectTreeRow } from "./helpers"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"

// An object coordinate is a whole device pixel, everywhere, always.
//
// Found on a real Waveshare on 2026-08-26: the "Licht" screen showed three
// switches at 79, 150.5 and 222, and the middle one - the only one with a
// fraction - was drawn hard against the left edge of the panel while the
// designer showed all three in their proper places. The fraction came from
// "Distribute H", which divided the available space and wrote the raw
// quotient; the jump came from the firmware, whose ProjectLoader does
//
//     obj.x = objJson["x"] | 0;      // obj.x is int
//
// and ArduinoJson's `|` yields the default whenever the stored value is not
// the requested type. A double of 150.5 is not an int, so x became 0. The
// failure is silent and lands the object somewhere entirely plausible, which
// is why it read as a designer bug for as long as it did.
//
// Two guarantees, because one of them alone would not have been enough:
//
//   1. The editor never writes a fraction. Distribute and align-centre were
//      the only two paths that could - the drag and resize paths in
//      canvas.tsx have rounded from the start.
//   2. The export never ships one. Projects saved before (1) still hold
//      fractions, and hand-edited or imported ones always could; the export
//      is the last place that still knows the difference between the
//      designer's float canvas and a panel's integer grid.
//
// A half-pixel is not only a firmware problem, either. On the canvas itself
// a 1px stroke on a .5 boundary straddles two pixel columns and is drawn as
// two half-lit ones - the blurry-line complaint that comes with it.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// Three boxes whose distribution does not come out even: the gap is 81px
// across two intervals, so the middle box's exact position is x.5 - the
// same shape as the real 79/150.5/222 that started this.
const LEFT = { x: 20, width: 40 }
const MIDDLE = { x: 90, width: 40 }
const RIGHT = { x: 181, width: 40 }
const ROW_Y = 40

// leftmost.x + leftmost.width + (totalWidth - sumWidths) / 2
//   = 20 + 40 + (201 - 120) / 2 = 100.5  ->  101
const EXPECTED_MIDDLE_X = 101

function box(id: string, geometry: { x: number; width: number }) {
  return {
    id,
    type: "box",
    zIndex: 1,
    x: geometry.x,
    y: ROW_Y,
    width: geometry.width,
    height: 40,
    properties: { backgroundColor: "#ffffff", borderColor: "#000000", borderWidth: 1 },
  }
}

// The fixture is only a vehicle - it supplies a device, fonts and settings
// that already load. Its objects are replaced wholesale so the geometry
// under test is stated here rather than inherited from a file that exists
// for other reasons.
async function projectWithThreeBoxes(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects = [box("box-left", LEFT), box("box-middle", MIDDLE), box("box-right", RIGHT)]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `integer-coords-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

test.describe("Integer object coordinates", () => {
  test("Distribute H lands the middle object on a whole pixel", async ({ page }) => {
    await loadProject(page, await projectWithThreeBoxes())

    // Ctrl-click is the object tree's multi-select (object-tree-panel.tsx's
    // modifierKey) - targeting rows by data-object-id rather than canvas
    // pixels, which move whenever zoom or layout does.
    await objectTreeRow(page, "box-left").click()
    await objectTreeRow(page, "box-middle").click({ modifiers: ["Control"] })
    await objectTreeRow(page, "box-right").click({ modifiers: ["Control"] })

    await page.getByRole("button", { name: "Distribute H" }).click()

    // Back to a single selection so the ordinary property panel - the one
    // that shows a stored coordinate verbatim - is what reports the result.
    await objectTreeRow(page, "box-middle").click()
    const x = await page.locator("#x").inputValue()

    expect(x, `middle box x was "${x}", expected a whole pixel`).toBe(String(EXPECTED_MIDDLE_X))
    expect(Number.isInteger(Number(x))).toBe(true)

    // The outer two are the distribution's fixed points and must not have
    // been nudged - a rounding fix that also moved them would be a different
    // bug wearing this one's clothes.
    await objectTreeRow(page, "box-left").click()
    expect(await page.locator("#x").inputValue()).toBe(String(LEFT.x))
    await objectTreeRow(page, "box-right").click()
    expect(await page.locator("#x").inputValue()).toBe(String(RIGHT.x))
  })

  test("Distribute V lands the middle object on a whole pixel", async ({ page }) => {
    const zipPath = await (async () => {
      const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      // Same arithmetic rotated: a 81px gap over two intervals.
      project.screens[0].objects = [
        { ...box("box-top", { x: 20, width: 40 }), y: 20, height: 40 },
        { ...box("box-mid", { x: 20, width: 40 }), y: 90, height: 40 },
        { ...box("box-bot", { x: 20, width: 40 }), y: 181, height: 40 },
      ]
      zip.file("project.json", JSON.stringify(project))
      const out = path.join(os.tmpdir(), `integer-coords-v-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
      fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
      return out
    })()

    await loadProject(page, zipPath)
    await objectTreeRow(page, "box-top").click()
    await objectTreeRow(page, "box-mid").click({ modifiers: ["Control"] })
    await objectTreeRow(page, "box-bot").click({ modifiers: ["Control"] })
    await page.getByRole("button", { name: "Distribute V" }).click()

    await objectTreeRow(page, "box-mid").click()
    const y = await page.locator("#y").inputValue()
    expect(y, `middle box y was "${y}", expected a whole pixel`).toBe("101")
  })

  test("Align centre lands every object on a whole pixel", async ({ page }) => {
    // Centres are averages, so an odd total or an odd width produces a .5
    // just as readily as distribution does. Widths 40 and 41 around a shared
    // centre is the smallest case that shows it.
    const zipPath = await (async () => {
      const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      project.screens[0].objects = [
        box("box-a", { x: 20, width: 40 }),
        { ...box("box-b", { x: 60, width: 41 }), width: 41 },
      ]
      zip.file("project.json", JSON.stringify(project))
      const out = path.join(os.tmpdir(), `integer-coords-c-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
      fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
      return out
    })()

    await loadProject(page, zipPath)
    await objectTreeRow(page, "box-a").click()
    await objectTreeRow(page, "box-b").click({ modifiers: ["Control"] })
    await page.getByRole("button", { name: "Center H", exact: true }).click()

    for (const id of ["box-a", "box-b"]) {
      await objectTreeRow(page, id).click()
      const x = await page.locator("#x").inputValue()
      expect(Number.isInteger(Number(x)), `${id} x was "${x}"`).toBe(true)
    }
  })

  // The other half of "already saved with a fraction": opening one repairs
  // it, rather than leaving the canvas to draw a blurred edge until someone
  // happens to press Distribute again. Without this the object would still
  // land correctly on a device (the export rounds too) while looking soft
  // in the editor for the rest of the project's life.
  test("opening a project that holds a fraction rounds it on the way in", async ({ page }) => {
    const zipPath = await (async () => {
      const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      // The exact geometry the Waveshare showed crooked.
      project.screens[0].objects = [{ ...box("box-fractional", { x: 20, width: 40 }), x: 150.5, y: 60.5 }]
      zip.file("project.json", JSON.stringify(project))
      const out = path.join(os.tmpdir(), `integer-coords-load-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
      fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
      return out
    })()

    await loadProject(page, zipPath)
    await objectTreeRow(page, "box-fractional").click()

    expect(await page.locator("#x").inputValue()).toBe("151")
    expect(await page.locator("#y").inputValue()).toBe("61")
  })

  // The guard that matters for every project already saved with a fraction -
  // including the one that found this, which would otherwise stay crooked
  // until someone happened to press Distribute again.
  test("the device export rounds coordinates a stored project still holds", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    const project = {
      name: "fractional",
      screenWidth: 240,
      screenHeight: 240,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [
        {
          id: "s1",
          name: "Screen 1",
          backgroundColor: "#ffffff",
          objects: [
            {
              id: "loose-box",
              type: "box",
              zIndex: 1,
              x: 150.5,
              y: 10.25,
              width: 60.5,
              height: 60.75,
              properties: { backgroundColor: "#ffffff", borderColor: "#000000", borderWidth: 1 },
            },
            // A container's children carry coordinates relative to their
            // parent and are spread through the export untouched, so they
            // need the same rounding or the guard has a hole exactly where
            // nesting is.
            {
              id: "tabs",
              type: "tab-control",
              zIndex: 2,
              x: 4.5,
              y: 120.5,
              width: 200.5,
              height: 100.5,
              properties: {},
              children: [
                {
                  id: "panel-1",
                  type: "panel",
                  zIndex: 0,
                  x: 0,
                  y: 0,
                  width: 200.5,
                  height: 80.5,
                  properties: {},
                  children: [
                    {
                      id: "nested-box",
                      type: "box",
                      zIndex: 1,
                      x: 9.5,
                      y: 3.5,
                      width: 20.5,
                      height: 20.5,
                      properties: { backgroundColor: "#ffffff", borderColor: "#000000", borderWidth: 1 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project)
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
    const exported = JSON.parse(await zip.file("project.json")!.async("string"))

    const offenders: string[] = []
    const walk = (objects: any[], trail: string) => {
      for (const o of objects || []) {
        for (const field of ["x", "y", "width", "height"] as const) {
          if (!Number.isInteger(o[field])) offenders.push(`${trail}/${o.id}.${field} = ${o[field]}`)
        }
        if (Array.isArray(o.children)) walk(o.children, `${trail}/${o.id}`)
      }
    }
    for (const screen of exported.screens) walk(screen.objects, screen.id)

    expect(offenders, `fractional geometry reached the device export: ${offenders.join(", ")}`).toEqual([])

    // Rounded, not truncated or zeroed - the export must land the object
    // where it was, which is the whole point of catching this here.
    const all: any[] = []
    const collect = (objects: any[]) => {
      for (const o of objects || []) {
        all.push(o)
        if (Array.isArray(o.children)) collect(o.children)
      }
    }
    for (const screen of exported.screens) collect(screen.objects)

    const loose = all.find((o) => o.id === "loose-box")
    expect(loose.x).toBe(151)
    expect(loose.y).toBe(10)
    const nested = all.find((o) => o.id === "nested-box")
    expect(nested.x).toBe(10)
    expect(nested.y).toBe(4)
  })
})
