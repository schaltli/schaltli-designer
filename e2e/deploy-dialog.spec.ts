import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import http from "node:http"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pressDeploy, createProject, COMBINED_TEST_PROJECT, chooseDevice, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { SYSTEM_GENERATION_STRING } from "../lib/system-generation"
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

  test("lists the project's devices first, greys an offline one, and reacts to live deploy-status", async ({ page }) => {
    // A compatible device (this test's own kind, which its project is bound
    // to) and an incompatible one (Android): both listed since 2026-10-10
    // (#62), the project's first, the other marked as another device.
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ systemGeneration: "1.5", deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    deviceClient.publish(
      `${TOPIC_PREFIX}/${androidId}/hello`,
      JSON.stringify({ systemGeneration: "1.5", deviceId: "android-a1b2c3d4", name: "My Phone" }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${androidId}/status`, "online", { retain: true })

    await openDeployDialog(page)

    await expect(page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    const phone = page.getByRole("dialog").getByTestId("deploy-device").filter({ hasText: "My Phone" })
    await expect(phone.getByText("Other device")).toBeVisible()
    const rows = page.getByRole("dialog").getByTestId("deploy-device")
    const names = await rows.allTextContents()
    expect(names.findIndex((t) => t.includes(`Camper Dashboard ${epaperId}`))).toBeLessThan(names.findIndex((t) => t.includes("My Phone")))

    // Take it offline: the row stays, marked, and nothing can be sent to it
    // (#66 - nothing is queued for a device that is not there).
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "offline", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("offline", { exact: true })).toBeVisible()
    await page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`).click()
    await expect(page.getByTestId("device-offline")).toContainText(":1883")
    await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled()

    // Back online: deployable.
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    await expect(deviceRow(page, `Camper Dashboard ${epaperId}`).getByText("offline", { exact: true })).toHaveCount(0)
    await expect(page.getByTestId("device-offline")).toHaveCount(0)

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

    await pressDeploy(page)
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
    // 2026-08-11 (device-contract.md §10) before schaltli-eink had the
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
    expect(exportedProjectJson.systemGeneration).toBe(SYSTEM_GENERATION_STRING)
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
      JSON.stringify({ systemGeneration: "1.5", deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await expect(page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`)).toBeVisible()
    await page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`).click()

    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await pressDeploy(page)
    const trigger = await triggerPromise

    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/deploy-status`,
      JSON.stringify({ deployId: trigger.deployId, state: "error", error: "checksum mismatch" }),
    )

    await expect(page.getByText("checksum mismatch")).toBeVisible()
    await page.getByRole("button", { name: "Back" }).click()
    // Exact: the device is also named in the warning that it shows
    // placeholders as written - the fixture's Live Text is a text with a
    // placeholder since 2026-10-07, and this e-paper does not resolve them.
    await expect(page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`, { exact: true })).toBeVisible()
  })

  // #66: a device that does not answer gets nothing left lying on the broker.
  // The trigger is taken back after 30 s, and the dialog says so - no
  // «will apply on reconnect», no update days later that nobody can explain.
  test("a device that does not answer: the trigger is taken back, and the dialog says so", async ({ page }) => {
    test.setTimeout(120_000)
    deviceClient.publish(
      `${TOPIC_PREFIX}/${epaperId}/hello`,
      JSON.stringify({ systemGeneration: "1.5", deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })
    const triggers: string[] = []
    await new Promise<void>((resolve) => deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => resolve()))
    deviceClient.on("message", (topic, message) => {
      if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy`) triggers.push(message.toString())
    })

    await openDeployDialog(page)
    await page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`).click()
    await pressDeploy(page)
    // Published, and then - nobody answering - cleared.
    await expect.poll(() => triggers.some((t) => t.length > 0), { timeout: 30_000 }).toBe(true)
    await expect(page.getByText("The device did not respond. Nothing was sent")).toBeVisible({ timeout: 45_000 })
    expect(triggers[triggers.length - 1]).toBe("")
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
  })

  // Reported from the van, 2026-09-27: a project made for the 4.3B and moved to
  // the phone still said "firmware" in its settings, the dialog chose the
  // bundle by that, and the phone got the boards' BMPs - every Switch icon in a
  // white or black box. The device's own hello says what it is.
  test("a phone gets the phone's bundle, even from a project that still says board", async ({ page }, testInfo) => {
    const phoneKind = `e2e-android-kind-${testInfo.testId}`
    const phoneProject = await projectBoundTo(phoneKind, testInfo.outputPath("phone-project.zip"))
    deviceClient.publish(
      `${TOPIC_PREFIX}/${androidId}/hello`,
      JSON.stringify({ systemGeneration: "1.5", deviceId: phoneKind, name: `Phone ${androidId}`, platform: "android" }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${androidId}/status`, "online", { retain: true })

    await openDeployDialog(page, phoneProject)
    await deviceRow(page, `Phone ${androidId}`).click()

    const triggerPromise = new Promise<{ url: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${androidId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${androidId}/deploy` && message.length > 0) resolve(JSON.parse(message.toString()))
      })
    })
    await pressDeploy(page)
    const trigger = await triggerPromise

    const bundle = await JSZip.loadAsync(await (await page.request.get(trigger.url)).body())
    const files = Object.keys(bundle.files)
    expect(files.filter((f) => /\.(bmp|pbm)$/i.test(f)), files.join(", ")).toEqual([])
    expect(files.some((f) => /\.png$/i.test(f)), files.join(", ")).toBe(true)
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
      JSON.stringify({ systemGeneration: "1.5", deviceId: epaperDeviceId, name: `Camper Dashboard ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await page.getByRole("dialog").getByText(`Camper Dashboard ${epaperId}`).click()

    const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await pressDeploy(page)
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
  // #62, tester Arno 2026-10-10: a project made for the 4.3B, and only an
  // Android tablet. The dialog listed nothing but a line of device ids, so
  // he loaded a board export into the app by hand. Now every device on the
  // broker is listed; one the project is not made for says so, cannot be
  // deployed to, and offers to move the project onto it - after which it can.
  test("lists another device, says the project is not made for it, and moves the project onto it", async ({
    page,
  }, testInfo) => {
    // Two throwaway devices with ids of their own (these tests share one
    // broker and run in parallel): the one the project is made for, which
    // announces nothing, and another, online, with a description to move to.
    const orphanDeviceId = `e2e-orphan-${testInfo.testId}`
    const otherDeviceId = `e2e-other-${testInfo.testId}`
    const ddf = async (id: string, name: string, width: number, height: number) => {
      const zip = new JSZip()
      zip.file(
        "device.json",
        JSON.stringify({
          device: { id, name },
          screen: { width, height, colorDepth: "24bit" },
          adornment: { svgPath: "adornment.svg" },
          fonts: [],
          supportedObjectTypes: ["text", "box"],
        }),
      )
      zip.file(
        "adornment.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect id="screen" x="0" y="0" width="${width}" height="${height}" fill="none" stroke="none"/></svg>`,
      )
      return zip.generateAsync({ type: "nodebuffer" })
    }
    const zips: Record<string, Buffer> = {
      "/orphan.zip": await ddf(orphanDeviceId, `Orphaned Device ${testInfo.testId}`, 800, 480),
      "/other.zip": await ddf(otherDeviceId, `Other Device ${testInfo.testId}`, 600, 1024),
    }
    const httpServer = http.createServer((req, res) => {
      const body = zips[req.url ?? ""]
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/zip" })
      res.end(body ?? "")
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake devices' DDFs from")

    try {
      const fetched = await page.request.post("/api/ddf/fetch", { data: { url: `http://${lanIp}:${port}/orphan.zip` } })
      expect(fetched.ok(), JSON.stringify(await fetched.json())).toBe(true)

      const otherName = `Someone Else ${epaperId}`
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ systemGeneration: "1.5", deviceId: otherDeviceId, name: otherName, firmwareVersion: "1.0.0", url: `http://${lanIp}:${port}/other.zip` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await page.goto("/")
      await waitForDeviceGate(page)
      await chooseDevice(page, orphanDeviceId, "auto-discovered")
      await createProject(page)
      await waitForEditorReady(page)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      const dialog = page.getByRole("dialog")

      // Listed by its name, marked as another device.
      const row = dialog.getByTestId("deploy-device").filter({ hasText: otherName })
      await expect(row).toBeVisible({ timeout: 15000 })
      await expect(row.getByText("Other device")).toBeVisible()
      await expect(dialog.getByText("No devices on the broker yet")).toHaveCount(0)

      // Chosen: what the project is made for and what this is - no deploy.
      await row.click()
      const foreign = dialog.getByTestId("foreign-device")
      await expect(foreign).toContainText(`This project is made for Orphaned Device ${testInfo.testId} (800×480)`)
      await expect(foreign).toContainText(`"${otherName}" is a different device`)
      await expect(dialog.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled()

      // Moved onto it: the project's screen is the other device's, the row is
      // no longer another device's, and it can be deployed to.
      await foreign.getByRole("button", { name: `Switch this project to "${otherName}"` }).click()
      await expect(dialog.getByTestId("switched-device-note")).toContainText(
        `This project is now made for "${otherName}". Its screen is 600×1024 instead of 800×480`,
      )
      await expect(foreign).toHaveCount(0)
      await expect(row.getByText("Other device")).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled()

      // An edit like any other: Ctrl+Z takes it back.
      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(dialog).toHaveCount(0)
      // The File menu the dialog was opened from is still open behind it.
      await page.keyboard.press("Escape")
      await page.keyboard.press("ControlOrMeta+z")
      await expect(page.getByText("800 × 480")).toBeVisible()
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(
        page.getByRole("dialog").getByTestId("deploy-device").filter({ hasText: otherName }).getByText("Other device"),
      ).toBeVisible({ timeout: 15000 })
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await rm(join(__dirname, "..", ".data", "ddf", `${orphanDeviceId}.ddf.zip`), { force: true })
      await rm(join(__dirname, "..", ".data", "ddf", `${otherDeviceId}.ddf.zip`), { force: true })
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
  test("blocks object types the selected device's live DDF doesn't declare, and leaves the project's ddfHash untouched on deploy", async ({
    page,
  }, testInfo) => {
    // A description declaring no types first: a mismatch whatever
    // combined-test-project.zip's default screen places. Then one declaring
    // every type there is, to deploy.
    const ddf = async (supportedObjectTypes: string[]) => {
      const zip = new JSZip()
      zip.file(
        "device.json",
        JSON.stringify({
          device: { id: "mqtt-epaper-display-2", name: "e-Paper Display" },
          screen: { width: 400, height: 300, colorDepth: "1bit" },
          adornment: { svgPath: "adornment.svg" },
          hardwareButtons: [],
          fonts: [],
          supportedObjectTypes,
        }),
      )
      zip.file(
        "adornment.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect id="screen" x="0" y="0" width="400" height="300" fill="none" stroke="none"/></svg>`,
      )
      return zip.generateAsync({ type: "nodebuffer" })
    }
    const ALL_TYPES = [
      "text", "live-text", "icon", "live-icon", "bar", "slider", "gauge", "dial", "switch", "button-group", "button",
      "line", "live-line", "box", "switcher", "panel", "navigator", "group", "table", "free",
    ]
    let ddfBytes = await ddf([])
    // The hello has to announce the hash of exactly these bytes, or
    // /api/ddf/fetch refuses the fetch and the check below never happens -
    // the same check a real device is held to.
    let ddfHash = computeDdfHash(new Uint8Array(ddfBytes))

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(ddfBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const ddfUrl = `http://${lanIp}:${port}/ddf.zip`

    try {
      const hello = () =>
        deviceClient.publish(
          `${TOPIC_PREFIX}/${epaperId}/hello`,
          JSON.stringify({
            deviceId: "mqtt-epaper-display-2",
            name: `Old Firmware ${epaperId}`,
            systemGeneration: "1.5",
            ddfHash,
            url: ddfUrl,
          }),
          { retain: true },
        )
      hello()
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await openDeployDialog(page, COMBINED_TEST_PROJECT)
      await expect(page.getByRole("dialog").getByText(`Old Firmware ${epaperId}`)).toBeVisible()
      await page.getByRole("dialog").getByText(`Old Firmware ${epaperId}`).click()

      // Blocked since 2026-10-10 (#66, it was a warning): rather nothing on
      // the device than a project with holes, and the types named.
      await expect(page.getByTestId("deploy-blocked")).toContainText(`"Old Firmware ${epaperId}" cannot show`, { timeout: 10000 })
      await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeDisabled()

      // The device now declares every type: deployable.
      ddfBytes = await ddf(ALL_TYPES)
      ddfHash = computeDdfHash(new Uint8Array(ddfBytes))
      hello()
      await expect(page.getByTestId("deploy-blocked")).toHaveCount(0, { timeout: 10000 })
      await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled()

      const triggerPromise = new Promise<{ deployId: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
            resolve(JSON.parse(message.toString()))
          }
        })
      })
      const name = await pressDeploy(page)
      await triggerPromise

      // What the deploy bound into the open project is observable once it is
      // saved (since 2026-09-24 the deploy itself saves only before sending).
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      const saved = page.waitForResponse((res) => res.url().endsWith("/versions") && res.request().method() === "POST")
      await page.keyboard.press("ControlOrMeta+s")
      await saved
      const versionsBody = (
        await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()
      ).project as { settings?: { ddfHash?: string } }
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
      JSON.stringify({ systemGeneration: "1.5", deviceId: epaperDeviceId, name: `Recovery Test ${epaperId}` }),
      { retain: true },
    )
    deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

    await openDeployDialog(page)
    await expect(page.getByRole("dialog").getByText(`Recovery Test ${epaperId}`)).toBeVisible()
    await page.getByRole("dialog").getByText(`Recovery Test ${epaperId}`).click()

    const triggerPromise = new Promise<{ url: string }>((resolve) => {
      deviceClient.subscribe(`${TOPIC_PREFIX}/${epaperId}/deploy`, () => {})
      deviceClient.on("message", (topic, message) => {
        if (topic === `${TOPIC_PREFIX}/${epaperId}/deploy` && message.length > 0) {
          resolve(JSON.parse(message.toString()))
        }
      })
    })
    await pressDeploy(page)
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
    expect(embeddedProjectJson.systemGeneration).toBe(SYSTEM_GENERATION_STRING)
    // The editable model has BDF font *data*, unlike the outer export's own
    // project.json (metadata only) - proves this is really the editable
    // project, not another copy of the flattened export.
    expect(Object.keys(embeddedProjectZip.files).some((n) => n.startsWith("fonts/") && n.endsWith(".bdf"))).toBe(true)
  })
})
