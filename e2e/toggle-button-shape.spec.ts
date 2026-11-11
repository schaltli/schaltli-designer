import { test, expect } from "@playwright/test"
import { buttonCornerRadius } from "../lib/button-shape"
import { fontMetricsOf } from "../lib/level-shape"
import { applyColorDepth } from "../lib/color-depth"
import { blendColors, onColorFor } from "../lib/material-colors"
import { isOperateType, isSwitchType, hasSwitchStates, objectTypeLabel } from "../lib/object-types"
import {
  ASKED_HALF_MS,
  lightFill,
  secondLineStyle,
  stripThickness,
  TOGGLE_GAP,
  TOGGLE_PAD,
  TOGGLE_PAD_X,
  WINDOW_PAD,
  toggleFaces,
  toggleLightColours,
  toggleMinHeight,
  toggleLooks,
  toggleNextIndex,
  toggleStyleOf,
} from "../lib/toggle-button-shape"

// What a Toggle Button is drawn as (docs/2026-11-06-toggle-button.md, since
// 2026-11-11 docs/2026-11-11-led-look.md): a calm tile in every state, its
// name on it, and a light that changes - Korry's window, or an LED strip -
// in whole pixels, relative to the object. A device draws these and
// computes nothing.

const FONTS = [
  { id: "big", name: "big", size: 20, ascent: 16, descent: 4, capHeight: 14 },
  { id: "small", name: "small", size: 14, ascent: 12, descent: 3, capHeight: 10 },
] as any
const measure = (text: string, fontId: string) => text.length * (fontId === "big" ? 10 : 7)
const big = fontMetricsOf(FONTS[0], 14)
const small = fontMetricsOf(FONTS[1], 14)

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
      trackColor: "#e6ebf2",
      ...props,
    },
  }) as any

test.describe("the type", () => {
  test("a third switch type: it has states and can be operated, but it is not a knob or a group", () => {
    expect(objectTypeLabel("toggle-button")).toBe("Toggle Button")
    expect(isOperateType("toggle-button")).toBe(true)
    expect(hasSwitchStates("toggle-button")).toBe(true)
    expect(hasSwitchStates("button")).toBe(false)
    expect(isSwitchType("toggle-button")).toBe(false)
  })

  test("three styles; Filled, Tonal and none at all are Korry (LED look decision 6)", () => {
    expect(toggleStyleOf(tile({ switchStyle: "led-h" }))).toBe("led-h")
    expect(toggleStyleOf(tile({ switchStyle: "led-v" }))).toBe("led-v")
    for (const style of ["korry", "filled", "tonal", undefined]) expect(toggleStyleOf(tile({ switchStyle: style })), String(style)).toBe("korry")
  })
})

test.describe("the tile", () => {
  test("calm in every state: the card's colour, its 1-px edge, the text colour; pressed the state layer, the button's morph", () => {
    const faces = toggleFaces(tile(), "#f1f5f9", "24bit")
    // A card's corner, not a pill (TOGGLE_RADIUS).
    expect(faces.normal).toEqual({ r: 12, fill: "#ffffff", outline: "#e2e8f0", ink: "#0f172a" })
    expect(faces.pressed.fill).toBe(blendColors("#ffffff", "#0f172a", 10))
    expect(faces.pressed.r).toBe(buttonCornerRadius(216, 84, true, 12))
    const looks = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure)
    expect(looks.states[1].normal).toEqual(looks.states[0].normal)
  })

  test("the project's button radius is the tile's corner", () => {
    expect(toggleFaces(tile({ buttonRadius: 10 }), "#f1f5f9", "24bit").normal.r).toBe(10)
  })

  test("1 bit: an edge the same as card and ground takes the ink; a press 10 % cannot show turns the face inside out", () => {
    const faces = toggleFaces(tile({ backgroundColor: "#ffffff", borderColor: "#ffffff", textColor: "#000000" }), "#ffffff", "1bit")
    expect(faces.normal.outline).toBe(applyColorDepth("#000000", "1bit"))
    expect(faces.pressed.fill).not.toBe(faces.normal.fill)
  })
})

test.describe("the light's colours", () => {
  test("on: the LED colour, its word by the tone rule; off: the track, its word faint; asked: half the colour, a fifth for the dim half", () => {
    const c = toggleLightColours(tile(), "#f1f5f9", "24bit")
    expect(c.lit).toBe("#0284c7")
    expect(c.litInk).toBe(onColorFor("#0284c7", "24bit"))
    expect(c.track).toBe("#e6ebf2")
    expect(c.offInk).toBe(blendColors("#e6ebf2", "#0f172a", 45))
    expect(c.asked).toBe(blendColors("#e6ebf2", "#0284c7", 50))
    expect(c.askedDim).toBe(blendColors("#e6ebf2", "#0284c7", 20))
    expect(c.outline).toBeNull()
  })

  test("a colour per switch: the LED colour is the colour property", () => {
    expect(toggleLightColours(tile({ switchColor: "#eab308" }), "#f1f5f9", "24bit").lit).toBe("#eab308")
  })

  test("1 bit: a track the tile hides gets a ring in the ink", () => {
    const c = toggleLightColours(tile({ backgroundColor: "#ffffff", trackColor: "#ffffff", textColor: "#000000" }), "#ffffff", "1bit")
    expect(c.outline).toBe(applyColorDepth("#000000", "1bit"))
  })
})

test.describe("Korry", () => {
  const looks = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure)

  test("the name, under it a square-cornered window across the tile; the word centred in capitals", () => {
    const [off, on] = looks.states
    const windowH = small.ascent + small.descent + 2 * WINDOW_PAD
    const block = big.ascent + big.descent + TOGGLE_GAP + windowH
    const top = Math.trunc((84 - block) / 2)
    expect(on.baseline).toBe(top + big.ascent)
    expect(on.light).toMatchObject({ x: TOGGLE_PAD_X, y: top + big.ascent + big.descent + TOGGLE_GAP, w: 216 - 2 * TOGGLE_PAD_X, h: windowH, r: 0 })
    expect(on.light.label).toMatchObject({ text: "EIN", fontId: "small", baseline: on.light.y + WINDOW_PAD + small.ascent })
    expect(on.light.label!.textX).toBe(TOGGLE_PAD_X + Math.trunc((216 - 2 * TOGGLE_PAD_X - 21) / 2))
    expect(on.second).toBeUndefined()
    // Lit and its word by the tone rule; off the track and a faint word.
    expect(on.light.fill).toBe("#0284c7")
    expect(on.light.label!.ink).toBe(onColorFor("#0284c7", "24bit"))
    expect(off.light.fill).toBe("#e6ebf2")
    expect(off.light.label!.ink).toBe(blendColors("#e6ebf2", "#0f172a", 45))
  })

  test("the state's icon small before the name, and the room for it in every state", () => {
    const [off, on] = looks.states
    expect(on.icon).toEqual({ x: TOGGLE_PAD_X, y: on.baseline - big.capHeight, size: big.capHeight })
    expect(off.icon).toBeUndefined()
    expect(off.textX).toBe(on.textX)
    expect(on.textX).toBe(TOGGLE_PAD_X + big.capHeight + TOGGLE_GAP)
    const states = STATES.map(({ iconAssetId: _i, ...s }) => s)
    expect(toggleLooks(tile({ text: "Wasserpumpe", states }), "#f1f5f9", "24bit", FONTS, measure).states[1].textX).toBe(TOGGLE_PAD_X)
  })

  test("without a name the window stands alone, centred", () => {
    const plain = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure).states[1]
    const windowH = small.ascent + small.descent + 2 * WINDOW_PAD
    expect(plain.light.y).toBe(Math.trunc((84 - windowH) / 2))
  })
})

test.describe("LED Horizontal and LED Vertical", () => {
  test("Horizontal: the label at the end of the name's line, a strip under them across the tile", () => {
    const on = toggleLooks(tile({ text: "Wasserpumpe", switchStyle: "led-h" }), "#f1f5f9", "24bit", FONTS, measure).states[1]
    const strip = stripThickness(big)
    expect(strip).toBe(Math.max(3, Math.trunc((big.capHeight * 2) / 5)))
    expect(on.second).toMatchObject({ textX: 216 - TOGGLE_PAD_X - 21, baseline: on.baseline, fontId: "small", ink: blendColors("#ffffff", "#0f172a", 60) })
    expect(on.light).toMatchObject({ x: TOGGLE_PAD_X, w: 216 - 2 * TOGGLE_PAD_X, h: strip, r: Math.trunc(strip / 2), fill: "#0284c7" })
    expect(on.light.label).toBeUndefined()
    // The name stops before the label.
    expect(on.clipX + on.clipW).toBeLessThanOrEqual(on.second!.textX - TOGGLE_GAP)
  })

  test("Vertical: a strip at the left, the tile's full height inside the padding; name and label to its right", () => {
    const on = toggleLooks(tile({ text: "Wasserpumpe", switchStyle: "led-v" }), "#f1f5f9", "24bit", FONTS, measure).states[1]
    const strip = stripThickness(big)
    expect(on.light).toMatchObject({ x: TOGGLE_PAD, y: TOGGLE_PAD, w: strip, h: 84 - 2 * TOGGLE_PAD })
    expect(on.textX).toBe(TOGGLE_PAD + strip + TOGGLE_PAD_X + big.capHeight + TOGGLE_GAP)
    expect(on.second).toMatchObject({ textX: on.textX, baseline: on.baseline + big.descent + small.ascent })
  })
})

test.describe("how low it may be", () => {
  test("Korry: name, gap, window and the padding; the window alone without a name", () => {
    const windowH = small.ascent + small.descent + 2 * WINDOW_PAD
    expect(toggleMinHeight(tile({ text: "W" }), FONTS)).toBe(big.ascent + big.descent + TOGGLE_GAP + windowH + 2 * TOGGLE_PAD)
    expect(toggleMinHeight(tile(), FONTS)).toBe(windowH + 2 * TOGGLE_PAD)
  })

  test("LED: the line, the strip; or two lines beside a strip", () => {
    expect(toggleMinHeight(tile({ text: "W", switchStyle: "led-h" }), FONTS)).toBe(big.ascent + big.descent + TOGGLE_GAP + stripThickness(big) + 2 * TOGGLE_PAD)
    expect(toggleMinHeight(tile({ text: "W", switchStyle: "led-v" }), FONTS)).toBe(big.ascent + big.descent + small.ascent + small.descent + 2 * TOGGLE_PAD)
  })

  test("the label's size is one of the seven smaller; Micro stays Micro", () => {
    expect(secondLineStyle("large")).toBe("standard")
    expect(secondLineStyle("micro")).toBe("micro")
  })
})

test.describe("nothing reported, and asked", () => {
  test("none: the light off with «?»", () => {
    const looks = toggleLooks(tile({ text: "Wasserpumpe" }), "#f1f5f9", "24bit", FONTS, measure)
    expect(looks.none.label).toBe("?")
    expect(looks.none.light.fill).toBe("#e6ebf2")
    expect(looks.none.light.label!.text).toBe("?")
    expect(looks.none.icon).toBeUndefined()
    expect(looks.ring).toBe("#0284c7")
  })

  test("asked pulses: asked and the dim half in turn, every half second; standing at asked where nothing moves", () => {
    const on = toggleLooks(tile(), "#f1f5f9", "24bit", FONTS, measure).states[1]
    expect(lightFill(on, false, true, 0)).toBe(on.light.fill)
    expect(lightFill(on, true, true, 0)).toBe(on.light.asked)
    expect(lightFill(on, true, true, ASKED_HALF_MS)).toBe(on.light.askedDim)
    expect(lightFill(on, true, false, ASKED_HALF_MS)).toBe(on.light.asked)
  })
})

test.describe("a tap", () => {
  const on = (i: number) => STATES[i]
  test("sends the next state, wrapping after the last, for any number of states", () => {
    const three = [on(0), on(1), { id: "auto", label: "Auto", readValue: "auto", writeValue: "auto" }]
    expect(toggleNextIndex(STATES, 0)).toBe(1)
    expect(toggleNextIndex(STATES, 1)).toBe(0)
    expect(toggleNextIndex(three, 2)).toBe(0)
  })

  test("with nothing reported: the first state that means on, or the first state", () => {
    expect(toggleNextIndex(STATES, -1)).toBe(1)
    expect(toggleNextIndex(STATES.map(({ showAsOn: _s, ...s }) => s), -1)).toBe(0)
    expect(toggleNextIndex([], -1)).toBe(-1)
  })
})
