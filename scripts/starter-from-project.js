#!/usr/bin/env node
// A starter from a project file (tasks/starter-project-plan.md, decision 1):
// the project built on camera, downloaded, made neutral and kept under
// lib/starters/. What a new project takes from its device - the device's
// description, fonts, size, buttons and the device fields of its settings -
// is left out: lib/starters.ts adds the starter to a project made for the
// device chosen, as the New Project dialog makes one.
//
//   node scripts/starter-from-project.js <project.json> lib/starters/vanpi-4.json
//
// Neutral: a camera's address is the only value of one van (decision 2), it
// becomes empty, so the Camera shows its stand-in until one is typed in;
// topics no object reads are dropped.
const fs = require("fs")

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("usage: node scripts/starter-from-project.js <project.json> <starter.json>")
  process.exit(1)
}
const raw = JSON.parse(fs.readFileSync(input, "utf8"))
const project = raw.project ?? raw

// The device's own, filled in from its description when a project is made.
const DEVICE_SETTINGS = [
  "colorDepth", "deviceId", "deviceName", "devicePlatform", "supportedObjectTypes", "deviceActions",
  "supportedFeatures", "ddfHash", "supportsSoftwareButtons", "needsPageIconsInSize", "pixelsPerMm",
  "typographies", "screenShape", "screenMotion", "popupCloseRadius", "boundInstanceId",
]
const settings = Object.fromEntries(Object.entries(project.settings ?? {}).filter(([k]) => !DEVICE_SETTINGS.includes(k)))

const walk = (o, f) => {
  f(o)
  for (const c of o.children ?? []) walk(c, f)
}
const screens = JSON.parse(JSON.stringify(project.screens))
for (const screen of screens) for (const o of screen.objects ?? []) walk(o, (obj) => {
  if (obj.type === "camera" && obj.properties) obj.properties.url = ""
})
const text = JSON.stringify(screens)
const topics = (project.topics ?? []).filter((t) => text.includes(`"${t.topic}`) || text.includes(`:${t.topic}`) || text.includes(`${t.topic}"`))

const starter = {
  starterOf: project.settings?.deviceId,
  screens,
  topics,
  ...(project.combinedTopics?.length ? { combinedTopics: project.combinedTopics } : {}),
  assets: project.assets ?? [],
  nextId: project.nextId,
  snapGuides: project.snapGuides ?? [],
  settings,
}
fs.writeFileSync(output, JSON.stringify(starter, null, 1) + "\n")
console.log(`${output}: ${screens.length} screens, ${topics.length} topics, ${starter.assets.length} assets, ${fs.statSync(output).size} bytes`)
