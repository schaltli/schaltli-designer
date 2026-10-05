import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, objectTreeRow } from "./helpers"

// Dragging in the object tree (asked 2026-10-05): the list scrolls when a
// drag nears its top or bottom edge, so a row out of view can be reached,
// and a closed container held over for a moment opens.

type Obj = Record<string, any>

const text = (id: string, zIndex: number): Obj => ({
  id,
  type: "text",
  x: 10,
  y: 10,
  width: 80,
  height: 20,
  zIndex,
  properties: { text: id, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
})

// Sixty texts, and a group with two at the bottom of the list (the tree
// shows the frontmost first, so the group, furthest back, comes last).
async function longProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const one = project.screens.find((s: Obj) => s.id === "screen-1")
  one.objects = [
    {
      id: "the-group",
      type: "group",
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      zIndex: 1,
      properties: {},
      children: [text("inner-a", 1), { ...text("inner-b", 2), y: 35 }],
    },
    ...Array.from({ length: 60 }, (_, i) => text(`t${String(i).padStart(2, "0")}`, i + 2)),
  ]
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `object-tree-drag-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

const list = (page: Page) => page.getByTestId("object-tree-scroll")
const scrollTop = (page: Page) => list(page).evaluate((el) => el.scrollTop)

/** Holds the pointer at a point for `ms`, nudging it so the drag keeps reporting. */
async function hold(page: Page, x: number, y: number, ms: number) {
  const until = Date.now() + ms
  let n = 0
  while (Date.now() < until) {
    await page.mouse.move(x + (n++ % 2), y)
    await page.waitForTimeout(50)
  }
}

test("a drag near the bottom of the tree scrolls it, and a closed group held over opens", async ({ page }) => {
  await loadProject(page, await longProject())
  // Close the group, then back to the top of the list.
  await list(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
  await objectTreeRow(page, "the-group").locator("button").first().click()
  await expect(objectTreeRow(page, "inner-a")).toHaveCount(0)
  await list(page).evaluate((el) => (el.scrollTop = 0))
  expect(await scrollTop(page)).toBe(0)

  // The frontmost text, dragged down to the list's bottom edge and held.
  const from = (await objectTreeRow(page, "t59").boundingBox())!
  const box = (await list(page).boundingBox())!
  await page.mouse.move(from.x + 40, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y + from.height / 2 + 20, { steps: 4 })
  await hold(page, from.x + 40, box.y + box.height - 4, 1500)
  expect(await scrollTop(page)).toBeGreaterThan(0)
  // Held there long enough, it reaches the group at the end.
  await hold(page, from.x + 40, box.y + box.height - 2, 4000)
  const group = (await objectTreeRow(page, "the-group").boundingBox())!
  expect(group.y + group.height).toBeLessThanOrEqual(box.y + box.height + 1)

  // Over the middle of the closed group: after a moment it opens.
  await hold(page, group.x + 60, group.y + group.height / 2, 900)
  await expect(objectTreeRow(page, "inner-a")).toBeVisible()
  await page.mouse.up()
})

test("a drag near the top edge scrolls back up; a short pass over a closed group leaves it closed", async ({ page }) => {
  await loadProject(page, await longProject())
  await list(page).evaluate((el) => (el.scrollTop = el.scrollHeight))
  await objectTreeRow(page, "the-group").locator("button").first().click()
  const bottom = await scrollTop(page)
  expect(bottom).toBeGreaterThan(0)

  const group = (await objectTreeRow(page, "the-group").boundingBox())!
  const from = (await objectTreeRow(page, "t00").boundingBox())!
  const box = (await list(page).boundingBox())!
  await page.mouse.move(from.x + 40, from.y + from.height / 2)
  await page.mouse.down()
  // Across the closed group quickly: it stays closed.
  await page.mouse.move(group.x + 60, group.y + group.height / 2, { steps: 4 })
  await page.waitForTimeout(150)
  await expect(objectTreeRow(page, "inner-a")).toHaveCount(0)
  await hold(page, from.x + 40, box.y + 3, 1200)
  expect(await scrollTop(page)).toBeLessThan(bottom)
  await page.mouse.up()
})
