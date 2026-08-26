import { test, expect } from "@playwright/test"
import { getActiveSwitchStateIndex, switchStateIndexForTap } from "../components/canvas/renderers/render-switch"
import { getPreviewValueFromTopic } from "../lib/render-screen"
import { extractJsonField } from "../lib/json-path"

// A Switch whose read binding is a "<topic>#<path>" composite, on the
// designer side only - no browser interaction, no device.
//
// switch-render.spec.ts drives the real UI, but every Switch it touches reads
// a plain topic. Nothing pinned the JSON path, and the pinning matters here
// more than usual because there are TWO implementations that have to agree:
// getPreviewValueFromTopic() -> extractJsonField() here, and
// ProjectLoader::getTopicValue() -> ProjectLoader::extractJsonField() in the
// firmware. When they disagree the designer shows one segment marked and the
// device marks the other - or neither, which is drawn as "?" and looks like a
// dozen unrelated faults.
//
// Written 2026-08-26, when the Camper Licht project got a Lock screen reading
// pkw/tele/doorman#stateText. The hardware half of the same agreement lives in
// hil/waveshare/fixtures/build-smoke-test.js's screen-4; this half is what
// runs without a bench.

const doormanTopic = {
  id: "t-doorman",
  topic: "pkw/tele/doorman",
  type: "json" as const,
  examples: ['{"locked":true,"stateText":"LOCKED"}', '{"locked":false,"stateText":"UNLOCKED"}'],
  subtopics: [
    { id: "s-locked", path: "locked", type: "text" as const },
    { id: "s-statetext", path: "stateText", type: "text" as const },
  ],
}

const lockSwitch = (topic: string) => ({
  id: "obj-lock",
  type: "Switch" as const,
  x: 80,
  y: 130,
  width: 200,
  height: 100,
  zIndex: 0,
  properties: {
    topic,
    writeTopic: "ble/ea:4d:d2:5c:27:cb/SetLock/set",
    mode: "segmented",
    states: [
      { id: "st-zu", label: "ZU", readValue: "LOCKED", writeValue: "01" },
      { id: "st-auf", label: "AUF", readValue: "UNLOCKED", writeValue: "00" },
    ],
  },
})

const preview = (topics: any[]) => (name: string | undefined) => getPreviewValueFromTopic(name, topics as any)

test.describe("Switch bound through a JSON path", () => {
  test("resolves its active state from the named field, not the whole payload", () => {
    const obj = lockSwitch("pkw/tele/doorman#stateText") as any
    expect(getActiveSwitchStateIndex(obj, preview([doormanTopic]))).toBe(0)

    // The second example is what the second HIL combination publishes, and
    // what the marker has to follow.
    const unlocked = { ...doormanTopic, examples: [doormanTopic.examples[1]] }
    expect(getActiveSwitchStateIndex(obj, preview([unlocked]))).toBe(1)
  })

  test("binding the whole payload instead of a field matches nothing", () => {
    // Not a hypothetical slip: the topic tree offers the bare JSON topic as a
    // pick of its own, and taking it leaves the switch reading
    // '{"locked":true,...}' against readValue "LOCKED". Drawn as "?", which is
    // worth being able to tell apart from a broken path.
    const obj = lockSwitch("pkw/tele/doorman") as any
    expect(getActiveSwitchStateIndex(obj, preview([doormanTopic]))).toBe(-1)
  })

  test("a path that resolves to nothing matches nothing, and does not throw", () => {
    const obj = lockSwitch("pkw/tele/doorman#stateTxt") as any
    expect(getActiveSwitchStateIndex(obj, preview([doormanTopic]))).toBe(-1)
  })

  // A boolean is the field the Lock screen deliberately does NOT read, because
  // the designer formats it with String(value) while the firmware leaves it to
  // ArduinoJson's as<String>(). This pins the designer's half so that if the
  // convention is ever relied on, its expected shape is written down here -
  // the two sides are compared for real on hardware, via the MqttDataField on
  // the Waveshare fixture's screen-4.
  test("a boolean field formats as the bare word", () => {
    expect(extractJsonField(doormanTopic.examples[0], "locked")).toBe("true")
    expect(extractJsonField(doormanTopic.examples[1], "locked")).toBe("false")
  })

  test("a tap targets the segment under the finger, whatever the read path says", () => {
    const obj = lockSwitch("pkw/tele/doorman#stateText") as any
    const active = getActiveSwitchStateIndex(obj, preview([doormanTopic]))
    expect(active).toBe(0)

    // Segmented: the finger picks the destination, so the currently active
    // state does not shift the answer. x is in screen coordinates - the object
    // spans 80..280, so 130 is the left half and 230 the right.
    expect(switchStateIndexForTap(obj, 130, active)).toBe(0)
    expect(switchStateIndexForTap(obj, 230, active)).toBe(1)
    // The boundary belongs to the segment it starts, on both sides (integer
    // division, matching the firmware's own dispatchTapAt).
    expect(switchStateIndexForTap(obj, 180, active)).toBe(1)
    expect(switchStateIndexForTap(obj, 179, active)).toBe(0)
  })
})
