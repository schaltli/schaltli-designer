import { test, expect } from "@playwright/test"
import vectors from "../lib/screen-graph/vectors.json"
import { contentAreaOfStrip, pullTabColor, pullTabNudge, pullTabRect, PULL_TAB } from "../lib/pull-tabs"
import { rowStep, tabSidesOf, type DeviceGraphScreen } from "../lib/screen-graph-device"
import { backOf, mainRow, neighboursOf, pagedScreen, type ScreenEdge } from "../lib/screen-graph"
import { exportedButtonAction, pullTabSides } from "../lib/hardware-button-actions"

// lib/screen-graph/vectors.json - the cases the firmware's ScreenGraph and the
// app run too (device contract §2.10; tasks/graph-firmware-plan.md, F1) -
// against the designer's functions that wrote it; and those functions, which
// read only what the export carries, against the designer's own rules on
// projects: a device must decide as the designer's preview does.

test.describe("screen graph vectors (shared with the devices)", () => {
  test("enough cases that a truncated copy cannot pass", () => {
    expect(vectors.rowStep.length).toBeGreaterThanOrEqual(8)
    expect(vectors.tabSides.length).toBeGreaterThanOrEqual(8)
    expect(vectors.tabRect.length).toBeGreaterThanOrEqual(16)
    expect(vectors.nudge.length).toBeGreaterThanOrEqual(15)
    expect(vectors.pullTab).toEqual(PULL_TAB)
  })

  test("the code says what the vectors say", () => {
    for (const c of vectors.rowStep) {
      expect(rowStep(c.mainRow, c.current, (c as { page?: string }).page, c.delta as 1 | -1) ?? null, JSON.stringify(c)).toBe(c.expect)
    }
    for (const c of vectors.tabSides) expect(tabSidesOf(c.screen as DeviceGraphScreen, c.mainRow), c.name).toEqual(c.expect)
    for (const c of vectors.contentArea) {
      const s = c as { width: number; height: number; edge?: string; thickness?: number; expect: unknown }
      expect(contentAreaOfStrip(s.width, s.height, s.edge, s.thickness)).toEqual(s.expect)
    }
    for (const c of vectors.tabRect) expect(pullTabRect(c.edge as ScreenEdge, c.area, c.nudge)).toEqual(c.expect)
    for (const c of vectors.nudge) expect(pullTabNudge(c.ms), String(c.ms)).toBe(c.expect)
    for (const c of vectors.tabColor) expect(pullTabColor(c.muted, c.background, c.colorDepth)).toBe(c.expect)
  })
})

test.describe("a device reading the export decides as the designer does", () => {
  const master = {
    id: "m",
    name: "M",
    isMaster: true,
    objects: [],
    buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" }, "swipe-up": { type: "open-popup", targetScreenId: "p" } },
  } as any
  const page = (id: string, more: object = {}) => ({ id, name: id.toUpperCase(), objects: [], masterScreenId: "m", ...more }) as any
  const projects: Record<string, any[]> = {
    "one row": [master, page("a"), page("b"), page("c")],
    "a history below a and above c": [
      master,
      page("a"),
      page("b"),
      page("c"),
      page("a1", { dock: { screenId: "a", edge: "down" } }),
      page("c0", { dock: { screenId: "c", edge: "up" } }),
    ],
    "own swipes: one cuts off, one goes there anyway, a hidden screen apart": [
      master,
      page("a", { buttonActions: { "swipe-up": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "m" }, "swipe-left": { type: "goto-screen", targetScreenId: "b" } } }),
      page("b", { buttonActions: { "swipe-right": { type: "none" } } }),
      page("h", { hidden: true }),
      page("a1", { dock: { screenId: "a", edge: "down" } }),
      page("b1", { dock: { screenId: "b", edge: "up" }, buttonActions: { "swipe-down": { type: "next-screen" } } }),
    ],
  }
  const SWIPES = ["swipe-up", "swipe-down", "swipe-left", "swipe-right"]

  for (const [name, screens] of Object.entries(projects)) {
    test(name, () => {
      const row = mainRow(screens).map((s) => s.id)
      for (const screen of screens.filter((s) => !s.isMaster && !s.hidden)) {
        // As lib/project-zip.ts writes it.
        const exported: DeviceGraphScreen = {
          id: screen.id,
          neighbours: neighboursOf(screens, screen.id),
          back: backOf(screens, screen.id),
          buttonActions: Object.fromEntries(
            SWIPES.flatMap((id) => {
              const action = exportedButtonAction(screen, master, id, screens)
              return action ? [[id, action]] : []
            }),
          ),
        }
        expect(tabSidesOf(exported, row).sort(), screen.id).toEqual(pullTabSides(screen, master, screens).sort())
        const pageId = exported.back ? exported.neighbours?.[exported.back] : undefined
        for (const delta of [1, -1] as const) {
          expect(rowStep(row, screen.id, pageId, delta), `${screen.id} ${delta}`).toBe(pagedScreen(screens, screen.id, delta)?.id)
        }
      }
    })
  }
})

// The designer's reference (app/test-render, what the HIL compares against)
// draws the tabs for a device that declares `screen-graph`, in the colour the
// export carries, where a device puts them (tasks/graph-firmware-plan.md,
// decision 3).
test.describe("the reference draws the pull tabs on request", () => {
  test("on the edges a swipe leads to a neighbour from, beside the navigator, in the exported colour", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const navigator = { id: "nav", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 9, properties: { edge: "left", shows: "icons", backgroundColor: "#202020" } }
    const project = {
      name: "tabs",
      screenWidth: 800,
      screenHeight: 480,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [
        { id: "m", name: "M", isMaster: true, objects: [], buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" } } },
        { id: "a", name: "A", masterScreenId: "m", backgroundColor: "#ffffff", objects: [navigator] },
        { id: "b", name: "B", masterScreenId: "m", backgroundColor: "#ffffff", objects: [navigator] },
        { id: "a1", name: "A1", masterScreenId: "m", backgroundColor: "#ffffff", dock: { screenId: "a", edge: "down" }, objects: [navigator] },
      ],
    }
    const pixel = async (pullTabs: boolean, screenIndex: number, x: number, y: number) => {
      const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex, pullTabs })
      const { Jimp } = await import("jimp")
      const img = await Jimp.read(Buffer.from(dataUrl.split(",")[1], "base64"))
      return "#" + (img.getPixelColor(x, y) >>> 8).toString(16).padStart(6, "0")
    }
    const { themeFor, resolveColor } = await import("../lib/themes")
    const color = pullTabColor(resolveColor("textMuted", themeFor(project.screens[1] as any, project.screens as any), "light", "24bit"), "#ffffff", "24bit")
    const area = { x: 80, y: 0, width: 720, height: 480 }
    const centre = (edge: ScreenEdge) => {
      const r = pullTabRect(edge, area)
      return [r.x + Math.floor(r.width / 2), r.y + Math.floor(r.height / 2)] as const
    }
    // A: B on its right and - the row a ring - on its left, A1 below; nothing above.
    expect(await pixel(true, 1, ...centre("right"))).toBe(color)
    expect(await pixel(true, 1, ...centre("down"))).toBe(color)
    expect(await pixel(true, 1, ...centre("left"))).toBe(color)
    expect(await pixel(true, 1, ...centre("up"))).toBe("#ffffff")
    // Not asked: no tabs.
    expect(await pixel(false, 1, ...centre("right"))).toBe("#ffffff")
    // A1: only back up.
    expect(await pixel(true, 3, ...centre("up"))).toBe(color)
    expect(await pixel(true, 3, ...centre("right"))).toBe("#ffffff")
  })
})
