import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject, getMainCanvas, devicePoint, ROUND_FIXTURE_SCREEN } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// The live preview (docs/2026-09-15-live-data.md, decision 5): with a broker
// answering, preview shows what the broker holds and publishes a tap for
// real - the device's behaviour, not the simulation's. Where the broker holds
// nothing, nothing is shown (decision 6), which is what a panel shows too.
//
// Against the local broker (`npm run hil:broker`), like every other MQTT spec
// here. Each test uses topics of its own, so retained values from a previous
// run or a parallel test cannot answer for it.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

// The switch fixture, with its two switch topics moved under a prefix only
// this test uses, and one more topic nothing will publish to. The mode
// topic's first example becomes "low": the middle segment is the only one
// whose bar the round screen shows whole - the first segment's top corner
// lies outside the circle, under the adornment.
async function projectWithTopics(prefix: string, extra?: (project: any) => void): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  const rename: Record<string, string> = {
    "test/switch-mode": `${prefix}/mode`,
    "test/switch-cmd": `${prefix}/cmd`,
  }
  for (const topic of project.topics) if (rename[topic.topic]) topic.topic = rename[topic.topic]
  project.topics.find((t: any) => t.topic === `${prefix}/mode`).examples = ["low", "off", "high"]
  project.topics.push({ id: "t-silent", topic: `${prefix}/silent`, type: "text", examples: ["42"] })
  const sw = project.screens[0].objects[0]
  sw.properties.topic = rename["test/switch-mode"]
  sw.properties.writeTopic = rename["test/switch-cmd"]
  // The one colour a Switch has since 2026-09-20: the reported state's pill is
  // drawn in it (docs/2026-09-20-switch-look.md), which is what the pixel count
  // below looks for. It used to be the marker bar's activeBackgroundColor.
  sw.properties.switchColor = "#2563eb"
  extra?.(project)
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `live-preview-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-live-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

function publish(client: mqtt.MqttClient, topic: string, payload: string, retain: boolean): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, payload, { qos: 1, retain }, (err) => (err ? reject(err) : resolve())),
  )
}

const valueField = (page: Page, topic: string) =>
  page.locator("label", { hasText: topic }).first().locator("xpath=../..").locator("input, textarea").first()

// Dark pixels in a device-coordinate rectangle of the editor canvas - "how
// much text is drawn there", for comparing two fields rather than reading one.
async function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number): Promise<number> {
  const { canvas: mainCanvas, box } = await getMainCanvas(page)
  const origin = devicePoint(box, 0, 0, ROUND_FIXTURE_SCREEN)
  return mainCanvas.evaluate(
    (canvas: HTMLCanvasElement, [ax, ay, bx, by]) => {
      const r = canvas.getBoundingClientRect()
      const sx = canvas.width / r.width
      const sy = canvas.height / r.height
      const data = canvas.getContext("2d")!.getImageData(ax * sx, ay * sy, (bx - ax) * sx, (by - ay) * sy).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) count++
      return count
    },
    [origin.x - box.x + x0, origin.y - box.y + y0, origin.x - box.x + x1, origin.y - box.y + y1],
  )
}

// Pixels of the reported state's own pill (#2563eb, give or take a
// colour-depth step) inside the Switch's box on the editor canvas. Close to
// that colour, not merely blue: the round device's adornment ring is blue too,
// and its corner overlaps the Switch's first segment.
async function markerPixels(page: Page, deviceX0: number, deviceX1: number): Promise<number> {
  const { canvas: mainCanvas, box } = await getMainCanvas(page)
  const origin = devicePoint(box, 0, 0, ROUND_FIXTURE_SCREEN)
  // The main canvas, not the first in the page - that one is the screen's
  // thumbnail in the Screens panel.
  return mainCanvas.evaluate(
    (canvas: HTMLCanvasElement, [x0, x1, y0, y1]) => {
      const r = canvas.getBoundingClientRect()
      const sx = canvas.width / r.width
      const sy = canvas.height / r.height
      const data = canvas.getContext("2d")!.getImageData(x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - 0x25) <= 8 && Math.abs(data[i + 1] - 0x63) <= 8 && Math.abs(data[i + 2] - 0xeb) <= 8) count++
      return count
    },
    [origin.x - box.x + deviceX0, origin.x - box.x + deviceX1, origin.y - box.y + 20, origin.y - box.y + 70],
  )
}

test.describe("live preview", () => {
  test.beforeEach(async () => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("shows what the broker holds, nothing where it holds nothing, and publishes a tap for real", async ({ page }) => {
    const prefix = `e2e-live/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const zipPath = await projectWithTopics(prefix)
    try {
      await publish(broker, `${prefix}/mode`, "high", true)

      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      await expect(page.getByRole("button", { name: "Live", exact: true })).toHaveAttribute("aria-pressed", "true")

      // The retained value, not the topic's first example ("low").
      await expect(valueField(page, `${prefix}/mode`)).toHaveValue("high")
      // Nothing was ever published here: no value, not the example "42".
      await expect(valueField(page, `${prefix}/silent`)).toHaveValue("")

      // And the canvas draws the broker's value: the third segment ("high")
      // carries the bar, the middle one - the example's - does not.
      await expect.poll(() => markerPixels(page, 160, 225)).toBeGreaterThan(0)
      expect(await markerPixels(page, 85, 155)).toBe(0)

      // A tap is a real publish on the write topic ...
      const heard = new Promise<string>((resolve) => {
        broker.on("message", (topic, payload) => {
          if (topic === `${prefix}/cmd`) resolve(payload.toString())
        })
      })
      await new Promise<void>((resolve) => broker.subscribe(`${prefix}/cmd`, () => resolve()))
      const { box } = await getMainCanvas(page)
      const low = devicePoint(box, 120, 45, ROUND_FIXTURE_SCREEN)
      await page.mouse.click(low.x, low.y)
      expect(await heard).toBe("low")

      // ... and nothing answers it but the broker: no mock engine in live
      // mode, so the state is still what the broker last said.
      await page.waitForTimeout(500)
      await expect(valueField(page, `${prefix}/mode`)).toHaveValue("high")

      // Until something on the broker answers.
      await publish(broker, `${prefix}/mode`, "low", true)
      await expect(valueField(page, `${prefix}/mode`)).toHaveValue("low")
      await expect.poll(() => markerPixels(page, 85, 155)).toBeGreaterThan(0)
      expect(await markerPixels(page, 160, 225)).toBe(0)
    } finally {
      await publish(broker, `${prefix}/mode`, "", true).catch(() => {})
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })

  test("a topic without a value draws nothing on the canvas", async ({ page }) => {
    const prefix = `e2e-live/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const zipPath = await projectWithTopics(prefix)
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })

      // Nothing published to the mode topic: no segment marked anywhere,
      // where the simulation would mark the first example's.
      await page.waitForTimeout(500)
      expect(await markerPixels(page, 10, 230)).toBe(0)

      await page.getByRole("button", { name: "Simulation", exact: true }).click()
      await expect.poll(() => markerPixels(page, 85, 155)).toBeGreaterThan(0)
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  // Found on the van's own designer the day the preview went live: the
  // editor canvas formatted a data field with a copy of its own that left
  // the prefix and unit off in "Display as-is" - "13.58" where the panel
  // shows "13.58 V". Two fields on one topic, one with a prefix and a unit:
  // the one with them has to draw more.
  test("a data field shows its prefix and unit around the live value, as the device does", async ({ page }) => {
    const prefix = `e2e-live/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const field = (id: string, y: number, props: Record<string, string>) => ({
      id,
      type: "live-text",
      zIndex: 3,
      x: 90,
      y,
      width: 180,
      height: 30,
      properties: {
        topic: `${prefix}/volt`,
        displayAs: "Display as-is",
        textColor: "#000000",
        color: "#000000",
        backgroundColor: "#ffffff",
        borderColor: "transparent",
        ...props,
      },
    })
    const broker = await connectBroker()
    const zipPath = await projectWithTopics(prefix, (project) => {
      project.topics.push({ id: "t-volt", topic: `${prefix}/volt`, type: "numeric", examples: ["1"] })
      project.screens[0].objects.push(
        field("obj-bare", 150, {}),
        field("obj-dressed", 220, { prefix: "Batt ", postfix: " Volt" }),
      )
    })
    try {
      await publish(broker, `${prefix}/volt`, "13.58", true)
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      await expect(valueField(page, `${prefix}/volt`)).toHaveValue("13.58")

      await expect.poll(() => inkPixels(page, 90, 150, 270, 180)).toBeGreaterThan(0)
      const bare = await inkPixels(page, 90, 150, 270, 180)
      const dressed = await inkPixels(page, 90, 220, 270, 250)
      expect(dressed, `with prefix and unit ${dressed} px, value alone ${bare} px`).toBeGreaterThan(bare * 1.5)
    } finally {
      await publish(broker, `${prefix}/volt`, "", true).catch(() => {})
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })

  test("switching to simulation brings back the examples and the mock engine", async ({ page }) => {
    const prefix = `e2e-live/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const zipPath = await projectWithTopics(prefix)
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      await expect(valueField(page, `${prefix}/silent`)).toHaveValue("")

      await page.getByRole("button", { name: "Simulation", exact: true }).click()
      await expect(page.getByRole("button", { name: "Simulation", exact: true })).toHaveAttribute("aria-pressed", "true")
      await expect(valueField(page, `${prefix}/silent`)).toHaveValue("42")

      // The Switch round trip is the mock engine's again.
      const { box } = await getMainCanvas(page)
      const high = devicePoint(box, 200, 45, ROUND_FIXTURE_SCREEN)
      await page.mouse.click(high.x, high.y)
      await expect(valueField(page, `${prefix}/mode`)).toHaveValue("high")
    } finally {
      fs.unlinkSync(zipPath)
    }
  })

  test("without a broker it simulates, and says so", async ({ page }) => {
    // Nothing listens on port 9: the stored broker override is what the
    // preview connects to, the same one the Deploy dialog remembers.
    await page.addInitScript(() => {
      window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://127.0.0.1:9" }))
    })
    const prefix = `e2e-live/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const zipPath = await projectWithTopics(prefix)
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("No broker", { timeout: 15000 })
      await expect(page.getByRole("button", { name: "Simulation", exact: true })).toHaveAttribute("aria-pressed", "true")
      await expect(valueField(page, `${prefix}/silent`)).toHaveValue("42")
    } finally {
      fs.unlinkSync(zipPath)
    }
  })
})
