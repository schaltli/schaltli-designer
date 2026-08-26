import { test, expect } from "@playwright/test"
import { loadProject, objectTreeRow } from "./helpers"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
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

// A copy of the fixture with one destination pointed at a topic the project
// does not register. Not something the current UI can produce - which is
// exactly why it needs building by hand: until 2026-08-14 a publish
// destination was a free-text field, so every project older than that can
// hold one, and a real one recovered on 2026-08-25 held six.
async function projectWithUnregisteredWriteTopic(topic: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  for (const screen of project.screens || []) {
    for (const obj of screen.objects || []) {
      if (obj.type === "Switch") obj.properties.writeTopic = topic
    }
  }
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `unregistered-topic-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

test.describe("TopicSelector + SubtopicPicker", () => {
  // Regression test for a 2026-08-25 finding: a bound topic that is not one
  // of the project's registered topics rendered as "No topic selected" -
  // the interface reporting "nothing here" about a value that is stored,
  // exported, and working on the device.
  //
  // The damage is not only confusion. An empty-looking field invites being
  // filled in, and picking anything from the list silently replaces a value
  // the user was never shown; or the field reads as "this button is not
  // wired up" and the hunt for the fault moves to the firmware. Found
  // exactly that way - a knob that published correctly for weeks while its
  // panel showed an empty topic.
  test("a bound topic the project does not register is shown, not hidden", async ({ page }) => {
    const UNREGISTERED = "legacy/cmnd/light"
    const zipPath = await projectWithUnregisteredWriteTopic(UNREGISTERED)
    try {
      await loadProject(page, zipPath)
      await objectTreeRow(page, "obj-switch-1").click()

      const writeTopicField = page.locator("label", { hasText: "Write Topic" }).locator("..")

      // The stored value verbatim, flagged rather than swallowed.
      await expect(writeTopicField.getByRole("combobox").first()).toContainText(UNREGISTERED)
      await expect(writeTopicField.getByText("unregistered")).toBeVisible()
      await expect(writeTopicField.getByText(/bound but not registered/i)).toBeVisible()

      // And the flag does not fire for a topic that IS registered - the read
      // topic beside it is bound to one of the project's own.
      const readTopicField = page.locator("label", { hasText: "Read Topic" }).locator("..")
      await expect(readTopicField.getByRole("combobox").first()).toContainText("test/switch-mode")
      await expect(readTopicField.getByText("unregistered")).toHaveCount(0)

      // Editing something else must leave it alone. The panel keeps the
      // value in its own state and writes it back on every save, so a state
      // label edit passes straight through it - but that is precisely the
      // path that would quietly blank the field if it ever stopped doing so,
      // and nobody would see the loss until the device went quiet.
      const labelInputs = page.locator('input[placeholder="Display text"]')
      await labelInputs.nth(0).fill("Aus")
      await expect(labelInputs.nth(0)).toHaveValue("Aus")
      await expect(writeTopicField.getByRole("combobox").first()).toContainText(UNREGISTERED)
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  // topics[].mock (2026-08-25) - what a mock host answers when this topic
  // receives a command, edited in the topic form beside Examples. It exists
  // for what the project cannot describe on its own: a SoftwareButton's
  // send-mqtt action, and a rotary encoder publishing "up" at a dimmer,
  // which is arithmetic rather than a mapping. Its effect is covered
  // against the real script in mock-simulator.spec.ts; this checks the half
  // that gets it into the file at all, because a rule that does not survive
  // Save is a rule nobody will ever find missing.
  test("a mock response survives the topic form and lands in the exported project", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)

    await page.getByRole("button", { name: "Settings" }).click()
    // The dialog opens on another section - Topics is one of its tabs.
    await page.getByText("Topics", { exact: true }).first().click()
    await page.getByRole("button", { name: "Add Topic" }).click()

    await page.getByPlaceholder("e.g., sensor/temperature").fill("cmd/dimmer")

    const rules = page.getByTestId("mock-rules")
    await rules.getByRole("button", { name: "+ Add Mock Response" }).click()
    await rules.getByPlaceholder("e.g. up").fill("up")
    await rules.getByRole("button", { name: "+ Add Effect" }).click()
    await rules.getByPlaceholder("state topic").fill("state/dimmer")

    // "change by" rather than "set to": the whole reason a rule is more than
    // a lookup table is that a knob moves a value it does not know.
    await rules.getByRole("combobox").click()
    await page.getByRole("option", { name: "change by" }).click()
    await rules.getByPlaceholder("e.g. 10 or -10").fill("10")
    await rules.getByPlaceholder("min").fill("0")
    await rules.getByPlaceholder("max").fill("100")

    // The sub-dialog's own save button is labelled "Add Topic" too - the
    // last one on the page is the one inside it.
    await page.getByRole("button", { name: "Add Topic", exact: true }).last().click()

    // Reopen it: the round trip through save and back into the form is
    // where a field that was never wired to the model shows up as an empty
    // editor over data that is actually there.
    // The new topic is appended to the list, so its row is the last one -
    // and each row carries its own Edit button.
    await page.getByRole("button", { name: "Edit" }).last().click()
    const reopened = page.getByTestId("mock-rules")
    await expect(reopened.getByPlaceholder("e.g. up")).toHaveValue("up")
    await expect(reopened.getByPlaceholder("state topic")).toHaveValue("state/dimmer")
    await expect(reopened.getByPlaceholder("e.g. 10 or -10")).toHaveValue("10")
    await expect(reopened.getByPlaceholder("min")).toHaveValue("0")
    await expect(reopened.getByPlaceholder("max")).toHaveValue("100")
  })

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

  // Regression test for a 2026-08-14 request: the Topic Picker and
  // Subtopics Picker sit side by side and must be the same height and
  // vertically aligned. They were 4px off (36px vs 32px) - the Topic
  // Picker is a shadcn SelectTrigger, which (unlike a plain Button) reads
  // its height from a `size` prop via data-[size=sm]:h-8 /
  // data-[size=default]:h-9, a data-attribute-scoped selector twMerge
  // doesn't treat as conflicting with a bare `h-8` className, so the
  // className alone lost the cascade to the (default) h-9 rule. Fixed by
  // passing size="sm" explicitly. This same root cause affects 15 other
  // SelectTrigger instances across 8 other property-panel files (all
  // intending 32px via a bare h-8 className, silently rendering at 36px) -
  // out of scope for this fix, not covered here.
  test("Topic Picker and Subtopics Picker are the same height and vertically aligned", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicContainer = page.locator("label", { hasText: "Read Topic" }).locator("..")
    const readTopicSelect = readTopicContainer.getByRole("combobox").first()
    await readTopicSelect.click()
    await page.getByRole("listbox").getByText("diag", { exact: true }).click()
    await page.getByRole("listbox").getByRole("option", { name: "json" }).click()

    const subtopicPicker = readTopicContainer.getByTitle(
      "JSON field (optional) - leave empty to bind to the whole payload",
    )
    const topicBox = await readTopicSelect.boundingBox()
    const subtopicBox = await subtopicPicker.boundingBox()
    expect(topicBox).not.toBeNull()
    expect(subtopicBox).not.toBeNull()
    expect(topicBox!.height).toBe(subtopicBox!.height)
    expect(topicBox!.y).toBe(subtopicBox!.y)
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
