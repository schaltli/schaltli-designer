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
//    the knob's firmware since 2026-10-14) stays above MIN_FREE. A board
//    whose /api/debug does not report it is checked for the leak only.
//
// Run: node hil/internal-heap.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

const SNAPSHOTS_PER_ROUND = 15
const DEBUG_PER_ROUND = 100
// Jitter of one round's buffers still held by lwIP when it is read.
const LEAK_TOLERANCE = 2048
// What WiFi and lwIP may want at once under this traffic, with room over.
const MIN_FREE = 32 * 1024

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
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
  try {
    return JSON.parse(r.body.toString())
  } catch {
    // The 4.3B and the PaperS3 answer in plain text: nothing to read here.
    return {}
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

async function main() {
  const { device } = parseArgs(process.argv)
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
  const fails = []
  const leak = first.freeInternalHeap - second.freeInternalHeap
  console.log(
    `  internal heap free: ${before.freeInternalHeap} before, ${first.freeInternalHeap} after round 1, ${second.freeInternalHeap} after round 2` +
      (typeof second.minFreeInternalHeap === "number" ? `; minimum since boot ${second.minFreeInternalHeap}` : ""),
  )
  if (leak > LEAK_TOLERANCE) fails.push(`round 2 left ${leak} bytes less free than round 1 (tolerance ${LEAK_TOLERANCE})`)
  if (typeof second.minFreeInternalHeap === "number" && second.minFreeInternalHeap < MIN_FREE)
    fails.push(`the minimum since boot is ${second.minFreeInternalHeap} bytes, under ${MIN_FREE}`)
  if (fails.length) {
    console.log(`FAIL - ${device}: ${fails.join("; ")}`)
    process.exit(1)
  }
  console.log(
    `PASS - ${device}: no leak over ${SNAPSHOTS_PER_ROUND} snapshots and ${DEBUG_PER_ROUND} debug requests` +
      (typeof second.minFreeInternalHeap === "number" ? `, minimum ${second.minFreeInternalHeap} bytes free` : ""),
  )
}

main().catch((e) => {
  console.log(`FAIL - ${e.message}`)
  process.exit(1)
})
