// Panel memory bandwidth check for the Waveshare ESP32-S3-Touch-LCD-4.3B.
//
// Why this is a permanent test and not a one-off script (2026-09-01):
// swiping was built on this board, measured, and dropped with the reason
// "the memory bus is full at 43ms a frame". That reason was wrong. The
// factory LVGL demo was flashed back and slid roughly 80% of the screen
// smoothly, which proved the bus was not full - and re-measuring found the
// real floor at 25ms, less than half of what had been recorded. A number
// nobody re-checks becomes folklore, and this one had already been written
// into a commit message and a source header as settled fact.
//
// So the firmware carries the benchmark permanently, behind
// GET /api/debug?set=bench=1, and this asserts the numbers it returns.
//
// What the numbers mean, and why the thresholds sit where they do:
//
//   fb_memset      writing the framebuffer and nothing else. The panel's own
//                  scan-out is reading that memory continuously the whole
//                  time, so this is the real ceiling for anything that puts
//                  a full frame on the glass. ~25ms.
//   fb_from_sram   internal SRAM -> framebuffer: what an LVGL flush costs,
//                  and what the factory demo is doing when it slides
//                  smoothly. Also ~25ms, i.e. 39fps. THIS is the number that
//                  proves the hardware can do it.
//   fb_from_psram  a cached, pre-rendered screen -> framebuffer. ~66ms,
//                  because it both reads and writes 750KB of PSRAM.
//   compose        one real swipe frame, two sources at an offset. ~66ms,
//                  15fps, which is why there is no finger-tracking swipe.
//   cache line     32 bytes today. Waveshare's own ESP-IDF demo builds with
//                  CONFIG_ESP32S3_DATA_CACHE_LINE_64B, which the Arduino
//                  framework does not expose. If a framework update ever
//                  flips this to 64, the read half gets substantially
//                  cheaper and the swipe decision is worth reopening - so
//                  this prints loudly rather than silently passing.
//
// Thresholds are deliberately loose. This is not a benchmark chasing a
// record; it exists to catch a change of KIND - a framework or driver update
// that halves the bandwidth, or one that doubles it. Normal run-to-run
// scatter on this board is well under 10%.
//
// Run: node hil/waveshare4v3b/panel-bandwidth.js --device <ip>
// Skips loudly, never silently, when the device is not reachable.

const http = require("http")

// What a framebuffer write costs depends on how many framebuffers there
// are, which is not obvious and was found the hard way (2026-09-10): the
// board went tear-free by allocating three, and this test failed the same
// day because fb_memset had gone from 25.5ms to 43.9ms.
//
// Measured on the same board within the hour, changing nothing else:
//
//   1 framebuffer    fb_memset 25.5 ms   30.1 MB/s   compose 65.3 ms
//   2 framebuffers   fb_memset 43.3 ms   17.7 MB/s   compose 68.7 ms
//   3 framebuffers   fb_memset 43.9 ms   17.5 MB/s   compose 68.4 ms
//
// So the framebuffer is not special memory after all - it was believed to
// be for a week, because with exactly one of them the driver gives it a
// speed no other PSRAM buffer gets, and that vanishes at two. 17.7 MB/s is
// what every buffer on this board writes at.
//
// Tear-free therefore costs 40% of the framebuffer write bandwidth and 3ms
// on a composed frame, because the paths that matter are dominated by
// reading the canvas rather than writing the panel. That trade was made
// deliberately; this records its price rather than hiding it in a raised
// threshold.
const SINGLE_BUFFER_LIMITS = {
  // name          max ms   what a breach would mean
  fb_memset: 40, //          the panel write path itself got slower
  fb_from_sram: 40, //       the flush path LVGL uses got slower
  fb_from_psram: 95, //      cached-screen presentation got slower
  compose: 95, //            a swipe frame got slower
}

const MULTI_BUFFER_LIMITS = {
  fb_memset: 55,
  fb_from_sram: 55,
  fb_from_psram: 95,
  compose: 95,
}

// Under this, the hardware would no longer be able to present a full frame at
// all and everything above is moot. Above it, something got much FASTER and
// the swipe question deserves another look.
const FASTER_THAN_EXPECTED_MS = 18

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

function get(url, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, body }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`timed out after ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

// Lines look like "  fb_memset      25.3 ms  30.4 MB/s".
function parseReport(text) {
  const out = { timings: {}, cacheLine: null }
  for (const line of text.split("\n")) {
    const t = line.match(/^\s{2}(\w+)\s+([\d.]+) ms/)
    if (t) out.timings[t[1]] = parseFloat(t[2])
    const c = line.match(/^\s{2}cache line\s+(\d+) bytes/)
    if (c) out.cacheLine = parseInt(c[1], 10)
  }
  return out
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  let reachable = false
  try {
    const probe = await get(`${base}/api/debug`, 4000)
    reachable = probe.status === 200
  } catch {
    reachable = false
  }
  if (!reachable) {
    console.warn(
      `SKIPPED - 4.3B not reachable at ${base}/api/debug ` +
        `(set HIL_WAVESHARE_4V3B_DEVICE to override)`
    )
    // Skipping is not failing: hardware-dependent suites are expected to be
    // absent, but they say so out loud. See hil/README.md.
    process.exit(0)
  }

  console.log(`Running panel benchmark on ${device} ...`)
  const res = await get(`${base}/api/debug?set=bench=1`)
  if (res.status !== 200) {
    console.error(`FAIL - /api/debug returned ${res.status}`)
    process.exit(1)
  }
  console.log(res.body.trim())

  const { timings, cacheLine } = parseReport(res.body)
  const failures = []

  // The panel line of the same response says how many framebuffers there
  // are, so the expectation follows the configuration instead of being
  // loosened for everyone.
  const buffers = Number((/(\d+) framebuffer/.exec(res.body) || [])[1] || 1)
  const LIMITS = buffers > 1 ? MULTI_BUFFER_LIMITS : SINGLE_BUFFER_LIMITS
  console.log(`  ${buffers} framebuffer(s), judged against the ${buffers > 1 ? "multi" : "single"}-buffer expectation`)

  for (const [name, maxMs] of Object.entries(LIMITS)) {
    const value = timings[name]
    if (value === undefined) {
      failures.push(`${name} missing from the report - did the endpoint change?`)
      continue
    }
    if (value > maxMs) {
      failures.push(`${name} ${value}ms exceeds ${maxMs}ms`)
    }
    if (value < FASTER_THAN_EXPECTED_MS) {
      failures.push(
        `${name} ${value}ms is far below the ${FASTER_THAN_EXPECTED_MS}ms this ` +
          `board has ever managed - either the measurement broke or the ` +
          `platform got much faster. Both are worth looking at before this ` +
          `test is loosened.`
      )
    }
  }

  if (cacheLine === null) {
    failures.push("cache line missing from the report")
  } else if (cacheLine !== 32) {
    // Not a failure - a prompt. 64-byte lines are what Waveshare's own IDF
    // demo builds with, and getting them would make the read half of a swipe
    // frame substantially cheaper.
    console.log(
      `\nNOTE: data cache line is now ${cacheLine} bytes, not the 32 this ` +
        `board has had. If it is 64, re-run the swipe question - see the ` +
        `header of src/boards/waveshare4v3b/main.cpp in the firmware repo.`
    )
  }

  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} problem(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }

  const swipeFps = timings.compose ? (1000 / timings.compose).toFixed(1) : "?"
  console.log(
    `\nPASS - full-frame floor ${timings.fb_memset}ms, ` +
      `a swipe frame ${timings.compose}ms (${swipeFps} fps)`
  )
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
