import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { Jimp } from "jimp"

type Rgb = [number, number, number]
const same = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

/** Consecutive pixels of the same colour, so a row reads as the runs it is made of. */
function groupRuns(row: Rgb[]): { colour: Rgb; from: number; to: number; length: number }[] {
  const runs: { colour: Rgb; from: number; to: number; length: number }[] = []
  for (let x = 0; x < row.length; x++) {
    const last = runs[runs.length - 1]
    if (last && same(last.colour, row[x])) {
      last.to = x
      last.length++
    } else {
      runs.push({ colour: row[x], from: x, to: x, length: 1 })
    }
  }
  return runs
}
import {
  calculateLevelIndicatorFill,
  levelPercentFromPoint,
  levelValueFromFill,
  snapToStep,
} from "../components/canvas/renderers/render-level-indicator"
import {
  LEVEL_DEFAULT_THICKNESS,
  LEVEL_GAP,
  LEVEL_HEADER_GAP,
  LEVEL_PADDING_ALONG,
  levelHandleLength,
  levelEdgeFor,
  levelHandleGap,
  levelHandleRect,
  levelHandleWidth,
  levelHeaderHeight,
  levelLayout,
  levelSegments,
  levelTrackRect,
  levelValueWidth,
} from "../lib/level-shape"
import { calibrationIsMonotonic, settableRange } from "../lib/settable-level"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const COMBINED_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "combined-test-project.zip")
// The 24-bit round fixture, for anything that asks a question about colour.
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// A settable bar on the e-paper fixture's first screen, its own topics, and a
// step of 5 - the geometry the drag below aims at.
const BAR = { x: 40, y: 40, width: 200, height: 40 }
// The same rectangle as an object, for the geometry helpers.
const BAR_OBJECT = { id: "probe", type: "level-indicator", zIndex: 0, ...BAR, properties: { barDirection: "left-to-right" } } as any

async function projectWithSettableBar(prefix: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.topics.push(
    { id: "t-set-level", topic: `${prefix}/level`, type: "numeric", examples: ["10"] },
    { id: "t-set-cmd", topic: `${prefix}/cmd`, type: "numeric", examples: ["10"] },
  )
  project.screens[0].objects.push({
    id: "obj-settable",
    type: "level-indicator",
    zIndex: 99,
    ...BAR,
    properties: {
      topic: `${prefix}/level`,
      writeTopic: `${prefix}/cmd`,
      step: 5,
      barDirection: "left-to-right",
      displayValue: "percentage",
      calibrationPoints: [
        { value: 0, barSizePercent: 0 },
        { value: 100, barSizePercent: 100 },
      ],
      fillColor: "#4CAF50",
      textColor: "#000000",
      // Black, because this fixture is the 1-bit device: quantizeColorFor1Bit
      // turns anything with a red nibble above 7 into WHITE, so a "bright"
      // marker colour here would be painted white on a white background and
      // prove nothing. Marker and fill are both black, and it is their
      // POSITION that tells them apart below.
      markerColor: "#000000",
      markerWidth: 4,
      markerStyle: "line",
    },
  })
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `settable-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-set-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string, retain = true): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, payload, { qos: 1, retain }, (err) => (err ? reject(err) : resolve())),
  )
}

/**
 * The colour at a point given in the object's own coordinates. The canvas is
 * zoomed and offset, so the point is mapped the same way a click is
 * (devicePoint) and then read back out of the canvas itself.
 */
async function colourAt(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  ox: number,
  oy: number,
  screen?: { width: number; height: number },
) {
  const { canvas } = await getMainCanvas(page)
  const point = devicePoint(box, ox, oy, screen)
  return canvas.evaluate((el, [px, py]) => {
    const c = el as HTMLCanvasElement
    const rect = c.getBoundingClientRect()
    const ctx = c.getContext("2d")!
    const x = Math.round(((px - rect.left) / rect.width) * c.width)
    const y = Math.round(((py - rect.top) / rect.height) * c.height)
    const d = ctx.getImageData(x, y, 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  }, [point.x, point.y])
}

const isDark = ([r, g, b]: [number, number, number]) => r + g + b < 250

const valueField = (page: Page, topic: string) =>
  page.locator("label", { hasText: topic }).first().locator("xpath=../..").locator("input, textarea").first()

// The arithmetic a settable level needs (docs/2026-09-17-settable-level.md):
// a finger has a position, the value it stands for has to be published, and
// what comes back has to land where the finger left it. Pure functions, so
// this needs a browser only because the suite runs in one.

test.describe("a position becomes a value", () => {
  const linear = [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]
  // A real tank: the sensor's readings are not linear in the tank's shape.
  const tank = [
    { value: 0, barSizePercent: 0 },
    { value: 30, barSizePercent: 50 },
    { value: 100, barSizePercent: 100 },
  ]

  test("inverts the calibration, and clamps outside it", () => {
    expect(levelValueFromFill(0, linear)).toBe(0)
    expect(levelValueFromFill(42, linear)).toBe(42)
    expect(levelValueFromFill(100, linear)).toBe(100)
    expect(levelValueFromFill(-10, linear)).toBe(0)
    expect(levelValueFromFill(150, linear)).toBe(100)

    // Half the bar is 30 on this tank, not 50.
    expect(levelValueFromFill(50, tank)).toBe(30)
    expect(levelValueFromFill(75, tank)).toBe(65)
  })

  test("agrees with the forward direction, which is what keeps a dragged bar still", () => {
    for (const points of [linear, tank]) {
      for (const percent of [0, 7, 25, 50, 73, 99, 100]) {
        const value = levelValueFromFill(percent, points)
        expect(calculateLevelIndicatorFill(value, points), `${percent}% on ${JSON.stringify(points)}`).toBeCloseTo(
          percent,
          6,
        )
      }
    }
  })

  test("inverts a calibration that falls as the value rises", () => {
    // A bar that empties as the value grows - a fuel gauge read as "used".
    const falling = [
      { value: 0, barSizePercent: 100 },
      { value: 100, barSizePercent: 0 },
    ]
    expect(levelValueFromFill(100, falling)).toBe(0)
    expect(levelValueFromFill(0, falling)).toBe(100)
    expect(levelValueFromFill(25, falling)).toBe(75)
  })

  test("has an answer for a calibration that cannot give one", () => {
    expect(levelValueFromFill(50, [])).toBe(0)
    expect(levelValueFromFill(50, [{ value: 7, barSizePercent: 20 }])).toBe(7)
    // A flat segment: every position between 0 and 50 reads the same, so the
    // lower value stands rather than a division by zero.
    const flat = [
      { value: 0, barSizePercent: 40 },
      { value: 50, barSizePercent: 40 },
      { value: 100, barSizePercent: 100 },
    ]
    expect(levelValueFromFill(40, flat)).toBe(0)
    expect(Number.isFinite(levelValueFromFill(40, flat))).toBe(true)
  })

  test("snaps to a step, and leaves the value alone without one", () => {
    expect(snapToStep(37, 5)).toBe(35)
    expect(snapToStep(38, 5)).toBe(40)
    expect(snapToStep(37.4, 1)).toBe(37)
    expect(snapToStep(37.4, undefined)).toBe(37.4)
    expect(snapToStep(37.4, 0)).toBe(37.4)
  })
})

// The drag itself, in the live preview against the local broker: what the
// finger sets is published, what it was let go on stays on screen until the
// installation answers (docs/2026-09-17-settable-level.md, decisions 2, 3, 6).
test.describe("a level with a write topic can be set", () => {
  test("publishes what the finger sets, and holds it until the broker answers", async ({ page }) => {
    const prefix = `e2e-set/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const zipPath = await projectWithSettableBar(prefix)
    const commands: string[] = []
    try {
      await publish(broker, `${prefix}/level`, "10")
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/cmd`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/cmd`) commands.push(payload.toString())
      })

      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })
      await expect(valueField(page, `${prefix}/level`)).toHaveValue("10")

      // Press at a quarter of the bar and drag to four fifths - along the
      // TRACK, which is no longer the object inset by 4: the number has a
      // column of its own at the right end now (decision 10), and a fraction of
      // the object would land somewhere else entirely.
      const { box } = await getMainCanvas(page)
      const trackRect = levelTrackRect(BAR_OBJECT)
      const atFraction = (fraction: number) => trackRect.x + trackRect.w * fraction
      const at = (fraction: number) => devicePoint(box, atFraction(fraction), BAR.y + BAR.height / 2)
      const from = at(0.25)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (const fraction of [0.4, 0.55, 0.7, 0.8]) {
        const point = at(fraction)
        await page.mouse.move(point.x, point.y)
        await page.waitForTimeout(120)
      }
      await page.mouse.up()

      // The press and the release always publish; the moves in between are
      // coalesced to at most one every 250 ms, so there are few, not thirty.
      await expect.poll(() => commands.length).toBeGreaterThan(0)
      expect(commands.length, commands.join(",")).toBeLessThan(8)
      // Snapped to the step of 5, and the last word is where the finger left.
      for (const command of commands) expect(Number(command) % 5).toBe(0)
      expect(Number(commands[commands.length - 1])).toBeGreaterThanOrEqual(75)
      expect(Number(commands[commands.length - 1])).toBeLessThanOrEqual(85)

      // Inside the track, clear of the value text centred in the object. Taken
      // from levelTrackRect rather than guessed: the track is inset across the
      // bar by more than the old 4 now, to leave room for the handle's
      // overhang (docs/2026-09-19-slider-look.md).
      const rowY = trackRect.y + 3

      // A request is not a measurement. This test asserted the opposite until
      // 2026-09-18 - that the value panel showed what the finger had set -
      // which is exactly the behaviour the devices had already been corrected
      // away from (decision 6c), and why the designer went on moving the fill
      // long after the glass had stopped. The broker still holds 10, so 10 is
      // what is shown.
      const asked = Number(commands[commands.length - 1])
      await expect(valueField(page, `${prefix}/level`)).toHaveValue("10")

      // And the picture: the marker sits where the finger left it, the fill
      // still ends at the 10 the installation reports. A bar without a
      // setpoint topic - a dimmer - has nowhere else to show a request, so
      // this is the only place it can appear.
      const markerHits = await Promise.all(
        [-2, -1, 0, 1, 2].map((dx) => colourAt(page, box, atFraction(asked / 100) + dx, rowY)),
      )
      expect(markerHits.some(isDark), `marker near ${asked}%: ${JSON.stringify(markerHits)}`).toBe(true)

      // Left of the reported 10 % there is fill, and between the fill's edge
      // and the marker there is nothing - the finger did not move the fill.
      expect(isDark(await colourAt(page, box, atFraction(0.05), rowY)), "fill at 5%").toBe(true)
      expect(isDark(await colourAt(page, box, atFraction(0.3), rowY)), "no fill at 30%").toBe(false)
      expect(isDark(await colourAt(page, box, atFraction(0.5), rowY)), "no fill at 50%").toBe(false)

      // The installation answers with something else: its word wins, and the
      // request it answers is dropped - marker gone, fill moved.
      await publish(broker, `${prefix}/level`, "42")
      await expect(valueField(page, `${prefix}/level`)).toHaveValue("42")
      await expect.poll(async () => isDark(await colourAt(page, box, atFraction(0.3), rowY))).toBe(true)
      const afterAnswer = await Promise.all(
        [-2, -1, 0, 1, 2].map((dx) => colourAt(page, box, atFraction(asked / 100) + dx, rowY)),
      )
      expect(afterAnswer.some(isDark), `marker should be gone: ${JSON.stringify(afterAnswer)}`).toBe(false)
    } finally {
      await publish(broker, `${prefix}/level`, "").catch(() => {})
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })

  test("a level without a write topic is not settable", async ({ page }) => {
    const prefix = `e2e-set/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const zipPath = await projectWithSettableBar(prefix)
    const commands: string[] = []
    try {
      // Same project, with the write topic taken off again.
      const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      const bar = project.screens[0].objects.find((o: any) => o.id === "obj-settable")
      delete bar.properties.writeTopic
      zip.file("project.json", JSON.stringify(project))
      fs.writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }))

      await publish(broker, `${prefix}/level`, "10")
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/cmd`, () => resolve()))
      broker.on("message", (topic, payload) => {
        if (topic === `${prefix}/cmd`) commands.push(payload.toString())
      })

      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 15000 })

      const { box } = await getMainCanvas(page)
      const point = devicePoint(box, BAR.x + BAR.width * 0.8, BAR.y + BAR.height / 2)
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 20, point.y)
      await page.mouse.up()
      await page.waitForTimeout(800)

      expect(commands, "a read-only level publishes nothing").toEqual([])
      await expect(valueField(page, `${prefix}/level`)).toHaveValue("10")
    } finally {
      await publish(broker, `${prefix}/level`, "").catch(() => {})
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })
})

// What the property panel says about a settable level's own numbers
// (lib/settable-level.ts). The panel prints these; the firmware and the live
// preview do the same arithmetic when a finger lands, so a wrong answer here
// would be a warning that disagrees with the device.
test.describe("what a step adds up to", () => {
  const range = (min: number, max: number) => [
    { value: min, barSizePercent: 0 },
    { value: max, barSizePercent: 100 },
  ]

  test("counts the values a finger can reach", () => {
    // A fan in tens: 0, 10 ... 100.
    expect(settableRange(range(0, 100), 10)).toMatchObject({ steps: 11, ragged: false, highestReachable: 100 })
    // A heater in half degrees, 12 to 35.
    expect(settableRange(range(12, 35), 0.5)).toMatchObject({ steps: 47, ragged: false })
    // Every whole value, which is the default.
    expect(settableRange(range(0, 100), 1)?.steps).toBe(101)
  })

  test("says when the step does not divide the range", () => {
    const sevens = settableRange(range(0, 100), 7)
    expect(sevens?.ragged).toBe(true)
    // 14 sevens is 98: that is where a finger tops out, not 100.
    expect(sevens?.highestReachable).toBe(98)
    expect(sevens?.steps).toBe(15)
  })

  test("has nothing to say without a calibration or a step", () => {
    expect(settableRange(undefined, 5)).toBeNull()
    expect(settableRange([{ value: 0, barSizePercent: 0 }], 5)).toBeNull()
    expect(settableRange(range(0, 100), 0)?.steps).toBe(0)
  })

  test("spots a calibration a finger cannot be trusted with", () => {
    expect(calibrationIsMonotonic(range(0, 100))).toBe(true)
    // A tank whose sensor is not linear: still one direction, still fine.
    expect(
      calibrationIsMonotonic([
        { value: 0, barSizePercent: 0 },
        { value: 30, barSizePercent: 50 },
        { value: 100, barSizePercent: 100 },
      ]),
    ).toBe(true)
    // Up and then down: one position on the bar, two values behind it.
    expect(
      calibrationIsMonotonic([
        { value: 0, barSizePercent: 0 },
        { value: 50, barSizePercent: 80 },
        { value: 100, barSizePercent: 40 },
      ]),
    ).toBe(false)
    // A bar that empties as the value rises reads backwards, not both ways.
    expect(
      calibrationIsMonotonic([
        { value: 0, barSizePercent: 100 },
        { value: 100, barSizePercent: 0 },
      ]),
    ).toBe(true)
  })
})

// What the editor's own canvas puts on the screen, at the zoom the editor
// draws at - which is not the same question as "is the geometry right".
//
// Both of these were reported from a screenshot on 2026-09-19 and neither
// showed up in a 1:1 reference render. A pill's rounded cap is a column of
// one-pixel-wide rectangles (Adafruit's fillCircleHelper); painted onto a
// scaled canvas each one gets its own soft edge, they do not add up to an
// opaque cap, and the ends came out visibly paler than the middle. And the
// frame, drawn as one pill behind the whole track, showed through the handle's
// gap as a grey halo.
test.describe("what the canvas actually paints", () => {
  // An odd viewport on purpose: the editor centres the screen in the canvas, so
  // an odd width puts the whole drawing on half-pixels. That is the one
  // condition under which this bug appears - a pill's rounded cap is a column
  // of one-pixel-wide rectangles (Adafruit's fillCircleHelper), and at a
  // half-pixel offset each is painted across two device pixels at partial alpha
  // and they do not add up to an opaque cap. At whole-pixel offsets the very
  // same code is flawless.
  test.use({ viewport: { width: 1281, height: 901 } })

  // The round fixture, because it is 24-bit. The combined project is the 1-bit
  // e-paper, where every colour is quantised to black or white before anything
  // is painted, and a question about colour cannot be asked there at all.
  const PROBE_BAR = { x: 20, y: 100, width: 200, height: 40 }
  const FILL: Rgb = [0x4c, 0xaf, 0x50]
  // Halfway from the fill to white, toward white (level-track.spec.ts pins the
  // rule down): 255 + trunc((76 - 255) / 2), and the same for green and blue.
  const TRACK: Rgb = [0xa6, 0xd7, 0xa8]
  const WHITE: Rgb = [0xff, 0xff, 0xff]

  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "screenbee-firmware not checked out alongside this repo")
  })

  async function projectWithExampleBar(extra: Record<string, unknown> = {}): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens[0].objects = []
    project.screens[0].backgroundColor = "#ffffff"
    project.topics = [
      ...(project.topics || []),
      { id: "t-probe", topic: "probe/level", type: "numeric", examples: ["70"] },
      { id: "t-probe-set", topic: "probe/set", type: "numeric", examples: ["90"] },
    ]
    project.screens[0].objects.push({
      id: "obj-probe-bar",
      type: "level-indicator",
      zIndex: 99,
      ...PROBE_BAR,
      properties: {
        topic: "probe/level",
        writeTopic: "probe/cmd",
        barDirection: "left-to-right",
        displayValue: "none",
        calibrationPoints: [
          { value: 0, barSizePercent: 0 },
          { value: 100, barSizePercent: 100 },
        ],
        fillColor: "#4CAF50",
        textColor: "#000000",
        ...extra,
      },
    })
    zip.file("project.json", JSON.stringify(project))
    const file = path.join(os.tmpdir(), `probe-bar-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return file
  }

  /**
   * The row of pixels through the middle of the bar, found by looking for the
   * fill colour rather than by computing where the bar ought to be. The round
   * device draws an adornment around its screen, so the screen is not centred
   * in the canvas and arithmetic from the object's coordinates lands somewhere
   * else entirely - which is how the first version of these tests came to be
   * sampling white space and passing against deliberately broken code.
   */
  async function barRow(page: Page): Promise<Rgb[]> {
    const { canvas } = await getMainCanvas(page)
    const shot = await canvas.screenshot()
    const image = await Jimp.read(shot)
    const { width, height } = image.bitmap
    const at = (x: number, y: number): Rgb => {
      const i = (y * width + x) * 4
      return [image.bitmap.data[i], image.bitmap.data[i + 1], image.bitmap.data[i + 2]]
    }
    const rowsWithFill: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (same(at(x, y), FILL)) {
          rowsWithFill.push(y)
          break
        }
      }
    }
    expect(rowsWithFill.length, "the bar was not found on the canvas at all").toBeGreaterThan(4)
    const y = rowsWithFill[Math.trunc(rowsWithFill.length / 2)]
    const row: Rgb[] = []
    for (let x = 0; x < width; x++) row.push(at(x, y))
    return row
  }

  test("every pixel of the bar is one of its own colours, with no blends", async ({ page }) => {
    const zipPath = await projectWithExampleBar()
    try {
      await loadProject(page, zipPath)
      const row = await barRow(page)
      const first = row.findIndex((c) => same(c, FILL))
      const last = row.length - 1 - [...row].reverse().findIndex((c) => same(c, TRACK))

      // Between the bar's two ends there is fill, track and background and
      // nothing in between them. A washed-out cap shows up here as a colour
      // that is neither - the user measured 111,186,115 against the fill's
      // 76,175,80 ("die farben an den enden laufen auseinander").
      const strangers = new Set<string>()
      for (let x = first; x <= last; x++) {
        const c = row[x]
        if (!same(c, FILL) && !same(c, TRACK) && !same(c, WHITE)) strangers.add(c.join(","))
      }
      expect([...strangers], "colours that are neither fill, track nor background").toEqual([])
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  test("the gap beside the handle shows the background, and nothing else", async ({ page }) => {
    const zipPath = await projectWithExampleBar()
    try {
      await loadProject(page, zipPath)
      const row = await barRow(page)
      // The handle is the short run of fill colour that stands apart from the
      // long one. Until 2026-09-19 a frame drawn as one pill behind the whole
      // track showed through the slot around it - a grey halo, measured as the
      // border's own #cccccc. There is no frame to show through any more, so
      // what is left to check is that the slot is the background: not track,
      // not fill.
      const runs = groupRuns(row)
      const fillRuns = runs.filter((r) => same(r.colour, FILL))
      expect(fillRuns.length, `expected the fill and the handle apart: ${runs.map((r) => r.colour.join("/") + "x" + r.length).join(" ")}`).toBe(2)
      const handle = fillRuns[1]
      for (const x of [handle.from - 2, handle.to + 2]) {
        expect(row[x], `the gap at x=${x} is not the background`).toEqual(WHITE)
      }
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  test("a setpoint that no finger can drag is drawn as a handle all the same", async ({ page }) => {
    // Until the samples went onto real glass this case drew a tick inside an
    // unbroken track: no overhang, no gap, and in `markerColor` rather than the
    // fill's colour. The user threw it out - a stroke has to look the same
    // wherever it appears (docs/2026-09-19-slider-look.md, decision 4).
    //
    // Reported 70, target 90, and no write topic at all. The target therefore
    // falls in the *unfilled* run, so the handle shows up here as a second run
    // of the fill's colour standing apart from the first.
    const zipPath = await projectWithExampleBar({ writeTopic: "", setpointTopic: "probe/set" })
    try {
      await loadProject(page, zipPath)
      const row = await barRow(page)
      const runs = groupRuns(row)
      const fillRuns = runs.filter((r) => same(r.colour, FILL))
      expect(
        fillRuns.length,
        `expected the fill and a handle apart from it: ${runs.map((r) => r.colour.join("/") + "x" + r.length).join(" ")}`,
      ).toBe(2)
      // And it is a handle, not a tick: the run between the two is background,
      // which is only true if the track was cut around it.
      const between = row[fillRuns[1].from - 2]
      expect(same(between, WHITE), `the slot before the handle is ${between.join(",")}`).toBe(true)
    } finally {
      fs.unlinkSync(zipPath)
    }
  })
})

// The shape of a level indicator (docs/2026-09-19-slider-look.md): whole
// pixels out of integer arithmetic, because the firmware's C++, the Android
// app and the reference page have to produce exactly these. Conformance
// compares the picture on every board; this pins down what it is comparing.
test.describe("the shape of a level", () => {
  const bar = (extra: Record<string, unknown> = {}) =>
    ({
      id: "b",
      type: "level-indicator",
      zIndex: 0,
      x: 20,
      y: 20,
      width: 200,
      height: 40,
      properties: { barDirection: "left-to-right", ...extra },
    }) as any

  const settable = bar({ writeTopic: "cmd/x" })

  test("a bar with nothing else on it is exactly where it always was", () => {
    // The case decision 9 promises not to move: no name, no icon, no number.
    // Along the bar it keeps the 4 it has always had - that is what
    // levelPercentFromPoint inverts, and widening it would silently change what
    // every existing calibration means.
    const plain = bar({ writeTopic: "cmd/x", displayValue: "none" })
    const track = levelTrackRect(plain)
    expect(track.x).toBe(plain.x + LEVEL_PADDING_ALONG)
    expect(track.w).toBe(plain.width - 2 * LEVEL_PADDING_ALONG)
    // Across it the track is the default thickness, in the middle of the object.
    expect(track.h).toBe(LEVEL_DEFAULT_THICKNESS)
    expect(track.y).toBe(plain.y + Math.trunc((plain.height - track.h) / 2))
    // A pill: radius is half the short side.
    expect(track.r).toBe(Math.trunc(track.h / 2))
  })

  test("Material's proportions, as proportions of the thickness", () => {
    // 16 dp of track and a 4 x 44 handle with a 6 dp gap: Google's own numbers
    // at the default thickness, and scaled with it at any other.
    expect(LEVEL_DEFAULT_THICKNESS).toBe(16)
    expect(levelHandleLength(16)).toBe(44)
    expect(levelHandleWidth(44)).toBe(4)
    expect(levelHandleGap(44)).toBe(6)
    // Twice the thickness, twice the parts.
    expect(levelHandleLength(32)).toBe(88)
    expect(levelHandleWidth(88)).toBe(8)
  })

  test("the thickness is the author's, not the object's", () => {
    // The case that asked for it: a vertical tank as wide as its name. Until
    // 2026-09-19 the track was 8/22 of that width - 81 px here.
    const tank = { ...bar({ label: "Wassertank", barDirection: "bottom-to-top" }), width: 225, height: 200 }
    expect(levelTrackRect(tank).w).toBe(LEVEL_DEFAULT_THICKNESS)
    const thick = { ...tank, properties: { ...tank.properties, barThickness: 30 } }
    expect(levelTrackRect(thick).w).toBe(30)
    // With a handle, the handle's length follows the thickness, not the object.
    const settableThick = { ...thick, properties: { ...thick.properties, writeTopic: "cmd/x" } }
    expect(levelHandleRect(settableThick, 50).w).toBe(levelHandleLength(30))
  })

  test("a vertical bar stands in the middle of its width, a horizontal one under its header", () => {
    const tank = { ...bar({ label: "Wassertank", barDirection: "bottom-to-top" }), width: 225, height: 200 }
    const track = levelTrackRect(tank)
    expect(track.x).toBe(tank.x + Math.trunc((tank.width - track.w) / 2))
    // Horizontal with a header, in an object taller than it needs: the bar sits
    // one row under the text and the rest is left empty below it.
    const tall = { ...bar({ label: "Wasser", writeTopic: "cmd/x" }), height: 120 }
    const layout = levelLayout(tall)
    expect(layout.slot.y).toBe(layout.bar.y)
    expect(layout.slot.h).toBe(levelHandleLength(LEVEL_DEFAULT_THICKNESS))
    // Without a header it is centred instead.
    const lone = { ...bar({ writeTopic: "cmd/x", displayValue: "none" }), height: 120 }
    const loneLayout = levelLayout(lone)
    expect(loneLayout.slot.y).toBe(lone.y + Math.trunc((120 - loneLayout.slot.h) / 2))
  })

  test("an object too small for the thickness gives the bar what it has", () => {
    const flat = { ...bar({ displayValue: "none", barThickness: 30 }), height: 10 }
    const track = levelTrackRect(flat)
    expect(track.h).toBe(10)
    expect(track.y).toBe(flat.y)
  })

  test("the number takes its room off the end of the bar, and the finger knows", () => {
    const withNumber = bar({ writeTopic: "cmd/x", displayValue: "percentage", fontSize: 18 })
    const plain = bar({ writeTopic: "cmd/x", displayValue: "none" })
    const track = levelTrackRect(withNumber)
    // Same start, shorter run: the column is at the object's own right edge.
    expect(track.x).toBe(levelTrackRect(plain).x)
    expect(track.w).toBe(levelTrackRect(plain).w - levelValueWidth(withNumber) - LEVEL_GAP)
    // And a finger still means the same place the picture shows - the mapping
    // follows the track rather than the object, or the two would drift apart.
    for (const percent of [0, 25, 50, 100]) {
      const edge = levelEdgeFor(track, false, false, percent)
      const back = levelPercentFromPoint(withNumber, edge, withNumber.y + withNumber.height / 2)
      expect(Math.abs(back - percent)).toBeLessThanOrEqual(1)
    }
  })

  test("a name and an icon take a line off the top, and the bar keeps the rest", () => {
    const named = bar({ writeTopic: "cmd/x", label: "Frischwasser", iconAssetId: "ico", fontSize: 18 })
    const layout = levelLayout(named)
    expect(layout.header).not.toBeNull()
    expect(layout.header!.h).toBe(levelHeaderHeight(named))
    // Nothing overlaps: header, one empty row, and the bar to the object's end.
    expect(layout.bar.y).toBe(named.y + layout.header!.h + LEVEL_HEADER_GAP)
    expect(layout.bar.y + layout.bar.h).toBe(named.y + named.height)
    // The icon is square, at the left edge, and stands on the text's baseline.
    expect(layout.icon!.w).toBe(layout.icon!.h)
    expect(layout.icon!.x).toBe(named.x)
    expect(layout.icon!.y).toBeGreaterThanOrEqual(layout.header!.y)
    expect(layout.icon!.y + layout.icon!.h).toBe(layout.baseline)
    // The text runs from after the icon to the object's right edge; the numbers
    // are laid into its right end at their measured width when drawn
    // (level-header.spec.ts), so nothing is reserved for them here.
    expect(layout.text!.x).toBeGreaterThan(layout.icon!.x + layout.icon!.w)
    expect(layout.text!.x + layout.text!.w).toBe(named.x + named.width)
    expect(layout.value).toBeNull()
    // The handle overhangs the track but stops a row short of the name.
    const handle = levelHandleRect(named, 50)
    expect(handle.y).toBe(layout.bar.y)
    expect(handle.y + handle.h).toBe(layout.bar.y + layout.bar.h)
    expect(handle.h).toBeGreaterThan(layout.track.h)
  })

  test("without a name or an icon there is no header at all", () => {
    const layout = levelLayout(bar({ writeTopic: "cmd/x", displayValue: "none" }))
    expect(layout.header).toBeNull()
    expect(layout.icon).toBeNull()
    expect(layout.text).toBeNull()
    expect(layout.bar.y).toBe(20)
    expect(layout.bar.h).toBe(40)
  })

  test("a finger's position still means what it meant", () => {
    // The mapping is the one thing this redesign must not touch, or every
    // calibration in every existing project quietly means something else.
    for (const percent of [0, 25, 50, 80, 100]) {
      const track = levelTrackRect(settable)
      const edge = levelEdgeFor(track, false, false, percent)
      const back = levelPercentFromPoint(settable, edge, settable.y + settable.height / 2)
      expect(Math.abs(back - percent)).toBeLessThanOrEqual(1)
    }
  })

  test("the handle stands out of the track and stays inside the object", () => {
    for (const percent of [0, 25, 50, 80, 100]) {
      const handle = levelHandleRect(settable, percent)
      const track = levelTrackRect(settable)
      // Taller than the track - that overhang is the whole "lying on top"
      // signal, and on a 1-bit panel the only one available.
      expect(handle.h).toBeGreaterThan(track.h)
      // And never outside its own object: the 4.3B repaints by region, and an
      // object painting past its bounds leaves crumbs when it does.
      expect(handle.y).toBeGreaterThanOrEqual(settable.y)
      expect(handle.y + handle.h).toBeLessThanOrEqual(settable.y + settable.height)
      expect(handle.x).toBeGreaterThanOrEqual(track.x)
      expect(handle.x + handle.w).toBeLessThanOrEqual(track.x + track.w)
      // Centred on the value, except where it is clamped at the ends.
      if (percent > 5 && percent < 95) {
        const edge = levelEdgeFor(track, false, false, percent)
        expect(Math.abs(handle.x + handle.w / 2 - edge)).toBeLessThanOrEqual(handle.w)
      }
    }
  })

  test("nothing is painted where the handle and its gap are", () => {
    const percent = 50
    const handle = levelHandleRect(settable, percent)
    const gap = levelHandleGap(settable.height)
    const segments = levelSegments(settable, percent, handle)
    for (const seg of segments) {
      const clearOfHandle = seg.x + seg.w <= handle.x - gap || seg.x >= handle.x + handle.w + gap
      expect(clearOfHandle, `segment ${seg.x}..${seg.x + seg.w} vs handle ${handle.x}`).toBe(true)
    }
    // And the rest of the track is covered: filled to the left, tinted right.
    const track = levelTrackRect(settable)
    expect(segments.some((s) => s.role === "fill" && s.x === track.x)).toBe(true)
    expect(segments.some((s) => s.role === "track" && s.x + s.w === track.x + track.w)).toBe(true)
    // Every run is a pill, including the ends facing the gap.
    for (const seg of segments) expect(seg.r).toBe(track.r)
  })

  test("a displaced handle cuts the run it is over, not the other one", () => {
    // Fill at 30, asked for 75: the handle sits in the unfilled part, so the
    // filled run is whole and the tinted one is in two pieces.
    const handle = levelHandleRect(settable, 75)
    const segments = levelSegments(settable, 30, handle)
    expect(segments.filter((s) => s.role === "fill")).toHaveLength(1)
    expect(segments.filter((s) => s.role === "track")).toHaveLength(2)
  })

  test("at the ends there is no run left behind the handle", () => {
    for (const percent of [0, 100]) {
      const handle = levelHandleRect(settable, percent)
      const segments = levelSegments(settable, percent, handle)
      for (const seg of segments) expect(seg.w).toBeGreaterThan(0)
    }
  })

  test("a vertical bar turns all of it the other way", () => {
    const vertical = bar({ writeTopic: "cmd/x", barDirection: "bottom-to-top" })
    const track = levelTrackRect(vertical)
    expect(track.w).toBe(LEVEL_DEFAULT_THICKNESS)
    expect(track.x).toBe(vertical.x + Math.trunc((vertical.width - track.w) / 2))
    expect(track.y).toBe(vertical.y + LEVEL_PADDING_ALONG)
    const handle = levelHandleRect(vertical, 50)
    expect(handle.w).toBe(levelHandleLength(LEVEL_DEFAULT_THICKNESS))
    expect(handle.h).toBeLessThan(track.h)
    // Bottom-to-top: half way up is half way from the bottom.
    const edge = levelEdgeFor(track, true, true, 50)
    expect(Math.abs(handle.y + handle.h / 2 - edge)).toBeLessThanOrEqual(handle.h)
  })

  test("a bar with no write topic gets no handle at all", () => {
    const readOnly = bar()
    const segments = levelSegments(readOnly, 50, null)
    // Two runs, no gap: a tank is one unbroken pill of each colour.
    expect(segments).toHaveLength(2)
    expect(segments[0].role).toBe("fill")
    expect(segments[1].role).toBe("track")
    expect(segments[0].x + segments[0].w).toBe(segments[1].x)
  })
})
