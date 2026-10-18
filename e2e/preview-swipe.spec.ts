import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import { devicePoint, getMainCanvas, loadProject } from "./helpers"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { buildEditableProjectZip } from "../lib/project-zip"
import { pullTabSides } from "../lib/hardware-button-actions"
import { PULL_TAB, contentArea, pullTabNudge, pullTabRect } from "../lib/pull-tabs"

// The preview's swipe and the pull tab (docs/2026-10-17-screen-graph.md
// decision 9, taken into the designer by the user on 2026-10-18): a drag
// over the screen where nothing else owns it is a swipe; towards a neighbour
// the screen follows the finger, and far enough it goes there. A short line
// on each edge a swipe leads to a neighbour from shows that it does.


// The demo's camper on a 4.3B, a touch device: its swipes are among the
// project's buttons. MaxxFan lies below Energie; the row is Energie, Licht,
// Wasser, Heizung, with a navigator on the left.
const SCREEN = { width: 800, height: 480 }
async function camperDocked(testInfo: { outputPath: (name: string) => string }): Promise<string> {
  const ddf = path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")
  const camper: any = await buildCamperProject(new Uint8Array(fs.readFileSync(ddf)))
  camper.screens.find((s: any) => s.id === "screen-maxxfan").dock = { screenId: "screen-energie", edge: "down" }
  const out = testInfo.outputPath("camper-docked.zip")
  fs.writeFileSync(out, Buffer.from(await (await buildEditableProjectZip({ ...camper, nextId: 1000 })).arrayBuffer()))
  return out
}

test.describe("the pull tab", () => {
  const master = { id: "m", name: "M", isMaster: true, objects: [] } as any
  const a = { id: "a", name: "A", objects: [], masterScreenId: "m" } as any
  const b = { id: "b", name: "B", objects: [], masterScreenId: "m" } as any
  const a1 = { id: "a1", name: "A'", objects: [], masterScreenId: "m", dock: { screenId: "a", edge: "down" } } as any

  test("stands on each edge a swipe leads to a neighbour from, and not where the screen's own swipe takes it", () => {
    expect(pullTabSides(a, master, [master, a, b, a1]).sort()).toEqual(["down", "right"])
    expect(pullTabSides(a1, master, [master, a, b, a1])).toEqual(["up"])
    const own = { ...a, buttonActions: { "swipe-up": { type: "none" } } }
    expect(pullTabSides(own, master, [master, own, b, a1])).toEqual(["right"])
    // An own action that goes there all the same keeps its tab, as a device
    // reading the export decides it (device contract §2.10).
    const there = { ...a, buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-up": { type: "goto-screen", targetScreenId: "a1" } } }
    expect(pullTabSides(there, master, [master, there, b, a1]).sort()).toEqual(["down", "right"])
  })

  test("is a short bar centred on the edge of what moves, nudged towards the middle now and then", () => {
    const whole = contentArea(400, 300)
    expect(pullTabRect("down", whole)).toEqual({ x: 184, y: 290, width: 32, height: 4 })
    expect(pullTabRect("left", whole, 3)).toEqual({ x: 9, y: 134, width: 4, height: 32 })
    // Beside a navigator on the left: on the edges of what moves, not on the strip.
    const beside = contentArea(400, 300, { x: 0, y: 0, width: 100, height: 300, properties: { edge: "left" } })
    expect(beside).toEqual({ x: 100, y: 0, width: 300, height: 300 })
    expect(pullTabRect("left", beside).x).toBe(106)
    expect(pullTabRect("down", beside).x).toBe(234)
    expect(contentArea(400, 300, { x: 0, y: 240, width: 400, height: 60, properties: { edge: "bottom" } })).toEqual({ x: 0, y: 0, width: 400, height: 240 })
    expect(pullTabNudge(0)).toBe(0)
    expect(pullTabNudge(PULL_TAB.nudgeMs / 2)).toBe(PULL_TAB.nudge)
    expect(pullTabNudge(PULL_TAB.nudgeMs + 1)).toBe(0)
    expect(pullTabNudge(PULL_TAB.period + PULL_TAB.nudgeMs / 2)).toBe(PULL_TAB.nudge)
  })
})

test.describe("the preview's swipe", () => {
  const shown = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) }).first()
  async function press(page: Page) {
    const { box } = await getMainCanvas(page)
    // Beside the navigator, off the energy diagram's nodes.
    const from = devicePoint(box, 680, 430, SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    return from
  }

  test("towards a neighbour the screen follows the finger; far enough it goes there, short of it it springs back", async ({ page }, testInfo) => {
    await loadProject(page, await camperDocked(testInfo))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    const { canvas } = await getMainCanvas(page)
    await expect(shown(page, "Energie")).toHaveClass(/bg-accent/)
    // The row's first page: a neighbour to the right and one below.
    await expect(canvas).toHaveAttribute("data-pull-tabs", /^(?=.*\bdown\b)(?=.*\bright\b)(?!.*\b(up|left)\b)/)

    // Short of the threshold: back where it was.
    let from = await press(page)
    await page.mouse.move(from.x, from.y - 25, { steps: 5 })
    await expect(canvas).toHaveAttribute("data-slide", "down -25")
    await page.mouse.up()
    await expect(canvas).toHaveAttribute("data-slide", "")
    await expect(shown(page, "Energie")).toHaveClass(/bg-accent/)

    // Far enough: the screen below, without a toast - the slide said it.
    from = await press(page)
    await page.mouse.move(from.x, from.y - 120, { steps: 8 })
    await expect(canvas).toHaveAttribute("data-slide", "down -120")
    await page.mouse.up()
    await expect(shown(page, "MaxxFan")).toHaveClass(/bg-accent/)
    await expect(canvas).toHaveAttribute("data-slide", "")
    await expect(page.getByText("→ Go to the screen below")).toHaveCount(0)
    await expect(canvas).toHaveAttribute("data-pull-tabs", "up")

    // Down again, and back.
    from = await press(page)
    await page.mouse.move(from.x, from.y + 100, { steps: 8 })
    await page.mouse.up()
    await expect(shown(page, "Energie")).toHaveClass(/bg-accent/)

    // Up on the screen below: nothing lies below it, so nothing follows.
    await shown(page, "MaxxFan").click()
    from = await press(page)
    await page.mouse.move(from.x, from.y - 100, { steps: 8 })
    await expect(canvas).toHaveAttribute("data-slide", "")
    await page.mouse.up()
    await expect(shown(page, "MaxxFan")).toHaveClass(/bg-accent/)
  })

  test("outside the preview a drag on the screen is no swipe, and no tab is drawn", async ({ page }, testInfo) => {
    await loadProject(page, await camperDocked(testInfo))
    const { canvas } = await getMainCanvas(page)
    await expect(canvas).not.toHaveAttribute("data-pull-tabs", /\S/)
  })
})

test.describe("the pull tab's nudge", () => {
  test("stands still under test automation unless a test sets it, and then moves the tab", async ({ page }, testInfo) => {
    await loadProject(page, await camperDocked(testInfo))
    // The energy diagram's motion stands still: only the tab may move.
    await page.evaluate(() => ((window as any).__energyFrozenPhase = 0))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    const { canvas } = await getMainCanvas(page)
    await expect(canvas).toHaveAttribute("data-pull-tabs", /down/)
    // At rest the picture stays as it is, through a whole period of the nudge.
    const picture = () => canvas.screenshot()
    const rest = await picture()
    await page.waitForTimeout(PULL_TAB.period + 200)
    expect((await picture()).equals(rest)).toBe(true)
    // Set, it moves the tab.
    await page.evaluate(() => ((window as any).__pullTabFrozenNudge = 6))
    await expect.poll(async () => (await picture()).equals(rest)).toBe(false)
  })
})
