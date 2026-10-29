#!/usr/bin/env node
// The recorder, run on its own (docs/2026-10-16-charts.md, recorder/README.md):
//
//   node recorder/index.js --broker mqtt://localhost:1883 --file ~/.schaltli/history.json
//
// --tz overrides the system's time zone, --id the name it records under
// (the host's), --tick-ms makes it lay everything that often instead of at
// the end of each step - for tests.

"use strict"

const os = require("os")
const path = require("path")
const { createRecorder } = require("./service")

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

const file = arg("file", path.join(os.homedir(), ".schaltli", "history.json")).replace(/^~(?=$|[/\\])/, os.homedir())
const tickMs = arg("tick-ms")
const recorder = createRecorder({
  broker: arg("broker", "mqtt://localhost:1883"),
  file,
  tz: arg("tz"),
  id: arg("id"),
  tickMs: tickMs !== undefined ? Number(tickMs) : undefined,
  saveMs: arg("save-ms") !== undefined ? Number(arg("save-ms")) : undefined,
})

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await recorder.stop()
  process.exit(0)
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)

recorder.start().catch((err) => {
  console.error(`[recorder] ${err.message}`)
  process.exit(1)
})
