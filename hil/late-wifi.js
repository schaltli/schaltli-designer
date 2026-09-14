// Proves a board whose WiFi comes up late still starts serving.
//
// Why this is a test and not a note (2026-09-14): a conformance run on the
// 4.3B ended with the board answering ping and refusing port 80 for as long
// as anyone cared to wait. Its boot gave WiFi ten seconds, and when the
// connection took longer it drew "WLAN nicht erreichbar" and returned -
// before the test interface, the handlers and MQTT were ever set up. The core
// then connected on its own a moment later, so the board was on the network
// with nothing listening, until the next restart. A conformance run restarts
// the board after every install, on a radio it is busy stressing, which is
// exactly when an association runs long.
//
// GET /api/debug?set=latewifi=<s> restarts the board with WiFi.begin() held
// back that many seconds - longer than the boot's wait - and this then waits
// for the test interface to come back, and for the board to confirm it was
// the held-back boot that did.
//
// Run: node hil/late-wifi.js --device <ip> [--seconds 20]
// Exit 0 pass, 1 fail, 2 device not reachable or has no such hook (skipped, loudly).

const http = require("http")

function parseArgs(argv) {
  const args = { device: null, seconds: 20 }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--seconds") args.seconds = Number(argv[++i])
  }
  if (!args.device) {
    console.error("usage: node hil/late-wifi.js --device <ip> [--seconds 20]")
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { device, seconds } = parseArgs(process.argv)
  const base = `http://${device}`

  let res
  try {
    res = await get(`${base}/api/debug?set=latewifi=${seconds}`, 10000)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }
  if (!/restarting with WiFi held back/.test(res.body)) {
    console.warn(`SKIPPED - ${device} has no ?set=latewifi hook`)
    process.exit(2)
  }
  const restartedAt = Date.now()
  console.log(`restarting ${device} with WiFi held back ${seconds}s`)

  // The held-back WiFi, a few seconds of boot, and room for an association
  // that is itself slow - and then it counts as never.
  const deadline = restartedAt + (seconds + 60) * 1000
  await sleep(3000)
  while (Date.now() < deadline) {
    try {
      const r = await get(`${base}/api/debug`, 4000)
      if (r.status === 200) {
        const uptime = Number((r.body.match(/uptime (\d+) s/) || [])[1])
        const held = /wifi held back (\d+) s at boot/.test(r.body)
        if (held) {
          console.log(`PASS - serving again ${((Date.now() - restartedAt) / 1000).toFixed(0)}s after the restart (uptime ${uptime}s), from the held-back boot`)
          process.exit(0)
        }
        // Answering, but from a boot that was not held back: the hook did not
        // take, and a pass here would prove nothing.
        if (uptime < seconds) {
          console.error(`FAIL - ${device} came back after ${uptime}s without reporting the held-back boot`)
          process.exit(1)
        }
      }
    } catch {
      // still booting, or on the network with nothing listening
    }
    await sleep(3000)
  }
  console.error(`FAIL - ${device} did not serve /api/debug within ${seconds + 60}s of a restart with WiFi held back ${seconds}s`)
  process.exit(1)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
