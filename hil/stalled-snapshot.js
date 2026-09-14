// Proves a client that stops reading a snapshot cannot take a board offline.
//
// Why this is a test and not a note (2026-09-14): a conformance run on the
// 4.3B kept failing with snapshot timeouts, and in between the board
// answered nothing at all - its own counters later showed one web request
// holding the main loop for 278 seconds. The cause was in the shared
// TestInterfaceServer::sendBMP(): it wrote the image row by row and never
// looked at what write() returned. The Arduino core's write() waits up to ten
// seconds for a stalled connection before giving up on a row, and sendBMP
// simply moved on to the next of 480 rows, so one stuck client cost minutes
// during which nothing else on the board - no other request, no HIL run, no
// designer - got an answer.
//
// This opens /snapshot.bmp, stops reading after the first bytes so the TCP
// window fills and the board's writes stall, then asks /api/debug on a second
// connection. The board serves one request at a time, so the debug answer
// can only come once the snapshot handler has given up. Asserted: it comes
// within 30 seconds. Before the fix it did not come for minutes.
//
// Run: node hil/stalled-snapshot.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).

const http = require("http")

const ANSWER_WITHIN_MS = 30000

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  if (!args.device) {
    console.error("usage: node hil/stalled-snapshot.js --device <ip>")
    process.exit(1)
  }
  return args
}

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, agent: false }, (res) => {
      res.resume()
      res.on("end", () => resolve(res.statusCode))
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
  const base = `http://${device}`

  try {
    await get(`${base}/api/debug`, 5000)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }

  // The stalled reader. Paused on its first chunk and never resumed, so the
  // receive buffer fills and stays full.
  let received = 0
  const stalled = http.get(`${base}/snapshot.bmp`, { agent: false }, (res) => {
    res.once("data", (chunk) => {
      received += chunk.length
      res.pause()
    })
  })
  stalled.on("error", () => {})

  // Long enough for the header and the first rows to go out and the window
  // to close behind them.
  await new Promise((r) => setTimeout(r, 3000))

  const start = Date.now()
  let failure = null
  try {
    await get(`${base}/api/debug`, ANSWER_WITHIN_MS)
  } catch (e) {
    failure = e.message
  }
  const waited = Date.now() - start
  stalled.destroy()

  if (failure) {
    console.error(`FAIL - with a snapshot reader stalled, /api/debug got ${failure} (first chunk ${received} bytes)`)
    // Give the board its loop back before anything else runs against it.
    await new Promise((r) => setTimeout(r, 15000))
    process.exit(1)
  }
  console.log(`PASS - /api/debug answered after ${waited}ms with a snapshot reader stalled`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
