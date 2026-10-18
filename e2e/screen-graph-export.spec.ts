import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"

// The screen graph leaves for a device (docs/2026-10-17-screen-graph.md
// decision 13; tasks/graph-model-plan.md decisions 5, 6, 8): the main row in
// order, each screen's neighbours and way back, and every swipe resolved as
// own, neighbour, master - a neighbour in the row as «Next screen» or
// «Previous screen», so a single row exports nothing a board of today does not
// know.

const SWIPES = ["swipe-left", "swipe-right", "swipe-up", "swipe-down"]

function project(extra: { screens?: any[]; masterActions?: Record<string, unknown> } = {}): any {
  return {
    name: "graph-export",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [...SWIPES.map((id) => ({ id, name: id })), { id: "button-0", name: "Button" }],
    screens: [
      {
        id: "m",
        name: "Master",
        isMaster: true,
        objects: [],
        buttonActions: {
          "swipe-left": { type: "next-screen" },
          "swipe-right": { type: "previous-screen" },
          ...(extra.masterActions ?? {}),
        },
      },
      { id: "a", name: "Energie", masterScreenId: "m", objects: [] },
      { id: "b", name: "Wasser", masterScreenId: "m", objects: [] },
      { id: "c", name: "Licht", masterScreenId: "m", objects: [] },
      { id: "p", name: "Popup", screenType: "popup", objects: [] },
      ...(extra.screens ?? []),
    ],
  }
}

async function exportedJson(page: Page, p: any, kind: "device" | "android"): Promise<any> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const base64: string = await page.evaluate(
    ([proj, k]) => (k === "device" ? (window as any).__buildDeviceZipForTest(proj) : (window as any).__buildAndroidZipForTest(proj)),
    [p, kind] as const,
  )
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  const name = Object.keys(zip.files).find((f) => f.endsWith("project.json"))!
  return JSON.parse(await zip.file(name)!.async("string"))
}

const screenOf = (json: any, id: string) => json.screens.find((s: any) => s.id === id)

const withHistory = { screens: [{ id: "a1", name: "Energie-Verlauf", masterScreenId: "m", objects: [], dock: { screenId: "a", edge: "down" } }] }

for (const kind of ["device", "android"] as const) {
  test.describe(`the screen graph in the ${kind} export`, () => {
    test("a single row: the row in order, neighbours sideways, and swipes a board of today knows", async ({ page }) => {
      const json = await exportedJson(page, project(), kind)
      expect(json.mainRow).toEqual(["a", "b", "c"])
      expect(screenOf(json, "a").neighbours).toEqual({ right: "b" })
      expect(screenOf(json, "b").neighbours).toEqual({ left: "a", right: "c" })
      expect(screenOf(json, "a").back).toBeUndefined()
      // A popup goes apart (lib/popup.ts withPopupsApart), without neighbours.
      const popup = json.popups?.find((s: any) => s.id === "p")
      expect(popup).toBeDefined()
      expect(popup.neighbours).toBeUndefined()
      // Swiping left pulls in the screen on the right: the next one.
      expect(screenOf(json, "a").buttonActions["swipe-left"]).toEqual({ type: "next-screen" })
      expect(screenOf(json, "b").buttonActions["swipe-right"]).toEqual({ type: "previous-screen" })
      // At the ends of the row the master's action, wrapping as before.
      expect(screenOf(json, "c").buttonActions["swipe-left"]).toEqual({ type: "next-screen" })
      expect(screenOf(json, "a").buttonActions["swipe-right"]).toEqual({ type: "previous-screen" })
      expect(JSON.stringify(json.screens)).not.toContain("goto-neighbour")
    })

    test("a history below a page: pulled up by a swipe up, out of the paging, and its way back", async ({ page }) => {
      const json = await exportedJson(page, project(withHistory), kind)
      expect(json.mainRow).toEqual(["a", "b", "c"])
      expect(screenOf(json, "a").neighbours).toEqual({ right: "b", down: "a1" })
      expect(screenOf(json, "a1").neighbours).toEqual({ up: "a" })
      expect(screenOf(json, "a1").back).toBe("up")
      // Hidden to a board of today, so it pages past it as a new one does.
      expect(screenOf(json, "a1").hidden).toBe(true)
      expect(screenOf(json, "a").buttonActions["swipe-up"]).toEqual({ type: "goto-neighbour", side: "down" })
      expect(screenOf(json, "a1").buttonActions["swipe-down"]).toEqual({ type: "goto-neighbour", side: "up" })
      // Sideways from the history there is no neighbour: the master's.
      expect(screenOf(json, "a1").buttonActions["swipe-left"]).toEqual({ type: "next-screen" })
    })

    // Device contract §2.10: the tab's colour comes along, worked out; and
    // the way back as an entry of the navigator, by the way its arrow points.
    test("the pull tab's colour on every screen, and the way back as a navigator entry", async ({ page }) => {
      const p = project(withHistory)
      p.screens[0].objects = [{ id: "nav", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 9, properties: { edge: "left", shows: "icons" } }]
      const json = await exportedJson(page, p, kind)
      for (const id of ["a", "b", "a1"]) expect(screenOf(json, id).pullTabColor, id).toMatch(/^#[0-9a-f]{6}$/)
      expect(screenOf(json, "a").pullTabColorDark).toMatch(/^#[0-9a-f]{6}$/)
      expect(screenOf(json, "a").pullTabColorDark).not.toBe(screenOf(json, "a").pullTabColor)
      // A1 lies below its page: back is up, its arrow points down.
      const nav = json.navigators[0]
      expect(Object.keys(nav.back)).toEqual(["down"])
      expect(nav.back.down.map((o: any) => o.type)).toEqual(["icon"])
      // Baked, as every entry's icon is - a device draws nothing else - and
      // laid out in one entry as long as the strip (480 here, a 32 px icon
      // in its middle).
      if (kind === "device") expect(nav.back.down[0].path).toMatch(/^assets\/.+\.bmp$/)
      expect(nav.back.down[0].y).toBe(Math.floor((480 - 32) / 2))
      // One row: no way back to carry.
      const row = project()
      row.screens[0].objects = p.screens[0].objects
      expect((await exportedJson(page, row, kind)).navigators[0].back).toBeUndefined()
    })

    test("a master's swipe shows only where no neighbour is", async ({ page }) => {
      const json = await exportedJson(page, project({ ...withHistory, masterActions: { "swipe-up": { type: "open-popup", targetScreenId: "p" } } }), kind)
      expect(screenOf(json, "a").buttonActions["swipe-up"]).toEqual({ type: "goto-neighbour", side: "down" })
      expect(screenOf(json, "b").buttonActions["swipe-up"]).toEqual({ type: "open-popup", targetScreenId: "p" })
    })

    test("«Go to the screen beside» on a button: the next screen in the row, nothing where none is", async ({ page }) => {
      const json = await exportedJson(page, project({ ...withHistory, masterActions: { "button-0": { type: "goto-neighbour", side: "right" } } }), kind)
      expect(screenOf(json, "a").buttonActions["button-0"]).toEqual({ type: "next-screen" })
      expect(screenOf(json, "c").buttonActions?.["button-0"]).toBeUndefined()
      expect(screenOf(json, "a1").buttonActions?.["button-0"]).toBeUndefined()
    })
  })
}
