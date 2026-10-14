import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { packClipboard, unpackClipboard, pasteScreen, mergeNeeds, pastedObjects } from "../lib/clipboard-transfer"
import { buildEditableProjectZip } from "../lib/project-zip"
import { getMainCanvas, loadProject } from "./helpers"

// Copy and paste between projects (2026-10-11, lib/clipboard-transfer.ts):
// a screen or objects go onto the system's clipboard with the icons, fonts,
// topics and combined topics they need, and paste into another project - the
// demo's «Energie» into a VanPi's own.

const ROOT = path.join(__dirname, "..")
const DDF = path.join(ROOT, "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")
const SWITCH_TEST_PROJECT = path.join(ROOT, "test-projects", "switch-test-project.zip")

const camper = async (): Promise<any> => ({ ...(await buildCamperProject(new Uint8Array(fs.readFileSync(DDF)))), nextId: 1000 })

async function otherProject(): Promise<any> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

function walk(value: unknown, visit: (key: string, v: unknown) => void, key = "") {
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit, key))
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, visit, k)
  else visit(key, value)
}

test.describe("what a copy carries and how it merges", () => {
  test("a screen carries the icons, topics and combined topics it needs, and nothing else", async () => {
    const project = await camper()
    const energie = project.screens.find((s: any) => s.name === "Energie")
    const payload = unpackClipboard(packClipboard(project, { screen: energie }, "t1"))!
    expect(payload.screen!.name).toBe("Energie")
    expect(payload.assets.map((a) => a.id).sort()).toEqual(["icon-battery", "icon-battery-low", "icon-engine", "icon-load", "icon-plug", "icon-sun"])
    // With the local topic its «Flow | Sankey» writes and its switcher
    // reads (2026-10-13): a pasted switch with no topic behind it does nothing.
    expect(payload.topics.map((t) => t.topic).sort()).toEqual([
      "ble/charger/watts",
      "ble/orion/watts",
      "local/energie/view",
      "schaltli/state/battery/power",
      "schaltli/state/battery/soc",
      "van/energy/consumers_watts",
      "van/energy/solar_watts",
    ])
    expect(payload.combinedTopics).toEqual([])
    // helvR18 is the switch's.
    expect(payload.fonts.map((f) => f.id).sort()).toEqual(["font-helvB24", "font-helvR18", "font-luRS14", "font-luRS18"])
    expect([payload.screenWidth, payload.screenHeight]).toEqual([800, 480])

    // Licht's icon asks a combined topic, which comes with the topics it asks.
    const licht = project.screens.find((s: any) => s.name === "Licht")
    const lichtPayload = unpackClipboard(packClipboard(project, { screen: licht }, "t1"))!
    expect(lichtPayload.combinedTopics.map((c) => c.name)).toEqual(["licht_an"])
    expect(lichtPayload.topics.map((t) => t.topic)).toContain("schaltli/state/relay/2/power")

    // Any other text is not a copy.
    expect(unpackClipboard("hello")).toBeNull()
    expect(unpackClipboard('{"schaltli-clipboard": 1}')).toBeNull()
  })

  test("a pasted screen comes in after the open one, with fresh ids, the project's master and theme, and what it needs", async () => {
    const source = await camper()
    const target = await otherProject()
    const energie = source.screens.find((s: any) => s.name === "Energie")
    const payload = unpackClipboard(packClipboard(source, { screen: energie }, "t1"))!
    const first = target.screens.find((s: any) => !s.isMaster)
    const { project, screen } = pasteScreen(target, payload, first.id)
    expect(project.screens[project.screens.indexOf(screen) - 1].id).toBe(first.id)
    expect(screen.name).toBe("Energie")
    expect(screen.objects).toHaveLength(energie.objects.length)
    const ids = new Set(target.screens.flatMap((s: any) => [s.id, ...s.objects.map((o: any) => o.id)]))
    expect(ids.has(screen.id)).toBe(false)
    for (const o of screen.objects) expect(ids.has(o.id)).toBe(false)
    const master = target.screens.find((s: any) => s.isMaster)
    expect(screen.masterScreenId).toBe(master?.id)
    expect(screen.themeId).toBeUndefined()
    for (const t of payload.topics) expect(project.topics.some((x: any) => x.topic === t.topic)).toBe(true)
    // Every icon the screen shows is in the project it was pasted into.
    const assets = new Set(project.assets.map((a: any) => a.id))
    walk(screen, (key, v) => {
      if ((key === "assetId" || key === "icon") && typeof v === "string") expect(assets.has(v), v).toBe(true)
    })

    // Pasted again: a name of its own, the same icons, no second copy of them.
    const again = pasteScreen(project, payload, screen.id)
    expect(again.screen.name).toBe("Energie 2")
    expect(again.project.assets).toHaveLength(project.assets.length)
    expect(again.project.topics).toHaveLength(project.topics.length)
  })

  test("an icon or combined topic that differs under the same id or name comes in beside it, and the copy points at it", async () => {
    const source = await camper()
    const target = await otherProject()
    target.assets = [...target.assets, { id: "icon-bulb-on", name: "Other bulb", type: "icon", data: "data:image/svg+xml;base64,PHN2Zy8+" }]
    target.combinedTopics = [{ id: "ct-x", name: "licht_an", mode: "all", conditions: [] }]
    const licht = source.screens.find((s: any) => s.name === "Licht")
    const { project, screen } = pasteScreen(target, unpackClipboard(packClipboard(source, { screen: licht }, "t1"))!)
    // The project's own stay as they were.
    expect(project.assets.find((a: any) => a.id === "icon-bulb-on")!.name).toBe("Other bulb")
    expect(project.combinedTopics!.find((c: any) => c.name === "licht_an")!.mode).toBe("all")
    // The copy's come in beside them, and the screen points at those.
    expect(screen.iconLive!.source.path).toBe("licht_an_2")
    expect(project.combinedTopics!.find((c: any) => c.name === "licht_an_2")!.conditions).toHaveLength(5)
    const bulb = (screen.iconLive!.rules[0].result as any).icon
    expect(bulb).not.toBe("icon-bulb-on")
    expect(project.assets.find((a: any) => a.id === bulb)!.data).toBe(source.assets.find((a: any) => a.id === "icon-bulb-on").data)
  })

  test("objects carry what they need too, and merge the same way", async () => {
    const source = await camper()
    const target = await otherProject()
    const wasser = source.screens.find((s: any) => s.name === "Wasser")
    const payload = unpackClipboard(packClipboard(source, { objects: wasser.objects }, "t1"))!
    expect(payload.screen).toBeUndefined()
    const { project, rename } = mergeNeeds(target, payload)
    const objects = pastedObjects(payload, rename)
    expect(objects).toHaveLength(wasser.objects.length)
    expect(project.topics.some((t: any) => t.topic === "schaltli/state/tank/1/level")).toBe(true)
  })
})

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

// As Download Project writes it: the icons as files beside project.json.
async function camperZip(): Promise<string> {
  const blob = await buildEditableProjectZip(await camper())
  const out = path.join(os.tmpdir(), `camper-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
  return out
}

test.describe("between two tabs", () => {
  test("«Copy» on a screen in one, Ctrl+V in the other: the screen is there, with its icons and topics", async ({ context }) => {
    const from = await context.newPage()
    await loadProject(from, await camperZip())
    await from.getByText("Energie", { exact: true }).first().hover()
    await from.getByTitle("Actions for Energie").click()
    await from.getByRole("menuitem", { name: "Copy", exact: true }).click()
    await expect(from.getByText("«Energie» copied", { exact: true })).toBeVisible()

    const to = await context.newPage()
    await loadProject(to, SWITCH_TEST_PROJECT)
    const { canvas } = await getMainCanvas(to)
    await canvas.click({ position: { x: 5, y: 5 } })
    await to.keyboard.press("Control+V")
    // Made for 800 x 480, pasted into a round 360 x 360.
    await expect(to.getByText("Made for another screen", { exact: true })).toBeVisible()
    await expect(to.getByTitle("Actions for Energie")).toHaveCount(1)

    const project = await downloadProjectJson(to)
    const energie = project.screens.find((s: any) => s.name === "Energie")
    // Both looks of the diagram, in the switcher's panels since 2026-10-13.
    const diagrams = energie.objects.find((o: any) => o.type === "switcher").children.map((panel: any) => panel.children[0])
    expect(diagrams.map((d: any) => [d.type, d.properties.nodes.length])).toEqual([["energy-diagram", 6], ["energy-diagram", 6]])
    expect(project.topics.find((t: any) => t.topic === "local/energie/view")).toMatchObject({ local: true, initial: "flow" })
    expect(project.topics.map((t: any) => t.topic)).toContain("schaltli/state/battery/power")
    expect(project.assets.map((a: any) => a.name)).toEqual(expect.arrayContaining(["Battery", "Battery low", "Plug", "Sun"]))
    expect(energie.iconLive.otherwise.icon).toBe(project.assets.find((a: any) => a.name === "Battery").id)
  })

  test("Ctrl+C on objects in one, Ctrl+V in the other: they land where they were, with their topics; in the same tab, as before", async ({ context }) => {
    const from = await context.newPage()
    await loadProject(from, await camperZip())
    await from.getByText("Wasser", { exact: true }).first().click()
    const source = await getMainCanvas(from)
    await source.canvas.click({ position: { x: 5, y: 5 } })
    await from.keyboard.press("Control+A")
    await from.keyboard.press("Control+C")

    const to = await context.newPage()
    await loadProject(to, SWITCH_TEST_PROJECT)
    const before = await downloadProjectJson(to)
    const target = await getMainCanvas(to)
    await target.canvas.click({ position: { x: 5, y: 5 } })
    await to.keyboard.press("Control+V")
    await expect(to.getByText("Made for another screen", { exact: true })).toBeVisible()
    const after = await downloadProjectJson(to)
    const screenOf = (p: any) => p.screens.find((s: any) => !s.isMaster)
    const added = screenOf(after).objects.filter((o: any) => !screenOf(before).objects.some((b: any) => b.id === o.id))
    expect(added.length).toBeGreaterThanOrEqual(8)
    // Where they were on the screen they came from.
    const tank = added.find((o: any) => o.type === "bar")
    expect([tank.x, tank.y]).toEqual([140, 80])
    expect(after.topics.map((t: any) => t.topic)).toContain("schaltli/state/tank/1/level")

    // The tab's own copy pastes as it always did: 20 to the right and down.
    await source.canvas.click({ position: { x: 5, y: 5 } })
    await from.keyboard.press("Control+A")
    await from.keyboard.press("Control+C")
    await from.keyboard.press("Control+V")
    const own = await downloadProjectJson(from)
    const wasser = own.screens.find((s: any) => s.name === "Wasser")
    const bars = wasser.objects.filter((o: any) => o.type === "bar").map((o: any) => [o.x, o.y])
    expect(bars).toEqual(expect.arrayContaining([[140, 80], [160, 100]]))
  })
})
