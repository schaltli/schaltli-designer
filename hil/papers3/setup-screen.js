// Proves the PaperS3's AP setup screen: a QR code a phone can scan, and a
// countdown that does not flash the panel.
//
// Why this is a test and not a note (2026-09-14): the manual check of
// decision 11 found the board had no QR code at all - it inherited the
// text-only fallback every display gets by default - and that the fallback
// painted clean on every call. The setup server redraws once a second for
// its countdown, so setup mode flashed the whole panel black and white every
// second for two minutes. Neither showed anywhere automated: setup screens
// have no designer counterpart, so conformance never renders them, and in
// setup mode the test interface is stopped.
//
// GET /api/debug?set=setupscreen=<seconds left> draws the real screen, the
// one WiFiSetupServer draws in setup mode, into the canvas without bringing
// the AP up. This asserts:
//
//   1. the first paint of the screen is clean
//   2. the next second's redraw is partial - no flash per tick
//   3. the snapshot holds a QR code that decodes to the AP's WIFI: URI
//
// It puts the project back with POST /api/screen afterwards. It cannot see
// the glass or press "tap to cancel": setup mode stops this server, so that
// stays a manual check.
//
// Run: node hil/papers3/setup-screen.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")
const jsQR = require("jsqr")

const EXPECTED_QR = "WIFI:S:m5stack-papers3-setup;T:WPA;P:schaltli12345;;"

function parseArgs(argv) {
  const args = { device: process.env.HIL_PAPERS3_DEVICE || "192.168.1.118" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

function request(method, url, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`${method} ${url} timed out after ${timeoutMs}ms`))
    })
    req.on("error", reject)
    req.end()
  })
}

function lastPaint(body) {
  const m = body.toString("utf8").match(/last paint was (full|partial)/)
  if (!m) throw new Error(`/api/debug did not report the refresh state:\n${body}`)
  return m[1]
}

// The snapshot is an uncompressed BMP of the canvas; jsQR wants RGBA rows,
// top first.
function bmpToRgba(buf) {
  if (buf.toString("ascii", 0, 2) !== "BM") throw new Error("snapshot is not a BMP")
  const offset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const rawHeight = buf.readInt32LE(22)
  const bytesPerPixel = buf.readUInt16LE(28) / 8
  if (bytesPerPixel !== 3 && bytesPerPixel !== 4) throw new Error(`unsupported BMP depth ${bytesPerPixel * 8}`)
  const height = Math.abs(rawHeight)
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcY = rawHeight > 0 ? height - 1 - y : y
    for (let x = 0; x < width; x++) {
      const s = offset + srcY * rowSize + x * bytesPerPixel
      const d = (y * width + x) * 4
      rgba[d] = buf[s + 2]
      rgba[d + 1] = buf[s + 1]
      rgba[d + 2] = buf[s]
      rgba[d + 3] = 255
    }
  }
  return { rgba, width, height }
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  try {
    const probe = await request("GET", `${base}/api/debug`, 4000)
    // A setup server answers everything with a captive-portal redirect.
    if (probe.status === 302) throw new Error("the board is in setup mode right now")
    if (probe.status !== 200) throw new Error(`status ${probe.status}`)
  } catch (e) {
    console.warn(`SKIPPED - PaperS3 test interface not reachable at ${base}/api/debug (${e.message}); set HIL_PAPERS3_DEVICE to override`)
    process.exit(2)
  }

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  try {
    const first = lastPaint((await request("GET", `${base}/api/debug?set=setupscreen=119`)).body)
    check(first === "full", `1. the setup screen's first paint is clean (was ${first})`)
    const next = lastPaint((await request("GET", `${base}/api/debug?set=setupscreen=118`)).body)
    check(next === "partial", `2. the next second's countdown redraw is partial, no flash (was ${next})`)

    const snapshot = await request("GET", `${base}/snapshot.bmp`)
    if (snapshot.status !== 200) throw new Error(`GET /snapshot.bmp returned ${snapshot.status}`)
    const { rgba, width, height } = bmpToRgba(snapshot.body)
    const code = jsQR(rgba, width, height)
    check(code !== null, "3a. the snapshot holds a QR code")
    if (code) check(code.data === EXPECTED_QR, `3b. it decodes to ${EXPECTED_QR} (got ${code.data})`)
  } finally {
    const restore = await request("POST", `${base}/api/screen?index=0`)
    if (restore.status !== 200) console.warn(`could not put the project back: POST /api/screen returned ${restore.status}`)
  }

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - setup screen holds on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
