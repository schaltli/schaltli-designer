import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import http from "node:http"
import JSZip from "jszip"
import { rm } from "fs/promises"
import { join } from "path"
import { Aedes } from "aedes"
import { WebSocketServer, createWebSocketStream } from "ws"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { computeDdfHash, ddfName } from "../lib/ddf-name"
import { loadProject, COMBINED_TEST_PROJECT, waitForDeviceGate } from "./helpers"

// A broker that wants a login (#67, 2026-10-14): typed once into «Discover
// MQTT Topics», kept by the designer, and used by everything else that talks
// to the broker - here the device scan of a page that never saw the dialog.
//
// The broker is this spec's own, so the suite's anonymous one stays as it
// is. The login lives in the designer's .data, which every worker shares:
// the tests run one after another and leave it empty.

const USER = "van"
const PASSWORD = "geheim-1234"
const DATA_DDF_DIR = join(__dirname, "..", ".data", "ddf")

test.describe.configure({ mode: "serial" })

let wsUrl = ""
let close: () => Promise<void> = async () => {}

test.beforeAll(async () => {
  const broker = await Aedes.createBroker({
    authenticate: (_client, username, password, done) => {
      const ok = username === USER && password?.toString() === PASSWORD
      if (ok) return done(null, true)
      const error = Object.assign(new Error("Not authorized"), { returnCode: 5 })
      done(error as any, false)
    },
  })
  const server = http.createServer()
  const wss = new WebSocketServer({ server })
  wss.on("connection", (socket, req) => broker.handle(createWebSocketStream(socket) as any, req as any))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  wsUrl = `ws://127.0.0.1:${(server.address() as { port: number }).port}`
  close = async () => {
    wss.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await new Promise<void>((resolve) => broker.close(() => resolve()))
  }
})

test.afterAll(async ({ request }) => {
  await request.put("/api/broker-login", { data: { username: "", password: "" } })
  await close()
})

// This page talks to the spec's broker, as one set by hand would.
async function onThisBroker(page: Page) {
  await page.addInitScript((url) => {
    window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: url, discoveryPrefix: "" }))
  }, wsUrl)
}

test("a broker that wants a login says so, and the login typed once connects and is kept", async ({ page, request }) => {
  await request.put("/api/broker-login", { data: { username: "", password: "" } })
  await onThisBroker(page)
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByText("Topics", { exact: true }).click()
  await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
  await expect(page.getByText(/The broker refused the login/)).toBeVisible({ timeout: 15_000 })

  await page.locator("#username").fill(USER)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(await (await request.get("/api/broker-login")).json()).toEqual({ username: USER, password: PASSWORD })
})

test("every other connection uses the kept login: a page that never saw the dialog finds a device", async ({ page, request }, testInfo) => {
  await request.put("/api/broker-login", { data: { username: USER, password: PASSWORD } })
  const deviceId = `e2e-login-device-${testInfo.testId}`
  const instanceId = `e2e-login-instance-${testInfo.testId}`
  const name = `Behind A Login ${testInfo.testId}`
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
  zip.file("adornment.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10"/></svg>`)
  const bytes = await zip.generateAsync({ type: "nodebuffer" })
  const ddfHash = computeDdfHash(new Uint8Array(bytes))

  const device = await mqtt.connectAsync(wsUrl, { username: USER, password: PASSWORD, clientId: `e2e-login-${testInfo.testId}` })
  const base = `${TOPIC_PREFIX}/${instanceId}`
  await device.subscribeAsync(`${base}/ddf/get`)
  device.on("message", (topic) => {
    if (topic === `${base}/ddf/get`) device.publish(`${base}/ddf`, bytes, { retain: true })
  })
  await device.publishAsync(`${base}/hello`, JSON.stringify({ deviceId, name, ddfHash }), { retain: true })
  try {
    await onThisBroker(page)
    await page.goto("/")
    await waitForDeviceGate(page)
    await expect(page.getByRole("button", { name: `${ddfName(ddfHash)} ${name}` })).toBeVisible({ timeout: 20_000 })
  } finally {
    await device.publishAsync(`${base}/hello`, "", { retain: true })
    await device.publishAsync(`${base}/ddf`, "", { retain: true })
    await device.endAsync()
    await rm(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), { force: true })
  }
})

test("an emptied login is forgotten", async ({ request }) => {
  await request.put("/api/broker-login", { data: { username: USER, password: PASSWORD } })
  await request.put("/api/broker-login", { data: { username: " ", password: "left over" } })
  expect(await (await request.get("/api/broker-login")).json()).toEqual({ username: "", password: "" })
})
