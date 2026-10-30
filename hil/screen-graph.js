#!/usr/bin/env node
// The screen graph on a board (docs/2026-10-17-screen-graph.md, device
// contract 2.10, feature "screen-graph", generation 1.9).
//
// Installs a master with a navigator on its left edge and swipes left and
// right bound to next and previous, and under it the main row A, B, C with
// a hidden H between A and B; A1 lies below A, C1 below C, and C binds its
// own swipe up to an MQTT message, which cuts C1 off. Then walks it the way a
// hand does, through /api/touch, holding every picture to the designer's at
// 0 px - pull tabs, the navigator's way back and all:
//
//   - the board starts on A, the main row's first, tabs on the right, on
//     the left (the row is a ring) and below
//   - a swipe up on A brings A1 up from below while the strip stands still
//   - A1 shows the way back in the navigator and a tab on top; a tap on the
//     way back shows A
//   - up again, then down: A again
//   - from A1 a swipe left goes on in the row from A, past the hidden H: B
//   - on C, whose own swipe up sends a message: no tab below, and a swipe up
//     publishes it and stays
//
// On the PaperS3 (found from its DDF) gestures act on release and nothing
// follows the finger: the mid-swipe check is left out.
//
//   node hil/screen-graph.js --device 192.168.1.117
//
// Needs the designer dev server and the HIL broker (`npm run hil:broker`),
// with the board pointed at it. Exits 2 with SKIPPED when the board is not
// reachable, or does not declare screen-graph - hardware suites say so out
// loud, see hil/README.md.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { comparePixels } = require("./report-template")
const { loadDdf } = require("./conformance/ddf")
const { deviceTag } = require("./device-tag")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "screen-graph-report", deviceTag())

const RUN = Date.now().toString(36)
const SENT = `hil-graph-${RUN}/sent`
const id = (name) => `graph-${RUN}-${name}`

const svg = (d) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`).toString("base64")
const SQUARE = svg("M4 4h16v16H4z")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

async function get(url, timeoutMs = 10000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: r.status, body: await r.text() }
}

function graphProject(ddf) {
  const withNavigator = ddf.supportedObjectTypes.includes("navigator")
  const { width: sw, height: sh, colorDepth } = ddf.screen
  const fonts = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const big = fonts[fonts.length - 1]
  const small = fonts[Math.floor(fonts.length * 0.3)]
  const navigator = {
    id: "nav",
    type: "navigator",
    x: 0,
    y: 0,
    width: 80,
    height: sh,
    zIndex: 50,
    // Icons and names: a strip 80 wide, as the object says (hil/navigator.js).
    properties: { edge: "left", shows: "iconsAndText", fontId: small.id, backgroundColor: "#202020", borderColor: "#ff8000", textColor: "#c0c0c0", activeColor: "#4060ff", activeTextColor: "#ffffff" },
  }
  const label = (text) => ({
    id: "label",
    type: "text",
    zIndex: 1,
    x: Math.round(sw * 0.3),
    y: Math.round(sh * 0.4),
    width: Math.round(sw * 0.5),
    height: big.size || 40,
    properties: { text, fontId: big.id, textColor: "#ffffff", backgroundColor: "#000000", borderColor: "#000000", textAlign: "left" },
  })
  const screen = (name, more = {}) => ({
    id: id(name),
    name,
    masterScreenId: "m",
    backgroundColor: "#000000",
    iconAssetId: "square",
    objects: [label(`Screen ${name}`)],
    ...more,
  })
  const project = {
    name: "HIL screen graph",
    screenWidth: sw,
    screenHeight: sh,
    // The page icons too, where the device wants them (the knob's hints and
    // map show them), as a project made from its description has it.
    settings: {
      colorDepth,
      deviceId: ddf.deviceId,
      supportedObjectTypes: ddf.supportedObjectTypes,
      ...(ddf.raw.needsPageIconsInSize ? { needsPageIconsInSize: ddf.raw.needsPageIconsInSize } : {}),
    },
    fonts: ddf.fonts,
    assets: [{ id: "square", name: "square", type: "icon", data: SQUARE }],
    topics: [{ id: "sent", topic: SENT, type: "text", examples: [""] }],
    combinedTopics: [],
    // All four swipes among the project's buttons: without them the export
    // writes no swipe action.
    hardwareButtons: ["swipe-left", "swipe-right", "swipe-up", "swipe-down"].map((b) => ({ id: b, name: b })),
    screens: [
      {
        id: "m",
        name: "Master",
        isMaster: true,
        backgroundColor: "#000000",
        buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" } },
        // The knob has no navigator (its description does not list one).
        objects: withNavigator ? [navigator] : [],
      },
      screen("A"),
      screen("H", { hidden: true }),
      screen("B"),
      screen("C", { buttonActions: { "swipe-up": { type: "send-mqtt", mqttTopic: SENT, mqttMessage: "from C" } } }),
      screen("A1", { dock: { screenId: id("A"), edge: "down" } }),
      screen("C1", { dock: { screenId: id("C"), edge: "down" } }),
    ],
  }
  // The designer's reference draws a screen alone (test-render does not merge
  // masters): each screen with the master's navigator among its own, the
  // master kept for its swipes, which the pull tabs follow.
  const reference = { ...project, screens: project.screens.map((s) => (s.isMaster || !withNavigator ? s : { ...s, objects: [...s.objects, navigator] })) }
  return { project, reference, withNavigator }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/screen-graph.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  const ddf = await loadDdf(args.device)
  if (!ddf.pullTabs) {
    console.warn(`SKIPPED - ${args.device} does not declare screen-graph`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const eink = /papers3/i.test(ddf.deviceId || "")
  const { project, reference, withNavigator } = graphProject(ddf)
  const strip = withNavigator ? 80 : 0
  const { width: sw, height: sh } = ddf.screen

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const heard = []
  client.on("message", (topic, payload) => {
    if (topic === SENT) heard.push(payload.toString())
  })
  await new Promise((resolve) => client.subscribe(SENT, () => resolve()))

  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    page.on("pageerror", (e) => console.error("[page error]", e.message))
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
    const zipPath = path.join(os.tmpdir(), `hil-screen-graph-${deviceTag()}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    console.log("installing A, (H), B, C with A1 below A and C1 below C ...")
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl} (curl exit ${err.status})`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(id("A1"))) break
      } catch {}
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project within 180 s")
      await sleep(3000)
    }
    await sleep(3000)

    const touch = async (x, y, down) => {
      const r = await fetch(`${base}/api/touch?x=${Math.round(x)}&y=${Math.round(y)}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
    }
    const settle = () => sleep(eink ? 2500 : 1200)
    const tap = async (x, y) => {
      await touch(x, y, true)
      await sleep(eink ? 1200 : 60)
      await touch(x, y, false)
      await settle()
    }
    const press = async (x0, y0, x1, y1, steps = 8) => {
      await touch(x0, y0, true)
      await sleep(80)
      for (let i = 1; i <= steps; i++) {
        await touch(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, true)
        await sleep(40)
      }
    }
    const drag = async (x0, y0, x1, y1) => {
      await press(x0, y0, x1, y1)
      await touch(x1, y1, false)
      await settle()
    }

    let shots = 0
    const fetchBmp = async (what, name) => {
      const buf = Buffer.from(await (await fetch(`${base}/${what}`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
      const file = path.join(OUT_DIR, `${String(++shots).padStart(2, "0")}-${name.replace(/[^\w .,()-]+/g, "_")}.bmp`)
      fs.writeFileSync(file, buf)
      return Jimp.read(file)
    }
    const expected = async (name) => {
      const screenIndex = reference.screens.findIndex((s) => s.id === id(name))
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: ddf.testInterface.snapshotQuantize || "rgb565",
        pullTabs: ddf.pullTabs,
        project: reference,
        screenIndex,
        topicOverrides: { [SENT]: "" },
      })
      const file = path.join(OUT_DIR, `${String(shots).padStart(2, "0")}-expected-${name}.png`)
      fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
      return Jimp.read(file)
    }
    const shows = async (what, name, alsoGlass = false) => {
      const want = await expected(name)
      for (const where of alsoGlass && !eink ? ["snapshot.bmp", "panel.bmp"] : ["snapshot.bmp"]) {
        const actual = await fetchBmp(where, what)
        const { dimensionMismatch, diffPixels } = comparePixels(actual, want)
        check(`${what}: ${name}${where === "panel.bmp" ? " (glass)" : ""}`, !dimensionMismatch && diffPixels === 0, dimensionMismatch ? "dimension mismatch" : `${diffPixels} px differ`)
      }
    }
    const stripPixels = (img) => {
      const out = []
      for (let y = 0; y < sh; y += 3) for (let x = 0; x < 80; x += 3) out.push(img.getPixelColor(x, y))
      return out.join(",")
    }
    const besidePixels = (img) => {
      const out = []
      for (let y = 0; y < sh; y += 3) for (let x = 120; x < sw - 40; x += 4) out.push(img.getPixelColor(x, y))
      return out.join(",")
    }
    const showScreen = async (index) => {
      const r = await fetch(`${base}/api/screen`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `index=${index}` })
      if (!(await r.json()).success) throw new Error("/api/screen failed")
      await settle()
    }
    // The device's screens are the project's less the master, in order.
    const deviceIndex = (name) => project.screens.filter((s) => !s.isMaster).findIndex((s) => s.id === id(name))

    // A panel gone dark takes the first touch to wake and nothing else.
    const wake = () => tap(sw * 0.6, sh * 0.12)
    await wake()

    await shows("starts on the main row's first, a tab on the right and below", "A")

    // Up from the middle of what moves: A1 comes up from below.
    const mx = Math.round(strip + (sw - strip) / 2)
    // Not on the knob: fetching the glass mid-swipe holds the finger still for
    // a second, which is a swipe ending in a pause - the knob opens its map
    // for it (decision 15). There the swipe is made in one go, and what it
    // brought up is checked below.
    if (!eink && withNavigator) {
      const beforeImg = await fetchBmp("snapshot.bmp", "before-swipe-up")
      await press(mx, sh * 0.8, mx, sh * 0.35, 6)
      const glass = await fetchBmp("panel.bmp", "during-swipe-up")
      check("mid-swipe up the screen beside the strip has moved", besidePixels(glass) !== besidePixels(beforeImg))
      if (withNavigator) check("... while the strip's pixels stay as they were", stripPixels(glass) === stripPixels(beforeImg))
      await touch(mx, sh * 0.35, false)
      await settle()
    } else {
      await drag(mx, sh * 0.8, mx, sh * 0.2)
    }
    await shows("a swipe up shows the screen below, the way back in the navigator, a tab on top", "A1", true)

    // The way back is the navigator's one entry.
    if (withNavigator) {
      await tap(40, 30)
      await shows("a tap on the way back shows the page", "A", true)
    } else {
      await drag(mx, sh * 0.2, mx, sh * 0.8)
      await shows("a swipe down shows the page", "A", true)
    }

    await drag(mx, sh * 0.8, mx, sh * 0.2)
    await shows("up again", "A1")
    await drag(mx, sh * 0.2, mx, sh * 0.8)
    await shows("a swipe down goes back", "A", true)

    // From the history, sideways: no neighbour there, the master's next -
    // from A's place in the row, past the hidden H.
    await drag(mx, sh * 0.2, mx, sh * 0.8)
    await drag(mx, sh * 0.8, mx, sh * 0.2)
    await shows("(up once more)", "A1")
    await drag(sw * 0.85, sh / 2, sw * 0.3, sh / 2)
    await shows("from the history, next goes on in the row past the hidden screen", "B", true)

    // C's own swipe up sends its message, and C1 has no way in from there.
    await wake()
    await showScreen(deviceIndex("C"))
    await shows("C: its own swipe up cuts C1 off - no tab below", "C")
    heard.length = 0
    await drag(mx, sh * 0.8, mx, sh * 0.2)
    await sleep(1000)
    check("a swipe up on C publishes its message", heard.includes("from C"), JSON.stringify(heard))
    await shows("... and stays on C", "C")

    // The knob, which has no navigator, shows where a swipe leads while it is
    // made, and opens the graph as a map on a swipe that ends in a pause
    // (decisions 6 and 15; tasks/graph-knob-map-plan.md). Driven through
    // /api/touch, read back through /api/debug and the glass.
    const debug = async () => JSON.parse((await get(`${base}/api/debug`)).body)
    if (!withNavigator && (await debug()).graphMap) {
      // Held still: every injected touch lasts a moment, so it is sent again.
      const hold = async (x, y, ms) => {
        for (const end = Date.now() + ms; Date.now() < end; ) {
          await touch(x, y, true)
          await sleep(120)
        }
      }
      await wake()
      await showScreen(deviceIndex("A"))
      // A short way up: the hints show, A1 below and B on the right - and on
      // the glass, not only in the state.
      const before = await fetchBmp("panel.bmp", "before-hints")
      await press(mx, sh * 0.6, mx, sh * 0.6 - 30, 3)
      const hinted = await debug()
      const glass = await fetchBmp("panel.bmp", "hints")
      await touch(mx, sh * 0.6 - 30, false)
      await settle()
      // The row is a ring (designer decision 17, 2026-10-30): the last page lies on the left of the first.
      check("a short swipe shows the hints where it leads: below, on the right and - the row a ring - on the left", hinted.graphHints === "down left right", JSON.stringify(hinted.graphHints))
      let changed = 0
      for (let y = sh - 100; y < sh; y += 2) for (let x = sw / 2 - 40; x < sw / 2 + 40; x += 2) if (glass.getPixelColor(x, y) !== before.getPixelColor(x, y)) changed++
      check("... drawn on the glass at the bottom", changed > 100, `${changed} sampled px changed`)
      check("... and gone when the finger is lifted", (await debug()).graphHints === "", JSON.stringify((await debug()).graphHints))

      // A swipe that ends in a pause: the map.
      await press(mx, sh * 0.7, mx, sh * 0.35, 6)
      await hold(mx, sh * 0.35, 900)
      const map = (await debug()).graphMap
      check("a swipe that ends in a pause opens the map", map.open === true && map.tiles.length === 5, JSON.stringify(map).slice(0, 160))
      // The finger onto B's tile; lifted there, it jumps.
      const tileB = map.tiles.find((t) => t.id === id("B"))
      if (tileB) {
        await press(mx, sh * 0.35, tileB.x, tileB.y, 4)
        await hold(tileB.x, tileB.y, 300)
        const lit = (await debug()).graphMap.lit
        check("... the tile under the finger is lit", lit === id("B"), lit)
        await touch(tileB.x, tileB.y, false)
        await settle()
        const after = await debug()
        check("... and lifting it there jumps to that screen", after.graphMap.open === false && after.lastReleaseVerdict === "map-jump", after.lastReleaseVerdict)
        await shows("on B after the map", "B")
      }

      // Over the current screen: nothing.
      await press(mx, sh * 0.7, mx, sh * 0.35, 6)
      await hold(mx, sh * 0.35, 900)
      const again = (await debug()).graphMap
      const self = again.tiles.find((t) => t.id === id("B"))
      if (self) {
        await press(mx, sh * 0.35, self.x, self.y, 3)
        await hold(self.x, self.y, 300)
        await touch(self.x, self.y, false)
        await settle()
        const after = await debug()
        check("lifting over the current screen cancels", after.lastReleaseVerdict === "map-cancel" && after.graphMap.open === false, after.lastReleaseVerdict)
        await shows("... still on B", "B")
      } else {
        check("the map opens a second time", false, JSON.stringify(again).slice(0, 160))
      }
    }
  } finally {
    await browser.close()
    client.end()
  }

  const failed = results.filter((r) => !r).length
  console.log(failed === 0 ? `\nPASS - the screen graph on ${args.device}, ${results.length} checks` : `\nFAIL - ${failed} of ${results.length} checks`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
