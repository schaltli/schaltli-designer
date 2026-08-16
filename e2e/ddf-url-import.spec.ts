import { test, expect } from "@playwright/test"
import http from "node:http"
import JSZip from "jszip"
import { rm } from "fs/promises"
import { join } from "path"
import { serverLanAddress } from "../lib/server-lan-address"

// Covers the manual "Add device from URL" path (2026-08-16,
// components/ddf-url-import.tsx + app/api/ddf/fetch/route.ts's now-optional
// deviceId) - the other half of decoupling the designer from any baked-in
// device knowledge, alongside DDF auto-discovery
// (e2e/ddf-auto-discovery.spec.ts) which is triggered by a live device's
// MQTT hello instead of a human pasting a URL. No broker involved here.

const DATA_DDF_DIR = join(__dirname, "..", ".data", "ddf")

async function buildTestDdfZip(deviceId: string, deviceName: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      ddfVersion: "1.0",
      device: { id: deviceId, name: deviceName },
      screen: { width: 10, height: 10, colorDepth: "1bit" },
      adornment: { svgPath: "adornment.svg" },
      hardwareButtons: [],
      fonts: [],
      supportedObjectTypes: [],
    }),
  )
  zip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

test.describe("Manual DDF import from URL", () => {
  test("importing a DDF with no prior deviceId derives it from the manifest and caches it", async ({ request }, testInfo) => {
    const deviceId = `e2e-url-import-${testInfo.testId}`
    const zipBytes = await buildTestDdfZip(deviceId, `URL-Imported ${testInfo.testId}`)

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(zipBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    try {
      // No deviceId/ddfVersion in the body - this is the trust-on-first-use
      // path a human pasting a URL takes, distinct from the hello-triggered
      // cross-check path e2e/ddf-auto-discovery.spec.ts exercises.
      const res = await request.post("/api/ddf/fetch", { data: { url: ddfUrl } })
      expect(res.ok()).toBe(true)
      const body = await res.json()
      expect(body.deviceId).toBe(deviceId)
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("the Startup Gate's URL-import form adds a device and it becomes selectable", async ({ page }, testInfo) => {
    const deviceId = `e2e-url-import-ui-${testInfo.testId}`
    const deviceName = `URL-Imported UI ${testInfo.testId}`
    const zipBytes = await buildTestDdfZip(deviceId, deviceName)

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(zipBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    try {
      await page.goto("/")
      await expect(page.getByText("Server DDFs", { exact: true })).toBeVisible()

      await page.getByTestId("ddf-url-import-input").fill(ddfUrl)
      await page.getByTestId("ddf-url-import-submit").click()

      await expect(page.getByText("Announced Devices", { exact: true })).toBeVisible()
      const card = page.locator(`[data-ddf-section="auto-discovered"] [data-device-id="${deviceId}"]`)
      await expect(card).toBeVisible()
      await card.click()
      await expect(page.getByRole("button", { name: "Create Project" })).toBeEnabled()
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("rejects loopback/link-local url hosts, same guard as the hello-triggered path", async ({ request }) => {
    for (const url of ["http://127.0.0.1:1/ddf.zip", "http://localhost:1/ddf.zip", "http://169.254.1.1/ddf.zip"]) {
      const res = await request.post("/api/ddf/fetch", { data: { url } })
      expect(res.status(), `url=${url}`).toBe(400)
    }
  })
})
