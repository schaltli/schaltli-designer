import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, ROUND_FIXTURE_SCREEN, devicePoint, getMainCanvas, loadProject } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { levelHandleRect, levelLayout } from "../lib/level-shape"
import { migrateProject } from "../lib/object-types"
import { levelSubFont } from "../components/canvas/renderers/render-level-indicator"

// Bar and Slider have no Name and no Icon any more (2026-09-29): a label
// beside a bar is an ordinary Text object, an icon an Icon object. From
// 2026-09-19 to then they carried both on a header line above the bar
// (docs/2026-09-19-slider-look.md, decision 9); this spec replaces the one
// that tested that header.
//
// No migration into separate objects, by decision: an old project simply
// loses name and icon. What is held here is that the panel no longer offers
// them, that a loaded project drops them, that neither export carries them to
// a device - which would otherwise draw the header the preview no longer does
// - and that the preview ignores them where an object still has them.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

const FONT_DIR = path.join(__dirname, "..", "public", "fonts", "bdf")
const bdf = (file: string) => fs.readFileSync(path.join(FONT_DIR, file), "utf8")

// The project font entries exactly as a real project carries them: `size` is
// ascent plus descent.
const FONTS = [
  { id: "font-helvR08", name: "helvR08", displayName: "helvR08", path: "fonts/helvR08.bdf", size: 12, ascent: 10, descent: 2, data: bdf("helvR08.bdf"), format: "bdf" as const },
  { id: "font-helvR12", name: "helvR12", displayName: "helvR12", path: "fonts/helvR12.bdf", size: 18, ascent: 14, descent: 4, data: bdf("helvR12.bdf"), format: "bdf" as const },
  { id: "font-helvR24", name: "helvR24", displayName: "helvR24", path: "fonts/helvR24.bdf", size: 35, ascent: 28, descent: 7, data: bdf("helvR24.bdf"), format: "bdf" as const },
]

// mdi:water, drawn in red so that any of its ink would be found.
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

const W = 360
const H = 240

// A slider as an old project has it: a name and a red icon on it.
function oldSlider(extra: Record<string, unknown> = {}): any {
  return {
    id: "bar",
    type: "slider",
    zIndex: 0,
    x: 20,
    y: 60,
    width: 320,
    height: 80,
    properties: {
      topic: "t/level",
      writeTopic: "t/level",
      setpointTopic: "t/set",
      direction: "left-to-right",
      displayValue: "value",
      calibrationPoints: [
        { value: 0, barSizePercent: 0 },
        { value: 100, barSizePercent: 100 },
      ],
      fillColor: "#6495ED",
      textColor: "#000000",
      fontSize: 12,
      fontId: "font-helvR24",
      label: "Wasser",
      iconAssetId: WATER.id,
      iconColor: "#ff0000",
      ...extra,
    },
  }
}

function withoutHeader(obj: any): any {
  const { label: _label, iconAssetId: _icon, ...properties } = obj.properties
  return { ...obj, properties }
}

function renderProject(obj: any) {
  return {
    name: "level-no-header",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: "24bit" },
    fonts: FONTS,
    assets: [WATER],
    topics: [
      { topic: "t/level", examples: ["45"] },
      { topic: "t/set", examples: ["80"] },
    ],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects: [obj] }],
  }
}

/** How many pixels a BDF string sets, straight from the glyph bitmaps. */
function inkOf(font: string, text: string): number {
  let total = 0
  for (const ch of text) {
    const start = new RegExp(`^ENCODING ${ch.codePointAt(0)}\\r?$`, "m").exec(font)
    if (!start) throw new Error(`no glyph for ${ch}`)
    const block = font.slice(start.index, font.indexOf("ENDCHAR", start.index))
    const width = Number(/^BBX (\d+)/m.exec(block)![1])
    for (const row of block.split("BITMAP")[1].trim().split(/\s+/)) {
      const bits = Number.parseInt(row, 16).toString(2).padStart(row.length * 4, "0").slice(0, width)
      total += [...bits].filter((b) => b === "1").length
    }
  }
  return total
}

async function picture(page: Page, obj: any): Promise<string> {
  return page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: renderProject(obj),
    screenIndex: 0,
    topicOverrides: { "t/level": "45", "t/set": "80" },
  })
}

/** Every pixel of the render canvas, as RGB triples. */
async function pixels(page: Page): Promise<number[][]> {
  const data: number[] = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
  })
  const out: number[][] = []
  for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]])
  return out
}

// Every level object anywhere in a project's screens, children included.
function levels(project: any): any[] {
  const walk = (objects: any[] = []): any[] =>
    objects.flatMap((o) => [...(o.type === "bar" || o.type === "slider" ? [o] : []), ...walk(o.children)])
  return (project.screens ?? []).flatMap((s: any) => walk(s.objects))
}

test.describe("a Bar or Slider has no name and no icon", () => {
  test("the shape is the same whether an old object still carries them or not", () => {
    const old = oldSlider()
    expect(levelLayout(old, FONTS)).toEqual(levelLayout(withoutHeader(old), FONTS))
    expect(levelHandleRect(old, 80, FONTS)).toEqual(levelHandleRect(withoutHeader(old), 80, FONTS))
    // No room taken off the top: the bar starts at the object's own top edge.
    expect(levelLayout(old, FONTS).bar.y).toBe(old.y)
  })

  test("loading drops them, at the top level and inside a container, and nowhere else", () => {
    const project = migrateProject({
      screens: [
        {
          id: "s",
          objects: [
            { type: "bar", properties: { topic: "a", label: "Frischwasser", iconAssetId: "ico" } },
            // The type a project saved before 2026-09-20 has.
            { type: "level-indicator", properties: { topic: "b", writeTopic: "b/set", label: "Licht", iconAssetId: "ico" } },
            {
              type: "tab-control",
              properties: {},
              children: [{ type: "slider", properties: { topic: "c", writeTopic: "c/set", label: "Dimmer" } }],
            },
            // A button's icon and a text's label are theirs to keep.
            { type: "button", properties: { text: "Go", iconAssetId: "ico" } },
          ],
        },
      ],
    } as any) as any
    const found = levels(project)
    expect(found).toHaveLength(3)
    for (const level of found) {
      expect(level.properties).not.toHaveProperty("label")
      expect(level.properties).not.toHaveProperty("iconAssetId")
    }
    expect(project.screens[0].objects[3].properties.iconAssetId).toBe("ico")
  })

  test("the level header's smaller font is still what a gauge's bracketed number uses", () => {
    // levelSubFont outlived the header it was written for: the ring's second
    // number is written in it (render-arc-level.ts).
    const gauge = { id: "g", type: "gauge", zIndex: 0, x: 0, y: 0, width: 100, height: 100, properties: { fontId: "font-helvR24" } } as any
    expect(levelSubFont(FONTS as any, gauge)?.id).toBe("font-helvR12")
    expect(levelSubFont(FONTS as any, { ...gauge, properties: { fontId: "font-helvR12" } })?.id).toBe("font-helvR08")
  })
})

test.describe("the preview of a Bar or Slider", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("draws a name and an icon an old object still carries not at all", async ({ page }) => {
    const old = oldSlider()
    const drawn = await picture(page, old)
    expect(drawn).toBe(await picture(page, withoutHeader(old)))

    // And what it does draw in black is the one number, the commanded 80 -
    // no name, and no bracketed measured value, which lived on the header line.
    await picture(page, old)
    const all = await pixels(page)
    const black = all.filter(([r, g, b]) => r === 0 && g === 0 && b === 0).length
    expect(black).toBe(inkOf(FONTS[2].data, "80"))
    const red = all.filter(([r, g, b]) => r > 150 && g < 120 && b < 120).length
    expect(red, "no ink of the icon").toBe(0)
  })
})

test.describe("the property panel of a Bar and a Slider", () => {
  async function drawTool(page: Page, tool: string, screen?: { width: number; height: number }) {
    await page.getByRole("button", { name: tool, exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 40, 150, screen)
    const to = devicePoint(box, 240, 200, screen)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
  }

  async function expectNoNameOrIcon(page: Page, type: string) {
    await expect(page.locator("h3").first()).toContainText(type)
    // The panel is there - its first field is what is left of Content.
    await expect(page.locator("#displayValue")).toBeVisible()
    await expect(page.locator("#level-label")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^(Choose|Change) icon$/ })).toHaveCount(0)
  }

  test("a Bar offers no Name and no Icon", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await drawTool(page, "Bar")
    await expectNoNameOrIcon(page, "Bar")
  })

  test("a Slider offers no Name and no Icon", async ({ page }) => {
    // A Slider needs a touch device; the round fixture is one.
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, SWITCH_TEST_PROJECT)
    await drawTool(page, "Slider", ROUND_FIXTURE_SCREEN)
    await expectNoNameOrIcon(page, "Slider")
  })
})

test.describe("a project with an old named bar", () => {
  async function projectZipWithOldBar(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.assets = [...(project.assets ?? []), WATER]
    project.screens[0].objects.push({
      id: "old-bar",
      type: "bar",
      zIndex: 99,
      x: 10,
      y: 200,
      width: 200,
      height: 50,
      properties: { topic: project.topics?.[0]?.topic ?? "t/level", label: "Frischwasser", iconAssetId: WATER.id, displayValue: "percentage" },
    })
    zip.file("project.json", JSON.stringify(project))
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "old-bar-")), "old-bar.zip")
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return file
  }

  async function downloadProject(page: Page): Promise<any> {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  }

  async function exported(page: Page, hook: string, project: unknown): Promise<any> {
    const base64: string = await page.evaluate(([name, arg]) => (window as any)[name as string](arg), [hook, project] as const)
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
    return JSON.parse(await zip.file("project.json")!.async("string"))
  }

  test("loses name and icon on loading, and no export carries them to a device", async ({ page }) => {
    test.setTimeout(120_000)
    const zipPath = await projectZipWithOldBar()
    await loadProject(page, zipPath)
    const saved = await downloadProject(page)
    const bar = levels(saved).find((o) => o.id === "old-bar")
    expect(bar, "the bar itself survives").toBeTruthy()
    expect(bar.properties).not.toHaveProperty("label")
    expect(bar.properties).not.toHaveProperty("iconAssetId")

    // Both device exports, from the project as the designer now holds it and
    // from one as an old file has it, never loaded - an export reached some
    // other way than through loading drops them too.
    const old = {
      name: "old-bar",
      screenWidth: W,
      screenHeight: H,
      fonts: [],
      assets: [WATER],
      topics: [{ id: "t", topic: "t/level", type: "numeric", examples: ["40"] }],
      hardwareButtons: [],
      settings: { colorDepth: "24bit", exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
      nextId: 10,
      screens: [
        { id: "m", name: "M", isMaster: true, themeId: "slate", objects: [] },
        {
          id: "s",
          name: "S",
          masterScreenId: "m",
          objects: [
            { id: "old-bar", type: "bar", zIndex: 1, x: 10, y: 10, width: 300, height: 60,
              properties: { topic: "t/level", label: "Frischwasser", iconAssetId: WATER.id, iconColor: "accent", fillColor: "accent" } },
          ],
        },
      ],
    }
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
    for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"]) {
      for (const source of [saved, old]) {
        const device = await exported(page, hook, source)
        const out = levels(device).find((o) => o.id === "old-bar")
        expect(out, `${hook}: the bar is exported`).toBeTruthy()
        expect(out.properties, hook).not.toHaveProperty("label")
        expect(out.properties, hook).not.toHaveProperty("iconAssetId")
        expect(out.path, `${hook}: no header icon baked`).toBeUndefined()
      }
    }
  })
})
