#!/usr/bin/env node
// Popups on a board (docs/2026-10-06-popup-screens.md, docs/device-contract.md
// 2.5): opened by a tap on a button, the screen underneath set back outside
// the fence, the popup's controls working, and closed by a tap beside it, by a
// swipe that does not page, and by its own button - each time with the screen
// underneath back exactly as it was.
//
// One project, the same on every board, laid out from the fence the designer
// exports for it: a main screen with an «Open a popup» button and a coloured
// mark outside the fence, a second main screen a leftward swipe pages to, and
// a popup with a button group, a settable slider and a «Close this popup»
// button.
//
//   node hil/popup.js --device 192.168.1.117   # the 4.3B
//   node hil/popup.js --device 192.168.1.114   # the knob
//   node hil/popup.js --device 192.168.1.118   # the PaperS3
//
// How the screen underneath is set back is the board's (contract 2.5): an RGB
// board halves it, which is checked on the mark; the PaperS3 leaves it and
// draws a shadow, which is checked as "the mark unchanged". Needs the designer
// dev server and the HIL broker (`npm run hil:broker`), with the board pointed
// at it. Exits 2 with SKIPPED when the board is not reachable.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const JSZip = require("jszip")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { comparePixels } = require("./report-template")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "popup-report")
const POPUP_GENERATION = [1, 3]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
  return args
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

// The objects the conformance run already proves on every board, taken from
// there rather than written again here.
function specimen(project, type, idPart) {
  for (const screen of project.screens) {
    for (const o of screen.objects) if (o.type === type && (!idPart || o.id.includes(idPart))) return JSON.parse(JSON.stringify(o))
  }
  throw new Error(`no ${type} specimen in the conformance project`)
}

// Where the popup's content goes: the fence, or on a round display the square
// inside its circle.
function innerBox(fence) {
  if (fence.shape !== "circle") return { x: fence.x, y: fence.y, w: fence.width, h: fence.height }
  const side = Math.floor(fence.width / Math.SQRT2)
  return { x: fence.x + Math.round((fence.width - side) / 2), y: fence.y + Math.round((fence.height - side) / 2), w: side, h: side }
}

async function main() {
  const { device } = parseArgs(process.argv)
  if (!device) {
    console.error("usage: node hil/popup.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const ddf = await loadDdf(device)
  const { project: specimens } = buildProject(ddf, { topicPrefix: "hil-popup" })
  const { project } = buildProject(ddf, { topicPrefix: "hil-popup" })
  const { width: sw, height: sh } = ddf.screen
  const round = ddf.screen.shape === "round"
  const eink = /papers3/i.test(ddf.deviceId || "")
  project.settings.screenShape = round ? "round" : "rect"
  const stamp = Date.now().toString(36)

  // The fence the designer will export, worked out the same way
  // (lib/popup.ts popupFence) to place the popup's objects in it; the export's
  // own is what the checks use.
  const k = Math.sqrt(0.8)
  const planned = round
    ? (() => {
        const d = Math.round(Math.min(sw, sh) * k)
        return { shape: "circle", x: Math.round((sw - d) / 2), y: Math.round((sh - d) / 2), width: d, height: d }
      })()
    : { shape: "rect", x: Math.round((sw - Math.round(sw * k)) / 2), y: Math.round((sh - Math.round(sh * k)) / 2), width: Math.round(sw * k), height: Math.round(sh * k) }
  const inner = innerBox(planned)
  const at = (fx, fy, fw, fh) => ({
    x: Math.round(inner.x + inner.w * fx),
    y: Math.round(inner.y + inner.h * fy),
    width: Math.round(inner.w * fw),
    height: Math.round(inner.h * fh),
  })

  const group = { ...specimen(specimens, "button-group"), id: "popup-group", zIndex: 1, ...at(0.1, 0.05, 0.8, 0.2) }
  const slider = { ...specimen(specimens, "slider", "plain"), id: "popup-slider", zIndex: 2, ...at(0.1, 0.48, 0.8, 0.12) }
  const buttonBase = specimen(specimens, "button")
  const closeButton = {
    ...buttonBase,
    id: "popup-close",
    zIndex: 3,
    ...at(0.3, 0.75, 0.4, 0.2),
    properties: { ...buttonBase.properties, text: "OK", action: { type: "close-popup" } },
  }
  // On the main screen, where the popup has nothing: a tap there with the
  // popup open must not reach it.
  const openButton = {
    ...buttonBase,
    id: "open-popup",
    zIndex: 1,
    ...at(0.3, 0.28, 0.4, 0.16),
    properties: { ...buttonBase.properties, text: "Timer", action: { type: "open-popup", targetScreenId: `popup-${stamp}` } },
  }
  // A mark outside the fence, to see what happens to the screen underneath.
  const mark = {
    id: "mark",
    type: "box",
    zIndex: 1,
    x: 4,
    y: 4,
    width: round ? 30 : Math.max(8, planned.x - 8),
    height: round ? 30 : Math.max(8, planned.y - 8),
    properties: { fillColor: "#40c080", strokeColor: "#40c080", strokeWidth: 1, cornerRadius: 0 },
  }

  project.name = "HIL popups"
  project.assets = specimens.assets
  project.topics = [
    { id: "g", topic: group.properties.topic, type: "text", examples: ["0"] },
    { id: "l", topic: slider.properties.topic, type: "numeric", examples: ["20"] },
    { id: "s", topic: slider.properties.setpointTopic, type: "numeric", examples: ["20"] },
  ]
  project.hardwareButtons = [{ id: "swipe-left", name: "Swipe Left" }]
  project.screens = [
    {
      id: `main-${stamp}`,
      name: "Main",
      backgroundColor: "#ffffff",
      buttonActions: { "swipe-left": { type: "next-screen" } },
      objects: [mark, openButton],
    },
    { id: `second-${stamp}`, name: "Second", backgroundColor: "#203040", objects: [] },
    { id: `popup-${stamp}`, name: "Timer", screenType: "popup", showMaster: false, backgroundColor: "#f0f0f0", objects: [group, slider, closeButton] },
  ]

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })

  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const browser = await chromium.launch()
  try {
    // The board says it opens popups.
    const hello = await new Promise((resolve) => {
      const found = []
      const onMessage = (topic, payload) => {
        try {
          const h = JSON.parse(payload.toString())
          if (String(h.url || "").includes(`//${device}`)) found.push(h)
        } catch {}
      }
      client.on("message", onMessage)
      client.subscribe("schaltli/+/hello")
      setTimeout(() => {
        client.removeListener("message", onMessage)
        client.unsubscribe("schaltli/+/hello")
        resolve(found[0])
      }, 2500)
    })
    const generation = String(hello?.systemGeneration ?? "")
    const [maj, min] = generation.split(".").map(Number)
    check(
      `announces generation ${POPUP_GENERATION.join(".")} or newer`,
      maj > POPUP_GENERATION[0] || (maj === POPUP_GENERATION[0] && min >= POPUP_GENERATION[1]),
      `hello says "${generation}"`,
    )

    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
    const zipBuffer = Buffer.from(base64, "base64")
    const exported = JSON.parse(await (await JSZip.loadAsync(zipBuffer)).file("project.json").async("string"))
    const fence = exported.popupFence
    if (!fence || !exported.popups?.length) throw new Error("the export has no popup - is the designer on the popup build?")
    const contains = (x, y) =>
      fence.shape === "circle"
        ? (2 * x - (2 * fence.x + fence.width)) ** 2 + (2 * y - (2 * fence.y + fence.height)) ** 2 <= fence.width ** 2
        : x >= fence.x && x < fence.x + fence.width && y >= fence.y && y < fence.y + fence.height

    const zipPath = path.join(os.tmpdir(), "hil-popup.zip")
    fs.writeFileSync(zipPath, zipBuffer)
    console.log("installing a screen with a popup ...")
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl} (curl exit ${err.status})`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(`main-${stamp}`)) break
      } catch {}
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project within 180 s")
      await sleep(3000)
    }
    await sleep(3000)

    const touch = async (x, y, down) => {
      const r = await fetch(`${base}/api/touch?x=${Math.round(x)}&y=${Math.round(y)}&down=${down ? 1 : 0}`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
    }
    const tap = async (x, y) => {
      await touch(x, y, true)
      await sleep(60)
      await touch(x, y, false)
      await sleep(eink ? 2500 : 1200)
    }
    const drag = async (x0, y0, x1, y1, steps = 6) => {
      for (let i = 0; i <= steps; i++) {
        await touch(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, true)
        await sleep(40)
      }
      await touch(x1, y1, false)
      await sleep(eink ? 2500 : 1200)
    }
    const centre = (o) => [o.x + o.width / 2, o.y + o.height / 2]
    let shots = 0
    const snapshot = async (name) => {
      const buf = Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
      const file = path.join(OUT_DIR, `${String(++shots).padStart(2, "0")}-${name}.bmp`)
      fs.writeFileSync(file, buf)
      return Jimp.read(file)
    }
    const rgb = (img, x, y) => {
      const i = (Math.round(y) * img.bitmap.width + Math.round(x)) * 4
      return [img.bitmap.data[i], img.bitmap.data[i + 1], img.bitmap.data[i + 2]]
    }
    const popupState = async () => (/popup: ([^\n]*)/.exec((await get(`${base}/api/debug`)).body) || [, "?"])[1]
    const heard = (topic, timeoutMs = 8000) =>
      new Promise((resolve) => {
        const got = []
        const onMessage = (t, payload) => {
          if (t === topic) got.push(payload.toString())
        }
        client.on("message", onMessage)
        client.subscribe(topic)
        setTimeout(() => {
          client.removeListener("message", onMessage)
          client.unsubscribe(topic)
          resolve(got)
        }, timeoutMs)
      })

    // A first touch on a blanked panel only wakes it; this one lands on the
    // mark, which takes no taps.
    await tap(...centre(mark))
    await fetch(`${base}/api/screen`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "index=0" })
    await sleep(eink ? 3000 : 1500)
    const underneath = await snapshot("screen")
    const markBefore = rgb(underneath, ...centre(mark))
    const insideEmpty = centre(openButton)  // inside the fence, nothing of the popup's there

    const opened = async (label) => {
      await tap(...centre(openButton))
      const state = await popupState()
      const img = await snapshot(`open-${label}`)
      return { state, img }
    }
    const backToScreen = async (label) => {
      const img = await snapshot(`closed-${label}`)
      const { dimensionMismatch, diffPixels } = comparePixels(img, underneath)
      return { state: await popupState(), diff: dimensionMismatch ? "dimension mismatch" : `${diffPixels} px differ`, same: !dimensionMismatch && diffPixels === 0 }
    }

    // Open: the popup inside the fence, the screen underneath set back.
    let { state, img } = await opened("tap")
    check("a tap on «Open a popup» opens it", /^open/.test(state), state)
    const ground = rgb(img, ...centre({ ...group, y: group.y + group.height + 4, height: 2 }))
    check("inside the fence, the popup's background", ground.every((c, i) => Math.abs(c - [0xf0, 0xf0, 0xf0][i]) <= 8), `rgb ${ground}`)
    const markNow = rgb(img, ...centre(mark))
    if (eink) {
      check("outside the fence, the screen underneath stays (e-ink: no scrim)", markNow.every((c, i) => Math.abs(c - markBefore[i]) <= 16), `rgb ${markBefore} -> ${markNow}`)
    } else {
      check("outside the fence, the screen underneath at half", markNow.every((c, i) => Math.abs(c - (markBefore[i] >> 1)) <= 8), `rgb ${markBefore} -> ${markNow}`)
    }

    // The popup's own controls.
    const groupTopic = group.properties.writeTopic
    const groupHeard = heard(groupTopic)
    await tap(group.x + group.width * 0.75, group.y + group.height / 2)
    const groupValues = await groupHeard
    check("a tap on the popup's button group publishes", groupValues.includes(group.properties.states[1].writeValue), `heard ${JSON.stringify(groupValues)} on ${groupTopic}`)

    const sliderHeard = heard(slider.properties.writeTopic)
    await drag(slider.x + slider.width * 0.15, slider.y + slider.height / 2, slider.x + slider.width * 0.85, slider.y + slider.height / 2)
    const sliderValues = await sliderHeard
    check("a drag on the popup's slider publishes", sliderValues.length > 0, `heard ${JSON.stringify(sliderValues)}`)
    state = await popupState()
    check("... and leaves the popup open", /^open/.test(state), state)

    // Where «Open a popup» is on the screen underneath: had the tap reached it,
    // the popup would have been opened again, and the board's "last" says so.
    const beforeEmptyTap = await popupState()
    await tap(...insideEmpty)
    state = await popupState()
    check("a tap on the popup where it has nothing does not reach the screen underneath", /^open/.test(state) && state === beforeEmptyTap, `${beforeEmptyTap} -> ${state}`)

    // Closing, three ways, each back to the screen exactly.
    // Halfway between the display's left edge and the fence, at mid height.
    const outside = [Math.round(fence.x / 2), Math.round(sh / 2)]
    check("the point used as «beside the popup» is outside the fence", !contains(...outside), `(${outside})`)
    await tap(...outside)
    let back = await backToScreen("tap-outside")
    check("a tap beside the popup closes it", /^none open/.test(back.state), back.state)
    check("... and the screen underneath is back as it was", back.same, back.diff)

    await opened("swipe")
    const swipeY = slider.y + slider.height + Math.round(inner.h * 0.06)
    await drag(inner.x + inner.w * 0.85, swipeY, inner.x + inner.w * 0.15, swipeY)
    back = await backToScreen("swipe")
    check("a swipe on the popup closes it", /^none open/.test(back.state), back.state)
    check("... does not page, and the screen underneath is back as it was", back.same, back.diff)

    await opened("button")
    await tap(...centre(closeButton))
    back = await backToScreen("button")
    check("«Close this popup» closes it", /^none open/.test(back.state), back.state)
    check("... and the screen underneath is back as it was", back.same, back.diff)
  } finally {
    await browser.close()
    client.end()
  }

  const failures = results.filter((ok) => !ok).length
  if (failures > 0) {
    console.error(`FAIL - ${failures} check(s); pictures in ${path.relative(process.cwd(), OUT_DIR)}`)
    process.exit(1)
  }
  console.log(`PASS - popups open, work and close on ${device}`)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
