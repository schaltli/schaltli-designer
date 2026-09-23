// Asserts a board runs with its radio's power save off.
//
// Why this is a test and not a note (2026-09-14): the knob turned power
// save off on 2026-08-24 after measuring answers of up to 1.8s against 19ms
// from a Pi on the same network. That was meant to be a building block every
// Schaltli device shares, and neither the 4.3B nor the PaperS3 port copied
// it - both pinged at 70-100ms on average until it was found, and the PaperS3
// dropped to 1ms the moment it was set. A port that forgets it looks fine in
// every other test and just answers slowly, forever.
//
// Reads the flag the board reports in /api/debug rather than timing pings:
// latency is the network's to decide, the setting is the firmware's.
//
// Run: node hil/radio-awake.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  if (!args.device) {
    console.error("usage: node hil/radio-awake.js --device <ip>")
    process.exit(1)
  }
  return args
}

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, agent: false }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, body }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`no answer within ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

async function main() {
  const { device } = parseArgs(process.argv)
  let res
  try {
    res = await get(`http://${device}/api/debug`, 10000)
  } catch (e) {
    console.warn(`SKIPPED - http://${device}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }
  const m = res.body.match(/wifi power save ([a-z ]+)/)
  if (!m) {
    console.error(`FAIL - ${device} does not report its radio power save in /api/debug`)
    process.exit(1)
  }
  const mode = m[1].trim()
  if (mode !== "none") {
    console.error(`FAIL - ${device} runs with radio power save "${mode}"; every request waits for the radio to wake`)
    process.exit(1)
  }
  console.log(`PASS - ${device} radio power save is off`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
