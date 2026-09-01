// Renders a sheet of arc-level examples through the designer's own
// rasterizer, so the look can be judged before the object type is wired into
// the editor.
const { chromium } = require("playwright")
const fs = require("fs")

// Output path: first CLI argument, else a file next to this script. Was a
// hardcoded temp path while this lived as a scratch file; it is a tool now,
// so it must not write into one developer's machine.
const OUT = process.argv[2] || require("path").join(__dirname, "preview-sheet.png")
const BG = "#101010"

const cal = (lo, hi) => [
  { value: lo, barSizePercent: 0 },
  { value: hi, barSizePercent: 100 },
]

function arc(size, props, values) {
  return {
    obj: { id: "a", type: "arc-level", x: 0, y: 0, width: size, height: size, zIndex: 0, properties: props },
    values,
    size,
  }
}

const T = "room/temp"
const S = "room/setpoint"
const L = "tank/level"

const examples = [
  {
    label: "Thermostat 7:30 → 4:30<br><b>Füllung = Ist, Marker = Soll</b>",
    ...arc(220, {
      topic: T, setpointTopic: S, calibrationPoints: cal(15, 25),
      minAngle: 225, maxAngle: 135, thickness: 22,
      trackColor: "#2a2a2a", fillColor: "#ff8c21", markerColor: "#ffffff",
      displayValue: "value", textColor: "#ffffff", fontSize: 46,
    }, { [T]: "21.4", [S]: "23.0" }),
  },
  {
    label: "Voll 12 → 12<br>ein Topic, kein Marker",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 0, maxAngle: 0, thickness: 22,
      trackColor: "#22303a", fillColor: "#00aaff",
      displayValue: "percentage", textColor: "#ffffff", fontSize: 46,
    }, { [L]: "68" }),
  },
  {
    label: "Tacho 8 → 4<br>90 % Ausschlag",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 240, maxAngle: 120, thickness: 22,
      trackColor: "#3a2222", fillColor: "#ff3b30",
      displayValue: "value", textColor: "#ffffff", fontSize: 46,
    }, { [L]: "90" }),
  },
  {
    label: "Halbrund 9 → 3<br>untere Hälfte frei",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 270, maxAngle: 90, thickness: 22,
      trackColor: "#2a2a2a", fillColor: "#00fb00",
      displayValue: "percentage", textColor: "#ffffff", fontSize: 40,
    }, { [L]: "25" }),
  },
  {
    label: "Dünn, 8 px Band<br>gleiche Geometrie",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 225, maxAngle: 135, thickness: 8,
      trackColor: "#2a2a2a", fillColor: "#c9a227",
      displayValue: "value", textColor: "#ffffff", fontSize: 46,
    }, { [L]: "55" }),
  },
  {
    label: "Dick, 44 px Band<br>gleiche Geometrie",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 225, maxAngle: 135, thickness: 44,
      trackColor: "#2a2a2a", fillColor: "#c9a227",
      displayValue: "value", textColor: "#ffffff", fontSize: 40,
    }, { [L]: "55" }),
  },
  {
    label: "Gespiegelt: 4:30 → 7:30 gegen den Uhrzeigersinn<br>gleicher Bogen, Fuellung von rechts",
    ...arc(220, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 135, maxAngle: 225, direction: "ccw", thickness: 22,
      trackColor: "#2a2a2a", fillColor: "#b06cff",
      displayValue: "value", textColor: "#ffffff", fontSize: 46,
    }, { [L]: "60" }),
  },
  {
    label: "Ist hat Soll ueberholt<br>Marker bleibt auf der Fuellung sichtbar",
    ...arc(220, {
      topic: T, setpointTopic: S, calibrationPoints: cal(15, 25),
      minAngle: 225, maxAngle: 135, thickness: 22,
      trackColor: "#2a2a2a", fillColor: "#ff8c21", markerColor: "#ffffff",
      displayValue: "value", textColor: "#ffffff", fontSize: 46,
    }, { [T]: "23.8", [S]: "21.0" }),
  },
  {
    label: "Klein, 110 px<br>hält es der Größe stand?",
    ...arc(110, {
      topic: L, calibrationPoints: cal(0, 100),
      minAngle: 225, maxAngle: 135, thickness: 12,
      trackColor: "#2a2a2a", fillColor: "#00aaff",
      displayValue: "value", textColor: "#ffffff", fontSize: 24,
    }, { [L]: "70" }),
  },
  {
    label: "Zwei Ringe, konzentrisch<br>zwei Werte ohne Platzkampf",
    concentric: true,
    size: 220,
    values: { [T]: "21.4", [L]: "40" },
    objs: [
      { id: "outer", type: "arc-level", x: 0, y: 0, width: 220, height: 220, zIndex: 0, properties: {
        topic: T, calibrationPoints: cal(15, 25), minAngle: 225, maxAngle: 135, thickness: 18,
        trackColor: "#2a2a2a", fillColor: "#ff8c21", displayValue: "none" } },
      { id: "inner", type: "arc-level", x: 24, y: 24, width: 172, height: 172, zIndex: 1, properties: {
        topic: L, calibrationPoints: cal(0, 100), minAngle: 225, maxAngle: 135, thickness: 12,
        trackColor: "#232a2f", fillColor: "#00aaff",
        displayValue: "value", textColor: "#ffffff", fontSize: 40 } },
    ],
  },
]

// The real thing, at the size it will actually be on the device.
const deviceSized = arc(360, {
  topic: T, setpointTopic: S, calibrationPoints: cal(15, 25),
  minAngle: 225, maxAngle: 135, thickness: 26,
  trackColor: "#2a2a2a", fillColor: "#ff8c21", markerColor: "#ffffff",
  displayValue: "value", textColor: "#ffffff", fontSize: 84,
}, { [T]: "21.4", [S]: "23.0" })

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
  page.on("pageerror", (e) => console.log("[page error]", e.message))
  await page.goto("http://localhost:3000/test-render", { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 120000 })

  const shot = async (items, w, h) =>
    page.evaluate(
      ([itms, width, height, bg]) =>
        window.__renderArcSheetForTest({ width, height, background: bg, items: itms }),
      [items, w, h, BG],
    )

  const cards = []
  for (const ex of examples) {
    const items = ex.concentric
      ? ex.objs.map((o) => ({ obj: o, values: ex.values }))
      : [{ obj: ex.obj, values: ex.values }]
    cards.push({ label: ex.label, png: await shot(items, ex.size, ex.size), size: ex.size })
  }
  const devicePng = await shot([{ obj: deviceSized.obj, values: deviceSized.values }], 360, 360)

  const html = `<body style="margin:0;background:#1b1b1b;color:#eee;font:14px system-ui,sans-serif">
    <div style="padding:28px 32px 8px">
      <div style="font-size:22px;font-weight:600">arc-level — Beispielgeometrien</div>
      <div style="opacity:.55;margin-top:4px">Alle Ringe 1:1 aus dem geteilten Rasterizer, 4×4-Deckung, RGB565-Mischung</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:26px;padding:16px 32px 32px">
      ${cards
        .map(
          (c) => `<div style="width:240px">
            <div style="height:240px;display:flex;align-items:center;justify-content:center;background:${BG};border-radius:10px">
              <img src="${c.png}" width="${c.size}" height="${c.size}" style="image-rendering:pixelated">
            </div>
            <div style="margin-top:8px;line-height:1.45;opacity:.85;font-size:12.5px">${c.label}</div>
          </div>`,
        )
        .join("")}
    </div>
    <div style="padding:8px 32px 40px">
      <div style="font-size:16px;font-weight:600;margin-bottom:10px">Gerätegröße, 360 × 360 — so groß wie auf dem Waveshare</div>
      <div style="display:inline-block;background:${BG};border-radius:180px">
        <img src="${devicePng}" width="360" height="360" style="image-rendering:pixelated;display:block">
      </div>
    </div>
  </body>`

  await page.setContent(html)
  await page.waitForTimeout(300)
  const buf = await page.screenshot({ fullPage: true })
  fs.writeFileSync(OUT, buf)
  console.log("wrote", OUT)
  await browser.close()
})()
