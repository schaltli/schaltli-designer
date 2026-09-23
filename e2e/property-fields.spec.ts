import { test, expect, type Page } from "@playwright/test"

// The property panel's fourteen fields, measured rather than eyeballed
// (components/property-panel/fields/, docs/2026-09-20-property-panel.md).
//
// The rebuild's premise was a measurement: the panel read as untidy because
// the value's text began at six different places depending on the row, over
// a 44 px span, and a number was right-aligned in a 66 px box so it
// fluttered against itself as digits were added. The fill hid that rather
// than fixing it. So the rules worth pinning here are the geometric ones -
// they are the reason the rest of the look works, and they are exactly what
// a careless edit to one field would break without anything looking wrong
// in that field alone.
//
// The harness is app/test-fields, the same kind of page as app/test-render.

const HARNESS = "/test-fields"

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`no box for ${selector}`)
  return b
}

/** Where a control's own box starts and ends, relative to the panel. */
async function edges(page: Page, selector: string) {
  const panel = await box(page, '[data-testid="panel"]')
  const b = await box(page, selector)
  return { left: Math.round(b.x - panel.x), right: Math.round(b.x + b.width - panel.x), top: b.y, height: b.height }
}

test.describe("the property fields", () => {
  test("every control starts and ends on the same two edges", async ({ page }) => {
    await page.goto(HARNESS)
    await expect(page.locator('[data-testid="panel"]')).toBeVisible()

    // One of each kind that fills the column: text, select, number, the
    // condition's value, a toggle, an icon slot. A number is in there
    // deliberately - it was the worst offender, right-aligned in its own
    // 66 px box while everything else was left-aligned and full width.
    const controls = [
      "#fld-text",
      "#fld-select",
      "#fld-topic",
      "#fld-step",
      'input[type="checkbox"] ~ *, label:has(input[type="checkbox"])',
    ]
    const measured = await Promise.all(controls.map((c) => edges(page, c)))
    const lefts = new Set(measured.map((m) => m.left))
    const rights = new Set(measured.map((m) => m.right))

    expect(lefts.size, `left edges: ${[...lefts].join(", ")}`).toBe(1)
    expect(rights.size, `right edges: ${[...rights].join(", ")}`).toBe(1)

    // And the column really is where the geometry says: the panel's own
    // border and padding, then 124 px of name and a 4 px gap. The border is
    // measured rather than assumed - it is the panel's, not the field's.
    const border = await page.evaluate(
      () => document.querySelector('[data-testid="panel"]')!.clientLeft,
    )
    expect([...lefts][0]).toBe(border + 14 + 124 + 4)
  })

  test("every control is the same height, and rows keep their rhythm", async ({ page }) => {
    await page.goto(HARNESS)
    for (const c of ["#fld-text", "#fld-select", "#fld-step"]) {
      expect(Math.round((await edges(page, c)).height), c).toBe(28)
    }
  })

  test("a wrapped picker wears the same clothes as a plain field", async ({ page }) => {
    await page.goto(HARNESS)
    // The topic, font and colour pickers keep their own markup and get the
    // row's look by selector (fields/wrapped-fields.tsx). Left alone they are
    // a shadcn trigger: 32 px tall, white, bordered, padded by 12 - so a
    // topic row and a number row start their values at different heights and
    // different x, which is the flutter the C+ look was chosen to end. It
    // showed up the first time a rebuilt panel had all three on it (the
    // Slider, round 2) and nothing here would have caught it.
    const plain = await edges(page, "#fld-step")
    const triggers = page.locator('[data-slot="select-trigger"]')
    const n = await triggers.count()
    expect(n).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < n; i++) {
      const b = await triggers.nth(i).boundingBox()
      const panel = await box(page, '[data-testid="panel"]')
      expect(Math.round(b!.height), `trigger ${i} height`).toBe(28)
      expect(Math.round(b!.x - panel.x), `trigger ${i} left`).toBe(plain.left)
      expect(Math.round(b!.x + b!.width - panel.x), `trigger ${i} right`).toBe(plain.right)
    }
  })

  test("below 380px of panel the name folds above its control", async ({ page }) => {
    await page.goto(`${HARNESS}?w=480`)
    const wide = await edges(page, "#fld-text")
    const wideLabel = await box(page, 'label[for="fld-text"]')
    // Side by side: the label's baseline row is the control's row.
    expect(Math.abs(wideLabel.y - wide.top)).toBeLessThan(12)

    await page.goto(`${HARNESS}?w=320`)
    const narrow = await edges(page, "#fld-text")
    const narrowLabel = await box(page, 'label[for="fld-text"]')
    // Stacked: the label sits a line above, and the control starts at the
    // panel's own padding rather than after a 124 px column.
    expect(narrowLabel.y).toBeLessThan(narrow.top - 8)
    const border = await page.evaluate(
      () => document.querySelector('[data-testid="panel"]')!.clientLeft,
    )
    expect(narrow.left).toBe(border + 14)
  })

  test("a section remembers being closed, by its heading, across objects", async ({ page }) => {
    await page.goto(HARNESS)

    // Frame starts closed - those values are dragged on the canvas - and
    // says what it holds while it is.
    const frame = page.getByRole("button", { name: /FRAME/i })
    await expect(frame).toHaveAttribute("aria-expanded", "false")
    await expect(frame).toContainText("20, 120 · 240 × 56")

    const data = page.getByRole("button", { name: /^DATA/i })
    await expect(data).toHaveAttribute("aria-expanded", "true")
    await data.click()
    await expect(data).toHaveAttribute("aria-expanded", "false")

    // Kept under the heading, not the object - and not in the project file,
    // which would make opening a twisty a change to the project.
    const stored = await page.evaluate(() => window.localStorage.getItem("schaltli.panelSections"))
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ Data: true })

    await page.reload()
    await expect(page.getByRole("button", { name: /^DATA/i })).toHaveAttribute("aria-expanded", "false")
  })

  test("a number's name is a drag handle", async ({ page }) => {
    await page.goto(HARNESS)
    const field = page.locator("#fld-step")
    await expect(field).toHaveValue("28")

    const label = page.locator('label[for="fld-step"]')
    const b = await box(page, 'label[for="fld-step"]')
    const y = b.y + b.height / 2
    await page.mouse.move(b.x + 10, y)
    await page.mouse.down()
    await page.mouse.move(b.x + 50, y, { steps: 8 })
    await page.mouse.up()

    // Two pixels to the step, so 40 px right is 20 more.
    await expect(field).toHaveValue("48")
    await expect(label).toHaveClass(/cursor-ew-resize/)
  })

  test("what a label cannot say fits on a question mark", async ({ page }) => {
    await page.goto(HARNESS)
    // Short label, sentence on the mark - the explanations used to be in the
    // label itself ("Step (when set by a finger)").
    await expect(page.locator('label[for="fld-step"]')).toContainText("Step")
    await expect(page.locator('label[for="fld-step"] [role="note"]')).toHaveAttribute(
      "aria-label",
      "How far a finger moves the value in one jump.",
    )
  })

  test("a list entry is one line until you open it", async ({ page }) => {
    await page.goto(HARNESS)
    const second = page.getByRole("button", { name: /An · on/ })
    await expect(second).toHaveAttribute("aria-expanded", "false")
    await second.click()
    await expect(second).toHaveAttribute("aria-expanded", "true")
  })

  test("a list entry can be dragged past the one above it", async ({ page }) => {
    await page.goto(HARNESS)
    // Order is the meaning in three of the five lists - a Live Icon's rules
    // are read top to bottom, a group's states are its segments left to
    // right - and the grip was decoration until round 9.
    const rows = page.locator("[data-list-row]")
    await expect(rows.nth(0)).toContainText("Aus")
    await expect(rows.nth(1)).toContainText("An")

    const grip = rows.nth(1).getByRole("button", { name: /^Move / })
    const from = await grip.boundingBox()
    const target = await rows.nth(0).boundingBox()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 6 })
    await page.mouse.up()

    await expect(rows.nth(0)).toContainText("An")
    await expect(rows.nth(1)).toContainText("Aus")
  })

  test("a derived dimension is locked and says why", async ({ page }) => {
    await page.goto(HARNESS)
    await page.getByRole("button", { name: /FRAME/i }).click()

    const inputs = page.locator('[data-testid="panel"] input[type="number"]')
    const height = inputs.last()
    await expect(height).toHaveAttribute("readonly", "")
    // Not a silently disabled field: the reason is on the section's own mark.
    await expect(page.locator('[role="note"][aria-label="Height follows the font."]')).toBeVisible()
  })
})
