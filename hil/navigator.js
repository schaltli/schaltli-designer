#!/usr/bin/env node
// The navigator on a board (docs/2026-10-08-navigator.md, device contract
// 2.7, generation 1.5).
//
// Installs a master with a navigator on its left edge, icons and names, and
// twelve screens under it: S1 hidden, S2 with a live screen icon and a text
// that reaches under the strip. Then walks it the way a hand does, through
// /api/touch, holding every picture to the designer's at 0 px:
//
//   - the board starts on S2, the first screen that is not hidden
//   - a tap on an entry opens its screen
//   - a drag along the strip scrolls it and pages nothing; a tap after it
//     lands on the entry now under the finger
//   - a swipe beside the strip pages, and while the screen follows the
//     finger the strip's pixels on the glass stay as they were
//   - paging back from S2 passes over the hidden S1 to S12
//   - a live screen icon follows its topic, drawn as a region
//   - a value whose text lies under the strip leaves the strip whole
//
// On the PaperS3 (--e-ink, or found from its DDF) gestures act on release:
// a swipe on the strip scrolls a page of entries and nothing follows the
// finger, so the swipe-in-motion check is left out.
//
//   node hil/navigator.js --device 192.168.1.117
//
// Needs the designer dev server and the HIL broker (`npm run hil:broker`),
// with the board pointed at it. Exits 2 with SKIPPED when the board is not
// reachable - hardware suites say so out loud, see hil/README.md.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const { comparePixels } = require("./report-template")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "navigator-report")

const RUN = Date.now().toString(36)
const LIGHT = `hil-nav-${RUN}/light`
const NAME = `hil-nav-${RUN}/name`
// Screen ids of this run, so that the install can be told from the last one.
const S = (n) => `nav-${RUN}-s${n}`

const svg = (d) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`).toString("base64")
const SQUARE = svg("M4 4h16v16H4z")
const RING = svg("M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zm0 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10z")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null, eink: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    if (argv[i] === "--e-ink") args.eink = true
  }
  return args
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

function navigatorProject(ddf) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-nav-${RUN}` })
  const font = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))[Math.floor(ddf.fonts.length * 0.3)]
  const big = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))[ddf.fonts.length - 1]
  const { width: sw, height: sh } = ddf.screen
  const navigator = {
    id: "nav",
    type: "navigator",
    x: 0,
    y: 0,
    width: 80,
    height: sh,
    zIndex: 50,
    properties: {
      edge: "left",
      shows: "iconsAndText",
      fontId: font.id,
      backgroundColor: "#202020",
      textColor: "#c0c0c0",
      activeColor: "#4060ff",
      activeTextColor: "#ffffff",
    },
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
  project.name = "HIL navigator"
  project.fonts = ddf.fonts
  project.assets = [
    { id: "square", name: "square", type: "icon", data: SQUARE },
    { id: "ring", name: "ring", type: "icon", data: RING },
  ]
  project.topics = [
    { id: "light", topic: LIGHT, type: "boolean", examples: ["false"] },
    { id: "name", topic: NAME, type: "text", examples: ["Grau"] },
  ]
  project.combinedTopics = []
  // The swipes the master binds: without them among the project's buttons
  // the export writes no swipe action, and a swipe pages nothing.
  project.hardwareButtons = [
    { id: "swipe-left", name: "Swipe left" },
    { id: "swipe-right", name: "Swipe right" },
  ]
  const screens = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const screen = {
      id: S(n),
      name: `S${n}`,
      masterScreenId: "m",
      backgroundColor: "#000000",
      iconAssetId: n % 2 ? "square" : "ring",
      objects: [label(`Screen ${n}`)],
    }
    if (n === 1) screen.hidden = true
    if (n === 2) {
      screen.iconLive = { id: "lv1", source: { namespace: "topic", path: LIGHT }, rules: [{ op: "yes", result: { kind: "icon", icon: "square" } }], otherwise: { kind: "icon", icon: "ring" } }
      // Under the strip: its region is drawn, and the strip over it.
      screen.objects.push({
        id: "under",
        type: "text",
        zIndex: 2,
        x: 20,
        y: sh - 60,
        width: 300,
        height: font.size || 20,
        properties: { text: `Tank {topic:${NAME} ?? "leer"}`, fontId: font.id, textColor: "#ffffff", backgroundColor: "#000000", borderColor: "#000000", textAlign: "left" },
      })
    }
    return screen
  })
  project.screens = [
    {
      id: "m",
      name: "Master",
      isMaster: true,
      backgroundColor: "#000000",
      buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" } },
      // NAVIGATOR_NONE=1: the same project without it - for measuring what it costs.
      objects: process.env.NAVIGATOR_NONE ? [] : [navigator],
    },
    ...screens,
  ]
  // The designer's reference draws a screen alone (test-render does not
  // merge masters): each screen with the master's navigator among its own.
  const reference = { ...project, screens: project.screens.map((s) => (s.isMaster ? s : { ...s, objects: [...s.objects, navigator] })) }
  return { project, reference }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node hil/navigator.js --device <ip> [--e-ink]")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const ddf = await loadDdf(args.device)
  const eink = args.eink || /papers3/i.test(ddf.deviceId || "")
  const { project, reference } = navigatorProject(ddf)
  const { width: sw, height: sh } = ddf.screen

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const publish = (topic, value) => new Promise((resolve, reject) => client.publish(topic, value, { qos: 1 }, (e) => (e ? reject(e) : resolve())))

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
    const zipPath = path.join(os.tmpdir(), "hil-navigator.zip")
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    console.log("installing a master with a navigator and twelve screens, S1 hidden ...")
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl} (curl exit ${err.status})`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(S(2))) break
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
    // Down where it starts, held long enough for the board to read it there,
    // then step by step with a gap: sent back to back, the board samples only
    // the last positions and sees a short wobble, not a swipe.
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
    const expected = async (screenId, overrides = {}, navigatorScroll) => {
      const screenIndex = reference.screens.findIndex((s) => s.id === screenId)
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: ddf.testInterface.snapshotQuantize || "rgb565",
        project: reference,
        screenIndex,
        topicOverrides: { [LIGHT]: "", [NAME]: "", ...overrides },
        navigatorScroll,
      })
      const file = path.join(OUT_DIR, `${String(shots).padStart(2, "0")}-expected-${screenId}.png`)
      fs.writeFileSync(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
      return Jimp.read(file)
    }
    const values = {}
    // The canvas, and after a swipe the glass as well: a swipe writes its
    // frames straight to the panel, and the glass is what a person sees -
    // the canvas was right while the glass kept the old strip (2026-10-08).
    const shows = async (name, screenId, scroll, alsoGlass = false) => {
      const want = await expected(screenId, values, scroll)
      for (const what of alsoGlass && !eink ? ["snapshot.bmp", "panel.bmp"] : ["snapshot.bmp"]) {
        const actual = await fetchBmp(what, name)
        const { dimensionMismatch, diffPixels } = comparePixels(actual, want)
        const where = what === "panel.bmp" ? " (glass)" : ""
        check(`${name}${where}: ${screenId}${scroll !== undefined ? `, scrolled ${scroll}` : ""}`, !dimensionMismatch && diffPixels === 0, dimensionMismatch ? "dimension mismatch" : `${diffPixels} px differ`)
      }
    }
    const stripPixels = (img) => {
      const out = []
      for (let y = 0; y < sh; y += 3) for (let x = 0; x < 80; x += 3) out.push(img.getPixelColor(x, y))
      return out.join(",")
    }

    // Twelve entries less the hidden S1 = eleven, 88 long on the strip.
    // A panel that went dark takes the first touch to wake and nothing else:
    // woken first, on an empty part of the screen.
    const wake = async () => {
      await tap(sw * 0.6, sh * 0.12)
    }
    await wake()

    // The navigator's rules, as the board keeps them (lib/navigator.ts,
    // contract 2.7), to know what each step must show: eleven entries (S1
    // is hidden) on a strip as tall as the screen, a scroll that is "as far
    // as shows the open entry" (-1) until a finger moves it, then follows
    // every screen change only as far as shows the new entry.
    const listed = Array.from({ length: 11 }, (_, i) => i + 2)
    const ENTRY = listed.length * 88 <= sh ? Math.floor(sh / listed.length) : 88
    const maxScroll = Math.max(0, listed.length * ENTRY - sh)
    const clamp = (v) => Math.min(Math.max(0, v), maxScroll)
    const toShow = (i, from) => clamp(i * ENTRY < from ? i * ENTRY : (i + 1) * ENTRY > from + sh ? (i + 1) * ENTRY - sh : from)
    let scroll = -1
    let open = 0 // index into listed
    const effective = () => (scroll >= 0 ? clamp(scroll) : toShow(open, 0))
    const goTo = (i) => {
      if (scroll >= 0) scroll = toShow(i, scroll)
      open = i
    }
    const showsOpen = (name, alsoGlass = false) => shows(name, S(listed[open]), scroll >= 0 ? scroll : undefined, alsoGlass)
    const entryAtY = (y) => Math.floor((y + effective()) / ENTRY)

    await showsOpen("starts on the first screen not hidden")

    await tap(40, 2 * ENTRY + ENTRY / 2)
    goTo(2)
    await showsOpen("a tap on the third entry")

    // Up the strip: the 4.3B follows the finger, the PaperS3 turns a page.
    await drag(40, sh * 0.8, 40, sh * 0.4)
    scroll = eink ? clamp(effective() + Math.max(1, Math.floor(sh / ENTRY)) * ENTRY) : clamp(effective() + Math.round(sh * 0.4))
    await showsOpen("a swipe up the strip scrolls it, the screen stays")

    goTo(entryAtY(130))
    await tap(40, 130)
    await showsOpen("a tap after it opens the entry under the finger now")

    // A swipe beside the strip: the strip stands still while the screen moves.
    if (!eink) {
      const beforeImg = await fetchBmp("snapshot.bmp", "before-swipe")
      const before = stripPixels(beforeImg)
      // Beside the strip, a band through the screen's label.
      const besidePixels = (img) => {
        const out = []
        for (let y = Math.round(sh * 0.35); y < Math.round(sh * 0.55); y += 2) for (let x = 90; x < sw; x += 2) out.push(img.getPixelColor(x, y))
        return out.join(",")
      }
      // The glass mid-swipe. Sending it takes the board about a second, in
      // which the injected finger lapses - so the swipe is let go right after,
      // far enough (more than a third) to page.
      await press(sw * 0.8, sh / 2, sw * 0.4, sh / 2, 6)
      const glass = await fetchBmp("panel.bmp", "during-swipe")
      check("mid-swipe the screen beside the strip has moved", besidePixels(glass) !== besidePixels(beforeImg))
      check("... while the strip's pixels stay as they were", before === stripPixels(glass))
      await touch(sw * 0.4, sh / 2, false)
      await settle()
    } else {
      await drag(sw * 0.8, sh / 2, sw * 0.2, sh / 2)
    }
    goTo(open + 1)
    await showsOpen("a swipe beside it pages on", true)

    // From S2 back: S1 is hidden, so S12. The navigator follows.
    await wake()
    const r = await fetch(`${base}/api/screen`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "index=1" })
    if (!(await r.json()).success) throw new Error("/api/screen failed")
    goTo(0)
    await settle()
    await drag(sw * 0.2, sh / 2, sw * 0.8, sh / 2)
    goTo(listed.length - 1)
    await showsOpen("paging back from S2 passes over the hidden S1", true)
    // Swipe after swipe, the number on the screen and the highlighted entry
    // agree on the glass too (reported by hand 2026-10-08).
    await drag(sw * 0.2, sh / 2, sw * 0.8, sh / 2)
    goTo(open - 1)
    await showsOpen("and back again", true)
    await drag(sw * 0.2, sh / 2, sw * 0.8, sh / 2)
    goTo(open - 1)
    await showsOpen("and again", true)

    // The live screen icon of S2, and a value under the strip.
    await wake()
    await fetch(`${base}/api/screen`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "index=1" })
    goTo(0)
    await settle()
    values[LIGHT] = "true"
    await publish(LIGHT, "true")
    await settle()
    const how = /last value draw: (.*)/.exec((await get(`${base}/api/debug`)).body)?.[1] ?? "?"
    await showsOpen(`a live screen icon follows its topic (drawn as ${how})`)
    if (!eink) check("... as a region", /region\(s\)/.test(how), how)
    values[NAME] = "Frischwasser"
    await publish(NAME, "Frischwasser")
    await settle()
    await showsOpen("a value under the strip leaves it whole")
  } finally {
    await browser.close()
    client.end()
  }

  const failed = results.filter((ok) => !ok).length
  if (failed > 0) {
    console.error(`FAIL - ${failed} check(s); pictures in ${path.relative(process.cwd(), OUT_DIR)}`)
    process.exit(1)
  }
  console.log(`PASS - the navigator on ${args.device}: ${results.length} checks`)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
