import { test, expect } from "@playwright/test"
import { inferValueKind } from "../lib/chart-infer"

// The kind a series is made with (tasks/charts-designer-plan.md D6,
// decision 7): Home Assistant's word first, then the unit, then the
// examples, else a level.

test.describe("a series' kind, inferred (D6)", () => {
  test("from what Home Assistant announced", () => {
    expect(inferValueKind({ component: "sensor", device_class: "power", unit: "W" })).toBe("power")
    expect(inferValueKind({ component: "sensor", device_class: "temperature", unit: "°C" })).toBe("level")
    expect(inferValueKind({ component: "sensor", device_class: "battery" })).toBe("level")
    expect(inferValueKind({ component: "binary_sensor", device_class: "power" })).toBe("state")
    expect(inferValueKind({ component: "switch" })).toBe("state")
  })

  test("from the unit", () => {
    expect(inferValueKind({ unit: "W" })).toBe("power")
    expect(inferValueKind({ unit: " kW " })).toBe("power")
    expect(inferValueKind({ unit: "%", examples: ["on"] })).toBe("level")
  })

  test("from the examples, else a level", () => {
    expect(inferValueKind({ examples: ["on", "off"] })).toBe("state")
    expect(inferValueKind({ examples: ["true", " False "] })).toBe("state")
    expect(inferValueKind({ examples: ["on", "12"] })).toBe("level")
    expect(inferValueKind({ examples: [] })).toBe("level")
    expect(inferValueKind({})).toBe("level")
  })
})
