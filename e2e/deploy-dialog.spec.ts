import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import http from "node:http"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { COMBINED_TEST_PROJECT, chooseDevice, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { computeDdfHash } from "../lib/ddf-name"
import { serverLanAddress } from "../lib/server-lan-address"

// Covers the designer side of the MQTT self-deploy flow (2026-08-01
// grilling session) against the local broker (hil/local-broker.js's
// WebSocket listener, `npm run hil:broker`) - no real device involved,
// since a "device" here is just this test's own MQTT client publishing
// the same hello/status/deploy-status messages a real one would. The
// firmware side (actually downloading/verifying/applying) is covered
// separately by the HIL suite against real hardware.
//
// Both halves of a device's identity are per-test here, and they have to
// be, because these tests run in parallel workers against the SAME broker
// and the SAME designer instance.
//
// The instance ID (which board) has been per-test since the first version of
// this spec raced itself on a hardcoded "e2e-epaper-1". The device ID (which
// *kind* of board) followed on 2026-09-12, and for a sharper reason: the
// designer caches an announced device's DDF at .data/ddf/<deviceId>.ddf.zip,
// so every test announcing "mqtt-epaper-display-2" was reading and writing
// one shared file. The ddfHash test below deliberately serves a DDF
// declaring supportedObjectTypes: [], and for as long as it ran, any
// sibling test that opened the dialog could pick that up and see a device
// that renders nothing. The suite failed a different test on almost every
// parallel run and passed reliably with --workers=1.
//
// A per-test device ID means a per-test project to match, since the dialog
// only offers devices whose ID the open project is bound to - hence
// projectBoundTo() below rather than loading combined-test-project.zip as
// it sits (it has settings.deviceId = "mqtt-epaper-display-2" baked in).

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

test.describe("Deploy to Device dialog", () => {
  let deviceClient: mqtt.MqttClient
  let epaperId: string
  let androidId: string
  // The device *kind* this test's fake board announces, and the id the
  // project it opens is bound to. Not a real device id, on purpose: it must
  // collide with nothing, least of all with a physical board that happens to
  // be on the same broker.
  let epaperDeviceId: string
  let boundProject: string

  test.beforeEach(async ({}, testInfo) => {
    epaperId = `e2e-epaper-${testInfo.testId}`
    androidId = `e2e-android-${testInfo.testId}`
    epaperDeviceId = `e2e-epaper-kind-${testInfo.testId}`
    boundProject = await projectBoundTo(epaperDeviceId, testInfo.outputPath("bound-project.zip"))
    deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })
  })

  test.afterEach(async () => {
    // Clear every retained message this test published, so a later run
    // doesn't see a stale device/trigger left over from this one.
    for (const id of [epaperId, androidId]) {
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${id}/deploy`, "", { retain: true })
    }
    await new Promise((r) => setTimeout(r, 200))
    deviceClient.end()
    // Selecting a device makes the app cache its DDF under the device id.
    // Per-test ids mean these never collide, but they would still pile up in
    // .data/ddf/ and show on the Startup Gate as a crowd of dead fixtures.
    await rm(join(__dirname, "..", ".data", "ddf", `${epaperDeviceId}.ddf.zip`), { force: true })
  })

  // combined-test-project.zip with its settings.deviceId rewritten, written
  // into this test's own output directory. Everything else about the project
  // is left exactly as it sits - only the binding changes.
  async function projectBoundTo(deviceId: string, outPath: string): Promise<string> {
    const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.settings.deviceId = deviceId
    zip.file("project.json", JSON.stringify(project, null, 2))
    await writeFile(outPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
    return outPath
  }

  // Defaults to this test's own bound project. The one test that has to
  // open against the real e-paper device id passes it explicitly.
  async function openDeployDialog(page: import("@playwright/test").Page, projectPath: string = boundProject) {
    await loadProject(page, projectPath)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    // No manual URL/Connect step anymore (2026-08-03) - the dialog
    // auto-connects using the broker URL derived from the page's own host
    // (ws://localhost:9001 here, same as BROKER_URL), which is why this
    // constant still exists - only the fake device below still needs it.
  }

  // Scoped to this test's own device row, not a page-wide text search -
  // the shared local broker can (and during this feature's own live
  // debugging, did) also have a real physical device's retained hello/
  // status sitting on it at the same time, with the same "will apply on
  // reconnect" badge text - a page-wide getByText("will apply on
  // reconnect") is a strict-mode violation whenever that happens to be
  // true, which has nothing to do with whether *this* test's own fake
  // device is behaving correctly.
  function deviceRow(page: import("@playwright/test").Page, name: string) {
    return page.getByRole("button").filter({ hasText: name })
  }

  test("filters by device type, shows offline devices, and reacts to live deploy-status", async ({ page }) => {
    // A compatible device (this test's own kind, which its project is bound
    // to) and an incompatible one (Android) - only the first should show.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    deviceClient.publish(
      `${TOPIC_PREFIX}/${androidId}/hello`,
      JSON.stringify({ deviceId: "android-phone-1", name: "My Phone" }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${androidId}/status`, "online", { retain: true })

    await openDeployDialog(page)

    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    await expect(page.getByText("My Phone")).not.toBeVisible()

    // Take it offline - the row should stay visible but relabel, not
    // disappear (a currently-offline device is still a valid deploy
    // target, per the retained-trigger design: it applies automatically
    // next time it reconnects).
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "offline", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).toBeVisible()

    // Back online, select it, and deploy.
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).not.toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()

    // Capture the retained trigger the dialog publishes, so this test's
    // fake device can echo status against the real deployId - proves the
    // browser actually uploaded a zip (app/api/deploy) and published a
    // trigger with a url/crc32, not just flipped UI state.
    const triggerPromise = new Promise<{ deployId: string; url: string; crc32: number }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })

    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    expect(trigger.deployId).toBeTruthy()
    expect(trigger.url).toContain(`/api/deploy/${epaperId}`)
    expect(typeof trigger.crc32).toBe("number")

    // The uploaded zip must actually be fetchable at that URL - this is
    // exactly what the real device would GET.
    const uploadedZip = await page.request.get(trigger.url)
    expect(uploadedZip.status()).toBe(200)

    // Regression check: buildDeviceProjectZip() always DEFLATE-compresses
    // (device-contract.md §2.2 - every device's firmware is required to
    // handle this). The real board behind this fixture is the e-paper -
    // sending it a DEFLATE zip sent a real unit into a crash/reboot loop on
    // 2026-08-11 (device-contract.md §10) before MqttEPaperDisplay2 had the
    // M5 Dial's extraction fix ported over; it now does (`725f125`,
    // hardware-verified 2026-08-14 via hil/epaper/orchestrator.js, both the
    // setup-mode upload path and the real MQTT self-deploy path), so the
    // per-device allowlist this test used to check for was removed - its
    // zip must come back DEFLATE-compressed: compressedSize strictly less
    // than uncompressedSize.
    const zip = await JSZip.loadAsync(await uploadedZip.body())
    const projectJsonEntry = zip.file("project.json") as any
    expect(projectJsonEntry._data.compressedSize).toBeLessThan(projectJsonEntry._data.uncompressedSize)

    // Covers lib/project-zip.ts's exportProject.schemaVersion (2026-08-15
    // version-compatibility grilling session) - what
    // ProjectInstaller::peekProjectSchemaVersion() (M5 Dial firmware) reads
    // before touching /PROJECT. The firmware-side rejection itself needs
    // real hardware to verify (see docs/nested-provenance.md's "Where we
    // actually are"); this only proves the designer actually writes the
    // field every deploy carries.
    const exportedProjectJson = JSON.parse(await zip.file("project.json")!.async("string"))
    expect(exportedProjectJson.systemGeneration).toBe("1.0")
    expect(exportedProjectJson.schemaVersion).toBeUndefined()
    // Same dead-`version`-field guard as e2e/project-download.spec.ts, for
    // the device export half: this one is what the firmware parses, so a
    // lookalike version field creeping back here is the more confusing of
    // the two.
    expect(exportedProjectJson.version).toBeUndefined()

    // Walk the dialog through the full status sequence a real device
    // publishes, exactly as DeployManager (firmware) will.
    const publishStatus = (state: string, extra: Record<string, unknown> = {}) =>
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/deploy-status`,
        JSON.stringify({ deployId: trigger.deployId, state, ...extra }),
      )

    publishStatus("downloading", { percent: 40 })
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).toBeVisible()

    publishStatus("verifying")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Verifying`)).toBeVisible()

    publishStatus("applying")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Applying`)).toBeVisible()

    publishStatus("rebooting")
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Rebooting`)).toBeVisible()
  })

  test("shows a clear error and lets the user go back on a failed deploy", async ({ page }) => {
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()

    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/deploy-status`,
      JSON.stringify({ deployId: trigger.deployId, state: "error", error: "checksum mismatch" }),
    )

    await expect(page.getByText("checksum mismatch")).toBeVisible()
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page.getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
  })

  test("deploying to an offline device shows queued, not a stuck fake progress bar", async ({ page }) => {
    // Reported live (2026-08-01): the dialog set state to "downloading"
    // unconditionally the moment the (retained) trigger was published,
    // regardless of whether the device was actually there to receive it.
    // With the device powered off, nothing ever corrects that guess - the
    // UI just sat on a fake "Downloading" forever, since only the device
    // itself would ever publish a real deploy-status update.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "offline", { retain: true })

    await openDeployDialog(page)
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("will apply on reconnect")).toBeVisible()
    await page.getByText(`Camper Dashboard ${epaperId}`).click()
    await page.getByRole("button", { name: "Deploy", exact: true }).click()

    await expect(page.getByText(/Offline - will apply automatically when the device reconnects/)).toBeVisible()
    // Never claims active progress for a device that was never asked to do
    // anything yet, and never silently gets stuck with no way out.
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible()

    // If the device comes online and actually starts processing the
    // (still-retained) trigger later in the same session, real progress
    // should still replace the queued placeholder.
    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    const trigger = await triggerPromise
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy-status`, JSON.stringify({ deployId: trigger.deployId, state: "downloading", percent: 50 }))
    await expect(page.getByText(`Camper Dashboard ${epaperId}: Downloading`)).toBeVisible()
  })

  test("deploy still works when crypto.randomUUID isn't available (insecure context)", async ({ page }) => {
    // Reported live (2026-08-02): crypto.randomUUID() only exists in a
    // secure context (HTTPS, or the literal hostname "localhost") - this
    // app is meant to be reachable over plain HTTP on a LAN IP (e.g. a
    // self-hosted Pekaway instance at http://192.168.x.x:3000, no TLS
    // anywhere on that system by design), which is NOT a secure context,
    // so the deploy button threw "crypto.randomUUID is not a function"
    // there. Playwright's own webServer is always accessed via localhost,
    // which *is* a secure context, so this never failed in ordinary e2e
    // runs - simulate the real-world condition directly instead of
    // relying on a real non-localhost origin.
    await page.addInitScript(() => {
      // @ts-expect-error - deliberately removing a real browser API to
      // reproduce the insecure-context condition.
      delete window.crypto.randomUUID
    })

    const pageErrors: string[] = []
    page.on("pageerror", (err) => pageErrors.push(err.message))

    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await page.getByText(`Camper Dashboard ${epaperId}`).click()

    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    // A well-formed UUID v4 was still generated via the getRandomValues()
    // fallback, and nothing in the page threw along the way.
    expect(trigger.deployId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(pageErrors).toEqual([])
  })

  // Reported live 2026-08-21: a project had been built on a *look-alike*
  // device - an e2e fixture seeded from the real Waveshare's DDF source,
  // which the Startup Gate showed under the same name as the real hardware.
  // The Deploy dialog then said "No matching devices found yet. Listening
  // for devices on the broker..." while a perfectly healthy device sat on
  // that same broker announcing itself, and the message gave no hint that
  // those were different things. The fixture leak is fixed at its source
  // (e2e/ddf-seed.ts renames and removes variants now); this pins the
  // message, because the leak is only one of the ways a project can end up
  // bound to a deviceId nothing announces.
  test("says which device the project wants when the broker has others, not just 'none found'", async ({
    page,
  }, testInfo) => {
    // Its own throwaway device, and its own deviceId - which every test in
    // this file has since gained, for exactly the reason first written here:
    // these run in parallel against one broker, so a shared device kind made
    // a test assert on whether a sibling happened to publish first. Here it
    // is also the state under test, since the point is a project bound to a
    // deviceId nothing announces at all.
    const orphanDeviceId = `e2e-orphan-${testInfo.testId}`
    const ddfZip = new JSZip()
    ddfZip.file(
      "device.json",
      JSON.stringify({
        device: { id: orphanDeviceId, name: `Orphaned Device ${testInfo.testId}` },
        screen: { width: 10, height: 10, colorDepth: "1bit" },
        adornment: { svgPath: "adornment.svg" },
        fonts: [],
        supportedObjectTypes: [],
      }),
    )
    ddfZip.file(
      "adornment.svg",
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
    )
    const ddfBytes = await ddfZip.generateAsync({ type: "nodebuffer" })

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(ddfBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")

    try {
      const fetched = await page.request.post("/api/ddf/fetch", {
        data: { url: `http://${lanIp}:${port}/ddf.zip` },
      })
      expect(fetched.ok(), JSON.stringify(await fetched.json())).toBe(true)

      // A real, online device on the same broker - just not this project's.
      const otherDeviceId = `e2e-other-${testInfo.testId}`
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: otherDeviceId, name: `Someone Else ${epaperId}`, firmwareVersion: "1.0.0" }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await page.goto("/")
      await waitForDeviceGate(page)
      await chooseDevice(page, orphanDeviceId, "auto-discovered")
      await page.getByRole("button", { name: "Create Project" }).click()
      await waitForEditorReady(page)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()

      const dialog = page.getByRole("dialog")
      // Both halves matter: what this project needs, and what is actually
      // out there. Either one alone still leaves a human guessing.
      await expect(dialog.getByText(orphanDeviceId)).toBeVisible({ timeout: 15000 })
      await expect(dialog.getByText(otherDeviceId, { exact: false })).toBeVisible()
      await expect(dialog.getByText("No devices on the broker yet")).toHaveCount(0)
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await rm(join(__dirname, "..", ".data", "ddf", `${orphanDeviceId}.ddf.zip`), { force: true })
    }
  })

  // Covers Fall 2, step 3 (2026-08-15 version-compatibility grilling
  // session, docs/nested-provenance.md's "Version compatibility"):
  // selecting a device whose live DDF is missing an object type this
  // project places surfaces a warning (never a block - the device already
  // gracefully skips what it can't render).
  //
  // The second half pins the deliberate *absence* of what step 4 used to do.
  // Until 2026-08-21 a successful deploy silently copied the device's
  // announced ddfVersion into the project's settings. Its replacement,
  // settings.ddfHash, records which DDF this project's fields were actually
  // derived from - so writing the device's current one in at deploy time
  // would assert a project had been rebuilt against a DDF it never read,
  // which is the exact class of quiet lie the identity exists to prevent.
  // Untested, that line is trivially "restored" by a well-meaning reader.
  // The exception to the per-test device id above, and the only test that
  // still uses the real one: its whole second half asserts that the
  // project's ddfHash stays the CURATED e-paper DDF's hash, which requires
  // the project to have opened against a curated DDF - and "curated" means a
  // zip committed in public/ddf/, which no invented device id can have.
  //
  // Harmless now that it is alone in that: the shared .data/ddf entry it
  // writes and deletes is read by no other test any more.
  test("warns about object types the selected device's live DDF doesn't support, and leaves the project's ddfHash untouched on deploy", async ({
    page,
  }, testInfo) => {
    // supportedObjectTypes: [] guarantees a mismatch regardless of exactly
    // what combined-test-project.zip's default screen happens to place.
    const ddfZip = new JSZip()
    ddfZip.file(
      "device.json",
      JSON.stringify({
        device: { id: "mqtt-epaper-display-2", name: "e-Paper Display" },
        screen: { width: 400, height: 300, colorDepth: "1bit" },
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
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect id="screen" x="0" y="0" width="400" height="300" fill="none" stroke="none"/></svg>`,
    )
    const ddfBytes = await ddfZip.generateAsync({ type: "nodebuffer" })
    // The hello has to announce the hash of exactly these bytes, or
    // /api/ddf/fetch refuses the fetch and the warning below never appears -
    // the same check a real device is held to.
    const ddfHash = computeDdfHash(new Uint8Array(ddfBytes))

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(ddfBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    // Capture the version-history checkpoint POST (deploy-dialog.tsx fires
    // this right after publishing the deploy trigger) - it carries the exact
    // settings the deploy bound, which is the only place the ddfHash
    // decision below is observable at all.
    const versionsPostBody = new Promise<{ settings?: { ddfHash?: string } }>((resolve) => {
      page.on("request", (req) => {
        if (req.url().includes("/versions") && req.method() === "POST") {
          resolve(req.postDataJSON())
        }
      })
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({
          deviceId: "mqtt-epaper-display-2",
          name: `Old Firmware ${epaperId}`,
          ddfHash,
          url: ddfUrl,
        }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await openDeployDialog(page, COMBINED_TEST_PROJECT)
      await expect(page.getByText(`Old Firmware ${epaperId}`)).toBeVisible()
      await page.getByText(`Old Firmware ${epaperId}`).click()

      // Warning appears, deploy stays enabled (never a block).
      await expect(page.getByText(/doesn't support/)).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled()

      const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
            resolve(JSON.parse(message.toString()))
          }
        })
      })
      await page.getByRole("button", { name: "Deploy", exact: true }).click()
      await triggerPromise

      const versionsBody = await versionsPostBody
      // The project opened against the curated e-paper DDF, so that is the
      // DDF its fields were actually derived from and that is what its
      // ddfHash must still say after deploying to a device serving something
      // else. Pinning the expected value rather than only asserting "not the
      // device's" matters: the weaker check passes on undefined, on a
      // cleared field, on anything at all that went wrong differently.
      const curatedHash = computeDdfHash(
        new Uint8Array(await readFile(join(__dirname, "..", "public", "ddf", "mqtt-epaper-display.ddf.zip"))),
      )
      expect(versionsBody.settings?.ddfHash).toBe(curatedHash)
      expect(versionsBody.settings?.ddfHash).not.toBe(ddfHash)
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      // Selecting the device made the app cache this fake DDF under the
      // *real* e-paper deviceId. Left behind, every later run's Startup Gate
      // offers it as an "Announced Devices" entry declaring
      // supportedObjectTypes: [] - a fixture from this test masquerading as
      // a real device for every other spec sharing the instance.
      await rm(join(__dirname, "..", ".data", "ddf", "mqtt-epaper-display-2.ddf.zip"), { force: true })
    }
  })

  // Covers lib/project-zip.ts's buildDeviceProjectZip() embedding the full
  // editable project as _source/project.zip (2026-08-15, the prerequisite
  // for Fall 3/recovery this session discovered was missing) - without
  // this, a device would have nothing editable to hand back on recovery,
  // only baked bitmaps. Deliberately checks the embedded copy is itself a
  // real, independently-parseable project zip (not opaque/corrupt bytes),
  // matching e2e/project-download.spec.ts's identical DDF-embedding check.
  test("device export embeds the full editable project as _source/project.zip", async ({ page }) => {
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: epaperDeviceId, name: `Recovery Test ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await expect(page.getByText(`Recovery Test ${epaperId}`)).toBeVisible()
    await page.getByText(`Recovery Test ${epaperId}`).click()

    const triggerPromise = new Promise<{ url: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    const trigger = await triggerPromise

    const uploadedZip = await page.request.get(trigger.url)
    expect(uploadedZip.ok()).toBe(true)
    const exportZip = await JSZip.loadAsync(await uploadedZip.body())

    const embeddedEntry = exportZip.file("_source/project.zip")
    expect(embeddedEntry).not.toBeNull()

    // No project.json/assets/fonts sitting loose in the export's own tree -
    // zip-in-zip, not a flattened merge (docs/nested-provenance.md).
    const embeddedProjectZip = await JSZip.loadAsync(await embeddedEntry!.async("nodebuffer"))
    const embeddedProjectJson = JSON.parse(await embeddedProjectZip.file("project.json")!.async("string"))
    expect(embeddedProjectJson.settings.deviceId).toBe(epaperDeviceId)
    expect(embeddedProjectJson.systemGeneration).toBe("1.0")
    // The editable model has BDF font *data*, unlike the outer export's own
    // project.json (metadata only) - proves this is really the editable
    // project, not another copy of the flattened export.
    expect(Object.keys(embeddedProjectZip.files).some((n) => n.startsWith("fonts/") && n.endsWith(".bdf"))).toBe(true)
  })
})
