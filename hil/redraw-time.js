// How long a 4" or 4.3B takes to redraw a screen full of text, in the old
// 1-bit fonts and in the 4-bit ones that replace them
// (docs/2026-11-01-4bit-fonts.md T11: at most 20 % slower).
//
// One screen, two projects: thirty-odd texts in two columns, each with a
// value in it so the board draws it itself (text without one is baked into
// the screen's picture by the export, and costs no glyph drawing). The first
// project names the 1-bit fonts a project of before 2026-11-02 named - the
// Helvetica and FreeUniversal of the Standard typography -, the second the
// 4-bit faces their DDF entries list in `replaces`, the fonts an old
// project is switched to on open. Same boxes, same texts, same values.
// Each is installed and measured with the board's own benchmark,
// /api/debug?set=render=1 («render N ms (best of 5)»), three times; the
// best of those counts.
//
// The values are published retained before the installs, under the board's
// tag (hil/device-tag.js), so the texts are drawn with them.
//
// Run: node -r ./hil/device-auth.js hil/redraw-time.js --device <ip> [--source ddf-source-waveshare4v3b]
// Needs the designer (DESIGNER_URL, default http://localhost:3000) for the
// export, and the broker (HIL_BROKER_URL). Exit 0 pass, 1 fail, 2 device
// unreachable.
const fs = require("fs")
const path = require("path")
const mqtt = require("mqtt")
const { deviceJsonOf, fontsOf, upload } = require("./size-scale/text-styles")
const { deviceTag } = require("./device-tag")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const OUT_DIR = path.join(__dirname, "size-scale", "out")
const LIMIT = 1.2

// What a column holds, top to bottom: the old font, how many lines, and
// what they say. Every line has the value in it.
const COLUMN = [
  ["font-helvB24", 1, "Wohnraum {v}"],
  ["font-helvR18", 5, "Frischwasser {v} %"],
  ["font-helvR12", 6, "Batterie Bordnetz {v} V"],
  ["font-helvB12", 3, "Solar heute {v} kWh"],
  ["font-fur42", 1, "{v} °C"],
]

function parseArgs(argv) {
  const args = { device: null, source: "ddf-source-waveshare4v3b" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--source") args.source = argv[++i]
  }
  if (!args.device) {
    console.error("usage: node -r ./hil/device-auth.js hil/redraw-time.js --device <ip> [--source <ddf source dir>]")
    process.exit(1)
  }
  return args
}

// The 4-bit face that replaces each old one (its DDF entry's `replaces`).
function replacements(device) {
  const map = new Map()
  for (const f of device.fonts) for (const old of f.replaces || []) map.set(old, f.id)
  return map
}

function projectFor(device, fonts, fontFor, topic, name) {
  const { width, height } = device.screen
  const byId = new Map(device.fonts.map((f) => [f.id, f]))
  const replaced = replacements(device)
  const objects = []
  let z = 1
  for (let col = 0; col < 2; col++) {
    let y = 4
    for (const [old, lines, words] of COLUMN) {
      // The box is the taller of the two fonts' lines, so both projects lay
      // out alike.
      const lineOf = (id) => (byId.get(id).ascent || 0) + (byId.get(id).descent || 0)
      const h = Math.max(lineOf(old), lineOf(replaced.get(old)))
      for (let i = 0; i < lines; i++) {
        objects.push({
          id: `text-${col}-${z}`,
          type: "text",
          x: col * (width / 2) + 8,
          y,
          width: width / 2 - 16,
          height: h,
          zIndex: z++,
          properties: {
            text: words.replace("{v}", `{topic:${topic}}`),
            fontId: fontFor(old),
            color: "#1d1b20",
            textAlign: "left",
            backgroundColor: "transparent",
            borderColor: "transparent",
          },
        })
        y += h
      }
    }
    if (y > height) throw new Error(`the column is ${y} px high, the screen ${height}`)
  }
  return {
    name,
    deviceId: device.device.id,
    systemGeneration: device.systemGeneration || "1.0",
    screenWidth: width,
    screenHeight: height,
    settings: { colorDepth: device.screen.colorDepth },
    topics: [{ id: "topic-redraw-value", topic, type: "text", examples: ["21.5"] }],
    assets: [],
    fonts,
    hardwareButtons: [],
    snapGuides: [],
    screens: [{ id: "screen-1", name: "Redraw time", backgroundColor: "#ffffff", objects }],
  }
}

// «render          41.3 ms  (best of 5, worst 42.0)»
async function renderMs(base) {
  const res = await fetch(`${base}/api/debug?set=render=1`, { signal: AbortSignal.timeout(30000) })
  const m = (await res.text()).match(/render\s+([\d.]+) ms\s+\(best of 5/)
  return m ? Number(m[1]) : null
}

async function measure(base, label) {
  const runs = []
  for (let i = 0; i < 3; i++) {
    const ms = await renderMs(base)
    if (ms === null) throw new Error(`${base}/api/debug?set=render=1 gave no render time`)
    runs.push(ms)
  }
  const best = Math.min(...runs)
  console.log(`  ${label.padEnd(8)} ${best.toFixed(1)} ms  (runs ${runs.map((r) => r.toFixed(1)).join(", ")})`)
  return best
}

async function main() {
  const { device: host, source } = parseArgs(process.argv)
  const base = `http://${host}`
  try {
    await fetch(`${base}/api/debug`, { signal: AbortSignal.timeout(8000) })
  } catch (e) {
    console.warn(`SKIPPED - ${host} not reachable (${e.message})`)
    process.exit(2)
  }
  const device = deviceJsonOf(source)
  const replaced = replacements(device)
  for (const [old] of COLUMN) if (!replaced.get(old)) throw new Error(`${source} names no 4-bit font that replaces ${old}`)
  const fonts = fontsOf(source, device)
  const topic = `redraw-time/${deviceTag()}/value`

  const broker = await mqtt.connectAsync(BROKER_URL, { reconnectPeriod: 0 })
  await broker.publishAsync(topic, "21.5", { retain: true, qos: 1 })
  await broker.endAsync()

  const { chromium } = require("playwright")
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.error("[page error]", e.message))
  const times = {}
  try {
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 180000 })
    fs.mkdirSync(OUT_DIR, { recursive: true })
    console.log(`\n${device.device.name} (${host}): a screen of ${COLUMN.reduce((n, c) => n + c[1], 0) * 2} texts the board draws`)
    for (const [label, fontFor] of [
      ["1-bit", (old) => old],
      ["4-bit", (old) => replaced.get(old)],
    ]) {
      const project = projectFor(device, fonts, fontFor, topic, `Redraw time (${label})`)
      const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
      const zipPath = path.join(OUT_DIR, `redraw-time-${label}.zip`)
      fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
      if (!(await upload(zipPath, host))) throw new Error(`the ${label} project did not install on ${host}`)
      // Connected, the value in, the first screen drawn.
      await new Promise((r) => setTimeout(r, 8000))
      times[label] = await measure(base, label)
    }
  } finally {
    await browser.close()
  }
  const ratio = times["4-bit"] / times["1-bit"]
  const pct = ((ratio - 1) * 100).toFixed(0)
  if (ratio > LIMIT) {
    console.log(`FAIL - ${host}: 4-bit ${times["4-bit"].toFixed(1)} ms against 1-bit ${times["1-bit"].toFixed(1)} ms, ${pct} % slower (at most ${((LIMIT - 1) * 100).toFixed(0)} %)`)
    process.exit(1)
  }
  console.log(`PASS - ${host}: 4-bit ${times["4-bit"].toFixed(1)} ms against 1-bit ${times["1-bit"].toFixed(1)} ms (${ratio >= 1 ? "+" : ""}${pct} %)`)
}

main().catch((e) => {
  console.log(`FAIL - ${e.message}`)
  process.exit(1)
})
