import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { fakePekaway } from "../integrations/vanpi/demo-van"
import { createBridgeLogic } from "../integrations/vanpi/bridge-logic"
import { createProjectStore } from "../lib/project-store"
import { computeCombined } from "../lib/combined-topics"

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
  for (const kind of ["dimmer", "relay", "level"]) {
    const answer = pekaway.answer(kind)
    expect(answer, kind).not.toBeNull()
    for (const u of logic.flatten(kind, answer, {})) topics.add(u.topic)
  }
  // The theme is the bridge's own; the van sets it light at the start.
  topics.add("schaltli/state/theme")
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

test("Licht, Wasser, two pages to come, and the navigator; the page icons follow the van", async () => {
  const project = await built()
  expect(project.settings.deviceId).toBe("waveshare-touch-lcd-4v3b")
  expect(project.screens.map((s) => s.name)).toEqual(["Master", "Licht", "Wasser", "MaxxFan", "Heizung"])
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
  for (const i of [3, 4]) expect(JSON.stringify(project.screens[i].objects)).toContain("Coming soon")
  const [pump, drain] = project.screens[2].objects.filter((o) => o.type === "switch") as any[]
  expect(pump.properties.topic).toBe("schaltli/state/relay/4/power")
  expect(pump.properties.states.map((s: { label: string }) => s.label)).toEqual(["Aus", "An"])
  expect(drain.properties.topic).toBe("schaltli/state/relay/3/power")
  expect(drain.properties.states.map((s: { label: string }) => s.label)).toEqual(["Zu", "Offen"])
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
