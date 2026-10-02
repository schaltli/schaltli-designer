// Layout containers on a real device - Checkpoint B of the layout work
// (docs/2026-10-02-layout.md, tasks/layout-todo.md): a screen built with a
// stack, a grid and a row, on the Knob and the 4.3B, against the designer's
// own render - and the same screen at the size steps S, M and L, which must
// not make anything overlap.
//
// Nothing is placed here. The project names containers, styles and steps
// only; the designer sizes them for the device (/test-render's
// __applyScaleForTest, as hil/size-scale/text-styles.js does) and lays them
// out (__layoutProjectForTest - lib/layout.ts layoutProject, the pass the
// editor runs after every change), each screen's root in its master's
// content area: the whole screen on the 4.3B, the square inside the circle
// on the Knob (screen.shape in the DDF). The zip then goes through the
// designer's own export, which dissolves the containers into the absolute
// objects a device knows.
//
// Checks, before anything is installed: no two objects of a container
// overlap - that fails it. What does not fit - an object outside its
// screen's content area, a container marked as overflowing - is reported,
// not failed: the designer shows that state too, and the device then cuts
// at the screen's edge exactly where the designer does, which is what the
// pixel comparison checks. On the Knob's 32 mm square this screen does not
// fit at any step; on the 4.3B it fits at all three (Checkpoint B,
// 2026-10-02). Then --upload installs it; the device's orchestrator
// compares it pixel for pixel (hil/test-all.js runs both).
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

// One screen: a title, a «Name and control» grid of three rows, and a row
// of two buttons sharing its width - all at one size step.
function screenAt(step) {
  const s = (id) => `${id}-${step}`
  return {
    id: `screen-${step}`,
    name: `Layout ${step.toUpperCase()}`,
    masterScreenId: "master-1",
    backgroundColor: "#ffffff",
    layout: { type: "vertical-stack" },
    objects: [
      text(s("title"), "Wohnraum", "title"),
      object(s("grid"), "grid", { columns: ["auto", 1] }, [
        text(s("name-light"), "Licht"),
        object(s("switch"), "switch", { ...CONTROL, sizeStep: step, topic: "layout/switch", writeTopic: "layout/switch/set", states: ON_OFF }),
        text(s("name-heat"), "Heizung"),
        object(s("modes"), "button-group", { ...CONTROL, sizeStep: step, topic: "layout/mode", writeTopic: "layout/mode/set", states: MODES }),
        text(s("name-water"), "Wasser"),
        object(s("bar"), "bar", { ...LEVEL, sizeStep: step }),
      ]),
      object(s("row"), "horizontal-stack", { distribute: "fill" }, [
        object(s("off"), "button", { text: "Alles aus", sizeStep: step, buttonStyle: "tonal", buttonColor: "accent", textStyle: "label", textBold: false, action: { type: "next-screen" } }),
        object(s("next"), "button", { text: "Weiter", sizeStep: step, buttonStyle: "filled", buttonColor: "accent", textStyle: "label", textBold: false, action: { type: "next-screen" } }),
      ]),
    ],
  }
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
      // Its content area left as it starts: the designer's default.
      { id: "master-1", name: "Master", isMaster: true, backgroundColor: "#ffffff", objects: [] },
      ...STEPS.map(screenAt),
    ].map((screen) => ({ ...screen, ...themeOf(device) })),
  }
}

// What a laid-out screen gets wrong: siblings that overlap, objects outside
// the content area, containers marked as overflowing.
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
      if (a.o.properties?.overflow) {
        notes.push(`${a.o.id} does not fit (content ${a.o.properties.contentWidth}x${a.o.properties.contentHeight} px in ${a.o.width}x${a.o.height})`)
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
    const laid = await page.evaluate((p) => window.__layoutProjectForTest(p), scaled)

    // The content area as the designer makes it, recomputed: the whole
    // screen, or the largest square in the circle (lib/layout.ts
    // defaultContentArea).
    const { width: W, height: H } = device.screen
    const side = Math.floor(Math.min(W, H) / Math.SQRT2)
    const area = device.screen.shape === "round" ? { x: Math.round((W - side) / 2), y: Math.round((H - side) / 2), width: side, height: side } : { x: 0, y: 0, width: W, height: H }
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
