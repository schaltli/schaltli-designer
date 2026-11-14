import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// A colour project (24 bit, a round 360 × 360 screen), so the card's panel
// and edge show.
const COLOUR_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
const SCREEN = { id: "screen-switch-tests", width: 360, height: 360 }

// The card of docs/2026-11-03-anchor-dock.md's success criteria, built the
// way CamperUI's look (docs/2026-11-03-cards.md): a free area with a panel
// fill, an edge, round corners and padding; a heading docked at the top, a
// large value below it, a table of two rows filling the rest. Resized, it
// keeps them in place; in a table's cell, stretched, too.

type Obj = Record<string, any>

const text = (id: string, words: string, z: number, extra: Obj = {}) => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 40,
  height: 16,
  zIndex: z,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", ...extra },
})

function card(): Obj {
  return {
    id: "karte",
    type: "free",
    x: 70,
    y: 90,
    width: 200,
    height: 150,
    zIndex: 1,
    // Its panel, edge, corners and padding from Settings › Cards
    // (docs/2026-11-03-card.md).
    properties: { look: "card" },
    children: [
      text("kopf", "Batterie", 3, { dock: "top" }),
      text("wert", "92 %", 2, { dock: "top", textAlign: "right" }),
      {
        id: "zeilen",
        type: "table",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        zIndex: 1,
        properties: { grid: 1, columns: [{}, {}], rows: [{}, {}], dock: "fill" },
        children: [
          text("n1", "Spannung", 1, { cell: { row: 0, column: 0 } }),
          text("v1", "13.5 V", 2, { textAlign: "right", cell: { row: 0, column: 1 } }),
          text("n2", "Strom", 3, { cell: { row: 1, column: 0 } }),
          text("v2", "19.3 A", 4, { textAlign: "right", cell: { row: 1, column: 1 } }),
        ],
      },
    ],
  }
}

async function cardProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COLOUR_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === SCREEN.id).objects = [card()]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `anchor-card-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function savedCard(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === SCREEN.id).objects.find((o: Obj) => o.id === "karte")
}
const kid = (c: Obj, id: string) => c.children.find((o: Obj) => o.id === id)

// The heading at the top inside the padding, across; the value right below
// it; the table below both, across the rest, its values at its right edge.
function expectLaidOut(c: Obj) {
  const kopf = kid(c, "kopf")
  const wert = kid(c, "wert")
  const zeilen = kid(c, "zeilen")
  const pad = kopf.x
  expect(pad).toBeGreaterThan(0)
  expect(kopf.y).toBe(pad)
  expect(kopf.width).toBe(c.width - 2 * pad)
  expect(wert.x).toBe(pad)
  expect(wert.y).toBeGreaterThan(kopf.y + kopf.height)
  expect(wert.width).toBe(c.width - 2 * pad)
  expect(zeilen.x).toBe(pad)
  expect(zeilen.y).toBeGreaterThan(wert.y + wert.height)
  expect(zeilen.width).toBe(c.width - 2 * pad)
  const v1 = zeilen.children.find((o: Obj) => o.id === "v1")
  expect(v1.x + v1.width).toBe(zeilen.width)
}

async function shot(page: Page, name: string) {
  const { box } = await getMainCanvas(page)
  const clip = { x: box.x + (box.width - SCREEN.width) / 2, y: box.y + (box.height - SCREEN.height) / 2, width: SCREEN.width, height: SCREEN.height }
  // Kept beside the test's results, to look at.
  const body = await page.screenshot({ clip })
  fs.writeFileSync(test.info().outputPath(`${name}.png`), body)
  await test.info().attach(name, { body, contentType: "image/png" })
}

test("a card: heading and value docked at the top, a table filling the rest, kept in place when resized", async ({ page }) => {
  test.skip(!(await seedRoundFixtureDdf()), "the round fixture's DDF could not be seeded")
  await loadProject(page, await cardProject())
  const first = await savedCard(page)
  expectLaidOut(first)
  await shot(page, "card-200x150")
  // Wider and taller, typed into Frame.
  const { box } = await getMainCanvas(page)
  // A click on its bottom left, below the table: the card itself.
  await page.mouse.click(box.x + (box.width - SCREEN.width) / 2 + 80, box.y + (box.height - SCREEN.height) / 2 + 232)
  await openFrameSection(page)
  await page.locator("#width").fill("240")
  await page.locator("#width").blur()
  await page.locator("#height").fill("180")
  await page.locator("#height").blur()
  const wider = await savedCard(page)
  expect([wider.width, wider.height]).toEqual([240, 180])
  expectLaidOut(wider)
  expect(kid(wider, "zeilen").width).toBeGreaterThan(kid(first, "zeilen").width)
  await shot(page, "card-240x180")
  // The heading's row in the object list says it is docked.
  await expect(objectTreeRow(page, "kopf").getByTestId("dock-mark")).toHaveText("⤒ Top")
  // Its Gap (the user, 2026-11-14): 0 puts the value right under the heading.
  await page.locator("#freeGap").fill("0")
  await page.locator("#freeGap").blur()
  const flush = await savedCard(page)
  expect(flush.properties.gapMm).toBe(0)
  expect(kid(flush, "wert").y).toBe(kid(flush, "kopf").y + kid(flush, "kopf").height)
})
