import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import http from "node:http"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { serverLanAddress } from "../lib/server-lan-address"

// Covers the designer side of the MQTT self-deploy flow (2026-08-01
// grilling session) against the local broker (hil/local-broker.js's
// WebSocket listener, `npm run hil:broker`) - no real device involved,
// since a "device" here is just this test's own MQTT client publishing
// the same hello/status/deploy-status messages a real one would. The
// firmware side (actually downloading/verifying/applying) is covered
// separately by the HIL suite against real hardware.
//
// combined-test-project.zip already has settings.deviceId =
// "mqtt-epaper-display-2" baked in (see test-projects/), matching what
// this spec's simulated devices announce.
//
// Instance IDs are derived from testInfo.testId (unique per test, stable
// across retries) rather than a fixed string - these tests run in
// parallel workers against the SAME broker, so a shared hardcoded id
// would let one test's retained messages/uploads collide with another's
// (this bit the first version of this spec: both tests raced on
// "e2e-epaper-1" and failed unpredictably).

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

test.describe("Deploy to Device dialog", () => {
  let deviceClient: mqtt.MqttClient
  let epaperId: string
  let androidId: string

  test.beforeEach(async ({}, testInfo) => {
    epaperId = `e2e-epaper-${testInfo.testId}`
    androidId = `e2e-android-${testInfo.testId}`
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
  })

  async function openDeployDialog(page: import("@playwright/test").Page) {
    await loadProject(page, COMBINED_TEST_PROJECT)
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
    // A compatible device (matches the project's mqtt-epaper-display-2)
    // and an incompatible one (Android) - only the first should ever show.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
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
    // handle this). This project is bound to "mqtt-epaper-display-2" -
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
    expect(exportedProjectJson.schemaVersion).toBe(1)

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
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
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
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
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
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Camper Dashboard ${epaperId}` }),
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

  // Covers Fall 2, steps 3-4 (2026-08-15 version-compatibility grilling
  // session, docs/nested-provenance.md's "Version compatibility"):
  // selecting a device whose live DDF is missing an object type this
  // project places surfaces a warning (never a block - the device already
  // gracefully skips what it can't render), and a successful deploy
  // silently refreshes the project's stored ddfVersion to match.
  test("warns about object types the selected device's live DDF doesn't support, and silently refreshes ddfVersion on deploy", async ({
    page,
  }, testInfo) => {
    // supportedObjectTypes: [] guarantees a mismatch regardless of exactly
    // what combined-test-project.zip's default screen happens to place.
    const ddfZip = new JSZip()
    ddfZip.file(
      "device.json",
      JSON.stringify({
        ddfVersion: "9.0",
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

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(ddfBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    // Capture the version-history checkpoint POST (project-editor.tsx's
    // deploy-dialog.tsx fires this right after publishing the deploy
    // trigger) - the only observable surface for the silent ddfVersion
    // refresh, since there's no dedicated UI for it by design (Fall 2 step
    // 4 is deliberately dialog-free).
    const versionsPostBody = new Promise<{ settings?: { ddfVersion?: string } }>((resolve) => {
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
          ddfVersion: "9.0",
          url: ddfUrl,
        }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await openDeployDialog(page)
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
      expect(versionsBody.settings?.ddfVersion).toBe("9.0")
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
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
      JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Recovery Test ${epaperId}` }),
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
    expect(embeddedProjectJson.settings.deviceId).toBe("mqtt-epaper-display-2")
    expect(embeddedProjectJson.schemaVersion).toBe(1)
    // The editable model has BDF font *data*, unlike the outer export's own
    // project.json (metadata only) - proves this is really the editable
    // project, not another copy of the flattened export.
    expect(Object.keys(embeddedProjectZip.files).some((n) => n.startsWith("fonts/") && n.endsWith(".bdf"))).toBe(true)
  })
})
