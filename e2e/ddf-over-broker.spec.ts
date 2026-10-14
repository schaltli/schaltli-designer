import { test, expect, type ConsoleMessage } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import { rm } from "fs/promises"
import { join } from "path"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { computeDdfHash, ddfName } from "../lib/ddf-name"
import { waitForDeviceGate } from "./helpers"

// A device's description over the broker (docs/device-contract.md §4,
// 2026-10-14, #70): no `url` in its hello, the zip on `ddf` - retained, sent
// when asked on `ddf/get` - and the recovery copy on `recovery/get` →
// `recovery`. The designer reaches no device directly any more, which one
// in a VM behind NAT cannot (rajiva in the forum). A device older than that,
// with a `url`, is e2e/ddf-auto-discovery.spec.ts's.
//
// The device is stood in for by an MQTT client that answers the way the
// boards and the app do. Every page on the suite's broker sees its hello -
// the other workers' too - so how often it is asked is counted as "at
// least once"; only "never" is exact.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const DATA_DDF_DIR = join(__dirname, "..", ".data", "ddf")

async function testDdf(deviceId: string, name: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      device: { id: deviceId, name },
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

type FakeDevice = {
  client: mqtt.MqttClient
  asked: { ddf: number; recovery: number }
  end: () => Promise<void>
}

// A device on the broker: its hello without `url`, answering `ddf/get` with
// `ddf` (retained) and `recovery/get` with `recovery` - or not at all.
async function fakeDevice(
  instanceId: string,
  hello: Record<string, unknown>,
  answers: { ddf?: Buffer | null; recovery?: Buffer | null },
): Promise<FakeDevice> {
  const base = `${TOPIC_PREFIX}/${instanceId}`
  const client = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(BROKER_URL, { clientId: `e2e-ddf-broker-${instanceId}` })
    c.on("connect", () => resolve(c))
    c.on("error", reject)
  })
  const asked = { ddf: 0, recovery: 0 }
  await new Promise<void>((resolve) => client.subscribe([`${base}/ddf/get`, `${base}/recovery/get`], () => resolve()))
  client.on("message", (topic) => {
    if (topic === `${base}/ddf/get`) {
      asked.ddf++
      if (answers.ddf) client.publish(`${base}/ddf`, answers.ddf, { retain: true })
    } else if (topic === `${base}/recovery/get`) {
      asked.recovery++
      if (answers.recovery !== undefined) client.publish(`${base}/recovery`, answers.recovery ?? Buffer.alloc(0))
    }
  })
  await new Promise<void>((resolve) => client.publish(`${base}/hello`, JSON.stringify(hello), { retain: true }, () => resolve()))
  return {
    client,
    asked,
    end: async () => {
      for (const leaf of ["hello", "ddf"]) {
        await new Promise<void>((resolve) => client.publish(`${base}/${leaf}`, "", { retain: true }, () => resolve()))
      }
      client.end()
    },
  }
}

test.describe("Device descriptions over the broker", () => {
  test("a device without a url is asked, answers on the broker, and is listed", async ({ page }, testInfo) => {
    const deviceId = `e2e-broker-ddf-${testInfo.testId}`
    const instanceId = `e2e-broker-ddf-instance-${testInfo.testId}`
    const name = `Over The Broker ${testInfo.testId}`
    const bytes = await testDdf(deviceId, name)
    const ddfHash = computeDdfHash(new Uint8Array(bytes))
    const device = await fakeDevice(instanceId, { deviceId, name, ddfHash }, { ddf: bytes })
    try {
      await page.goto("/")
      await waitForDeviceGate(page)
      await expect(page.getByRole("button", { name: `${ddfName(ddfHash)} ${name}` })).toBeVisible({ timeout: 20_000 })
      expect(device.asked.ddf).toBeGreaterThanOrEqual(1)
    } finally {
      await device.end()
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("a description the broker already holds is taken without asking the device", async ({ page }, testInfo) => {
    const deviceId = `e2e-broker-ddf-kept-${testInfo.testId}`
    const instanceId = `e2e-broker-ddf-kept-instance-${testInfo.testId}`
    const name = `Kept On The Broker ${testInfo.testId}`
    const bytes = await testDdf(deviceId, name)
    const ddfHash = computeDdfHash(new Uint8Array(bytes))
    const device = await fakeDevice(instanceId, { deviceId, name, ddfHash }, { ddf: bytes })
    await new Promise<void>((resolve) =>
      device.client.publish(`${TOPIC_PREFIX}/${instanceId}/ddf`, bytes, { retain: true }, () => resolve()),
    )
    try {
      await page.goto("/")
      await waitForDeviceGate(page)
      await expect(page.getByRole("button", { name: `${ddfName(ddfHash)} ${name}` })).toBeVisible({ timeout: 20_000 })
      expect(device.asked.ddf).toBe(0)
    } finally {
      await device.end()
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("an old description left on the broker is not taken: the device is asked for the one it announces", async ({ page }, testInfo) => {
    const deviceId = `e2e-broker-ddf-stale-${testInfo.testId}`
    const instanceId = `e2e-broker-ddf-stale-instance-${testInfo.testId}`
    const name = `Newer Firmware ${testInfo.testId}`
    const old = await testDdf(deviceId, `Older Firmware ${testInfo.testId}`)
    const bytes = await testDdf(deviceId, name)
    const ddfHash = computeDdfHash(new Uint8Array(bytes))
    const device = await fakeDevice(instanceId, { deviceId, name, ddfHash }, { ddf: bytes })
    await new Promise<void>((resolve) =>
      device.client.publish(`${TOPIC_PREFIX}/${instanceId}/ddf`, old, { retain: true }, () => resolve()),
    )
    try {
      await page.goto("/")
      await waitForDeviceGate(page)
      await expect(page.getByRole("button", { name: `${ddfName(ddfHash)} ${name}` })).toBeVisible({ timeout: 20_000 })
      expect(device.asked.ddf).toBeGreaterThanOrEqual(1)
    } finally {
      await device.end()
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  // #68: a description that cannot be loaded never says nothing. It is a
  // background scan, so it says it in the console, and says what to check.
  test("a device that never answers is not listed, and the reason names the broker's size limit", async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const deviceId = `e2e-broker-ddf-silent-${testInfo.testId}`
    const instanceId = `e2e-broker-ddf-silent-instance-${testInfo.testId}`
    const name = `Never Answers ${testInfo.testId}`
    const bytes = await testDdf(deviceId, name)
    const ddfHash = computeDdfHash(new Uint8Array(bytes))
    const device = await fakeDevice(instanceId, { deviceId, name, ddfHash }, {})
    const warnings: string[] = []
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "warning") warnings.push(m.text())
    })
    try {
      await page.goto("/")
      await waitForDeviceGate(page)
      await expect
        .poll(() => warnings.find((w) => w.includes(name)), { timeout: 60_000 })
        .toContain("did not send its device description within 30 s")
      expect(warnings.find((w) => w.includes(name))).toContain("message_size_limit")
      expect(device.asked.ddf).toBeGreaterThanOrEqual(1)
      await expect(page.getByRole("button", { name: `${ddfName(ddfHash)} ${name}` })).toHaveCount(0)
    } finally {
      await device.end()
    }
  })

  test("the upload refuses bytes that are not what the device announced", async ({ request }, testInfo) => {
    const deviceId = `e2e-broker-ddf-lie-${testInfo.testId}`
    const bytes = await testDdf(deviceId, "Lying Device")
    const refused = await request.post(`/api/ddf/upload?deviceId=${deviceId}&ddfHash=0123456789abcdef`, {
      data: bytes,
      headers: { "Content-Type": "application/zip" },
    })
    expect(refused.status()).toBe(422)
    expect((await refused.json()).error).toContain("but the device announced 0123456789abcdef")
    const other = await request.post(`/api/ddf/upload?deviceId=someone-else&ddfHash=${computeDdfHash(new Uint8Array(bytes))}`, {
      data: bytes,
      headers: { "Content-Type": "application/zip" },
    })
    expect(other.status()).toBe(422)
    expect((await other.json()).error).toContain(`doesn't match the announced deviceId ("someone-else")`)
  })

  test("a project is recovered over the broker, with the device's live description", async ({ page }, testInfo) => {
    const deviceId = `e2e-broker-recover-${testInfo.testId}`
    const instanceId = `e2e-broker-recover-instance-${testInfo.testId}`
    const projectName = `Recovered Over The Broker ${testInfo.testId}`
    const ddfBytes = await testDdf(deviceId, "Recovery Over The Broker")
    const ddfHash = computeDdfHash(new Uint8Array(ddfBytes))

    const editable = new JSZip()
    editable.file(
      "project.json",
      JSON.stringify({
        name: projectName,
        systemGeneration: "1.0",
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
    editable.file("_source/ddf.zip", ddfBytes)
    const exportZip = new JSZip()
    exportZip.file("project.json", JSON.stringify({ name: projectName, deviceId, screens: [] }))
    exportZip.file("_source/project.zip", await editable.generateAsync({ type: "nodebuffer" }))
    const exportBytes = await exportZip.generateAsync({ type: "nodebuffer" })

    const label = `Recoverable Over The Broker ${testInfo.testId}`
    const device = await fakeDevice(instanceId, { deviceId, name: label, ddfHash }, { ddf: ddfBytes, recovery: exportBytes })
    try {
      await page.goto("/")
      await page.getByRole("button", { name: "Recover from Device..." }).click()
      await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })
      await page.getByText(label).click()
      await page.getByRole("button", { name: "Recover", exact: true }).click()
      // Asked first, then the editor: the gate's button is hidden behind
      // the dialog already, so its going away alone said nothing yet.
      await expect.poll(() => device.asked.recovery, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
      await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible({ timeout: 20_000 })
      await page.getByRole("button", { name: "Settings", exact: true }).click()
      await page.getByText("Device", { exact: true }).click()
      await expect(page.getByText("Currently loaded: Recovery Over The Broker")).toBeVisible()
    } finally {
      await device.end()
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })

  test("a device with no recovery copy says so over the broker", async ({ page }, testInfo) => {
    const deviceId = `e2e-broker-norecover-${testInfo.testId}`
    const instanceId = `e2e-broker-norecover-instance-${testInfo.testId}`
    const ddfBytes = await testDdf(deviceId, "Nothing To Recover")
    const ddfHash = computeDdfHash(new Uint8Array(ddfBytes))
    const label = `Nothing Kept ${testInfo.testId}`
    const device = await fakeDevice(instanceId, { deviceId, name: label, ddfHash }, { ddf: ddfBytes, recovery: null })
    try {
      await page.goto("/")
      await page.getByRole("button", { name: "Recover from Device..." }).click()
      await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })
      await page.getByText(label).click()
      await page.getByRole("button", { name: "Recover", exact: true }).click()
      await expect(page.getByText(`"${label}" isn't offering a recovery copy`)).toBeVisible({ timeout: 20_000 })
    } finally {
      await device.end()
      await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
    }
  })
})
