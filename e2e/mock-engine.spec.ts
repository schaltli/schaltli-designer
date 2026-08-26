import { test, expect } from "@playwright/test"
import { buildMockEngine } from "../lib/mock-engine"

// lib/mock-engine.js on its own - no broker, no process, no zip.
//
// mock-simulator.spec.ts already drives the same decisions through the real
// CLI and a real broker, and that test is the one that proves an answer
// actually reaches the wire. This file exists because the engine is about to
// get a second caller that has no wire at all: the designer's preview, where
// a Switch tap today does nothing and a SoftwareButton's send-mqtt writes to
// a command topic no object on screen reads. Both callers have to make the
// same decisions, so the decisions are pinned here, where neither caller's
// plumbing can hide a difference.
//
// Pure functions, so this needs a browser only because the suite runs in one.

const project = (topics: any[], objects: any[] = []) => ({
  name: "engine",
  topics,
  screens: [{ id: "s1", name: "S1", objects }],
})

const switchObject = (id: string, readTopic: string, writeTopic: string, states: any[]) => ({
  id,
  type: "Switch",
  properties: { topic: readTopic, writeTopic, states },
})

test.describe("mock engine", () => {
  test("derives a Switch's round trip and answers it", () => {
    const engine = buildMockEngine(
      project(
        [],
        [
          switchObject("sw", "state/a", "cmd/a", [
            { id: "s0", label: "AUS", readValue: "0", writeValue: "aus" },
            { id: "s1", label: "AN", readValue: "1", writeValue: "an" },
          ]),
        ],
      ),
    )

    expect(engine.commandTopics).toEqual(["cmd/a"])
    expect(engine.respond("cmd/a", "an", {})).toEqual([{ topic: "state/a", value: "1" }])
    expect(engine.respond("cmd/a", "aus", {})).toEqual([{ topic: "state/a", value: "0" }])
    // A payload no state claims is not an error, it is simply not ours.
    expect(engine.respond("cmd/a", "vielleicht", {})).toEqual([])
    expect(engine.seed()).toEqual([{ topic: "state/a", value: "0" }])
  })

  test("an add effect accumulates from the value it is given and clamps", () => {
    const engine = buildMockEngine(
      project([
        {
          id: "t",
          topic: "cmd/dim",
          type: "text",
          mock: [
            { id: "r", when: "up", then: [{ id: "e", topic: "state/dim", kind: "add", value: "10", min: "0", max: "30" }] },
          ],
        },
      ]),
    )

    expect(engine.respond("cmd/dim", "up", { "state/dim": "10" })).toEqual([{ topic: "state/dim", value: "20" }])
    expect(engine.respond("cmd/dim", "up", { "state/dim": "25" })).toEqual([{ topic: "state/dim", value: "30" }])
    // An unknown topic starts at its lower bound: the first turn of a knob
    // has to do something visible, or the mock looks like it is not running.
    expect(engine.respond("cmd/dim", "up", {})).toEqual([{ topic: "state/dim", value: "10" }])
    // And a value that is not a number is treated as unknown rather than
    // producing NaN - a state topic can legitimately carry text.
    expect(engine.respond("cmd/dim", "up", { "state/dim": "hell" })).toEqual([{ topic: "state/dim", value: "10" }])
  })

  test("respond is pure - asking twice never advances anything", () => {
    const engine = buildMockEngine(
      project([
        {
          id: "t",
          topic: "cmd/dim",
          type: "text",
          mock: [{ id: "r", when: "up", then: [{ id: "e", topic: "state/dim", kind: "add", value: "5" }] }],
        },
      ]),
    )

    const values = { "state/dim": "10" }
    // The CLI asks once to decide whether to answer at all and again when the
    // --delay timer fires; the preview will ask while rendering. Any of that
    // silently double-counting would be a dimmer that jumps two steps per
    // detent, which looks like a hardware fault.
    expect(engine.respond("cmd/dim", "up", values)).toEqual([{ topic: "state/dim", value: "15" }])
    expect(engine.respond("cmd/dim", "up", values)).toEqual([{ topic: "state/dim", value: "15" }])
    expect(values).toEqual({ "state/dim": "10" })
  })

  test("effects within one rule see each other, in order", () => {
    const engine = buildMockEngine(
      project([
        {
          id: "t",
          topic: "cmd/x",
          type: "text",
          mock: [
            {
              id: "r",
              when: "go",
              then: [
                { id: "e1", topic: "state/x", kind: "set", value: "100" },
                { id: "e2", topic: "state/x", kind: "add", value: "-40" },
              ],
            },
          ],
        },
      ]),
    )

    // Published one after the other on a real broker, so the second has to
    // see the first - 100 then 60, not 100 then -40.
    expect(engine.respond("cmd/x", "go", {})).toEqual([
      { topic: "state/x", value: "100" },
      { topic: "state/x", value: "60" },
    ])
  })

  test("a declared rule wins over a derived mapping for the same payload", () => {
    const engine = buildMockEngine(
      project(
        [
          {
            id: "t",
            topic: "cmd/a",
            type: "text",
            mock: [{ id: "r", when: "an", then: [{ id: "e", topic: "state/a", kind: "set", value: "99" }] }],
          },
        ],
        [switchObject("sw", "state/a", "cmd/a", [{ id: "s1", label: "AN", readValue: "1", writeValue: "an" }])],
      ),
    )

    // Derivation is a convenience; a declaration is a decision.
    expect(engine.respond("cmd/a", "an", {})).toEqual([{ topic: "state/a", value: "99" }])
  })

  test("reports what it cannot answer instead of staying quiet about it", () => {
    const engine = buildMockEngine(
      project(
        [
          {
            id: "t",
            topic: "cmd/half",
            type: "text",
            mock: [
              { id: "r1", when: "", then: [{ id: "e", topic: "state/x", kind: "set", value: "1" }] },
              { id: "r2", when: "go", then: [] },
            ],
          },
        ],
        [
          switchObject("sw-half", "state/b", "cmd/b", [{ id: "s", label: "Halb", readValue: "", writeValue: "x" }]),
          {
            id: "btn",
            type: "SoftwareButton",
            properties: { action: { type: "send-mqtt", mqttTopic: "cmd/all", mqttMessage: "aus" } },
          },
        ],
      ),
    )

    expect(engine.ruleProblems.join(" ")).toContain("no payload to match on")
    expect(engine.ruleProblems.join(" ")).toContain("no effects")
    expect(engine.skipped.join(" ")).toContain("no read value")
    expect(engine.unhandled.join(" ")).toContain("cmd/all")
  })

  test("finds a Switch nested inside a tab-control panel", () => {
    const engine = buildMockEngine(
      project(
        [],
        [
          {
            id: "tabs",
            type: "tab-control",
            properties: {},
            children: [
              {
                id: "panel",
                type: "panel",
                properties: {},
                children: [
                  switchObject("nested", "state/n", "cmd/n", [
                    { id: "s", label: "AN", readValue: "1", writeValue: "an" },
                  ]),
                ],
              },
            ],
          },
        ],
      ),
    )

    // A nested object is a real object a real finger can reach. The HIL's
    // own combination generator learned this the hard way on 2026-07-25,
    // when a nested topic was silently left out of every run.
    expect(engine.respond("cmd/n", "an", {})).toEqual([{ topic: "state/n", value: "1" }])
  })
})
