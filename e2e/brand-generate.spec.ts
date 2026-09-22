/**
 * Erzeugt den Markensatz unter brand/ neu. Läuft NICHT im normalen Durchgang
 * mit - er schreibt ins Arbeitsverzeichnis, und die Dateien sind eingecheckt.
 *
 *   REGEN_BRAND=1 npx playwright test e2e/brand-generate.spec.ts
 *
 * Braucht Netz: opentype.js von cdnjs und die Schriftdatei, die vorher unter
 * FONT_TTF liegen muss (aus google/fonts/ofl/varelaround, SIL OFL).
 * Was dabei herauskommt, bewacht e2e/brand-assets.spec.ts.
 */
import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

const BRAND = path.join(process.cwd(), "brand")
const FONT_TTF = process.env.FONT_TTF ?? path.join(BRAND, "VarelaRound-Regular.ttf")
const OUT = process.env.SCRATCH_OUT ?? BRAND

test.skip(!process.env.REGEN_BRAND, "nur mit REGEN_BRAND=1 - schreibt in brand/")

// Geometrie des Zeichens, einmal hier - alles andere leitet sich ab.
const F = 100                       // Schriftgrad, in dem der Schriftzug gebaut wird
const CAP_W = F * 0.30              // Dicke der stehenden Pille (das i)
const CAP_H = F * 0.74              // ihre Länge
const BALL = CAP_W / 3              // Kugelradius
const GAP = F * 0.07                // Abstand Wort zu Pille

const n = (v: number) => Math.round(v * 100) / 100

function markTight(ball = 6.5, h = 24, y = 2) {
  return `<rect x="2" y="${y}" width="44" height="${h}" rx="${h / 2}" fill="currentColor"/>`
    + `<circle cx="34" cy="${y + h / 2}" r="${ball}" fill="var(--knockout, #fff)"/>`
}

test("erzeugt den Markensatz neu", async ({ page }) => {
  fs.mkdirSync(path.join(BRAND, "device"), { recursive: true })

  const ttf = fs.readFileSync(FONT_TTF).toString("base64")
  await page.goto("about:blank")
  await page.addScriptTag({ url: "https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js" })

  // --- Schriftzug in Pfade -------------------------------------------------
  const word = await page.evaluate(({ b64, F }) => {
    const bin = atob(b64)
    const buf = new ArrayBuffer(bin.length)
    const view = new Uint8Array(buf)
    for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
    const font = (window as any).opentype.parse(buf)
    const text = "Schaltl"
    const p = font.getPath(text, 0, 0, F)      // Grundlinie auf y = 0
    const bb = p.getBoundingBox()
    // zusätzlich jeden Buchstaben einzeln, damit die Animation sie
    // nacheinander einblenden kann, ohne die Schrift zu brauchen
    const letters: { d: string }[] = []
    for (let i = 0; i < text.length; i++) {
      const x = font.getAdvanceWidth(text.slice(0, i), F)
      letters.push({ d: font.getPath(text[i], x, 0, F).toPathData(2) })
    }
    return { d: p.toPathData(2), advance: font.getAdvanceWidth(text, F), letters,
             x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 }
  }, { b64: ttf, F })

  expect(word.d.length).toBeGreaterThan(200)

  // Lage der Pille: rechts neben dem Wort, Fuss auf der Grundlinie.
  const capX = word.advance + GAP
  const capTop = -CAP_H
  const ballCY = capTop + CAP_W / 2
  const totalW = capX + CAP_W
  // Luft auf ALLEN vier Seiten. Ohne die liegt die Pille bündig an der
  // rechten Kante, und jede Kantenglättung macht daraus eine halbdeckende
  // Haarlinie - im SVG wie auf der Leinwand der Animation.
  const PAD = 4
  const top = Math.min(word.y1, capTop) - PAD
  const bottom = PAD
  const vb = `${-PAD} ${n(top)} ${n(totalW + 2 * PAD)} ${n(bottom - top)}`

  const pill = (knock: string) =>
    `<rect x="${n(capX)}" y="${n(capTop)}" width="${n(CAP_W)}" height="${n(CAP_H)}" rx="${n(CAP_W / 2)}" fill="currentColor"/>`
    + `<circle cx="${n(capX + CAP_W / 2)}" cy="${n(ballCY)}" r="${n(BALL)}" fill="${knock}"/>`

  const wordmark = (ink: string, knock: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Schaltli">`
    + `<g fill="${ink}" color="${ink}"><path d="${word.d}"/>${pill(knock)}</g></svg>\n`

  fs.writeFileSync(path.join(BRAND, "wordmark.svg"), wordmark("#111111", "#ffffff"))
  fs.writeFileSync(path.join(BRAND, "wordmark-dark.svg"), wordmark("#ffffff", "#111111"))

  // --- Zeichen -------------------------------------------------------------
  const svg = (vbx: string, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbx}" fill="none" role="img" aria-label="Schaltli">${body}</svg>\n`

  // A2: das Hauptzeichen, Luft um die Kugel
  fs.writeFileSync(path.join(BRAND, "mark.svg"), svg("0 0 48 28",
    `<rect x="2" y="2" width="44" height="24" rx="12" fill="#111111"/><circle cx="34" cy="14" r="6.5" fill="#ffffff"/>`))
  // quadratisch, für Icons
  fs.writeFileSync(path.join(BRAND, "icon.svg"), svg("0 0 48 48",
    `<rect x="2" y="12" width="44" height="24" rx="12" fill="#111111"/><circle cx="34" cy="24" r="6.5" fill="#ffffff"/>`))
  // A3: satter, ab 24 px abwärts
  fs.writeFileSync(path.join(BRAND, "mark-small.svg"), svg("0 0 48 48",
    `<rect x="2" y="10" width="44" height="28" rx="14" fill="#111111"/><circle cx="34" cy="24" r="9" fill="#ffffff"/>`))
  // A4: Kontur, für helle Flächen und Druck
  fs.writeFileSync(path.join(BRAND, "mark-outline.svg"), svg("0 0 48 48",
    `<rect x="3.5" y="13.5" width="41" height="21" rx="10.5" fill="none" stroke="#111111" stroke-width="3"/>`
    + `<circle cx="34" cy="24" r="7" fill="#111111"/>`))
  // App-Icon: gefülltes Quadrat, Zeichen ausgespart. Ein liegendes Zeichen
  // füllt ein Quadrat nie - als Negativ im Vollton tut es das.
  fs.writeFileSync(path.join(BRAND, "icon-square.svg"), svg("0 0 48 48",
    `<rect width="48" height="48" rx="11" fill="#111111"/>`
    + `<rect x="7" y="16" width="34" height="19" rx="9.5" fill="#ffffff"/>`
    + `<circle cx="32" cy="25.5" r="6" fill="#111111"/>`))

  // Glyphen als Daten, damit die Animation ohne Schriftlieferung auskommt
  fs.writeFileSync(path.join(BRAND, "glyphs.js"),
    `// Erzeugt aus Varela Round (SIL Open Font License) - echte Umrisse, keine\n`
    + `// Schrift nötig. Grundlinie liegt auf y = 0, Schriftgrad ${F}.\n`
    + `window.SCHALTLI_GLYPHS = ${JSON.stringify({
      fontSize: F, advance: n(word.advance), viewBox: vb,
      cap: { x: n(capX), y: n(capTop), w: n(CAP_W), h: n(CAP_H), ballR: n(BALL), ballCY: n(ballCY) },
      letters: word.letters,
    }, null, 1)}\n`)

  // --- Rastergrafik --------------------------------------------------------
  const png = async (source: string, w: number, h: number, oneBit = false, fill = 0.62) => {
    return await page.evaluate(async ({ source, w, h, oneBit, fill }) => {
      const img = new Image()
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source)
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      const c = document.createElement("canvas")
      c.width = w; c.height = h
      const g = c.getContext("2d")!
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h)
      // mittig einpassen; fill = 1 heisst randlos
      const target = w * fill
      const scale = Math.min(target / img.width, (h * fill) / img.height)
      const dw = img.width * scale, dh = img.height * scale
      g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
      if (oneBit) {
        const d = g.getImageData(0, 0, w, h)
        for (let i = 0; i < d.data.length; i += 4) {
          const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
          const v = lum < 128 ? 0 : 255
          d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255
        }
        g.putImageData(d, 0, 0)
      }
      return c.toDataURL("image/png").split(",")[1]
    }, { source, w, h, oneBit, fill })
  }

  const squareSvg = fs.readFileSync(path.join(BRAND, "icon-square.svg"), "utf8")
  const wordSvg = fs.readFileSync(path.join(BRAND, "wordmark.svg"), "utf8")

  const write = (p: string, b64: string) => fs.writeFileSync(p, Buffer.from(b64, "base64"))

  // Icons randlos aus dem Vollton-Quadrat, damit sie ihr Feld ausfüllen
  write(path.join(BRAND, "favicon-16.png"), await png(squareSvg, 16, 16, false, 1))
  write(path.join(BRAND, "favicon-32.png"), await png(squareSvg, 32, 32, false, 1))
  write(path.join(BRAND, "apple-touch-icon-180.png"), await png(squareSvg, 180, 180, false, 1))
  write(path.join(BRAND, "icon-512.png"), await png(squareSvg, 512, 512, false, 1))

  // Boot-Bilder in den echten Auflösungen der vier Boards
  write(path.join(BRAND, "device", "splash-knob-360x360.png"), await png(wordSvg, 360, 360))
  write(path.join(BRAND, "device", "splash-4v3b-800x480.png"), await png(wordSvg, 800, 480))
  write(path.join(BRAND, "device", "splash-papers3-960x540.png"), await png(wordSvg, 960, 540))
  write(path.join(BRAND, "device", "splash-epaper-400x300-1bit.png"), await png(wordSvg, 400, 300, true))

  // Kontaktbogen zum Ansehen
  const sheet = `<!doctype html><meta charset="utf-8"><style>
body{font:12px system-ui;margin:20px;background:#fff}
h3{font-size:11px;color:#79747E;text-transform:uppercase;letter-spacing:.3px;margin:18px 0 6px}
.r{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}
img{background:#fff;border:1px solid #eee}
.d{background:#111;padding:14px;border-radius:8px}
</style>
<h3>Zeichen</h3><div class="r">
<img src="mark.svg" height="46"><img src="icon.svg" height="64"><img src="mark-small.svg" height="40">
<img src="mark-outline.svg" height="64"><img src="icon-square.svg" height="64"></div>
<h3>Schriftzug</h3><div class="r"><img src="wordmark.svg" height="62">
<span class="d"><img src="wordmark-dark.svg" height="62" style="border:0;background:none"></span></div>
<h3>Favicon und Icons</h3><div class="r">
<img src="favicon-16.png"><img src="favicon-32.png"><img src="apple-touch-icon-180.png" height="90"></div>
<h3>Boot-Bilder der vier Boards</h3><div class="r">
<img src="device/splash-knob-360x360.png" height="150">
<img src="device/splash-4v3b-800x480.png" height="150">
<img src="device/splash-papers3-960x540.png" height="150">
<img src="device/splash-epaper-400x300-1bit.png" height="150"></div>
`
  fs.writeFileSync(path.join(BRAND, "contact-sheet.html"), sheet)

  await page.setViewportSize({ width: 1080, height: 900 })
  await page.goto("file:///" + path.join(BRAND, "contact-sheet.html").replace(/\\/g, "/"))
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, "brand-sheet.png"), fullPage: true })
})
