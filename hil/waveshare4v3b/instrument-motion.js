// A styled needle swinging on the board (designer docs/2026-11-23-instrument-
// styles.md «Motion», device contract §2.15, tasks/instrument-styles-todo.md
// I9): a 400 px fuel gauge goes from 0 to 100 with its spring, and
//
//   1. the swing is drawn at the board's frame rate or more (minFpsFor:
//      25, the RGB-panel boards 12),
//   2. the board answers its web interface all the while (a value or a tap
//      must not wait for the needle),
//   3. it comes to rest on exactly the picture the same gauge draws at 100
//      without a swing (motion direct) - the transient is the board's own,
//      the resting picture is the contract's.
//
//   node -r ./hil/device-auth.js hil/waveshare4v3b/instrument-motion.js --device 192.168.1.117
//
// Needs the designer (DESIGNER_URL, default localhost:3000) and the HIL
// broker (HIL_BROKER_URL, default localhost:1883). Exit 2: skipped.

const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = `${require("../device-tag").deviceTag()}-${Date.now().toString(36)}`
const TOPIC = `hil-instrument-${RUN}/fuel`
// The frame rate a board must reach (the user, 2026-11-23): 25 where the
// canvas lives in internal memory's reach (knob, T-Encoder: 30+ measured);
// 12 on the RGB-panel boards, whose canvas is PSRAM the panel scans from
// (4.3B 13.9, 4" 15.2 measured) - accepted as it is.
const minFpsFor = (ddf) => (/waveshare-touch-lcd-(4|4v3b|7)\b/.test(ddf.deviceId || "") ? 12 : 25)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : null
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

function project(ddf, stamp, motion) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-instrument-${RUN}` })
  const side = Math.min(400, ddf.screen.height - 40, ddf.screen.width - 40)
  project.name = "HIL instrument motion"
  project.fonts = ddf.fonts
  project.topics = [{ id: "fuel", topic: TOPIC, type: "numeric", examples: ["0"] }]
  project.combinedTopics = []
  project.screens = [
    {
      id: stamp,
      name: "Motion",
      backgroundColor: "#ffffff",
      objects: [
        {
          id: "fuel",
          type: "gauge",
          zIndex: 1,
          x: Math.round((ddf.screen.width - side) / 2),
          y: Math.round((ddf.screen.height - side) / 2),
          width: side,
          height: side,
          properties: {
            topic: TOPIC,
            calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }],
            style: "fuel",
            zones: [{ from: 0, to: 12, kind: "danger" }],
            ...(motion === "direct" ? { motion: "direct" } : {}),
          },
        },
      ],
    },
  ]
  return project
}

async function buildZip(p) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    return Buffer.from(await page.evaluate((x) => window.__buildDeviceZipForTest(x), p), "base64")
  } finally {
    await browser.close()
  }
}

async function install(base, ddf, zip, stamp) {
  const form = new FormData()
  form.append("file", new Blob([zip]), "project.zip")
  await fetch(ddf.testInterface.uploadUrl, { method: "POST", body: form, signal: AbortSignal.timeout(30000) }).catch(() => {})
  const deadline = Date.now() + 180000
  for (;;) {
    const r = await get(`${base}/api/device-settings`, 5000).catch(() => ({ status: 0, body: "" }))
    if (r.status === 200 && r.body.includes(stamp)) return
    if (Date.now() > deadline) throw new Error("the board did not come back with the project within 180 s")
    await sleep(2000)
  }
}

// The board's own account (/api/debug): frames so far, the worst, and its
// last whole swing - measured where it happens, so the check need not poll
// the board while the needle moves (polling every 150 ms itself slowed the
// 4.3B's loop, I9's first run).
async function wake(base) {
  const touch = (down) => fetch(`${base}/api/touch?x=4&y=4&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
  await touch(true)
  await sleep(80)
  await touch(false)
  await sleep(1200)
}

async function waitForValue(base, wanted) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const r = await get(`${base}/api/topic-values?topics=${encodeURIComponent(TOPIC)}`, 5000).catch(() => null)
    try {
      if (r && String(JSON.parse(r.body)?.[TOPIC]) === wanted) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`the board never had ${TOPIC} = ${wanted}`)
}

const framesOf = (debug) => {
  const m = /instrument frames (\d+), worst ([\d.]+) ms(?: \([^)]*\))?, last swing (\d+) frames in (\d+) ms( \(swinging\))?/.exec(debug)
  return m ? { frames: Number(m[1]), worst: Number(m[2]), swingFrames: Number(m[3]), swingMs: Number(m[4]), swinging: Boolean(m[5]) } : null
}

async function snapshot(base) {
  const res = await fetch(`${base}/panel.bmp`, { signal: AbortSignal.timeout(20000) })
  return Buffer.from(await res.arrayBuffer())
}

async function main() {
  const device = arg("--device")
  if (!device) {
    console.error("usage: node -r ./hil/device-auth.js hil/waveshare4v3b/instrument-motion.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  const debug0 = await get(`${base}/api/debug`, 4000).catch(() => null)
  if (!debug0 || debug0.status !== 200) {
    console.warn(`SKIPPED - no board at ${base}`)
    process.exit(2)
  }
  if (!framesOf(debug0.body)) {
    console.warn(`SKIPPED - ${device} reports no instrument frames: a firmware without the swing`)
    process.exit(2)
  }
  const ddf = await loadDdf(device)
  const MIN_FPS = minFpsFor(ddf)
  if (!(ddf.raw?.supportedFeatures ?? []).includes("instrument-styles")) {
    console.warn(`SKIPPED - ${device} does not declare instrument-styles`)
    process.exit(2)
  }
  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const publish = (v) => new Promise((r) => client.publish(TOPIC, v, { retain: true }, r))
  const results = []
  const check = (name, ok, detail) => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }
  try {
    console.log(`instrument motion on ${device}`)
    await publish("0")
    const swingStamp = `motion-${RUN}`
    await install(base, ddf, await buildZip(project(ddf, swingStamp, "style")), swingStamp)
    // The needle must stand at 0 before 100 can swing it: wait until the
    // board has the value, then a little for its first picture (the 4.3B
    // needs longer after an install than the knob).
    await waitForValue(base, "0")
    await sleep(3000)
    // A dark panel swings nothing (it blanks after 15 s on the 4.3B): a tap
    // on the empty corner wakes it, and the swing is over well before it
    // would blank again.
    await wake(base)

    await publish("100")
    // While it swings, only the cheap topic endpoint, twice a second: does
    // the board still answer?
    let worstAnswer = 0
    const t0 = Date.now()
    while (Date.now() - t0 < 8000) {
      const a0 = Date.now()
      await get(`${base}/api/topic-values?topics=${encodeURIComponent(TOPIC)}`, 5000).catch(() => null)
      worstAnswer = Math.max(worstAnswer, Date.now() - a0)
      await sleep(500)
    }
    let after = framesOf((await get(`${base}/api/debug`)).body)
    for (let i = 0; i < 10 && after.swinging; i++) {
      await sleep(1000)
      after = framesOf((await get(`${base}/api/debug`)).body)
    }
    const fps = after.swingMs > 0 ? (after.swingFrames * 1000) / after.swingMs : 0
    check(`1. the swing is drawn at ${MIN_FPS} fps or more`, !after.swinging && after.swingFrames > 10 && fps >= MIN_FPS, `${after.swingFrames} frames in ${after.swingMs} ms = ${fps.toFixed(1)} fps, worst frame ${after.worst} ms`)
    check("2. the board answers while the needle swings", worstAnswer < 1500, `slowest answer ${worstAnswer} ms`)
    await sleep(1000)
    const swung = await snapshot(base)

    const directStamp = `direct-${RUN}`
    await install(base, ddf, await buildZip(project(ddf, directStamp, "direct")), directStamp)
    await waitForValue(base, "100")
    await sleep(3000)
    await wake(base)
    const direct = await snapshot(base)
    let differing = 0
    for (let i = 54; i < Math.min(swung.length, direct.length); i++) if (swung[i] !== direct[i]) differing++
    check("3. at rest it is the picture drawn without a swing", swung.length === direct.length && differing === 0, `${differing} bytes differ`)
  } finally {
    client.end()
  }
  const failed = results.filter((r) => !r).length
  console.log(failed ? `FAIL - ${failed} of ${results.length}` : `PASS - instrument motion on ${device}`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})
