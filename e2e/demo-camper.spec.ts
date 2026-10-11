import { test, expect } from "@playwright/test"
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
  for (const t of read) expect(published.has(t), `${t} is not published by the demo van`).toBe(true)
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
  for (const [t, v] of writes) expect(logic.command(t, v, state), `${t} = ${v} is not a command the bridge takes`).not.toBeNull()
  // And every one is declared among the project's topics.
  const declared = new Set(project.topics.map((t) => t.topic))
  for (const t of [...read, ...written]) expect(declared.has(t), `${t} is not declared`).toBe(true)
})

test("Licht, Wasser, Energie, two pages to come, and the navigator; the page icons follow the van", async () => {
  const project = await built()
  expect(project.settings.deviceId).toBe("waveshare-touch-lcd-4v3b")
  expect(project.screens.map((s) => s.name)).toEqual(["Master", "Licht", "Wasser", "Energie", "MaxxFan", "Heizung"])
  expect(project.screens[0].objects.map((o) => o.type)).toEqual(["navigator", "switch"])
  // Top right on the master: light or dark.
  const theme = project.screens[0].objects[1] as any
  expect(theme.x + theme.width).toBeGreaterThan(project.screenWidth - 40)
  expect(theme.y).toBeLessThan(40)
  expect(theme.properties).toMatchObject({ topic: "schaltli/state/theme", writeTopic: "schaltli/cmnd/theme" })
  expect(theme.properties.states.map((s: any) => [s.label, s.writeValue])).toEqual([["Hell", "light"], ["Dunkel", "dark"]])
  const types = (i: number) => project.screens[i].objects.map((o) => o.type).filter((t) => t !== "text")
  expect(types(1)).toEqual(["dial", "slider", "switch", "switch", "switch"])
  expect(types(2)).toEqual(["bar", "bar", "switch", "switch"])
  const licht = project.screens[1] as any
  expect(licht.iconLive).toMatchObject({ source: { namespace: "combined", path: "licht_an" }, otherwise: { icon: "icon-bulb-off" } })
  expect(project.combinedTopics[0]).toMatchObject({ name: "licht_an", mode: "any" })
  expect(project.combinedTopics[0].conditions).toHaveLength(5)
  // Wasser: a drop, with an exclamation mark while grey > 80 % or fresh < 20 %.
  const wasser = project.screens[2] as any
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
  for (const i of [4, 5]) expect(JSON.stringify(project.screens[i].objects)).toContain("Coming soon")
  const [pump, drain] = project.screens[2].objects.filter((o) => o.type === "switch") as any[]
  expect(pump.properties.topic).toBe("schaltli/state/relay/4/power")
  expect(pump.properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "An"])
  expect(drain.properties.topic).toBe("schaltli/state/relay/3/power")
  expect(drain.properties.states.map((s: { label: string }) => s.label)).toEqual(["Zu", "Offen"])
})

// Energie (2026-10-11): the sun, the mains and the engine into the battery,
// the battery to what draws. The battery is Pekaway's through the bridge, the
// rest as the author's van has it (vanpi-custom), so the page goes into his
// project as it is.
test("Energie: three sources and what draws round the battery, an arrow only while watts flow, the battery's numbers", async () => {
  const project = await built()
  const energie = project.screens[3] as any
  expect(energie.name).toBe("Energie")
  const read = new Set<string>()
  walk(energie, (key, v) => {
    if ((key === "topic" || key === "path") && typeof v === "string") read.add(v)
  })
  expect([...read].sort()).toEqual([
    "ble/charger/watts#value",
    "ble/orion/watts#value",
    "schaltli/state/battery/current",
    "schaltli/state/battery/power",
    "schaltli/state/battery/soc",
    "schaltli/state/battery/voltage",
    "van/energy/consumers_watts",
    "van/energy/solar_watts",
  ])
  // The chargers' topics are declared as JSON with their field "value".
  const charger = project.topics.find((t: any) => t.topic === "ble/charger/watts") as any
  expect(charger).toMatchObject({ type: "json", subtopics: [{ path: "value", type: "numeric" }] })
  // Nothing on it writes: it only shows.
  expect(JSON.stringify(energie)).not.toContain("writeTopic")
  // The page's icon: an empty battery below 20 %.
  expect(energie.iconLive).toMatchObject({ source: { path: "schaltli/state/battery/soc" }, otherwise: { icon: "icon-battery" } })
  expect(energie.iconLive.rules).toEqual([{ op: "<", operand: "20", result: { kind: "icon", icon: "icon-battery-low" } }])

  // The arrows: a live icon each, with no Otherwise, so nothing shows while
  // nothing flows - a source's while it brings watts (not while it says it
  // charges: a charger in float says so and gives nothing), the battery's
  // while it gives.
  const arrows = energie.objects.filter((o: any) => o.properties.liveIconId)
  expect(arrows.map((o: any) => [o.properties.liveValues[0].source.path, o.properties.liveValues[0].rules[0].op, o.properties.liveValues[0].rules[0].operand])).toEqual([
    ["van/energy/solar_watts", ">", "0"],
    ["ble/charger/watts#value", ">", "0"],
    ["ble/orion/watts#value", ">", "0"],
    ["schaltli/state/battery/current", "<", "0"],
  ])
  for (const a of arrows) expect(a.properties.liveValues[0].otherwise).toBeUndefined()
  expect(energie.objects.filter((o: any) => o.type === "gauge")).toHaveLength(1)
  // A line's points are the screen's, not its box's: each path runs inside its own box.
  const lines = energie.objects.filter((o: any) => o.type === "line")
  expect(lines).toHaveLength(4)
  for (const line of lines) {
    for (const p of line.properties.points) {
      expect(p.x).toBeGreaterThanOrEqual(line.x)
      expect(p.x).toBeLessThanOrEqual(line.x + line.width)
      expect(p.y).toBeGreaterThanOrEqual(line.y)
      expect(p.y).toBeLessThanOrEqual(line.y + line.height)
    }
  }
  // Nothing reaches past the screen, or under the light/dark switch top right.
  for (const o of energie.objects) {
    expect(o.x + o.width, o.id).toBeLessThanOrEqual(project.screenWidth)
    expect(o.y + o.height, o.id).toBeLessThanOrEqual(project.screenHeight)
    if (o.x + o.width > project.screenWidth - 196) expect(o.y, o.id).toBeGreaterThanOrEqual(62)
  }

  // Every icon it uses is in the project.
  const assets = new Set(project.assets.map((a: any) => a.id))
  walk(energie, (key, v) => {
    if ((key === "assetId" || key === "icon") && typeof v === "string") expect(assets.has(v), v).toBe(true)
  })

  // The texts, as the designer and the devices resolve them (a JSON field
  // given as its value).
  const texts = energie.objects.filter((o: any) => o.type === "text" && o.properties.liveValues)
  const shown = (values: Record<string, string>) =>
    texts.map((o: any) => {
      const lv = o.properties.liveValues[0]
      const { result } = evaluate(lv, values[lv.source.path])
      return (result as any)?.kind === "text" ? (result as any).parts.map((p: any) => (typeof p === "string" ? p : formatValue(values[lv.source.path], lv.format, DEFAULT_SEPARATORS))).join("") : formatValue(values[lv.source.path], lv.format, DEFAULT_SEPARATORS)
    })
  const S = "schaltli/state/"
  expect(
    shown({
      "van/energy/solar_watts": "0",
      "ble/charger/watts#value": "241",
      "ble/orion/watts#value": "414",
      "van/energy/consumers_watts": "16",
      [`${S}battery/current`]: "49.1",
      [`${S}battery/soc`]: "82",
      [`${S}battery/voltage`]: "13.65",
      [`${S}battery/power`]: "670",
    }),
  ).toEqual(["0 W", "241 W", "414 W", "16 W", "Lädt", "82 %", "13.65 V", "+49.1 A", "+670 W"])
  expect(shown({ [`${S}battery/current`]: "-2.13", [`${S}battery/power`]: "-28" }).slice(4)).toEqual(["Entlädt", "–", "–", "-2.1 A", "-28 W"])
  expect(shown({ [`${S}battery/current`]: "0.00" })[4]).toBe("Ruht")
  expect(shown({})).toEqual(["–", "–", "–", "–", "–", "–", "–", "–", "–"])
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
