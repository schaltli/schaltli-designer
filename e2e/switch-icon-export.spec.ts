import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"

// A Switch's state icons, baked per screen, are filed under the Switch and
// the state together (lib/asset-export.ts switchStateKey). Found in the van
// on 2026-10-04: every Switch a block builds names its states off and on,
// and a master's light/dark Switch on a screen beside a cover's Zu/Offen
// took the cover's eye icons - the state id alone was the key, and the
// second bake overwrote the first's file.

type Obj = Record<string, any>

const svg = (fill: string) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${fill}"/></svg>`).toString("base64")

function buttons(id: string, topic: string, words: [string, string], icons?: [string, string]): Obj {
  const state = (stateId: string, word: string, icon?: string) => ({
    id: stateId,
    label: word,
    readValue: word,
    writeValue: word,
    ...(icon ? { iconAssetId: icon } : {}),
  })
  return {
    id,
    type: "button-group",
    x: 20,
    y: id === "theme" ? 20 : 120,
    width: 240,
    height: 48,
    zIndex: 1,
    properties: {
      topic,
      writeTopic: `${topic}/set`,
      switchStyle: "filled",
      switchColor: "#3366cc",
      states: [state("off", words[0], icons?.[0]), state("on", words[1], icons?.[1])],
    },
  }
}

function project(): Obj {
  return {
    name: "switch icons",
    screenWidth: 400,
    screenHeight: 300,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "eye-closed", name: "eye closed", type: "icon", data: svg("#000") },
      { id: "eye-open", name: "eye open", type: "icon", data: svg("#333") },
      { id: "fan-slow", name: "fan slow", type: "icon", data: svg("#666") },
      { id: "fan-fast", name: "fan fast", type: "icon", data: svg("#999") },
    ],
    topics: [],
    hardwareButtons: [],
    snapGuides: [],
    nextId: 100,
    screens: [
      { id: "master", name: "Master", isMaster: true, backgroundColor: "#ffffff", objects: [buttons("theme", "theme", ["light", "dark"])] },
      {
        id: "s1",
        name: "Screen 1",
        masterScreenId: "master",
        backgroundColor: "#ffffff",
        objects: [
          buttons("cover", "cover", ["closed", "open"], ["eye-closed", "eye-open"]),
          { ...buttons("speed", "speed", ["slow", "fast"], ["fan-slow", "fan-fast"]), y: 200 },
        ],
      },
    ],
  }
}

async function exported(page: Page): Promise<{ zip: JSZip; screen: Obj }> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project())
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  const json = JSON.parse(await zip.file("project.json")!.async("string"))
  return { zip, screen: json.screens.find((s: Obj) => s.id === "s1") }
}

test("each Switch keeps its own state icons, however its states are named", async ({ page }) => {
  const { zip, screen } = await exported(page)
  const byId = (id: string) => screen.objects.find((o: Obj) => o.id === id)

  // The master's Switch has no icons, and gets none from its neighbour.
  for (const state of byId("theme").properties.states) {
    expect(state.path, `theme ${state.id}`).toBeUndefined()
  }

  // The two with icons each have their own files, all four different and
  // all in the zip.
  const paths = ["cover", "speed"].flatMap((id) => byId(id).properties.states.map((s: Obj) => s.path))
  expect(paths.every((p: unknown) => typeof p === "string")).toBe(true)
  expect(new Set(paths).size).toBe(4)
  for (const p of paths) expect(zip.file(p), p).not.toBeNull()
})
