import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"

// Icon tinting, drawn through app/test-render so a pixel at (x, y) is the
// pixel and nothing else - no grid, no adornment, no zoom.
//
// Why this exists (2026-08-25): library icons are overwhelmingly monochrome
// black, which is invisible on a dark screen. The colour now lives on the
// object that draws the icon rather than baked into the asset, so one
// lightbulb serves a pale screen and a dark one. The rule has four cases and
// each one is a decision someone could quietly reverse later:
//
//   1. fill="currentColor" - most of Iconify. Replaced.
//   2. one hardcoded colour - some sets ship #000 instead. Also replaced,
//      because to a reader those two icons are the same kind of thing.
//   3. no colour named at all - SVG's own default is black. Replaced by
//      painting the root <svg>, which inherits down.
//   4. genuinely multi-colour - left alone, since imposing one colour would
//      silently destroy a picture someone chose for its colours. Flattened
//      only when the object asks for it.
//
// Also pinned here: an untinted project renders exactly as it did before the
// field existed (every project made until today is one), and two objects
// sharing one asset in different colours really do come out different - the
// icon caches key by asset, so the colour has to be part of that key or the
// second object gets handed the first one's picture.

const SCREEN_W = 120
const SCREEN_H = 80
const ICON = { x: 20, y: 20, size: 40 }
const WHITE = "#ffffff"
const BLACK = "#000000"
const TINT = "#ff00ff"

// The four SVG shapes above, each a flat rectangle so a probed pixel is the
// icon's colour exactly and never an antialiased edge.
const SVG = {
  currentColor: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="currentColor"/></svg>',
  hardcoded: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="#000000"/></svg>',
  noColor: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24"/></svg>',
  // Two bars with a deliberate gap between them: the gap is what proves
  // flattening paints the shapes and not the icon's bounding box. The
  // <g fill="none"> around them is how the real multi-colour sets are
  // written - checked against streamline-ultimate-color:shelf-books-1, which
  // is in the camper project.
  multi: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><rect x="0" y="0" width="8" height="24" fill="#ff0000"/><rect x="16" y="0" width="8" height="24" fill="#00ff00"/></g></svg>',
}

// Where those bars land once the 24-unit viewBox is drawn into a 40px box.
const LEFT_BAR = ICON.x + 4
const GAP = ICON.x + ICON.size / 2
const RIGHT_BAR = ICON.x + ICON.size - 4
const MIDDLE_Y = ICON.y + ICON.size / 2

function asset(id: string, svg: string) {
  return {
    id,
    name: id,
    type: "icon",
    data: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  }
}

function iconProject(objects: any[]) {
  return {
    name: "icon-color",
    screenWidth: SCREEN_W,
    screenHeight: SCREEN_H,
    settings: { colorDepth: "24bit" },
    fonts: [],
    topics: [],
    assets: Object.entries(SVG).map(([id, svg]) => asset(id, svg)),
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: WHITE, objects }],
  }
}

function iconObject(id: string, assetId: string, properties: Record<string, any> = {}, x = ICON.x) {
  return {
    id,
    type: "icon",
    zIndex: 0,
    x,
    y: ICON.y,
    width: ICON.size,
    height: ICON.size,
    properties: { assetId, backgroundColor: "transparent", ...properties },
  }
}

async function render(page: Page, project: any): Promise<void> {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project,
    screenIndex: 0,
    topicOverrides: {},
  })
}

async function pixel(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    const data = canvas.getContext("2d")!.getImageData(px as number, py as number, 1, 1).data
    const hex = (n: number) => n.toString(16).padStart(2, "0")
    return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`
  }, [x, y])
}

test.describe("Icon color", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  test("paints a currentColor icon, a hardcoded one, and one that names no color", async ({ page }) => {
    // All three are stencils to a reader, however their author wrote them, so
    // all three follow the field. Rendered side by side in one pass, which
    // also shows three different assets keep three different cache entries.
    await render(
      page,
      iconProject([
        iconObject("a", "currentColor", { iconColor: TINT }, 0),
        iconObject("b", "hardcoded", { iconColor: TINT }, 40),
        iconObject("c", "noColor", { iconColor: TINT }, 80),
      ]),
    )

    expect(await pixel(page, 20, MIDDLE_Y)).toBe(TINT)
    expect(await pixel(page, 60, MIDDLE_Y)).toBe(TINT)
    expect(await pixel(page, 100, MIDDLE_Y)).toBe(TINT)
  })

  test("leaves an icon alone when no color is set", async ({ page }) => {
    // The guard for every project that predates the field: unset has to mean
    // "exactly as before", or this change would have quietly restyled them.
    await render(page, iconProject([iconObject("a", "currentColor")]))
    expect(await pixel(page, GAP, MIDDLE_Y)).toBe(BLACK)

    await render(page, iconProject([iconObject("a", "hardcoded")]))
    expect(await pixel(page, GAP, MIDDLE_Y)).toBe(BLACK)

    await render(page, iconProject([iconObject("a", "noColor")]))
    expect(await pixel(page, GAP, MIDDLE_Y)).toBe(BLACK)
  })

  test("keeps a genuinely multi-color icon's own colors", async ({ page }) => {
    await render(page, iconProject([iconObject("a", "multi", { iconColor: TINT })]))

    expect(await pixel(page, LEFT_BAR, MIDDLE_Y)).toBe("#ff0000")
    expect(await pixel(page, RIGHT_BAR, MIDDLE_Y)).toBe("#00ff00")
  })

  test("flattens a multi-color icon only when asked, and only where it paints", async ({ page }) => {
    await render(page, iconProject([iconObject("a", "multi", { iconColor: TINT, iconColorFlatten: true })]))

    expect(await pixel(page, LEFT_BAR, MIDDLE_Y)).toBe(TINT)
    expect(await pixel(page, RIGHT_BAR, MIDDLE_Y)).toBe(TINT)
    // The gap between the bars. Had flattening swept up the enclosing
    // <g fill="none">, the icon would have become a solid tile and this
    // would read TINT - which is how a flatten written as "replace every
    // fill" fails.
    expect(await pixel(page, GAP, MIDDLE_Y)).toBe(WHITE)
  })

  test("two objects sharing one asset come out in their own colors", async ({ page }) => {
    // The cache-key case. Both draw assetId "currentColor"; keyed by asset
    // alone, whichever loaded first would be handed to both.
    await render(
      page,
      iconProject([
        iconObject("left", "currentColor", { iconColor: TINT }, 0),
        iconObject("right", "currentColor", { iconColor: "#008000" }, 60),
      ]),
    )

    expect(await pixel(page, 20, MIDDLE_Y)).toBe(TINT)
    expect(await pixel(page, 80, MIDDLE_Y)).toBe("#008000")
  })

  test("bakes the color into the exported bitmap, not just the canvas", async ({ page }) => {
    // What actually reaches a device. The firmware blits this file as-is and
    // knows nothing about iconColor, so a canvas-only tint would put the
    // designer and the hardware into disagreement - the exact class of drift
    // the HIL pixel diffs exist to catch.
    const zipBase64: string = await page.evaluate(
      (project) => (window as any).__buildDeviceZipForTest(project),
      iconProject([iconObject("baked", "currentColor", { iconColor: TINT })]),
    )

    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
    const name = Object.keys(zip.files).find((f) => f.includes("baked"))
    expect(name, `no baked icon in zip: ${Object.keys(zip.files).join(", ")}`).toBeTruthy()

    const bytes = await zip.file(name!)!.async("uint8array")
    // Decoded by the browser rather than by a BMP parser written here: the
    // point is what the bytes depict, and a hand-rolled header reader would
    // be a second thing to keep correct.
    const center = await page.evaluate(async (data) => {
      const blob = new Blob([new Uint8Array(data)], { type: "image/bmp" })
      const bitmap = await createImageBitmap(blob)
      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(bitmap, 0, 0)
      const px = ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data
      const hex = (n: number) => n.toString(16).padStart(2, "0")
      return `#${hex(px[0])}${hex(px[1])}${hex(px[2])}`
    }, Array.from(bytes))

    expect(center).toBe(TINT)
  })
})
