import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import JSZip from "jszip"
import http from "node:http"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"
import { computeDdfHash } from "../lib/ddf-name"
import { serverLanAddress } from "../lib/server-lan-address"
import { planDeploy } from "../lib/deploy-plan"
import { screenGraphFeature } from "../lib/screen-graph"

// Deploy asks the feature `screen-graph` of a device once a screen lies off
// the main row (device contract §2.10; docs/2026-10-17-screen-graph.md
// decision 14; tasks/graph-contract-plan.md, decision 1: hard from now on).
// One row needs nothing of it.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

test.describe("the screen graph's feature", () => {
  test("named for the screens off the main row; nothing for one row, a hidden screen or a popup", () => {
    const row = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "h", name: "H", hidden: true },
      { id: "p", name: "P", screenType: "popup" as const },
    ]
    expect(screenGraphFeature(row)).toBeNull()
    const docked = [...row, { id: "a1", name: "Verlauf", dock: { screenId: "a", edge: "down" as const } }]
    expect(screenGraphFeature(docked)).toEqual({ feature: "screen-graph", label: "screens off the main row (Verlauf)" })
  })

  test("a board without it is updated first where its release has it, else refused; an app is asked to update", () => {
    const graph = [{ feature: "screen-graph", label: "screens off the main row (Verlauf)" }]
    const release = { build: "fw-2026.10.18.1", systemGeneration: "1.9", available: true }
    const board = { name: "4.3B", platform: "firmware" as const, online: true, systemGeneration: "1.8", firmwareBuild: "fw-2026.10.11.2" }
    expect(planDeploy({ device: board, release, needs: [], unsupportedFeatures: graph, releaseTypes: [], releaseFeatures: ["screen-graph"] }).kind).toBe(
      "update-and-deploy",
    )
    expect(planDeploy({ device: board, release, needs: [], unsupportedFeatures: graph, releaseTypes: [], releaseFeatures: [] })).toEqual({
      kind: "blocked",
      reason: '"4.3B" cannot show screens off the main row (Verlauf). Remove it from the project, or choose another device.',
    })
    const phone = { name: "P20 Pro", platform: "android" as const, online: true, systemGeneration: "1.8", firmwareVersion: "0.12.0" }
    expect(planDeploy({ device: phone, release, needs: [], unsupportedFeatures: graph, releaseTypes: [], releaseFeatures: ["screen-graph"] })).toMatchObject({
      kind: "blocked",
      reason: 'App 0.12.0 cannot show screens off the main row (Verlauf). Update the app on "P20 Pro", then deploy.',
    })
  })
})

test.describe("Deploy and the screen graph", () => {
  let deviceClient: mqtt.MqttClient
  let boardId: string
  let kind: string

  test.beforeEach(async ({}, testInfo) => {
    boardId = `e2e-graph-${testInfo.testId}`
    kind = `e2e-graph-kind-${testInfo.testId}`
    deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-graph-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })
  })

  test.afterEach(async () => {
    deviceClient.publish(`${TOPIC_PREFIX}/${boardId}/hello`, "", { retain: true })
    deviceClient.publish(`${TOPIC_PREFIX}/${boardId}/status`, "", { retain: true })
    await new Promise((r) => setTimeout(r, 200))
    deviceClient.end()
    await rm(join(__dirname, "..", ".data", "ddf", `${kind}.ddf.zip`), { force: true })
  })

  // The combined project, bound to this test's device kind, its third
  // screen below the first or not.
  async function project(outPath: string, docked: boolean): Promise<string> {
    const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
    const p = JSON.parse(await zip.file("project.json")!.async("string"))
    p.settings.deviceId = kind
    if (docked) p.screens.find((s: any) => s.id === "screen-3").dock = { screenId: "screen-1", edge: "down" }
    zip.file("project.json", JSON.stringify(p))
    await writeFile(outPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
    return outPath
  }

  test("a docked project is refused by a device without `screen-graph` and deployable to one with it; one row needs nothing", async ({ page }, testInfo) => {
    const ALL_TYPES = [
      "text", "live-text", "icon", "live-icon", "bar", "slider", "gauge", "dial", "switch", "button-group", "button",
      "line", "live-line", "box", "switcher", "panel", "navigator", "group", "table", "free",
    ]
    const ddf = async (supportedFeatures: string[]) => {
      const zip = new JSZip()
      zip.file(
        "device.json",
        JSON.stringify({
          device: { id: kind, name: "Graph test board" },
          screen: { width: 400, height: 300, colorDepth: "1bit" },
          adornment: { svgPath: "adornment.svg" },
          hardwareButtons: [],
          fonts: [],
          supportedObjectTypes: ALL_TYPES,
          supportedFeatures,
        }),
      )
      zip.file(
        "adornment.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect id="screen" x="0" y="0" width="400" height="300" fill="none" stroke="none"/></svg>`,
      )
      return zip.generateAsync({ type: "nodebuffer" })
    }
    let ddfBytes = await ddf([])
    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" })
      res.end(ddfBytes)
    })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as { port: number }).port
    const lanIp = serverLanAddress()
    test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the fake device's DDF from")
    const name = `Graph board ${boardId}`
    const hello = () =>
      deviceClient.publish(
        `${TOPIC_PREFIX}/${boardId}/hello`,
        JSON.stringify({
          deviceId: kind,
          name,
          systemGeneration: "1.8",
          ddfHash: computeDdfHash(new Uint8Array(ddfBytes)),
          url: `http://${lanIp}:${port}/ddf.zip`,
        }),
        { retain: true },
      )

    try {
      hello()
      deviceClient.publish(`${TOPIC_PREFIX}/${boardId}/status`, "online", { retain: true })
      const openDeploy = async (docked: boolean) => {
        await loadProject(page, await project(testInfo.outputPath(`${docked ? "docked" : "row"}.zip`), docked))
        await page.getByRole("button", { name: "File" }).click()
        await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
        await page.getByRole("dialog").getByText(name).click()
      }
      const deploy = () => page.getByRole("button", { name: "Deploy", exact: true })

      // One row: nothing asked of the device.
      await openDeploy(false)
      await expect(deploy()).toBeEnabled({ timeout: 10000 })
      await expect(page.getByTestId("deploy-blocked")).toHaveCount(0)
      await page.keyboard.press("Escape")

      // Docked: refused, the screen named.
      await openDeploy(true)
      await expect(page.getByTestId("deploy-blocked")).toContainText(
        `"${name}" cannot show screens off the main row (label-tests-black-background)`,
        { timeout: 10000 },
      )
      await expect(deploy()).toBeDisabled()

      // The device declares it now: deployable.
      ddfBytes = await ddf(["screen-graph"])
      hello()
      await expect(page.getByTestId("deploy-blocked")).toHaveCount(0, { timeout: 10000 })
      await expect(deploy()).toBeEnabled()
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  })
})
