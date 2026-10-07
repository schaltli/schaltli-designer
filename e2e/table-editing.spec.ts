import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection } from "./helpers"

// Table editing like Word (docs/2026-10-03-table-editing.md): a cell is
// something to point at, the ribbon's Table group with the path, the
// context menu, «+» at a line's end. The combined project's first screen,
// 400 x 300, with a table «outer» on it 8 px in - where a screen's own
// table used to lay out - «Links» top left, a nested table below it holding
// «Tief».

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number, cell?: Obj): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 100,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent", ...(cell ? { cell } : {}) },
})

export async function nestedProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
    {
      id: "outer",
      type: "table",
      x: 8,
      y: 8,
      width: 384,
      height: 284,
      zIndex: 1,
      properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 2 },
      children: [
        text("links", "Links", 1, { row: 0, column: 0 }),
        {
          id: "inner",
          type: "table",
          x: 0,
          y: 0,
          width: 150,
          height: 40,
          zIndex: 2,
          properties: { columns: [{ width: { share: 100 } }], rows: 1, cell: { row: 1, column: 0 } },
          children: [text("tief", "Tief", 3, { row: 0, column: 0 })],
        },
      ],
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-editing-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

async function clickAt(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  await page.mouse.click(p.x, p.y)
}

async function chosenCell(page: Page): Promise<Obj | null> {
  const { canvas } = await getMainCanvas(page)
  const value = await canvas.getAttribute("data-table-cell")
  return value ? JSON.parse(value) : null
}

test.describe("table editing: the cell in context", () => {
  test("a click into an empty cell picks it; Esc leaves it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // Row 0, column 1 of the screen's table: empty (2 mm padding = 8 px).
    await clickAt(page, 300, 14)
    expect(await chosenCell(page)).toEqual({ tableId: "outer", row: 0, column: 1 })
    await page.keyboard.press("Escape")
    expect(await chosenCell(page)).toBeNull()
  })

  test("one click on an object in a nested table selects it, not the table around it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // «Tief» stands in the nested table, in row 1 of the screen's: below «Links».
    const { box } = await getMainCanvas(page)
    const links = devicePoint(box, 12, 14)
    await page.mouse.click(links.x, links.y)
    await expect(page.locator("#text")).toHaveText("Links")
    // Row 1 starts below «Links» (23 px) and the 1.5 mm gap (6 px).
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveText("Tief")
    expect(await chosenCell(page)).toBeNull()
  })
})

// Three levels: «outer», «middle» in its row 1, «inner» in «middle»,
// «Tief» in «inner».
async function deepProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(await nestedProject()))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const outer = project.screens.find((s: Obj) => s.id === "screen-1").objects[0]
  const inner = outer.children.find((o: Obj) => o.id === "inner")
  inner.properties.cell = { row: 0, column: 0 }
  outer.children = [
    outer.children.find((o: Obj) => o.id === "links"),
    { id: "middle", type: "table", x: 0, y: 0, width: 160, height: 50, zIndex: 4, properties: { columns: [{ width: { share: 100 } }], rows: 1, cell: { row: 1, column: 0 } }, children: [inner] },
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `table-editing-deep-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

// The table «outer» as the project is saved.
async function downloadedTable(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  return project.screens.find((s: Obj) => s.id === "screen-1").objects.find((o: Obj) => o.id === "outer")
}
const cellsOf = (objects: Obj[]) => Object.fromEntries(objects.map((o) => [o.id, o.properties.cell]))

test.describe("table editing: the ribbon's Table group", () => {
  test("the path reaches each of three levels with one click", async ({ page }) => {
    await loadProject(page, await deepProject())
    const group = page.getByTestId("table-group")
    await expect(group).toHaveCount(0)
    // «Tief», three tables deep.
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveText("Tief")
    const pathBar = page.getByTestId("table-path")
    await expect(pathBar).toHaveText(/Table.*Table.*Table.*Cell 1, 1/)
    await pathBar.locator('[data-table-level="inner"]').click()
    await expect(pathBar.locator('[data-table-level="inner"]')).toHaveAttribute("aria-current", "true")
    await pathBar.locator('[data-table-level="middle"]').click()
    await expect(pathBar.locator('[data-table-level="middle"]')).toHaveAttribute("aria-current", "true")
    await pathBar.locator('[data-table-level="outer"]').click()
    await expect(pathBar.locator('[data-table-level="outer"]')).toHaveAttribute("aria-current", "true")
    await expect(pathBar.locator("[data-table-level]")).toHaveCount(1)
  })

  test("Row above on an empty cell puts a row above it, one undo step", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 300, 14)
    await page.getByTestId("table-group").getByRole("button", { name: "Row above" }).click()
    let table = await downloadedTable(page)
    expect(cellsOf(table.children)).toEqual({ links: { row: 1, column: 0 }, inner: { row: 2, column: 0 } })
    expect(table.properties.rows).toBe(3)
    await page.keyboard.press("ControlOrMeta+z")
    table = await downloadedTable(page)
    expect(cellsOf(table.children)).toEqual({ links: { row: 0, column: 0 }, inner: { row: 1, column: 0 } })
  })

  test("Merge right takes the empty neighbour; Merge down is off over an occupied cell", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 12, 14)
    await expect(page.locator("#text")).toHaveText("Links")
    const group = page.getByTestId("table-group")
    await expect(group.getByRole("button", { name: "Merge down" })).toBeDisabled()
    await expect(group.getByRole("button", { name: "Split" })).toBeDisabled()
    await group.getByRole("button", { name: "Merge right" }).click()
    expect(cellsOf((await downloadedTable(page)).children).links).toEqual({ row: 0, column: 0, columnSpan: 2 })
    await expect(group.getByRole("button", { name: "Split" })).toBeEnabled()
  })
})

test.describe("table editing: right-click", () => {
  test("a right-click on an empty cell offers the table's commands for it; Row above puts a row above it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, 300, 14)
    await page.mouse.click(p.x, p.y, { button: "right" })
    expect(await chosenCell(page)).toEqual({ tableId: "outer", row: 0, column: 1 })
    const menu = page.getByTestId("table-context-menu")
    await expect(menu.getByRole("button", { name: "Merge right" })).toBeDisabled()
    await menu.getByRole("button", { name: "Row above" }).click()
    await expect(menu).toHaveCount(0)
    expect(cellsOf((await downloadedTable(page)).children)).toEqual({ links: { row: 1, column: 0 }, inner: { row: 2, column: 0 } })
  })

  test("outside every table the menu has no table commands", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const p = devicePoint(box, 395, 295)
    await page.mouse.click(p.x, p.y, { button: "right" })
    await expect(page.getByRole("button", { name: "Select All" })).toBeVisible()
    await expect(page.getByTestId("table-context-menu")).toHaveCount(0)
  })
})

// The «+» at a line's end (table-overlay.ts handlePlaces): 6 px, 4 px out
// from the table's left edge or above its column strip (8 px, 6 px off).
test.describe("table editing: «+» at a line's end", () => {
  test("left of a row line inserts a row there; above a column line a column", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // «outer» selected: the active table, its handles shown.
    await objectTreeRow(page, "outer").click()
    // The line between «Links» (23 px from 8) and row 1, half the 6 px gap down.
    await clickAt(page, 8 - 6 - 4, 8 + 23 + 3)
    let table = await downloadedTable(page)
    expect(cellsOf(table.children)).toEqual({ links: { row: 0, column: 0 }, inner: { row: 2, column: 0 } })
    expect(table.properties.rows).toBe(3)
    // The line between the two 50% columns: (400 - 16 - 6) / 2 = 189 from 8, half the gap on.
    await objectTreeRow(page, "outer").click()
    await clickAt(page, 8 + 189 + 3, 8 - 14 - 6 - 4)
    table = await downloadedTable(page)
    expect(table.properties.columns).toHaveLength(3)
    expect(table.properties.columns[1]).toEqual({ width: "auto" })
  })
})

// Seen at the review of Tasks 1-5: a nested table's column strip and «+»
// lay over the row above it. A nested table shows them only while the
// pointer is near it.
test.describe("table editing: a nested table's handles", () => {
  test("its column strip shows only while the pointer is near it, not over the row above all the time", async ({ page }) => {
    await loadProject(page, await nestedProject())
    // «Tief» selected: the nested table, in row 1 from y 37, is the active one.
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveText("Tief")
    const { box } = await getMainCanvas(page)
    // Its strip would stand 14 px above it, over the row of «Links».
    const corner = devicePoint(box, 60, 37 - 14 - 2)
    const clip = { x: corner.x, y: corner.y, width: 80, height: 12 }
    const far = devicePoint(box, 390, 290)
    await page.mouse.move(far.x, far.y)
    const away = await page.screenshot({ clip })
    const near = devicePoint(box, 120, 45)
    await page.mouse.move(near.x, near.y)
    const over = await page.screenshot({ clip })
    expect(over.equals(away)).toBe(false)
    // Away again: gone again.
    await page.mouse.move(far.x, far.y)
    expect((await page.screenshot({ clip })).equals(away)).toBe(true)
  })
})

// The table's handle, as in Word (table-overlay.ts): 14 px out from the
// table's top left corner, diagonally. The nested table «inner» starts at
// 8, 37 - its handle at -6, 23, over the device's frame left of the screen.
test.describe("table editing: the table's handle", () => {
  const HANDLE = { x: 8 - 14, y: 37 - 14 }

  test("it shows only while the pointer is near the table", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const corner = devicePoint(box, HANDLE.x - 7, HANDLE.y - 7)
    const clip = { x: corner.x, y: corner.y, width: 14, height: 14 }
    const far = devicePoint(box, 390, 290)
    await page.mouse.move(far.x, far.y)
    const away = await page.screenshot({ clip })
    const over = devicePoint(box, 60, 45)
    await page.mouse.move(over.x, over.y)
    expect((await page.screenshot({ clip })).equals(away)).toBe(false)
  })

  test("a click on it selects the table; a drag moves the table to an empty cell", async ({ page }) => {
    await loadProject(page, await nestedProject())
    const { box } = await getMainCanvas(page)
    const over = devicePoint(box, 60, 45)
    await page.mouse.move(over.x, over.y)
    const handle = devicePoint(box, HANDLE.x, HANDLE.y)
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.click(handle.x, handle.y)
    await expect(page.getByTestId("table-path").locator('[data-table-level="inner"]')).toHaveAttribute("aria-current", "true")

    // Row 0, column 1 of the screen's table is empty.
    await page.mouse.move(over.x, over.y)
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    const target = devicePoint(box, 300, 14)
    await page.mouse.move(target.x, target.y, { steps: 10 })
    await page.mouse.up()
    expect(cellsOf((await downloadedTable(page)).children).inner).toEqual({ row: 0, column: 1 })
  })
})

// Reported 2026-10-03: with the name table inside a block selected, a violet
// dashed frame stood around the whole block - the open container's frame,
// drawn for a table too, which already shows itself by its strong lines.
test.describe("table editing: no container frame around a table", () => {
  test("an object selected in a table: no violet frame on the canvas", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 12, 8 + 23 + 6 + 8)
    await expect(page.locator("#text")).toHaveText("Tief")
    const { canvas } = await getMainCanvas(page)
    const violet = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data
      let n = 0
      // EDITING_COLOR #7c3aed, give or take its antialiasing.
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 124) < 30 && Math.abs(d[i + 1] - 58) < 30 && Math.abs(d[i + 2] - 237) < 30) n++
      return n
    })
    expect(violet).toBe(0)
  })
})

// Asked 2026-10-03: «copy a cell, then Ctrl+V» - pasted into the cell picked,
// as in Word; over an object in a table, into a new row below it.
test.describe("table editing: pasting into a table", () => {
  test("an empty cell picked: Ctrl+V puts the copy into that cell", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 12, 14)
    await expect(page.locator("#text")).toHaveText("Links")
    await page.keyboard.press("ControlOrMeta+c")
    await clickAt(page, 300, 14)
    expect(await chosenCell(page)).toEqual({ tableId: "outer", row: 0, column: 1 })
    await page.keyboard.press("ControlOrMeta+v")
    const objects = (await downloadedTable(page)).children as Obj[]
    const copy = objects.find((o) => !["links", "inner"].includes(o.id))!
    expect(copy.properties.text).toBe("Links")
    expect(copy.properties.cell).toEqual({ row: 0, column: 1 })
  })

  test("an object in a table selected: Ctrl+V puts the copy into a new row below it", async ({ page }) => {
    await loadProject(page, await nestedProject())
    await clickAt(page, 12, 14)
    await page.keyboard.press("ControlOrMeta+c")
    await page.keyboard.press("ControlOrMeta+v")
    const objects = (await downloadedTable(page)).children as Obj[]
    const copy = objects.find((o) => !["links", "inner"].includes(o.id))!
    expect(copy.properties.cell).toEqual({ row: 1, column: 0 })
    expect(cellsOf(objects.filter((o) => o.id !== copy.id))).toEqual({ links: { row: 0, column: 0 }, inner: { row: 2, column: 0 } })
  })
})

// Reported 2026-10-05: the Autoterm block's dials came at 64 px and could not
// be made larger - in a table the Frame hid the diameter with X, Y and W, and
// dragging a corner spans cells. A ring's diameter is its own, up to the cell.
test.describe("table editing: a ring in a cell", () => {
  async function ringProject(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const one = project.screens.find((s: Obj) => s.id === "screen-1")
    one.objects = [
      {
        id: "outer",
        type: "table",
        x: 8,
        y: 8,
        width: 384,
        height: 284,
        zIndex: 1,
        properties: { columns: [{ width: { share: 50 } }, { width: { share: 50 } }], rows: 1 },
        children: [
          text("links", "Links", 1, { row: 0, column: 0 }),
          {
            id: "ring",
            type: "dial",
            x: 0,
            y: 0,
            width: 64,
            height: 64,
            zIndex: 2,
            properties: {
              topic: "t/value",
              writeTopic: "t/set",
              calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }],
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness: 8,
              cell: { row: 0, column: 1 },
            },
          },
        ],
      },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `table-ring-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }

  test("its Diameter can be typed in a cell, and the ring grows, but no wider than the cell", async ({ page }) => {
    await loadProject(page, await ringProject())
    await objectTreeRow(page, "ring").click()
    await openFrameSection(page)
    const diameter = page.getByLabel("Diameter", { exact: true })
    await expect(diameter).toBeVisible()
    // X and Y stay the table's.
    await expect(page.getByLabel("X", { exact: true })).toHaveCount(0)
    await diameter.fill("128")
    await diameter.press("Tab")
    const ring = ((await downloadedTable(page)).children as Obj[]).find((o) => o.id === "ring")!
    expect(ring.width).toBeGreaterThan(100)
    expect(ring.height).toBe(ring.width)
    // More than the cell has: as wide as the cell, on its track's grid.
    await diameter.fill("900")
    await diameter.press("Tab")
    const table = await downloadedTable(page)
    const wide = (table.children as Obj[]).find((o) => o.id === "ring")!
    expect(wide.width).toBeLessThanOrEqual(table.width / 2)
    // A text in a table still has no width of its own to type.
    await objectTreeRow(page, "links").click()
    await openFrameSection(page)
    await expect(page.getByLabel("W", { exact: true })).toHaveCount(0)
  })
})
