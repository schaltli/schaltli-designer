import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { DEFAULT_SEPARATORS, parse, referencedTopics, resolve } from "../lib/placeholders"

// Placeholders in texts (docs/2026-09-25-text-placeholders.md). The cases are
// data in lib/placeholders/vectors.json, shared with the firmware and the
// Android app, which must turn every text into the same result - so a case
// belongs there, not here.

interface Vector {
  name: string
  text: string
  values?: Record<string, string>
  decimal?: string
  thousands?: string
  expected: string
}

const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
) as { cases: Vector[] }

test.describe("placeholder vectors", () => {
  for (const vector of cases) {
    test(vector.name, () => {
      const values = vector.values ?? {}
      const lookup = (ref: { namespace: string; path: string }) => {
        const key = `${ref.namespace}:${ref.path}`
        return key in values ? values[key] : undefined
      }
      const separators = {
        decimal: vector.decimal ?? DEFAULT_SEPARATORS.decimal,
        thousands: vector.thousands ?? DEFAULT_SEPARATORS.thousands,
      }
      expect(resolve(vector.text, lookup, separators)).toBe(vector.expected)
    })
  }
})

// Settings › Number format: a preset or a typed pair, stored as the two
// characters a device reads (docs/2026-09-25-text-placeholders.md).
test.describe("number format", () => {
  async function downloadProjectJson(page: Page): Promise<{ settings: Record<string, unknown> }> {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const zip = await JSZip.loadAsync(Buffer.concat(chunks))
    return JSON.parse(await zip.file("project.json")!.async("string"))
  }

  async function openProperties(page: Page) {
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Project Properties" }).click()
    return page.getByRole("dialog").locator("#numberFormat")
  }

  test("a project saved before has Switzerland's; a preset stores its two characters", async ({ page }) => {
    // The combined test project predates the setting.
    await loadProject(page, COMBINED_TEST_PROJECT)
    const picker = await openProperties(page)
    await expect(picker).toContainText("Switzerland (12'345.68)")

    await picker.click()
    await page.getByRole("option", { name: /^Germany/ }).click()
    await expect(picker).toContainText("Germany (12.345,68)")
    await page.keyboard.press("Escape")

    const { settings } = await downloadProjectJson(page)
    expect(settings.decimalSeparator).toBe(",")
    expect(settings.thousandsSeparator).toBe(".")
  })

  test("Custom stores a typed pair, and refuses the same character twice", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const picker = await openProperties(page)
    await picker.click()
    await page.getByRole("option", { name: "Custom" }).click()

    const decimal = page.locator("#decimalSeparator")
    const thousands = page.locator("#thousandsSeparator")
    await decimal.fill(".")
    await thousands.fill(" ")
    await expect(page.getByRole("dialog")).toContainText("12 345.68")
    // Still Custom, although nothing else was chosen.
    await expect(picker).toContainText("Custom")

    await thousands.fill(".")
    await expect(page.getByRole("dialog")).toContainText("Decimal and thousands separator must differ.")
    await page.keyboard.press("Escape")

    // The last usable pair is what is stored.
    const { settings } = await downloadProjectJson(page)
    expect(settings.decimalSeparator).toBe(".")
    expect(settings.thousandsSeparator).toBe(" ")
  })
})

test.describe("placeholders beyond the shared vectors", () => {
  test("the vectors are many and their names unique", () => {
    expect(cases.length).toBeGreaterThan(50)
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length)
  })

  test("the topics a text refers to, each once, for subscribing and declaring", () => {
    expect(referencedTopics("{topic:a/b:F1} {topic:c ?? 0} {topic:a/b} {device:id} {screen} {topic:van/data#temp}")).toEqual([
      "a/b",
      "c",
      "van/data#temp",
    ])
  })

  test("an unknown or reserved placeholder says why, for the editor to show", () => {
    const [segment] = parse("{(topic:a < 0 ? \"x\" : \"y\")}")
    expect(segment).toMatchObject({ kind: "raw", reason: "expressions are reserved for later" })
    expect(parse("{device:name}")[0]).toMatchObject({ kind: "raw", reason: "unknown field" })
  })
})
