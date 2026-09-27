import { test, expect } from "@playwright/test"
import { askedValueAnswered, LEVEL_AWAIT_MS, sameLevel } from "../lib/asked-value"
import { shownLevelValue } from "../components/canvas/renderers/render-level-indicator"
import type { ScreenObject } from "../components/project-editor"

// When an answer from the installation ends what a hand asked for in the
// preview, and what a level shows meanwhile (2026-09-27). The devices keep the
// same rules; these are the pure halves the editor and the renderers use.

test.describe("a request in the preview", () => {
  const now = 1_000_000

  test("under the hand, no answer ends it", () => {
    const held = { value: "70", seen: "10", holding: true }
    expect(askedValueAnswered(held, "40", now)).toBe(false)
    expect(askedValueAnswered(held, "70", now)).toBe(false)
  })

  test("released, only the answer to its own value ends it - or the wait running out", () => {
    const held = { value: "70", seen: "10", awaitUntil: now + LEVEL_AWAIT_MS }
    // An answer to a value the drag passed through: still on its way, set aside.
    expect(askedValueAnswered(held, "40", now + 100)).toBe(false)
    // The answer to the value it was released on, however it is written.
    expect(askedValueAnswered(held, "70", now + 100)).toBe(true)
    expect(askedValueAnswered(held, "70.0", now + 100)).toBe(true)
    // Nothing of the kind within the wait: the installation's word wins.
    expect(askedValueAnswered(held, "40", now + LEVEL_AWAIT_MS)).toBe(true)
  })

  test("a Switch's request ends on any answer that is not a repeat", () => {
    const held = { value: "on", seen: "off" }
    expect(askedValueAnswered(held, "off", now)).toBe(false)
    expect(askedValueAnswered(held, "on", now)).toBe(true)
  })

  test("the same level, whichever way it is written", () => {
    expect(sameLevel("40", "40.0")).toBe(true)
    expect(sameLevel("40", "41")).toBe(false)
    expect(sameLevel(undefined, "40")).toBe(false)
  })
})

test.describe("what a level shows", () => {
  const reported: Record<string, string> = { "dimmer/level": "10", "heater/temp": "17", "heater/target": "21" }
  const asked: Record<string, string> = { "dimmer/level": "70", "heater/target": "25" }
  const get = (map: Record<string, string>) => (topic: string | undefined) => (topic ? map[topic] ?? "" : "")
  const level = (properties: Record<string, unknown>) => ({ id: "l", type: "level-indicator", properties }) as unknown as ScreenObject

  test("the dimmer pattern: the finger, while it asks", () => {
    const dimmer = level({ topic: "dimmer/level", writeTopic: "dimmer/cmd" })
    expect(shownLevelValue(dimmer, get(reported), get(asked))).toBe("70")
    expect(shownLevelValue(dimmer, get(reported), get({}))).toBe("10")
  })

  test("the heater pattern and a read-only gauge: the report", () => {
    const heater = level({ topic: "heater/temp", setpointTopic: "heater/target", writeTopic: "heater/cmd" })
    expect(shownLevelValue(heater, get(reported), get(asked))).toBe("17")
    const gauge = level({ topic: "dimmer/level" })
    expect(shownLevelValue(gauge, get(reported), get(asked))).toBe("10")
  })
})
