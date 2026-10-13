import { test, expect } from "@playwright/test"
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
