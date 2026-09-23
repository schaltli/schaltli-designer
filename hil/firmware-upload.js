// Proves a firmware upload over WiFi lands: answered, restarted, and booted
// from the new image rather than the old one.
//
// Why this is a test and not a note (2026-09-15): an upload to the PaperS3
// got no answer, the board restarted - and came back on the firmware it had
// before. It was noticed only because a test then failed against code that
// was not running. Twelve uploads to two boards afterwards all landed, so the
// fault is rare, and by the time anyone looked, the restarts since had erased
// whatever the board could have said about it.
//
// So this uploads the image each board is already running, and never a
// different one: the built firmware.bin in the schaltli-firmware checkout
// must have the same MD5 as the running sketch, or the board is skipped. That
// makes the test harmless, and it is also why the MD5 cannot tell a landed
// upload from a lost one here. The app slot can: an update always boots from
// the slot that was not running. Each attempt asserts
//
//   1. the upload is answered with success
//   2. the board comes back
//   3. it runs from the other slot, with the same MD5
//   4. it last restarted by software, not by a panic, watchdog or brownout
//
// When 3 or 4 fails, the reset reason in the message is the evidence the
// first occurrence did not leave behind.
//
// With --foreign-env, it first uploads another board's build and asserts it
// is refused: answered with a refusal, no restart, the slot and the MD5
// unchanged (designer repo docs/2026-09-15-firmware-ota.md, decision 5 -
// until that date the knob's firmware would have installed on the 4.3B). It
// sends the foreign image only to a board whose /api/debug says it installs
// images for itself alone, because a board that predates the check would
// install it.
//
// hil/firmware-ota.js covers the same ground for an update triggered over
// MQTT, the way the designer does it.
//
// Run: node hil/firmware-upload.js --device <ip> --env <platformio env>
//        [--foreign-env <another board's env>] [--times <n>]
// Exit 0 pass, 1 fail, 2 device not reachable, 3 the checkout's build is not
// what the board runs (both skipped, loudly).

const http = require("http")
const crypto = require("crypto")
const { sleep, get, parseBoot, readBoot, waitForBoot, loadBuild } = require("./firmware-common")

function parseArgs(argv) {
  const args = { device: null, env: null, foreignEnv: null, times: 2 }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--env") args.env = argv[++i]
    else if (argv[i] === "--foreign-env") args.foreignEnv = argv[++i]
    else if (argv[i] === "--times") args.times = Number(argv[++i])
  }
  if (!args.device || !args.env) {
    console.error("usage: node hil/firmware-upload.js --device <ip> --env <platformio env> [--foreign-env <env>] [--times <n>]")
    process.exit(1)
  }
  return args
}

function upload(url, image) {
  const boundary = `----schaltli${crypto.randomBytes(8).toString("hex")}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="firmware"; filename="firmware.bin"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, image, tail])
  return new Promise((resolve) => {
    const req = http.request(
      url,
      {
        method: "POST",
        timeout: 180000,
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      },
      (res) => {
        let text = ""
        res.setEncoding("utf8")
        res.on("data", (c) => (text += c))
        res.on("end", () => resolve({ status: res.statusCode, body: text }))
        res.on("error", (e) => resolve({ status: null, body: "", error: e.message }))
      },
    )
    req.on("timeout", () => {
      req.destroy()
      resolve({ status: null, body: "", error: "timed out" })
    })
    req.on("error", (e) => resolve({ status: null, body: "", error: e.message }))
    req.end(body)
  })
}

async function main() {
  const { device, env, foreignEnv, times } = parseArgs(process.argv)
  const base = `http://${device}`

  let first
  try {
    first = await get(`${base}/api/debug`, 4000)
    if (first.status !== 200) throw new Error(`status ${first.status}`)
  } catch (e) {
    console.warn(`SKIPPED - ${device} not reachable at ${base}/api/debug (${e.message})`)
    process.exit(2)
  }

  let state = parseBoot(first.body)
  if (!state) {
    console.error(`FAIL - /api/debug on ${device} does not report the reset reason and slot - flash a build from 2026-09-15 or later`)
    process.exit(1)
  }

  const own = loadBuild(env)
  if (!own) {
    console.warn(`SKIPPED - no ${env} build in the firmware checkout; run pio run -e ${env} there`)
    process.exit(3)
  }
  if (own.md5 !== state.md5) {
    console.warn(`SKIPPED - ${device} runs ${state.md5}, the checkout's ${env} build is ${own.md5}. ` +
      `This test only ever re-uploads the running image; flash the build or rebuild what the board runs.`)
    process.exit(3)
  }

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  if (foreignEnv) {
    console.log(`\na foreign image: the ${foreignEnv} build`)
    const foreign = loadBuild(foreignEnv)
    if (!state.installsOnlyFor || state.installsOnlyFor !== own.device) {
      // Not sent: this board may install whatever it is given.
      check(false, `0. ${device} reports installing only its own images (says: ${state.installsOnlyFor || "nothing"}, image is for ${own.device})`)
    } else if (!foreign || !foreign.device || foreign.device === own.device) {
      check(false, `0. a foreign build to send (${foreignEnv}: ${foreign ? `built for ${foreign.device}` : "missing"})`)
    } else {
      const before = state
      const res = await upload(`${base}/api/firmware`, foreign.image)
      check(res.status === 400 && /"success":false/.test(res.body) && /not a firmware image/.test(res.body),
        `5. the image for ${foreign.device} is refused (${res.status === null ? `no answer: ${res.error}` : `${res.status} ${res.body}`})`)
      await sleep(4000)
      let after = null
      try {
        after = await readBoot(base)
      } catch {}
      check(after !== null && after.uptime !== null && before.uptime !== null && after.uptime > before.uptime,
        `6. and the board did not restart (uptime ${before.uptime} s -> ${after ? after.uptime : "?"} s)`)
      if (after) {
        check(after.slot === before.slot && after.md5 === before.md5,
          `7. still on ${before.slot} with its own firmware (now ${after.slot}, ${after.md5 === before.md5 ? "MD5 unchanged" : after.md5})`)
        state = after
      }
    }
  }

  console.log(`\n${device} runs ${state.md5} from ${state.slot} (last reset ${state.reset}); uploading it ${times} time(s)`)
  for (let i = 1; i <= times; i++) {
    console.log(`\nattempt ${i}`)
    const t0 = Date.now()
    const res = await upload(`${base}/api/firmware`, own.image)
    const answered = res.status === 200 && /"success":true/.test(res.body)
    check(answered, `1. answered with success after ${((Date.now() - t0) / 1000).toFixed(1)} s ` +
      `(${res.status === null ? `no answer: ${res.error}` : `${res.status} ${res.body}`})`)

    const after = await waitForBoot(base)
    check(after !== null, "2. the board came back")
    if (!after) break

    check(after.slot !== state.slot && after.md5 === state.md5,
      `3. booted the uploaded image: ${state.slot} -> ${after.slot}, MD5 ${after.md5 === state.md5 ? "unchanged" : after.md5}`)
    check(after.reset === "software", `4. last restart was by software (was ${after.reset})`)
    state = after
  }

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - firmware uploads land on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
