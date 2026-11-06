import { test, expect } from "@playwright/test"
import { buttonContentLayout, buttonCornerRadius, buttonFaces, buttonLook, buttonPills, BUTTON_ICON_GAP } from "../lib/button-shape"
import { fontMetricsOf } from "../lib/level-shape"
import { layoutProject } from "../lib/layout"

// What a device is told to draw for a button (docs/2026-11-04-native-
// buttons.md): both faces - radius, fill, ring, ink - and where icon and label
// go, relative to the button, in whole pixels. The colours are buttonLook's
// (e2e/software-button-look.spec.ts pins those); here the numbers around them.

const button = (props: Record<string, unknown> = {}, width = 140, height = 40) =>
  ({ id: "b", type: "button", x: 33, y: 71, width, height, zIndex: 1, properties: { text: "Licht", fontId: "f", ...props } }) as any
const FONTS = [{ id: "f", name: "f", size: 14, ascent: 12, descent: 3, capHeight: 10 }] as any

test.describe("a button's faces", () => {
  test("each face is buttonLook's colours with its radius: a pill at rest, a fifth of the height pressed", () => {
    for (const style of ["filled", "tonal", "outlined"])
      for (const depth of ["24bit", "4bit", "1bit"]) {
        const obj = button({ buttonStyle: style, buttonColor: "#0ea5e9" })
        const faces = buttonFaces(obj, "#101318", depth)
        for (const [face, pressed] of [[faces.normal, false], [faces.pressed, true]] as const) {
          const look = buttonLook(obj, "#101318", depth, pressed)
          expect(face, `${style} ${depth} ${pressed}`).toEqual({ r: pressed ? 8 : 20, fill: look.container, outline: look.outline, ink: look.content })
        }
      }
  })

  test("the radius is whole pixels, odd heights too", () => {
    expect(buttonCornerRadius(140, 41, false)).toBe(20)
    expect(buttonCornerRadius(30, 56, false)).toBe(15)
    expect(buttonCornerRadius(212, 84, true)).toBe(16)
  })

  test("a project's button radius: corners of that many pixels, never rounder than a pill, pressed never rounder than at rest", () => {
    expect(buttonCornerRadius(212, 84, false, 10)).toBe(10)
    expect(buttonCornerRadius(212, 84, true, 10)).toBe(10)
    expect(buttonCornerRadius(212, 84, true, 30)).toBe(16)
    expect(buttonCornerRadius(140, 40, false, 100)).toBe(20)
    expect(buttonCornerRadius(140, 40, false, 0)).toBe(0)
    expect(buttonFaces(button(), "#ffffff", "24bit", 6).normal.r).toBe(6)
  })
})

test.describe("where a button's content goes", () => {
  const m = fontMetricsOf(FONTS[0], 14)

  test("the label centred in the straight part, the baseline centred in the height - from the button's corner", () => {
    const layout = buttonContentLayout(button(), FONTS, 30)
    expect(layout.icon).toBeNull()
    expect(layout.baseline).toBe(Math.trunc((40 - (m.ascent + m.descent)) / 2) + m.ascent)
    expect(layout.textX).toBe(20 + Math.trunc((140 - 40 - 30) / 2))
    // Clipped a quarter of the height in from each end.
    expect(layout.clipX).toBe(10)
    expect(layout.clipW).toBe(120)
  })

  test("with an icon: a capital tall, standing on the baseline, the gap, then the label", () => {
    const layout = buttonContentLayout(button({ iconAssetId: "water" }), FONTS, 30)
    const group = m.capHeight + BUTTON_ICON_GAP + 30
    expect(layout.icon).toEqual({ x: 20 + Math.trunc((100 - group) / 2), y: layout.baseline - m.capHeight, size: m.capHeight })
    expect(layout.textX).toBe(layout.icon!.x + m.capHeight + BUTTON_ICON_GAP)
  })

  test("a label longer than the button starts at the straight part and is cut by the clip", () => {
    const layout = buttonContentLayout(button(), FONTS, 500)
    expect(layout.textX).toBe(20)
  })
})

test.describe("a face as the rasteriser's runs", () => {
  test("filled: one run over the button; outlined: the inside taken back, then the ring; nothing: no run", () => {
    expect(buttonPills(10, 20, 100, 40, { r: 20, fill: "#112233", outline: null, ink: "#ffffff" })).toEqual([
      { band: { x: 10, y: 20, w: 100, h: 40, rLow: 20, rHigh: 20 }, colour: "#112233" },
    ])
    expect(buttonPills(10, 20, 100, 40, { r: 20, fill: null, outline: "#445566", ink: "#445566" })).toEqual([
      { band: { x: 11, y: 21, w: 98, h: 38, rLow: 19, rHigh: 19 }, colour: null },
      { band: { x: 10, y: 20, w: 100, h: 40, rLow: 20, rHigh: 20 }, colour: "#445566" },
    ])
    expect(buttonPills(10, 20, 100, 40, { r: 0, fill: null, outline: null, ink: "#000000" })).toEqual([])
  })
})

// Settings › Cards › Button radius (module button-radius): the layout pass
// writes it into every button in px, the way a card gets its look; cleared,
// it is taken out again and the button is a pill.
test.describe("the project's button radius", () => {
  const settings = (buttonRadiusMm?: number) => ({ pixelsPerMm: 6.73, cards: buttonRadiusMm === undefined ? {} : { buttonRadiusMm } })
  const projectWith = (s: any, objects: any[]) => ({ settings: s, screens: [{ id: "s", objects }] }) as any

  test("written into every button at any depth, in px, and its faces take it", () => {
    const nested = { id: "g", type: "group", x: 0, y: 0, width: 300, height: 200, zIndex: 1, properties: {}, children: [button({}, 212, 84)] }
    const laid = layoutProject(projectWith(settings(1.5), [button({}, 212, 84), nested]))
    const [top, group] = laid.screens[0].objects as any[]
    expect(top.properties.buttonRadius).toBe(10)
    expect(group.children[0].properties.buttonRadius).toBe(10)
    expect(buttonFaces(top, "#ffffff", "24bit").normal.r).toBe(10)
  })

  test("a Toggle Button takes it too: CamperUI's tiles have its 10 px corners, not a pill's", () => {
    const tile = { ...button({}, 216, 84), id: "t", type: "toggle-button" }
    const laid = layoutProject(projectWith(settings(1.5), [tile]))
    expect((laid.screens[0].objects as any[])[0].properties.buttonRadius).toBe(10)
  })

  test("cleared, it is taken out again: a pill", () => {
    const laid = layoutProject(projectWith(settings(), [button({ buttonRadius: 10 }, 212, 84)]))
    const b = (laid.screens[0].objects as any[])[0]
    expect(b.properties).not.toHaveProperty("buttonRadius")
    expect(buttonFaces(b, "#ffffff", "24bit").normal.r).toBe(42)
  })

  test("an unset radius changes nothing in a project from before", () => {
    const project = projectWith(settings(), [button({}, 212, 84)])
    expect(layoutProject(project)).toBe(project)
  })
})
