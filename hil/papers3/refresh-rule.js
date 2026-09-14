// Proves the PaperS3's e-ink refresh rule on the device.
//
// Why this is a test and not a note (2026-09-14): the first version of the
// rule measured idleness from the last draw and applied it lazily, to the
// next paint. The manual check decision 11 asks for found it within a minute
// - the panel flashed on the very first tap after a pause, which is the one
// tap the rule existed to spare, and ninety seconds without a touch cleaned
// nothing. No conformance run could have seen it: the snapshot is read from
// the canvas, and the canvas is identical whichever mode painted it.
//
// The revised rule (decision 6, EpdPanel.h): every redraw is partial; once
// ten partials have piled up, the panel cleans itself with one full refresh
// as soon as nobody has touched it for ten seconds. Four things are asserted,
// one per way it can be wrong:
//
//   1. no ceiling - twelve partials while someone keeps touching stay partial
//   2. not early  - nothing is cleaned while the last touch is under 10s old
//   3. not lazy   - past 10s the clean-up happens on its own, with no paint
//                   to hang it on
//   4. threshold  - three partials and a long quiet cleans nothing
//   5. dashboard  - with nobody touching, the tenth partial is cleaned at once
//
// Partials come from GET /api/debug?set=repaint=1, which redraws the screen
// exactly as a topic value would, so no project, broker or finger is needed.
// Touches go through POST /api/touch, the same path the glass uses, as a
// diagonal drag: it is neither a tap nor a swipe, so it cannot press whatever
// the installed project happens to have under it.
//
// What this cannot see is whether the glass then looks clean. That stays a
// manual check.
//
// Run: node hil/papers3/refresh-rule.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

function parseArgs(argv) {
  const args = { device: process.env.HIL_PAPERS3_DEVICE || "192.168.1.118" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

function request(method, url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout: timeoutMs }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, body }))
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

function parseState(body) {
  const partials = body.match(/partials since last full refresh: (\d+) of (\d+), last paint was (full|partial)/)
  const touch = body.match(/last touch: (?:(\d+) ms ago|never), clean-up after (\d+) ms/)
  if (!partials || !touch) throw new Error(`/api/debug did not report the refresh state:\n${body}`)
  return {
    partials: Number(partials[1]),
    threshold: Number(partials[2]),
    lastFull: partials[3] === "full",
    msSinceTouch: touch[1] === undefined ? Infinity : Number(touch[1]),
    idleMs: Number(touch[2]),
  }
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  try {
    const probe = await request("GET", `${base}/api/debug`, 4000)
    if (probe.status !== 200) throw new Error(`status ${probe.status}`)
  } catch (e) {
    console.warn(`SKIPPED - PaperS3 not reachable at ${base}/api/debug (${e.message}); set HIL_PAPERS3_DEVICE to override`)
    process.exit(2)
  }

  const state = async () => parseState((await request("GET", `${base}/api/debug`)).body)
  const repaint = async () => parseState((await request("GET", `${base}/api/debug?set=repaint=1`)).body)
  const touch = async () => {
    await request("POST", `${base}/api/touch?x=400&y=300&down=1`)
    await sleep(100)
    await request("POST", `${base}/api/touch?x=500&y=400&down=1`)
    await sleep(100)
    await request("POST", `${base}/api/touch?x=500&y=400&down=0`)
    await sleep(100)
  }

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  const { threshold, idleMs } = await state()
  console.log(`rule on device: clean-up after ${threshold} partials and ${idleMs} ms without a touch`)

  // A screen switch is always painted clean, which gives every run the same
  // starting point whatever the device was doing before.
  const screen = await request("POST", `${base}/api/screen?index=0`)
  if (screen.status !== 200) throw new Error(`POST /api/screen returned ${screen.status}: ${screen.body}`)
  let s = await state()
  check(s.partials === 0 && s.lastFull, `a screen switch paints clean (partials ${s.partials}, last ${s.lastFull ? "full" : "partial"})`)

  console.log(`\n1. ${threshold + 2} partials while someone keeps touching`)
  for (let i = 0; i < threshold + 2; i++) {
    await touch()
    s = await repaint()
  }
  check(!s.lastFull && s.partials >= threshold + 2, `no ceiling: still partial after ${s.partials} partials`)

  console.log(`\n2. the quiet moment, watched from the last touch`)
  let cleanedAt = null
  const deadline = Date.now() + idleMs + 8000
  while (Date.now() < deadline) {
    s = await state()
    if (s.lastFull && s.partials === 0) {
      cleanedAt = s.msSinceTouch
      break
    }
    check(s.msSinceTouch < idleMs + 3000, `waiting at ${s.msSinceTouch} ms since the touch, ${s.partials} partials`)
    if (s.msSinceTouch >= idleMs + 3000) break
    await sleep(1000)
  }
  // The first poll that sees the clean-up can be up to a poll interval and a
  // full refresh late, so "when" is bounded on both sides with that slack.
  check(cleanedAt !== null, `3. not lazy: cleaned up on its own, with no paint to hang it on`)
  if (cleanedAt !== null)
    check(cleanedAt >= idleMs, `2. not early: first seen clean at ${cleanedAt} ms since the touch (rule: ${idleMs})`)

  console.log(`\n4. three partials, then a long quiet`)
  await touch()
  for (let i = 0; i < 3; i++) s = await repaint()
  while ((s = await state()).msSinceTouch < idleMs + 3000) await sleep(1000)
  check(!s.lastFull && s.partials === 3, `below the threshold nothing is cleaned (partials ${s.partials}, last ${s.lastFull ? "full" : "partial"})`)

  console.log(`\n5. a dashboard nobody touches`)
  for (let i = s.partials; i < threshold - 1; i++) s = await repaint()
  check(!s.lastFull && s.partials === threshold - 1, `${threshold - 1} partials, not yet cleaned`)
  s = await repaint()
  let cleaned = s.lastFull && s.partials === 0
  for (let i = 0; i < 10 && !cleaned; i++) {
    await sleep(500)
    s = await state()
    cleaned = s.lastFull && s.partials === 0
  }
  check(cleaned, `the ${threshold}th partial is cleaned straight away when nobody has touched it`)

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - refresh rule holds on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
