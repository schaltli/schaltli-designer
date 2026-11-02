import { test, expect } from "@playwright/test"
import path from "path"
const { loadDdf } = require("../hil/conformance/ddf")
const { buildProject } = require("../hil/conformance/build-project")

// hil/conformance/build-project.js on its own - no broker, no device.
//
// test:quick runs the conformance suite on the 4" and the 4.3B side by side,
// on one broker. Until 2026-11-02 both projects used the same topics
// ("hil-conformance/gauge/level", the button a fixed "hil-conformance/button"),
// so the values one lane published reached the other board while that one was
// asked to show "before any value": «device did not apply published values
// within 30000ms» on whichever board the timing hit, and every such case
// passed on its own. A tap could just as well have been credited with the
// other board's press. Each board's project now names only topics under its
// own prefix, and no two boards share one.

const BOARDS = ["waveshare-touch-lcd-4", "waveshare-touch-lcd-4v3b", "waveshare-knob-1v8"]

// Every topic a project or its taps name: what is bound, what a press sends.
function topicsOf(built: any): Set<string> {
  const found = new Set<string>()
  for (const t of built.project.topics || []) found.add(t.topic)
  for (const taps of Object.values(built.taps || {}) as any[]) for (const tap of taps) found.add(tap.topic)
  for (const m of JSON.stringify(built.project).matchAll(/"hil-conformance\/[^"]*"/g)) found.add(JSON.parse(m[0]))
  return found
}

test("each board's conformance project names topics of its own only", async () => {
  const seen = new Map<string, string>()
  for (const board of BOARDS) {
    const ddf = await loadDdf("192.0.2.1", path.join(__dirname, "..", "public", "ddf", `${board}.ddf.zip`))
    const topics = topicsOf(buildProject(ddf))
    expect(topics.size, `${board} has topics`).toBeGreaterThan(0)
    const prefix = `hil-conformance/${ddf.deviceId}/`.toLowerCase()
    for (const topic of topics) {
      expect(topic.startsWith(prefix), `${board}: ${topic} under ${prefix}`).toBe(true)
      expect(seen.get(topic), `${topic} named by ${board} and by ${seen.get(topic)}`).toBeUndefined()
      seen.set(topic, board)
    }
  }
})
