import { test, expect } from "@playwright/test"
import { screenTopics, combinationCount, combinationOverrides } from "../hil/combinations"

// hil/combinations.js on its own - no broker, no device, no zip.
//
// This module decides what a HIL run publishes, and until 2026-08-26 nothing
// tested it at all. That matters more than it looks: when it drops a binding,
// the run does not fail. It publishes nothing for that topic, the device keeps
// whatever the broker last held, the designer renders the topic's first
// example instead, and the difference surfaces as a steady pixel diff that
// reads as a rendering bug. The module's own header records two rounds of
// exactly that - a nested tab-control child (2026-07-25) and an arc-level's
// setpointTopic (2026-08-23) - each found on hardware, months apart, by
// someone puzzling over a diff.
//
// So the cases below are not about the happy path; they are the three ways a
// binding has been lost so far, pinned here where they cost seconds instead of
// a bench session.
//
// Pure functions, so this needs a browser only because the suite runs in one.

const topic = (name: string, examples: string[], type = "text") => ({ id: `t-${name}`, topic: name, type, examples })

const project = (topics: any[], objects: any[]) => ({
  name: "combinations",
  topics,
  screens: [{ id: "s1", name: "S1", objects }],
})

const screenOf = (p: any) => p.screens[0]

test.describe("hil combination generation", () => {
  test("a plain binding drives one combination per example", () => {
    const p = project(
      [topic("hil-test/level", ["0", "37", "100"], "numeric")],
      [{ id: "o1", type: "level-indicator", properties: { topic: "hil-test/level" } }],
    )

    expect(screenTopics(p, screenOf(p))).toEqual(["hil-test/level"])
    expect(combinationCount(p, screenOf(p))).toBe(3)
    expect(combinationOverrides(p, screenOf(p), 1)).toEqual({ "hil-test/level": "37" })
  })

  // The 2026-08-26 case, and the reason this file exists. A JSON-bound object
  // stores "<topic>#<path>"; what gets published is the whole payload on the
  // bare topic. Before the split, the composite matched no registered topic,
  // so this screen ran ONE combination and published NOTHING - the marker on
  // a JSON-bound Switch never moved, and the run still reported success.
  test("a JSON path binding resolves to its base topic and still publishes", () => {
    const p = project(
      [
        {
          id: "t-doorman",
          topic: "hil-test/doorman",
          type: "json",
          examples: ['{"locked":true,"stateText":"LOCKED"}', '{"locked":false,"stateText":"UNLOCKED"}'],
          subtopics: [
            { id: "sub-locked", path: "locked", type: "text" },
            { id: "sub-statetext", path: "stateText", type: "text" },
          ],
        },
      ],
      [
        { id: "sw", type: "Switch", properties: { topic: "hil-test/doorman#stateText" } },
        { id: "fld", type: "MqttDataField", properties: { topic: "hil-test/doorman#locked" } },
      ],
    )

    // Two bindings into one payload collapse to one publishable topic.
    expect(screenTopics(p, screenOf(p))).toEqual(["hil-test/doorman"])
    expect(combinationCount(p, screenOf(p))).toBe(2)
    expect(combinationOverrides(p, screenOf(p), 0)).toEqual({
      "hil-test/doorman": '{"locked":true,"stateText":"LOCKED"}',
    })
    expect(combinationOverrides(p, screenOf(p), 1)).toEqual({
      "hil-test/doorman": '{"locked":false,"stateText":"UNLOCKED"}',
    })
  })

  // The 2026-08-23 case: an arc-level carries two bindings, and only the first
  // used to be collected.
  test("a second binding on one object is published too", () => {
    const p = project(
      [topic("hil-test/level", ["0", "100"], "numeric"), topic("hil-test/setpoint", ["50"], "numeric")],
      [{ id: "arc", type: "arc-level", properties: { topic: "hil-test/level", setpointTopic: "hil-test/setpoint" } }],
    )

    expect(screenTopics(p, screenOf(p)).sort()).toEqual(["hil-test/level", "hil-test/setpoint"])
    expect(combinationOverrides(p, screenOf(p), 0)).toEqual({
      "hil-test/level": "0",
      "hil-test/setpoint": "50",
    })
  })

  // The 2026-07-25 case: a binding that lives only on a nested child.
  test("a binding nested inside a container is published too", () => {
    const p = project(
      [topic("hil-test/tab", ["a", "b"]), topic("hil-test/nested", ["1", "2", "3"], "numeric")],
      [
        {
          id: "tabs",
          type: "tab-control",
          properties: { topic: "hil-test/tab" },
          children: [
            {
              id: "panel",
              type: "panel",
              properties: {},
              children: [{ id: "deep", type: "level-indicator", properties: { topic: "hil-test/nested" } }],
            },
          ],
        },
      ],
    )

    expect(screenTopics(p, screenOf(p)).sort()).toEqual(["hil-test/nested", "hil-test/tab"])
    // The count follows the topic with the most examples, wrapping the other.
    expect(combinationCount(p, screenOf(p))).toBe(3)
    expect(combinationOverrides(p, screenOf(p), 2)).toEqual({
      "hil-test/tab": "a",
      "hil-test/nested": "3",
    })
  })

  test("a screen that binds nothing still runs once", () => {
    const p = project([], [{ id: "lbl", type: "label", properties: { text: "static" } }])

    expect(combinationCount(p, screenOf(p))).toBe(1)
    expect(combinationOverrides(p, screenOf(p), 0)).toEqual({})
  })
})
