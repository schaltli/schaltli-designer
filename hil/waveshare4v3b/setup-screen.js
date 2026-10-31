// Proves the AP setup screen of the RGB boards (the 4.3B, the 4"): a QR code a phone can scan, text that
// fits beside or below it, and a countdown that only ever changes its own line.
//
// Why this is a test and not a note (2026-09-15): the board had no QR code at
// all. It inherited IDisplay's text-only default, because the only generator
// anyone had looked for was LVGL's and this build has none - while the
// Arduino core had ESP-IDF's esp_qrcode linked in all along. The PaperS3 had
// the same gap until the day before. Nothing automated could have noticed:
// setup screens have no designer counterpart, so conformance never renders
// one, and in setup mode the test interface is stopped.
//
// GET /api/debug?set=setupscreen=<seconds left> draws the real screen, the
// one WiFiSetupServer draws in setup mode, into the canvas without bringing
// the AP up, and holds it there until ?set=aspect=0. This asserts:
//
//   1. the snapshot holds a QR code that decodes to the AP's WIFI: URI
//   2. nothing is drawn into the panel's outer edge - the text column is
//      sized to its longest line, and a line too wide for it would run off
//      the right-hand side and silently lose the end of the SSID
//   3. a countdown redraw changes one line's worth of rows, to the right of
//      the code, and nothing else
//
// It cannot see the glass or press "tap to cancel": setup mode stops this
// server, so both stay a manual check.
//
// Run: node hil/waveshare4v3b/setup-screen.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")
const jsQR = require("jsqr")

const { loadDdf } = require("../conformance/ddf")

// The AP a board opens is named after its device id (WiFiSetupServer), so
// the expected code follows the board under test - the 4.3B, or since
// 2026-10-30 the 4" on the same firmware.
const expectedQr = (deviceId) => `WIFI:S:${deviceId}-setup;T:WPA;P:schaltli12345;;`
// The outer band that must stay black. Below the adapter's 32px margin, so a
// line that ends exactly at the margin still passes.
const EDGE_PX = 16
// Taller than any line the adapter's fonts give (fur35 is about 55px with its
// spacing), shorter than two of the smallest.
const ONE_LINE_PX = 60

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
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

async function drawAndSnapshot(base, secondsLeft) {
  const drawn = await request("GET", `${base}/api/debug?set=setupscreen=${secondsLeft}`)
  if (!drawn.body.toString("utf8").includes("setup screen drawn")) {
    throw new Error(`the firmware does not know ?set=setupscreen - flash a build from 2026-09-15 or later:\n${drawn.body}`)
  }
  const snapshot = await request("GET", `${base}/snapshot.bmp`)
  if (snapshot.status !== 200) throw new Error(`GET /snapshot.bmp returned ${snapshot.status}`)
  return bmpToRgba(snapshot.body)
}

function lit(img, x, y) {
  const d = (y * img.width + x) * 4
  return img.rgba[d] | img.rgba[d + 1] | img.rgba[d + 2]
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
    console.warn(`SKIPPED - 4.3B test interface not reachable at ${base}/api/debug (${e.message}); set HIL_WAVESHARE_4V3B_DEVICE to override`)
    process.exit(2)
  }

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  // Before the screen is drawn: the description comes over the broker, and
  // a board holding its setup screen was seen not to send it in time.
  const want = expectedQr((await loadDdf(device)).deviceId)

  // A pattern drawn on a panel that has gone dark must light it: while one
  // is up the board reads no touch, so nothing else could (the 4"'s
  // measuring square came up black, 2026-10-31). Waited for when the board
  // blanks soon enough to wait for; the debug page says when.
  const debugText = async () => (await request("GET", `${base}/api/debug`)).body.toString("utf8")
  const blankAfter = Number((/blanking after (\d+) s/.exec(await debugText()) || [])[1] || 0)
  const waitForDark = blankAfter > 0 && blankAfter <= 30

  try {
    if (waitForDark) await new Promise((r) => setTimeout(r, (blankAfter + 3) * 1000))
    const wasDark = /display off/.test(await debugText())
    const first = await drawAndSnapshot(base, 119)
    const { width, height } = first
    if (wasDark) check(/display on/.test(await debugText()), "0. drawn on a dark panel, the setup screen turned the backlight on")
    else console.log(`  (0. not checked: the panel did not go dark${waitForDark ? "" : `, blanking after ${blankAfter} s`})`)

    const code = jsQR(first.rgba, width, height)
    check(code !== null, "1a. the snapshot holds a QR code")
    if (code) check(code.data === want, `1b. it decodes to ${want} (got ${code.data})`)

    let edgeLit = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if ((x < EDGE_PX || x >= width - EDGE_PX || y < EDGE_PX || y >= height - EDGE_PX) && lit(first, x, y)) edgeLit++
    check(edgeLit === 0, `2. nothing is drawn within ${EDGE_PX}px of the panel's edge (${edgeLit} pixels were)`)

    const later = await drawAndSnapshot(base, 5)
    let minX = width, minY = height, maxY = -1, changed = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const d = (y * width + x) * 4
        if (first.rgba[d] !== later.rgba[d] || first.rgba[d + 1] !== later.rgba[d + 1] || first.rgba[d + 2] !== later.rgba[d + 2]) {
          changed++
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    check(changed > 0, `3a. the countdown redraw changed something (${changed} pixels)`)
    if (changed > 0) {
      const rows = maxY - minY + 1
      check(rows <= ONE_LINE_PX, `3b. it changed one line's worth of rows (${rows}, rows ${minY}-${maxY})`)
      if (code) {
        // Right of the code where the text stands beside it (the 4.3B), below
        // it where the panel is too narrow for that and the text goes under
        // it (the 4").
        const qrRight = Math.max(code.location.topRightCorner.x, code.location.bottomRightCorner.x)
        const qrBottom = Math.max(code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y)
        check(minX > qrRight || minY > qrBottom,
          `3c. all of it beside or below the QR code (first change x=${minX} y=${minY}, code ends x=${Math.round(qrRight)} y=${Math.round(qrBottom)})`)
      }
    }

    // The way into setup: the countdown a held finger sees. Its second line
    // ran off both sides of the 4"'s 480 (2026-10-31), seen only by hand.
    const held = await request("GET", `${base}/api/debug?set=holdcountdown=3`)
    if (!held.body.toString("utf8").includes("hold countdown drawn")) {
      check(false, "4. the firmware draws the hold countdown on request (?set=holdcountdown, from 2026-10-31)")
    } else {
      const shot = await request("GET", `${base}/snapshot.bmp`)
      const hold = bmpToRgba(shot.body)
      let holdEdge = 0, holdLit = 0
      for (let y = 0; y < hold.height; y++)
        for (let x = 0; x < hold.width; x++) {
          if (!lit(hold, x, y)) continue
          holdLit++
          if (x < EDGE_PX || x >= hold.width - EDGE_PX || y < EDGE_PX || y >= hold.height - EDGE_PX) holdEdge++
        }
      check(holdLit > 0 && holdEdge === 0,
        `4. the setup hold's countdown fits the panel (${holdLit} pixels drawn, ${holdEdge} within ${EDGE_PX}px of the edge)`)
    }
  } finally {
    const restore = await request("GET", `${base}/api/debug?set=aspect=0`)
    if (restore.status !== 200) console.warn(`could not put the project back: ?set=aspect=0 returned ${restore.status}`)
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
