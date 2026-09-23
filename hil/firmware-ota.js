// Proves a firmware update over MQTT works the way the designer triggers it,
// and refuses everything it should (docs/2026-09-15-firmware-ota.md,
// decisions 2, 5 and 8; the firmware's FirmwareUpdater).
//
// Serves images over HTTP from this machine and publishes the retained
// schaltli/<clientId>/firmware trigger the designer publishes, then follows
// deploy-status and the board's /api/debug. Like hil/firmware-upload.js it
// only ever installs the image the board already runs - the checkout's build
// must have the running MD5 - so the app slot, which every update switches,
// is what tells an installed update from one that did not happen.
//
//   1. up to date: the running build, not forced, is answered "up_to_date"
//      without a download or a restart
//   2. wrong device: a trigger naming another deviceId is refused before
//      any download
//   3. bad checksum: downloaded in full, refused at verifying, no restart,
//      slot unchanged, and the project back on the screen
//   4. foreign image (--foreign-env): another board's build, even with this
//      board's deviceId claimed in the trigger, is refused by the marker the
//      image lacks - no restart, slot unchanged
//   5. the real thing, forced: downloading with progress, download_complete,
//      verifying, applying, rebooting; the board comes back from the other
//      slot, with the same MD5, after a software restart, announcing the
//      same build in hello
//   6. the retained trigger is gone afterwards, and no second update ran -
//      a retained trigger left behind would update the board after every
//      restart, forever
//
// Every refused case writes an image into the spare slot before refusing it.
// That is the point: it proves the check happens before Update.end().
//
// Run: node hil/firmware-ota.js --device <ip> --env <platformio env> [--foreign-env <env>]
// Needs the MQTT broker (npm run hil:broker) the board is configured for.
// Exit 0 pass, 1 fail, 2 device or broker not reachable, 3 the checkout's
// build is not what the board runs (both skipped, loudly).

const http = require("http")
const crypto = require("crypto")
const mqtt = require("mqtt")
const { sleep, get, parseBoot, readBoot, waitForBoot, loadBuild, lanAddress } = require("./firmware-common")

const TOPIC_PREFIX = "schaltli"
const HTTP_PORT = Number(process.env.HIL_FIRMWARE_PORT || 8898)
const brokerUrl = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const TERMINAL = ["error", "up_to_date", "busy", "rebooting"]

function parseArgs(argv) {
  const args = { device: null, env: null, foreignEnv: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--env") args.env = argv[++i]
    else if (argv[i] === "--foreign-env") args.foreignEnv = argv[++i]
  }
  if (!args.device || !args.env) {
    console.error("usage: node hil/firmware-ota.js --device <ip> --env <platformio env> [--foreign-env <env>]")
    process.exit(1)
  }
  return args
}

function serveImages(files) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = files[req.url]
      if (!file) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": file.length })
      res.end(file)
    })
    server.on("error", reject)
    server.listen(HTTP_PORT, "0.0.0.0", () => resolve(server))
  })
}

// The board's MQTT client id, from its retained hello - the one whose DDF
// url is on this board's address.
function findClient(client, device) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no hello from ${device} on the broker within 15s`)), 15000)
    client.on("message", function onHello(topic, payload) {
      const m = topic.match(/^schaltli\/([^/]+)\/hello$/)
      if (!m || payload.length === 0) return
      try {
        const hello = JSON.parse(payload.toString())
        if (hello.url && hello.url.startsWith(`http://${device}/`)) {
          clearTimeout(timer)
          client.removeListener("message", onHello)
          resolve({ clientId: m[1], hello })
        }
      } catch {}
    })
    client.subscribe(`${TOPIC_PREFIX}/+/hello`)
  })
}

async function main() {
  const { device, env, foreignEnv } = parseArgs(process.argv)
  const base = `http://${device}`

  let state
  try {
    const r = await get(`${base}/api/debug`, 4000)
    if (r.status !== 200) throw new Error(`status ${r.status}`)
    state = parseBoot(r.body)
  } catch (e) {
    console.warn(`SKIPPED - ${device} not reachable at ${base}/api/debug (${e.message})`)
    process.exit(2)
  }
  if (!state || !state.installsOnlyFor) {
    console.error(`FAIL - /api/debug on ${device} does not report its slot and the images it installs - flash a build from 2026-09-15 or later`)
    process.exit(1)
  }
  const own = loadBuild(env)
  if (!own || own.md5 !== state.md5) {
    console.warn(`SKIPPED - ${device} runs ${state.md5}, the checkout's ${env} build is ${own ? own.md5 : "missing"}. ` +
      `This test only ever installs the running image; flash the build or rebuild what the board runs.`)
    process.exit(3)
  }
  if (own.device !== state.installsOnlyFor) {
    console.error(`FAIL - the ${env} build is for ${own.device}, but ${device} is ${state.installsOnlyFor}`)
    process.exit(1)
  }
  const foreign = foreignEnv ? loadBuild(foreignEnv) : null

  const client = mqtt.connect(brokerUrl, { connectTimeout: 5000, reconnectPeriod: 0 })
  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
      setTimeout(() => reject(new Error("timed out")), 6000)
    })
  } catch (e) {
    console.warn(`SKIPPED - MQTT broker not reachable at ${brokerUrl} (${e.message}); start it with npm run hil:broker`)
    process.exit(2)
  }

  const files = { "/own.bin": own.image }
  if (foreign) files["/foreign.bin"] = foreign.image
  const server = await serveImages(files)
  const host = `http://${lanAddress()}:${HTTP_PORT}`

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  try {
    const { clientId, hello } = await findClient(client, device)
    console.log(`${device} is ${clientId}, build ${hello.firmwareBuild}, on ${state.slot}`)
    check(hello.firmwareBuild === state.build, `0. hello announces the build /api/debug reports (${hello.firmwareBuild})`)

    const statusTopic = `${TOPIC_PREFIX}/${clientId}/deploy-status`
    const firmwareTopic = `${TOPIC_PREFIX}/${clientId}/firmware`
    const statuses = new Map()
    client.on("message", (topic, payload) => {
      if (topic !== statusTopic) return
      try {
        const s = JSON.parse(payload.toString())
        if (!statuses.has(s.deployId)) statuses.set(s.deployId, [])
        statuses.get(s.deployId).push(s)
      } catch {}
    })
    await new Promise((resolve) => client.subscribe(statusTopic, resolve))

    // Publishes a trigger and collects its statuses until one ends it.
    const trigger = async (fields, timeoutMs = 120000) => {
      const updateId = `hil-${crypto.randomBytes(4).toString("hex")}`
      client.publish(firmwareTopic, JSON.stringify({ updateId, ...fields }), { retain: true, qos: 1 })
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const seen = statuses.get(updateId) || []
        if (seen.some((s) => TERMINAL.includes(s.state))) return seen
        await sleep(250)
      }
      return statuses.get(updateId) || []
    }
    const describe = (seen) => seen.map((s) => (s.state === "downloading" ? `${s.state} ${s.percent}%` : s.error ? `${s.state} "${s.error}"` : s.state)).join(", ")
    const ownImage = { url: `${host}/own.bin`, sha256: own.sha256, size: own.image.length, deviceId: own.device }
    const notRestarted = async (before, what) => {
      const after = await readBoot(base)
      // >= rather than >: a refusal can be over inside the second uptime is
      // counted in, and a restart would put it back to a few seconds anyway.
      check(after && after.uptime >= before.uptime && after.slot === before.slot && after.md5 === before.md5,
        `${what}: no restart, still on ${before.slot} (uptime ${before.uptime} -> ${after ? after.uptime : "?"} s, slot ${after ? after.slot : "?"})`)
      return after || before
    }

    console.log("\n1. already up to date")
    let seen = await trigger({ ...ownImage, build: hello.firmwareBuild })
    check(seen.length === 1 && seen[0].state === "up_to_date", `answered up_to_date and nothing else (${describe(seen)})`)
    state = await notRestarted(state, "1b")

    console.log("\n2. a trigger for another device")
    seen = await trigger({ ...ownImage, deviceId: "some-other-device", force: true })
    check(seen.length === 1 && seen[0].state === "error" && /some-other-device/.test(seen[0].error || ""),
      `refused before any download (${describe(seen)})`)
    state = await notRestarted(state, "2b")

    console.log("\n3. a checksum that does not match")
    seen = await trigger({ ...ownImage, sha256: "0".repeat(64), force: true })
    const states3 = seen.map((s) => s.state)
    check(states3.includes("downloading") && states3.includes("verifying") && seen[seen.length - 1].state === "error" &&
      /Checksum/.test(seen[seen.length - 1].error || ""), `downloaded, refused at verifying (${describe(seen)})`)
    state = await notRestarted(state, "3b")

    if (foreignEnv) {
      console.log(`\n4. the ${foreignEnv} build, claiming to be for ${own.device}`)
      if (!foreign || !foreign.device || foreign.device === own.device) {
        check(false, `a foreign build to send (${foreignEnv}: ${foreign ? `built for ${foreign.device}` : "missing"})`)
      } else {
        seen = await trigger({ url: `${host}/foreign.bin`, sha256: foreign.sha256, size: foreign.image.length, deviceId: own.device, force: true })
        const last = seen[seen.length - 1]
        check(last && last.state === "error" && /Not a firmware image/.test(last.error || ""),
          `refused by the marker it lacks (${describe(seen)})`)
        state = await notRestarted(state, "4b")
      }
    }

    console.log("\n5. the real thing, forced")
    const before = state
    const helloAgain = new Promise((resolve) => {
      const helloTopic = `${TOPIC_PREFIX}/${clientId}/hello`
      const timer = setTimeout(() => resolve(null), 150000)
      client.on("message", (topic, payload) => {
        if (topic === helloTopic && payload.length > 0 && Date.now() > t0 + 2000) {
          clearTimeout(timer)
          try {
            resolve(JSON.parse(payload.toString()))
          } catch {
            resolve(null)
          }
        }
      })
    })
    const t0 = Date.now()
    seen = await trigger({ ...ownImage, build: hello.firmwareBuild, force: true })
    const states5 = seen.map((s) => s.state)
    const order = ["downloading", "download_complete", "verifying", "applying", "rebooting"]
    const inOrder = order.every((s) => states5.includes(s)) &&
      order.every((s, i) => i === 0 || states5.indexOf(s) > states5.indexOf(order[i - 1]))
    check(inOrder, `downloading -> download_complete -> verifying -> applying -> rebooting (${describe(seen)})`)
    const percents = seen.filter((s) => s.state === "downloading").map((s) => s.percent)
    check(percents.length >= 5, `progress reported along the way (${percents.join(", ")})`)

    const after = await waitForBoot(base)
    check(after !== null, "5b. the board came back")
    if (after) {
      check(after.slot !== before.slot && after.md5 === before.md5,
        `5c. booted the update: ${before.slot} -> ${after.slot}, MD5 ${after.md5 === before.md5 ? "unchanged" : after.md5}`)
      check(after.reset === "software", `5d. restarted by software (was ${after.reset})`)
    }
    const newHello = await helloAgain
    client.subscribe(`${TOPIC_PREFIX}/${clientId}/hello`)
    check(newHello && newHello.firmwareBuild === hello.firmwareBuild, `5e. hello again, announcing ${newHello ? newHello.firmwareBuild : "nothing"}`)

    console.log("\n6. nothing left behind")
    await sleep(20000)
    const retained = await new Promise((resolve) => {
      const probe = mqtt.connect(brokerUrl, { reconnectPeriod: 0 })
      let payload = null
      probe.on("connect", () => probe.subscribe(firmwareTopic))
      probe.on("message", (topic, p) => {
        if (topic === firmwareTopic) payload = p.toString()
      })
      setTimeout(() => {
        probe.end(true)
        resolve(payload)
      }, 2500)
    })
    check(retained === null || retained === "", `the retained trigger is cleared (${retained ? retained : "none"})`)
    if (after) {
      const later = await readBoot(base)
      check(later && later.slot === after.slot && later.uptime > after.uptime,
        `no second update ran (slot ${later ? later.slot : "?"}, uptime ${after.uptime} -> ${later ? later.uptime : "?"} s)`)
    }
  } finally {
    server.close()
    client.end(true)
  }

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - firmware updates over MQTT work on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
