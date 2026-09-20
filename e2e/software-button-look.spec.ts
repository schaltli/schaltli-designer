import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { buttonContentLayout, buttonCornerRadius, buttonLook } from "../components/canvas/renderers/render-software-button"
import { fontMetricsOf } from "../lib/level-shape"
import {
  chooseDevice,
  devicePoint,
  getMainCanvas,
  getSelectedHeader,
  ROUND_FIXTURE_DEVICE_ID,
  ROUND_FIXTURE_SCREEN,
  waitForDeviceGate,
} from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// The SoftwareButton as a Material 3 common button (docs/2026-09-19-button-look.md):
// a pill in one of three styles, one colour the rest follows from, and
// Material's pressed state. The button reaches a device as two baked bitmaps,
// so the checks here are on the designer's own render and on the bake, and
// that the two are the same picture.

const FONT_DIR = path.join(__dirname, "..", "public", "fonts", "bdf")
const HELVR12 = fs.readFileSync(path.join(FONT_DIR, "helvR12.bdf"), "utf8")
const FONTS = [
  { id: "font-helvR12", name: "helvR12", displayName: "helvR12", path: "fonts/helvR12.bdf", size: 18, ascent: 14, descent: 4, data: HELVR12, format: "bdf" as const },
]
const WATER = {
  id: "icon-water",
  type: "icon",
  name: "mdi:water",
  data:
    "data:image/svg+xml;base64," +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20a6 6 0 0 1-6-6c0-4 6-10.75 6-10.75S18 10 18 14a6 6 0 0 1-6 6"/></svg>',
    ).toString("base64"),
}
const PURPLE = "#6750A4"

const button = (extra: Record<string, unknown> = {}, box = { x: 20, y: 20, width: 140, height: 48 }): any => ({
  id: "btn",
  type: "button",
  zIndex: 1,
  ...box,
  properties: { text: "Licht", buttonColor: PURPLE, fontId: "font-helvR12", action: { type: "next-screen" }, ...extra },
})

test.describe("what a button is painted with", () => {
  test("filled is the colour itself with a label that reads on it", () => {
    expect(buttonLook(button({ buttonStyle: "filled" }), "#ffffff", "24bit", false)).toEqual({
      container: PURPLE,
      outline: null,
      content: "#ffffff",
    })
  })

  test("the label is white on a dark colour and black on a light one, by Material's tone rule", () => {
    const label = (color: string) => buttonLook(button({ buttonStyle: "filled", buttonColor: color }), "#ffffff", "24bit", false).content
    // White below a tone (CIELAB L*) of 60. These three are the ones the
    // higher-WCAG-contrast rule gave black, at L* 56, 52 and 51 - "zuwenig
    // kontrast zB bei dunkelblau".
    expect(label("#1E88E5")).toBe("#ffffff")
    expect(label("#E53935")).toBe("#ffffff")
    expect(label("#00897B")).toBe("#ffffff")
    expect(label("#1E3A8A")).toBe("#ffffff")
    // And black from 60 up.
    expect(label("#6495ED")).toBe("#000000")
    expect(label("#FDD835")).toBe("#000000")
  })

  test("pressed, the pill's ends close to corners of a fifth of the height", () => {
    // Material 3 Expressive's shape morph: 8 dp on a 40 dp button.
    expect(buttonCornerRadius(140, 40, false)).toBe(20)
    expect(buttonCornerRadius(140, 40, true)).toBe(8)
    expect(buttonCornerRadius(140, 48, true)).toBe(9)
    // Never rounder than the pill it came from.
    expect(buttonCornerRadius(4, 48, true)).toBe(2)
  })

  test("tonal is the slider's empty track, and the default", () => {
    const tonal = { container: "#b3a8d2", outline: null, content: "#000000" }
    expect(buttonLook(button({ buttonStyle: "tonal" }), "#ffffff", "24bit", false)).toEqual(tonal)
    expect(buttonLook(button(), "#ffffff", "24bit", false)).toEqual(tonal)
  })

  test("outlined has no fill, an outline in the tint and a label in the colour", () => {
    expect(buttonLook(button({ buttonStyle: "outlined" }), "#ffffff", "24bit", false)).toEqual({
      container: null,
      outline: "#b3a8d2",
      content: PURPLE,
    })
  })

  test("pressed lays the label's colour over the container at 10 %", () => {
    // 103 + round((255 - 103) / 10) and so on.
    expect(buttonLook(button({ buttonStyle: "filled" }), "#ffffff", "24bit", true).container).toBe("#7662ad")
    // Outlined has no container, so the layer goes over the background.
    expect(buttonLook(button({ buttonStyle: "outlined" }), "#ffffff", "24bit", true)).toEqual({
      container: "#f0eef6",
      outline: "#b3a8d2",
      content: PURPLE,
    })
  })

  test("1 bit has no tint and no 10 %: tonal is outlined, and pressed turns a button inside out", () => {
    const black = button({ buttonColor: "#000000" })
    expect(buttonLook(black, "#ffffff", "1bit", false)).toEqual({ container: null, outline: "#000000", content: "#000000" })
    expect(buttonLook(black, "#ffffff", "1bit", true)).toEqual({ container: "#000000", outline: null, content: "#ffffff" })
    const filled = button({ buttonColor: "#000000", buttonStyle: "filled" })
    expect(buttonLook(filled, "#ffffff", "1bit", true)).toEqual({ container: null, outline: "#000000", content: "#000000" })
  })
})

const W = 240
const H = 120

function project(depth: "1bit" | "24bit", objects: any[]) {
  return {
    name: "button-look",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: depth },
    fonts: FONTS,
    assets: [WATER],
    topics: [],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects }],
  }
}

async function render(page: Page, p: any) {
  const quantize = p.settings.colorDepth === "1bit" ? "1bit" : undefined
  const url: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: p,
    screenIndex: 0,
    topicOverrides: {},
    quantize,
  })
  return pixelsOf(Buffer.from(url.split(",")[1], "base64"), page)
}

/** A PNG's pixels, decoded by the browser that made it. */
async function pixelsOf(png: Buffer, page: Page) {
  const data: number[] = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data)
  }, png.toString("base64"))
  return (x: number, y: number) => {
    const i = (y * W + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
}

function inkOf(font: string, text: string): number {
  let total = 0
  for (const ch of text) {
    const start = new RegExp(`^ENCODING ${ch.codePointAt(0)}\\r?$`, "m").exec(font)!
    const block = font.slice(start.index, font.indexOf("ENDCHAR", start.index))
    const width = Number(/^BBX (\d+)/m.exec(block)![1])
    for (const row of block.split("BITMAP")[1].trim().split(/\s+/)) {
      const bits = Number.parseInt(row, 16).toString(2).padStart(row.length * 4, "0").slice(0, width)
      total += [...bits].filter((b) => b === "1").length
    }
  }
  return total
}

function advanceOf(font: string, text: string): number {
  let w = 0
  for (const ch of text) {
    const start = new RegExp(`^ENCODING ${ch.codePointAt(0)}\\r?$`, "m").exec(font)!
    w += Number(/^DWIDTH (\d+)/m.exec(font.slice(start.index))![1])
  }
  return w
}

/** A baked bitmap - 24-bit BMP or 1-bit PBM - as a pixel lookup. */
function decodeBake(buf: Buffer) {
  if (buf.subarray(0, 2).toString("latin1") === "BM") {
    const off = buf.readUInt32LE(10)
    const w = buf.readInt32LE(18)
    const h = buf.readInt32LE(22)
    const row = Math.ceil((w * 3) / 4) * 4
    return { w, h, at: (x: number, y: number) => { const i = off + (h - 1 - y) * row + x * 3; return [buf[i + 2], buf[i + 1], buf[i]] } }
  }
  const m = /^P4\n(\d+) (\d+)\n/.exec(buf.subarray(0, 32).toString("latin1"))!
  const w = Number(m[1])
  const h = Number(m[2])
  const off = m[0].length
  const row = Math.ceil(w / 8)
  return {
    w,
    h,
    at: (x: number, y: number) => ((buf[off + y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? [0, 0, 0] : [255, 255, 255]),
  }
}

test.describe("what a button draws", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("a filled pill: rounded ends, and every pixel of the label on it", async ({ page }) => {
    const obj = button({ buttonStyle: "filled" })
    const at = await render(page, project("24bit", [obj]))
    // The corner is the screen, not a square button's corner.
    expect(at(obj.x, obj.y)).toEqual([255, 255, 255])
    expect(at(obj.x + 70, obj.y + 2)).toEqual([0x67, 0x50, 0xa4])
    // In the pill's straight part the container is solid, so every white pixel
    // there is the label's - and all of them are there.
    let white = 0
    for (let y = obj.y; y < obj.y + obj.height; y++)
      for (let x = obj.x + 24; x < obj.x + obj.width - 24; x++) if (at(x, y).every((c) => c === 255)) white++
    expect(white).toBe(inkOf(HELVR12, "Licht"))
  })

  test("the icon is a capital tall, stands on the baseline and takes the label's colour", async ({ page }) => {
    const obj = button({ text: "Pumpe", iconAssetId: WATER.id })
    const at = await render(page, project("24bit", [obj]))
    const layout = buttonContentLayout(obj, FONTS as any, advanceOf(HELVR12, "Pumpe"))
    const cap = fontMetricsOf(FONTS[0] as any, 14).capHeight
    expect(layout.icon!.size).toBe(cap)
    let top = Infinity
    let bottom = -Infinity
    for (let y = obj.y; y < obj.y + obj.height; y++)
      for (let x = layout.icon!.x; x < layout.icon!.x + cap; x++) {
        const [r, g, b] = at(x, y)
        // Black on the tonal tint: the label's colour, which the tint picks.
        if (r + g + b < 330) {
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
      }
    expect(bottom).toBe(layout.baseline - 1)
    expect(Math.abs(top - (layout.baseline - cap))).toBeLessThanOrEqual(1)
  })

  test("the bake is the preview, and pressed is Material's state layer", async ({ page }) => {
    const objects = [
      button({ buttonStyle: "filled" }),
      { ...button({ buttonStyle: "outlined", text: "Pumpe", iconAssetId: WATER.id }), id: "btn2", x: 20, y: 70 },
    ]
    const p = project("24bit", objects)
    const at = await render(page, p)
    const zip = await JSZip.loadAsync(Buffer.from(await page.evaluate((q) => (window as any).__buildDeviceZipForTest(q), p), "base64"))
    const baked = JSON.parse(await zip.file("project.json")!.async("string")).screens[0].objects
    for (const obj of objects) {
      const b = baked.find((o: any) => o.id === obj.id)
      const normal = decodeBake(await zip.file(b.pathNormal)!.async("nodebuffer"))
      let differing = 0
      for (let y = 0; y < normal.h; y++)
        for (let x = 0; x < normal.w; x++) {
          const a = normal.at(x, y)
          const e = at(obj.x + x, obj.y + y)
          if (a[0] !== e[0] || a[1] !== e[1] || a[2] !== e[2]) differing++
        }
      expect(differing, `${obj.id}: pixels where the bake differs from the preview`).toBe(0)
    }
    const pressed = decodeBake(await zip.file(baked.find((o: any) => o.id === "btn").pathActive)!.async("nodebuffer"))
    expect(pressed.at(70, 2)).toEqual([0x76, 0x62, 0xad])
    // And its corners closed: a pixel four in from the corner is outside the
    // pill at rest and inside the pressed shape.
    const normal = decodeBake(await zip.file(baked.find((o: any) => o.id === "btn").pathNormal)!.async("nodebuffer"))
    expect(normal.at(4, 4)).toEqual([255, 255, 255])
    expect(pressed.at(4, 4)).toEqual([0x76, 0x62, 0xad])
    const pressedOutline = decodeBake(await zip.file(baked.find((o: any) => o.id === "btn2").pathActive)!.async("nodebuffer"))
    expect(pressedOutline.at(70, 3)).toEqual([0xf0, 0xee, 0xf6])
  })

  test("on 1 bit the outline is closed, the bake is the preview, and pressed turns it inside out", async ({ page }) => {
    const obj = button({ buttonColor: "#000000" })
    const p = project("1bit", [obj])
    const at = await render(page, p)
    const isWhite = (x: number, y: number) => at(x, y)[0] === 255

    // A white flood from outside the button must not get in. An anti-aliased
    // 1-px outline cut at 50 % broke up along its curves and let it through.
    const seen = new Set<string>()
    const stack: [number, number][] = [[obj.x - 2, obj.y - 2]]
    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      const key = `${x},${y}`
      if (seen.has(key) || x < obj.x - 2 || y < obj.y - 2 || x > obj.x + obj.width + 1 || y > obj.y + obj.height + 1) continue
      if (!isWhite(x, y)) continue
      seen.add(key)
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
    const inside: [number, number] = [obj.x + 24, obj.y + 3]
    expect(isWhite(...inside), "a white point just inside the outline").toBe(true)
    expect(seen.has(`${inside[0]},${inside[1]}`), "the outside reached the inside").toBe(false)

    const zip = await JSZip.loadAsync(Buffer.from(await page.evaluate((q) => (window as any).__buildDeviceZipForTest(q), p), "base64"))
    const b = JSON.parse(await zip.file("project.json")!.async("string")).screens[0].objects[0]
    const normal = decodeBake(await zip.file(b.pathNormal)!.async("nodebuffer"))
    let differing = 0
    for (let y = 0; y < normal.h; y++)
      for (let x = 0; x < normal.w; x++) if (normal.at(x, y)[0] !== at(obj.x + x, obj.y + y)[0]) differing++
    expect(differing).toBe(0)
    const pressed = decodeBake(await zip.file(b.pathActive)!.async("nodebuffer"))
    expect(pressed.at(70, 3), "pressed is filled black").toEqual([0, 0, 0])
  })
})

test.describe("the button in the property panel", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-firmware not checked out alongside this repo")
  })

  test("offers a style and one colour, and nothing of the old box", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.locator("#software-buttons").check()
    await page.keyboard.press("Escape")

    const { box } = await getMainCanvas(page)
    await page.getByRole("button", { name: "Button", exact: true }).first().click()
    await page.waitForTimeout(150)
    const from = devicePoint(box, 60, 60, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, 200, 110, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    expect(await getSelectedHeader(page)).toContain("Button")

    const style = page.locator("#buttonStyle")
    await expect(style).toHaveValue("tonal")
    await expect(page.getByText("Button Color")).toBeVisible()
    for (const gone of ["Background Color", "Border Color", "Text Color", "Border Width", "Corner Radius"]) {
      await expect(page.getByText(gone, { exact: true }), `${gone} should be gone`).toHaveCount(0)
    }

    // Switching the style repaints the button.
    // Inside the pill, above the label.
    const centre = devicePoint(box, 130, 64, ROUND_FIXTURE_SCREEN)
    const colourAtCentre = () =>
      page.evaluate(([px, py]) => {
        const canvas = Array.from(document.querySelectorAll("canvas")).sort(
          (a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height,
        )[0]
        const r = canvas.getBoundingClientRect()
        const x = Math.round(((px - r.left) / r.width) * canvas.width)
        const y = Math.round(((py - r.top) / r.height) * canvas.height)
        return Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3))
      }, [centre.x, centre.y])
    const tonal = await colourAtCentre()
    await style.selectOption("filled")
    await page.waitForTimeout(200)
    expect(await colourAtCentre()).not.toEqual(tonal)
  })

  test("in the preview a held button is drawn pressed, and let go it is not", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.locator("#software-buttons").check()
    await page.keyboard.press("Escape")

    let { box } = await getMainCanvas(page)
    await page.getByRole("button", { name: "Button", exact: true }).first().click()
    await page.waitForTimeout(150)
    const from = devicePoint(box, 60, 60, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, 200, 110, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    // Its action is "next screen", and there is only this one, so the press
    // leaves the preview where it is.

    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(400)
    ;({ box } = await getMainCanvas(page))

    // Five in from the button's corner: outside the pill at rest (radius 25),
    // inside the pressed shape (radius 10).
    const corner = devicePoint(box, 65, 65, ROUND_FIXTURE_SCREEN)
    const centre = devicePoint(box, 130, 85, ROUND_FIXTURE_SCREEN)
    const colourAt = (pt: { x: number; y: number }) =>
      page.evaluate(([px, py]) => {
        const canvas = Array.from(document.querySelectorAll("canvas")).sort(
          (a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height,
        )[0]
        const r = canvas.getBoundingClientRect()
        const x = Math.round(((px - r.left) / r.width) * canvas.width)
        const y = Math.round(((py - r.top) / r.height) * canvas.height)
        return Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data.slice(0, 3))
      }, [pt.x, pt.y])

    const atRest = await colourAt(corner)
    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.waitForTimeout(200)
    const held = await colourAt(corner)
    await page.mouse.up()
    await page.waitForTimeout(200)
    const released = await colourAt(corner)

    expect(held, "the corner fills in while the button is held").not.toEqual(atRest)
    expect(released, "and is back to the pill once it is let go").toEqual(atRest)
  })
})
