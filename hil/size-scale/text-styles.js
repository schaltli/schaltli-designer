// The four text styles, regular and bold, on a real device - Checkpoint B
// of the size scale (docs/2026-09-30-size-scale.md, tasks/size-scale-todo.md):
// to see, on the Knob, the 4.3B and the PaperS3, whether Caption, Label,
// Title and Display come out the millimetres they are meant to be. And,
// for Checkpoint C, every object with a size step at S, M and L: tracks,
// rings (three of them nested, on their track's grid) and controls.
//
// The fonts are not computed here. The project is laid out in styles only,
// and the designer resolves them - through /test-render's
// __applyScaleForTest, which uses the same pixelsPerMmOf, typographiesOf and
// resolveScale the designer does - from the device.json in the firmware
// repo's source. The zip then goes through the designer's own export
// (__buildDeviceZipForTest), as hil/waveshare/fixtures/build-smoke-test.js
// does, so the device gets exactly what a deploy would give it.
//
// The device only needs the fonts it already has: the style picks among
// them. A device on older firmware renders this as well as a new one.
//
// Needs the designer dev server (npm run dev) and schaltli-firmware next to
// this repo.
//
// Run:
//   node hil/size-scale/text-styles.js                 # all three, writes zips
//   node hil/size-scale/text-styles.js knob --upload   # and installs it
//   node hil/size-scale/text-styles.js 4v3b --upload --device 192.168.1.117
//   node hil/size-scale/text-styles.js --upload --typography Technic
const fs = require("fs")
const path = require("path")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const FIRMWARE = path.join(__dirname, "..", "..", "..", "schaltli-firmware")
const OUT_DIR = path.join(__dirname, "out")

// Home addresses from the workplace notes; --device overrides.
const DEVICES = {
  knob: { source: "ddf-source", host: "192.168.1.114" },
  "4v3b": { source: "ddf-source-waveshare4v3b", host: "192.168.1.117" },
  papers3: { source: "ddf-source-papers3", host: "192.168.1.118" },
}

const STYLES = [
  ["caption", "Caption 21.5 °C"],
  ["label", "Label Frischwasser"],
  ["title", "Title Wohnraum"],
  ["display", "Display 21.5"],
]
const MARGIN_MM = 1.5
const STEPS = ["s", "m", "l"]

// Values, so the tracks are part full and the controls show a state; the
// 4.3B orchestrator publishes each topic's example before it compares.
const TOPICS = [
  { id: "topic-steps-level", topic: "size-scale/level", type: "numeric", examples: ["60"] },
  { id: "topic-steps-switch", topic: "size-scale/switch", type: "text", examples: ["on"] },
  { id: "topic-steps-mode", topic: "size-scale/mode", type: "text", examples: ["eco"] },
]

// What the canvas gives a new object of each kind (components/canvas/
// canvas.tsx), in a style and on a step; resolveScale sizes it for the
// device - the same code a device change runs in the designer.
function stepped(id, type, step, properties) {
  return { id, type, x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: { sizeStep: step, ...properties } }
}
const LEVEL = {
  topic: "size-scale/level",
  direction: "left-to-right",
  calibrationPoints: [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ],
  displayValue: "none",
  fillColor: "accent",
  textColor: "text",
  textStyle: "label",
  textBold: false,
}
const RING = { ...LEVEL, minAngle: 225, maxAngle: 135, direction: "cw" }
const ON_OFF = [
  { id: "off", label: "Aus", readValue: "off", writeValue: "off", showAsOn: false },
  { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true },
]
const MODES = [
  { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
  { id: "eco", label: "Eco", readValue: "eco", writeValue: "eco" },
  { id: "comfort", label: "Komfort", readValue: "comfort", writeValue: "comfort" },
]
const CONTROL = { switchStyle: "filled", switchColor: "accent", textStyle: "label", textBold: false }

function stepScreens() {
  const tracks = []
  const rings = []
  const controls = []
  for (const step of STEPS) {
    tracks.push(stepped(`obj-bar-${step}`, "bar", step, LEVEL))
    tracks.push(stepped(`obj-slider-${step}`, "slider", step, { ...LEVEL, writeTopic: "size-scale/level/set" }))
    rings.push(stepped(`obj-gauge-${step}`, "gauge", step, RING))
    controls.push(stepped(`obj-switch-${step}`, "switch", step, { ...CONTROL, topic: "size-scale/switch", writeTopic: "size-scale/switch/set", states: ON_OFF }))
    controls.push(stepped(`obj-group-${step}`, "button-group", step, { ...CONTROL, topic: "size-scale/mode", writeTopic: "size-scale/mode/set", states: MODES }))
    controls.push(stepped(`obj-button-${step}`, "button", step, { text: "Licht", buttonStyle: "tonal", buttonColor: "accent", textStyle: "label", textBold: false, action: { type: "next-screen" } }))
  }
  const nested = ["outer", "middle", "inner"].map((name) => stepped(`obj-ring-${name}`, "dial", "m", { ...RING, writeTopic: "size-scale/level/set", step: 1 }))
  return [
    { id: "screen-steps-tracks", name: "Steps: tracks", backgroundColor: "#ffffff", objects: tracks },
    { id: "screen-steps-rings", name: "Steps: rings", backgroundColor: "#ffffff", objects: rings },
    { id: "screen-steps-nested", name: "Steps: nested rings", backgroundColor: "#ffffff", objects: nested },
    { id: "screen-steps-controls", name: "Steps: controls", backgroundColor: "#ffffff", objects: controls },
  ]
}

function deviceJsonOf(source) {
  const file = path.join(FIRMWARE, source, "device.json")
  if (!fs.existsSync(file)) throw new Error(`${file} not found - check out schaltli-firmware alongside this repo`)
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

// The fonts with their bytes, so the export can bake whatever it bakes; no
// `path`, so none of them is written into the zip (see ../waveshare/ddf-fonts.js).
function fontsOf(source, device) {
  return device.fonts.map((f) => ({
    id: f.id,
    name: f.internalName,
    displayName: f.displayName,
    internalName: f.internalName,
    size: f.size,
    ascent: f.ascent,
    descent: f.descent,
    data: fs.readFileSync(path.join(FIRMWARE, source, f.file), "utf8"),
  }))
}

function projectFor(source, device, typography) {
  const { width, height } = device.screen
  const fonts = fontsOf(source, device)
  const objects = []
  let z = 1
  for (const [style, text] of STYLES) {
    for (const bold of [false, true]) {
      objects.push({
        id: `obj-${style}${bold ? "-bold" : ""}`,
        type: "text",
        x: 0,
        y: 0,
        width,
        height: 10,
        zIndex: z++,
        properties: {
          text: bold ? `${text} bold` : text,
          textStyle: style,
          textBold: bold,
          color: "text",
          textAlign: "center",
          fontWeight: "normal",
          backgroundColor: "transparent",
          borderColor: "transparent",
        },
      })
    }
  }
  return {
    name: `Text styles${typography ? ` (${typography})` : ""} - ${device.device.name}`,
    deviceId: device.device.id,
    systemGeneration: device.systemGeneration || "1.0",
    screenWidth: width,
    screenHeight: height,
    settings: { colorDepth: device.screen.colorDepth },
    topics: TOPICS,
    assets: [],
    fonts,
    hardwareButtons: [],
    snapGuides: [],
    screens: [
      // The typography by name, on the screen as in the designer; one the
      // device lacks falls back to Standard.
      { id: "screen-1", name: "Text styles", backgroundColor: "#ffffff", objects, ...(typography ? { typography } : {}) },
      wideGlyphScreen(fonts, device),
      ...stepScreens(),
    ],
  }
}

// The glyphs wider than 32 px, in the font that has the widest: both the
// designer and the firmware read a bitmap row into 32 bits until 2026-09-30
// and cut such glyphs off - FreeUniversal 35's "%", "M" and "W" on the 4.3B
// and the PaperS3 among them (typography appendix, Task T1). Set by hand,
// not in a style, so it stays this font. hil/waveshare4v3b/orchestrator.js
// compares this screen pixel for pixel.
function wideGlyphScreen(fonts, device) {
  let widest = null
  for (const font of fonts) {
    const wide = []
    let encoding = -1
    for (const line of font.data.split(/\r?\n/)) {
      if (line.startsWith("ENCODING ")) encoding = Number(line.slice(9))
      else if (line.startsWith("BBX ") && Number(line.split(" ")[1]) > 32 && encoding > 32 && encoding < 127) {
        wide.push(String.fromCharCode(encoding))
      }
    }
    if (wide.length > 0 && (!widest || wide.length > widest.wide.length)) widest = { font, wide }
  }
  if (!widest) return { id: "screen-2", name: "Wide glyphs (none)", backgroundColor: "#ffffff", objects: [] }
  const { font, wide } = widest
  const line = font.ascent + font.descent
  const perLine = Math.max(1, Math.floor(device.screen.width / (line * 0.9)))
  const lines = []
  for (let i = 0; i < wide.length; i += perLine) lines.push(wide.slice(i, i + perLine).join(""))
  return {
    id: "screen-2",
    name: "Wide glyphs",
    backgroundColor: "#ffffff",
    objects: lines.map((text, i) => ({
      id: `obj-wide-${i}`,
      type: "text",
      x: 0,
      y: 8 + i * (line + 8),
      width: device.screen.width,
      height: line,
      zIndex: i + 1,
      properties: {
        text,
        fontId: font.id,
        fontSize: font.size,
        color: "#000000",
        textAlign: "center",
        fontWeight: "normal",
        backgroundColor: "transparent",
        borderColor: "transparent",
      },
    })),
  }
}

// Stacks the texts top to bottom once their heights are known, centred as
// a block so the round Knob does not cut the first and last lines.
function layOut(project, pixelsPerMm) {
  const objects = project.screens[0].objects
  const gap = Math.round(MARGIN_MM * pixelsPerMm)
  const total = objects.reduce((sum, o) => sum + o.height, 0) + gap * (objects.length - 1)
  let y = Math.max(0, Math.round((project.screenHeight - total) / 2))
  for (const o of objects) {
    o.y = y
    y += o.height + gap
  }
  return project
}

// The step screens, once resolveScale has sized their objects: each in a
// row that wraps, the rows centred; a ring as three tracks either side of
// its hole, and the nested rings sharing one centre, 7, 5 and 3 tracks in
// radius - each one ring width inside the last, on the grid a ring's
// diameter keeps to. A square screen - the round Knob - keeps clear of its
// corners.
function layOutSteps(project) {
  const W = project.screenWidth
  const H = project.screenHeight
  const margin = W === H ? Math.round(W * 0.15) : 12
  const gap = 10
  for (const screen of project.screens.filter((s) => s.id.startsWith("screen-steps-"))) {
    const objects = screen.objects
    if (screen.id === "screen-steps-nested") {
      const t = objects[0].properties.thickness
      objects.forEach((o, i) => {
        const d = (7 - 2 * i) * 2 * t
        o.width = d
        o.height = d
        o.x = Math.round(W / 2 - d / 2)
        o.y = Math.round(H / 2 - d / 2)
      })
      continue
    }
    for (const o of objects) {
      if (o.type === "gauge") {
        o.width = 6 * o.properties.thickness
        o.height = o.width
      }
      if (o.type === "bar" || o.type === "slider") o.width = Math.round((W - 2 * margin - gap) / 2)
    }
    const rows = [[]]
    let used = 0
    for (const o of objects) {
      const row = rows[rows.length - 1]
      // Each step its own row, so S, M and L of a kind stand one below the
      // other - except the rings, which stand side by side.
      const newStep = screen.id !== "screen-steps-rings" && row.length > 0 && row[0].properties.sizeStep !== o.properties.sizeStep
      if (row.length > 0 && (newStep || used + gap + o.width > W - 2 * margin)) {
        rows.push([])
        used = 0
      }
      used += (rows[rows.length - 1].length > 0 ? gap : 0) + o.width
      rows[rows.length - 1].push(o)
    }
    const heights = rows.map((row) => Math.max(...row.map((o) => o.height)))
    let y = Math.max(0, Math.round((H - heights.reduce((a, b) => a + b, 0) - gap * (rows.length - 1)) / 2))
    rows.forEach((row, r) => {
      const width = row.reduce((sum, o) => sum + o.width, 0) + gap * (row.length - 1)
      let x = Math.max(0, Math.round((W - width) / 2))
      for (const o of row) {
        o.x = x
        o.y = y + Math.round((heights[r] - o.height) / 2)
        x += o.width + gap
      }
      y += heights[r] + gap
    })
  }
  return project
}

async function upload(zipPath, host) {
  const form = new FormData()
  form.append("file", new Blob([fs.readFileSync(zipPath)]), path.basename(zipPath))
  try {
    // The device reboots into the project and never answers this request.
    await fetch(`http://${host}/api/project`, { method: "POST", body: form, signal: AbortSignal.timeout(25000) })
  } catch {
    // expected
  }
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}/ddf.zip`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) return true
    } catch {
      // still rebooting
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

async function main() {
  const args = process.argv.slice(2)
  const wanted = args.filter((a) => DEVICES[a])
  const names = wanted.length > 0 ? wanted : Object.keys(DEVICES)
  const doUpload = args.includes("--upload")
  const hostArg = args.indexOf("--device") >= 0 ? args[args.indexOf("--device") + 1] : undefined
  const typography = args.indexOf("--typography") >= 0 ? args[args.indexOf("--typography") + 1] : undefined
  if (hostArg && names.length !== 1) throw new Error("--device needs exactly one device name")

  try {
    const probe = await fetch(`${DESIGNER_URL}/test-render`, { signal: AbortSignal.timeout(5000) })
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
  } catch (e) {
    console.error(`the designer dev server is not answering at ${DESIGNER_URL} (${e.message}) - start it with npm run dev`)
    process.exit(1)
  }

  const { chromium } = require("playwright")
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.error("[page error]", e.message))
  await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 180000 })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  let failed = false
  for (const name of names) {
    const { source, host: defaultHost } = DEVICES[name]
    const device = deviceJsonOf(source)
    const resolved = await page.evaluate(([p, d]) => window.__applyScaleForTest(p, d), [projectFor(source, device, typography), device])
    const ppm = resolved.settings.pixelsPerMm
    if (!ppm) throw new Error(`${source}/device.json gives no scale (screen.widthMm/heightMm)`)
    layOut(resolved, ppm)
    layOutSteps(resolved)

    console.log(`\n${device.device.name}: ${ppm.toFixed(2)} px/mm, typography ${typography || "Standard"}`)
    const byId = new Map(resolved.fonts.map((f) => [f.id, f]))
    for (const o of resolved.screens[0].objects) {
      const f = byId.get(o.properties.fontId)
      const line = f ? f.ascent + f.descent : undefined
      console.log(
        `  ${o.properties.text.padEnd(28)} ${String(o.properties.fontId).padEnd(18)} ${line} px = ${line ? (line / ppm).toFixed(1) : "?"} mm`,
      )
    }

    for (const screen of resolved.screens.filter((sc) => sc.id.startsWith("screen-steps-"))) {
      console.log(`  ${screen.name}:`)
      for (const o of screen.objects) {
        const across = o.type === "bar" || o.type === "slider" || o.type === "gauge" || o.type === "dial" ? o.properties.thickness : o.height
        console.log(`    ${o.id.padEnd(22)} ${String(across).padStart(3)} px = ${(across / ppm).toFixed(1)} mm   box ${o.width} x ${o.height}`)
      }
    }

    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), resolved)
    const zipPath = path.join(OUT_DIR, `text-styles-${name}.zip`)
    fs.writeFileSync(zipPath, Buffer.from(base64, "base64"))
    console.log(`  wrote ${path.relative(process.cwd(), zipPath)}`)

    if (doUpload) {
      const host = hostArg || defaultHost
      process.stdout.write(`  installing on ${host} ... `)
      const ok = await upload(zipPath, host)
      console.log(ok ? "back up" : "did not come back")
      if (!ok) failed = true
    }
  }
  await browser.close()
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
