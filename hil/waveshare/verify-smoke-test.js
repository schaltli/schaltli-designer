#!/usr/bin/env node
// Drives a live Waveshare Knob-1.8 through the ported project stack and
// checks what it actually rendered, over its test interface:
//
//   POST /api/project  -> install fixtures/smoke-test.zip, device reboots
//   GET  /snapshot.bmp -> the rendered framebuffer
//   POST /api/screen   -> force a full render of one screen index
//
// This is the permanent form of the ad-hoc checks used to bring the port up
// on 2026-08-19 (CLAUDE.md: ad-hoc verification becomes a permanent test).
// It is the seed of the real orchestrator, not the finished one - it does
// not yet drive MQTT (so the level indicator has no value and its bar sits
// at minimum) and it does not yet pixel-diff against the designer's own
// headless render the way hil/m5dial/orchestrator.js does. Those are the
// next things to grow here.
//
// Usage:  node hil/waveshare/verify-smoke-test.js <device-ip> [--skip-upload]
//
// Exits non-zero on any failed check, so it can be wired into test-all.js
// once this board is a regular part of the suite.

const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const ip = process.argv[2]
const skipUpload = process.argv.includes("--skip-upload")
if (!ip) {
  console.error("usage: node hil/waveshare/verify-smoke-test.js <device-ip> [--skip-upload]")
  process.exit(2)
}

const FIXTURE = path.join(__dirname, "fixtures", "smoke-test.zip")
const TMP = path.join(__dirname, ".snapshot.bmp")

// Colors below are RGB565 fixed points (see the fixture builder's header),
// so these are exact-match assertions, never tolerances.
const WHITE = "#ffffff"
const BLACK = "#000000"
const BOX_FILL = "#00aaff"
const LEVEL_FILL = "#00fb00"
const BORDER = "#848284"

let failed = 0
function check(name, ok, detail) {
  if (!ok) failed++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
}

function curl(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("curl", args, { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    if (allowFailure) return Buffer.alloc(0)
    throw e
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevice(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  const probe = path.join(__dirname, ".probe.tmp")
  while (Date.now() < deadline) {
    // Exit code rather than -w "%{http_code}" with -o /dev/null: this runs
    // curl directly (not through a shell), so /dev/null is not a portable
    // path on Windows. -f makes curl exit non-zero on an HTTP error too.
    let ok = true
    try {
      execFileSync("curl", ["-s", "-f", "-m", "4", "-o", probe, `http://${ip}/ddf.zip`], { stdio: "ignore" })
    } catch {
      ok = false
    }
    if (ok) {
      fs.rmSync(probe, { force: true })
      return true
    }
    await sleep(2000)
  }
  fs.rmSync(probe, { force: true })
  return false
}

// Retried rather than one-shot: the snapshot is ~380KB over the device's own
// WiFi, and at a weak signal a single fetch has been seen take 8s where it
// normally takes well under one - long enough that a fixed timeout turns
// into a spurious failure. A HIL test that goes red at random is worse than
// no test, because it trains you to ignore it.
function snapshot(attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      curl(["-s", "-f", "-m", "45", "-o", TMP, `http://${ip}/snapshot.bmp`])
      lastError = null
      break
    } catch (e) {
      lastError = e
      console.log(`  (snapshot attempt ${i + 1} failed, retrying)`)
    }
  }
  if (lastError) throw new Error(`snapshot failed after ${attempts} attempts: ${lastError.message}`)

  const buf = fs.readFileSync(TMP)
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error("snapshot is not a BMP")
  const dataOffset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const height = buf.readInt32LE(22)
  const rowBytes = (((width * 3 + 3) / 4) | 0) * 4
  // BMP rows are stored bottom-up.
  const px = (x, y) => {
    const off = dataOffset + (height - 1 - y) * rowBytes + x * 3
    return { b: buf[off], g: buf[off + 1], r: buf[off + 2] }
  }
  const hex = (p) => `#${[p.r, p.g, p.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
  const count = (x0, y0, x1, y1, pred) => {
    let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (pred(px(x, y))) n++
    return n
  }
  return { width, height, px, hex, count }
}

function switchScreen(index) {
  const out = curl(["-s", "-m", "20", "-X", "POST", "-d", `index=${index}`, `http://${ip}/api/screen`]).toString()
  return JSON.parse(out)
}

async function main() {
  if (!skipUpload) {
    console.log(`uploading ${path.basename(FIXTURE)} to ${ip}...`)
    // The device reboots into the installed project rather than rebuilding
    // live render state mid-request, so the HTTP call never gets a reply -
    // a timeout here is the success path, not a failure.
    curl(["-s", "-m", "25", "-F", `file=@${FIXTURE}`, `http://${ip}/api/project`, "-o", "/dev/null"], {
      allowFailure: true,
    })
    if (!(await waitForDevice())) {
      console.error("device did not come back after upload")
      process.exit(1)
    }
  }

  console.log("\n--- screen 0 ---")
  let s = snapshot()
  check("snapshot is 360x360", s.width === 360 && s.height === 360, `${s.width}x${s.height}`)
  check("background white", s.hex(s.px(30, 300)) === WHITE, s.hex(s.px(30, 300)))
  check("box fill", s.hex(s.px(180, 90)) === BOX_FILL, s.hex(s.px(180, 90)))
  check("box border on its top edge", s.hex(s.px(180, 61)) === BLACK, s.hex(s.px(180, 61)))
  // Just outside the box: proves it is where it claims to be, rather than
  // filling something larger that happens to cover the sample point.
  check("left of box is background", s.hex(s.px(95, 90)) === WHITE, s.hex(s.px(95, 90)))

  // Ink counts rather than exact glyph positions - this asserts the BDF text
  // path ran, without going brittle against legitimate font-metric work.
  // Exact glyph placement is what the designer pixel-diff will cover.
  const labelInk = s.count(100, 140, 260, 167, (p) => p.r < 60 && p.g < 60 && p.b < 60)
  check("label text rasterized", labelInk > 120, `${labelInk} ink px`)

  const levelBorder = s.count(90, 220, 270, 250, (p) => s.hex(p) === BORDER)
  const levelFill = s.count(90, 220, 270, 250, (p) => s.hex(p) === LEVEL_FILL)
  check("level indicator border drawn", levelBorder > 200, `${levelBorder} px`)
  // No MQTT in this script yet, so the bar sits at its minimum - presence is
  // what is being asserted, not fullness.
  check("level indicator fill drawn", levelFill > 0, `${levelFill} px`)

  console.log("\n--- screen switching ---")
  const to1 = switchScreen(1)
  check("POST /api/screen index=1 accepted", to1.success === true && to1.screenIndex === 1, JSON.stringify(to1))
  s = snapshot()
  check("screen 1 background black", s.hex(s.px(30, 300)) === BLACK, s.hex(s.px(30, 300)))
  const whiteInk = s.count(110, 165, 250, 192, (p) => p.r > 200 && p.g > 200 && p.b > 200)
  check("screen 1 white text rasterized", whiteInk > 120, `${whiteInk} ink px`)

  const bad = switchScreen(9)
  check("out-of-range index refused", bad.success === false, JSON.stringify(bad))

  // --- device action: showScreenMenu -----------------------------------
  //
  // Dispatched through POST /api/input rather than by faking a swipe: this
  // asserts that the *action bound to* swipe-up resolves and runs. Whether a
  // real finger swipe decodes into that input is a separate question that
  // needs a human, and conflating the two would leave the automatable half
  // untested too.
  console.log("\n--- device action ---")
  const beforeMenu = snapshot()
  const beforePixel = beforeMenu.hex(beforeMenu.px(180, 60))
  const inputRes = JSON.parse(
    curl([
      "-s", "-m", "20", "-X", "POST",
      "-d", "id=swipe-up",
      `http://${ip}/api/input`,
    ]).toString(),
  )
  check("POST /api/input id=swipe-up accepted", inputRes.success === true, JSON.stringify(inputRes))

  // The device acks the dispatch before the frame shows it: /api/input is
  // handled inside webServer_->handleClient(), and the overlay composites
  // itself in the *next* loop() iteration. Snapshotting the instant the POST
  // returns therefore streams the pre-menu buffer - measured on hardware
  // 2026-08-20: 0 px at +0ms, 4429 px at +300ms, with a preceding screen
  // switch making no difference either way. That looked exactly like "the
  // action never ran", which is why this samples on a short settle and says
  // so, rather than asserting on the first frame it can get.
  //
  // Settle, then retry once with a longer one instead of a single fixed
  // delay: a slow iteration should cost a second sample, not a red check.
  // The second sample lands around 3.2s after the trigger (each snapshot
  // itself streams for about a second), still inside HOLD_MS (4s) - which is
  // also why there is no third attempt.
  // The active tablet is drawn in the adornment's orange accent, #ff6600,
  // which comes back as #ff6500 after the RGB565 round trip.
  let menu = null
  let activeTablet = 0
  for (const settleMs of [400, 800]) {
    await sleep(settleMs)
    menu = snapshot()
    activeTablet = menu.count(0, 0, 360, 360, (p) => menu.hex(p) === "#ff6500")
    if (activeTablet > 100) break
  }
  check("screen menu overlay drawn", activeTablet > 100, `${activeTablet} px of #ff6500`)
  check("menu changed the frame", menu.hex(menu.px(180, 60)) !== beforePixel || activeTablet > 100)

  // The menu holds for 4s and then flies out on its own. Waiting it out
  // rather than dismissing keeps the checks below looking at a clean screen,
  // and incidentally proves the hold timer expires at all.
  console.log("  (waiting for the menu to time out)")
  await sleep(6000) // HOLD_MS (4s) + EXIT_MS, with margin
  const afterMenu = snapshot()
  const stillThere = afterMenu.count(0, 0, 360, 360, (p) => afterMenu.hex(p) === "#ff6500")
  check("menu times out on its own", stillThere === 0, `${stillThere} px of #ff6500 left`)

  const back = switchScreen(0)
  check("switch back to 0 accepted", back.success === true, JSON.stringify(back))
  s = snapshot()
  // Re-rendering the same index must reproduce the same pixels - the whole
  // basis for pixel-diffing later is that a render depends only on its
  // inputs, never on what was on screen before.
  check("screen 0 reproduced after switching away and back", s.hex(s.px(180, 90)) === BOX_FILL, s.hex(s.px(180, 90)))

  fs.rmSync(TMP, { force: true })
  console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
