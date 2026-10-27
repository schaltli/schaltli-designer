import { test, expect, type Page } from "@playwright/test"
import path from "path"
import { readFile } from "fs/promises"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, objectTreeRow, placingFreely } from "./helpers"
import { ownBroker, useOwnBroker, heardOn, type OwnBroker } from "./own-broker"

// The Topic Picker offers what the designer heard beside the project's
// topics; a heard topic chosen is added, a name nobody sent is added where
// it is typed (docs/2026-10-14-topic-discovery.md, module topic-picker). On
// a broker of this spec's own (e2e/own-broker.ts).

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

type SavedTopic = { topic: string; type: string; examples: string[]; subtopics?: { path: string }[] }
async function savedProject(page: Page): Promise<{ topics: SavedTopic[]; screens: { objects: { id: string; properties: Record<string, unknown> }[] }[] }> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  return JSON.parse(await (await JSZip.loadAsync(await readFile(await download.path()))).file("project.json")!.async("string"))
}
const switchOf = async (page: Page) => (await savedProject(page)).screens[0].objects.find((o) => o.id === "obj-switch-1")!

const field = (page: Page, row: string) => page.locator("label[for]", { hasText: row }).locator("..")
const picker = (page: Page, row: string) => field(page, row).getByRole("combobox").first()
const listbox = (page: Page) => page.getByRole("listbox")
const search = (page: Page) => page.getByRole("textbox", { name: "Search topics" })

test.describe("the Topic Picker and what was heard", () => {
  let own: OwnBroker
  test.beforeEach(async ({ page }) => {
    own = await ownBroker()
    await own.publish("pkw/tele/water/fresh", "64", true)
    await own.publish("pkw/tele/water/grey", "22", true)
    await own.publish("pkw/tele/heater/state", '{"power":"on","target":21}', true)
    await useOwnBroker(page, own.url)
    await loadProject(page, SWITCH_TEST_PROJECT)
    await expect.poll(() => heardOn(page, "pkw/tele/water/grey"), { timeout: 5000 }).not.toBeNull()
    await objectTreeRow(page, "obj-switch-1").click()
  })
  test.afterEach(async () => {
    await own.close()
  })

  test("a fragment opens the tree down to every match, heard or in the project", async ({ page }) => {
    await picker(page, "Read topic").click()
    await search(page).fill("water")
    await expect(listbox(page).getByRole("option", { name: /^fresh/ })).toBeVisible()
    await expect(listbox(page).getByRole("option", { name: /^grey/ })).toBeVisible()
    await expect(listbox(page).getByRole("option", { name: /^state/ })).toHaveCount(0)
    // The project's own topics match too: «switch» finds test/switch-mode and test/switch-cmd.
    await search(page).fill("switch")
    await expect(listbox(page).getByRole("option", { name: /^switch-mode/ })).toBeVisible()
    await expect(listbox(page).getByRole("option", { name: /^switch-cmd/ })).toBeVisible()
  })

  test("«Project only» shows the project's topics alone", async ({ page }) => {
    await picker(page, "Read topic").click()
    await expect(listbox(page).getByText("pkw", { exact: true })).toBeVisible()
    await page.getByRole("radio", { name: /^Project only/ }).click()
    await expect(listbox(page).getByText("pkw", { exact: true })).toHaveCount(0)
    await expect(listbox(page).getByText("test", { exact: true })).toBeVisible()
  })

  test("a heard topic chosen to read is added with its type and what was heard, bound, and one undo takes both back", async ({ page }) => {
    await picker(page, "Read topic").click()
    await search(page).fill("fresh")
    await listbox(page).getByRole("option", { name: /^fresh/ }).click()
    await expect(picker(page, "Read topic")).toContainText("pkw/tele/water/fresh")
    let saved = await savedProject(page)
    expect(saved.topics.find((t) => t.topic === "pkw/tele/water/fresh")).toMatchObject({ type: "numeric", examples: ["64"] })
    expect(saved.screens[0].objects.find((o) => o.id === "obj-switch-1")!.properties.topic).toBe("pkw/tele/water/fresh")

    await page.keyboard.press("Escape")
    await page.keyboard.press("ControlOrMeta+z")
    saved = await savedProject(page)
    expect(saved.topics.find((t) => t.topic === "pkw/tele/water/fresh")).toBeUndefined()
    expect(saved.screens[0].objects.find((o) => o.id === "obj-switch-1")!.properties.topic).toBe("test/switch-mode")
  })

  test("a heard JSON topic brings its fields; chosen to write, no examples", async ({ page }) => {
    await picker(page, "Write topic").click()
    await search(page).fill("heater")
    await listbox(page).getByRole("option", { name: /^state/ }).click()
    const saved = await savedProject(page)
    expect(saved.topics.find((t) => t.topic === "pkw/tele/heater/state")).toMatchObject({ type: "json", examples: [] })
    expect(saved.topics.find((t) => t.topic === "pkw/tele/heater/state")!.subtopics!.map((s) => s.path)).toEqual(["power", "target"])
    expect((await switchOf(page)).properties.writeTopic).toBe("pkw/tele/heater/state")
  })

  test("a name nobody sent is added where it is typed, without examples, and bound", async ({ page }) => {
    await picker(page, "Read topic").click()
    await search(page).fill("pkw/tele/tank/black")
    await expect(listbox(page)).toContainText("No topic heard or in the project matches «pkw/tele/tank/black».")
    await expect(page.getByText("Add topic «pkw/tele/tank/black»")).toBeVisible()
    await page.getByRole("button", { name: "Add as text" }).click()
    await expect(picker(page, "Read topic")).toContainText("pkw/tele/tank/black")
    const saved = await savedProject(page)
    expect(saved.topics.find((t) => t.topic === "pkw/tele/tank/black")).toMatchObject({ type: "text", examples: [] })
  })

  test("a name with a wildcard or a space is not offered to add", async ({ page }) => {
    await picker(page, "Read topic").click()
    await search(page).fill("pkw/#")
    await expect(page.getByText(/^Add topic/)).toHaveCount(0)
    await search(page).fill("pkw tank")
    await expect(page.getByText(/^Add topic/)).toHaveCount(0)
  })
})

// An older project can hold a topic without a type, or with "number": the
// picker opened on one crashed (reported by the user, 2026-10-14).
test("a project topic without a type, or typed \"number\", is listed and chosen", async ({ page }, testInfo) => {
  const zip = await JSZip.loadAsync(await readFile(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  delete project.topics.find((t: { topic: string }) => t.topic === "test/switch-cmd").type
  project.topics.push({ id: "topic_old_number", topic: "test/old-number", type: "number", examples: ["3"] })
  zip.file("project.json", JSON.stringify(project))
  const old = testInfo.outputPath("old-types.zip")
  const { writeFile } = await import("fs/promises")
  await writeFile(old, await zip.generateAsync({ type: "nodebuffer" }))
  await loadProject(page, old)
  await objectTreeRow(page, "obj-switch-1").click()
  await picker(page, "Read topic").click()
  await search(page).fill("test/")
  await expect(listbox(page).getByRole("option", { name: /^switch-cmd/ })).toBeVisible()
  await listbox(page).getByRole("option", { name: /^old-number/ }).click()
  await expect(picker(page, "Read topic")).toContainText("test/old-number")
})

// The `{` search of a text offers the heard topics after the project's;
// picking one adds it (topic-picker, decision 6).
test.describe("the value search of a text and what was heard", () => {
  let own: OwnBroker
  test.beforeEach(async ({ page }) => {
    own = await ownBroker()
    await own.publish("pkw/tele/water/fresh", "64", true)
    await useOwnBroker(page, own.url)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await expect.poll(() => heardOn(page, "pkw/tele/water/fresh"), { timeout: 5000 }).not.toBeNull()
  })
  test.afterEach(async () => {
    await own.close()
  })

  test("«water/fresh» offers the heard topic under its own heading; picked, it is added and read", async ({ page }) => {
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 200)
    const to = devicePoint(box, 220, 224)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await placingFreely(page, async () => {
      await page.mouse.move(to.x, to.y, { steps: 5 })
      await page.mouse.up()
    })
    await expect(page.locator("#text")).toBeFocused()
    await page.keyboard.type("Tank ")
    await page.keyboard.type("{")
    await expect(page.getByTestId("live-value-search")).toBeFocused()
    // «fresh» alone finds the project's Freshwater/Level first.
    await page.keyboard.type("water/fresh")
    const heardGroup = page.getByTestId("placeholder-picker").getByRole("group", { name: "Heard on the broker" })
    await expect(heardGroup.getByRole("option", { name: /pkw\/tele\/water\/fresh/ })).toBeVisible()
    await page.keyboard.press("Enter")

    const saved = await savedProject(page)
    expect(saved.topics.find((t) => t.topic === "pkw/tele/water/fresh")).toMatchObject({ type: "numeric", examples: ["64"] })
  })
})
