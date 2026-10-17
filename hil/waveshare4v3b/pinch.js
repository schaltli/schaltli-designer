// Proves the 4.3B tells a pinch from everything else a contact can be: two
// fingers drawn together are a pinch in, drawn apart a pinch out, dragged
// side by side neither - and none of them pages, taps or starts the setup
// hold, although the first finger alone travels far enough to page.
//
// Why this is a test and not a note (2026-10-17): the pinch is the proof of
// concept for the charts' time range (docs/2026-10-16-charts.md, decision
// 15), and its first question is whether the board recognises one at all.
// What the glass does in a hand is judged by hand, from the same log this
// reads; this keeps the decision and the ownership of the contact from
// quietly breaking afterwards. The thresholds themselves are tested on the
// PC (schaltli-firmware test/test_pinch).
//
// It posts two fingers to /api/touch (x2/y2), as the panel would report
// them, and reads the outcome from /api/debug?set=pinches=1. Asserts:
//
//   1. fingers drawn together are counted as one pinch in
//   2. fingers drawn apart, as one pinch out
//   3. fingers dragged side by side, as neither
//   4. through all three the screen did not change
//
// Run: node -r ./hil/device-auth.js hil/waveshare4v3b/pinch.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, text: await res.text() }
}

async function touch(base, query) {
  const res = await fetch(`${base}/api/touch?${query}`, { method: "POST", signal: AbortSignal.timeout(5000) })
  const body = await res.text()
  if (!res.ok || !body.includes('"success":true')) throw new Error(`POST /api/touch?${query}: ${res.status} ${body}`)
}

// One contact: the first finger alone for a sample, then both along `path`
// (a list of [x, y, x2, y2]), then the lift.
async function twoFingers(base, path) {
  const [x, y] = path[0]
  await touch(base, `x=${x}&y=${y}`)
  await sleep(30)
  for (const [ax, ay, bx, by] of path) {
    await touch(base, `x=${ax}&y=${ay}&x2=${bx}&y2=${by}`)
    await sleep(30)
  }
  const [lx, ly] = path[path.length - 1]
  await touch(base, `x=${lx}&y=${ly}&down=0`)
  // The release is handled on the board's next turn; after
  // ?set=pinches=show the result stands on the panel for 1.2 s, and the
  // wait covers that too.
  await sleep(1600)
}

// Fingers on a horizontal line through the middle, `from` to `to` px apart.
function spread(from, to, steps = 10) {
  const path = []
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps
    path.push([Math.round(400 - d / 2), 240, Math.round(400 + d / 2), 240])
  }
  return path
}

async function counts(base) {
  const { text } = await get(`${base}/api/debug?set=pinches=1`)
  const m = text.match(/pinches: (\d+) in, (\d+) out, (\d+) neither/)
  if (!m) throw new Error(`the firmware does not know ?set=pinches - flash a build from 2026-10-17 or later:\n${text.slice(-400)}`)
  return { in: +m[1], out: +m[2], neither: +m[3], log: text.slice(text.indexOf("pinch log")) }
}

async function screen(base) {
  const { text } = await get(`${base}/api/debug?set=render=1`)
  const m = text.match(/render \(screen (\d+)\)/)
  return m ? +m[1] : null
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  try {
    const probe = await get(`${base}/api/debug`, 4000)
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

  try {
    // A dark panel takes the first contact as a wake and nothing else.
    await touch(base, "x=400&y=240")
    await sleep(60)
    await touch(base, "x=400&y=240&down=0")
    await sleep(600)

    await get(`${base}/api/debug?set=pinches=clear`)
    const before = await screen(base)

    await twoFingers(base, spread(400, 120))
    let c = await counts(base)
    check(c.in === 1 && c.out === 0 && c.neither === 0, `1. fingers drawn together are one pinch in (${c.in} in, ${c.out} out, ${c.neither} neither)`)

    await twoFingers(base, spread(120, 420))
    c = await counts(base)
    check(c.in === 1 && c.out === 1 && c.neither === 0, `2. fingers drawn apart are one pinch out (${c.in} in, ${c.out} out, ${c.neither} neither)`)

    // Both move 300 px to the left, keeping 200 px between them.
    const drag = []
    for (let i = 0; i <= 10; i++) drag.push([350 - i * 30, 240, 550 - i * 30, 240])
    await twoFingers(base, drag)
    c = await counts(base)
    check(c.in === 1 && c.out === 1 && c.neither === 1, `3. fingers dragged side by side are neither (${c.in} in, ${c.out} out, ${c.neither} neither)`)

    const after = await screen(base)
    check(before !== null && before === after, `4. the screen did not change (screen ${before} before, ${after} after)`)

    if (failures.length) console.log(c.log)
  } catch (e) {
    console.error(`FAIL - ${e.message}`)
    process.exit(1)
  }

  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} of 4 checks failed`)
    process.exit(1)
  }
  console.log("\nPASS - pinch in, pinch out and a two-finger drag told apart, and none of them paged")
}

main()
