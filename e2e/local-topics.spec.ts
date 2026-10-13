import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import path from "path"
import { loadProject, objectTreeRow } from "./helpers"
import { isLocalTopic, localInitialValues } from "../lib/local-topics"
import { projectSubscriptionTopics } from "../lib/render-screen"

// Local topics (docs/2026-10-13-local-topics.md; tasks/local-designer-todo.md):
// a topic declared with `local: true` is the display's own - never
// published, never subscribed, starting at its `initial`.

const topics = [
  { id: "t1", topic: "local/energie/view", type: "text", examples: ["flow", "sankey"], local: true, initial: "flow" },
  { id: "t2", topic: "local/blank", type: "text", examples: [], local: true },
  { id: "t3", topic: "van/battery", type: "json", examples: [] },
  // A real topic whose name merely looks local: the declaration decides.
  { id: "t4", topic: "local/real", type: "text", examples: [] },
] as any[]

test.describe("local topics: the core", () => {
  test("the declaration decides, not the name", () => {
    expect(isLocalTopic(topics, "local/energie/view")).toBe(true)
    expect(isLocalTopic(topics, "local/blank#a.b")).toBe(true)
    expect(isLocalTopic(topics, "local/real")).toBe(false)
    expect(isLocalTopic(topics, "local/undeclared")).toBe(false)
    expect(isLocalTopic(topics, "van/battery")).toBe(false)
    expect(isLocalTopic(undefined, "local/energie/view")).toBe(false)
    expect(isLocalTopic(topics, "")).toBe(false)
  })

  test("each starts at its initial value, where it has one", () => {
    expect(localInitialValues(topics)).toEqual({ "local/energie/view": "flow" })
  })

  test("a local topic is never subscribed, also where an object reads it", () => {
    const project = {
      topics,
      screens: [
        {
          objects: [
            { id: "s", type: "switch", properties: { topic: "local/energie/view" } },
            { id: "p", type: "panel", properties: {}, children: [{ id: "b", type: "text", properties: { topic: "van/battery#soc" } }] },
            { id: "r", type: "text", properties: { topic: "local/real" } },
          ],
        },
      ],
    } as any
    const subscribed = projectSubscriptionTopics(project)
    expect(subscribed).not.toContain("local/energie/view")
    expect(subscribed).not.toContain("local/blank")
    expect(subscribed).toContain("van/battery")
    expect(subscribed).toContain("local/real")
  })
})

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

async function openTopics(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Topics", exact: true }).click()
}

// L3: a list of their own in Project Settings › Topics, below the combined
// topics; in the project they stay in topics[] with local: true.
test.describe("local topics: the list", () => {
  test("added, named, given an initial value and deleted in their own list", async ({ page }) => {
    await loadProject(page, SWITCH_TEST_PROJECT)
    await openTopics(page)
    const dialog = page.getByRole("dialog")
    const before = await dialog.getByText("test/switch-mode", { exact: true }).count()

    await dialog.getByRole("button", { name: "Add local topic" }).click()
    const card = page.getByTestId("local-topic")
    await expect(card).toHaveCount(1)
    await expect(card.getByLabel("Local topic name")).toHaveValue("local/topic1")

    // A name another topic has is refused, and the old one comes back.
    await card.getByLabel("Local topic name").fill("test/switch-mode")
    await expect(card.getByText("There is a topic «test/switch-mode» already.")).toBeVisible()
    await card.getByLabel("Local topic name").press("Enter")
    await expect(card.getByLabel("Local topic name")).toHaveValue("local/topic1")

    await card.getByLabel("Local topic name").fill("local/energie/view")
    await card.getByLabel("Local topic name").press("Enter")
    await card.getByLabel("Initial value").fill("flow")
    // It is not listed among the MQTT topics above.
    expect(await dialog.getByText("test/switch-mode", { exact: true }).count()).toBe(before)
    await expect(page.getByTestId("local-topics").getByText("No topics configured yet")).toHaveCount(0)
    await page.keyboard.press("Escape")

    const project = await downloadProjectJson(page)
    const view = project.topics.find((t: any) => t.topic === "local/energie/view")
    expect(view).toMatchObject({ local: true, initial: "flow", type: "text", examples: ["flow"] })

    // A topic picker offers it as any topic.
    await objectTreeRow(page, "obj-switch-1").click()
    const readTopicField = page.locator("[data-row-label]", { hasText: "Read topic" }).locator("..")
    await readTopicField.getByRole("combobox").first().click()
    // The picker is a tree of the names' segments.
    await expect(page.getByText("local", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")

    await openTopics(page)
    await page.getByTestId("local-topic").getByRole("button", { name: "Delete" }).click()
    await expect(page.getByTestId("local-topic")).toHaveCount(0)
    await page.keyboard.press("Escape")
    expect((await downloadProjectJson(page)).topics.some((t: any) => t.local)).toBe(false)
  })
})
