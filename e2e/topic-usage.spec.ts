import { test, expect } from "@playwright/test"
import path from "path"
import { unusedTopics, usedTopics } from "../lib/topic-usage"
import { loadProject } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// «Remove unused topics» (Settings › Topics, lib/topic-usage.ts). Tester
// Arno, 2026-10-09: «Discover MQTT Topics» had every topic it found selected,
// «Add Selected Topics» took 293 into his project, and the only way out was
// a Delete button per topic.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

test("a topic counts as used wherever the project names it", () => {
  const project = {
    topics: ["bound", "written", "field", "action", "hw", "placeholder", "live", "combined", "screen-icon", "mocked", "mock-cmd", "nobody"].map((t) => ({ topic: t })),
    screens: [
      {
        id: "s",
        iconLive: { id: "i", source: { namespace: "topic", path: "screen-icon" }, rules: [] },
        buttonActions: { "swipe-up": { type: "send-mqtt", topic: "action", payload: "x" } },
        objects: [
          { id: "a", type: "switch", properties: { topic: "bound", writeTopic: "written" } },
          {
            id: "g",
            type: "group",
            properties: {},
            children: [
              { id: "b", type: "text", properties: { text: "T {topic:placeholder:F1}" } },
              { id: "c", type: "text", properties: { text: "{live:v}", liveValues: [{ id: "v", source: { namespace: "topic", path: "live#temp" }, rules: [] }] } },
              { id: "d", type: "bar", properties: { topic: "field#a.b" } },
              { id: "e", type: "button", properties: { action: { type: "send-mqtt", topic: "mock-cmd", payload: "on" } } },
            ],
          },
        ],
      },
    ],
    hardwareButtons: [{ id: "knob", action: { type: "send-mqtt", topic: "hw" } }],
    combinedTopics: [{ id: "c", name: "c", mode: "all", conditions: [{ source: { namespace: "topic", path: "combined" }, op: "yes" }] }],
  }
  ;(project.topics.find((t) => t.topic === "mock-cmd") as any).mock = [{ id: "m", when: "on", then: [{ id: "e", topic: "mocked", kind: "set", value: "on" }] }]
  const used = usedTopics(project)
  for (const t of ["bound", "written", "field", "action", "hw", "placeholder", "live", "combined", "screen-icon", "mocked", "mock-cmd"]) {
    expect(used.has(t), t).toBe(true)
  }
  expect(unusedTopics(project).map((t) => t.topic)).toEqual(["nobody"])
})

test.describe("Remove unused topics", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("takes out every topic nothing uses, in one go, and Ctrl+Z brings them back", async ({ page }) => {
    // The switch fixture binds test/switch-mode and writes test/switch-cmd;
    // its four diag/ topics are bound to nothing.
    await loadProject(page, SWITCH_TEST_PROJECT)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("diag/plain", { exact: true })).toBeVisible()

    await dialog.getByRole("button", { name: "Remove unused topics (4)" }).click()
    await expect(page.getByText("Removed 4 unused topics").first()).toBeVisible()
    for (const gone of ["diag/plain", "diag/plain/nested", "diag/json", "diag/json/nested"]) {
      await expect(dialog.getByText(gone, { exact: true })).toHaveCount(0)
    }
    await expect(dialog.getByText("test/switch-mode", { exact: true })).toBeVisible()
    await expect(dialog.getByText("test/switch-cmd", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Remove unused topics" })).toBeDisabled()

    // Undone with the dialog still open, as a deleted topic is (undo.spec.ts).
    await page.keyboard.press("ControlOrMeta+z")
    await expect(dialog.getByText("diag/plain", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Remove unused topics (4)" })).toBeEnabled()
  })
})
