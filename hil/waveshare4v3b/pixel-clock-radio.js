// Proves the 4.3B's pixel clock is one that leaves its WiFi alone.
//
// Why this is a test and not a note (2026-09-14): conformance runs on this
// board crawled - snapshots at 6-45 KB/s, pings up to a second - and four
// explanations were measured away one after another (the radio's power save,
// the access point, the client, the CPU and memory) before switching the
// RGB panel's pixel clock live showed it: at Waveshare's 16 MHz the parallel
// bus slows the board's own WiFi, at 12 MHz it does not. A PaperS3 on the
// same access point at the same signal stayed fast the whole time.
//
// Which clock is kind depends on the WiFi channel, because it is a question
// of which harmonics land inside it - the measurement behind the 12 MHz
// default was channel 6. So this measures rather than remembers: snapshots
// at the firmware's own default and at 16 MHz, interleaved so both share the
// same minutes, and it fails when the default is not clearly the faster one.
// On an access point where that stops holding, the failure is the message:
// measure the clock again for that channel (?set=pclk=<hz>).
//
// It changes the panel clock for the duration and puts the default back.
// The picture at a given clock is not something it can judge - 8 MHz moved
// snapshots fastest of all and showed nothing but white on the glass.
//
// Run: node hil/waveshare4v3b/pixel-clock-radio.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

const COMPARE_HZ = 16000000
const ROUNDS = 3
const PER_SETTING = 2
// The default has to win by this much on the medians. The gap depends on
// when it is measured: 12 MHz beat 16 by 20x inside the slow stretches and
// by only 1.22x (820 against 670 KB/s) in the quietest minutes of the day it
// was chosen, which is the margin this has to clear without flaking.
const REQUIRED_RATIO = 1.1

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const req = http.get(url, { timeout: timeoutMs, agent: false }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), ms: Date.now() - started }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`no answer within ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function setClock(base, hz) {
  const r = await get(`${base}/api/debug?set=pclk=${hz}`, 60000)
  const text = r.body.toString("utf8")
  const m = text.match(/pixel clock -> (\d+) Hz: (\w+) \((\d+) is this build's default/)
  if (!m || m[2] !== "ok") throw new Error(`the board refused pixel clock ${hz}: ${text.slice(0, 200)}`)
  return Number(m[3])
}

async function snapshotKbps(base) {
  const r = await get(`${base}/snapshot.bmp`, 180000)
  if (r.status !== 200 || r.body.length < 1000) throw new Error(`snapshot failed: HTTP ${r.status}, ${r.body.length} bytes`)
  return r.body.length / 1024 / (r.ms / 1000)
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`
  try {
    await get(`${base}/api/debug`, 5000)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }

  // Setting the compare clock reports the default, which is what gets
  // restored - so the test follows whatever the firmware now ships.
  const defaultHz = await setClock(base, COMPARE_HZ)
  const at = { [defaultHz]: [], [COMPARE_HZ]: [] }
  try {
    for (let round = 0; round < ROUNDS; round++) {
      for (const hz of [defaultHz, COMPARE_HZ]) {
        await setClock(base, hz)
        for (let i = 0; i < PER_SETTING; i++) {
          const kbps = await snapshotKbps(base)
          at[hz].push(kbps)
          console.log(`  ${(hz / 1e6).toFixed(0)} MHz: ${kbps.toFixed(0)} KB/s`)
        }
      }
    }
  } finally {
    await setClock(base, defaultHz).catch((e) => console.warn(`could not restore the default clock: ${e.message}`))
  }

  const d = median(at[defaultHz])
  const c = median(at[COMPARE_HZ])
  const summary = `default ${(defaultHz / 1e6).toFixed(0)} MHz median ${d.toFixed(0)} KB/s, ${(COMPARE_HZ / 1e6).toFixed(0)} MHz median ${c.toFixed(0)} KB/s`
  if (defaultHz === COMPARE_HZ) {
    console.error(`FAIL - the firmware's default is ${COMPARE_HZ} Hz again, the clock that slowed its WiFi`)
    process.exit(1)
  }
  if (d < c * REQUIRED_RATIO) {
    console.error(`FAIL - ${summary}: the default is not clearly kinder to WiFi here; measure the clock again for this channel`)
    process.exit(1)
  }
  console.log(`PASS - ${summary}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
