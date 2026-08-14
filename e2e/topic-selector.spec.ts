import { test, expect } from "@playwright/test"
import { loadProject, objectTreeRow } from "./helpers"
import path from "path"

// Covers components/property-panel/topic-selector.tsx and
// subtopic-picker.tsx directly (independent of any one object type), using
// the Switch fixture purely as a vehicle: its Read Topic (allowSubtopics
// default true) and Write Topic (allowSubtopics=false, switch-properties.tsx)
// conveniently give one screen both picker modes to exercise side by side.
// The fixture's own diag/* topics exist only for this file - not bound to
// anything on the Switch object, so they don't affect switch-render.spec.ts.
//
// Design (2026-08-14/15 session, see the grilling session in this repo's
// history): the Topic Picker tree NEVER lists subtopics, in any context -
// every registered topic, JSON included, is a plain, directly-selectable
// leaf. A separate Subtopics Picker combobox (own file) renders beside the
// Topic Picker only when the caller allows it (allowSubtopics, false only
// for Switch's Write Topic) AND the selected topic's type is "json". It
// offers that topic's registered subtopics as suggestions but also accepts
// a freeform JSON-path expression, unvalidated - selecting/typing there
// concatenates "topic#path" into the same single properties.topic string
// the Topic Picker alone writes when no subtopic is set.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test.describe("TopicSelector + SubtopicPicker", () => {
  test("a JSON topic is always a plain, directly-selectable leaf - the tree never offers its fields", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox").first()
    await readTopicSelect.click()
    const readListbox = page.getByRole("listbox")
    await readListbox.getByText("diag", { exact: true }).click()

    // "json" itself is directly selectable (a SelectItem/option) - not an
    // expandable header, and none of its fields ever appear as options
    // here, unlike the tree's pre-redesign behavior.
    await expect(readListbox.getByRole("option", { name: "json" })).toBeVisible()
    await expect(readListbox.getByRole("option", { name: "field1" })).toHaveCount(0)
    await expect(readListbox.getByRole("option", { name: "field2" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    // Same tree, same rule, in the write-context picker too (allowSubtopics
    // only ever gates the separate Subtopics Picker, never the tree).
    const writeTopicSelect = page.locator("label", { hasText: "Write Topic" }).locator("..").getByRole("combobox").first()
    await writeTopicSelect.click()
    const writeListbox = page.getByRole("listbox")
    await writeListbox.getByText("diag", { exact: true }).click()
    await expect(writeListbox.getByRole("option", { name: "json" })).toBeVisible()
    await expect(writeListbox.getByRole("option", { name: "field1" })).toHaveCount(0)
  })

  test("selecting a JSON topic with no subtopic binds to the whole payload; the Subtopics Picker only appears for read contexts", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicContainer = page.locator("label", { hasText: "Read Topic" }).locator("..")
    const readTopicSelect = readTopicContainer.getByRole("combobox").first()
    await readTopicSelect.click()
    await page.getByRole("listbox").getByText("diag", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "json" }).click()

    // No "#" - properties.topic is exactly the plain topic string.
    await expect(readTopicSelect).toHaveText(/^diag\/jsonjson$/)

    const subtopicPickerTitle = "JSON field (optional) - leave empty to bind to the whole payload"
    const readSubtopicPicker = readTopicContainer.getByTitle(subtopicPickerTitle)
    await expect(readSubtopicPicker).toBeVisible()
    await expect(readSubtopicPicker).toHaveText("Whole payload")

    // Write Topic never shows a Subtopics Picker at all, even for the same
    // JSON topic - a publish destination can only ever be the whole topic.
    // Scoped to Write Topic's own container specifically - Read Topic's
    // Subtopics Picker (asserted above) is still on the page at this point
    // too, so an unscoped page-wide lookup here would find the wrong one.
    const writeTopicContainer = page.locator("label", { hasText: "Write Topic" }).locator("..")
    const writeTopicSelect = writeTopicContainer.getByRole("combobox").first()
    await writeTopicSelect.click()
    await page.getByRole("listbox").getByText("diag", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "json" }).click()
    await expect(writeTopicSelect).toHaveText(/^diag\/jsonjson$/)
    await expect(writeTopicContainer.getByTitle(subtopicPickerTitle)).toHaveCount(0)
  })

  test("Subtopics Picker: pick a registered field, or type a freeform JSON path - both concatenate into the stored value", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox").first()
    await readTopicSelect.click()
    await page.getByRole("listbox").getByText("diag", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "json" }).click()

    const subtopicPicker = page.getByTitle("JSON field (optional) - leave empty to bind to the whole payload")
    await subtopicPicker.click()
    await expect(page.getByRole("option", { name: "field1" })).toBeVisible()
    await page.getByRole("option", { name: "field1" }).click()

    await expect(subtopicPicker).toHaveText("field1")
    // The Topic Picker's own trigger reflects the composite value too.
    await expect(readTopicSelect).toContainText("diag/json → field1")

    // Typing an unregistered path works too, no validation blocking it.
    await subtopicPicker.click()
    const input = page.getByPlaceholder("Field path, e.g. temp")
    await input.fill("custom.path[0]")
    await expect(subtopicPicker).toHaveText("custom.path[0]")
    await expect(readTopicSelect).toContainText("diag/json → custom.path[0]")
  })

  test("changing the Topic Picker's selection clears any existing subtopic", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox").first()
    await readTopicSelect.click()
    await page.getByRole("listbox").getByText("diag", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "json" }).click()

    const subtopicPicker = page.getByTitle("JSON field (optional) - leave empty to bind to the whole payload")
    await subtopicPicker.click()
    await page.getByRole("option", { name: "field1" }).click()
    await expect(readTopicSelect).toContainText("diag/json → field1")

    // Switch to a different, non-JSON topic - the composite value must not
    // linger, and the Subtopics Picker must disappear (new topic isn't json).
    await readTopicSelect.click()
    await page.getByRole("listbox").getByText("test", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "switch-mode" }).click()
    await expect(readTopicSelect).toHaveText(/^test\/switch-modetext$/)
    await expect(subtopicPicker).toHaveCount(0)
  })

  test("a topic nested under another topic's path is reachable via the chevron toggle, and the dropdown auto-expands ancestors of the current selection on reopen", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox").first()
    await readTopicSelect.click()
    const listbox = page.getByRole("listbox")
    await listbox.getByText("diag", { exact: true }).click()
    await expect(listbox.getByRole("option", { name: "plain" })).toBeVisible()

    // "diag/plain" is itself a registered leaf topic AND a path-prefix of
    // "diag/plain/nested" - no visible text on the toggle (an accessible
    // name via aria-label instead), just a bare chevron.
    const nestedToggle = listbox.getByRole("button", { name: /Show topics nested under diag\/plain/ })
    await expect(nestedToggle).toBeVisible()
    await nestedToggle.click()
    await listbox.getByRole("option", { name: "nested" }).click()
    await expect(readTopicSelect).toContainText("diag/plain/nested")

    // Reopen the same picker - "diag" and "plain" must already be expanded
    // (ancestors of the current selection), with "nested" visible with no
    // clicking at all this time.
    await readTopicSelect.click()
    await expect(page.getByRole("listbox").getByRole("option", { name: "nested" })).toBeVisible()
  })
})
