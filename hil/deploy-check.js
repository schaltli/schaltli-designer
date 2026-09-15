// Proves the MQTT project deploy - what "Deploy to Device" in the designer
// does - on any board with the shared test interface, and that the project
// really landed.
//
// Until 2026-09-15 this lived as hil/waveshare/deploy-check.js and knew one
// board: the knob's device id and a fixture built for it. The 4.3B and the
// PaperS3 had never been deployed to over MQTT by any test - every other
// suite installs over HTTP (POST /api/project) and never reaches
// DeployManager - and both run the deploy inside the MQTT callback, which
// the knob's own firmware warns loses status publishes. A release could not
// be cut on that.
//
// It builds the project from the board's own DDF, exactly as conformance
// does (hil/conformance/build-project.js: one screen, one specimen), and
// exports it through the designer's real export in a browser, so what is
// deployed is what the Deploy dialog would send. The screen gets an id new to
// every run: a board still running an earlier project - this test's own from
// the day before included - cannot then pass for one that installed this one.
//
// Serves the zip from this machine, publishes the retained deploy trigger the
// dialog publishes, and asserts
//
//   1. downloading -> download_complete -> verifying -> applying ->
//      rebooting, in that order, with progress, and no error
//   2. the board comes back, restarted by software
//   3. it runs exactly the deployed screen (/api/device-settings)
//   4. the retained trigger is gone, and no second deploy ran
//
// Run: node hil/deploy-check.js --device <ip>
// Needs the dev server (npm run dev) and the broker (npm run hil:broker).
// Exit 0 pass, 1 fail, 2 device, designer or broker not reachable (skipped,
// loudly).

const http = require("http")
const zlib = require("zlib")
const crypto = require("crypto")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")
const { sleep, get, readBoot, lanAddress } = require("./firmware-common")

const TOPIC_PREFIX = "screenbee"
const HTTP_PORT = Number(process.env.HIL_DEPLOY_PORT || 8899)
const DESIGNER_URL = process.env.HIL_DESIGNER_URL || "http://localhost:3000/test-render"
const brokerUrl = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
// The simplest specimens, in order of preference: this is about the deploy,
// not about drawing, so anything every board declares will do.
const PREFERRED_TYPES = ["label", "box", "line"]

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  if (!args.device) {
    console.error("usage: node hil/deploy-check.js --device <ip>")
    process.exit(1)
  }
  return args
}

function skip(message) {
  console.warn(`SKIPPED - ${message}`)
  process.exit(2)
}

async function installedScreens(base) {
  const r = await get(`${base}/api/device-settings`, 5000)
  if (r.status !== 200) return null
  return (JSON.parse(r.body).screens || []).map((s) => s.id)
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`

  let before
  try {
    before = await readBoot(base, 5000)
  } catch (e) {
    skip(`${device} not reachable (${e.message})`)
  }

  let ddf
  try {
    ddf = await loadDdf(device)
  } catch (e) {
    skip(`could not load ${device}'s DDF (${e.message})`)
  }
  const type = PREFERRED_TYPES.find((t) => ddf.supportedObjectTypes.includes(t))
  if (!type) {
    console.error(`FAIL - ${ddf.deviceId} declares none of ${PREFERRED_TYPES.join(", ")}`)
    process.exit(1)
  }
  const { project } = buildProject({ ...ddf, supportedObjectTypes: [type] }, { topicPrefix: "hil-deploy" })
  const screenId = `screen-deploy-${crypto.randomBytes(4).toString("hex")}`
  project.screens[0].id = screenId
  project.screens[0].name = `deploy ${screenId.slice(-8)}`
  project.name = `${ddf.deviceName} deploy check`
  // With its DDF inside, as every project the designer deploys carries one -
  // and the board keeps the deployed zip as its recovery copy. Conformance
  // leaves the DDF out on purpose, for throwaway installs over HTTP that never
  // become a recovery copy; a deploy does. Without it the knob's smoke
  // verifier failed "it carries its own DDF" on 2026-09-15, reading the copy
  // this test had left behind.
  project.embeddedDdfZipBase64 = ddf.zipBase64

  const client = mqtt.connect(brokerUrl, { connectTimeout: 5000, reconnectPeriod: 0 })
  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
      setTimeout(() => reject(new Error("timed out")), 6000)
    })
  } catch (e) {
    skip(`MQTT broker not reachable at ${brokerUrl} (${e.message}); start it with npm run hil:broker`)
  }

  let zip
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    try {
      await page.goto(DESIGNER_URL, { waitUntil: "domcontentloaded", timeout: 180000 })
      await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 180000 })
    } catch (e) {
      client.end(true)
      skip(`the designer's test render page is not reachable at ${DESIGNER_URL} (${e.message.split("\n")[0]}); start it with npm run dev`)
    }
    // The device's own fonts, as conformance does: the export needs them to
    // bake the screen, the board already has them.
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), { ...project, fonts: ddf.fonts })
    zip = Buffer.from(base64, "base64")
  } finally {
    await browser.close()
  }
  const crc32 = zlib.crc32(zip) >>> 0

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length })
    res.end(zip)
  })
  await new Promise((resolve) => server.listen(HTTP_PORT, "0.0.0.0", resolve))
  const url = `http://${lanAddress()}:${HTTP_PORT}/project.zip`

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  try {
    const clientId = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no hello from ${device} on the broker within 15s`)), 15000)
      client.on("message", function onHello(topic, payload) {
        const m = topic.match(/^screenbee\/([^/]+)\/hello$/)
        if (!m || payload.length === 0) return
        try {
          const hello = JSON.parse(payload.toString())
          if (hello.url && hello.url.startsWith(`${base}/`)) {
            clearTimeout(timer)
            client.removeListener("message", onHello)
            resolve(m[1])
          }
        } catch {}
      })
      client.subscribe(`${TOPIC_PREFIX}/+/hello`)
    })
    console.log(`${device} is ${clientId} (${ddf.deviceId}); deploying one ${type} screen as ${screenId}, ${zip.length} bytes`)

    const deployTopic = `${TOPIC_PREFIX}/${clientId}/deploy`
    const deployId = `hil-deploy-${crypto.randomBytes(4).toString("hex")}`
    const seen = []
    await new Promise((resolve) => client.subscribe(`${TOPIC_PREFIX}/${clientId}/deploy-status`, resolve))
    client.on("message", (topic, payload) => {
      if (!topic.endsWith("/deploy-status") || payload.length === 0) return
      try {
        const s = JSON.parse(payload.toString())
        if (s.deployId === deployId) seen.push(s)
      } catch {}
    })

    client.publish(deployTopic, JSON.stringify({ deployId, url, crc32 }), { retain: true, qos: 1 })
    const deadline = Date.now() + 120000
    while (Date.now() < deadline && !seen.some((s) => ["rebooting", "error", "busy"].includes(s.state))) await sleep(250)

    const states = seen.map((s) => s.state)
    const describe = seen.map((s) => (s.state === "downloading" ? `downloading ${s.percent}%` : s.error ? `${s.state} "${s.error}"` : s.state)).join(", ")
    const order = ["downloading", "download_complete", "verifying", "applying", "rebooting"]
    const inOrder = order.every((s) => states.includes(s)) &&
      order.every((s, i) => i === 0 || states.indexOf(s) > states.indexOf(order[i - 1]))
    check(inOrder && !states.includes("error"), `1. ${order.join(" -> ")} (${describe || "nothing arrived"})`)

    // Back, and running this deploy's screen - not merely answering.
    let after = null
    let screens = null
    const backBy = Date.now() + 120000
    await sleep(4000)
    while (Date.now() < backBy) {
      try {
        after = await readBoot(base, 4000)
        screens = await installedScreens(base)
        if (after && screens && screens.includes(screenId)) break
      } catch {}
      await sleep(2000)
    }
    check(after !== null, "2. the board came back")
    if (after) check(after.reset === "software", `2b. restarted by software (was ${after.reset})`)
    check(screens !== null && screens.length === 1 && screens[0] === screenId,
      `3. running exactly the deployed screen (${screens ? `[${screens.join(", ")}]` : "no screen list"})`)

    await sleep(15000)
    const retained = await new Promise((resolve) => {
      const probe = mqtt.connect(brokerUrl, { reconnectPeriod: 0 })
      let payload = null
      probe.on("connect", () => probe.subscribe(deployTopic))
      probe.on("message", (topic, p) => {
        if (topic === deployTopic) payload = p.toString()
      })
      setTimeout(() => {
        probe.end(true)
        resolve(payload)
      }, 2500)
    })
    check(retained === null || retained === "", `4. the retained trigger is cleared (${retained ? retained : "none"})`)
    if (after) {
      const later = await readBoot(base, 5000).catch(() => null)
      check(later && later.uptime >= after.uptime, `4b. no second deploy ran (uptime ${after.uptime} -> ${later ? later.uptime : "?"} s)`)
    }
  } finally {
    server.close()
    client.end(true)
  }

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - an MQTT deploy lands on ${device}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
