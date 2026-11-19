import { test, expect } from "@playwright/test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { GET as brokerDefault } from "../app/api/broker-default/route"
import { GET as getDeviceAddress, PUT as putDeviceAddress } from "../app/api/device-address/route"
import { configuredDeviceAddress, writeDeviceAddress } from "../lib/device-address"
import { deviceFacingUrl } from "../lib/server-lan-address"
import { ownBroker, useOwnBroker, heardOn } from "./own-broker"
import { loadProject, COMBINED_TEST_PROJECT } from "./helpers"

// The designer in a Docker container (#82, a forum tester 2026-11-18): the
// broker and the device address given by the environment, since a
// container keeps that and nothing else. A browser had only its own
// localStorage, else ws://<the page's host>:9001; a deploy sent the device
// to the container's own address, and the address typed into the Deploy
// dialog was gone with the container.

const scriptOf = async (env: string | undefined, headers: Record<string, string> = {}) => {
  if (env === undefined) delete process.env.SCHALTLI_BROKER_URL
  else process.env.SCHALTLI_BROKER_URL = env
  try {
    return await (await brokerDefault(new Request("http://localhost:3000/api/broker-default", { headers }))).text()
  } finally {
    delete process.env.SCHALTLI_BROKER_URL
  }
}

test.describe("SCHALTLI_BROKER_URL", () => {
  test("the server hands it to the page; unset, not a WebSocket URL, or in the demo it hands nothing", async () => {
    expect(await scriptOf("ws://10.8.0.1:9001")).toBe('window.__schaltliBrokerUrl = "ws://10.8.0.1:9001";\n')
    expect(await scriptOf(" wss://van.example/mqtt ")).toContain('"wss://van.example/mqtt"')
    expect(await scriptOf(undefined)).toContain('= "";')
    expect(await scriptOf("10.8.0.1:9001")).toContain('= "";')
    expect(await scriptOf("ws://x/</script><script>alert(1)")).not.toContain("</script>")
    expect(await scriptOf("ws://10.8.0.1:9001", { "x-schaltli-demo": "1" })).toContain('= "";')
  })

  test("a fresh browser listens on the broker the server names; one set by hand still comes first", async ({ page }) => {
    const named = await ownBroker()
    const byHand = await ownBroker()
    try {
      await named.publish("container/named", "yes", true)
      await byHand.publish("container/by_hand", "yes", true)
      // What the server answers with SCHALTLI_BROKER_URL set, from its own
      // handler: the suite's server is one process for every spec.
      const script = await scriptOf(named.url)
      await page.route("**/api/broker-default", (route) => route.fulfill({ contentType: "text/javascript", body: script }))
      await loadProject(page, COMBINED_TEST_PROJECT)
      await expect.poll(() => heardOn(page, "container/named"), { timeout: 10_000 }).not.toBeNull()

      await page.evaluate((u) => window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: u, discoveryPrefix: "" })), byHand.url)
      await loadProject(page, COMBINED_TEST_PROJECT)
      await expect.poll(() => heardOn(page, "container/by_hand"), { timeout: 10_000 }).not.toBeNull()
      expect(await heardOn(page, "container/named")).toBeNull()
    } finally {
      await named.close()
      await byHand.close()
    }
  })
})

test.describe("SCHALTLI_DEVICE_ADDRESS", () => {
  // In a directory of its own: .data/device-address.json in the checkout
  // would send every other deploy of the suite there too.
  let dir: string
  let cwd: string
  test.beforeEach(() => {
    cwd = process.cwd()
    dir = mkdtempSync(join(tmpdir(), "schaltli-device-address-"))
    process.chdir(dir)
  })
  test.afterEach(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
    delete process.env.SCHALTLI_DEVICE_ADDRESS
  })

  const deploy = new Request("http://172.19.0.2:3000/api/deploy", { method: "POST", headers: { host: "172.19.0.2:3000" } })

  test("a deploy from a fresh container goes to it, not to the container's own address", () => {
    process.env.SCHALTLI_DEVICE_ADDRESS = "192.168.8.20:3000"
    expect(deviceFacingUrl(deploy, "/api/deploy/e2e")).toBe("http://192.168.8.20:3000/api/deploy/e2e")
  })

  test("it comes before an address saved in the Deploy dialog, which cannot change it", async () => {
    writeDeviceAddress("10.0.0.5:3000")
    expect(configuredDeviceAddress()).toBe("10.0.0.5:3000")
    process.env.SCHALTLI_DEVICE_ADDRESS = "192.168.8.20:3000"
    expect(configuredDeviceAddress()).toBe("192.168.8.20:3000")

    const got = await (await getDeviceAddress(new Request("http://localhost:3000/api/device-address"))).json()
    expect(got).toMatchObject({ configured: "192.168.8.20:3000", fixed: true })
    const put = await putDeviceAddress(
      new Request("http://localhost:3000/api/device-address", { method: "PUT", body: JSON.stringify({ address: "10.0.0.6" }) }),
    )
    expect(put.status).toBe(409)
    expect(configuredDeviceAddress()).toBe("192.168.8.20:3000")

    delete process.env.SCHALTLI_DEVICE_ADDRESS
    expect(configuredDeviceAddress()).toBe("10.0.0.5:3000")
  })
})

// What the server answers with it set, from its own handler, shown in the
// dialog: the suite's server is one process for every spec.
test("with SCHALTLI_DEVICE_ADDRESS, the Deploy dialog says where it comes from and offers no change", async ({ page }) => {
  process.env.SCHALTLI_DEVICE_ADDRESS = "192.168.8.20:3000"
  let body: string
  try {
    body = await (await getDeviceAddress(new Request("http://localhost:3000/api/device-address"))).text()
  } finally {
    delete process.env.SCHALTLI_DEVICE_ADDRESS
  }
  // The line is shown once the dialog has a broker.
  const own = await ownBroker()
  try {
    await useOwnBroker(page, own.url)
    await page.route("**/api/device-address", (route) => route.fulfill({ contentType: "application/json", body }))
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    await expect(page.getByTestId("device-address")).toHaveText("Devices download from 192.168.8.20:3000, set on the server by SCHALTLI_DEVICE_ADDRESS.")
    await expect(page.getByRole("button", { name: "Change address" })).toHaveCount(0)
  } finally {
    await own.close()
  }
})
