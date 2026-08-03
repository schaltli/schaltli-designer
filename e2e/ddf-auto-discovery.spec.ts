import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import http from "node:http"
import JSZip from "jszip"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { serverLanAddress } from "../lib/server-lan-address"

// Covers app/api/ddf/fetch + app/api/ddf/list's merge of public/ddf (curated)
// with .data/ddf (auto-fetched) - the designer-side half of the DDF
// auto-discovery plan (2026-08-03 grilling session; the firmware side -
// MqttEPaperDisplay2 actually announcing ddfVersion+url in its own hello -
// is separate, tracked there). A device's `hello` carries `ddfVersion`+
// `url`; when the browser (components/device-scan-section.tsx) sees a
// deviceId/version combo it doesn't have cached, it asks the server to
// fetch that url, which then becomes available in the "New Project" list -
// no manual public/ddf/ file drop needed.
//
// Runs against the local broker (hil/local-broker.js, `npm run hil:broker`)
// like the other MQTT-flow specs. The "device serving its own DDF" side of
// the flow is stood in for by a plain node:http server this test spins up
// itself (same idea as deploy-dialog.spec.ts's fake MQTT device - a real
// device firmware just happens to serve this from an on-device WebServer
// instead, see app/api/ddf/fetch/route.ts's header comment).

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const PUBLIC_DDF_DIR = join(__dirname, "..", "public", "ddf")
const DATA_DDF_DIR = join(__dirname, "..", ".data", "ddf")

async function buildTestDdfZip(deviceId: string, ddfVersion: string, deviceName: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      ddfVersion,
      device: { id: deviceId, name: deviceName },
      screen: { width: 10, height: 10, colorDepth: "1bit" },
      adornment: {
        svgPath: "adornment.svg",
        drawingArea: { x: 0, y: 0, width: 10, height: 10, svgViewBox: { x: 0, y: 0, width: 10, height: 10 } },
      },
      hardwareButtons: [],
      fonts: [],
      supportedObjectTypes: [],
    }),
  )
  zip.file("adornment.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"></svg>`)
  return zip.generateAsync({ type: "nodebuffer" })
}

test.describe("DDF auto-discovery", () => {
  test("a device's hello with an unknown ddfVersion+url gets fetched and becomes available", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-auto-ddf-${testInfo.testId}`
    const instanceId = `e2e-auto-ddf-instance-${testInfo.testId}`
    const zipBytes = await buildTestDdfZip(deviceId, "1.0", `Auto-Discovered ${testInfo.testId}`)

    // Stands in for the device's own on-device HTTP server (see this file's
    // header comment) - serves the exact bytes a real device's WebServer
    // would, at a URL only this test knows about.
    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(zipBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-auto-ddf-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${instanceId}/hello`,
        JSON.stringify({ deviceId, name: `Auto-Discovered ${testInfo.testId}`, ddfVersion: "1.0", url: ddfUrl }),
        { retain: true },
      )

      // Fresh load (no project, no restorable autosave) - the Startup Gate
      // itself runs the scan, no dialog to open first.
      await page.goto("/")
      await expect(page.getByText(`Auto-Discovered ${testInfo.testId}`)).toBeVisible({ timeout: 15000 })
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/hello`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("rejects loopback/link-local url hosts", async ({ request }) => {
    for (const url of ["http://127.0.0.1:1/ddf.zip", "http://localhost:1/ddf.zip", "http://169.254.1.1/ddf.zip"]) {
      const res = await request.post("/api/ddf/fetch", {
        data: { deviceId: "whatever-device", ddfVersion: "1.0", url },
      })
      expect(res.status(), `url=${url}`).toBe(400)
    }
  })

  test("rejects a fetched DDF whose own deviceId doesn't match what was announced", async ({ request }) => {
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine")

    // Reuses the real, already-statically-served public/ddf fixture - its
    // own device.json claims "mqtt-epaper-display-2", not what's announced
    // below, so this only exercises the mismatch check (nothing gets
    // written either way).
    const res = await request.post("/api/ddf/fetch", {
      data: {
        deviceId: "not-the-real-device-id",
        ddfVersion: "1.0",
        url: `http://${lanIp}:3000/ddf/mqtt-epaper-display.ddf.zip`,
      },
    })
    expect(res.status()).toBe(422)
  })

  test("an auto-fetched DDF in .data/ddf takes precedence over a same-deviceId public/ddf entry", async ({
    request,
  }, testInfo) => {
    const deviceId = `e2e-precedence-${testInfo.testId}`
    const publicZip = await buildTestDdfZip(deviceId, "1.0", "Curated Copy")
    const dataZip = await buildTestDdfZip(deviceId, "2.0", "Auto-Fetched Copy")

    await writeFile(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), publicZip)
    await mkdir(DATA_DDF_DIR, { recursive: true })
    await writeFile(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), dataZip)

    try {
      const res = await request.get("/api/ddf/list")
      const { devices } = await res.json()
      const entry = devices.find((d: { deviceId: string | null }) => d.deviceId === deviceId)
      expect(entry?.ddfVersion).toBe("2.0")
      expect(entry?.deviceName).toBe("Auto-Fetched Copy")
      expect(entry?.path).toBe(`/api/ddf/data/${deviceId}.ddf.zip`)
    } finally {
      await rm(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })
})
