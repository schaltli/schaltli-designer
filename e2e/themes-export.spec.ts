import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { THEMES, COLOR_KEYS, applyTheme, darkVariantOf, isRole, type Theme } from "../lib/themes"
import { loadProject } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { SYSTEM_GENERATION_STRING } from "../lib/system-generation"
import { switchKnobLook } from "../lib/switch-shape"

// theme-export (docs/2026-09-25-themes-export.md): the dark variant reaches
// the device beside the light one. One rule for the whole export: beside a
// field X, an optional XDark. Light stays as it was, so a device that does
// not know XDark shows light, exactly as before.

const SLATE = THEMES.find((t) => t.id === "slate")!
const AMBER = THEMES.find((t) => t.id === "amber")!

// A master in Slate with a label, a box, a bar and a transparent-backed text,
// a screen that inherits it, and one in Amber. Roles only; one object leaves
// a colour unset, which is drawn with its default role.
function project(colorDepth: "24bit" | "4bit" | "1bit") {
  return {
    name: "dark-export",
    screenWidth: 360,
    screenHeight: 360,
    fonts: [],
    assets: [],
    topics: [{ id: "t", topic: "t/level", type: "numeric", examples: ["40"] }],
    hardwareButtons: [],
    settings: { colorDepth, exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
    nextId: 10,
    screens: [
      {
        id: "m",
        name: "M",
        isMaster: true,
        themeId: "slate",
        objects: [
          { id: "label", type: "text", zIndex: 1, x: 10, y: 10, width: 200, height: 24,
            properties: { text: "Stube", color: "text", backgroundColor: "transparent", borderColor: "transparent" } },
          { id: "box", type: "box", zIndex: 2, x: 10, y: 50, width: 200, height: 60,
            properties: { fillColor: "panel", strokeColor: "outline", strokeWidth: 1 } },
          { id: "bar", type: "bar", zIndex: 3, x: 10, y: 130, width: 300, height: 40,
            properties: { topic: "t/level", fillColor: "accent" } },
        ],
      },
      { id: "a", name: "A", masterScreenId: "m", objects: [] },
      { id: "b", name: "B", masterScreenId: "m", themeId: "amber", objects: [] },
    ],
  }
}

async function exported(page: Page, hook: "__buildDeviceZipForTest" | "__buildAndroidZipForTest", p: unknown) {
  const base64: string = await page.evaluate(([name, arg]) => (window as any)[name as string](arg), [hook, p] as const)
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  return { zip, json: JSON.parse(await zip.file("project.json")!.async("string")) }
}

// The project as the designer holds it, through File > Download Project.
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

// Every key ending in "Dark", anywhere in the screens, with its path.
function darkKeys(node: any, where = ""): string[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => darkKeys(n, `${where}[${i}]`))
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) => [...(k.endsWith("Dark") ? [`${where}.${k}`] : []), ...darkKeys(v, `${where}.${k}`)])
  return []
}

function stripDark(node: any): any {
  if (Array.isArray(node)) return node.map(stripDark)
  if (node && typeof node === "object")
    return Object.fromEntries(Object.entries(node).filter(([k]) => !k.endsWith("Dark")).map(([k, v]) => [k, stripDark(v)]))
  return node
}

test.describe("the dark variant in the export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook}: every colour from a role has its dark value beside it, in each screen's theme`, async ({ page }) => {
      const { json } = await exported(page, hook, project("24bit"))
      const screen = (id: string) => json.screens.find((s: any) => s.id === id)
      const obj = (id: string, objId: string) => screen(id).objects.find((o: any) => o.id === objId).properties

      for (const [screenId, theme] of [["a", SLATE], ["b", AMBER]] as [string, Theme][]) {
        expect(screen(screenId).backgroundColor.toLowerCase()).toBe(theme.light.surface.toLowerCase())
        expect(screen(screenId).backgroundColorDark.toLowerCase()).toBe(theme.dark.surface.toLowerCase())
        // Light as before, dark beside it - a master's objects in the theme
        // of the screen they are on.
        expect(obj(screenId, "label").color.toLowerCase()).toBe(theme.light.text.toLowerCase())
        expect(obj(screenId, "label").colorDark.toLowerCase()).toBe(theme.dark.text.toLowerCase())
        expect(obj(screenId, "box").fillColorDark.toLowerCase()).toBe(theme.dark.panel.toLowerCase())
        expect(obj(screenId, "box").strokeColorDark.toLowerCase()).toBe(theme.dark.outline.toLowerCase())
        expect(obj(screenId, "bar").fillColorDark.toLowerCase()).toBe(theme.dark.accent.toLowerCase())
        // Unset on the bar, drawn with its default role: dark too.
        expect(obj(screenId, "bar").textColorDark.toLowerCase()).toBe(theme.dark.text.toLowerCase())
        // "transparent" is the same in both variants and gets no dark value.
        expect(obj(screenId, "label").backgroundColorDark).toBeUndefined()
        expect(obj(screenId, "label").borderColorDark).toBeUndefined()
      }
      expect(json.systemGeneration ?? SYSTEM_GENERATION_STRING).toBe(SYSTEM_GENERATION_STRING)
    })

    test(`${hook}: without its dark keys the export is the light export, colour for colour`, async ({ page }) => {
      const { json } = await exported(page, hook, project("24bit"))
      // Every XDark has its X, on screens and in properties.
      for (const screen of json.screens) {
        if ("backgroundColorDark" in screen) expect(screen.backgroundColor, `${screen.id}.backgroundColor`).toBeDefined()
        for (const o of screen.objects) {
          for (const key of Object.keys(o.properties).filter((k) => k.endsWith("Dark"))) {
            expect(o.properties[key.replace(/Dark$/, "")], `${screen.id}/${o.id}.${key} without its light key`).toBeDefined()
          }
        }
      }
      // What a reader that skips XDark sees: the light colours, each the
      // light value of its role in the screen's theme - nothing else moved.
      const light = stripDark(json.screens)
      const src = project("24bit")
      for (const [screenId, theme] of [["a", SLATE], ["b", AMBER]] as [string, Theme][]) {
        const expected = applyTheme(src.screens[0].objects as any[], theme, "light", "24bit")
        const got = light.find((s: any) => s.id === screenId).objects
        for (const e of expected) {
          const g = got.find((o: any) => o.id === e.id)
          for (const key of COLOR_KEYS) {
            const want = e.properties[key]
            if (want === undefined) continue
            expect(String(g.properties[key]).toLowerCase(), `${screenId}/${e.id}.${key}`).toBe(String(want).toLowerCase())
          }
        }
      }
    })
  }

  test("the firmware and the app carry the same dark keys", async ({ page }) => {
    const firmware = darkKeys((await exported(page, "__buildDeviceZipForTest", project("24bit"))).json.screens)
      .filter((k) => k.includes(".properties.") || k.endsWith("backgroundColorDark"))
    const app = darkKeys((await exported(page, "__buildAndroidZipForTest", project("24bit"))).json.screens)
      .filter((k) => k.includes(".properties.") || k.endsWith("backgroundColorDark"))
    // Same colours on both sides; the two bundles order objects alike.
    const names = (keys: string[]) => keys.map((k) => k.replace(/^.*\.(\w+Dark)$/, "$1")).sort()
    expect(names(app)).toEqual(names(firmware))
  })

  for (const depth of ["4bit", "1bit"] as const) {
    test(`a ${depth} device has one variant: no dark key at all`, async ({ page }) => {
      const { json } = await exported(page, "__buildDeviceZipForTest", project(depth))
      expect(darkKeys(json)).toEqual([])
    })
  }

  test("the export is generation 1.1, which the corpus and the deploy check accept", async ({ page }) => {
    const { json } = await exported(page, "__buildDeviceZipForTest", project("24bit"))
    expect(json.systemGeneration).toBe("1.1")
    expect(SYSTEM_GENERATION_STRING).toBe("1.1")
    // Only the dark keys are new: every one of them is a role's dark value.
    for (const screen of json.screens) {
      for (const o of screen.objects) {
        for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
          if (k.endsWith("Dark")) expect(isRole(v), `${o.id}.${k} is a hex, not a role`).toBe(false)
        }
      }
    }
  })
})

// Task 2: the dark bitmaps. Every bake kind, from a master shown on two
// screens in two themes, so a bake that reads the light background or the
// master's theme instead of what it is handed shows up as a wrong pixel.
const svg = (body: string, box = 24) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}">${body}</svg>`).toString("base64")
const SQUARE = svg('<rect x="6" y="6" width="12" height="12" fill="currentColor"/>')
const RED_SQUARE = svg('<rect x="6" y="6" width="12" height="12" fill="#aa0000"/>')
const BLUE_WALL = svg('<rect width="10" height="10" fill="#336699"/>', 10)

function bakesProject(colorDepth: "24bit" | "4bit" = "24bit") {
  return {
    name: "dark-bakes",
    screenWidth: 360,
    screenHeight: 360,
    fonts: [],
    assets: [
      { id: "sq", name: "sq", type: "icon", data: SQUARE },
      { id: "red", name: "red", type: "icon", data: RED_SQUARE },
      { id: "wall", name: "wall", type: "image", data: BLUE_WALL },
    ],
    topics: [
      { id: "t", topic: "t/level", type: "numeric", examples: ["40"] },
      { id: "p", topic: "t/power", type: "text", examples: ["on"] },
    ],
    hardwareButtons: [],
    settings: { colorDepth, exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
    nextId: 20,
    screens: [
      {
        id: "m",
        name: "M",
        isMaster: true,
        themeId: "slate",
        objects: [
          { id: "icon", type: "icon", zIndex: 1, x: 10, y: 10, width: 48, height: 48,
            properties: { assetId: "sq", iconColor: "accent" } },
          { id: "live", type: "live-icon", zIndex: 2, x: 70, y: 10, width: 48, height: 48,
            properties: { topic: "t/power", iconColor: "accent",
              valueIconPairs: [{ id: "pair", ifValue: "on", thenShowIcon: "sq" }] } },
          { id: "bar", type: "bar", zIndex: 3, x: 10, y: 70, width: 300, height: 60,
            properties: { topic: "t/level", iconAssetId: "sq", iconColor: "accent", fillColor: "accent" } },
          { id: "sw", type: "switch", zIndex: 4, x: 10, y: 150, width: 200, height: 60,
            properties: { topic: "t/power", writeTopic: "t/set", switchStyle: "filled", switchColor: "accent",
              states: [
                { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
                { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true, iconAssetId: "sq" },
              ] } },
          { id: "btn", type: "button", zIndex: 5, x: 10, y: 240, width: 200, height: 60,
            properties: { text: "", buttonStyle: "filled", buttonColor: "accent", action: { type: "next-screen" } } },
        ],
      },
      { id: "a", name: "A", masterScreenId: "m", objects: [] },
      { id: "b", name: "B", masterScreenId: "m", themeId: "amber", objects: [] },
      // Its own colours on a wall that covers the theme's surface: nothing
      // here changes between light and dark.
      { id: "c", name: "C", masterScreenId: "m", showMaster: false, backgroundImageAssetId: "wall",
        objects: [{ id: "own", type: "icon", zIndex: 1, x: 10, y: 10, width: 48, height: 48, properties: { assetId: "red" } }] },
    ],
  }
}

// The colour of one pixel of a bitmap in the zip, decoded by the browser.
async function pixel(page: Page, zip: JSZip, path: string, where: "corner" | "center" | [number, number]): Promise<string> {
  const file = zip.file(path)
  expect(file, `${path} is in the zip`).toBeTruthy()
  const bytes = Array.from(await file!.async("uint8array"))
  return page.evaluate(async ([data, at]) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data as number[])], { type: "image/bmp" }))
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(bitmap, 0, 0)
    const [x, y] = at === "corner" ? [0, 0] : at === "center" ? [bitmap.width >> 1, bitmap.height >> 1] : (at as number[])
    const px = ctx.getImageData(x, y, 1, 1).data
    return "#" + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, "0")).join("")
  }, [bytes, where] as const)
}

const LIGHT_PATH_KEYS = ["path", "pathNormal", "pathActive"]

// Every light path anywhere under a node, with the dark one beside it.
function pathPairs(node: any, where = ""): { where: string; key: string; light: string; dark: unknown }[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => pathPairs(n, `${where}[${i}]`))
  if (!node || typeof node !== "object") return []
  const own = LIGHT_PATH_KEYS.filter((k) => typeof node[k] === "string").map((k) => ({ where, key: k, light: node[k], dark: node[`${k}Dark`] }))
  return [...own, ...Object.entries(node).flatMap(([k, v]) => pathPairs(v, `${where}.${k}`))]
}

test.describe("the dark bitmaps for the firmware", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  test("every light path has its dark path beside it, and the file is in the zip", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildDeviceZipForTest", bakesProject())
    const pairs = pathPairs(json.screens)
    // Every bake kind is in there: icon, live-icon rule, level icon, switch
    // state icon normal and active, button normal and active.
    expect(json.screens.map((s: any) => s.path ?? s.pathDark), "no flattened background, light or dark").toEqual(
      json.screens.map(() => undefined),
    )
    const kind = (p: { key: string; light: string }) =>
      p.key + (p.light.includes("-button-") ? ":button" : p.light.includes("-level-icon") ? ":level" : "")
    expect([...new Set(pairs.map(kind))].sort()).toEqual(["path", "path:level", "pathActive", "pathActive:button", "pathNormal:button"])
    expect(pairs.length).toBeGreaterThan(10)
    for (const p of pairs) {
      expect(typeof p.dark, `${p.where}.${p.key}Dark`).toBe("string")
      expect(zip.file(p.dark as string), `${p.dark} is in the zip`).toBeTruthy()
    }
  })

  test("each dark file carries the dark background and the dark tint of its screen's theme", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildDeviceZipForTest", bakesProject())
    const screen = (id: string) => json.screens.find((s: any) => s.id === id)
    const obj = (id: string, objId: string) => screen(id).objects.find((o: any) => o.id === objId)
    const lc = (s: string) => s.toLowerCase()
    for (const [id, theme] of [["a", SLATE], ["b", AMBER]] as [string, Theme][]) {
      const { surface, accent } = theme.dark
      for (const [label, path] of [
        ["icon", obj(id, "icon").pathDark],
        ["live-icon rule", obj(id, "live").properties.valueIconPairs[0].pathDark],
      ]) {
        expect(await pixel(page, zip, path, "corner"), `${id}: ${label} background`).toBe(lc(surface))
        expect(await pixel(page, zip, path, "center"), `${id}: ${label} tint`).toBe(lc(accent))
      }
      // The level icon is cropped to its ink, so it has no background corner.
      expect(await pixel(page, zip, obj(id, "bar").pathDark, "center"), `${id}: level icon tint`).toBe(lc(accent))
      // A switch state's icon is cropped to its ink, which the switch derives
      // from its colour and the screen - both dark here.
      const sw = obj(id, "sw")
      const darkSwitch = { ...sw, properties: { ...sw.properties, switchColor: sw.properties.switchColorDark } }
      for (const [on, path] of [[false, sw.properties.states[1].pathDark], [true, sw.properties.states[1].pathActiveDark]] as const) {
        const ink = switchKnobLook(darkSwitch, surface, "24bit", on).onKnob
        expect(await pixel(page, zip, path, "center"), `${id}: switch icon ink, ${on ? "on" : "off"}`).toBe(lc(ink))
      }
      // A filled button is its colour.
      expect(await pixel(page, zip, obj(id, "btn").pathNormalDark, [30, 30]), `${id}: button fill`).toBe(lc(accent))
      // Outside the pill's rounded corner: the screen behind it, dark.
      expect(await pixel(page, zip, obj(id, "btn").pathNormalDark, [0, 0]), `${id}: button backdrop`).toBe(lc(surface))
      // And the light files still stand on the light surface of the theme.
      expect(await pixel(page, zip, obj(id, "icon").path, "corner"), `${id}: light icon background`).toBe(lc(theme.light.surface))
      expect(await pixel(page, zip, obj(id, "btn").pathNormal, [0, 0]), `${id}: light button backdrop`).toBe(lc(theme.light.surface))
    }
    // A master's object on two screens in two themes: two dark files.
    expect(obj("a", "icon").pathDark).not.toBe(obj("b", "icon").pathDark)
    expect(obj("a", "btn").pathNormalDark).not.toBe(obj("b", "btn").pathNormalDark)
  })

  test("a bake that does not change in dark is written once and both fields name it", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildDeviceZipForTest", bakesProject())
    const screen = (id: string) => json.screens.find((s: any) => s.id === id)
    const own = screen("c").objects.find((o: any) => o.id === "own")
    expect(own.pathDark).toBe(own.path)
    expect(zip.file("assets/c_own-dark.bmp")).toBeNull()
    // Where the picture does change, "-dark" names the second file.
    expect(screen("a").objects.find((o: any) => o.id === "icon").pathDark).toMatch(/-dark\.bmp$/)
  })

  test("a 4-bit export bakes no dark file", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildDeviceZipForTest", bakesProject("4bit"))
    expect(Object.keys(zip.files).filter((f) => f.includes("-dark"))).toEqual([])
    expect(darkKeys(json)).toEqual([])
  })
})

// Task 3: the same for the app. Its fields are named differently - a
// screen's backgroundImage, a switch state's path/activePath, a button's
// path/pressedPath - and each gets its XDark beside it by the same rule.
const ANDROID_PATH_KEYS = ["backgroundImage", "path", "activePath", "pressedPath"]

function androidPathPairs(node: any, where = ""): { where: string; key: string; light: string; dark: unknown }[] {
  if (Array.isArray(node)) return node.flatMap((n, i) => androidPathPairs(n, `${where}[${i}]`))
  if (!node || typeof node !== "object") return []
  const own = ANDROID_PATH_KEYS.filter((k) => typeof node[k] === "string").map((k) => ({ where, key: k, light: node[k], dark: node[`${k}Dark`] }))
  return [...own, ...Object.entries(node).flatMap(([k, v]) => androidPathPairs(v, `${where}.${k}`))]
}

test.describe("the dark bitmaps for the app", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  test("every light path has its dark path beside it, and the file is in the bundle", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildAndroidZipForTest", bakesProject())
    const pairs = androidPathPairs(json.screens)
    // Screen background, icon, live-icon rule, level icon, switch state
    // (normal and active), button (normal and pressed).
    expect([...new Set(pairs.map((p) => p.key))].sort()).toEqual(["activePath", "backgroundImage", "path", "pressedPath"])
    for (const p of pairs) {
      expect(typeof p.dark, `${p.where}.${p.key}Dark`).toBe("string")
      expect(zip.file(p.dark as string), `${p.dark} is in the bundle`).toBeTruthy()
    }
  })

  test("each dark file carries the dark background and the dark ink of its screen's theme", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildAndroidZipForTest", bakesProject())
    const screen = (id: string) => json.screens.find((s: any) => s.id === id)
    const obj = (id: string, objId: string) => screen(id).objects.find((o: any) => o.id === objId)
    const lc = (s: string) => s.toLowerCase()
    for (const [id, theme] of [["a", SLATE], ["b", AMBER]] as [string, Theme][]) {
      const { surface, accent } = theme.dark
      // The app draws the whole screen picture, so here it is really used.
      expect(await pixel(page, zip, screen(id).backgroundImageDark, [355, 355]), `${id}: screen background`).toBe(lc(surface))
      expect(await pixel(page, zip, screen(id).backgroundImage, [355, 355]), `${id}: light unchanged`).toBe(lc(theme.light.surface))
      // A box-free screen shows the icon on the dark surface in the picture.
      expect(await pixel(page, zip, screen(id).backgroundImageDark, [34, 34]), `${id}: icon in the picture`).toBe(lc(accent))
      // Icons travel as SVGs, tinted: the dark one in the dark accent.
      for (const [label, path] of [
        ["icon", obj(id, "icon").pathDark],
        ["live-icon rule", obj(id, "live").properties.valueIconPairs[0].pathDark],
      ]) {
        expect(lc(await zip.file(path)!.async("string")), `${id}: ${label} tint`).toContain(lc(accent))
      }
      expect(await pixel(page, zip, obj(id, "bar").pathDark, "center"), `${id}: level icon`).toBe(lc(accent))
      const sw = obj(id, "sw")
      const darkSwitch = { ...sw, properties: { ...sw.properties, switchColor: sw.properties.switchColorDark } }
      for (const [on, path] of [[false, sw.properties.states[1].pathDark], [true, sw.properties.states[1].activePathDark]] as const) {
        const ink = switchKnobLook(darkSwitch, surface, "24bit", on).onKnob
        expect(await pixel(page, zip, path, "center"), `${id}: switch icon ink, ${on ? "on" : "off"}`).toBe(lc(ink))
      }
      expect(await pixel(page, zip, obj(id, "btn").pathDark, [30, 30]), `${id}: button fill`).toBe(lc(accent))
    }
    // A master's object on two screens in two themes: two dark files.
    expect(obj("a", "btn").pathDark).not.toBe(obj("b", "btn").pathDark)
    expect(obj("a", "icon").pathDark).not.toBe(obj("b", "icon").pathDark)
  })

  test("a picture that does not change in dark is written once and both fields name it", async ({ page }) => {
    const { zip, json } = await exported(page, "__buildAndroidZipForTest", bakesProject())
    const c = json.screens.find((s: any) => s.id === "c")
    expect(c.backgroundImageDark).toBe(c.backgroundImage)
    expect(zip.file("assets/c-dark.png")).toBeNull()
    const own = c.objects.find((o: any) => o.id === "own")
    expect(own.pathDark).toBe(own.path)
    expect(json.screens.find((s: any) => s.id === "a").backgroundImageDark).toMatch(/-dark\.png$/)
  })
})

// Task 4: the reference render draws an exported project in dark - every
// XDark in place of its X - and that is what the designer shows with Dark on.
// The oracle is the screen's thumbnail: it draws at the screen's own size with
// the same renderer, so the two can be compared pixel for pixel. Only the
// square inside the round fixture's cut-out is compared; outside it the
// thumbnail carries the device mask, which a reference image does not.
test.describe("the reference render in dark", () => {
  const FONT = "font-helvR08"
  const INSIDE = { x: 60, y: 60, w: 240, h: 240 }

  async function darkProjectZip(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", "test-projects", "switch-test-project.zip")))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.topics.push({ id: "t-level", topic: "t/level", type: "numeric", examples: ["40"] })
    const objects = [
      { id: "label", type: "text", zIndex: 1, x: 80, y: 70, width: 200, height: 20,
        properties: { text: "Stube", fontId: FONT, color: "text", backgroundColor: "transparent", borderColor: "transparent" } },
      { id: "box", type: "box", zIndex: 2, x: 80, y: 100, width: 90, height: 60,
        properties: { fillColor: "panel", strokeColor: "outline", strokeWidth: 2 } },
      { id: "gauge", type: "gauge", zIndex: 3, x: 190, y: 95, width: 80, height: 80,
        properties: { topic: "t/level", fillColor: "accent", fontId: FONT } },
      { id: "bar", type: "bar", zIndex: 4, x: 80, y: 175, width: 200, height: 40,
        properties: { topic: "t/level", fillColor: "accent", fontId: FONT, label: "Tank" } },
      { id: "sw", type: "button-group", zIndex: 5, x: 80, y: 230, width: 120, height: 36,
        properties: { topic: "test/switch-mode", writeTopic: "test/switch-cmd", fontId: FONT, switchColor: "accent",
          states: [
            { id: "s-off", label: "Off", readValue: "off", writeValue: "off" },
            { id: "s-low", label: "Low", readValue: "low", writeValue: "low" },
          ] } },
      { id: "btn", type: "button", zIndex: 6, x: 210, y: 230, width: 70, height: 36,
        properties: { text: "Go", fontId: FONT, buttonStyle: "filled", buttonColor: "accent", action: { type: "next-screen" } } },
    ]
    project.screens = [
      { id: "dm", name: "Dark master", isMaster: true, themeId: "ocean", objects: [] },
      { id: "d", name: "Dark", masterScreenId: "dm", objects },
    ]
    zip.file("project.json", JSON.stringify(project))
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dark-render-")), "dark-render.zip")
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return file
  }

  // The RGB of every pixel of the inner square, of a canvas or a data URL.
  const inside = (source: { thumbnail: string } | { dataUrl: string }) => (page: Page) =>
    page.evaluate(async ([src, r]) => {
      let canvas: HTMLCanvasElement
      if ("thumbnail" in src) {
        canvas = document.querySelector(`[data-screen-id="${src.thumbnail}"] canvas`) as HTMLCanvasElement
      } else {
        const img = new Image()
        img.src = src.dataUrl
        await img.decode()
        canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        canvas.getContext("2d")!.drawImage(img, 0, 0)
      }
      const d = canvas.getContext("2d")!.getImageData(r.x, r.y, r.w, r.h).data
      const rgb: number[] = []
      for (let i = 0; i < d.length; i += 4) rgb.push(d[i], d[i + 1], d[i + 2])
      return rgb
    }, [source, INSIDE] as const)

  const differing = (a: number[], b: number[]) => {
    let n = 0
    for (let i = 0; i < a.length; i += 3) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++
    return n
  }

  test("an exported project rendered in dark is the designer's canvas with Dark on, pixel for pixel", async ({ page }) => {
    test.setTimeout(120_000)
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, await darkProjectZip())
    await page.locator('[data-screen-id="d"]').click()

    // Settled: fonts loaded, then three reads in a row agree (icons and
    // glyphs arrive late). Bounded, and it says so when it gives up.
    const settled = async (read: () => Promise<number[]>) => {
      await page.evaluate(() => document.fonts.ready)
      let before = await read()
      let agreeing = 0
      for (let attempt = 0; attempt < 25; attempt++) {
        await page.waitForTimeout(300)
        const now = await read()
        agreeing = differing(before, now) === 0 ? agreeing + 1 : 0
        if (agreeing === 3) return now
        before = now
      }
      throw new Error("the thumbnail never settled")
    }
    const lightThumb = await settled(() => inside({ thumbnail: "d" })(page))
    const dark = page.getByRole("switch", { name: "Dark" })
    await dark.click()
    await expect(dark).toHaveAttribute("aria-checked", "true")
    await expect.poll(async () => differing(lightThumb, await inside({ thumbnail: "d" })(page))).toBeGreaterThan(1000)
    const darkThumb = await settled(() => inside({ thumbnail: "d" })(page))

    const designed = await downloadProject(page)
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const base64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), designed)
    const exportedJson = JSON.parse(await (await JSZip.loadAsync(Buffer.from(base64, "base64"))).file("project.json")!.async("string"))
    // The device's project carries no assets, the designer's does: the
    // render draws icons from them (there are none here, but a missing list
    // is not what a device has).
    const project = { ...exportedJson, assets: designed.assets ?? [] }
    const screenIndex = exportedJson.screens.findIndex((s: any) => s.id === "d")
    const render = (variant?: "dark") =>
      page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex, topicOverrides: {}, variant })

    const lightRender = await inside({ dataUrl: await render() })(page)
    const darkRender = await inside({ dataUrl: await render("dark") })(page)
    // The firmware export adjusts geometry on purpose - a text's height becomes
    // its font's, every coordinate a whole pixel - so the exported project
    // and the designer's drawing differ at a few glyph and corner edges
    // already in light. Those pixels say nothing about dark and are left out;
    // everywhere else, dark has to be the designer's dark exactly.
    const geometry = new Set<number>()
    for (let i = 0; i < lightRender.length; i += 3) {
      if (lightRender[i] !== lightThumb[i] || lightRender[i + 1] !== lightThumb[i + 1] || lightRender[i + 2] !== lightThumb[i + 2]) geometry.add(i)
    }
    // Measured 2026-09-25: 973 pixels, all at glyph and corner edges.
    expect(geometry.size, "light render vs light thumbnail: only a few edge pixels").toBeLessThan(1100)
    const wrong: string[] = []
    for (let i = 0; i < darkRender.length; i += 3) {
      if (geometry.has(i)) continue
      if (darkRender[i] !== darkThumb[i] || darkRender[i + 1] !== darkThumb[i + 1] || darkRender[i + 2] !== darkThumb[i + 2]) {
        const n = i / 3
        wrong.push(`${INSIDE.x + (n % INSIDE.w)},${INSIDE.y + Math.floor(n / INSIDE.w)}`)
      }
    }
    expect(wrong.slice(0, 10), `${wrong.length} pixels differ from the designer's dark`).toEqual([])
    expect(differing(darkRender, lightRender), "dark is a different picture").toBeGreaterThan(1000)
  })

  test("darkVariantOf takes every XDark in place of its X, and leaves the rest", () => {
    const screen = {
      id: "s",
      backgroundColor: "#ffffff",
      backgroundColorDark: "#000000",
      objects: [
        { id: "o", path: "a.bmp", pathDark: "a-dark.bmp", properties: { color: "#111111", colorDark: "#eeeeee", borderColor: "transparent" } },
        { id: "p", properties: { states: [{ path: "x.bmp", pathActive: "y.bmp", pathActiveDark: "y-dark.bmp" }] } },
      ],
    }
    expect(darkVariantOf(screen)).toEqual({
      id: "s",
      backgroundColor: "#000000",
      objects: [
        { id: "o", path: "a-dark.bmp", properties: { color: "#eeeeee", borderColor: "transparent" } },
        { id: "p", properties: { states: [{ path: "x.bmp", pathActive: "y-dark.bmp" }] } },
      ],
    })
    // An XDark without its X is still X's dark value; a key named "Dark" is
    // just a key.
    expect(darkVariantOf({ pathDark: "only-dark.bmp", Dark: 1 })).toEqual({ path: "only-dark.bmp", Dark: 1 })
  })

  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook}: an object id ending in -dark cannot take another picture's dark name`, async ({ page }) => {
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true)
      const p = bakesProject()
      const objects = p.screens[0].objects as any[]
      // The firmware names an icon's bake after the object (a_icon.bmp, dark
      // a_icon-dark.bmp); the app does that for a button (buttons/a_btn.png).
      // A second object named "<that>-dark" would own the dark twin's name.
      const twin = hook === "__buildDeviceZipForTest" ? "icon" : "btn"
      const original = objects.find((o) => o.id === twin)
      objects.push({ ...structuredClone(original), id: `${twin}-dark`, zIndex: 9, y: 310, height: 40 })
      const error = await page.evaluate(
        ([name, arg]) => (window as any)[name as string](arg).then(() => "", (e: Error) => e.message),
        [hook, p] as const,
      )
      expect(error).toContain(`${twin}-dark`)
      expect(error).toMatch(/Rename the object/)
    })
  }
})
