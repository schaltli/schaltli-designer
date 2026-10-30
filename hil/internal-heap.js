// Holds a board's internal RAM up under test-interface traffic: no leak,
// and room left for WiFi and lwIP.
//
// Why (2026-10-14): the knob lost its network in test:all after a few
// suites - pingable, HTTP silent, MQTT down - until a hard reset. Over USB
// (hil-diag) its internal heap had a minimum of 684 bytes: WiFi and lwIP
// keep their buffers in internal RAM and had no room left. Not a leak: each
// suite installs a project and restarts the board, and with a large project
// (the smoke test's, the energy diagram's) and HIL traffic the knob had
// only ~20 KB to spare, because 106 KB of its ~320 KB sat in static arrays
// (miniz's unzip buffers, LVGL's pool) - moved to PSRAM the same day.
//
// Two checks, on whatever project the board runs:
//  - no leak: a round of snapshots and debug requests, then a second; the
//    free internal heap after the second is not lower than after the first
//    (the first round's one-time allocations stay out of it);
//  - room: the low-water mark since boot (minFreeInternalHeap, reported by
//    the knob's firmware since 2026-10-14) stays above MIN_FREE - also
//    through an install the board refuses: a large project for another
//    device, read and turned down without the restart that would reset the
//    mark. Until 2026-10-14 reading a project's deviceId parsed all of its
//    project.json, and a 30-page project took ~114 KB of internal RAM for a
//    moment, on every install, leaving 1 KB (the restart after hid it).
//    A board whose /api/debug does not report the mark is checked for the
//    leak only.
//  - room under a large project of its own (--own-device-id, the 4.3B):
//    the same screens installed for the board itself, and the mark after
//    it has run on them a while. In the van the 4.3B had 25-31 KB left
//    under such a project, every allocation under 4 KB in internal RAM
//    with 1.6 MB of PSRAM free; a chart over an energy diagram took the
//    rest and an fopen aborted the board (2026-10-30). Its firmware now
//    sends allocations from 256 bytes up to PSRAM.
//
// The 4.3B reports both numbers in its plain-text /api/debug:
// "heap 130 KB (lowest 125 KB, largest block 63 KB)".
//
// Run: node hil/internal-heap.js --device <ip> [--own-device-id <id>]
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")
const fs = require("fs")
const path = require("path")
const JSZip = require("jszip")

// A project of this many copies of the smoke test's screens, for another
// device: some 200 KB of project.json, as 30 pages of seven controls.
const REFUSED_COPIES = 40

const SNAPSHOTS_PER_ROUND = 15
const DEBUG_PER_ROUND = 100
// Jitter of one round's buffers still held by lwIP when it is read.
const LEAK_TOLERANCE = 2048
// What WiFi and lwIP may want at once under this traffic, with room over.
const MIN_FREE = 32 * 1024

function parseArgs(argv) {
  const args = { device: null, ownDeviceId: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--own-device-id") args.ownDeviceId = argv[++i]
  }
  if (!args.device) {
    console.error("usage: node hil/internal-heap.js --device <ip>")
    process.exit(1)
  }
  return args
}

function get(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, agent: false }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`no answer within ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

async function debug(base) {
  const r = await get(`${base}/api/debug`, 5000)
  if (r.status !== 200) throw new Error(`/api/debug answered ${r.status}`)
  const text = r.body.toString()
  try {
    return JSON.parse(text)
  } catch {
    // The 4.3B answers in plain text, its heap in KB; the PaperS3's says nothing of it.
    const m = text.match(/heap (\d+) KB \(lowest (\d+) KB/)
    return m ? { freeInternalHeap: Number(m[1]) * 1024, minFreeInternalHeap: Number(m[2]) * 1024 } : {}
  }
}

async function round(base) {
  for (let i = 0; i < SNAPSHOTS_PER_ROUND; i++) {
    const r = await get(`${base}/snapshot.bmp`)
    if (r.status !== 200) throw new Error(`/snapshot.bmp answered ${r.status}`)
  }
  for (let i = 0; i < DEBUG_PER_ROUND; i++) await debug(base)
  // Let lwIP let go of the last connections before reading.
  await new Promise((r) => setTimeout(r, 3000))
  return debug(base)
}

// The smoke test's project, its screens repeated, for another device or for this one.
async function largeProject(deviceId = "not-this-device") {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "waveshare", "fixtures", "smoke-test.zip")))
  const project = JSON.parse(await zip.file("project.json").async("string"))
  const screens = []
  for (let i = 0; i < REFUSED_COPIES; i++) {
    for (const s of project.screens) screens.push({ ...JSON.parse(JSON.stringify(s)), id: `${s.id}-c${i}` })
  }
  project.screens = screens
  project.deviceId = deviceId
  zip.file("project.json", JSON.stringify(project))
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

async function refusedInstall(base) {
  const form = new FormData()
  form.append("file", new Blob([await largeProject()]), "foreign.zip")
  const res = await fetch(`${base}/api/project`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) })
  const answer = await res.text()
  if (res.ok) throw new Error(`a project for another device was installed: ${answer.slice(0, 120)}`)
  return answer
}

// The large project installed for the board itself; it restarts onto it.
async function ownInstall(base, deviceId) {
  const form = new FormData()
  form.append("file", new Blob([await largeProject(deviceId)]), "large.zip")
  const res = await fetch(`${base}/api/project`, { method: "POST", body: form, signal: AbortSignal.timeout(120000) })
  const answer = await res.text()
  if (!res.ok) throw new Error(`the large project of its own was refused: ${res.status} ${answer.slice(0, 120)}`)
  await new Promise((r) => setTimeout(r, 8000))
  const deadline = Date.now() + 90000
  for (;;) {
    try {
      const d = await debug(base)
      if (typeof d.freeInternalHeap === "number") break
    } catch {}
    if (Date.now() > deadline) throw new Error("the board never came back after installing the large project")
    await new Promise((r) => setTimeout(r, 2000))
  }
  // Running on it a while: its topics subscribed, its first screens drawn.
  await new Promise((r) => setTimeout(r, 20000))
}

async function main() {
  const { device, ownDeviceId } = parseArgs(process.argv)
  const base = `http://${device}`
  let before
  try {
    before = await debug(base)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }
  if (typeof before.freeInternalHeap !== "number") {
    console.warn(`SKIPPED - ${device} does not report freeInternalHeap in a JSON /api/debug (only the knob does)`)
    process.exit(2)
  }
  const first = await round(base)
  const second = await round(base)
  let afterRefused = second
  if (typeof second.minFreeInternalHeap === "number") {
    const answer = await refusedInstall(base)
    afterRefused = await debug(base)
    console.log(`  a large project for another device refused (${answer.slice(0, 80)}); minimum since boot now ${afterRefused.minFreeInternalHeap}`)
  }
  let afterOwn = null
  if (ownDeviceId) {
    await ownInstall(base, ownDeviceId)
    await round(base)
    afterOwn = await debug(base)
    console.log(`  a large project of its own installed and run; free ${afterOwn.freeInternalHeap}, minimum since boot ${afterOwn.minFreeInternalHeap}`)
  }
  const fails = []
  const leak = first.freeInternalHeap - second.freeInternalHeap
  console.log(
    `  internal heap free: ${before.freeInternalHeap} before, ${first.freeInternalHeap} after round 1, ${second.freeInternalHeap} after round 2` +
      (typeof second.minFreeInternalHeap === "number" ? `; minimum since boot ${second.minFreeInternalHeap}` : ""),
  )
  if (leak > LEAK_TOLERANCE) fails.push(`round 2 left ${leak} bytes less free than round 1 (tolerance ${LEAK_TOLERANCE})`)
  if (typeof afterRefused.minFreeInternalHeap === "number" && afterRefused.minFreeInternalHeap < MIN_FREE)
    fails.push(`the minimum since boot is ${afterRefused.minFreeInternalHeap} bytes, under ${MIN_FREE}`)
  if (afterOwn && !(afterOwn.minFreeInternalHeap >= MIN_FREE))
    fails.push(`under a large project of its own the minimum since boot is ${afterOwn.minFreeInternalHeap} bytes, under ${MIN_FREE}`)
  if (fails.length) {
    console.log(`FAIL - ${device}: ${fails.join("; ")}`)
    process.exit(1)
  }
  console.log(
    `PASS - ${device}: no leak over ${SNAPSHOTS_PER_ROUND} snapshots and ${DEBUG_PER_ROUND} debug requests` +
      (typeof afterRefused.minFreeInternalHeap === "number" ? `, a large refused install, minimum ${afterRefused.minFreeInternalHeap} bytes free` : "") +
      (afterOwn ? `, a large project of its own, minimum ${afterOwn.minFreeInternalHeap} bytes free` : ""),
  )
}

main().catch((e) => {
  console.log(`FAIL - ${e.message}`)
  process.exit(1)
})
