import { test, expect } from "@playwright/test"
import { buttonCornerRadius } from "../lib/button-shape"
import { fontMetricsOf } from "../lib/level-shape"
import { applyColorDepth } from "../lib/color-depth"
import { blendColors, onColorFor } from "../lib/material-colors"
import { isOperateType, isSwitchType, hasSwitchStates, objectTypeLabel } from "../lib/object-types"
import {
  secondLineStyle,
  TOGGLE_PAD,
  TOGGLE_RING,
  toggleFaces,
  toggleMinHeight,
  toggleLooks,
  toggleNextIndex,
} from "../lib/toggle-button-shape"

// What a Toggle Button is drawn as (docs/2026-11-06-toggle-button.md): one
// native button's look per state, a quiet one for «nothing reported», the
// ring's colour - all in whole pixels, relative to the object. A device
// draws these and computes nothing.

const FONTS = [
  { id: "big", name: "big", size: 20, ascent: 16, descent: 4, capHeight: 14 },
  { id: "small", name: "small", size: 14, ascent: 12, descent: 3, capHeight: 10 },
] as any
const measure = (text: string, fontId: string) => text.length * (fontId === "big" ? 10 : 7)

const STATES = [
  { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
  { id: "on", label: "Ein", readValue: "on", writeValue: "on", showAsOn: true, iconAssetId: "drop" },
]
const tile = (props: Record<string, unknown> = {}, width = 216, height = 84) =>
  ({
    id: "t",
    type: "toggle-button",
    x: 40,
    y: 60,
    width,
    height,
    zIndex: 1,
    properties: {
      states: STATES,
      fontId: "big",
      secondFontId: "small",
      switchColor: "#0284c7",
      backgroundColor: "#ffffff",
      borderColor: "#e2e8f0",
      textColor: "#0f172a",
      ...props,
    },
  }) as any

test.describe("the type", () => {
  test("a third switch type: it has states and can be operated, but it is not a knob or a group", () => {
    expect(objectTypeLabel("toggle-button")).toBe("Toggle Button")
    expect(isOperateType("toggle-button")).toBe(true)
    expect(hasSwitchStates("toggle-button")).toBe(true)
    expect(hasSwitchStates("switch")).toBe(true)
    expect(hasSwitchStates("button-group")).toBe(true)
    expect(hasSwitchStates("button")).toBe(false)
    expect(isSwitchType("toggle-button")).toBe(false)
  })
})

test.describe("a Toggle Button's faces", () => {
  test("a state that means on: filled in the colour, ink by the tone rule; pressed the state layer, the button's morph", () => {
    const faces = toggleFaces(tile(), "#f1f5f9", "24bit", true)
    expect(faces.normal).toEqual({ r: 42, fill: "#0284c7", outline: null, ink: onColorFor("#0284c7", "24bit") })
    expect(faces.pressed.fill).toBe(blendColors("#0284c7", faces.normal.ink, 10))
    expect(faces.pressed.r).toBe(buttonCornerRadius(216, 84, true))
  })

  test("any other state: the card's colour with its 1-px edge and the text colour - CamperUI's look", () => {
    const faces = toggleFaces(tile(), "#f1f5f9", "24bit", false)
    expect(faces.normal).toEqual({ r: 42, fill: "#ffffff", outline: "#e2e8f0", ink: "#0f172a" })
    expect(faces.pressed.fill).toBe(blendColors("#ffffff", "#0f172a", 10))
    expect(faces.pressed.outline).toBe("#e2e8f0")
  })

  test("tonal softens the filled face to the colour halfway to the background", () => {
    const filled = toggleFaces(tile(), "#f1f5f9", "24bit", true).normal
    const tonal = toggleFaces(tile({ switchStyle: "tonal" }), "#f1f5f9", "24bit", true).normal
    expect(tonal.fill).not.toBe(filled.fill)
    expect(tonal.ink).toBe(onColorFor(tonal.fill!, "24bit"))
  })

  test("the project's button radius is the tile's corner (CamperUI's 10 px)", () => {
    expect(toggleFaces(tile({ buttonRadius: 10 }), "#f1f5f9", "24bit", true).normal.r).toBe(10)
  })

  test("1 bit: off is never invisible - an edge the same as card and ground takes the ink", () => {
    const faces = toggleFaces(tile({ backgroundColor: "#ffffff", borderColor: "#ffffff", textColor: "#000000" }), "#ffffff", "1bit", false)
    expect(faces.normal.fill).toBe(applyColorDepth("#ffffff", "1bit"))
    expect(faces.normal.outline).toBe(applyColorDepth("#000000", "1bit"))
  })

  test("1 bit: a press that 10 % cannot show turns the face inside out", () => {
    for (const on of [true, false]) {
      const faces = toggleFaces(tile(), "#ffffff", "1bit", on)
      expect(faces.pressed.fill, `on=${on}`).not.toBe(faces.normal.fill)
    }
  })
})

test.describe("where a plain tile's content goes", () => {
  const big = fontMetricsOf(FONTS[0], 14)

  test("without a name: the state's icon and label centred side by side in a strip, the label alone where there is no icon", () => {
    const looks = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure)
    const off = looks.states[0]
    const line = big.ascent + big.descent
    expect(off.icon).toBeUndefined()
    expect(off.baseline).toBe(Math.trunc((84 - line) / 2) + big.ascent)
    expect(off.textX).toBe(Math.trunc((216 - 30) / 2))
    const on = looks.states[1]
    expect(on.icon).toEqual({ x: Math.trunc((216 - (big.capHeight + 8 + 30)) / 2), y: on.baseline - big.capHeight, size: big.capHeight })
    expect(on.textX).toBe(on.icon!.x + big.capHeight + 8)
    expect(on.second).toBeUndefined()
    expect(on.disc).toBeUndefined()
  })

  test("a tile taller than wide stacks the icon over the label", () => {
    const on = toggleLooks(tile({}, 80, 120), "#f1f5f9", "24bit", FONTS, measure).states[1]
    expect(on.icon!.y + on.icon!.size).toBeLessThan(on.baseline - big.ascent + 1)
    expect(on.icon!.x).toBe(Math.trunc((80 - big.capHeight) / 2))
  })

  test("the label is clipped to the tile, never to the round ends' half of a pill", () => {
    const off = toggleLooks(tile({ buttonRadius: 10 }), "#f1f5f9", "24bit", FONTS, measure).states[0]
    expect(off.clipX).toBe(TOGGLE_PAD)
    expect(off.clipW).toBe(216 - 2 * TOGGLE_PAD)
  })
})

test.describe("a named tile", () => {
  const big = fontMetricsOf(FONTS[0], 14)
  const small = fontMetricsOf(FONTS[1], 14)

  test("the name on the first line, the state's label one size smaller below it, both left after the disc", () => {
    const looks = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure)
    const on = looks.states[1]
    const block = big.ascent + big.descent + small.ascent + small.descent
    const top = Math.trunc((84 - block) / 2)
    expect(on.baseline).toBe(top + big.ascent)
    expect(on.second).toEqual({ textX: on.textX, baseline: top + big.ascent + big.descent + small.ascent, fontId: "small" })
    expect(on.disc).toBeDefined()
    expect(on.disc!.cx - on.disc!.r).toBe(TOGGLE_PAD)
    expect(on.textX).toBe(on.disc!.cx + on.disc!.r + TOGGLE_PAD)
    // The icon centred on the disc.
    expect(on.icon!.x + Math.trunc(on.icon!.size / 2)).toBe(on.disc!.cx)
  })

  test("the disc as tall as the two lines, the icon two capitals tall with a third of the disc round it", () => {
    const on = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure).states[1]
    const block = big.ascent + big.descent + small.ascent + small.descent
    expect(on.disc!.r).toBe(Math.trunc(block / 2))
    expect(on.icon!.size).toBe(Math.min(2 * big.capHeight, Math.trunc((2 * block) / 3)))
    // A tile too low for the lines: the disc keeps the padding.
    const low = toggleLooks(tile({ text: "Wasserpumpe" }, 216, 30), "#f1f5f9", "24bit", FONTS, measure).states[1]
    expect(2 * low.disc!.r).toBeLessThanOrEqual(30 - 2 * TOGGLE_PAD)
  })

  test("24 bit: the disc a tint, no ring; 1 bit, where the tint is lost: a ring in the ink", () => {
    const deep = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure).states[1]
    expect(deep.disc!.edge).toBeUndefined()
    const flat = toggleLooks(tile({ text: "Wasserpumpe" }), "#ffffff", "1bit", FONTS, measure)
    for (const look of flat.states) {
      expect(look.disc!.edge, look.label).toBeDefined()
      expect(look.disc!.edge!.normal).toBe(look.normal.ink)
    }
  })

  test("the disc stands where it stands in every state, so nothing moves when the state changes - even in one without an icon", () => {
    const looks = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure)
    expect(looks.states[0].disc).toBeDefined()
    expect(looks.states[0].icon).toBeUndefined()
    expect({ ...looks.states[0].disc, normal: 0, pressed: 0 }).toEqual({ ...looks.states[1].disc, normal: 0, pressed: 0 })
    expect(looks.states[0].textX).toBe(looks.states[1].textX)
  })

  test("no icon in any state: no disc, the text starts at the padding", () => {
    const states = STATES.map(({ iconAssetId: _i, ...s }) => s)
    const on = toggleLooks(tile({ text: "Wasserpumpe", states }), "#f1f5f9", "24bit", FONTS, measure).states[1]
    expect(on.disc).toBeUndefined()
    expect(on.textX).toBe(TOGGLE_PAD)
  })

  test("the second line is one of the seven sizes smaller; Micro stays Micro", () => {
    expect(secondLineStyle("large")).toBe("standard")
    expect(secondLineStyle("standard")).toBe("mini")
    expect(secondLineStyle("huge")).toBe("xxl")
    expect(secondLineStyle("micro")).toBe("micro")
    expect(secondLineStyle(undefined)).toBe("mini")
  })
})

test.describe("how low it may be", () => {
  const big = fontMetricsOf(FONTS[0], 14)
  const small = fontMetricsOf(FONTS[1], 14)
  test("one line and the padding without a name; two lines with one", () => {
    expect(toggleMinHeight(tile(), FONTS)).toBe(big.ascent + big.descent + 2 * TOGGLE_PAD)
    expect(toggleMinHeight(tile({ text: "Wasserpumpe" }), FONTS)).toBe(big.ascent + big.descent + small.ascent + small.descent + 2 * TOGGLE_PAD)
  })
})

test.describe("nothing reported, and the ring", () => {
  test("none: the quiet face with «?» as the label - under the name if there is one", () => {
    const plain = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure)
    expect(plain.none.normal).toEqual(plain.states[0].normal)
    expect(plain.none.label).toBe("?")
    expect(plain.none.icon).toBeUndefined()
    const named = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure)
    expect(named.none.label).toBe("?")
    expect(named.none.second).toBeDefined()
  })

  test("each state's look carries the label it draws", () => {
    const looks = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure)
    expect(looks.states.map((l) => l.label)).toEqual(["Aus", "Ein"])
  })

  test("the ring is the switch's: 2 px in the colour", () => {
    const looks = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure)
    expect(looks.ring).toBe("#0284c7")
    expect(TOGGLE_RING).toBe(2)
  })
})

test.describe("a tap", () => {
  const on = (i: number) => STATES[i]
  test("sends the next state, wrapping after the last, for any number of states", () => {
    const three = [on(0), on(1), { id: "auto", label: "Auto", readValue: "auto", writeValue: "auto" }]
    expect(toggleNextIndex(STATES, 0)).toBe(1)
    expect(toggleNextIndex(STATES, 1)).toBe(0)
    expect(toggleNextIndex(three, 1)).toBe(2)
    expect(toggleNextIndex(three, 2)).toBe(0)
  })

  test("with nothing reported: the first state that means on, or the first state", () => {
    expect(toggleNextIndex(STATES, -1)).toBe(1)
    expect(toggleNextIndex(STATES.map(({ showAsOn: _s, ...s }) => s), -1)).toBe(0)
    expect(toggleNextIndex([], -1)).toBe(-1)
  })
})
