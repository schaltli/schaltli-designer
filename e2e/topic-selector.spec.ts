import { test, expect } from "@playwright/test"
import { loadProject, objectTreeRow } from "./helpers"
import path from "path"

// Covers components/property-panel/topic-selector.tsx's tree-rendering
// logic directly (independent of any one object type), using the Switch
// fixture purely as a vehicle: its Read Topic (allowSubtopics default
// true) and Write Topic (allowSubtopics=false, switch-properties.tsx)
// conveniently give one screen both picker modes to exercise side by side.
// The fixture's own diag/* topics exist only for this file - not bound to
// anything on the Switch object, so they don't affect switch-render.spec.ts.
//
// Background (2026-08-14 session): buildTopicTree()/renderTreeNodes() used
// to pick exactly one of three render branches per tree node (JSON-with-
// subtopics header / plain SelectItem / abstract non-leaf header), and
// none of them checked for a node ALSO having real nested topics under its
// own path - so a topic that was itself a leaf (plain, or JSON with
// subtopics) silently hid any topic registered underneath its own path,
// with no way to reach it in the UI. Fixed by decoupling "is this node
// itself selectable" from "does it have children", and separately, adding
// an allowSubtopics prop so a publish/command destination (which can only
// ever target a whole topic, never a virtual "topic#field" path) renders a
// JSON topic as one plain pick instead of offering its fields.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test.describe("TopicSelector tree rendering", () => {
  test("a topic nested under another registered topic's path is reachable, not silently hidden", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox")
    await readTopicSelect.click()

    const listbox = page.getByRole("listbox")
    await listbox.getByText("diag", { exact: true }).click()
    // Not exact: an option's accessible name is its whole row's text, i.e.
    // the label plus its trailing type badge concatenated together (e.g.
    // "plain" + "text" badge = "plaintext") - exact matching against just
    // the label would never match.
    await expect(listbox.getByRole("option", { name: "plain" })).toBeVisible()

    // "diag/plain" is itself a registered leaf topic AND a path-prefix of
    // "diag/plain/nested" - the nested one must still be reachable via its
    // own toggle row underneath, not hidden just because its parent path
    // happens to also be a real topic.
    const nestedToggle = listbox.getByText("1 nested topic", { exact: true })
    await expect(nestedToggle).toBeVisible()
    await nestedToggle.click()
    await expect(listbox.getByRole("option", { name: "nested" })).toBeVisible()

    await listbox.getByRole("option", { name: "nested" }).click()
    await expect(readTopicSelect).toContainText("diag/plain/nested")
  })

  test("a JSON topic's fields are '#'-prefixed and coexist with a real nested topic under the same path", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const readTopicSelect = page.locator("label", { hasText: "Read Topic" }).locator("..").getByRole("combobox")
    await readTopicSelect.click()

    const listbox = page.getByRole("listbox")
    await listbox.getByText("diag", { exact: true }).click()
    // "diag/json" is a JSON topic - its own row is a "pick a field" header,
    // not directly selectable, unlike the plain "diag/plain" topic above.
    // It's a plain <div> (not a SelectItem/option), and its name span and
    // its "json" type badge span both literally read "json" - getByText
    // would hit both, so target the header row itself structurally instead.
    await listbox.locator("div.cursor-pointer", { hasText: "json" }).click()

    // Both of the JSON payload's own fields (composite "topic#path" values,
    // shown "#"-prefixed) and the separately-registered real nested topic
    // "diag/json/nested" appear together under this one shared toggle - no
    // second click needed, and the "#" makes the field entries visually
    // distinct from a same-depth real topic even if they were same-named.
    await expect(listbox.getByRole("option", { name: "#field1" })).toBeVisible()
    await expect(listbox.getByRole("option", { name: "#field2" })).toBeVisible()
    await expect(listbox.getByRole("option", { name: "nested" })).toBeVisible()

    await listbox.getByRole("option", { name: "#field1" }).click()
    await expect(readTopicSelect).toContainText("diag/json → field1")
  })

  test("write topic (allowSubtopics=false) renders a JSON topic as one plain pick, never its fields", async ({
    page,
  }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()

    const writeTopicSelect = page.locator("label", { hasText: "Write Topic" }).locator("..").getByRole("combobox")
    await writeTopicSelect.click()

    const listbox = page.getByRole("listbox")
    await listbox.getByText("diag", { exact: true }).click()

    // "diag/json" is directly selectable here (a publish destination can
    // only ever be a whole topic) - no expand affordance, no "#field"
    // entries, unlike Read Topic's dropdown above.
    await expect(listbox.getByRole("option", { name: "json" })).toBeVisible()
    await expect(listbox.getByRole("option", { name: "#field1" })).toHaveCount(0)
    await expect(listbox.getByRole("option", { name: "#field2" })).toHaveCount(0)

    await listbox.getByRole("option", { name: "json" }).click()
    await expect(writeTopicSelect).toContainText("diag/json")
  })
})
