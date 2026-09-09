// Proves the arc rasterizer's exact short cut on the device.
//
// Why this is a test and not a note (2026-09-02): pixelBands() supersamples
// every pixel sixteen times, which on one 360px ring was 185ms of a 312ms
// screen render. Only about 8% of those pixels straddle an edge - the rest
// lie wholly inside one band, where all sixteen samples agree by
// construction. The firmware now detects exactly that case and answers
// without sampling, and the arc dropped from 269ms to 124ms with the
// rendered screen byte-for-byte unchanged.
//
// "Exact by derivation" is a claim about a bound on how much a cross product
// can vary across one pixel. The firmware carries a self-test that runs both
// paths over every pixel of fifteen geometries chosen for the branches they
// reach - a sweep past half a turn, where inSector switches from
// intersecting two half-planes to unioning them; a marker making three
// sectors instead of two; a ring too thin to have a uniform interior; the
// degenerate full circle - and compares all three band counts. None of those
// is exercised by whichever project happens to be installed, which is the
// whole reason it exists.
//
// This asserts that self-test passes. It needs no fixture, no broker and no
// designer: the rasterizer is compared against itself.
//
// Run: node hil/waveshare4v3b/arc-selftest.js --device <ip>
// Skips loudly, never silently, when the device is not reachable.

const http = require("http")

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

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  let reachable = false
  try {
    reachable = (await get(`${base}/api/debug`, 4000)).status === 200
  } catch {
    reachable = false
  }
  if (!reachable) {
    console.warn(
      `SKIPPED - 4.3B not reachable at ${base}/api/debug (set HIL_WAVESHARE_4V3B_DEVICE to override)`
    )
    process.exit(0)
  }

  const res = await get(`${base}/api/debug?set=arcselftest=1`)
  if (res.status !== 200) {
    console.error(`FAIL - /api/debug returned ${res.status}`)
    process.exit(1)
  }
  console.log(res.body.trim())

  // The firmware states its own verdict; this only refuses to accept a
  // missing one. A run that never reached the summary line is a failure, not
  // a pass - that is the difference between asserting and hoping.
  const summary = res.body.match(/(\d+) geometries, (\d+) pixels compared, (\d+) mismatches/)
  if (!summary) {
    console.error("\nFAIL - no self-test summary in the reply; did the endpoint change?")
    process.exit(1)
  }
  const [, geometries, pixels, mismatches] = summary.map(Number)
  if (mismatches > 0) {
    console.error(`\nFAIL - ${mismatches} pixels disagree between the short cut and the sampling`)
    process.exit(1)
  }
  if (!res.body.includes("PASS -")) {
    console.error("\nFAIL - the firmware did not report a pass")
    process.exit(1)
  }
  // A self-test that silently stopped covering anything would otherwise pass
  // forever. These are floors, not the current values.
  if (geometries < 10 || pixels < 20000) {
    console.error(
      `\nFAIL - coverage collapsed to ${geometries} geometries / ${pixels} pixels; ` +
        `the cases were meant to be at least 10 and 20000`
    )
    process.exit(1)
  }

  console.log(`\nPASS - ${geometries} geometries, ${pixels} pixels, no disagreement`)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
