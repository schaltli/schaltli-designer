import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import http from "node:http"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { computeDdfHash } from "../lib/ddf-name"
import { serverLanAddress } from "../lib/server-lan-address"

// Settings › Device asks the broker what is here (#63, #64). On 2026-10-09 in
// the van it listed every description it had ever fetched as «Announced
// Devices» and fetched no newer one: the phone, updated to an app with the
// navigator, was still offered as its old description, without it.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

async function ddf(id: string, name: string, types: string[]) {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      device: { id, name },
      screen: { width: 400, height: 300, colorDepth: "24bit" },
      adornment: { svgPath: "adornment.svg" },
      fonts: [],
      supportedObjectTypes: types,
    }),
  )
  zip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect id="screen" x="0" y="0" width="400" height="300" fill="none" stroke="none"/></svg>`,
  )
  return zip.generateAsync({ type: "nodebuffer" })
}

test("the project's device with a newer description is offered as an update; one gone is «Seen before»", async ({ page }, testInfo) => {
  const deviceId = `e2e-settings-${testInfo.testId}`
  const goneId = `e2e-settings-gone-${testInfo.testId}`
  const instance = `e2e-settings-inst-${testInfo.testId}`
  const goneInstance = `e2e-settings-goneinst-${testInfo.testId}`
  const zips: Record<string, Buffer> = {
    "/old.zip": await ddf(deviceId, `Settings Device ${testInfo.testId}`, ["text", "box"]),
    "/new.zip": await ddf(deviceId, `Settings Device ${testInfo.testId}`, ["text", "box", "navigator"]),
    "/gone.zip": await ddf(goneId, `Gone Device ${testInfo.testId}`, ["text"]),
  }
  const server = http.createServer((req, res) => {
    const body = zips[req.url ?? ""]
    res.writeHead(body ? 200 : 404, { "Content-Type": "application/zip" })
    res.end(body ?? "")
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as { port: number }).port
  const lanIp = serverLanAddress()
  test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake devices' DDFs from")
  const url = (p: string) => `http://${lanIp}:${port}${p}`

  const broker = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(BROKER_URL, { clientId: `e2e-settings-${testInfo.testId}` })
    c.on("connect", () => resolve(c))
    c.on("error", reject)
  })
  try {
    // The descriptions this designer has: the device's old one, and one of a
    // device that is gone.
    for (const p of ["/old.zip", "/gone.zip"]) {
      const fetched = await page.request.post("/api/ddf/fetch", { data: { url: url(p) } })
      expect(fetched.ok(), JSON.stringify(await fetched.json())).toBe(true)
    }
    // The gone one's hello is still retained - and its status says offline.
    broker.publish(`${TOPIC_PREFIX}/${goneInstance}/hello`, JSON.stringify({ deviceId: goneId, name: "Gone", url: url("/gone.zip") }), { retain: true })
    broker.publish(`${TOPIC_PREFIX}/${goneInstance}/status`, "offline", { retain: true })

    // A project made with the device's old description.
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)

    // The device comes up announcing its new description.
    broker.publish(
      `${TOPIC_PREFIX}/${instance}/hello`,
      JSON.stringify({ deviceId, name: "Settings Device", ddfHash: computeDdfHash(new Uint8Array(zips["/new.zip"])), url: url("/new.zip") }),
      { retain: true },
    )
    broker.publish(`${TOPIC_PREFIX}/${instance}/status`, "online", { retain: true })

    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Device", exact: true }).click()

    // Offered, and taken: the offer goes once the project has it.
    const update = dialog.getByTestId("device-update")
    await expect(update).toBeVisible({ timeout: 20000 })
    await update.getByRole("button", { name: "Update device" }).click()
    await expect(update).toHaveCount(0, { timeout: 10000 })

    // The gone device is not «announced»: it is under «Seen before».
    await dialog.locator("#ddf-select").click()
    const listbox = page.getByRole("listbox")
    const seenBefore = listbox.getByRole("group").filter({ hasText: "Seen before" })
    await expect(seenBefore.getByRole("option", { name: new RegExp(`Gone Device ${testInfo.testId}`) })).toBeVisible()
    const announced = listbox.getByRole("group").filter({ hasText: "Announced Devices" })
    await expect(announced.getByRole("option", { name: new RegExp(`Gone Device ${testInfo.testId}`) })).toHaveCount(0)
    await expect(announced.getByRole("option", { name: new RegExp(`Settings Device ${testInfo.testId}`) })).toBeVisible()
  } finally {
    for (const i of [instance, goneInstance]) {
      broker.publish(`${TOPIC_PREFIX}/${i}/hello`, "", { retain: true })
      broker.publish(`${TOPIC_PREFIX}/${i}/status`, "", { retain: true })
    }
    await new Promise((r) => setTimeout(r, 200))
    broker.end(true)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    for (const id of [deviceId, goneId]) await rm(join(__dirname, "..", ".data", "ddf", `${id}.ddf.zip`), { force: true })
  }
})
