import { test, expect } from "@playwright/test"
import { Jimp } from "jimp"
import fs from "fs"
import path from "path"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { fakePekaway } from "../integrations/vanpi/demo-van"
import { createBridgeLogic } from "../integrations/vanpi/bridge-logic"
import { createProjectStore } from "../lib/project-store"
import { computeCombined } from "../lib/combined-topics"
import { evaluate, formatValue } from "../lib/live-value"
import { DEFAULT_SEPARATORS } from "../lib/placeholders"

// The start project of demo.schaltli.com (docs/2026-10-09-demo-instance.md,
// decision 7), built by deploy/demo/camper-project.ts from the 4.3B's
// description. Every topic it reads is one the demo van publishes and every
// one it writes is a command the bridge takes. It is not kept as a file (3 MB,
// the device's fonts in it): deploy/demo/setup writes it into a project store
// in the designer's own format - DEMO_SEED_DIR=<dir> on this spec - and copies
// that store to the server.

const ROOT = path.join(__dirname, "..")
const DDF = path.join(ROOT, "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")

async function built() {
  return buildCamperProject(new Uint8Array(fs.readFileSync(DDF)))
}

// What the demo van publishes: the bridge's own flattening of what the fake
// Pekaway answers, for every kind it has.
function vanTopics(): Set<string> {
  const logic = createBridgeLogic()
  const pekaway = fakePekaway()
  const topics = new Set<string>()
  for (const kind of ["dimmer", "relay", "level", "batt", "mppt"]) {
    const answer = pekaway.answer(kind)
    expect(answer, kind).not.toBeNull()
    for (const u of logic.flatten(kind, answer, {})) topics.add(u.topic)
  }
  // The theme is the bridge's own; the van sets it light at the start.
  topics.add("schaltli/state/theme")
  // Beside Pekaway, as the author's van has them: the chargers and the
  // Node-RED tab Energie (a JSON field read through "#value").
  for (const [topic, value] of pekaway.energy()) {
    topics.add(topic)
    if (value.startsWith("{")) topics.add(`${topic}#value`)
  }
  return topics
}

function walk(value: unknown, visit: (key: string, v: unknown) => void, key = "") {
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit, key))
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, visit, k)
  else visit(key, value)
}

test("every topic «Camper» reads, the demo van publishes; every one it writes, the bridge takes", async () => {
  const project = await built()
  const published = vanTopics()
  const logic = createBridgeLogic()
  const read = new Set<string>()
  const written = new Set<string>()
  walk(project.screens, (key, v) => {
    if (typeof v !== "string") return
    if (key === "topic") read.add(v)
    if (key === "writeTopic") written.add(v)
    if (key === "path" && v.startsWith("schaltli/")) read.add(v)
  })
  for (const c of project.combinedTopics) for (const cond of c.conditions) read.add(cond.source.path)
  expect(read.size).toBeGreaterThan(10)
  // A local topic never reaches the broker (docs/2026-10-13-local-topics.md):
  // nothing publishes it and no bridge takes it - the display keeps it.
  const local = new Set(project.topics.filter((t: any) => t.local).map((t: any) => t.topic))
  for (const t of read) if (!local.has(t)) expect(published.has(t), `${t} is not published by the demo van`).toBe(true)
  // A command the bridge takes: it answers it with something to do, for every
  // value a switch writes.
  const state = Object.fromEntries([...published].map((t) => [t, "off"]))
  const writes: [string, string][] = []
  for (const screen of project.screens)
    for (const o of screen.objects as any[]) {
      const p = o.properties
      if (p?.writeTopic && p.states) for (const st of p.states) writes.push([p.writeTopic, st.writeValue])
      else if (p?.writeTopic) writes.push([p.writeTopic, "50"])
    }
  expect(new Set(writes.map(([t]) => t))).toEqual(written)
  for (const [t, v] of writes) if (!local.has(t)) expect(logic.command(t, v, state), `${t} = ${v} is not a command the bridge takes`).not.toBeNull()
  // And every one is declared among the project's topics.
  // A JSON field (`ble/charger/watts#value`) is declared under its topic.
  const declared = new Set(project.topics.map((t) => t.topic))
  for (const t of [...read, ...written]) expect(declared.has(t.split("#")[0]), `${t} is not declared`).toBe(true)
})

test("Energie first, then Licht, Wasser, two pages to come, and the navigator; the page icons follow the van", async () => {
  const project = await built()
  expect(project.settings.deviceId).toBe("waveshare-touch-lcd-4v3b")
  expect(project.screens.map((s) => s.name)).toEqual(["Master", "Energie", "Licht", "Wasser", "MaxxFan", "Heizung"])
  expect(project.screens[0].objects.map((o) => o.type)).toEqual(["navigator", "switch"])
  // Top right on the master: light or dark.
  const theme = project.screens[0].objects[1] as any
  expect(theme.x + theme.width).toBeGreaterThan(project.screenWidth - 40)
  expect(theme.y).toBeLessThan(40)
  expect(theme.properties).toMatchObject({ topic: "schaltli/state/theme", writeTopic: "schaltli/cmnd/theme" })
  expect(theme.properties.states.map((s: any) => [s.label, s.writeValue])).toEqual([["Hell", "light"], ["Dunkel", "dark"]])
  const screen = (name: string) => project.screens.find((s) => s.name === name) as any
  const types = (name: string) => screen(name).objects.map((o: any) => o.type).filter((t: string) => t !== "text")
  expect(types("Licht")).toEqual(["dial", "slider", "switch", "switch", "switch"])
  expect(types("Wasser")).toEqual(["bar", "bar", "switch", "switch"])
  const licht = screen("Licht")
  expect(licht.iconLive).toMatchObject({ source: { namespace: "combined", path: "licht_an" }, otherwise: { icon: "icon-bulb-off" } })
  expect(project.combinedTopics[0]).toMatchObject({ name: "licht_an", mode: "any" })
  expect(project.combinedTopics[0].conditions).toHaveLength(5)
  // Wasser: a drop, with an exclamation mark while grey > 80 % or fresh < 20 %.
  const wasser = screen("Wasser")
  expect(wasser.iconLive).toMatchObject({ source: { namespace: "combined", path: "wasser_achtung" }, otherwise: { icon: "icon-drop" } })
  expect(wasser.iconLive.rules[0].result.icon).toBe("icon-drop-alert")
  expect(project.combinedTopics[1]).toMatchObject({
    name: "wasser_achtung",
    mode: "any",
    conditions: [
      { source: { path: "schaltli/state/tank/2/level" }, op: ">", operand: "80" },
      { source: { path: "schaltli/state/tank/1/level" }, op: "<", operand: "20" },
    ],
  })
  // Computed as the designer and the devices compute it.
  const alert = (tanks: Record<string, string>) =>
    computeCombined(project.combinedTopics as any, (p) => tanks[p]).get("wasser_achtung")
  expect(alert({ "schaltli/state/tank/1/level": "60", "schaltli/state/tank/2/level": "50" })).toBe("false")
  expect(alert({ "schaltli/state/tank/1/level": "60", "schaltli/state/tank/2/level": "85" })).toBe("true")
  expect(alert({ "schaltli/state/tank/1/level": "15", "schaltli/state/tank/2/level": "50" })).toBe("true")
  expect(alert({ "schaltli/state/tank/1/level": "20", "schaltli/state/tank/2/level": "80" })).toBe("false")
  for (const name of ["MaxxFan", "Heizung"]) expect(JSON.stringify(screen(name).objects)).toContain("Coming soon")
  const [pump, drain] = wasser.objects.filter((o: { type: string }) => o.type === "switch") as any[]
  expect(pump.properties.topic).toBe("schaltli/state/relay/4/power")
  expect(pump.properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "An"])
  expect(drain.properties.topic).toBe("schaltli/state/relay/3/power")
  expect(drain.properties.states.map((s: { label: string }) => s.label)).toEqual(["Zu", "Offen"])
})

// Energie (2026-10-11, a Flow since 2026-10-13): the sun, the mains and the
// engine into the 12 V bus, the battery and what draws off it. The battery is
// Pekaway's through the bridge, the rest as the author's van has it
// (vanpi-custom), so the page goes into his project as it is.
test("Energie: an energy diagram as Flow or Sankey, switched on the display - three sources, the battery and what draws on the bus", async () => {
  const project = await built()
  const energie = project.screens.find((s) => s.name === "Energie") as any
  expect(energie.name).toBe("Energie")
  const read = new Set<string>()
  walk(energie, (key, v) => {
    if ((key === "topic" || key === "chargeTopic" || key === "path") && typeof v === "string") read.add(v)
  })
  expect([...read].sort()).toEqual([
    "ble/charger/watts#value",
    "ble/orion/watts#value",
    "local/energie/view",
    "schaltli/state/battery/power",
    "schaltli/state/battery/soc",
    "van/energy/consumers_watts",
    "van/energy/solar_watts",
  ])
  // The chargers' topics are declared as JSON with their field "value".
  const charger = project.topics.find((t: any) => t.topic === "ble/charger/watts") as any
  expect(charger).toMatchObject({ type: "json", subtopics: [{ path: "value", type: "numeric" }] })
  // Nothing on it writes to the van: only its switch, the local topic of
  // which look this display shows, initially the Flow.
  expect(JSON.stringify(energie).match(/"writeTopic":"[^"]*"/g)).toEqual(['"writeTopic":"local/energie/view"'])
  expect(project.topics.find((t: any) => t.topic === "local/energie/view")).toMatchObject({ local: true, initial: "flow" })
  // The page's icon: an empty battery below 20 %.
  expect(energie.iconLive).toMatchObject({ source: { path: "schaltli/state/battery/soc" }, otherwise: { icon: "icon-battery" } })
  expect(energie.iconLive.rules).toEqual([{ op: "<", operand: "20", result: { kind: "icon", icon: "icon-battery-low" } }])

  // The title, «Flow | Sankey» beside it and left of the master's
  // light/dark switch, and a switcher holding the diagram in both looks.
  expect(energie.objects.map((o: any) => o.type)).toEqual(["text", "button-group", "switcher"])
  const [titleText, view, looks] = energie.objects
  expect(view.properties).toMatchObject({ topic: "local/energie/view", writeTopic: "local/energie/view" })
  expect(view.properties.states.map((s: any) => [s.label, s.writeValue])).toEqual([["Flow", "flow"], ["Sankey", "sankey"]])
  const theme = project.screens[0].objects[1] as any
  expect(view.x).toBeGreaterThanOrEqual(titleText.x + titleText.width)
  expect(view.x + view.width).toBeLessThanOrEqual(theme.x)
  expect(looks.properties.topic).toBe("local/energie/view")
  expect(looks.children.map((p: any) => [p.type, p.properties.comparisonValue])).toEqual([["panel", "flow"], ["panel", "sankey"]])
  const diagrams = looks.children.map((p: any) => p.children[0])
  expect(diagrams.map((d: any) => [d.type, d.properties.mode, d.properties.motion])).toEqual([["energy-diagram", "flow", true], ["energy-diagram", "sankey", true]])
  expect(JSON.stringify(diagrams[1].properties.nodes)).toBe(JSON.stringify(diagrams[0].properties.nodes))
  // Each fills its panel, which is the switcher's box.
  const diagram = { ...diagrams[0], x: looks.x, y: looks.y }
  expect(diagrams[0]).toMatchObject({ x: 0, y: 0, width: looks.width, height: looks.height })
  const nodes = diagram.properties.nodes
  expect(nodes.map((n: any) => [n.name, n.role, n.colorRole])).toEqual([
    ["12 V", "bus", undefined],
    ["Solar", "source", "energySun"],
    ["Landstrom", "source", "energyGrid"],
    ["Ladebooster", "source", "energyEngine"],
    ["Batterie", "storage", "energyCharge"],
    ["Verbraucher", "sink", "energyLoad"],
  ])
  const battery = nodes.find((n: any) => n.role === "storage")
  expect(battery).toMatchObject({ topic: "schaltli/state/battery/power", chargeTopic: "schaltli/state/battery/soc" })
  // Every node inside the diagram; the diagram inside the screen, beside the
  // navigator and under the light/dark switch top right.
  for (const n of nodes) {
    expect(n.x).toBeGreaterThan(0)
    expect(n.x).toBeLessThan(diagram.width)
    expect(n.y).toBeGreaterThan(0)
    expect(n.y).toBeLessThan(diagram.height)
  }
  expect(diagram.x).toBeGreaterThanOrEqual(104)
  expect(diagram.x + diagram.width).toBeLessThanOrEqual(project.screenWidth)
  expect(diagram.y + diagram.height).toBeLessThanOrEqual(project.screenHeight)
  expect(diagram.y).toBeGreaterThanOrEqual(62)
  // Fonts the device has.
  const fonts = new Set(project.fonts.map((f: any) => f.id))
  expect(fonts.has(diagram.properties.fontId)).toBe(true)
  expect(fonts.has(diagram.properties.valueFontId)).toBe(true)

  // Every icon it uses is in the project.
  const assets = new Set(project.assets.map((a: any) => a.id))
  walk(energie, (key, v) => {
    if ((key === "assetId" || key === "iconAssetId" || key === "icon") && typeof v === "string") expect(assets.has(v), v).toBe(true)
  })

  // The battery's charge under its watts, as the designer and the devices
  // resolve a live value.
  const soc = battery.lines[1].liveValues[0]
  expect(battery.lines[1].text).toBe(`{live:${soc.id}}`)
  const { result } = evaluate(soc, "82")
  expect((result as any).parts.map((p: any) => (typeof p === "string" ? p : formatValue("82", soc.format, DEFAULT_SEPARATORS))).join("")).toBe("82 %")

  // The demo van's numbers add up on the bus - in from the sun, the chargers
  // and a giving battery, out to what draws and a charging one - so no node
  // is left to be worked out as a rest. Within the bridge's battery watts,
  // which are its volts under current times its amps.
  const pekaway = fakePekaway()
  const logic = createBridgeLogic()
  for (const daylight of [0, 0.5, 1]) {
    pekaway.tick(2, daylight)
    const values: Record<string, number> = {}
    for (const [topic, value] of pekaway.energy()) values[value.startsWith("{") ? `${topic}#value` : topic] = Number(value.startsWith("{") ? JSON.parse(value).value : value)
    for (const u of logic.flatten("batt", pekaway.answer("batt"), {})) values[u.topic] = Number(u.value)
    const watts = (n: any) => values[n.topic]
    for (const n of nodes) if (n.topic) expect(Number.isFinite(watts(n)), n.topic).toBe(true)
    const into = nodes.filter((n: any) => n.role === "source").reduce((sum: number, n: any) => sum + watts(n), 0)
    const out = watts(nodes.find((n: any) => n.role === "sink")) + watts(battery)
    expect(Math.abs(into - out), `daylight ${daylight}: ${into} W in, ${out} W out`).toBeLessThanOrEqual(Math.max(5, into * 0.05))
  }
})

test("Energie draws a Flow at first and a Sankey once switched - only inside the diagram's box", async ({ page }, testInfo) => {
  const project = (await built()) as any
  const index = project.screens.findIndex((s: any) => s.name === "Energie")
  const looks = project.screens[index].objects.find((o: any) => o.type === "switcher")
  // The demo van's numbers at half daylight, so both looks have flows to draw.
  const pekaway = fakePekaway()
  const logic = createBridgeLogic()
  pekaway.tick(2, 0.5)
  const values: Record<string, string> = {}
  for (const [topic, value] of pekaway.energy()) values[topic] = value
  for (const u of logic.flatten("batt", pekaway.answer("batt"), {})) values[u.topic] = String(u.value)

  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 90_000 })
  const render = async (view: string) => {
    const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), {
      project,
      screenIndex: index,
      topicOverrides: { ...values, "local/energie/view": view },
    })
    const png = Buffer.from(dataUrl.split(",")[1], "base64")
    fs.writeFileSync(testInfo.outputPath(`energie-${view}.png`), png)
    return Jimp.read(png)
  }
  const flow = await render("flow")
  const sankey = await render("sankey")
  let inside = 0
  let outside = 0
  for (let y = 0; y < flow.bitmap.height; y++) {
    for (let x = 0; x < flow.bitmap.width; x++) {
      const i = (y * flow.bitmap.width + x) * 4
      if (flow.bitmap.data[i] === sankey.bitmap.data[i] && flow.bitmap.data[i + 1] === sankey.bitmap.data[i + 1] && flow.bitmap.data[i + 2] === sankey.bitmap.data[i + 2]) continue
      const inBox = x >= looks.x && x < looks.x + looks.width && y >= looks.y && y < looks.y + looks.height
      if (inBox) inside++
      // The switch beside the title shows which look is on: it changes too.
      else if (!(y < looks.y)) outside++
    }
  }
  expect(inside, "the two looks differ inside the diagram").toBeGreaterThan(2000)
  expect(outside, "and nowhere below the switch row outside it").toBe(0)
})

test("written into a project store, «Camper» reads back as built", async ({}, testInfo) => {
  const project = await built()
  const dir = process.env.DEMO_SEED_DIR || testInfo.outputPath("store")
  fs.rmSync(path.join(dir, "projects", "Camper"), { recursive: true, force: true })
  const store = createProjectStore(dir)
  await store.create("Camper", project as any)
  const back = await store.readNewest("Camper")
  expect(back.name).toBe("Camper")
  expect(JSON.parse(JSON.stringify(back.project))).toEqual(JSON.parse(JSON.stringify({ ...project, name: "Camper" })))
})
