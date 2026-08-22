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
const http = require("http")

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

// Node's own client rather than the execFileSync curl used everywhere else
// in this file: spawning a process per request costs ~100ms on Windows, and
// the navigation checks below have to deliver inputs faster than the
// device's rate-limit window to mean anything at all. Measured 2026-08-22:
// ~20ms between requests this way against ~100ms via curl.
function postFast(pathAndQuery, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: ip,
        path: pathAndQuery,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => resolve(Buffer.concat(chunks).toString()))
      },
    )
    req.on("error", reject)
    req.on("timeout", () => req.destroy(new Error(`POST ${pathAndQuery} timed out`)))
    req.end(body)
  })
}

// `set` is applied before the JSON is rendered, so the reply always shows
// the value now in force - which is what makes it safe to assert on the
// reply instead of polling for the change to land.
function readDebug(set) {
  const url = `http://${ip}/api/debug${set ? `?set=${set}` : ""}`
  return JSON.parse(execFileSync("curl", ["-s", "-m", "10", url]).toString())
}

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
// Raw bytes of one of the device's two BMP endpoints. /snapshot.bmp is the
// canvas - what the renderer drew. /panel.bmp is a copy of every pixel
// actually pushed to the panel, which is a different thing entirely: the
// panel has no framebuffer this code can read and keeps whatever was last
// written to it, so a repaint that never happened leaves the glass showing
// something the canvas has long since moved on from. Two faults have now
// hidden in exactly that gap.
function fetchBmp(path, attempts = 3) {
  const tmp = path === "/panel.bmp" ? TMP + ".panel" : TMP
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      curl(["-s", "-f", "-m", "45", "-o", tmp, `http://${ip}${path}`])
      lastError = null
      break
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw new Error(`${path} failed after ${attempts} attempts: ${lastError.message}`)
  const buf = fs.readFileSync(tmp)
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) throw new Error(`${path} is not a BMP`)
  return buf
}

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

  // Established rather than assumed. A fresh upload reboots onto screen 0,
  // but --skip-upload inherits whatever the last run left behind - and the
  // navigation checks at the end of this file deliberately finish on screen
  // 1. Without this, every appearance check below read screen 1's black
  // background and reported five firmware failures that were nothing but a
  // run order. (The orchestrator carries the same guard for the same
  // reason.)
  curl(["-s", "-m", "10", "-X", "POST", "-d", "index=0", `http://${ip}/api/screen`])

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

  // The frame-timing probe (main.cpp, 2026-08-21) is the only way to see
  // where a screen change spends its ~54ms - render, LVGL's copy, or the
  // QSPI push - and it is what any work on the tearing seen while paging
  // fast will be judged against. An instrument nothing checks silently
  // stops recording, so this asserts it still reports a plausible frame
  // for the switches performed above, not that the numbers hit any
  // particular value: those legitimately change with every optimization,
  // and pinning them would make this test fail on an improvement.
  console.log("\n--- frame timing probe ---")
  const debug = JSON.parse(execFileSync("curl", ["-s", "-m", "10", `http://${ip}/api/debug`]).toString())
  const frames = debug.frames || []
  check("/api/debug reports frame timings", frames.length > 0, `${frames.length} frames`)
  const pushed = frames.filter((f) => f.chunks > 0)
  // chunks === 0 is a real and expected state - LVGL only refreshes on its
  // own period, so a render can find the timer not yet due and flush
  // nothing. What must never happen is *every* frame being like that.
  check("at least one frame actually reached the panel", pushed.length > 0, `${pushed.length}/${frames.length}`)
  if (pushed.length > 0) {
    const f = pushed[pushed.length - 1]
    const total = (f.renderUs + f.lvglUs + f.qspiUs) / 1000
    check(
      "the phases are all recorded",
      f.renderUs > 0 && f.lvglUs > 0 && f.qspiUs > 0,
      `render ${(f.renderUs / 1000).toFixed(1)}ms, lvgl ${(f.lvglUs / 1000).toFixed(1)}ms, qspi ${(f.qspiUs / 1000).toFixed(1)}ms`,
    )
    // A very wide bound on purpose: this catches a probe that has come
    // unstuck (zeroes, or a clock read in the wrong place giving absurd
    // values), not a performance regression.
    check("a full screen change is within an order of magnitude of 54ms", total > 5 && total < 500, `${total.toFixed(1)}ms`)
  }

  // --- navigation rate limit -------------------------------------------
  //
  // Paging is rate limited on the device (main.cpp, 2026-08-22): during a
  // burst of detents the screen is repainted at most every navFrameMs, and
  // the screen the burst *ends* on is always painted. Both halves are
  // asserted here, because both were got wrong on the way to this design.
  // First every detent was painted, which at ~32ms a frame turned a fast
  // bezel spin into a 30Hz strobe of screens nobody wanted to see. Then only
  // the destination was painted, which removed the strobe and with it every
  // sign that the knob was being heard - tried on hardware, and rejected
  // there as feeling stuck, worse than the flashing it had fixed.
  //
  // POST /api/input forces the frame out before it acks, so a caller that
  // snapshots the instant it returns cannot photograph the previous screen.
  // ?defer=1 opts out of that and delivers the input exactly as the encoder
  // does, which is the only way to exercise the limit over HTTP at all.
  console.log("\n--- navigation rate limit ---")
  const navBefore = readDebug()
  check("/api/debug reports navFrameMs", typeof navBefore.navFrameMs === "number", String(navBefore.navFrameMs))
  check("/api/debug reports screenIndex", typeof navBefore.screenIndex === "number", String(navBefore.screenIndex))

  // Widened for the duration: at the shipped 120ms a burst would have to be
  // delivered inside ~120ms to fall within one window, which would make this
  // a measurement of the runner's HTTP speed rather than of the device. At
  // 400ms even a burst dawdling at 100ms a request still coalesces, so a
  // failure here means the limit is broken, not that the machine was busy.
  const NAV_WINDOW_MS = 400
  // Odd on purpose, against the fixture's two screens: the burst has to end
  // somewhere other than where it started, so "nothing happened at all"
  // cannot pass. Screen 0 is re-established before each burst because
  // actions resolve per screen, and the checks above leave the device
  // wherever they happened to finish.
  const BURST = 11
  const EXPECTED_INDEX = BURST % 2

  // The window is a parameter rather than a constant read from the enclosing
  // scope: the third case below deliberately runs with the limit lifted, and
  // a burst that set the window itself silently put it back - which is how
  // the first run of this check came back green-adjacent with 2 frames where
  // 11 were expected, blaming the firmware for the test's own doing.
  async function burst(query, windowMs) {
    await postFast("/api/screen", "index=0")
    const before = readDebug(`navFrameMs=${windowMs}`)
    const started = Date.now()
    for (let i = 0; i < BURST; i++) await postFast(`/api/input${query}`, "id=swipe-left")
    const spanMs = Date.now() - started
    // Longer than one window, so the trailing repaint has certainly run and
    // the count is final rather than caught mid-burst.
    await sleep(windowMs + 300)
    const after = readDebug()
    return { frames: after.frameCount - before.frameCount, after, spanMs }
  }

  const deferred = await burst("?defer=1", NAV_WINDOW_MS)
  check(
    "a deferred burst is coalesced into fewer frames than detents",
    deferred.frames < BURST && deferred.frames > 0,
    `${BURST} detents over ${deferred.spanMs}ms -> ${deferred.frames} frames`,
  )
  check(
    "the screen a burst ends on is the one that gets painted",
    deferred.after.screenIndex === EXPECTED_INDEX && deferred.after.pendingScreenRender === false,
    `screenIndex ${deferred.after.screenIndex} (expected ${EXPECTED_INDEX}), pending ${deferred.after.pendingScreenRender}`,
  )

  // The same burst down the ordinary path. This is the check that fails if
  // the flush in the input handler is ever dropped: every input has to have
  // reached the panel by the time it is acked, whatever navFrameMs says. It
  // is 400ms here, far longer than a snapshot takes, so leaning on the rate
  // limit's leading edge would not save it.
  const immediate = await burst("", NAV_WINDOW_MS)
  check(
    "POST /api/input paints before it acks, regardless of the rate limit",
    immediate.frames === BURST,
    `${BURST} detents -> ${immediate.frames} frames`,
  )

  // Proves the coalescing above was the rate limit doing its job rather than
  // the device dropping inputs: with the limit lifted, the identical burst
  // paints every one of them.
  const unlimited = await burst("?defer=1", 0)
  check(
    "with navFrameMs=0 every detent paints again",
    unlimited.frames === BURST,
    `${BURST} detents -> ${unlimited.frames} frames`,
  )

  const restored = readDebug(`navFrameMs=${navBefore.navFrameMs}`)
  check("navFrameMs restored", restored.navFrameMs === navBefore.navFrameMs, `${restored.navFrameMs}ms`)

  // --- follow-the-finger swipe -----------------------------------------
  //
  // A swipe bound to paging drags the boundary between the two screens under
  // the finger instead of cutting at release (firmware 2026-08-22). Driven
  // here through POST /api/touch, which injects synthetic touch samples into
  // the real detector - the only way to reach a gesture from a test at all.
  // POST /api/input dispatches the *action* a swipe is bound to and proves
  // nothing about whether a drag decodes, follows, or settles where it
  // should.
  //
  // The two cases are separated by distance, never by timing: commit needs
  // 120px, a flick needs 60px within 250ms, and the injected samples arrive
  // at whatever rate the network gives. A 240px drag commits and a 40px one
  // cancels no matter how slowly they are delivered, so neither check can
  // fail because the runner was busy.
  console.log("\n--- follow-the-finger swipe ---")

  // One synthetic drag along a straight line, with the state sampled while
  // the finger is still down. Injection holds the panel off for 400ms per
  // sample, so a mid-drag read cannot be overtaken by the real (untouched)
  // panel reporting a release.
  async function synthDrag(x0, y0, x1, y1, steps = 10) {
    const before = readDebug()
    let midway = null
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps)
      const y = Math.round(y0 + ((y1 - y0) * i) / steps)
      await postFast("/api/touch", `x=${x}&y=${y}&down=1`)
      if (i === Math.floor(steps / 2)) midway = readDebug()
    }
    await postFast("/api/touch", `x=${x1}&y=${y1}&down=0`)
    // Past the release debounce (80ms) and the settle (160ms).
    await sleep(500)
    return { before, midway, after: readDebug() }
  }

  const touchAck = JSON.parse(
    await postFast("/api/touch", "x=180&y=180&down=0"),
  )
  check("POST /api/touch accepted", touchAck.success === true, JSON.stringify(touchAck))

  // Horizontal, far enough to commit. swipe-left is next-screen on both
  // fixture screens, so this must land on the next one.
  await postFast("/api/screen", "index=0")
  const commitDrag = await synthDrag(300, 180, 60, 180)
  check(
    "a paging drag follows the finger while it is down",
    commitDrag.midway.dragActive === true && Math.abs(commitDrag.midway.dragOffset) > 0,
    `dragActive ${commitDrag.midway.dragActive}, offset ${commitDrag.midway.dragOffset}, target ${commitDrag.midway.dragTargetIndex}`,
  )
  check(
    "a drag past the threshold commits to the next screen",
    commitDrag.after.screenIndex === 1 && commitDrag.after.dragActive === false,
    `screenIndex ${commitDrag.after.screenIndex}, verdict ${commitDrag.after.lastReleaseVerdict}`,
  )
  // Reported from hardware on 2026-08-22 as "the screen ends up partly
  // shifted": lv_obj_align only marks the layout dirty, so the centring at
  // the end of a transition was not real until LVGL next refreshed, and the
  // image measurably sat at -358 with the transition already finished.
  // These read LVGL's own coordinates rather than the firmware's idea of
  // them, which is the whole point - a probe reporting the state machine's
  // own belief back would have called that bug fine.
  // The structural half of the same fault. Everything between the last
  // animation step and the end of the transition runs with the display
  // frozen, so a commit must not render anything: it adopts the pixels the
  // transition canvas already holds. frameCount is the exact witness -
  // renderScreenIndex is the only thing that increments it, so a re-render
  // reinstated here fails this check no matter how fast the fixture happens
  // to render. That matters, because this fixture renders a screen in ~13ms
  // and the project that exposed the bug took 181ms: a timing threshold
  // tuned here would have passed the broken code.
  check(
    "committing a drag renders nothing - it adopts the pixels it already has",
    commitDrag.after.frameCount === commitDrag.before.frameCount,
    `frameCount ${commitDrag.before.frameCount} -> ${commitDrag.after.frameCount}, commit stall ${commitDrag.after.lastCommitStallMs}ms`,
  )
  check(
    "the display is not frozen mid-slide at the end of a swipe",
    commitDrag.after.lastCommitStallMs < 60,
    `${commitDrag.after.lastCommitStallMs}ms frozen (was 185ms when this re-rendered)`,
  )
  // The end of the argument this whole section exists for. Every other check
  // here reads the firmware's own state, and that state was reporting
  // perfect health - canvas correct, positions correct, watchdog at zero -
  // while the glass showed a screen stuck part-way through a swipe. The
  // panel has no framebuffer to read back, so the firmware keeps a copy of
  // every pixel it has pushed and counts where that disagrees with what was
  // drawn. Anything but zero is the display showing something nothing in
  // the firmware believes.
  //
  // The bug this caught: an LVGL screen is scrollable by default, and the
  // transition parks a full-screen child a whole screen width outside it.
  // The screen duly scrolled, drew its children shifted, and left a band of
  // bare background down the edge a swipe had moved away from.
  check(
    "what is on the panel matches what was drawn, after a committed drag",
    commitDrag.after.panelDiffPixels === 0,
    `${commitDrag.after.panelDiffPixels} pixels differ`,
  )
  check(
    "a committed drag leaves the screen centred",
    commitDrag.after.imageX === 0 && commitDrag.after.imageY === 0 &&
      commitDrag.after.transitionHidden === true,
    `image (${commitDrag.after.imageX},${commitDrag.after.imageY}), transition hidden ${commitDrag.after.transitionHidden}`,
  )

  // A screen reached by dragging must be the same screen. It is rendered
  // into a different buffer on that path, and the renderer turned out to
  // hold a second, independent pointer to the one it was built with: u8g2
  // binds its GFX target once in the constructor, so redirecting the canvas
  // sent every box and icon to the new buffer and every *glyph* to the old
  // one. The result was a screen that arrived complete except for its text,
  // with that text painted onto the screen being swiped away.
  //
  // canvasHash rather than two bitmap downloads: it samples the canvas on
  // the device, so this costs two ordinary debug reads. A missing label is
  // over a thousand pixels and cannot slip through a sampled hash.
  await postFast("/api/screen", "index=1")
  await sleep(300)
  const renderedDirectly = readDebug().canvasHash
  await postFast("/api/screen", "index=0")
  await sleep(300)
  const arrivedByDrag = await synthDrag(300, 180, 60, 180)
  check(
    "a screen reached by dragging is identical to the same screen rendered directly",
    arrivedByDrag.after.canvasHash === renderedDirectly && arrivedByDrag.after.screenIndex === 1,
    `hash ${arrivedByDrag.after.canvasHash} vs ${renderedDirectly}, screenIndex ${arrivedByDrag.after.screenIndex}`,
  )

  // Short of the threshold and short of a flick: the transition must run
  // back and leave the screen exactly where it was.
  await postFast("/api/screen", "index=0")
  const cancelDrag = await synthDrag(300, 180, 260, 180)
  check(
    "a drag short of the threshold cancels back to where it started",
    cancelDrag.after.screenIndex === 0 &&
      cancelDrag.after.dragActive === false &&
      cancelDrag.after.dragOffset === 0,
    `screenIndex ${cancelDrag.after.screenIndex}, offset ${cancelDrag.after.dragOffset}, verdict ${cancelDrag.after.lastReleaseVerdict}`,
  )
  check(
    "what is on the panel matches what was drawn, after a cancelled drag",
    cancelDrag.after.panelDiffPixels === 0,
    `${cancelDrag.after.panelDiffPixels} pixels differ`,
  )
  check(
    "a cancelled drag leaves the screen centred",
    cancelDrag.after.imageX === 0 && cancelDrag.after.imageY === 0 &&
      cancelDrag.after.transitionHidden === true,
    `image (${cancelDrag.after.imageX},${cancelDrag.after.imageY}), transition hidden ${cancelDrag.after.transitionHidden}`,
  )

  // Vertical, downward - bound to next-screen in the fixture for exactly
  // this. The same code has to follow the other axis.
  await postFast("/api/screen", "index=0")
  const verticalDrag = await synthDrag(180, 60, 180, 300)
  check(
    "the drag follows the vertical axis too",
    verticalDrag.midway.dragActive === true && verticalDrag.after.screenIndex === 1,
    `midway offset ${verticalDrag.midway.dragOffset}, screenIndex ${verticalDrag.after.screenIndex}`,
  )
  check(
    "what is on the panel matches what was drawn, after a vertical drag",
    verticalDrag.after.panelDiffPixels === 0,
    `${verticalDrag.after.panelDiffPixels} pixels differ`,
  )

  // Upward on the same axis is bound to the screen menu, not to paging, so
  // no transition may start - the release classifier handles it as before.
  // This is what keeps the animation opt-in rather than something every
  // swipe suddenly does.
  await postFast("/api/screen", "index=0")
  const nonPagingDrag = await synthDrag(180, 300, 180, 60)
  check(
    "a swipe not bound to paging never starts a transition",
    nonPagingDrag.midway.dragActive === false && nonPagingDrag.after.screenIndex === 0,
    `midway dragActive ${nonPagingDrag.midway.dragActive}, verdict ${nonPagingDrag.after.lastReleaseVerdict}`,
  )

  // The four checks above sample the end of each drag; this covers every
  // loop iteration in between. The firmware counts any pass where no
  // transition is running and the screen is nevertheless not centred, which
  // catches the fault whether it lasts one frame or sticks - a distinction
  // invisible in a screenshot and the entire question with this bug. Zero
  // since boot, so it also covers the drags the human-driven checks above
  // never look at.
  // The counter above is only as good as the copy it is computed from, so
  // the readback endpoint is exercised once directly. Cheap: one 388KB
  // stream, against the two the per-drag checks used to cost each.
  const panelBmp = fetchBmp("/panel.bmp")
  check(
    "GET /panel.bmp serves the pixels actually pushed to the panel",
    panelBmp.readInt32LE(18) === 360 && panelBmp.readInt32LE(22) === 360,
    `${panelBmp.readInt32LE(18)}x${panelBmp.readInt32LE(22)}, ${panelBmp.length} bytes`,
  )

  const centred = readDebug()
  check(
    "the screen is never off-centre while no transition is running",
    centred.offCentreTicks === 0,
    `${centred.offCentreTicks} ticks, worst (${centred.offCentreLastX},${centred.offCentreLastY}) for ${centred.offCentreLongestMs}ms`,
  )

  fs.rmSync(TMP, { force: true })
  fs.rmSync(TMP + ".panel", { force: true })
  console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
