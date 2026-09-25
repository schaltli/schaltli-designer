import { test, expect, type Page } from "@playwright/test"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"
import type { Topic } from "../components/project-editor"
import { DEFAULT_SEPARATORS } from "../lib/placeholders"
import {
  applyCompletion,
  completionContext,
  formatEntries,
  placeholderProblems,
  referenceEntries,
  topicExample,
} from "../lib/placeholder-completion"

// The placeholder picker (docs/2026-09-25-placeholder-picker.md). "completion"
// tests the pure logic in lib/placeholder-completion.ts without a browser;
// the field itself is tested in the browser below it.

// `|` marks the caret in these texts.
function at(marked: string): { text: string; caret: number } {
  const caret = marked.indexOf("|")
  return { text: marked.slice(0, caret) + marked.slice(caret + 1), caret }
}

function contextAt(marked: string) {
  const { text, caret } = at(marked)
  return completionContext(text, caret)
}

function pick(marked: string, choice: string): string {
  const { text, caret } = at(marked)
  const context = completionContext(text, caret)
  if (!context) throw new Error(`no completion at ${marked}`)
  const result = applyCompletion(text, context, choice)
  return result.text.slice(0, result.caret) + "|" + result.text.slice(result.caret)
}

const TOPICS: Topic[] = [
  { id: "1", topic: "schaltli/state/tank/1/level", type: "numeric", examples: ["72.4", "35", "8"] },
  { id: "2", topic: "schaltli/state/tank/1/name", type: "text", examples: ["Frischwasser"] },
  {
    id: "3",
    topic: "sensors/cabin",
    type: "json",
    examples: ['{"temp":21.5,"humid":56}'],
    subtopics: [
      { id: "3a", path: "temp", type: "numeric" },
      { id: "3b", path: "humid", type: "numeric" },
    ],
  },
  { id: "4", topic: "schaltli/state/power/1", type: "text", examples: [] },
]

const references = (query: string) => referenceEntries(query, TOPICS).map((e) => e.reference)

test.describe("completion", () => {
  test("a { opens the reference stage with nothing typed yet", () => {
    expect(contextAt("Tank {|")).toMatchObject({ stage: "reference", query: "", start: 5 })
    expect(contextAt("{|}")).toMatchObject({ stage: "reference", query: "" })
  })

  test("{{ is a literal brace and offers nothing", () => {
    expect(contextAt("{{|")).toBeUndefined()
    expect(contextAt("a {{ b|")).toBeUndefined()
  })

  test("what is typed after the { is the query", () => {
    expect(contextAt("{topic:ta|")).toMatchObject({ stage: "reference", query: "topic:ta" })
    expect(contextAt("{frisch|")).toMatchObject({ stage: "reference", query: "frisch" })
    expect(contextAt("{device:|}")).toMatchObject({ stage: "reference", query: "device:" })
  })

  test("a : after a topic reference is the format stage", () => {
    expect(contextAt("{topic:a/b:|")).toMatchObject({ stage: "format", query: "", topicPath: "a/b" })
    expect(contextAt("{topic:a/b:F|")).toMatchObject({ stage: "format", query: "F", topicPath: "a/b" })
    expect(contextAt("{topic:a/b#temp:N2|}")).toMatchObject({ stage: "format", query: "N2", topicPath: "a/b#temp" })
  })

  test("the namespace's own : is not a format", () => {
    expect(contextAt("{topic:|")).toMatchObject({ stage: "reference", query: "topic:" })
    expect(contextAt("{device:model:|")).toMatchObject({ stage: "reference" })
  })

  test("outside a placeholder there is nothing to offer", () => {
    expect(contextAt("|")).toBeUndefined()
    expect(contextAt("{topic:a/b} |")).toBeUndefined()
    expect(contextAt("{topic:a/b}|")).toBeUndefined()
    expect(contextAt("}} {{ |")).toBeUndefined()
  })

  test("inside a quoted fallback or after whitespace there is nothing to offer", () => {
    expect(contextAt('{topic:a/b ?? "no {|')).toBeUndefined()
    expect(contextAt("{topic:a/b ?|")).toBeUndefined()
  })

  test("the closing brace after the caret is found", () => {
    expect(contextAt("{ta|}")!.closeAt).toBe(3)
    expect(contextAt("{ta| {b}")!.closeAt).toBe(-1)
  })

  test("every topic, a JSON topic's fields, and the device and project fields are offered", () => {
    expect(references("")).toEqual([
      "topic:schaltli/state/tank/1/level",
      "topic:schaltli/state/tank/1/name",
      "topic:sensors/cabin",
      "topic:sensors/cabin#temp",
      "topic:sensors/cabin#humid",
      "topic:schaltli/state/power/1",
      "device:model",
      "device:id",
      "project:name",
    ])
  })

  test("an entry shows its type and first example", () => {
    const [level] = referenceEntries("tank/1/level", TOPICS)
    expect(level).toMatchObject({ section: "topic", detail: "numeric", example: "72.4" })
    const [temp] = referenceEntries("#temp", TOPICS)
    expect(temp).toMatchObject({ detail: "numeric", example: "21.5" })
    const [model] = referenceEntries("device:model", TOPICS)
    expect(model).toMatchObject({ section: "device", detail: "the device's model", example: undefined })
  })

  test("the query matches the path and the example, ignoring case", () => {
    expect(references("tank")).toEqual(["topic:schaltli/state/tank/1/level", "topic:schaltli/state/tank/1/name"])
    expect(references("frisch")).toEqual(["topic:schaltli/state/tank/1/name"])
    // The JSON topic itself matches too: its example contains "humid".
    expect(references("HUMID")).toEqual(["topic:sensors/cabin", "topic:sensors/cabin#humid"])
    expect(references("nothing like it")).toEqual([])
  })

  test("a namespace narrows to its section", () => {
    expect(references("topic:")).toHaveLength(6)
    expect(references("topic:name")).toEqual(["topic:schaltli/state/tank/1/name"])
    expect(references("device:")).toEqual(["device:model", "device:id"])
    expect(references("project:")).toEqual(["project:name"])
    // "name" alone also finds the project's name.
    expect(references("name")).toEqual(["topic:schaltli/state/tank/1/name", "project:name"])
  })

  test("the offered formats preview the example in the given separators", () => {
    expect(formatEntries("", "12345.678", DEFAULT_SEPARATORS)).toEqual([
      { format: "F0", preview: "12346" },
      { format: "F1", preview: "12345.7" },
      { format: "F2", preview: "12345.68" },
      { format: "N0", preview: "12'346" },
      { format: "N2", preview: "12'345.68" },
    ])
    expect(formatEntries("N2", "12345.678", { decimal: ",", thousands: "." })).toEqual([
      { format: "N2", preview: "12.345,68" },
    ])
  })

  test("typing narrows the formats; one typed in full is kept", () => {
    expect(formatEntries("N", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["N0", "N2"])
    expect(formatEntries("F2", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["F2"])
    expect(formatEntries("f", "1", DEFAULT_SEPARATORS).map((e) => e.format)).toEqual(["F0", "F1", "F2"])
    expect(formatEntries("N5", "1", DEFAULT_SEPARATORS)).toEqual([{ format: "N5", preview: "1.00000" }])
    expect(formatEntries("X", "1", DEFAULT_SEPARATORS)).toEqual([])
  })

  test("the format preview uses the topic's first example, or a JSON field's value", () => {
    expect(topicExample("schaltli/state/tank/1/level", TOPICS)).toBe("72.4")
    expect(topicExample("sensors/cabin#humid", TOPICS)).toBe("56")
    expect(topicExample("schaltli/state/power/1", TOPICS)).toBeUndefined()
    expect(topicExample("not/declared", TOPICS)).toBeUndefined()
  })

  test("without a numeric example the formats have no preview", () => {
    for (const example of ["Frischwasser", undefined]) {
      const entries = formatEntries("", example, DEFAULT_SEPARATORS)
      expect(entries.map((e) => e.format)).toEqual(["F0", "F1", "F2", "N0", "N2"])
      expect(entries.every((e) => e.preview === undefined)).toBe(true)
    }
  })

  test("picking a reference writes it closed, the caret before the }", () => {
    expect(pick("Tank {ta|", "topic:schaltli/state/tank/1/level")).toBe("Tank {topic:schaltli/state/tank/1/level|}")
    expect(pick("{|} %", "device:model")).toBe("{device:model|} %")
    expect(pick("{ta| and more", "topic:x")).toBe("{topic:x|} and more")
  })

  test("picking a reference inside one replaces it and keeps its format", () => {
    expect(pick("{topic:ta|nk/1:F1}", "topic:schaltli/state/tank/1/level")).toBe(
      "{topic:schaltli/state/tank/1/level|:F1}",
    )
    expect(pick("{ta|nk/1}", "topic:tank/2")).toBe("{topic:tank/2|}")
  })

  test("picking a format completes it and the }, the caret after it", () => {
    expect(pick("{topic:a/b:|", "F2")).toBe("{topic:a/b:F2}|")
    expect(pick("{topic:a/b:|} %", "F0")).toBe("{topic:a/b:F0}| %")
    expect(pick("{topic:a/b:N|} %", "N2")).toBe("{topic:a/b:N2}| %")
    expect(pick("{topic:a/b:F|1}", "F2")).toBe("{topic:a/b:F2}|")
  })

  test("a placeholder a device shows as written is an error, saying why", () => {
    const problems = (text: string) => placeholderProblems(text, TOPICS).map((p) => [p.severity, p.text])
    expect(problems("{device:name}")).toEqual([["error", "{device:name} is shown as written: reserved for later"]])
    expect(problems("{project:version}")).toEqual([["error", "{project:version} is shown as written: reserved for later"]])
    expect(problems("{device:colour}")).toEqual([["error", "{device:colour} is shown as written: unknown field"]])
    expect(problems("{screen}")).toEqual([["error", "{screen} is shown as written: unknown namespace"]])
    expect(problems("a {topic:x")).toEqual([["error", "{topic:x is shown as written: no closing }"]])
  })

  test("a topic the project does not have is a warning, once", () => {
    const problems = (text: string) => placeholderProblems(text, TOPICS).map((p) => [p.severity, p.text])
    expect(problems("{topic:new/one} {topic:new/one:F1} {topic:sensors/cabin#temp}")).toEqual([
      ["warning", "new/one is not in the project yet - added when you leave the field"],
    ])
  })

  test("a clean text has no problems", () => {
    expect(placeholderProblems("Tank {topic:schaltli/state/tank/1/level:F0} % {{x}} {device:id}", TOPICS)).toEqual([])
  })

  test("the whole key sequence of the success criterion", () => {
    // {, tank, Enter on the level topic, :, F0, Enter.
    let text = pick("{tank|", "topic:schaltli/state/tank/1/level")
    text = text.replace("|", ":F0|")
    expect(contextAt(text)).toMatchObject({ stage: "format", query: "F0", topicPath: "schaltli/state/tank/1/level" })
    expect(pick(text, "F0")).toBe("{topic:schaltli/state/tank/1/level:F0}|")
  })
})

// The field in the designer. combined-test-project has Freshwater/Level
// (first example "0") and test/fan-setpoint ("45") among its topics, and no
// number format of its own, so the Swiss default applies.
test.describe("Text field", () => {
  async function newText(page: Page) {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 200)
    const to = devicePoint(box, 200, 230)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    const field = page.locator("#text")
    await field.fill("")
    await field.focus()
    return field
  }

  const picker = (page: Page) => page.getByTestId("placeholder-picker")

  test("{ opens Topic, Device and Project; typing filters", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("Tank {")
    await expect(picker(page)).toBeVisible()
    for (const heading of ["Topic", "Device", "Project"]) {
      await expect(picker(page).getByRole("group", { name: heading })).toBeVisible()
    }
    await expect(picker(page).locator('[data-value="device:model"]')).toBeVisible()

    await field.pressSequentially("fresh")
    await expect(picker(page).getByRole("option")).toHaveCount(1)
    await expect(picker(page).getByRole("option")).toHaveAttribute("data-value", "topic:Freshwater/Level")
    await expect(picker(page).getByRole("group", { name: "Device" })).toHaveCount(0)
  })

  test("the key sequence writes a topic with a format, previewed on the way", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("{fresh")
    await field.press("Enter")
    await expect(field).toHaveValue("{topic:Freshwater/Level}")
    await expect(picker(page)).toHaveCount(0)
    // The caret waits before the }, for a format.
    expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe("{topic:Freshwater/Level".length)

    await field.pressSequentially(":")
    await expect(picker(page).getByRole("option")).toHaveCount(5)
    await expect(picker(page).locator('[data-value="F1"]')).toContainText("0.0")
    await field.pressSequentially("F0")
    await expect(picker(page).getByRole("option")).toHaveCount(1)
    await field.press("Enter")
    await expect(field).toHaveValue("{topic:Freshwater/Level:F0}")
    expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe("{topic:Freshwater/Level:F0}".length)
    await expect(picker(page)).toHaveCount(0)
  })

  test("the format preview uses the project's number format", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("{fan-setpoint")
    await field.press("Enter")
    await field.pressSequentially(":N2")
    await expect(picker(page).locator('[data-value="N2"]')).toContainText("45.00")
  })

  test("arrows move, a click picks, the list keeps focus in the field", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("{device:")
    const options = picker(page).getByRole("option")
    await expect(options).toHaveCount(2)
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true")
    await field.press("ArrowDown")
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
    await field.press("ArrowDown")
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true")
    await options.nth(1).click()
    await expect(field).toHaveValue("{device:id}")
    await expect(field).toBeFocused()
  })

  test("a { typed over a selection opens the list too", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("Tank")
    await field.selectText()
    await field.press("{")
    await expect(field).toHaveValue("{")
    await expect(picker(page)).toBeVisible()
  })

  test("pressing the list's scrollbar or a heading keeps it open and the focus in the field", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("{")
    const list = picker(page)
    await expect(list).toBeVisible()
    // The scrollbar sits at the listbox's right edge, outside every option.
    const box = (await list.boundingBox())!
    await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await expect(list).toBeVisible()
    await expect(field).toBeFocused()

    await list.getByText("Device", { exact: true }).click()
    await expect(list).toBeVisible()
    await expect(field).toBeFocused()
  })

  test("a bar's Name has the same list", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Bar", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 200)
    const to = devicePoint(box, 200, 230)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    const field = page.locator("#level-label")
    await field.fill("")
    await field.pressSequentially("{fresh")
    await field.press("Enter")
    await expect(field).toHaveValue("{topic:Freshwater/Level}")
  })

  test("problems are lines under the field; a clean text shows the hint", async ({ page }) => {
    const field = await newText(page)
    const lines = page.getByTestId("placeholder-lines").first()
    await expect(lines).toContainText("Type { for a value")

    await field.fill("{device:name}")
    await expect(lines.locator("[data-severity=error]")).toHaveText("{device:name} is shown as written: reserved for later")

    await field.fill("{topic:new/one}")
    await expect(lines.locator("[data-severity=warning]")).toHaveText(
      "new/one is not in the project yet - added when you leave the field",
    )
    // Leaving the field declares it, and the line goes.
    await field.evaluate((el) => (el as HTMLElement).blur())
    await expect(lines).toContainText("Type { for a value")

    // The { being typed is not an error yet; left behind, it is.
    await field.fill("")
    await field.focus()
    await field.pressSequentially("{fresh")
    await expect(lines.locator("[data-severity=error]")).toHaveCount(0)
    await field.press("Escape")
    await field.evaluate((el) => (el as HTMLElement).blur())
    await expect(lines.locator("[data-severity=error]")).toHaveText("{fresh is shown as written: no closing }")
  })

  test("Ctrl+Space opens the list inside a { being edited, filtered by what is there", async ({ page }) => {
    const field = await newText(page)
    await field.fill("Tank {topic:fresh} %")
    await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(17, 17))
    await expect(picker(page)).toHaveCount(0)
    await field.press("Control+Space")
    await expect(picker(page).getByRole("option")).toHaveCount(1)
    await field.press("Enter")
    await expect(field).toHaveValue("Tank {topic:Freshwater/Level} %")

    // Outside any placeholder it opens nothing.
    await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 2))
    await field.press("Control+Space")
    await expect(picker(page)).toHaveCount(0)
  })

  test("{{ opens nothing; Esc, } and leaving the field close the list", async ({ page }) => {
    const field = await newText(page)
    await field.pressSequentially("{")
    await expect(picker(page)).toBeVisible()
    await field.pressSequentially("{")
    await expect(picker(page)).toHaveCount(0)

    await field.fill("")
    await field.pressSequentially("{")
    await expect(picker(page)).toBeVisible()
    await field.press("Escape")
    await expect(picker(page)).toHaveCount(0)
    await expect(field).toHaveValue("{")

    await field.fill("")
    await field.pressSequentially("{topic:x")
    await expect(picker(page)).toBeVisible()
    await field.pressSequentially("}")
    await expect(picker(page)).toHaveCount(0)

    await field.fill("")
    await field.pressSequentially("{")
    await expect(picker(page)).toBeVisible()
    await field.evaluate((el) => (el as HTMLElement).blur())
    await expect(picker(page)).toHaveCount(0)
  })
})
