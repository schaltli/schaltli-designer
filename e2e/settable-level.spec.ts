import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint } from "./helpers"
import {
  calculateLevelIndicatorFill,
  computeMarkerRect,
  levelValueFromFill,
  snapToStep,
} from "../components/canvas/renderers/render-level-indicator"
import { calibrationIsMonotonic, settableRange } from "../lib/settable-level"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const COMBINED_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "combined-test-project.zip")

// A settable bar on the e-paper fixture's first screen, its own topics, and a
// step of 5 - the geometry the drag below aims at.
const BAR = { x: 40, y: 40, width: 200, height: 40 }

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
      backgroundColor: "#ffffff",
      borderColor: "#cccccc",
      fillColor: "#4CAF50",
      textColor: "#000000",
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

      // Press at a quarter of the bar and drag to four fifths. The bar spans
      // its own padding of 4, so the ends are reachable.
      const { box } = await getMainCanvas(page)
      const at = (fraction: number) =>
        devicePoint(box, BAR.x + 4 + (BAR.width - 8) * fraction, BAR.y + BAR.height / 2)
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

      // Nothing has answered yet, so what the finger set is what is shown -
      // not the 10 the broker still holds.
      const held = commands[commands.length - 1]
      await expect(valueField(page, `${prefix}/level`)).toHaveValue(held)

      // The installation answers with something else: its word wins.
      await publish(broker, `${prefix}/level`, "42")
      await expect(valueField(page, `${prefix}/level`)).toHaveValue("42")
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

// The marker itself, on the bar: what was asked for, beside what is measured.
// Its rectangle is computed in the same inner box and with the same
// truncation the fill uses, so a marker at the value the fill reaches sits on
// the fill's edge rather than a pixel beside it - which is what "the two
// coincide once the command landed" means in pixels.
test.describe("the setpoint marker on a bar", () => {
  const bar = {
    id: "b",
    type: "level-indicator",
    zIndex: 0,
    x: 20,
    y: 20,
    width: 200,
    height: 40,
    properties: { markerWidth: 4, barDirection: "left-to-right" },
  } as any

  test("sits on the fill's own edge at the same value", () => {
    for (const percent of [0, 25, 50, 80, 100]) {
      const marker = computeMarkerRect(bar, percent)
      const innerX = bar.x + 4
      const innerWidth = bar.width - 8
      const fillEdge = innerX + Math.trunc((innerWidth * percent) / 100)
      // Centred on the edge, and never hanging out of the bar.
      expect(marker.x).toBeGreaterThanOrEqual(innerX)
      expect(marker.x + marker.w).toBeLessThanOrEqual(innerX + innerWidth)
      expect(Math.abs(marker.x + marker.w / 2 - fillEdge)).toBeLessThanOrEqual(2)
      expect(marker.h).toBe(bar.height - 8)
    }
  })

  test("runs across the bar the other way when the bar does", () => {
    const vertical = { ...bar, properties: { ...bar.properties, barDirection: "bottom-to-top" } }
    const marker = computeMarkerRect(vertical, 50)
    expect(marker.w).toBe(vertical.width - 8)
    expect(marker.h).toBe(4)
    const innerY = vertical.y + 4
    const innerHeight = vertical.height - 8
    const fillEdge = innerY + innerHeight - Math.trunc((innerHeight * 50) / 100)
    expect(Math.abs(marker.y + marker.h / 2 - fillEdge)).toBeLessThanOrEqual(2)
  })
})
