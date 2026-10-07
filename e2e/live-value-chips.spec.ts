import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// A text's values are chips (docs/2026-10-07-live-values.md, «Chips in a
// text»; tasks/live-values-todo.md, Tasks 6 and 7): typed around, stepped
// over, deleted, copied and pasted as one; `{` or «+ Value» inserts one.

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

// A Text drawn at (x, y): its field focused, "Label" selected.
async function drawText(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Text", exact: true }).first().click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, x, y)
  const to = devicePoint(box, x + 200, y + 24)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator("#text")).toBeFocused()
}

// The saved text objects' properties: those this test drew, told apart from
// the project's own by their text.
async function savedTexts(page: Page, ...starts: string[]): Promise<{ text: string; liveValues?: any[] }[]> {
  const project = await downloadProjectJson(page)
  const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
  const texts = deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.type === "text").map((o: any) => o.properties)
  return starts.map((start) => texts.find((t: any) => typeof t.text === "string" && t.text.startsWith(start)))
}

const field = (page: Page) => page.locator("#text")
const chips = (page: Page) => field(page).getByTestId("live-chip")

async function insertValue(page: Page, query: string) {
  await page.keyboard.type("{")
  await expect(page.getByTestId("live-value-search")).toBeFocused()
  await page.keyboard.type(query)
  await page.keyboard.press("Enter")
  await expect(field(page)).toBeFocused()
}

test.describe("chips in a text", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("{ opens the search; Enter inserts a chip at the caret; typing goes on around it", async ({ page }) => {
    await drawText(page, 20, 200)
    await page.keyboard.type("Tank ")
    await insertValue(page, "freshwater")
    await page.keyboard.type(" %")
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page)).toContainText("Level")
    await expect(field(page)).toContainText("Tank")
    await page.keyboard.press("Enter")

    const [text] = await savedTexts(page, "Tank")
    expect(text.text).toBe("Tank {live:lv1} %")
    expect(text.liveValues).toEqual([
      { id: "lv1", source: { namespace: "topic", path: "Freshwater/Level" }, rules: [], format: { kind: "number", decimals: 1, grouped: false } },
    ])
  })

  test("Esc in the search closes it and leaves the text as it was", async ({ page }) => {
    await drawText(page, 20, 200)
    await page.keyboard.type("A")
    await page.keyboard.type("{")
    await expect(page.getByTestId("live-value-search")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(field(page)).toBeFocused()
    await page.keyboard.type("B")
    await expect(field(page)).toHaveText("AB")
    await expect(chips(page)).toHaveCount(0)
  })

  test("+ Value inserts at the caret too", async ({ page }) => {
    await drawText(page, 20, 200)
    await page.keyboard.type("Modus ")
    await page.getByRole("button", { name: "+ Value" }).click()
    await page.keyboard.type("fan-mode")
    await page.keyboard.press("Enter")
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page)).toContainText("OFF")
  })

  test("the arrows step over a chip, Backspace removes it whole, and its live value goes when the field is left", async ({ page }) => {
    await drawText(page, 20, 200)
    await page.keyboard.type("x")
    await insertValue(page, "fan-mode")
    await page.keyboard.type("y")
    // ← over y, ← over the chip, then a character lands between x and the chip.
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.type("-")
    await page.keyboard.press("End")
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("Backspace")
    await expect(chips(page)).toHaveCount(0)
    await expect(field(page)).toHaveText("x-y")
    await page.keyboard.press("Enter")
    const [text] = await savedTexts(page, "x-y")
    expect(text.text).toBe("x-y")
    expect(text.liveValues).toBeUndefined()
  })

  test("a placeholder pasted becomes a chip", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await drawText(page, 20, 200)
    await page.evaluate(() => navigator.clipboard.writeText("Stufe {topic:test/fan-speed} jetzt"))
    await page.keyboard.press("ControlOrMeta+v")
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page)).toContainText("LOW")
    await page.keyboard.press("Enter")
    const [text] = await savedTexts(page, "Stufe")
    expect(text.text).toBe("Stufe {live:lv1} jetzt")
    expect(text.liveValues?.[0].source).toEqual({ namespace: "topic", path: "test/fan-speed" })
  })

  test("a chip copied into another text brings its live value along", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await drawText(page, 20, 150)
    await page.keyboard.type("A ")
    await insertValue(page, "fan-mode")
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("ControlOrMeta+c")
    await page.keyboard.press("Enter")

    await drawText(page, 20, 220)
    await page.keyboard.press("ControlOrMeta+v")
    await expect(chips(page)).toHaveCount(1)
    await page.keyboard.press("Enter")

    const project = await downloadProjectJson(page)
    const copies = project.screens
      .flatMap((s: any) => s.objects)
      .filter((o: any) => o.type === "text" && o.properties.text === "A {live:lv1}")
    expect(copies).toHaveLength(2)
    const [, second] = copies.map((o: any) => o.properties)
    expect(second.liveValues?.[0].source).toEqual({ namespace: "topic", path: "test/fan-mode" })
  })

  test("{{ writes a brace; a pasted brace that reads as nothing gets a red line", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await drawText(page, 20, 200)
    await page.keyboard.type("a ")
    await page.keyboard.type("{")
    await page.keyboard.type("{")
    await expect(page.getByTestId("live-value-search")).toHaveCount(0)
    await page.keyboard.type("x}} ")
    await expect(field(page)).toHaveText("a {{x}} ")
    await expect(page.getByTestId("placeholder-lines")).toContainText("Type { to insert a value")
    await page.evaluate(() => navigator.clipboard.writeText("{oops}"))
    await page.keyboard.press("ControlOrMeta+v")
    await expect(page.getByTestId("placeholder-lines")).toContainText("{oops} is shown as written")
    await expect(chips(page)).toHaveCount(0)
  })
})
