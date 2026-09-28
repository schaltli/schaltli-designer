#!/usr/bin/env node
// What a value change costs on the 4.3B when a screen-sized icon lies behind
// it - the way a screen gets more than a colour behind it since the
// background image went (designer #16).
//
// The firmware redraws a changed value by redrawing its rectangle: every
// object that overlaps it, bottom to top, the big icon first. Until
// 2026-09-28 that icon - 770 KB at 800x480, far over the 32 KB image cache -
// was read from flash again for every such rectangle, whole, up to ten times
// a second while a dimmer was dragged over it (designer #23). This installs a
// project with such an icon and a live text over it, asks the board to
// redraw the text's rectangle (GET /api/debug?set=regionbench=x,y,w,h) and
// holds the cost to a limit.
//
//   node hil/waveshare4v3b/big-icon-redraw.js --device 192.168.1.117
//
// Needs the designer dev server (the zip is built by its own exporter, as for
// every other install here). Exits 2 with SKIPPED when the board is not
// reachable - hardware suites say so out loud, see hil/README.md.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const { chromium } = require("playwright")
const { loadDdf } = require("../conformance/ddf")
const { buildProject } = require("../conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"

// A redraw of the text's rectangle, with the image cached, is a few ms of
// pixel copying. Rereading the whole file from flash measured far above
// this; the limit sits between the two with room for a busy board.
const MAX_BEST_MS = 40

function parseArgs(argv) {
  const args = { device: process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
  }
  return args
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Several colours, so it is exported as the icon's own picture (a BMP), not
// as a one-colour mask - the case that used to be reread.
function screenSizedSvg(width, height) {
  const stripes = ["#335577", "#557733", "#775533", "#337755", "#553377", "#773355"]
  const w = width / stripes.length
  const rects = stripes.map((c, i) => `<rect x="${i * w}" y="0" width="${w}" height="${height}" fill="${c}"/>`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${rects.join("")}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no 200")
  } catch {
    console.warn(`SKIPPED - 4.3B not reachable at ${base}/api/debug (set HIL_WAVESHARE_4V3B_DEVICE to override)`)
    process.exit(2)
  }

  const ddf = await loadDdf(device)
  const { width, height } = ddf.screen
  const { project } = buildProject(ddf, { topicPrefix: "hil-bigicon" })
  const text = { x: 280, y: 200, width: 240, height: 60 }
  const screenId = `bigicon-${Date.now().toString(36)}`
  project.name = "HIL big icon redraw"
  project.assets = [{ id: "bigicon-wall", name: "wall", type: "icon", data: screenSizedSvg(width, height) }]
  project.topics = [{ topic: "hil-bigicon/value", examples: ["21.5"] }]
  project.screens = [
    {
      id: screenId,
      name: "Big icon",
      backgroundColor: "#000000",
      objects: [
        { id: "wall", type: "icon", zIndex: 1, x: 0, y: 0, width, height, properties: { assetId: "bigicon-wall" } },
        {
          id: "value",
          type: "live-text",
          zIndex: 2,
          ...text,
          properties: { topic: "hil-bigicon/value", fontId: ddf.fonts[0]?.id, textColor: "#ffffff" },
        },
      ],
    },
  ]
  project.fonts = ddf.fonts

  const browser = await chromium.launch()
  let base64
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`)
    await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 60000 })
    base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
  } finally {
    await browser.close()
  }

  const zipPath = path.join(os.tmpdir(), "hil-bigicon.zip")
  fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
  console.log(`installing a ${width}x${height} icon behind a live text (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB zip) ...`)
  try {
    execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl, "-o", os.devNull])
  } catch (err) {
    // 6 and 7: nothing was sent. Anything else is the board rebooting into
    // the new project mid-request, which is how an install ends.
    if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl} (curl exit ${err.status})`)
  }

  // Back, and running this project rather than the one before it.
  const deadline = Date.now() + 180000
  for (;;) {
    try {
      const r = await get(`${base}/api/device-settings`, 5000)
      if (r.status === 200 && r.body.includes(screenId)) break
    } catch {}
    if (Date.now() > deadline) throw new Error("the board did not come back with the installed project within 180 s")
    await sleep(3000)
  }
  await sleep(3000)

  const res = await get(`${base}/api/debug?set=regionbench=${text.x},${text.y},${text.width},${text.height}`, 60000)
  const line = res.body.split("\n").find((l) => l.startsWith("regionbench")) || ""
  console.log(line || res.body.trim())
  const m = /first ([\d.]+) ms, best ([\d.]+) ms, worst ([\d.]+) ms/.exec(line)
  if (!m) {
    console.error("FAIL - no regionbench line in the answer; is the firmware older than 2026-09-28?")
    process.exit(1)
  }
  const best = Number(m[2])
  if (best > MAX_BEST_MS) {
    console.error(`FAIL - redrawing the text over the icon took ${best} ms, over the ${MAX_BEST_MS} ms limit`)
    process.exit(1)
  }
  console.log(`PASS - ${best} ms to redraw a value over a screen-sized icon (limit ${MAX_BEST_MS} ms)`)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
