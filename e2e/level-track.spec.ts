import { test, expect, type Page } from "@playwright/test"
import { levelEmptyTrack, levelFrameInner, levelHandleGap, levelHandleRect, levelTrackLook, levelTrackRect } from "../lib/level-shape"

// The track of a level indicator (docs/2026-09-19-slider-look.md, decision 12).
//
// The bar has one colour, its own. The unfilled track is not set: it is halfway
// between that colour and the screen's background, rounded toward the
// background, and where that comes out the same as the background (all of 1-bit)
// it is drawn as an outline in the bar's colour instead of a body. There is no
// border colour and no background colour on the object any more.
//
// The first block is arithmetic and needs no browser. The second draws the bar
// through app/test-render - the same request hil/conformance makes - and looks
// at single pixels, because "the frame ends in a rounded cap at the handle" is
// exactly the kind of fault a colour count cannot see.

test.describe("the colour of the track", () => {
  test("is halfway between the bar and the background, toward the background", () => {
    // Purple on white: each channel is background + trunc((fill - background) / 2).
    expect(levelTrackLook("#6750A4", "#ffffff", "24bit")).toEqual({ track: "#b3a8d2", framed: false })
    // The other way round rounds the other way - toward the background, which is
    // now black - so 127.5 becomes 127 and not 128.
    expect(levelTrackLook("#ffffff", "#000000", "24bit")).toEqual({ track: "#7f7f7f", framed: false })
  })

  test("goes through the depth's own quantiser afterwards", () => {
    // Sixteen greys: 128 is nearer 136 than 119, and 136 is the white side.
    expect(levelTrackLook("#000000", "#ffffff", "4bit")).toEqual({ track: "#888888", framed: false })
    // And 127 is the black side when the background is black.
    expect(levelTrackLook("#ffffff", "#000000", "4bit")).toEqual({ track: "#777777", framed: false })
  })

  test("comes out as the background on 1-bit, which is what puts up the outline", () => {
    // The user's own example: black on white is 50 % grey, "gerundet auf weiss".
    expect(levelTrackLook("#000000", "#ffffff", "1bit")).toEqual({ track: "#ffffff", framed: true })
    expect(levelTrackLook("#ffffff", "#000000", "1bit")).toEqual({ track: "#000000", framed: true })
  })

  test("is framed whenever it cannot be told from the background, and never guessed at", () => {
    expect(levelTrackLook("#ffffff", "#ffffff", "24bit").framed).toBe(true)
    // A colour that is not hex is not averaged: the track becomes the
    // background, which shows the outline and keeps the bar visible.
    expect(levelTrackLook("rebeccapurple", "#ffffff", "24bit")).toEqual({ track: "#ffffff", framed: true })
  })
})

test.describe("the inside of a framed run", () => {
  const run = { x: 10, y: 10, w: 100, h: 12, r: 6, role: "track" as const, roundStart: true, roundEnd: true }

  test("is taken in by one pixel all round where both ends are the track's own", () => {
    expect(levelFrameInner(run, false)).toMatchObject({ x: 11, y: 11, w: 98, h: 10, r: 5 })
  })

  test("is taken in only across at an end that was cut, so the frame is left open there", () => {
    expect(levelFrameInner({ ...run, roundStart: false }, false)).toMatchObject({ x: 10, y: 11, w: 99, h: 10 })
    expect(levelFrameInner({ ...run, roundStart: false, roundEnd: false }, false)).toMatchObject({
      x: 10,
      w: 100,
      h: 10,
    })
  })

  test("turns the other way for a vertical bar", () => {
    const tall = { x: 10, y: 10, w: 12, h: 100, r: 6, role: "track" as const, roundStart: true, roundEnd: false }
    expect(levelFrameInner(tall, true)).toMatchObject({ x: 11, y: 11, w: 10, h: 99 })
  })

  test("has no inside when the run is too thin for one", () => {
    expect(levelFrameInner({ ...run, h: 2 }, false)).toBeNull()
  })
})

type Rgb = [number, number, number]

const W = 240
const H = 120
const BAR = { x: 20, y: 40, width: 200, height: 40 }
const BLACK: Rgb = [0, 0, 0]
const WHITE: Rgb = [255, 255, 255]
const PURPLE: Rgb = [0x67, 0x50, 0xa4]
const LILAC: Rgb = [0xb3, 0xa8, 0xd2]

function bar(extra: Record<string, unknown> = {}): any {
  return {
    id: "bar",
    type: "level-indicator",
    zIndex: 0,
    ...BAR,
    properties: {
      topic: "t/level",
      barDirection: "left-to-right",
      // No number and no name: the bar is the whole box and its track is
      // levelTrackRect, which is what the pixels below are worked out from.
      displayValue: "none",
      calibrationPoints: [
        { value: 0, barSizePercent: 0 },
        { value: 100, barSizePercent: 100 },
      ],
      textColor: "#000000",
      ...extra,
    },
  }
}

function project(depth: "1bit" | "24bit", obj: any, background = "#ffffff") {
  return {
    name: "level-track",
    screenWidth: W,
    screenHeight: H,
    settings: { colorDepth: depth },
    fonts: [],
    assets: [],
    topics: [{ topic: "t/level", examples: ["30"] }],
    screens: [{ id: "s1", name: "Screen 1", backgroundColor: background, objects: [obj] }],
  }
}

async function draw(page: Page, p: any, overrides: Record<string, string>): Promise<void> {
  await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
    project: p,
    screenIndex: 0,
    topicOverrides: overrides,
  })
}

async function pixels(page: Page, points: [number, number][]): Promise<Rgb[]> {
  return page.evaluate((pts) => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement
    const ctx = canvas.getContext("2d")!
    return pts.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data
      return [d[0], d[1], d[2]] as [number, number, number]
    })
  }, points)
}

test.describe("what is drawn", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
  })

  test("on 1-bit the unfilled track is an outline in the bar's colour, open where the handle is", async ({ page }) => {
    const obj = bar({ writeTopic: "t/cmd", fillColor: "#000000" })
    await draw(page, project("1bit", obj), { "t/level": "30" })

    const track = levelTrackRect(obj)
    const handle = levelHandleRect(obj, 30)
    const gap = levelHandleGap(BAR.height)
    const mid = track.y + Math.trunc(track.h / 2)
    const right = handle.x + handle.w + gap // first column of the unfilled run
    const far = track.x + Math.trunc(track.w * 0.7)

    const [
      topEdge,
      below,
      middle,
      bottomEdge,
      above,
      // the run's own start, one column in and the column before it
      gapTop,
      openTop,
      startTop,
      startInside,
      // the handle and the fill
      handleCentre,
      handleOverhang,
      fillMiddle,
      fillEdge,
      fillAbove,
    ] = await pixels(page, [
      [far, track.y],
      [far, track.y + 1],
      [far, mid],
      [far, track.y + track.h - 1],
      [far, track.y - 1],
      [right - 1, track.y],
      [right - gap, track.y],
      [right, track.y],
      [right, track.y + 1],
      [handle.x + 1, mid],
      [handle.x + 1, handle.y + 2],
      [track.x + 12, mid],
      [track.x + 12, track.y],
      [track.x + 12, track.y - 1],
    ])

    // The outline: one black pixel top and bottom, white inside it.
    expect(topEdge, "the outline's top edge").toEqual(BLACK)
    expect(below, "just inside the outline").toEqual(WHITE)
    expect(middle, "the inside is the background, not a body").toEqual(WHITE)
    expect(bottomEdge, "the outline's bottom edge").toEqual(BLACK)
    expect(above, "nothing is drawn outside the track").toEqual(WHITE)

    // Open at the handle: the gap is background right up to the track's own
    // top row, and the run starts with a straight cut - no rounded cap, no
    // closing stroke, so the pixel under the first edge pixel is still inside.
    expect(gapTop, "the gap beside the handle").toEqual(WHITE)
    expect(openTop, "the gap's far column").toEqual(WHITE)
    expect(startTop, "the outline begins here").toEqual(BLACK)
    expect(startInside, "and is not closed off by a vertical stroke").toEqual(WHITE)

    // The handle stands out of the track, and the fill has no frame of its
    // own: its edge is the same row the outline uses.
    expect(handleCentre).toEqual(BLACK)
    expect(handleOverhang, "the handle overhangs the track").toEqual(BLACK)
    expect(fillMiddle).toEqual(BLACK)
    expect(fillEdge, "the fill's top row is the outline's top row").toEqual(BLACK)
    expect(fillAbove, "and nothing lies outside it").toEqual(WHITE)
  })

  test("the outline carries on from the fill's own edge where the fill hands over to it", async ({ page }) => {
    // Reported 30, asked for 70: the handle stands away from the fill, and the
    // track between them is a run cut at both ends.
    const obj = bar({ writeTopic: "t/cmd", setpointTopic: "t/set", fillColor: "#000000" })
    await draw(page, project("1bit", obj), { "t/level": "30", "t/set": "70" })

    const track = levelTrackRect(obj)
    const edge = track.x + Math.trunc((track.w * 30) / 100)
    const [fillTop, outlineTop, fillBelow, outlineBelow, outlineInside] = await pixels(page, [
      [edge - 1, track.y],
      [edge, track.y],
      [edge - 1, track.y + 1],
      [edge, track.y + 1],
      [edge + 4, track.y + 3],
    ])
    expect(fillTop).toEqual(BLACK)
    expect(outlineTop, "no step where the fill ends").toEqual(BLACK)
    expect(fillBelow, "the fill is solid").toEqual(BLACK)
    expect(outlineBelow, "the outline is one pixel thick").toEqual(WHITE)
    expect(outlineInside).toEqual(WHITE)
  })

  test("a bar that has heard nothing is the whole track as an outline, and no fill", async ({ page }) => {
    const obj = bar({ fillColor: "#000000" })
    await draw(page, project("1bit", obj), { "t/level": "" })

    const empty = levelEmptyTrack(obj)
    const mid = empty.y + Math.trunc(empty.h / 2)
    const [topEdge, inside, leftCap, rightCap, beyond] = await pixels(page, [
      [empty.x + Math.trunc(empty.w / 2), empty.y],
      [empty.x + Math.trunc(empty.w / 2), mid],
      [empty.x, mid],
      [empty.x + empty.w - 1, mid],
      [empty.x - 2, mid],
    ])
    expect(topEdge).toEqual(BLACK)
    expect(inside, "an empty tank would claim a value; this claims none").toEqual(WHITE)
    expect(leftCap, "a round cap at the track's own start").toEqual(BLACK)
    expect(rightCap, "and at its own end").toEqual(BLACK)
    expect(beyond).toEqual(WHITE)
  })

  test("in colour the track is a body in the mixed colour, with no frame anywhere", async ({ page }) => {
    const obj = bar({ writeTopic: "t/cmd", fillColor: "#6750A4" })
    await draw(page, project("24bit", obj), { "t/level": "30" })

    const track = levelTrackRect(obj)
    const handle = levelHandleRect(obj, 30)
    const right = handle.x + handle.w + levelHandleGap(BAR.height)
    const far = track.x + Math.trunc(track.w * 0.7)
    const [fillTop, trackTop, trackMiddle, trackBottom, above, gap, atCut] = await pixels(page, [
      [track.x + 12, track.y],
      [far, track.y],
      [far, track.y + Math.trunc(track.h / 2)],
      [far, track.y + track.h - 1],
      [far, track.y - 1],
      [right - 1, track.y + 2],
      [right, track.y + 2],
    ])
    expect(fillTop, "the bar is one flat colour to its very edge").toEqual(PURPLE)
    expect(trackTop, "the track has no border row").toEqual(LILAC)
    expect(trackMiddle).toEqual(LILAC)
    expect(trackBottom).toEqual(LILAC)
    expect(above, "and nothing is painted outside it").toEqual(WHITE)
    expect(gap, "the handle's gap shows the background").toEqual(WHITE)
    expect(atCut, "the track resumes right after it").toEqual(LILAC)
  })

  test("on a dark screen the track is mixed with the screen, not with white", async ({ page }) => {
    // The reference render (lib/render-screen.ts, which conformance and this
    // page use) did not pass the screen's colour on until 2026-09-19, so every
    // track there was mixed with white whatever the screen was.
    const obj = bar({ fillColor: "#6750A4" })
    await draw(page, project("24bit", obj, "#000000"), { "t/level": "30" })
    const track = levelTrackRect(obj)
    const [unfilled] = await pixels(page, [[track.x + Math.trunc(track.w * 0.7), track.y + Math.trunc(track.h / 2)]])
    // 0 + trunc((0x67 - 0) / 2) and so on.
    expect(unfilled).toEqual([0x33, 0x28, 0x52])
  })

  test("a vertical tank as wide as its name is drawn at its own thickness, in the middle", async ({ page }) => {
    // The object is wide for the sake of the name above it, not the bar - a
    // track that followed the object's width came out 70 px thick here.
    const tank = { ...bar({ fillColor: "#6750A4", barDirection: "bottom-to-top" }), x: 10, width: 220, height: 100, y: 10 }
    await draw(page, project("24bit", tank), { "t/level": "60" })
    const row = tank.y + tank.height - 20
    const cols: [number, number][] = []
    for (let x = tank.x; x < tank.x + tank.width; x++) cols.push([x, row])
    const colours = await pixels(page, cols)
    const filled = colours.map((c, i) => (c[0] === PURPLE[0] && c[1] === PURPLE[1] && c[2] === PURPLE[2] ? i : -1)).filter((i) => i >= 0)
    expect(filled.length, "the fill is exactly the default thickness across").toBe(16)
    expect(filled[filled.length - 1] - filled[0], "in one piece").toBe(15)
    // Centred: as much object to its left as to its right, to the pixel.
    const left = filled[0]
    const right = tank.width - 1 - filled[filled.length - 1]
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  })

  test("an empty bar in colour is the mixed track and no bar colour at all", async ({ page }) => {
    const obj = bar({ fillColor: "#6750A4" })
    await draw(page, project("24bit", obj), { "t/level": "" })
    const empty = levelEmptyTrack(obj)
    const [middle, edge] = await pixels(page, [
      [empty.x + 40, empty.y + Math.trunc(empty.h / 2)],
      [empty.x + 40, empty.y],
    ])
    expect(middle).toEqual(LILAC)
    expect(edge).toEqual(LILAC)
  })
})
