import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { loadProject } from "./helpers"
import { seedWaveshare4v3bDdf } from "./ddf-seed"

// The live preview keeps answering a click while a large project takes in a
// stream of values, on a slow browser (#58, docs/2026-10-09-preview-
// performance.md). Tester Arno saw "Reaktionszeit ca. 15 Sek" in the preview
// of a four-screen project with some thirty values of his own; measured in
// the van on 2026-10-08, a project like this one at 6x CPU throttling did not
// answer a click within 30 s, while it took 0.07 s unthrottled. Every value
// redrew the whole canvas twice, and the Switches' pills were rasterized
// anew each time.
//
// At 10x, about a tablet's browser (the goal agreed 2026-10-09): before the
// fix this project took 1.7 s a click here, after it 0.6 s.
//
// Against the local broker (`npm run hil:broker`), like every MQTT spec here,
// on topics only this run uses. The timing test is tagged @alone: test:all
// runs it after the rest, one browser at a time (hil/test-all.js) - in the
// full parallel run it measured 1.2 s where it takes 0.6 s alone.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const DEVICE_ID = "e2e-preview-load-4v3b"
const W = 800
const H = 480
// What a click may take, from pointerdown to the Switch drawn anew, at 10x.
// The goal is 0.3 s on a production build; `next dev` and three browsers
// beside this one cost more, so the line here is drawn where a stalled
// preview cannot pass and a working one cannot fail.
const CLICK_LIMIT_MS = 1000
const THROTTLE = 10
const VALUES_PER_SECOND = 30

// Four screens of texts reading values, sliders and Switches, about 230
// objects; on the first, top left, the Switch the test clicks.
function largeProject(prefix: string) {
  let id = 0
  const sw = (x: number, y: number, w: number, h: number, topic: string, writeTopic: string) => ({
    id: `obj-${++id}`, type: "switch", x, y, width: w, height: h, zIndex: id,
    properties: {
      topic, writeTopic, switchStyle: "filled", switchColor: "accent", fontId: "font-helvR12",
      states: [
        { id: "off", label: "Off", readValue: "off", writeValue: "off", showAsOn: false },
        { id: "on", label: "On", readValue: "on", writeValue: "on", showAsOn: true },
      ],
    },
  })
  const filler = (screen: number, startY: number) => {
    const objects: unknown[] = []
    let n = 0
    for (let y = startY; y + 46 <= H - 10; y += 46) {
      for (let c = 0; c < 6; c++, n++) {
        const x = 5 + c * 130
        const k = (screen * 100 + n) % VALUES_PER_SECOND
        if (n % 4 === 3) {
          objects.push({
            id: `obj-${++id}`, type: "slider", x, y, width: 120, height: 40, zIndex: id,
            properties: {
              topic: `${prefix}/s/${k}`, writeTopic: `${prefix}/sc/${k}`, direction: "left-to-right", thickness: 10,
              calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }],
              fillColor: "accent", textColor: "text", fontId: "font-helvR12", label: `S${n}`,
            },
          })
        } else if (n % 4 === 2) {
          objects.push(sw(x, y, 120, 40, `${prefix}/w/${k}`, `${prefix}/wc/${k}`))
        } else {
          objects.push({
            id: `obj-${++id}`, type: "text", x, y, width: 120, height: 40, zIndex: id,
            properties: { text: `T${n} {topic:${prefix}/v/${k}} °C`, fontId: "font-helvR12", color: "text", textAlign: "left" },
          })
        }
      }
    }
    return objects
  }
  const screens = [0, 1, 2, 3].map((i) => ({
    id: `screen-${i + 1}`,
    name: `Screen ${i + 1}`,
    objects: i === 0 ? [sw(20, 20, 240, 70, `${prefix}/dimmer/state`, `${prefix}/dimmer/cmd`), ...filler(i, 100)] : filler(i, 10),
  }))
  const topics = new Set<string>()
  for (const s of screens) for (const o of s.objects as any[]) {
    if (o.properties.topic) topics.add(o.properties.topic)
    const m = /\{topic:([^}]+)\}/.exec(o.properties.text ?? "")
    if (m) topics.add(m[1])
  }
  return {
    name: "preview-performance",
    screenWidth: W,
    screenHeight: H,
    screens,
    assets: [],
    fonts: [],
    hardwareButtons: [],
    snapGuides: [],
    nextId: id + 1,
    settings: { exportFormat: "esp32", gridSize: 20, snapTolerance: 8, colorDepth: "24bit", deviceId: DEVICE_ID, deviceName: "[e2e] 4.3B" },
    topics: [...topics].map((topic, i) => ({ id: `t-${i}`, topic, type: "text", examples: ["1"] })),
  }
}

async function projectZip(prefix: string): Promise<string> {
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(largeProject(prefix)))
  const file = path.join(os.tmpdir(), `preview-performance-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

function connectBroker(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `e2e-perf-${Date.now()}-${Math.random()}`, reconnectPeriod: 0 })
    client.once("connect", () => resolve(client))
    client.once("error", reject)
  })
}

// The editor's canvas: the largest one on the page.
async function canvasBox(page: Page) {
  let best: { x: number; y: number; width: number; height: number } | null = null
  for (const c of await page.locator("canvas").all()) {
    const b = await c.boundingBox()
    if (b && (!best || b.width * b.height > best.width * best.height)) best = b
  }
  return best!
}

// In the page: resolves with the ms from the next pointerdown to the first
// frame in which the clicked Switch's pixels differ, -1 after 20 s.
async function armClickToPaint(page: Page): Promise<void> {
  await page.evaluate(([w, h]) => {
    const canvases = [...document.querySelectorAll("canvas")]
    const cv = canvases.reduce((a, b) => (b.clientWidth * b.clientHeight > a.clientWidth * a.clientHeight ? b : a))
    const r = cv.getBoundingClientRect()
    const sx = cv.width / r.width
    const sy = cv.height / r.height
    const ox = r.width / 2 - w / 2
    const oy = r.height / 2 - h / 2
    const hash = () => {
      const d = cv.getContext("2d")!.getImageData((ox + 20) * sx, (oy + 20) * sy, 240 * sx, 70 * sy).data
      let v = 0
      for (let i = 0; i < d.length; i += 16) v = (v * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0
      return v
    }
    ;(window as any).__clickToPaint = new Promise((resolve) => {
      const before = hash()
      window.addEventListener("pointerdown", () => {
        const t0 = performance.now()
        const tick = () => {
          if (hash() !== before) resolve(Math.round(performance.now() - t0))
          else if (performance.now() - t0 > 20000) resolve(-1)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, { once: true, capture: true })
    })
  }, [W, H])
}

test.describe("preview performance", () => {
  test.beforeEach(async () => {
    const seeded = await seedWaveshare4v3bDdf(DEVICE_ID)
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test(`a click is drawn within ${CLICK_LIMIT_MS} ms in a large project taking ${VALUES_PER_SECOND} values a second, at ${THROTTLE}x CPU @alone`, async ({ page }) => {
    test.setTimeout(180_000)
    const prefix = `e2e-perf/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const zipPath = await projectZip(prefix)
    let tick = 0
    const stream = setInterval(() => {
      tick++
      for (let i = 0; i < VALUES_PER_SECOND; i++) broker.publish(`${prefix}/v/${i}`, String((tick * 7 + i) % 100))
    }, 1000)
    // The installation's answer, as the VanPi bridge gives it: the state
    // follows the command. Without one a Switch waits for it, and a second
    // click has nothing new to draw.
    await new Promise<void>((resolve) => broker.subscribe(`${prefix}/dimmer/cmd`, () => resolve()))
    broker.on("message", (topic, payload) => {
      if (topic === `${prefix}/dimmer/cmd`) broker.publish(`${prefix}/dimmer/state`, payload.toString(), { retain: true })
    })
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
      // Long enough for a backlog to build, as it did in the van.
      await page.waitForTimeout(5000)

      const box = await canvasBox(page)
      const ox = box.x + box.width / 2 - W / 2
      const oy = box.y + box.height / 2 - H / 2
      const times: number[] = []
      for (const on of [true, false, true]) {
        await armClickToPaint(page)
        await page.mouse.click(ox + 20 + (on ? 180 : 60), oy + 55)
        times.push(await page.evaluate(() => (window as any).__clickToPaint))
        await page.waitForTimeout(1500)
      }
      console.log(`[preview-performance] click -> paint at ${THROTTLE}x: ${times.join(", ")} ms`)
      for (const t of times) {
        expect(t, "the click was never drawn").toBeGreaterThanOrEqual(0)
        expect(t).toBeLessThan(CLICK_LIMIT_MS)
      }
    } finally {
      clearInterval(stream)
      await new Promise((resolve) => broker.publish(`${prefix}/dimmer/state`, "", { retain: true }, resolve))
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })

  // A value only a screen out of view reads is taken in without a redraw of
  // its own (#58) - but the screen shows it the moment it comes into view,
  // and the list of topic values beside the preview within half a second.
  test("a value for a screen out of view is there the moment that screen is shown", async ({ page }) => {
    const prefix = `e2e-perf/${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const broker = await connectBroker()
    const project = {
      ...largeProject(prefix),
      screens: [
        {
          id: "screen-1",
          name: "Screen 1",
          objects: [{ id: "go", type: "button", x: 300, y: 200, width: 200, height: 60, zIndex: 1, properties: { text: "Go", buttonStyle: "tonal", action: { type: "goto-screen", targetScreenId: "screen-2" } } }],
        },
        {
          id: "screen-2",
          name: "Screen 2",
          objects: [{ id: "far", type: "text", x: 100, y: 100, width: 400, height: 60, zIndex: 1, properties: { text: `{topic:${prefix}/far}`, fontId: "font-helvR24", color: "text", textAlign: "left" } }],
        },
      ],
      topics: [{ id: "t-far", topic: `${prefix}/far`, type: "text", examples: [""] }],
    }
    const zip = new JSZip()
    zip.file("project.json", JSON.stringify(project))
    const zipPath = path.join(os.tmpdir(), `preview-performance-far-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(zipPath, await zip.generateAsync({ type: "nodebuffer" }))
    try {
      await loadProject(page, zipPath)
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await expect(page.getByTestId("preview-source-status")).toContainText("Live", { timeout: 10000 })
      const box = await canvasBox(page)
      const ox = box.x + box.width / 2 - W / 2
      const oy = box.y + box.height / 2 - H / 2
      // Dark pixels where screen 2's text stands.
      const ink = () =>
        page.evaluate(([w, h]) => {
          const canvases = [...document.querySelectorAll("canvas")]
          const cv = canvases.reduce((a, b) => (b.clientWidth * b.clientHeight > a.clientWidth * a.clientHeight ? b : a))
          const r = cv.getBoundingClientRect()
          const sx = cv.width / r.width
          const sy = cv.height / r.height
          const x = r.width / 2 - w / 2 + 100
          const y = r.height / 2 - h / 2 + 100
          const d = cv.getContext("2d")!.getImageData(x * sx, y * sy, 400 * sx, 60 * sy).data
          let n = 0
          for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) n++
          return n
        }, [W, H])

      await new Promise((resolve) => broker.publish(`${prefix}/far`, "8888888888", { qos: 1 }, resolve))
      await page.mouse.click(ox + 400, oy + 230)
      // Drawn within a few frames, not after the half second a quiet value waits.
      await expect.poll(ink, { timeout: 300, intervals: [50] }).toBeGreaterThan(50)
      await expect(page.locator("label", { hasText: `${prefix}/far` }).first().locator("xpath=../..").locator("input, textarea").first()).toHaveValue("8888888888")
    } finally {
      broker.end(true)
      fs.unlinkSync(zipPath)
    }
  })
})
