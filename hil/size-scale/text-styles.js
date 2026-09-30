// The four text styles, regular and bold, on a real device - Checkpoint B
// of the size scale (docs/2026-09-30-size-scale.md, tasks/size-scale-todo.md):
// to see, on the Knob, the 4.3B and the PaperS3, whether Caption, Label,
// Title and Display come out the millimetres they are meant to be.
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

function projectFor(source, device) {
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
    name: `Text styles - ${device.device.name}`,
    deviceId: device.device.id,
    systemGeneration: device.systemGeneration || "1.0",
    screenWidth: width,
    screenHeight: height,
    settings: { colorDepth: device.screen.colorDepth },
    topics: [],
    assets: [],
    fonts,
    hardwareButtons: [],
    snapGuides: [],
    screens: [
      { id: "screen-1", name: "Text styles", backgroundColor: "#ffffff", objects },
      wideGlyphScreen(fonts, device),
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
    const resolved = await page.evaluate(([p, d]) => window.__applyScaleForTest(p, d), [projectFor(source, device), device])
    const ppm = resolved.settings.pixelsPerMm
    if (!ppm) throw new Error(`${source}/device.json gives no scale (screen.widthMm/heightMm)`)
    layOut(resolved, ppm)

    console.log(`\n${device.device.name}: ${ppm.toFixed(2)} px/mm`)
    const byId = new Map(resolved.fonts.map((f) => [f.id, f]))
    for (const o of resolved.screens[0].objects) {
      const f = byId.get(o.properties.fontId)
      const line = f ? f.ascent + f.descent : undefined
      console.log(
        `  ${o.properties.text.padEnd(28)} ${String(o.properties.fontId).padEnd(18)} ${line} px = ${line ? (line / ppm).toFixed(1) : "?"} mm`,
      )
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
