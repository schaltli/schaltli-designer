import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import http from "node:http"
import JSZip from "jszip"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { serverLanAddress } from "../lib/server-lan-address"

// Covers the designer side of "Recover project from device"
// (recover-project-dialog.tsx, 2026-08-15 - docs/nested-provenance.md's
// "Version compatibility" > Fall 3). No real device involved: this test's
// own http server stands in for TestInterfaceServer's GET
// /recovery-project the same way e2e/ddf-auto-discovery.spec.ts's fake
// servers stand in for GET /ddf.zip. Runs against the local broker
// (hil/local-broker.js, `npm run hil:broker`) like every other MQTT-flow
// spec - the firmware-side retention itself
// (DeployManager.cpp/TestInterfaceServer.cpp) needs real M5 Dial hardware
// to verify and isn't covered here.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Builds the same three-layer nesting a real deploy produces: export.zip
// (baked bitmaps + project.json) containing _source/project.zip (the
// editable project) containing _source/ddf.zip (the DDF) - see
// lib/project-zip.ts's buildDeviceProjectZip()/buildEditableProjectZip().
// Also returns the standalone DDF bytes so the fake server below can serve
// them at /ddf.zip too - components/device-scan-section.tsx is mounted on
// the same Startup Gate page and auto-fetches every announced hello's
// ddfVersion+url in the background regardless of which dialog this test is
// driving; leaving that 404 produced a real (if usually-dismissed-in-time)
// "Couldn't load" toast whose text contains this device's name, an
// intermittent strict-mode violation for this file's own getByText
// assertions once run alongside other specs sharing the same broker.
async function buildRecoveryExportZip(
  deviceId: string,
  projectName: string,
): Promise<{ exportBytes: Buffer; ddfBytes: Buffer }> {
  const ddfZip = new JSZip()
  ddfZip.file(
    "device.json",
    JSON.stringify({
      ddfVersion: "1.0",
      device: { id: deviceId, name: "Recovery Test Device" },
      screen: { width: 10, height: 10, colorDepth: "1bit" },
      adornment: {
        svgPath: "adornment.svg",
      },
      hardwareButtons: [],
      fonts: [],
      supportedObjectTypes: [],
    }),
  )
  ddfZip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
  )
  const ddfBytes = await ddfZip.generateAsync({ type: "nodebuffer" })

  const editableProjectZip = new JSZip()
  editableProjectZip.file(
    "project.json",
    JSON.stringify({
      name: projectName,
      schemaVersion: 1,
      screenWidth: 10,
      screenHeight: 10,
      screens: [{ id: "screen-1", name: "Screen 1", objects: [] }],
      settings: { deviceId },
      assets: [],
      fonts: [],
      topics: [],
      hardwareButtons: [],
    }),
  )
  editableProjectZip.file("_source/ddf.zip", ddfBytes)
  const editableProjectBytes = await editableProjectZip.generateAsync({ type: "nodebuffer" })

  const exportZip = new JSZip()
  exportZip.file("project.json", JSON.stringify({ name: projectName, deviceId, screens: [] }))
  exportZip.file("_source/project.zip", editableProjectBytes)
  const exportBytes = await exportZip.generateAsync({ type: "nodebuffer" })
  return { exportBytes, ddfBytes }
}

test.describe("Recover project from device", () => {
  test("finds a device on the broker, fetches its retained copy, and opens the recovered project", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-recover-${testInfo.testId}`
    const instanceId = `e2e-recover-instance-${testInfo.testId}`
    const projectName = `Recovered ${testInfo.testId}`
    const { exportBytes, ddfBytes } = await buildRecoveryExportZip(deviceId, projectName)

    const httpServer = http.createServer((req, res) => {
      if (req.url === "/recovery-project") {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(exportBytes)
      } else if (req.url === "/ddf.zip") {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(ddfBytes)
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's recovery copy from")

    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-recover-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${instanceId}/hello`,
        JSON.stringify({
          deviceId,
          name: `Recoverable Device ${testInfo.testId}`,
          ddfVersion: "1.0",
          url: `http://${lanIp}:${port}/ddf.zip`,
        }),
        { retain: true },
      )

      await page.goto("/")
      await page.getByRole("button", { name: "Recover from Device..." }).click()
      await expect(page.getByText(`Recoverable Device ${testInfo.testId}`)).toBeVisible({ timeout: 15000 })
      await page.getByText(`Recoverable Device ${testInfo.testId}`).click()
      await page.getByRole("button", { name: "Recover", exact: true }).click()

      // The recovered project actually opened - Startup Gate is gone, the
      // real editor (with this project's own name/device) is showing.
      await expect(page.getByRole("button", { name: "Recover from Device..." })).not.toBeVisible({ timeout: 15000 })
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByText("Device", { exact: true }).click()
      await expect(page.getByText(`Currently loaded: Recovery Test Device`)).toBeVisible()
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/hello`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  })

  // 2026-08-17: recovery re-syncs the embedded DDF to the device's live
  // /ddf.zip rather than opening strictly against whatever vintage got
  // frozen into the retained deploy - docs/nested-provenance.md's Fall 3,
  // revised the same day this was found live. Regression case for the
  // real trigger: a project deployed before 2026-08-16's
  // adornment.drawingArea -> <rect id="screen"> DDF break was frozen with
  // the old declarative shape, which the current parser can no longer read
  // at all (extractScreenRect throws) - recovery must open successfully
  // anyway, using the live DDF, not the broken frozen one.
  test("recovers successfully when the retained deploy's frozen DDF predates a breaking DDF format change", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-recover-resync-${testInfo.testId}`
    const instanceId = `e2e-recover-resync-instance-${testInfo.testId}`
    const projectName = `Resynced ${testInfo.testId}`

    // The frozen copy: pre-2026-08-16 shape - declarative
    // adornment.drawingArea, no <rect id="screen"> in the SVG at all. This
    // is exactly what extractScreenRect (lib/device-description.ts) throws
    // on today.
    const oldDdfZip = new JSZip()
    oldDdfZip.file(
      "device.json",
      JSON.stringify({
        ddfVersion: "1.0",
        device: { id: deviceId, name: "Old Frozen DDF Device" },
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
    oldDdfZip.file(
      "adornment.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"></svg>`,
    )
    const oldDdfBytes = await oldDdfZip.generateAsync({ type: "nodebuffer" })

    // The live copy: current shape, and distinguishable (device name) from
    // the frozen one above so the assertion below can tell which one the
    // recovered project actually opened with.
    const liveDdfZip = new JSZip()
    liveDdfZip.file(
      "device.json",
      JSON.stringify({
        ddfVersion: "2.0",
        device: { id: deviceId, name: "Live Current DDF Device" },
        screen: { width: 10, height: 10, colorDepth: "1bit" },
        adornment: { svgPath: "adornment.svg" },
        fonts: [],
        supportedObjectTypes: [],
      }),
    )
    liveDdfZip.file(
      "adornment.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
    )
    const liveDdfBytes = await liveDdfZip.generateAsync({ type: "nodebuffer" })

    const editableProjectZip = new JSZip()
    editableProjectZip.file(
      "project.json",
      JSON.stringify({
        name: projectName,
        schemaVersion: 1,
        screenWidth: 10,
        screenHeight: 10,
        screens: [{ id: "screen-1", name: "Screen 1", objects: [] }],
        settings: { deviceId },
        assets: [],
        fonts: [],
        topics: [],
        hardwareButtons: [],
      }),
    )
    editableProjectZip.file("_source/ddf.zip", oldDdfBytes)
    const editableProjectBytes = await editableProjectZip.generateAsync({ type: "nodebuffer" })

    const exportZip = new JSZip()
    exportZip.file("project.json", JSON.stringify({ name: projectName, deviceId, screens: [] }))
    exportZip.file("_source/project.zip", editableProjectBytes)
    const exportBytes = await exportZip.generateAsync({ type: "nodebuffer" })

    const httpServer = http.createServer((req, res) => {
      if (req.url === "/recovery-project") {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(exportBytes)
      } else if (req.url === "/ddf.zip") {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(liveDdfBytes)
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's recovery copy from")

    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-recover-resync-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${instanceId}/hello`,
        JSON.stringify({
          deviceId,
          name: `Resyncable Device ${testInfo.testId}`,
          ddfVersion: "2.0",
          url: `http://${lanIp}:${port}/ddf.zip`,
        }),
        { retain: true },
      )

      await page.goto("/")
      await page.getByRole("button", { name: "Recover from Device..." }).click()
      await expect(page.getByText(`Resyncable Device ${testInfo.testId}`)).toBeVisible({ timeout: 15000 })
      await page.getByText(`Resyncable Device ${testInfo.testId}`).click()
      await page.getByRole("button", { name: "Recover", exact: true }).click()

      // Opened at all (would fail hard on the frozen DDF's missing
      // <rect id="screen"> without the live-DDF resync), and specifically
      // with the LIVE device's data, not the frozen copy's.
      await expect(page.getByRole("button", { name: "Recover from Device..." })).not.toBeVisible({ timeout: 15000 })
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByText("Device", { exact: true }).click()
      await expect(page.getByText(`Currently loaded: Live Current DDF Device`)).toBeVisible()
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/hello`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  })

  test("shows a clear message when the selected device has never had a project deployed to it", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-recover-empty-${testInfo.testId}`
    const instanceId = `e2e-recover-empty-instance-${testInfo.testId}`

    // Standalone DDF, served at /ddf.zip so device-scan-section.tsx's
    // background auto-fetch (mounted on the same Startup Gate page
    // regardless of which dialog this test drives) succeeds silently
    // instead of producing a "Couldn't load" toast - see
    // buildRecoveryExportZip's own comment for why that matters here.
    // /recovery-project deliberately stays 404 - that's what's under test.
    const ddfZip = new JSZip()
    ddfZip.file(
      "device.json",
      JSON.stringify({
        ddfVersion: "1.0",
        device: { id: deviceId, name: "Empty Recovery Test Device" },
        screen: { width: 10, height: 10, colorDepth: "1bit" },
        adornment: {
          svgPath: "adornment.svg",
        },
        hardwareButtons: [],
        fonts: [],
        supportedObjectTypes: [],
      }),
    )
    ddfZip.file(
      "adornment.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
    )
    const ddfBytes = await ddfZip.generateAsync({ type: "nodebuffer" })

    const httpServer = http.createServer((req, res) => {
      if (req.url === "/ddf.zip") {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(ddfBytes)
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine")

    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-recover-empty-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${instanceId}/hello`,
        JSON.stringify({
          deviceId,
          name: `Never Deployed ${testInfo.testId}`,
          ddfVersion: "1.0",
          url: `http://${lanIp}:${port}/ddf.zip`,
        }),
        { retain: true },
      )

      await page.goto("/")
      await page.getByRole("button", { name: "Recover from Device..." }).click()
      await expect(page.getByText(`Never Deployed ${testInfo.testId}`)).toBeVisible({ timeout: 15000 })
      await page.getByText(`Never Deployed ${testInfo.testId}`).click()
      await page.getByRole("button", { name: "Recover", exact: true }).click()

      await expect(page.getByText(/nothing to recover/)).toBeVisible({ timeout: 10000 })
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${instanceId}/hello`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  })
})
