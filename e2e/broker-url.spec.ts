import { test, expect } from "@playwright/test"
import { defaultBrokerUrl } from "../lib/broker-url"
import { loadProject, COMBINED_TEST_PROJECT } from "./helpers"

// The broker a page talks to when nobody has set one (lib/broker-url.ts):
// over http mosquitto's WebSocket listener on 9001, as on every Pekaway; over
// https wss on the page's own host, path /mqtt - an https page may not open a
// plain WebSocket, and demo.schaltli.com forwards /mqtt to the listener
// (docs/2026-10-09-demo-instance.md, decision 4). A URL set by hand wins over
// both: e2e/mqtt-connection.spec.ts.

test("over http the broker is the page's host on port 9001", () => {
  expect(defaultBrokerUrl({ protocol: "http:", hostname: "192.168.8.107", host: "192.168.8.107:3000" })).toBe("ws://192.168.8.107:9001")
  expect(defaultBrokerUrl({ protocol: "http:", hostname: "schaltli.peka.way", host: "schaltli.peka.way" })).toBe("ws://schaltli.peka.way:9001")
})

test("over https the broker is wss on the page's own host and port, at /mqtt", () => {
  expect(defaultBrokerUrl({ protocol: "https:", hostname: "demo.schaltli.com", host: "demo.schaltli.com" })).toBe("wss://demo.schaltli.com/mqtt")
  expect(defaultBrokerUrl({ protocol: "https:", hostname: "pi.local", host: "pi.local:8443" })).toBe("wss://pi.local:8443/mqtt")
})

test("without a page (server side) it is the local broker", () => {
  expect(defaultBrokerUrl(undefined)).toBe("ws://localhost:9001")
})

test("the designer, opened over http here, offers the broker on 9001", async ({ page }) => {
  // What the hook derives, where a user sees it: the discovery dialog's
  // connection settings, with nothing stored.
  await loadProject(page, COMBINED_TEST_PROJECT)
  await page.evaluate(() => window.localStorage.clear())
  await page.getByRole("button", { name: "Settings" }).click()
  await page.getByText("Topics", { exact: true }).click()
  await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
  await page.getByRole("button", { name: "Connection settings" }).click()
  await expect(page.locator("#websocketUrl")).toHaveValue("ws://localhost:9001")
})
