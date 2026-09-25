import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { DEFAULT_SEPARATORS, parse, referencedTopics, resolve } from "../lib/placeholders"
import { placeholderScope } from "../lib/render-screen"

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

// The preview draws texts and level labels resolved (task 3). Checked through
// the headless render harness by comparing pictures: a text with a
// placeholder must come out pixel for pixel as the text it should read, so the
// comparison covers the font, the position and - for a level - the height of
// the header row, without reading any text back off a canvas.
test.describe("placeholders in the rendered preview", () => {
  const W = 320
  const H = 120

  function project(object: Record<string, unknown>, topics: { topic: string; examples: string[] }[], settings = {}) {
    return {
      name: "Van Sommer 2026",
      screenWidth: W,
      screenHeight: H,
      settings: { colorDepth: "24bit", deviceName: "Waveshare Knob-Touch LCD 1.8", ...settings },
      fonts: [],
      assets: [],
      topics,
      screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects: [{ id: "o", zIndex: 0, ...object }] }],
    }
  }
  const text = (value: string) => ({ type: "text", x: 10, y: 10, width: 300, height: 30, properties: { text: value, fontSize: 18 } })
  const bar = (label: string) => ({
    type: "bar",
    x: 10,
    y: 10,
    width: 300,
    height: 60,
    properties: { topic: "t/level", label, fillColor: "#4caf50", textColor: "#000000", displayValue: "percentage" },
  })

  async function picture(page: Page, p: unknown, overrides: Record<string, string> = {}): Promise<string> {
    await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: p, screenIndex: 0, topicOverrides: overrides })
    return page.evaluate(() => (document.querySelector("canvas") as HTMLCanvasElement).toDataURL())
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  const level = { topic: "t/level", examples: ["72"] }

  test("a text reads its topic's example, formatted in the project's number format", async ({ page }) => {
    const topics = [level, { topic: "t/big", examples: ["12345.678"] }]
    // The comparison only means something if different texts draw differently.
    expect(await picture(page, project(text("Tank 72 %"), topics))).not.toBe(await picture(page, project(text("Tank 73 %"), topics)))
    const resolved = await picture(page, project(text("Tank {topic:t/level:F0} %, {topic:t/big:N2}"), topics))
    const expected = await picture(page, project(text("Tank 72 %, 12'345.68"), topics))
    expect(resolved).toBe(expected)

    const german = await picture(page, project(text("{topic:t/big:N2}"), topics, { decimalSeparator: ",", thousandsSeparator: "." }))
    expect(german).toBe(await picture(page, project(text("12.345,68"), topics)))
  })

  test("a text follows a value that arrives, and shows ?? until one does", async ({ page }) => {
    const topics = [level]
    const p = project(text("Tank {topic:t/level ?? \"–\"} %"), topics)
    expect(await picture(page, p, { "t/level": "40" })).toBe(await picture(page, project(text("Tank 40 %"), topics)))
    // An override of "" is a topic nothing has arrived on, as on a device.
    expect(await picture(page, p, { "t/level": "" })).toBe(await picture(page, project(text("Tank – %"), topics)))
  })

  test("device and project resolve; reserved references stay as written", async ({ page }) => {
    expect(await picture(page, project(text("{project:name} · {device:model}"), [level]))).toBe(
      await picture(page, project(text("Van Sommer 2026 · Waveshare Knob-Touch LCD 1.8"), [level])),
    )
    expect(await picture(page, project(text("{device:name}"), [level]))).toBe(await picture(page, project(text("{device:name}"), [level])))
  })

  test("a level's label resolves, and its header is the same with the value or the fallback", async ({ page }) => {
    const named = [level, { topic: "t/name", examples: ["Hauptwassertank"] }]
    const unnamed = [level, { topic: "t/name", examples: [] }]
    const label = '{topic:t/name ?? "Frischwasser"}'
    expect(await picture(page, project(bar("Frischwasser"), named))).not.toBe(await picture(page, project(bar("Grauwasser"), named)))
    expect(await picture(page, project(bar(label), named))).toBe(await picture(page, project(bar("Hauptwassertank"), named)))
    expect(await picture(page, project(bar(label), unnamed))).toBe(await picture(page, project(bar("Frischwasser"), unnamed)))
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

  // The designer's scope: what `??` sees as "never arrived" in the editor
  // (no example) and in the live preview (nothing delivered), and "" as a
  // value that did arrive.
  test("the preview scope answers undefined only for a value that is not there", () => {
    const topics = [
      { id: "1", topic: "t/level", type: "numeric" as const, examples: ["72"] },
      { id: "2", topic: "t/none", type: "text" as const, examples: [] },
      { id: "3", topic: "t/json", type: "json" as const, examples: ['{"temp":21.4}'] },
    ]
    const editor = placeholderScope({ topics, projectName: "P", device: { model: "M", id: "gleaming-harvest" }, separators: DEFAULT_SEPARATORS })
    const topic = (path: string) => ({ namespace: "topic" as const, path })
    expect(editor.lookup(topic("t/level"))).toBe("72")
    expect(editor.lookup(topic("t/none"))).toBeUndefined()
    expect(editor.lookup(topic("t/unknown"))).toBeUndefined()
    expect(editor.lookup(topic("t/json#temp"))).toBe("21.4")
    expect(editor.lookup({ namespace: "device", path: "id" })).toBe("gleaming-harvest")
    expect(editor.lookup({ namespace: "project", path: "name" })).toBe("P")

    const live = placeholderScope({ topics, liveValues: { "t/empty": "" }, separators: DEFAULT_SEPARATORS })
    expect(live.lookup(topic("t/level")), "no example stands in for a live value").toBeUndefined()
    expect(live.lookup(topic("t/empty"))).toBe("")
  })

  test("an unknown or reserved placeholder says why, for the editor to show", () => {
    const [segment] = parse("{(topic:a < 0 ? \"x\" : \"y\")}")
    expect(segment).toMatchObject({ kind: "raw", reason: "expressions are reserved for later" })
    expect(parse("{device:name}")[0]).toMatchObject({ kind: "raw", reason: "unknown field" })
  })
})
