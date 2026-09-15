// Proves the PaperS3's setup hold shows a countdown, and cleans up after it.
//
// Why this is a test and not a note (2026-09-15): the hold is ten seconds in
// the top left quadrant, and until this date the countdown existed only in
// the serial log. The user held the board for ten seconds with nothing on the
// glass and concluded the gesture did not work - at the wrong spot, as it
// turned out, but with nothing to tell them so. The 4.3B has shown its
// countdown from the start.
//
// The box goes over the project rather than replacing it (the user's choice):
// on e-ink a whole new picture either flashes or leaves a ghost. Asserted:
//
//   1. the box lands inside a centred region and leaves the rest of the
//      screen untouched, and a repaint puts the screen back exactly
//   2. a hold shows nothing before three seconds
//   3. after three seconds the countdown is up, painted partially
//   4. letting go takes it down without opening setup mode, partially
//   5. the panel cleans itself ten seconds after the finger lets go, even
//      with fewer partials behind it than the rule normally waits for - the
//      box leaves more of a trace than its count says
//   6. afterwards the snapshot is the project again, pixel for pixel
//
// The hold goes through POST /api/touch, re-posted every 400ms because an
// injected touch lasts two seconds. No snapshot can be taken during it: one
// takes longer than that and blocks the loop, so the finger would lift. The
// box's position is checked through ?set=holdcountdown=<s> instead, which
// draws the same box.
//
// Whether the box reads well on the glass stays a manual check.
//
// Run: node hil/papers3/hold-countdown.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

// Top left quadrant, where the setup hold counts.
const HOLD_X = 120
const HOLD_Y = 120
// Generous around the firmware's 600x220 box, centred on 960x540.
const BOX = { x0: 170, y0: 150, x1: 790, y1: 390 }

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseState(buf) {
  const body = buf.toString("utf8")
  const partials = body.match(/partials since last full refresh: (\d+) of (\d+), last paint was (full|partial)/)
  const touch = body.match(/last touch: (?:(\d+) ms ago|never), clean-up after (\d+) ms/)
  const hold = body.match(/setup hold: (?:(\d+) ms held|no contact), countdown (showing|not showing)/)
  if (!partials || !touch || !hold) {
    throw new Error(`/api/debug did not report the refresh and hold state - flash a build from 2026-09-15 or later:\n${body}`)
  }
  return {
    partials: Number(partials[1]),
    threshold: Number(partials[2]),
    lastFull: partials[3] === "full",
    msSinceTouch: touch[1] === undefined ? Infinity : Number(touch[1]),
    idleMs: Number(touch[2]),
    heldMs: hold[1] === undefined ? null : Number(hold[1]),
    countdown: hold[2] === "showing",
  }
}

function decodeBmp(buf) {
  if (buf.toString("ascii", 0, 2) !== "BM") throw new Error("snapshot is not a BMP")
  const offset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const rawHeight = buf.readInt32LE(22)
  const bytesPerPixel = buf.readUInt16LE(28) / 8
  const height = Math.abs(rawHeight)
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4
  const at = (x, y) => {
    const srcY = rawHeight > 0 ? height - 1 - y : y
    const s = offset + srcY * rowSize + x * bytesPerPixel
    return (buf[s] << 16) | (buf[s + 1] << 8) | buf[s + 2]
  }
  return { width, height, at }
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  try {
    const probe = await request("GET", `${base}/api/debug`, 4000)
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
  const state = async (set) => parseState((await request("GET", `${base}/api/debug${set ? `?set=${set}` : ""}`)).body)
  const snapshot = async () => {
    const r = await request("GET", `${base}/snapshot.bmp`)
    if (r.status !== 200) throw new Error(`GET /snapshot.bmp returned ${r.status}`)
    return r.body
  }
  const press = (down) => request("POST", `${base}/api/touch?x=${HOLD_X}&y=${HOLD_Y}&down=${down ? 1 : 0}`)

  // A screen switch paints clean and zeroes the partials, so every run
  // starts from the same place.
  const screen = await request("POST", `${base}/api/screen?index=0`)
  if (screen.status !== 200) throw new Error(`POST /api/screen returned ${screen.status}`)
  const before = await snapshot()

  console.log("\n1. where the box lands")
  await state("holdcountdown=7")
  const boxed = decodeBmp(await snapshot())
  const plain = decodeBmp(before)
  let inside = 0
  let outside = 0
  for (let y = 0; y < plain.height; y++)
    for (let x = 0; x < plain.width; x++)
      if (boxed.at(x, y) !== plain.at(x, y)) {
        if (x >= BOX.x0 && x < BOX.x1 && y >= BOX.y0 && y < BOX.y1) inside++
        else outside++
      }
  check(inside > 0, `the box changed pixels in the middle of the screen (${inside})`)
  check(outside === 0, `and none outside it (${outside})`)
  await state("repaint=1")
  check((await snapshot()).equals(before), "a repaint puts the screen back exactly")

  console.log("\n2-4. a real hold, through /api/touch")
  const start = await request("POST", `${base}/api/screen?index=0`)
  if (start.status !== 200) throw new Error(`POST /api/screen returned ${start.status}`)
  let s = await state()
  const { threshold, idleMs } = s

  await press(true)
  const t0 = Date.now()
  let sawEarly = false
  let earlyShowing = false
  let lateShowing = false
  let lateState = null
  while (Date.now() - t0 < 4600) {
    await sleep(400)
    await press(true)
    s = await state()
    if (s.heldMs !== null && s.heldMs < 2800) {
      sawEarly = true
      if (s.countdown) earlyShowing = true
    }
    if (s.heldMs !== null && s.heldMs >= 4000 && s.countdown) {
      lateShowing = true
      lateState = s
    }
  }
  check(sawEarly && !earlyShowing, "2. nothing shows in the first three seconds")
  check(lateShowing, `3. the countdown is up after ${lateState ? lateState.heldMs : "?"} ms`)
  if (lateState) {
    check(!lateState.lastFull, "3b. painted partially, no flash mid-hold")
    check(lateState.partials < threshold, `3c. with fewer partials behind it than the rule waits for (${lateState.partials} of ${threshold}), so 5 means something`)
  }

  await press(false)
  await sleep(1500)
  const released = await request("GET", `${base}/api/debug`)
  check(released.status === 200, `4a. letting go did not open setup mode (status ${released.status})`)
  s = parseState(released.body)
  check(!s.countdown && s.heldMs === null, "4b. the countdown is down and the contact is over")
  check(!s.lastFull, "4c. taken down partially")

  console.log("\n5. the clean-up")
  let cleanedAt = null
  const deadline = Date.now() + idleMs + 8000
  while (Date.now() < deadline) {
    s = await state()
    if (s.lastFull && s.partials === 0) {
      cleanedAt = s.msSinceTouch
      break
    }
    await sleep(1000)
  }
  check(cleanedAt !== null, "5a. the panel cleaned itself after the hold")
  if (cleanedAt !== null) check(cleanedAt >= idleMs, `5b. not before ${idleMs} ms without a touch (first seen clean at ${cleanedAt} ms)`)

  console.log("\n6. the project, back")
  check((await snapshot()).equals(before), "the snapshot matches the one taken before the hold")

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - setup hold countdown holds on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
