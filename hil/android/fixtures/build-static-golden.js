// Records how the designer draws a line and a box, pixel for pixel, so the
// Android app's ports can be held to it by a plain JVM unit test
// (StaticObjectGoldenTest in schaltli-android).
//
// Since 2026-10-13 the app draws them itself, as every board does
// (tasks/android-draws-all-plan.md); before, they reached it baked into a
// background picture the designer made, so there was nothing to compare. A
// line is the designer's render-line.ts - Bresenham, thick segments as
// rotated rectangles, fillets in sixteen hops, arrowheads as triangles - and
// a box its render-box.ts, the Adafruit rounded rectangle twice. Both are
// whole pixels on purpose, so the copies can agree exactly.
//
// Run (needs the designer dev server, npm run dev):
//   node hil/android/fixtures/build-static-golden.js
const fs = require("fs")
const path = require("path")
const { chromium } = require("playwright")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const OUT_PATH = path.join(__dirname, "..", "..", "..", "..", "schaltli-android", "app", "src", "test", "resources", "static-object-golden.json")

const line = (name, points, props = {}) => ({
  name,
  width: 120,
  height: 90,
  obj: { id: name, type: "line", x: 0, y: 0, width: 0, height: 0, properties: { color: "#000000", points, ...props } },
})
const box = (name, x, y, w, h, props) => ({
  name,
  width: 120,
  height: 90,
  obj: { id: name, type: "box", x, y, width: w, height: h, properties: props },
})

const CASES = [
  line("thin-diagonal", [{ x: 5, y: 7 }, { x: 110, y: 61 }]),
  line("thin-steep", [{ x: 40, y: 3 }, { x: 52, y: 85 }]),
  line("thin-horizontal-and-vertical", [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 80 }]),
  line("thick-3", [{ x: 8, y: 80 }, { x: 112, y: 12 }], { strokeWidth: 3 }),
  line("thick-6-zigzag", [{ x: 10, y: 80 }, { x: 40, y: 10 }, { x: 70, y: 80 }, { x: 110, y: 20 }], { strokeWidth: 6 }),
  line("fillet-thin", [{ x: 10, y: 80 }, { x: 60, y: 10 }, { x: 110, y: 80 }], { filletRadius: 12 }),
  line("fillet-thick", [{ x: 10, y: 15 }, { x: 100, y: 15 }, { x: 100, y: 80 }, { x: 20, y: 70 }], { strokeWidth: 4, filletRadius: 18 }),
  line("fillet-sharp-clamped", [{ x: 10, y: 80 }, { x: 60, y: 8 }, { x: 70, y: 80 }], { strokeWidth: 2, filletRadius: 40 }),
  line("arrows-thin", [{ x: 15, y: 45 }, { x: 105, y: 45 }], { arrowStart: true, arrowEnd: true }),
  line("arrows-thick-diagonal", [{ x: 15, y: 75 }, { x: 105, y: 15 }], { strokeWidth: 5, arrowEnd: true }),
  box("box-plain", 10, 10, 60, 40, { fillColor: "#3366cc", strokeColor: "transparent" }),
  box("box-border", 10, 10, 90, 60, { fillColor: "#ffcc00", strokeColor: "#202020", strokeWidth: 3 }),
  box("box-rounded", 5, 5, 100, 70, { fillColor: "#00aa55", strokeColor: "transparent", cornerRadius: 14 }),
  box("box-rounded-border", 5, 5, 100, 70, { fillColor: "#eeeeee", strokeColor: "#aa0000", strokeWidth: 4, cornerRadius: 20 }),
  box("box-pill", 10, 30, 100, 24, { fillColor: "#5040a0", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 40 }),
]

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })
    const out = []
    for (const c of CASES) {
      const ink = await page.evaluate((req) => window.__staticObjectPixelsForTest(req), c)
      out.push({ ...c, ink })
      console.log(`${c.name}: ${ink.length} px`)
    }
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1))
    console.log(`wrote ${OUT_PATH}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
