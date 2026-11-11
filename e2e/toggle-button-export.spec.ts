import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { THEMES } from "../lib/themes"

// The Toggle Button in both exports (docs/2026-11-06-toggle-button.md, T4):
// a device gets a look per state, one for «nothing reported» and the ring's
// colour - dark beside light at 24 bit - and each state's icon as the only
// picture, cut out of the tile as the designer draws it. It draws the
// reported state's look with its button code and computes nothing.

const SLATE = THEMES.find((t) => t.id === "slate")!
const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`
const DROP = svg('<path fill="currentColor" d="M12 20a6 6 0 0 1-6-6c0-4 6-10.8 6-10.8S18 10 18 14a6 6 0 0 1-6 6z"/>')

function project(colorDepth: "24bit" | "4bit" = "24bit", name = "Wasserpumpe") {
  return {
    name: "toggle-export",
    screenWidth: 480,
    screenHeight: 480,
    fonts: [],
    assets: [{ id: "drop", name: "drop", type: "icon", data: DROP }],
    topics: [{ id: "p", topic: "pump/state", type: "text", examples: ["on"] }],
    hardwareButtons: [],
    // CamperUI's 10 px corners: 1.5 mm on a panel of 6.73 px a millimetre.
    settings: { colorDepth, exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}", pixelsPerMm: 6.73, cards: { buttonRadiusMm: 1.5 } },
    nextId: 20,
    screens: [
      {
        id: "s",
        name: "S",
        themeId: "slate",
        objects: [
          {
            id: "tile",
            type: "toggle-button",
            zIndex: 1,
            x: 16,
            y: 16,
            width: 216,
            height: 84,
            properties: {
              topic: "pump/state",
              writeTopic: "pump/set",
              text: name,
              switchStyle: "filled",
              switchColor: "accent",
              states: [
                { id: "off", label: "Aus", readValue: "off", writeValue: "off", iconAssetId: "drop" },
                { id: "on", label: "Ein", readValue: "on", writeValue: "on", showAsOn: true, iconAssetId: "drop" },
              ],
            },
          },
        ],
      },
    ],
  }
}

async function exported(page: Page, hook: "__buildDeviceZipForTest" | "__buildAndroidZipForTest", p: unknown) {
  const base64: string = await page.evaluate(([name, arg]) => (window as any)[name as string](arg), [hook, p] as const)
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  const json = JSON.parse(await zip.file("project.json")!.async("string"))
  const tile = json.screens.flatMap((s: any) => s.objects).find((o: any) => o.id === "tile")
  return { zip, tile }
}

const lc = (s: string) => s.toLowerCase()

test.describe("a Toggle Button exported", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 90000 })
  })

  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook}: a look per state, none and the ring, light and dark; the project's corners`, async ({ page }) => {
      const { tile } = await exported(page, hook, project())
      expect(tile.looks).toHaveLength(2)
      expect(tile.looks.map((l: any) => l.label)).toEqual(["Aus", "Ein"])
      expect(tile.noneLook.label).toBe("?")
      // docs/2026-11-11-led-look.md: the tile the card with its edge in
      // every state; the light lit in the accent while on, the track off -
      // light and dark; the window word, the asked fills.
      expect(lc(tile.looks[1].normal.fill)).toBe(lc(SLATE.light.panel))
      expect(lc(tile.looks[0].normal.fill)).toBe(lc(SLATE.light.panel))
      expect(lc(tile.looks[0].normal.outline)).toBe(lc(SLATE.light.outline))
      expect(lc(tile.looks[1].light.fill)).toBe(lc(SLATE.light.accent))
      expect(lc(tile.looksDark[1].light.fill)).toBe(lc(SLATE.dark.accent))
      expect(lc(tile.looksDark[0].normal.fill)).toBe(lc(SLATE.dark.panel))
      expect(tile.looks[1].light.label.text).toBe("EIN")
      expect(tile.looks[1].light.asked).toMatch(/^#[0-9a-f]{6}$/i)
      expect(lc(tile.ring)).toBe(lc(SLATE.light.accent))
      expect(lc(tile.ringDark)).toBe(lc(SLATE.dark.accent))
      // Korry: no second line, the label stands in the window; the layout the
      // same in dark.
      expect(tile.looks[1].second).toBeUndefined()
      expect(tile.looksDark[1].textX).toBe(tile.looks[1].textX)
      expect(tile.looksDark[1].light.y).toBe(tile.looks[1].light.y)
      // 1.5 mm at 6.73 px/mm.
      expect(tile.looks[1].normal.r).toBe(10)
    })

    test(`${hook}: each state's icon a picture in the zip, normal and pressed`, async ({ page }) => {
      const { zip, tile } = await exported(page, hook, project())
      for (const state of tile.properties.states) {
        for (const key of ["iconPath", "iconPathDark"]) {
          expect(state[key], `${state.id} ${key}`).toBeTruthy()
          expect(zip.file(state[key]), `${state[key]} in the zip`).toBeTruthy()
        }
      }
      // The pressed face changes what is under the icon: a file of its own.
      expect(zip.file(tile.properties.states[1].iconPathPressed)).toBeTruthy()
    })
  }

  test("a 4-bit export has no dark looks and no dark pictures", async ({ page }) => {
    const { zip, tile } = await exported(page, "__buildDeviceZipForTest", project("4bit"))
    expect(tile.looks).toHaveLength(2)
    expect(tile.looksDark).toBeUndefined()
    expect(tile.ringDark).toBeUndefined()
    expect(Object.keys(zip.files).filter((f) => f.includes("-dark"))).toEqual([])
  })

  test("without a name: no second line; the window alone with its word", async ({ page }) => {
    const { tile } = await exported(page, "__buildDeviceZipForTest", project("24bit", ""))
    expect(tile.looks[1].second).toBeUndefined()
    expect(tile.looks[1].light.label.text).toBe("EIN")
  })
})
