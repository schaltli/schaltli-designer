import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"
import { pullTabSides } from "../lib/hardware-button-actions"
import { PULL_TAB, contentArea, pullTabLine, pullTabNudge } from "../lib/pull-tabs"

// The preview's swipe and the pull tab (docs/2026-10-17-screen-graph.md
// decision 9, taken into the designer by the user on 2026-10-18): a drag
// over the screen where nothing else owns it is a swipe; towards a neighbour
// the screen follows the finger, and far enough it goes there. A short line
// on each edge a swipe leads to a neighbour from shows that it does.

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

  test("is a short line centred on the edge, nudged towards the middle now and then", () => {
    const whole = contentArea(400, 300)
    expect(pullTabLine("down", whole)).toEqual({ x1: 186, y1: 292, x2: 214, y2: 292 })
    expect(pullTabLine("left", whole, 3)).toEqual({ x1: 11, y1: 136, x2: 11, y2: 164 })
    // Beside a navigator on the left: on the edges of what moves, not on the strip.
    const beside = contentArea(400, 300, { x: 0, y: 0, width: 100, height: 300, properties: { edge: "left" } })
    expect(beside).toEqual({ x: 100, y: 0, width: 300, height: 300 })
    expect(pullTabLine("left", beside)).toEqual({ x1: 108, y1: 136, x2: 108, y2: 164 })
    expect(pullTabLine("down", beside).x1).toBe(236)
    expect(contentArea(400, 300, { x: 0, y: 240, width: 400, height: 60, properties: { edge: "bottom" } })).toEqual({ x: 0, y: 0, width: 400, height: 240 })
    expect(pullTabNudge(0)).toBe(0)
    expect(pullTabNudge(PULL_TAB.nudgeMs / 2)).toBeCloseTo(PULL_TAB.nudge)
    expect(pullTabNudge(PULL_TAB.nudgeMs + 1)).toBe(0)
    expect(pullTabNudge(PULL_TAB.period + PULL_TAB.nudgeMs / 2)).toBeCloseTo(PULL_TAB.nudge)
  })
})

test.describe("the preview's swipe", () => {
  // The combined project with «label-tests-black-background» below its first screen.
  async function dockedProject(testInfo: { outputPath: (name: string) => string }): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: any) => s.id === "screen-3").dock = { screenId: "screen-1", edge: "down" }
    zip.file("project.json", JSON.stringify(project))
    const out = testInfo.outputPath("docked.zip")
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  const shown = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) }).first()
  async function press(page: Page) {
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 200, 150)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    return from
  }

  test("towards a neighbour the screen follows the finger; far enough it goes there, short of it it springs back", async ({ page }, testInfo) => {
    await loadProject(page, await dockedProject(testInfo))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    const { canvas } = await getMainCanvas(page)
    await expect(shown(page, "label-tests-white-background")).toHaveClass(/bg-accent/)
    // The first page of the row: a neighbour to the right and one below.
    await expect(canvas).toHaveAttribute("data-pull-tabs", /^(?=.*\bdown\b)(?=.*\bright\b)(?!.*\b(up|left)\b)/)

    // Short of the threshold: back where it was.
    let from = await press(page)
    await page.mouse.move(from.x, from.y - 25, { steps: 5 })
    await expect(canvas).toHaveAttribute("data-slide", "down -25")
    await page.mouse.up()
    await expect(canvas).toHaveAttribute("data-slide", "")
    await expect(shown(page, "label-tests-white-background")).toHaveClass(/bg-accent/)

    // Far enough: the screen below, without a toast - the slide said it.
    from = await press(page)
    await page.mouse.move(from.x, from.y - 120, { steps: 8 })
    await expect(canvas).toHaveAttribute("data-slide", "down -120")
    await page.mouse.up()
    await expect(shown(page, "label-tests-black-background")).toHaveClass(/bg-accent/)
    await expect(canvas).toHaveAttribute("data-slide", "")
    await expect(page.getByText("→ Go to the screen below")).toHaveCount(0)
    await expect(canvas).toHaveAttribute("data-pull-tabs", "up")

    // Down again, and back.
    from = await press(page)
    await page.mouse.move(from.x, from.y + 100, { steps: 8 })
    await page.mouse.up()
    await expect(shown(page, "label-tests-white-background")).toHaveClass(/bg-accent/)

    // Up on the screen below: nothing lies below it, so nothing follows.
    await shown(page, "label-tests-black-background").click()
    from = await press(page)
    await page.mouse.move(from.x, from.y - 100, { steps: 8 })
    await expect(canvas).toHaveAttribute("data-slide", "")
    await page.mouse.up()
    await expect(shown(page, "label-tests-black-background")).toHaveClass(/bg-accent/)
  })

  test("outside the preview a drag on the screen is no swipe, and no tab is drawn", async ({ page }, testInfo) => {
    await loadProject(page, await dockedProject(testInfo))
    const { canvas } = await getMainCanvas(page)
    await expect(canvas).not.toHaveAttribute("data-pull-tabs", /\S/)
  })
})

test.describe("the pull tab's nudge", () => {
  test("stands still under test automation unless a test sets it, and then moves the tab", async ({ page }, testInfo) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: any) => s.id === "screen-3").dock = { screenId: "screen-1", edge: "down" }
    zip.file("project.json", JSON.stringify(project))
    const out = testInfo.outputPath("docked.zip")
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    await loadProject(page, out)
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
