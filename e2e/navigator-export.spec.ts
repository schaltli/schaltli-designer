import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// The navigator leaves for a device (docs/2026-10-08-navigator.md, device
// contract 2.7, tasks/navigator-todo.md Task 7): once, in navigators[], its
// entries as ordinary objects with baked icons; each screen names the one
// it shows; a hidden screen says so. A device below 1.5 is warned about.

const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

function project(withNavigator: boolean): any {
  const navigator = {
    id: "nav",
    type: "navigator",
    x: 0,
    y: 0,
    width: 80,
    height: 480,
    zIndex: 9,
    properties: { edge: "left", shows: "iconsAndText" },
  }
  return {
    name: "nav-export",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "square", name: "square", type: "icon", data: svg('<rect x="4" y="4" width="16" height="16" fill="currentColor"/>') },
      { id: "circle", name: "circle", type: "icon", data: svg('<circle cx="12" cy="12" r="8" fill="currentColor"/>') },
    ],
    topics: [{ id: "t", topic: "van/light", type: "text", examples: ["true"] }],
    screens: [
      { id: "m", name: "Master", isMaster: true, objects: withNavigator ? [navigator] : [] },
      { id: "a", name: "Licht", masterScreenId: "m", iconAssetId: "circle", iconLive: { id: "lv1", source: { namespace: "topic", path: "van/light" }, rules: [{ op: "yes", result: { kind: "icon", icon: "square" } }], otherwise: { kind: "icon", icon: "circle" } }, objects: [] },
      { id: "b", name: "Setup", masterScreenId: "m", hidden: withNavigator, iconAssetId: "square", objects: [] },
      { id: "c", name: "Heizung", masterScreenId: "m", iconAssetId: "square", objects: [] },
    ],
  }
}

async function exported(page: Page, p: any): Promise<{ json: any; zip: JSZip }> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const base64: string = await page.evaluate((proj) => (window as any).__buildDeviceZipForTest(proj), p)
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  return { json: JSON.parse(await zip.file("project.json")!.async("string")), zip }
}

test.describe("the navigator in the device export", () => {
  test("written once, its entries as objects with baked icons; screens name it", async ({ page }) => {
    const { json, zip } = await exported(page, project(true))
    expect(json.navigators).toHaveLength(1)
    const nav = json.navigators[0]
    expect(nav).toMatchObject({ id: "nav", edge: "left", thickness: 80, entryLength: 240 })
    expect(nav.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(nav.backgroundColorDark).toMatch(/^#[0-9a-f]{6}$/i)
    // The hidden screen has no entry.
    expect(nav.entries.map((e: any) => e.screenId)).toEqual(["a", "c"])
    for (const entry of nav.entries) {
      expect(entry.normal.map((o: any) => o.type)).toEqual(["icon", "text"])
      expect(entry.active.map((o: any) => o.type)).toEqual(["box", "icon", "text"])
      for (const icon of [...entry.normal, ...entry.active].filter((o: any) => o.type === "icon")) {
        expect(zip.file(icon.path), icon.path).not.toBeNull()
        expect(zip.file(icon.pathDark), icon.pathDark).not.toBeNull()
      }
      // Colours as everywhere: hex, with the dark value beside it.
      expect(entry.active[0].properties.fillColorDark).toMatch(/^#[0-9a-f]{6}$/i)
    }
    // A live screen icon goes as a live icon, every result with its bitmap.
    const live = nav.entries[0].normal[0]
    expect(live.properties.liveIconId).toBe("lv1")
    const results = [live.properties.liveValues[0].rules[0].result, live.properties.liveValues[0].otherwise]
    for (const result of results) expect(zip.file(result.path), result.path).not.toBeNull()
    expect(json.topics.map((t: any) => t.topic)).toContain("van/light")

    // Screens: the navigator not among their objects, its id named, a hidden one marked.
    for (const screen of json.screens) {
      expect(screen.objects.some((o: any) => o.type === "navigator")).toBe(false)
      expect(screen.navigatorId).toBe("nav")
    }
    expect(json.screens.find((s: any) => s.id === "b").hidden).toBe(true)
    expect(json.screens.find((s: any) => s.id === "a").hidden).toBeUndefined()
  })

  test("a project without navigator or hidden screen gains no key", async ({ page }) => {
    const { json } = await exported(page, project(false))
    expect(json.navigators).toBeUndefined()
    for (const screen of json.screens) {
      expect("navigatorId" in screen).toBe(false)
      expect("hidden" in screen).toBe(false)
    }
  })
})

// The app gets the same navigators[], its icons as tinted SVGs
// (tasks/navigator-todo.md Task 8).
test.describe("the navigator in the Android bundle", () => {
  test("written once, icon paths that exist in the bundle, screens name it", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const base64: string = await page.evaluate((p) => (window as any).__buildAndroidZipForTest(p), project(true))
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
    const json = JSON.parse(await zip.file("project.json")!.async("string"))
    expect(json.navigators).toHaveLength(1)
    const nav = json.navigators[0]
    expect(nav.entries.map((e: any) => e.screenId)).toEqual(["a", "c"])
    for (const entry of nav.entries) {
      for (const icon of [...entry.normal, ...entry.active].filter((o: any) => o.type === "icon")) {
        expect(zip.file(icon.path), icon.path).not.toBeNull()
        expect(zip.file(icon.pathDark), icon.pathDark).not.toBeNull()
      }
    }
    const live = nav.entries[0].normal[0].properties.liveValues[0]
    for (const result of [live.rules[0].result, live.otherwise]) expect(zip.file(result.path), result.path).not.toBeNull()
    for (const screen of json.screens) {
      expect(screen.objects.some((o: any) => o.type === "navigator")).toBe(false)
      expect(screen.navigatorId).toBe("nav")
    }
    expect(json.screens.find((s: any) => s.id === "b").hidden).toBe(true)
  })
})

// A device below 1.5 shows no navigator and pages to hidden screens: warned.
test.describe("deploying a navigator to a device that cannot show it", () => {
  const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

  for (const [generation, warned] of [
    ["1.4", true],
    ["1.5", false],
  ] as const) {
    test(`a device announcing ${generation} is ${warned ? "" : "not "}warned about`, async ({ page }, testInfo) => {
      const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
      const p = JSON.parse(await zip.file("project.json")!.async("string"))
      const main = p.screens.find((s: any) => !s.isMaster && s.screenType !== "popup")
      main.hidden = true
      zip.file("project.json", JSON.stringify(p))
      const withHidden = testInfo.outputPath("with-hidden.zip")
      fs.writeFileSync(withHidden, await zip.generateAsync({ type: "nodebuffer" }))

      const id = `e2e-nav-${testInfo.testId}`
      const device = await new Promise<mqtt.MqttClient>((resolve, reject) => {
        const client = mqtt.connect(BROKER_URL, { clientId: id, reconnectPeriod: 0 })
        client.once("connect", () => resolve(client))
        client.once("error", reject)
      })
      try {
        device.publish(
          `${TOPIC_PREFIX}/${id}/hello`,
          JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Navigator Test ${id}`, systemGeneration: generation }),
          { retain: true },
        )
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "online", { retain: true })

        await loadProject(page, withHidden)
        await page.getByRole("button", { name: "File" }).click()
        await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
        await page.getByText(`Navigator Test ${id}`, { exact: true }).click()
        await expect(page.getByTestId("navigator-generation-warning")).toHaveCount(warned ? 1 : 0)
        if (warned) await expect(page.getByTestId("navigator-generation-warning")).toContainText(`hidden screen ${main.name}`)
      } finally {
        device.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        device.end()
      }
    })
  }
})
