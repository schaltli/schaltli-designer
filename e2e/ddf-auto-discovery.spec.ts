import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import http from "node:http"
import JSZip from "jszip"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { serverLanAddress } from "../lib/server-lan-address"
import { chooseDevice, waitForDeviceGate } from "./helpers"

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

async function buildTestDdfZip(
  deviceId: string,
  ddfVersion: string,
  deviceName: string,
  systemGeneration?: string,
  adornmentSvg?: string,
): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      ...(systemGeneration !== undefined ? { systemGeneration } : {}),
      ddfVersion,
      device: { id: deviceId, name: deviceName },
      screen: { width: 10, height: 10, colorDepth: "1bit" },
      adornment: {
        svgPath: "adornment.svg",
      },
      hardwareButtons: [],
      fonts: [],
      supportedObjectTypes: [],
    }),
  )
  zip.file(
    "adornment.svg",
    adornmentSvg ??
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
  )
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
      // Listed under its own "Announced Devices" section, not merged
      // indistinguishably into the curated list - see
      // components/startup-device-gate.tsx and app/api/ddf/list/route.ts's
      // header comment for why the two are kept separate rather than one
      // silently shadowing the other. The card's accessible name
      // concatenates its version badge + device name, so this also proves
      // the version badge rendered.
      await expect(page.getByText("Announced Devices", { exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: `v1.0 Auto-Discovered ${testInfo.testId}` })).toBeVisible()
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

  // Regression test for a real authoring trap found 2026-08-19 while writing
  // the Waveshare board's adornment: the extractors match with regexes, not
  // an XML parser, so a header comment that documented the convention by
  // spelling out literal tag syntax got matched *instead of* the real
  // element - failing with "screen rect missing x attribute" on a perfectly
  // valid file. The commented-out button here covers the nastier half of the
  // same bug: that one wouldn't have failed at all, it would have silently
  // added a phantom hardware button to the device.
  test("ignores markup that only appears inside XML comments in the adornment", async ({ page, request }, testInfo) => {
    const deviceId = `e2e-svgcomment-${testInfo.testId}`
    const zipBytes = await buildTestDdfZip(
      deviceId,
      "1.0",
      "Commented Adornment",
      undefined,
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
         <!-- Conventions this file follows: <rect id="screen"> marks the screen
              area, and <circle id="button-9" inkscape:label="Phantom"/> would be
              a hardware button. Neither of these must be parsed. -->
         <rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/>
         <circle id="button-0" cx="5" cy="5" r="1" inkscape:label="Real Button" fill="none"/>
       </svg>`,
    )

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(zipBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")

    try {
      const res = await request.post("/api/ddf/fetch", {
        data: { deviceId, ddfVersion: "1.0", url: `http://${lanIp}:${port}/ddf.zip` },
      })
      // The commented-out rect has no x/y/width/height, so before the fix
      // this parse failed outright rather than falling through to the real
      // element.
      expect(res.status()).toBe(200)
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }

    // The phantom-button half, checked through the created project's own
    // hardwareButtons (id-based, same approach as
    // e2e/m5dial-hardware-buttons.spec.ts) rather than the fetch response,
    // which only reports success/deviceId. button-9 exists solely inside the
    // comment and must not be here.
    await page.goto("/")
    await chooseDevice(page, deviceId, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const project = JSON.parse(
      await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"),
    )
    expect(project.hardwareButtons.map((b: { id: string }) => b.id)).toEqual(["button-0"])
    expect(project.hardwareButtons[0].name).toBe("Real Button")
  })

  // Covers lib/device-description.ts's parseDeviceDescriptionFile() rejecting
  // an unrecognized schemaVersion before reading anything else (2026-08-15
  // version-compatibility grilling session, docs/nested-provenance.md's
  // "Version compatibility" > Fall 2 step 1) - exercised here via
  // /api/ddf/fetch since that route already reuses this same parse+validate
  // call server-side (see this file's header comment).
  test("rejects a fetched DDF whose system generation is newer than this app understands", async ({ request }, testInfo) => {
    const deviceId = `e2e-schema-${testInfo.testId}`
    const zipBytes = await buildTestDdfZip(deviceId, "1.0", "Too New", "999.0")

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(zipBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")

    try {
      const res = await request.post("/api/ddf/fetch", {
        data: { deviceId, ddfVersion: "1.0", url: `http://${lanIp}:${port}/ddf.zip` },
      })
      expect(res.status()).toBe(422)
      const body = await res.json()
      expect(body.error).toContain("999.0")
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  })

  // Until 2026-08-04 the API silently deduped a same-deviceId conflict
  // ("auto-discovered always wins" - the device announced it moments ago,
  // so it must be freshest). In practice that meant a device's own DDF
  // (updating it is a separate manual step from updating the curated copy)
  // could silently shadow a deliberately-maintained public/ddf/ entry with
  // no visible sign anything was overridden - caused two separate live
  // debugging sessions in one day. Both entries are returned now; a human
  // sees and picks between them in the UI (grouped by source, version
  // visible - see startup-device-gate.tsx/project-settings-dialog.tsx).
  test("/api/ddf/list returns both a curated and an auto-discovered entry for the same deviceId, not a silently-deduped winner", async ({
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
      const entries = devices.filter((d: { deviceId: string | null }) => d.deviceId === deviceId)
      expect(entries).toHaveLength(2)

      const curated = entries.find((d: { source: string }) => d.source === "curated")
      expect(curated?.ddfVersion).toBe("1.0")
      expect(curated?.deviceName).toBe("Curated Copy")
      expect(curated?.path).toBe(`/ddf/${deviceId}.ddf.zip`)

      const discovered = entries.find((d: { source: string }) => d.source === "auto-discovered")
      expect(discovered?.ddfVersion).toBe("2.0")
      expect(discovered?.deviceName).toBe("Auto-Fetched Copy")
      expect(discovered?.path).toBe(`/api/ddf/data/${deviceId}.ddf.zip`)
    } finally {
      await rm(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("the Startup Gate shows both copies grouped by source with their own version badge, not one hiding the other", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-grouping-${testInfo.testId}`
    const publicZip = await buildTestDdfZip(deviceId, "1.0", `Server Copy ${testInfo.testId}`)
    const dataZip = await buildTestDdfZip(deviceId, "2.0", `Device Copy ${testInfo.testId}`)

    await writeFile(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), publicZip)
    await mkdir(DATA_DDF_DIR, { recursive: true })
    await writeFile(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), dataZip)

    try {
      await page.goto("/")
      // Both section headers present, and - crucially - both device
      // entries visible at once (the old dedup logic would have let the
      // auto-discovered "Device Copy" hide "Server Copy" entirely).
      await waitForDeviceGate(page)
      await expect(page.getByText("Announced Devices", { exact: true })).toBeVisible()
      // Each card's accessible name concatenates its version badge + device
      // name - checking both together also proves the version badges
      // actually rendered with the right value per source.
      await expect(page.getByRole("button", { name: `v1.0 Server Copy ${testInfo.testId}` })).toBeVisible()
      await expect(page.getByRole("button", { name: `v2.0 Device Copy ${testInfo.testId}` })).toBeVisible()
    } finally {
      await rm(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  // Opening a project file only carries a deviceId, not which DDF *copy* to
  // use - no picker is possible there (lib/device-description.ts's
  // resolveDeviceForProject), so it needs its own automatic rule. Curated
  // wins there deliberately (see that function's comment): predictable,
  // rather than whichever copy a device happened to have served last.
  test("opening a project resolves its device to the curated copy, not whatever a device last announced", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-resolve-${testInfo.testId}`
    const publicZip = await buildTestDdfZip(deviceId, "1.0", `Curated Copy ${testInfo.testId}`)
    const dataZip = await buildTestDdfZip(deviceId, "2.0", `Device Copy ${testInfo.testId}`)

    await writeFile(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), publicZip)
    await mkdir(DATA_DDF_DIR, { recursive: true })
    await writeFile(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), dataZip)

    const projectZip = new JSZip()
    projectZip.file(
      "project.json",
      JSON.stringify({
        name: `Resolve Test ${testInfo.testId}`,
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
    const projectBuffer = await projectZip.generateAsync({ type: "nodebuffer" })

    try {
      await page.goto("/")
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Choose File..." }).click(),
      ])
      await fileChooser.setFiles({
        name: "resolve-test-project.zip",
        mimeType: "application/zip",
        buffer: projectBuffer,
      })
      await page.waitForTimeout(2000)

      // Only the curated device name should end up loaded - if the
      // auto-discovered copy won instead, this would say "Device Copy".
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByText("Device", { exact: true }).click()
      await expect(page.getByText(`Currently loaded: Curated Copy ${testInfo.testId}`)).toBeVisible()
    } finally {
      await rm(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  // Fall 1 (2026-08-15 version-compatibility grilling session,
  // docs/nested-provenance.md's "Version compatibility" section): once a
  // project carries its own embedded DDF, opening it must NEVER consult
  // this instance's curated copy again - the opposite of the previous test,
  // which only applies to a project with no embedded DDF of its own.
  // Deliberately gives the curated copy a *different* device name so a
  // regression back to instance-resolution is unmistakable rather than
  // passing by coincidence.
  test("a project with its own embedded DDF opens using that, ignoring this instance's curated copy entirely", async ({
    page,
  }, testInfo) => {
    const deviceId = `e2e-embedded-${testInfo.testId}`
    const curatedZip = await buildTestDdfZip(deviceId, "1.0", `Stale Curated Copy ${testInfo.testId}`)
    const embeddedDdfZip = await buildTestDdfZip(deviceId, "9.0", `Embedded Copy ${testInfo.testId}`)

    await writeFile(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), curatedZip)

    const projectZip = new JSZip()
    projectZip.file(
      "project.json",
      JSON.stringify({
        name: `Embedded Resolve Test ${testInfo.testId}`,
        systemGeneration: "1.0",
        screenWidth: 10,
        screenHeight: 10,
        screens: [{ id: "screen-1", name: "Screen 1", objects: [] }],
        settings: { deviceId, deviceName: `Embedded Copy ${testInfo.testId}` },
        assets: [],
        fonts: [],
        topics: [],
        hardwareButtons: [],
      }),
    )
    projectZip.file("_source/ddf.zip", embeddedDdfZip)
    const projectBuffer = await projectZip.generateAsync({ type: "nodebuffer" })

    try {
      await page.goto("/")
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Choose File..." }).click(),
      ])
      await fileChooser.setFiles({
        name: "embedded-resolve-test-project.zip",
        mimeType: "application/zip",
        buffer: projectBuffer,
      })
      await page.waitForTimeout(2000)

      // The embedded copy's name must win - if the instance's curated copy
      // won instead (a regression to the old always-re-resolve behavior),
      // this would say "Stale Curated Copy".
      await page.getByRole("button", { name: "Settings" }).click()
      await page.getByText("Device", { exact: true }).click()
      await expect(page.getByText(`Currently loaded: Embedded Copy ${testInfo.testId}`)).toBeVisible()
    } finally {
      await rm(join(PUBLIC_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })
})
