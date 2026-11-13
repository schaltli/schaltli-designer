#!/usr/bin/env node
// npm run template:pull - a shipped template (templates/) from its golden copy,
// the project it is built in on a designer (2026-11-13). The same conversion
// as File > Save as Template (lib/templates.ts templateFromProject), then made
// neutral for every installation: a camera's address emptied. Refused, with
// nothing written, when the result still names something of one van - a
// topic outside schaltli/, a LAN address or a URL - or is for another device
// than the template it replaces.
//
//   npm run template:pull
//   npm run template:pull -- --designer http://192.168.8.107:3000 --project "VanPi-Starter (Fertig)" --out templates/vanpi-4.json
//
// Defaults: the van's designer, «VanPi-Starter (Fertig)», templates/vanpi-4.json.
// The template keeps the name it has in --out; --name gives another.
// Afterwards: look at the diff, run e2e/templates.spec.ts, commit.
import fs from "node:fs"
import path from "node:path"
import { templateFromProject } from "../lib/templates.ts"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const designer = opt("designer", process.env.SCHALTLI_GOLDEN_DESIGNER || "http://192.168.8.107:3000").replace(/\/$/, "")
const projectName = opt("project", "VanPi-Starter (Fertig)")
const out = path.resolve(opt("out", "templates/vanpi-4.json"))
const fail = (message) => {
  console.error(`template:pull: ${message}`)
  process.exit(1)
}

const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null
const name = opt("name", before?.name ?? projectName)

let response
try {
  response = await fetch(`${designer}/api/projects/${encodeURIComponent(projectName)}`, { signal: AbortSignal.timeout(120_000) })
} catch (error) {
  fail(`${designer} not reachable (${error.cause?.code ?? error.message})`)
}
if (!response.ok) fail(`${designer} has no project «${projectName}» (${response.status})`)
const project = (await response.json()).project

const template = templateFromProject(name, project)
const walk = (o) => [o, ...(o.children ?? []).flatMap(walk)]
const objects = template.screens.flatMap((s) => (s.objects ?? []).flatMap(walk))
for (const camera of objects.filter((o) => o.type === "camera" && o.properties)) camera.properties.url = ""

// What would make it one van's, not everyone's.
const problems = []
if (!template.deviceId) problems.push("the project has no device")
if (before && before.deviceId !== template.deviceId) problems.push(`it is for ${template.deviceId}, ${path.basename(out)} for ${before.deviceId}`)
const offTopics = template.topics.map((t) => t.topic).filter((t) => !t.startsWith("schaltli/"))
if (offTopics.length) problems.push(`topics outside schaltli/: ${offTopics.join(", ")}`)
const read = objects
  .flatMap((o) => [o.properties?.topic, o.properties?.writeTopic, ...(o.properties?.liveValues ?? []).map((lv) => lv.source?.path)])
  .filter((t) => typeof t === "string" && t.includes("/") && !t.startsWith("schaltli/"))
if (read.length) problems.push(`objects read outside schaltli/: ${[...new Set(read)].join(", ")}`)
const address = JSON.stringify(template).match(/192\.168\.[\d.]+|https?:\/\/(?!www\.w3\.org)[^"\s]+/)
if (address) problems.push(`an address of one van: ${address[0]}`)
if (problems.length) fail(`nothing written:\n  - ${problems.join("\n  - ")}`)

fs.writeFileSync(out, JSON.stringify(template, null, 1) + "\n")

// What changed, screen by screen.
const byId = (screens) => new Map((screens ?? []).map((s) => [s.id, s]))
const old = byId(before?.screens)
const now = byId(template.screens)
const lines = []
for (const [id, s] of now) {
  if (!old.has(id)) lines.push(`  + ${s.name}`)
  else if (JSON.stringify(old.get(id)) !== JSON.stringify(s)) lines.push(`  ~ ${s.name}`)
}
for (const [id, s] of old) if (!now.has(id)) lines.push(`  - ${s.name}`)
console.log(`${path.relative(process.cwd(), out)}: «${name}» for ${template.deviceId} from «${projectName}» on ${designer}`)
console.log(`${template.screens.length} screens, ${template.topics.length} topics, ${template.assets.length} assets`)
console.log(lines.length ? `changed:\n${lines.join("\n")}` : "no screen changed")
