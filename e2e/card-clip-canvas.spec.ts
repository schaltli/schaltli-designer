import { test, expect } from "@playwright/test"
import { areaShape, insideShape, roundRectSpans } from "../lib/clip"
import type { ScreenObject } from "../components/project-editor"

// A card's round corners cut what it holds, in the designer's reference
// renderer - the one the boards are compared against (lib/render-screen.ts,
// docs/2026-11-03-card-clip.md): the screenshot's card, a heading with a fill
// of its own across the card's top.

const CARD = { x: 40, y: 30, width: 200, height: 120 }
const card = (clipContents: boolean) => ({
  id: "karte",
  type: "free",
  zIndex: 1,
  ...CARD,
  properties: { fillColor: "#e0e0e0", strokeColor: "#808080", strokeWidth: 2, cornerRadius: 14, clipContents },
  children: [{ id: "kopf", type: "box", zIndex: 2, x: 0, y: 0, width: 200, height: 30, properties: { fillColor: "#ff0000", strokeWidth: 0, cornerRadius: 0 } }],
})

async function render(page: import("@playwright/test").Page, clipContents: boolean): Promise<number[][]> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: {
      name: "card-clip",
      screenWidth: 280,
      screenHeight: 200,
      settings: { colorDepth: "24bit" },
      fonts: [],
      assets: [],
      topics: [],
      screens: [{ id: "s1", name: "One", backgroundColor: "#ffffff", objects: [card(clipContents)] }],
    },
    screenIndex: 0,
  })
  // Whether each pixel of the heading's rectangle is the heading's red.
  return page.evaluate((r) => {
    const ctx = (document.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!
    const d = ctx.getImageData(r.x, r.y, r.width, 30).data
    const rows: number[][] = []
    for (let y = 0; y < 30; y++) {
      const row: number[] = []
      for (let x = 0; x < r.width; x++) {
        const i = (y * r.width + x) * 4
        row.push(d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0 ? 1 : 0)
      }
      rows.push(row)
    }
    return rows
  }, CARD)
}

test("a heading with a fill in a round card: red exactly where the card's shape inside its edge has a pixel", async ({ page }) => {
  const red = await render(page, true)
  const shape = areaShape(card(true) as unknown as ScreenObject)
  const spans = roundRectSpans(shape.width, shape.height, shape.radius)
  let mismatches = 0
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < CARD.width; x++) {
      const want = insideShape(shape, CARD.x + x, CARD.y + y, spans) ? 1 : 0
      if (red[y][x] !== want) mismatches++
    }
  expect(mismatches).toBe(0)
  // The edge shows over the heading; its corners are not red.
  expect(red[0][100]).toBe(0)
  expect(red[2][100]).toBe(1)
  expect(red[2][2]).toBe(0)
})

test("with Clip off the heading covers the corners, as before", async ({ page }) => {
  const red = await render(page, false)
  expect(red[0][0]).toBe(1)
  expect(red[0][100]).toBe(1)
})
