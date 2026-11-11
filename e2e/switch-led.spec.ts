import { test, expect } from "@playwright/test"
import { fontMetricsOf } from "../lib/level-shape"
import { blendColors } from "../lib/material-colors"
import { ledStripThickness, LED_STRIP_GAP, LED_STRIP_INSET, switchLedLayout, switchLedLook, switchSegmentAt, switchStyleOf } from "../lib/switch-shape"
import { buttonLook } from "../lib/button-shape"

// A Button Group's LED form (docs/2026-11-11-led-look.md, decision 7): no
// container, the segments edge to edge, a line between two, a strip under
// each label - lit under the chosen one. And the button's fourth style,
// «Text» (decision 10).

const FONT = { id: "f", name: "f", size: 16, ascent: 13, descent: 3, capHeight: 11 } as any
const group = (props: Record<string, unknown> = {}, width = 301) =>
  ({
    id: "g",
    type: "button-group",
    x: 10,
    y: 20,
    width,
    height: 50,
    zIndex: 1,
    properties: {
      switchStyle: "led",
      switchColor: "#0ea5e9",
      textColor: "#f1f5f9",
      borderColor: "#272d3b",
      trackColor: "#0b0e13",
      fontId: "f",
      states: [{ label: "Temperatur" }, { label: "Leistung" }, { label: "Lüften" }],
      ...props,
    },
  }) as any

test("LED is a Button Group's style only; a Switch draws it filled", () => {
  expect(switchStyleOf(group())).toBe("led")
  expect(switchStyleOf({ ...group(), type: "switch" })).toBe("filled")
  expect(switchStyleOf(group({ switchStyle: "tonal" }))).toBe("tonal")
})

test("the segments tile the object edge to edge; a 1-px line where two meet, the object's height", () => {
  const m = fontMetricsOf(FONT, 14)
  const layout = switchLedLayout(group(), 3, m)
  expect(layout.segments.map((s) => [s.x, s.w])).toEqual([[10, 100], [110, 100], [210, 101]])
  expect(layout.dividers).toEqual([{ x: 110, y: 20, h: 50 }, { x: 210, y: 20, h: 50 }])
  const strip = ledStripThickness(m)
  const top = 20 + Math.trunc((50 - (m.ascent + m.descent + LED_STRIP_GAP + strip)) / 2)
  expect(layout.labelBand).toEqual({ y: top, h: m.ascent + m.descent })
  expect(layout.strips[0]).toEqual({ x: 10 + LED_STRIP_INSET, y: top + m.ascent + m.descent + LED_STRIP_GAP, w: 100 - 2 * LED_STRIP_INSET, h: strip, r: Math.trunc(strip / 2) })
})

test("a finger counts by the segments it sees", () => {
  expect(switchSegmentAt(group(), 3, 15)).toBe(0)
  expect(switchSegmentAt(group(), 3, 111)).toBe(1)
  expect(switchSegmentAt(group(), 3, 310)).toBe(2)
})

test("the colours: the chosen label in the text colour, the others muted; strips dark, lit in the colour, half while asked", () => {
  const look = switchLedLook(group(), "#181c24", "24bit")
  expect(look.ink).toBe("#f1f5f9")
  expect(look.muted).toBe(blendColors("#181c24", "#f1f5f9", 60))
  expect(look.divider).toBe("#272d3b")
  expect(look.track).toBe("#0b0e13")
  expect(look.lit).toBe("#0ea5e9")
  expect(look.asked).toBe(blendColors("#0b0e13", "#0ea5e9", 50))
  expect(look.outline).toBeNull()
})

test("the button's «Text» style: no container, no outline, the label in the colour; pressed shows the state layer", () => {
  const button = { id: "b", type: "button", x: 0, y: 0, width: 90, height: 40, zIndex: 1, properties: { buttonStyle: "text", buttonColor: "#0ea5e9" } } as any
  expect(buttonLook(button, "#181c24", "24bit", false)).toEqual({ container: null, outline: null, content: "#0ea5e9" })
  expect(buttonLook(button, "#181c24", "24bit", true).container).toBe(blendColors("#181c24", "#0ea5e9", 10))
})
