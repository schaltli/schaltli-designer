import { test, expect, type Page } from "@playwright/test"
import {
  switchContainer,
  switchContent,
  switchCorner,
  switchKnob,
  switchKnobLook,
  switchLabelBox,
  switchLook,
  switchSegmentAt,
  switchSegments,
  switchSlotAt,
  switchStateIsOn,
  switchTrack,
} from "../lib/switch-shape"
import { fontMetricsOf } from "../lib/level-shape"
import { switchStateIndexForTap } from "../components/canvas/renderers/render-switch"

// The Switch in its two Material 3 forms (docs/2026-09-20-switch-look.md): a
// connected button group, and a switch with a knob. Drawn through
// app/test-render rather than the editor canvas - no grid, no zoom, no
// selection handles, so a pixel at (x, y) is the pixel a device has to put
// there too.
//
// This replaces switch-marker.spec.ts, which pinned down the marker bar's
// geometry to the pixel. There is no bar any more, and the four things that
// spec was really protecting are all still checked here: that the control
// stays visible when nothing is active, that the shape's numbers are stated
// rather than computed twice, that a state with no match marks nothing, and
// that what the author sets is what gets drawn.

const W = 320
const H = 120
const PURPLE = "#6750A4"
// 25 % and 50 % of the way from white to it - the container and the tint
// (lib/material-colors.ts), which the slider's empty track takes too.
const SURFACE: Rgb = [0xd9, 0xd3, 0xe8]
const TINT: Rgb = [0xb3, 0xa8, 0xd2]
const FILL: Rgb = [0x67, 0x50, 0xa4]
const WHITE: Rgb = [255, 255, 255]

type Rgb = [number, number, number]

const state = (label: string, value: string, extra: Record<string, unknown> = {}) => ({
  id: `s-${value}`,
  label,
  readValue: value,
  writeValue: value,
  ...extra,
})

const THREE = [state("Aus", "0"), state("Auto", "1"), state("An", "2", { showAsOn: true })]
const TWO = [state("Aus", "0"), state("An", "1", { showAsOn: true })]

function switchObject(extra: Record<string, unknown> = {}, box = { x: 20, y: 20, width: 240, height: 48 }): any {
  return {
    id: "sw",
    type: "Switch",
    zIndex: 1,
    ...box,
    properties: {
      topic: "t/mode",
      writeTopic: "t/cmd",
      states: THREE,
      mode: "segmented",
      switchColor: PURPLE,
      fontId: "font-helvR12",
      ...extra,
    },
  }
}

test.describe("the shape of a switch", () => {
  test("a strip is a pill, a tile is a rounded square", () => {
    // A segment as tall as it is wide came out an oval in the first render.
    expect(switchCorner(120, 48)).toBe(24)
    expect(switchCorner(60, 60)).toBe(20)
    expect(switchCorner(90, 90)).toBe(28)
  })

  test("the buttons tile the container exactly, inside Material's 2 dp", () => {
    const obj = switchObject()
    const box = switchContainer(obj)
    const segments = switchSegments(obj, 3)
    expect(segments).toHaveLength(3)
    expect(segments[0].x).toBe(box.x + 2)
    expect(segments[2].x + segments[2].w).toBe(box.x + box.w - 2)
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].x, "no seam and no overlap").toBe(segments[i - 1].x + segments[i - 1].w)
      expect(segments[i].y).toBe(box.y + 2)
      expect(segments[i].h).toBe(box.h - 4)
    }
  })

  test("a finger finds the segment it is over", () => {
    const obj = switchObject()
    const segments = switchSegments(obj, 3)
    for (let i = 0; i < segments.length; i++) {
      expect(switchSegmentAt(obj, 3, segments[i].x + 2)).toBe(i)
      expect(switchSegmentAt(obj, 3, segments[i].x + segments[i].w - 1)).toBe(i)
    }
    // Past either end it still answers, with the segment on that side.
    expect(switchSegmentAt(obj, 3, obj.x - 50)).toBe(0)
    expect(switchSegmentAt(obj, 3, obj.x + obj.width + 50)).toBe(2)
  })

  test("the knob's track is two thirds of the height, and one slot per state", () => {
    const obj = switchObject({ mode: "single", states: TWO })
    const track = switchTrack(obj, 2)
    expect(track.h).toBe(32)
    expect(track.y).toBe(obj.y + 8)
    // Room for two knobs plus the padding on both sides.
    const pad = 4
    const knob = track.h - 2 * pad
    expect(track.w).toBe(2 * pad + 2 * knob)
    const first = switchKnob(obj, 2, 0)
    const second = switchKnob(obj, 2, 1)
    expect(second.cx - first.cx, "one knob's width apart").toBe(knob)
    expect(first.r).toBe(Math.trunc(knob / 2))
    // Held down, it grows - Material grows it too.
    expect(switchKnob(obj, 2, 0, true).r).toBe(first.r + 2)
  })

  test("a finger on the track picks a slot, beside it picks none", () => {
    const obj = switchObject({ mode: "single", states: THREE })
    for (const slot of [0, 1, 2]) {
      const knob = switchKnob(obj, 3, slot)
      expect(switchSlotAt(obj, 3, knob.cx)).toBe(slot)
    }
    expect(switchSlotAt(obj, 3, switchLabelBox(obj, 3).x + 4)).toBe(-1)
  })

  test("two states toggle wherever they are tapped; more than two take the slot", () => {
    const two = switchObject({ mode: "single", states: TWO })
    expect(switchStateIndexForTap(two, two.x + 200, 0)).toBe(1)
    expect(switchStateIndexForTap(two, two.x + 2, 1)).toBe(0)

    const three = switchObject({ mode: "single", states: THREE })
    expect(switchStateIndexForTap(three, switchKnob(three, 3, 2).cx, 0)).toBe(2)
    // Beside the track a tap advances, so a finger on the label does something.
    expect(switchStateIndexForTap(three, switchLabelBox(three, 3).x + 10, 1)).toBe(2)
    expect(switchStateIndexForTap(three, switchLabelBox(three, 3).x + 10, 2)).toBe(0)
  })

  test("a state counts as on under either name", () => {
    expect(switchStateIsOn({ showAsOn: true })).toBe(true)
    // Every project written before 2026-09-20 says it the old way.
    expect(switchStateIsOn({ showMarker: true })).toBe(true)
    expect(switchStateIsOn({ showAsOn: false, showMarker: true })).toBe(false)
    expect(switchStateIsOn({})).toBe(false)
  })

  test("icon and label sit side by side in a strip and stacked in a tile", () => {
    const metrics = fontMetricsOf(undefined, 14)
    const strip = switchContent({ x: 0, y: 0, w: 120, h: 40, r: 20 }, metrics, true, 30)
    expect(strip.beside).toBe(true)
    expect(strip.icon!.y + strip.icon!.h, "the icon stands on the baseline").toBe(strip.baseline)
    expect(strip.textX).toBe(strip.icon!.x + strip.icon!.w + 8)

    const tile = switchContent({ x: 0, y: 0, w: 60, h: 90, r: 20 }, metrics, true, 30)
    expect(tile.beside).toBe(false)
    expect(tile.icon!.y + tile.icon!.h).toBeLessThan(tile.baseline - metrics.ascent + 1)
  })
})

test.describe("the colours of a switch", () => {
  test("one colour gives the container, the chosen state and the labels", () => {
    const look = switchLook(switchObject(), "#ffffff", "24bit")
    expect(look.surface).toBe("#d9d3e8")
    expect(look.surfaceOutline).toBeNull()
    expect(look.chosen).toBe(PURPLE)
    expect(look.onChosen).toBe("#ffffff")
    expect(look.onSurface).toBe("#000000")
  })

  test("tint is the quieter selection, and it is the slider's own track", () => {
    const look = switchLook(switchObject({ switchStyle: "tonal" }), "#ffffff", "24bit")
    expect(look.chosen).toBe("#b3a8d2")
    expect(look.onChosen).toBe("#000000")
  })

  test("on 1 bit the container becomes an outline", () => {
    const look = switchLook(switchObject({ switchColor: "#000000" }), "#ffffff", "1bit")
    expect(look.surface).toBe("#ffffff")
    expect(look.surfaceOutline).toBe("#000000")
    expect(look.chosen).toBe("#000000")
    expect(look.onChosen).toBe("#ffffff")
  })

  test("the knob is coloured when its state is on and quiet when it is not", () => {
    const obj = switchObject({ mode: "single", states: TWO })
    expect(switchKnobLook(obj, "#ffffff", "24bit", true)).toEqual({
      track: PURPLE,
      trackOutline: null,
      knob: "#ffffff",
      onKnob: PURPLE,
    })
    expect(switchKnobLook(obj, "#ffffff", "24bit", false)).toEqual({
      track: "#d9d3e8",
      trackOutline: "#b3a8d2",
      knob: "#b3a8d2",
      onKnob: "#000000",
    })
  })
})

function project(depth: "1bit" | "24bit", obj: any) {
  return {
    name: "switch-look",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: depth },
    fonts: [],
    assets: [],
    topics: [{ topic: "t/mode", examples: ["1"] }],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects: [obj] }],
  }
}

async function render(page: Page, p: any, overrides: Record<string, string>): Promise<(x: number, y: number) => Rgb> {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: p,
    screenIndex: 0,
    topicOverrides: overrides,
    quantize: p.settings.colorDepth === "1bit" ? "1bit" : undefined,
  })
  const data: number[] = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
  })
  return (x: number, y: number) => {
    const i = (y * W + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  }
}

test.describe("what a switch draws", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("a group: the container behind, the reported state's own pill on it", async ({ page }) => {
    const obj = switchObject()
    const at = await render(page, project("24bit", obj), { "t/mode": "1" })
    const segments = switchSegments(obj, 3)
    const mid = (i: number) => [segments[i].x + Math.trunc(segments[i].w / 2), segments[i].y + 4] as const

    expect(at(...mid(1)), "the reported state").toEqual(FILL)
    expect(at(...mid(0)), "the others are the container").toEqual(SURFACE)
    expect(at(...mid(2))).toEqual(SURFACE)
    // The container's corners are rounded, so its own corner pixel is screen.
    expect(at(obj.x, obj.y)).toEqual(WHITE)
    expect(at(obj.x + 40, obj.y + 1), "and its top edge is the container").toEqual(SURFACE)
  })

  test("nothing reported, nothing marked - but the control is still there", async ({ page }) => {
    const obj = switchObject()
    const at = await render(page, project("24bit", obj), { "t/mode": "" })
    const segments = switchSegments(obj, 3)
    for (const seg of segments) {
      expect(at(seg.x + Math.trunc(seg.w / 2), seg.y + 4), "no state is chosen").toEqual(SURFACE)
    }
  })

  test("a tap that has not been answered is a ring, and the pill stays where it is", async ({ page }) => {
    // Reported "Auto", asked for "An": both are visible at once, which is what
    // the old hollow bar said and what a settable level's handle says.
    const obj = switchObject()
    const at = await render(page, project("24bit", obj), { "t/mode": "1" })
    const before = at(switchSegments(obj, 3)[2].x + 4, switchSegments(obj, 3)[2].y + 4)
    expect(before).toEqual(SURFACE)

    await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
      project: project("24bit", obj),
      screenIndex: 0,
      topicOverrides: { "t/mode": "1" },
      askedValues: { "t/mode": "2" },
    })
    const after = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement
      return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
    })
    const seg = switchSegments(obj, 3)[2]
    const pixel = (x: number, y: number): Rgb => {
      const i = (y * W + x) * 4
      return [after[i], after[i + 1], after[i + 2]]
    }
    const midY = seg.y + Math.trunc(seg.h / 2)
    expect(pixel(seg.x, midY), "the ring is on the asked segment").toEqual(FILL)
    expect(pixel(seg.x + 6, midY), "and it is a ring, not a fill").toEqual(SURFACE)
    const chosen = switchSegments(obj, 3)[1]
    expect(pixel(chosen.x + Math.trunc(chosen.w / 2), chosen.y + 4), "what is reported is still filled").toEqual(FILL)
  })

  test("a switch: the track takes the colour only when its state is on", async ({ page }) => {
    const obj = switchObject({ mode: "single", states: TWO }, { x: 20, y: 20, width: 200, height: 48 })
    const track = switchTrack(obj, 2)
    const on = await render(page, project("24bit", obj), { "t/mode": "1" })
    const off = await render(page, project("24bit", obj), { "t/mode": "0" })
    const left = track.x + 6
    const right = track.x + track.w - 6

    // On: coloured track, the knob at the right in the colour that reads on it.
    expect(on(left, track.y + Math.trunc(track.h / 2))).toEqual(FILL)
    expect(on(right, track.y + Math.trunc(track.h / 2))).toEqual(WHITE)
    // Off: the quiet pair, knob to the left.
    expect(off(right, track.y + Math.trunc(track.h / 2))).toEqual(SURFACE)
    expect(off(left, track.y + Math.trunc(track.h / 2))).toEqual(TINT)
  })

  test("a switch moves its knob to what was asked for, and waits with the colour", async ({ page }) => {
    // Reported "Aus", asked for "An": the knob is already on the right, the
    // track is still quiet. The knob is the request, the colour is the truth -
    // a settable level's handle and fill, in another shape.
    const obj = switchObject({ mode: "single", states: TWO }, { x: 20, y: 20, width: 200, height: 48 })
    await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
      project: project("24bit", obj),
      screenIndex: 0,
      topicOverrides: { "t/mode": "0" },
      askedValues: { "t/mode": "1" },
    })
    const data: number[] = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement
      return Array.from(canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data)
    })
    const at = (x: number, y: number): Rgb => {
      const i = (y * W + x) * 4
      return [data[i], data[i + 1], data[i + 2]]
    }
    const track = switchTrack(obj, 2)
    const midY = track.y + Math.trunc(track.h / 2)
    expect(at(track.x + track.w - 6, midY), "the knob has moved to the asked slot").toEqual(TINT)
    expect(at(track.x + 6, midY), "and the track is still the reported one's").toEqual(SURFACE)
  })

  test("a switch with nothing reported shows an empty track and no knob", async ({ page }) => {
    const obj = switchObject({ mode: "single", states: TWO }, { x: 20, y: 20, width: 200, height: 48 })
    const at = await render(page, project("24bit", obj), { "t/mode": "" })
    const track = switchTrack(obj, 2)
    const midY = track.y + Math.trunc(track.h / 2)
    for (const x of [track.x + 6, track.x + track.w - 6]) {
      expect(at(x, midY), "no knob stands anywhere").toEqual(SURFACE)
    }
  })

  test("on 1 bit the container is an outline and the chosen state is solid", async ({ page }) => {
    const obj = switchObject({ switchColor: "#000000" })
    const at = await render(page, project("1bit", obj), { "t/mode": "1" })
    const segments = switchSegments(obj, 3)
    expect(at(obj.x + 40, obj.y), "the container's outline").toEqual([0, 0, 0])
    expect(at(obj.x + 40, obj.y + 6), "and nothing but background inside it").toEqual(WHITE)
    expect(at(segments[1].x + Math.trunc(segments[1].w / 2), segments[1].y + 6), "the chosen state").toEqual([0, 0, 0])
  })
})
