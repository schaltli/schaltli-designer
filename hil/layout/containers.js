// Tables on a real device (docs/2026-10-09-snap-tables.md, Task 16; before
// that the old tables' Checkpoint A, docs/2026-10-02-layout-tables.md): a
// table put together by snapping - names and their controls in rows, a
// title spanning every column, a column set wider by hand, an object
// aligned right, a bar and two buttons filling their cells - on the Knob
// and the 4.3B, against the designer's own render; and the same screen at
// the size steps S, M and L, which must not make anything overlap.
//
// Nothing is placed here. The project names cells, styles and steps only;
// the designer sizes them for the device (/test-render's
// __applyScaleForTest, as hil/size-scale/text-styles.js does) and lays them
// out (__layoutProjectForTest - lib/layout.ts layoutProject, the pass the
// editor runs after every change). The table is as large as its content;
// its corner is set here where a screen's own table used to lay out - the
// whole screen on the 4.3B, the square inside the circle on the Knob
// (screen.shape in the DDF), 2 mm in. The zip then goes through the
// designer's own export, which dissolves the table into the absolute
// objects a device knows.
//
// Checks, before anything is installed: no two objects of a container
// overlap - that fails it. What does not fit - an object outside its
// screen's content area - is reported, not failed: the designer shows that
// state too, and the device then cuts at the screen's edge exactly where
// the designer does, which is what the pixel comparison checks. On the
// Knob's 32 mm square this screen does not fit at any step; on the 4.3B it
// fits at all three (2026-10-10, as with the old tables before). Then
// --upload installs it; the device's orchestrator compares it pixel for
// pixel (hil/test-all.js runs both).
//
// Needs the designer dev server (npm run dev) and schaltli-firmware next to
// this repo.
//
// Run:
//   node hil/layout/containers.js                    # both, writes zips, checks
//   node hil/layout/containers.js knob --upload      # and installs it
//   node hil/layout/containers.js 4v3b --upload --device 192.168.1.117
const fs = require("fs")
const path = require("path")
const { DEVICES: ALL_DEVICES, deviceJsonOf, fontsOf, themeOf, upload } = require("../size-scale/text-styles")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const OUT_DIR = path.join(__dirname, "out")
const DEVICES = { knob: ALL_DEVICES.knob, "4v3b": ALL_DEVICES["4v3b"] }
const STEPS = ["s", "m", "l"]

// Values, so the bar is part full and the controls show a state; the
// orchestrators publish each topic's first example before they compare.
const TOPICS = [
  { id: "topic-layout-level", topic: "layout/level", type: "numeric", examples: ["60"] },
  { id: "topic-layout-switch", topic: "layout/switch", type: "text", examples: ["on"] },
  { id: "topic-layout-mode", topic: "layout/mode", type: "text", examples: ["eco"] },
]
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
const LEVEL = {
  topic: "layout/level",
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

let z = 0
const object = (id, type, properties, children) => ({
  id,
  type,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  zIndex: ++z,
  properties,
  ...(children ? { children } : {}),
})
const text = (id, words, style = "label") =>
  object(id, "text", {
    text: words,
    textStyle: style,
    textBold: false,
    color: "text",
    textAlign: "left",
    fontWeight: "normal",
    backgroundColor: "transparent",
    borderColor: "transparent",
  })

// An object in its table's cell (docs/2026-10-09-snap-tables.md): row,
// column, and how it stands there - a span, an align, a fill.
const at = (o, row, column, extra = {}) => ({ ...o, properties: { ...o.properties, cell: { row, column, ...extra } } })

// One screen, a table put together by snapping: a title across both
// columns, centred; three names with their controls, the switch to the
// right of its cell, the bar filling its width; two buttons side by side,
// each filling its cell. The names' column is set to 22 mm by hand, wider
// than its widest name. All at one size step. The table's corner is set
// once the scale is known (placeTables).
function screenAt(step) {
  const s = (id) => `${id}-${step}`
  return {
    id: `screen-${step}`,
    name: `Layout ${step.toUpperCase()}`,
    masterScreenId: "master-1",
    backgroundColor: "#ffffff",
    objects: [
      object(s("table"), "table", { grid: 1, columns: [{ mm: 22 }, {}], rows: [{}, {}, {}, {}, {}] }, [
        at(text(s("title"), "Wohnraum", "title"), 0, 0, { columnSpan: 2, align: "center" }),
        at(text(s("name-light"), "Licht"), 1, 0),
        at(object(s("switch"), "switch", { ...CONTROL, sizeStep: step, topic: "layout/switch", writeTopic: "layout/switch/set", states: ON_OFF }), 1, 1, { align: "right" }),
        at(text(s("name-heat"), "Heizung"), 2, 0),
        at(object(s("modes"), "button-group", { ...CONTROL, sizeStep: step, topic: "layout/mode", writeTopic: "layout/mode/set", states: MODES }), 2, 1),
        at(text(s("name-water"), "Wasser"), 3, 0),
        at(object(s("bar"), "bar", { ...LEVEL, sizeStep: step }), 3, 1, { fill: { width: true } }),
        at(object(s("off"), "button", { text: "Alles aus", sizeStep: step, buttonStyle: "tonal", buttonColor: "accent", textStyle: "label", textBold: false, action: { type: "next-screen" } }), 4, 0, { fill: { width: true } }),
        at(object(s("next"), "button", { text: "Weiter", sizeStep: step, buttonStyle: "filled", buttonColor: "accent", textStyle: "label", textBold: false, action: { type: "next-screen" } }), 4, 1, { fill: { width: true } }),
      ]),
    ],
  }
}

// Each screen's table where a screen's own table laid out: its corner in
// `area`, 2 mm in. Its size is its content's (the layout pass).
function placeTables(project, area, pixelsPerMm) {
  const pad = Math.round(2 * pixelsPerMm)
  for (const screen of project.screens.filter((sc) => !sc.isMaster)) {
    Object.assign(screen.objects[0], { x: area.x + pad, y: area.y + pad })
  }
  return project
}

function projectFor(source, device) {
  const { width, height } = device.screen
  return {
    name: `Layout containers - ${device.device.name}`,
    deviceId: device.device.id,
    systemGeneration: device.systemGeneration || "1.0",
    screenWidth: width,
    screenHeight: height,
    settings: { colorDepth: device.screen.colorDepth, screenShape: device.screen.shape === "round" ? "round" : "rect" },
    topics: TOPICS,
    assets: [],
    fonts: fontsOf(source, device),
    hardwareButtons: [],
    snapGuides: [],
    screens: [
      { id: "master-1", name: "Master", isMaster: true, backgroundColor: "#ffffff", objects: [] },
      ...STEPS.map(screenAt),
    ].map((screen) => ({ ...screen, ...themeOf(device) })),
  }
}

// What a laid-out screen gets wrong: siblings that overlap, objects outside
// the content area.
function problemsOf(screen, area) {
  const problems = []
  const notes = []
  const visit = (list, ox, oy) => {
    const boxes = list.map((o) => ({ o, x: ox + o.x, y: oy + o.y }))
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]
      if (a.x < area.x || a.y < area.y || a.x + a.o.width > area.x + area.width || a.y + a.o.height > area.y + area.height) {
        notes.push(`${a.o.id} at ${a.x},${a.y} ${a.o.width}x${a.o.height} is outside the content area`)
      }
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]
        if (a.x < b.x + b.o.width && b.x < a.x + a.o.width && a.y < b.y + b.o.height && b.y < a.y + a.o.height) {
          problems.push(`${a.o.id} and ${b.o.id} overlap`)
        }
      }
      if (a.o.children) visit(a.o.children, a.x, a.y)
    }
  }
  visit(screen.objects, 0, 0)
  return { problems, notes }
}

async function main() {
  const args = process.argv.slice(2)
  const wanted = args.filter((a) => DEVICES[a])
  const names = wanted.length > 0 ? wanted : Object.keys(DEVICES)
  const doUpload = args.includes("--upload")
  const hostArg = args.indexOf("--device") >= 0 ? args[args.indexOf("--device") + 1] : undefined
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
    const scaled = await page.evaluate(([p, d]) => window.__applyScaleForTest(p, d), [projectFor(source, device), device])
    const ppm = scaled.settings.pixelsPerMm
    if (!ppm) throw new Error(`${source}/device.json gives no scale (screen.widthMm/heightMm)`)

    // Where everything is to be seen: the whole screen, or the largest
    // square in the circle - where a master's content area used to start.
    const { width: W, height: H } = device.screen
    const side = Math.floor(Math.min(W, H) / Math.SQRT2)
    const area = device.screen.shape === "round" ? { x: Math.round((W - side) / 2), y: Math.round((H - side) / 2), width: side, height: side } : { x: 0, y: 0, width: W, height: H }
    const laid = await page.evaluate((p) => window.__layoutProjectForTest(p), placeTables(scaled, area, ppm))
    console.log(`\n${device.device.name}: ${ppm.toFixed(2)} px/mm, content area ${area.x},${area.y} ${area.width}x${area.height}`)
    for (const screen of laid.screens.filter((sc) => !sc.isMaster)) {
      const { problems, notes } = problemsOf(screen, area)
      const bottom = Math.max(...screen.objects.map((o) => o.y + o.height))
      const verdict = problems.length > 0 ? "OVERLAPS" : notes.length > 0 ? "no overlaps, does not fit" : "ok"
      console.log(`  ${screen.name}: ${verdict}, content to y=${bottom} (area ends at ${area.y + area.height})`)
      for (const p of problems) console.log(`    FAIL ${p}`)
      for (const n of notes) console.log(`    note ${n}`)
      if (problems.length > 0) failed = true
    }

    const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), laid)
    const zipPath = path.join(OUT_DIR, `containers-${name}.zip`)
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
