import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { THEMES, COLOR_KEYS, applyTheme, isRole, type Theme } from "../lib/themes"
import { SYSTEM_GENERATION_STRING } from "../lib/system-generation"

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
