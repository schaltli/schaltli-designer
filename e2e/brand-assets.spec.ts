/**
 * Bewacht den Markensatz unter brand/ (siehe brand/README.md).
 *
 * Erzeugt wird er von e2e/brand-generate.spec.ts, das nur mit REGEN_BRAND=1
 * läuft. Dieser Test hier schreibt nichts - er prüft die eingecheckten
 * Dateien auf die Eigenschaften, die sie überhaupt brauchbar machen:
 * Umrisse statt Schriftabhängigkeit, echtes Ein-Bit fürs E-Paper, und eine
 * Animation, die ohne Schriftlieferung läuft und beim Endbild die Kugel oben
 * stehen hat.
 */
import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

const BRAND = path.join(process.cwd(), "brand")
const file = (...p: string[]) => path.join(BRAND, ...p)
const read = (...p: string[]) => fs.readFileSync(file(...p), "utf8")

test("jedes Stück des Markensatzes liegt da", async () => {
  for (const f of [
    "mark.svg", "icon.svg", "mark-small.svg", "mark-outline.svg", "icon-square.svg",
    "wordmark.svg", "wordmark-dark.svg", "glyphs.js", "intro.js", "intro.html",
    "favicon-16.png", "favicon-32.png", "apple-touch-icon-180.png", "icon-512.png",
    "device/splash-knob-360x360.png", "device/splash-4v3b-800x480.png",
    "device/splash-papers3-960x540.png", "device/splash-epaper-400x300-1bit.png",
  ]) {
    expect(fs.existsSync(file(...f.split("/"))), `${f} fehlt`).toBe(true)
    expect(fs.statSync(file(...f.split("/"))).size, `${f} ist leer`).toBeGreaterThan(64)
  }
})

test("der Schriftzug trägt Umrisse, keine Schriftabhängigkeit", async () => {
  for (const f of ["wordmark.svg", "wordmark-dark.svg"]) {
    const svg = read(f)
    // <text> würde die Schrift beim Betrachter voraussetzen - genau das nicht.
    expect(svg, `${f} verlässt sich auf eine Schrift`).not.toContain("<text")
    expect(svg).not.toContain("font-family")
    expect(svg).toContain("<path d=")
    // der Pfad muss echte Kurven enthalten, nicht bloss ein Rechteck
    expect(svg.match(/<path d="([^"]+)"/)![1].length).toBeGreaterThan(400)
  }
  // hell und dunkel müssen gegeneinander ausgespart sein
  expect(read("wordmark.svg")).toContain("#ffffff")
  expect(read("wordmark-dark.svg")).toContain("#111111")
})

test("das E-Paper-Bild ist wirklich einbittig", async ({ page }) => {
  const b64 = fs.readFileSync(file("device", "splash-epaper-400x300-1bit.png")).toString("base64")
  const tones = await page.evaluate(async (b64) => {
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej
      img.src = "data:image/png;base64," + b64
    })
    const c = document.createElement("canvas")
    c.width = img.width; c.height = img.height
    const g = c.getContext("2d")!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const seen = new Set<number>()
    for (let i = 0; i < d.length; i += 4) seen.add(d[i])
    return { values: [...seen].sort((a, b) => a - b), w: img.width, h: img.height }
  }, b64)
  expect(tones.w).toBe(400)
  expect(tones.h).toBe(300)
  // genau zwei Töne, und die müssen schwarz und weiss sein
  expect(tones.values).toEqual([0, 255])
})

test("der Auftritt läuft ohne Schrift und endet mit der Kugel oben", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto("file:///" + file("intro.html").replace(/\\/g, "/"))
  await page.waitForTimeout(4200)          // ein voller Durchlauf
  expect(errors, errors.join("\n")).toHaveLength(0)

  const shot = await page.evaluate(() => {
    const c = document.querySelector("#light canvas") as HTMLCanvasElement
    const g = c.getContext("2d")!
    const d = g.getImageData(0, 0, c.width, c.height).data
    let ink = 0
    // Die Kugel ist die Aussparung IM Zeichen. Wir suchen die dunkelste
    // Spalte ganz rechts (die stehende Pille) und fragen, wo darin das
    // Loch sitzt - oben oder unten.
    let right = 0
    for (let x = 0; x < c.width; x++) {
      for (let y = 0; y < c.height; y++) {
        const a = d[(y * c.width + x) * 4 + 3]
        if (a > 40) { ink++; if (x > right) right = x }
      }
    }
    const colX = Math.max(0, right - Math.round(c.width * 0.02))
    let firstInk = -1, lastInk = -1, holeY = -1
    for (let y = 0; y < c.height; y++) {
      const i = (y * c.width + colX) * 4
      const solid = d[i + 3] > 40 && d[i] < 120
      if (solid) { if (firstInk < 0) firstInk = y; lastInk = y }
      else if (firstInk >= 0 && lastInk === y - 1 && holeY < 0 && d[i + 3] > 40) holeY = y
    }
    return { ink, firstInk, lastInk, holeY, h: c.height }
  })

  expect(shot.ink, "das Endbild ist leer").toBeGreaterThan(2000)

  // Nichts darf aus einem früheren Bild stehenbleiben. Beim Neustart liegt
  // die Pille flach unten und die Buchstaben fehlen noch - die obere Hälfte
  // muss also restlos leer sein. Eine zu klein gerechnete Löschfläche hat
  // hier schon einmal eine feine Linie am rechten Rand hinterlassen.
  const leftovers = await page.evaluate(async () => {
    ;(window as any).__again()
    await new Promise((r) => setTimeout(r, 260))   // noch im Anlauf
    const c = document.querySelector("#light canvas") as HTMLCanvasElement
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, Math.floor(c.height * 0.45)).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++
    return n
  })
  expect(leftovers, "Reste aus einem früheren Bild").toBe(0)
  expect(shot.firstInk).toBeGreaterThanOrEqual(0)
  // Das Loch liegt in der oberen Hälfte der stehenden Pille: die Kugel ist
  // das Tüpfelchen geworden, nicht am Fuss liegen geblieben.
  const mid = (shot.firstInk + shot.lastInk) / 2
  expect(shot.holeY, "kein Loch in der Pille gefunden").toBeGreaterThan(-1)
  expect(shot.holeY).toBeLessThan(mid)
})

test("nichts liegt bündig an der Kante", async ({ page }) => {
  // Eine Form, die den Rand des viewBox berührt, wird von der Kantenglättung
  // angeschnitten: übrig bleibt eine halbdeckende Haarlinie, im SVG wie auf
  // der Leinwand. Deshalb muss auf allen vier Seiten Luft sein.
  await page.goto("file:///" + file("intro.html").replace(/\\/g, "/"))
  await page.waitForTimeout(4300)                  // einmal ganz durch

  const edges = await page.evaluate(() => {
    const c = document.querySelector("#light canvas") as HTMLCanvasElement
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data
    const col = (x: number) => {
      let m = 0
      for (let y = 0; y < c.height; y++) {
        const a = d[(y * c.width + x) * 4 + 3]
        if (a > m) m = a
      }
      return m
    }
    return { left: col(0), right: col(c.width - 1), width: c.width }
  })

  expect(edges.right, "Haarlinie am rechten Rand").toBe(0)
  expect(edges.left, "Haarlinie am linken Rand").toBe(0)

  // und dieselbe Luft im SVG, wo dasselbe passiert
  for (const f of ["wordmark.svg", "wordmark-dark.svg"]) {
    const vb = read(f).match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number)
    expect(vb[0], `${f} hat links keine Luft`).toBeLessThan(0)
  }
})
