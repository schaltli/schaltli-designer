// Writes lib/needle-raster/vectors.json from the designer's own
// lib/needle-raster.ts: the cases the firmware (src/project/NeedleRaster)
// and the app (NeedleRaster.kt) run too. Run after a change to
// needle-raster.ts or instrument-needles.ts and look at the diff -
// e2e/needle-raster.spec.ts fails until the file says what the code does.
//
//   npx tsx scripts/needle-raster-vectors.ts

import fs from "node:fs"
import path from "node:path"
import { angle64Of, drawNeedle, levelOf, rgb565Picture, type NeedleDescription, type NeedlePose } from "../lib/needle-raster"
import { barNeedle, gaugeNeedle, hex565, softTable } from "../lib/instrument-needles"

const GROUND = hex565("#203040")

const triangle: NeedleDescription = {
  pivot: { x: 96, y: 96 },
  layers: [{ motion: "rotate", shapes: [{ poly: [[88, 100], [104, 100], [97, 20]] }], color: hex565("#ff3010"), alpha: 256 }],
}
const ring: NeedleDescription = {
  pivot: { x: 96, y: 96 },
  layers: [{ motion: "rotate", shapes: [{ circle: [96, 44, 22, 12] }], color: hex565("#f0e0c0"), alpha: 200 }],
}
const glow: NeedleDescription = {
  pivot: { x: 96, y: 96 },
  layers: [
    { motion: "rotate", shapes: [{ poly: [[92, 96], [100, 96], [97, 24], [95, 24]] }], color: hex565("#ff4a1f"), alpha: 256, soft: softTable(160, 4) },
    { motion: "rotate", shapes: [{ poly: [[92, 96], [100, 96], [97, 24], [95, 24]] }], color: hex565("#ff4a1f"), alpha: 256 },
  ],
}
const shadow: NeedleDescription = {
  pivot: { x: 96, y: 96 },
  layers: [
    { motion: "rotate", shapes: [{ poly: [[90, 104], [102, 104], [97, 24]] }, { circle: [96, 96, 10] }], color: 0, alpha: 256, soft: softTable(120, 3), dy: 16 },
    { motion: "rotate", shapes: [{ poly: [[90, 104], [102, 104], [97, 24]] }, { circle: [96, 96, 10] }], color: hex565("#1b120a"), alpha: 256 },
  ],
}
const pointer: NeedleDescription = {
  pivot: { x: 0, y: 0 },
  layers: [{ motion: "translate", shapes: [{ poly: [[16, 40], [40, 28], [40, 52]] }], color: hex565("#f4f4f4"), alpha: 256, soft: undefined }],
}

const fillRight: NeedleDescription = {
  pivot: { x: 0, y: 0 },
  layers: [
    { motion: "fill", grow: "right", shapes: [{ rect: [20, 36, 172, 60] }], color: hex565("#ff2a12"), alpha: 256, soft: softTable(130, 2), gradient: { to: hex565("#ff9a4a"), axis: "x", start: 2, length: 20 } },
    { motion: "fill", grow: "right", shapes: [{ rect: [20, 36, 172, 60] }], color: hex565("#ff2a12"), alpha: 256, gradient: { to: hex565("#ff9a4a"), axis: "x", start: 2, length: 20 } },
  ],
}
const fillUp: NeedleDescription = {
  pivot: { x: 0, y: 0 },
  layers: [
    { motion: "fill", grow: "up", shapes: [{ rect: [36, 12, 60, 180] }], color: hex565("#ff9a4a"), alpha: 220, gradient: { to: hex565("#ff2a12"), axis: "y", start: 1, length: 22 } },
    { motion: "static", shapes: [{ rect: [36, 90, 60, 98] }], color: hex565("#0d0d0d"), alpha: 256 },
  ],
}
const fillLeft: NeedleDescription = {
  pivot: { x: 0, y: 0 },
  layers: [{ motion: "fill", grow: "left", shapes: [{ rect: [13, 30, 170, 61] }], color: hex565("#ff6a13"), alpha: 256 }],
}
const arc = (from: number, to: number, soft?: number[]): NeedleDescription => ({
  pivot: { x: 100, y: 100 },
  layers: [
    ...(soft ? [{ motion: "fill" as const, shapes: [{ arc: [70, 10, angle64Of(from), angle64Of(to)] as [number, number, number, number] }], color: hex565("#ff2a12"), alpha: 256, soft, gradient: { to: hex565("#ff9a4a"), axis: "x" as const, start: 2, length: 21 } }] : []),
    { motion: "fill", shapes: [{ arc: [70, 10, angle64Of(from), angle64Of(to)] }], color: hex565("#ff2a12"), alpha: 256, gradient: { to: hex565("#ff9a4a"), axis: "x", start: 2, length: 21 } },
  ],
})
const ringStatic: NeedleDescription = {
  pivot: { x: 100, y: 100 },
  layers: [{ motion: "static", shapes: [{ arc: [66, 7, angle64Of(-90), angle64Of(270)] }], color: hex565("#d0e0f0"), alpha: 180, soft: undefined }],
}

const bars: NeedleDescription = {
  pivot: { x: 0, y: 0 },
  layers: [
    { motion: "segments", shapes: [{ rect: [8, 40, 40, 80], t: 1024 }, { rect: [56, 32, 88, 80], t: 2048 }, { rect: [104, 24, 136, 80], t: 3072 }, { rect: [152, 16, 184, 80] }], color: hex565("#3df5d0"), alpha: 256, soft: softTable(110, 2) },
    { motion: "segments", shapes: [{ rect: [8, 40, 40, 80], t: 1024 }, { rect: [56, 32, 88, 80], t: 2048 }, { rect: [104, 24, 136, 80], t: 3072 }, { rect: [152, 16, 184, 80] }], color: hex565("#3df5d0"), alpha: 256 },
  ],
}

const clipped: NeedleDescription = {
  pivot: { x: 96, y: 176 },
  layers: [
    { motion: "rotate", shapes: [{ poly: [[90, 176], [102, 176], [97, 24]] }], color: 0, alpha: 256, soft: softTable(120, 2), dy: 8, clip: [3, 4, 21, 15] },
    { motion: "rotate", shapes: [{ poly: [[90, 176], [102, 176], [97, 24]] }], color: hex565("#111111"), alpha: 256, clip: [3, 4, 21, 15] },
  ],
}

const pose = (deg: number, shiftX = 0, shiftY = 0, level = 0): NeedlePose => ({ angle64: angle64Of(deg), shiftX, shiftY, level })

function render(desc: NeedleDescription, p: NeedlePose, w: number, h: number): string {
  const pic = rgb565Picture(w, h, GROUND)
  drawNeedle(pic, desc, p)
  return Array.from(pic.pixels, (c) => c.toString(16).padStart(4, "0")).join("")
}

const cases = [
  { name: "a triangle pointing up", desc: triangle, pose: pose(0), width: 24, height: 24 },
  { name: "the triangle at 45 degrees", desc: triangle, pose: pose(45), width: 24, height: 24 },
  { name: "the triangle at -127.3 degrees (between table entries)", desc: triangle, pose: pose(-127.3), width: 24, height: 24 },
  { name: "a ring, translucent, at 90 degrees", desc: ring, pose: pose(90), width: 24, height: 24 },
  { name: "a glowing needle at 30 degrees", desc: glow, pose: pose(30), width: 24, height: 24 },
  { name: "a needle with a shadow that falls down at 120 degrees", desc: shadow, pose: pose(120), width: 24, height: 24 },
  { name: "a pointer shifted along the scale", desc: pointer, pose: pose(0, 61, 0), width: 24, height: 12 },
  { name: "the fuel gauge's needle at 45 degrees, 64 px", desc: gaugeNeedle("fuel", 64), pose: pose(45), width: 64, height: 64 },
  { name: "the fuel gauge's needle at -55 degrees, 64 px", desc: gaugeNeedle("fuel", 64), pose: pose(-55), width: 64, height: 64 },
  { name: "a fill growing right, glowing, red to orange", desc: fillRight, pose: pose(0, 97, 0), width: 25, height: 12 },
  { name: "a fill growing up, translucent, a stripe over it", desc: fillUp, pose: pose(0, 0, -101), width: 12, height: 25 },
  { name: "a fill growing left, overshooting its end", desc: fillLeft, pose: pose(0, -200, 0), width: 24, height: 10 },
  { name: "a fill growing left, nothing yet", desc: fillLeft, pose: pose(0, 0, 0), width: 24, height: 10 },
  { name: "an arc filled from -60 to 50 degrees", desc: arc(-60, 120), pose: pose(50), width: 25, height: 25 },
  { name: "an arc filled from -130 to 110 degrees, glowing", desc: arc(-130, 130, softTable(130, 3)), pose: pose(110), width: 25, height: 25 },
  { name: "an arc held at its end when the needle overshoots", desc: arc(-130, 130, softTable(130, 2)), pose: pose(133.2), width: 25, height: 25 },
  { name: "an arc below its start draws nothing", desc: arc(-130, 130), pose: pose(-131), width: 25, height: 25 },
  { name: "a whole ring, translucent", desc: ringStatic, pose: pose(0), width: 25, height: 25 },
  { name: "the rally gauge's needle at 100 degrees, 64 px", desc: gaugeNeedle("rally", 64), pose: pose(100), width: 64, height: 64 },
  { name: "the night cluster at 37 degrees, 64 px", desc: gaugeNeedle("night", 64), pose: pose(37), width: 64, height: 64 },
  { name: "a needle and its shadow clipped to a window", desc: clipped, pose: pose(25), width: 24, height: 24 },
  { name: "the pressure gauge's needle at -100 degrees, 64 px", desc: gaugeNeedle("pressure", 64), pose: pose(-100), width: 64, height: 64 },
  { name: "the moving-coil needle at 33 degrees, clipped, 64 px", desc: gaugeNeedle("coil", 64), pose: pose(33), width: 64, height: 64 },
  ...(() => {
    const w = barNeedle("pressure", 26, 72, "bottom-to-top")
    const c = barNeedle("coil", 70, 24, "right-to-left")
    return [
      { name: "the sight glass at 0.55, 26 x 72", desc: w.desc, pose: pose(0, 0, Math.floor(0.55 * w.travelY + 0.5)), width: 26, height: 72 },
      { name: "the profile meter at 0.3, right to left, 70 x 24", desc: c.desc, pose: pose(0, Math.floor(0.3 * c.travelX + 0.5), 0), width: 70, height: 24 },
    ]
  })(),
  { name: "the art deco needle at 70 degrees, 64 px", desc: gaugeNeedle("deco", 64), pose: pose(70), width: 64, height: 64 },
  { name: "the engraving needle at -20 degrees, 64 px", desc: gaugeNeedle("engraving", 64), pose: pose(-20), width: 64, height: 64 },
  ...(() => {
    const d = barNeedle("deco", 24, 72, "top-to-bottom")
    const e = barNeedle("engraving", 72, 26, "left-to-right")
    return [
      { name: "the art deco band at 0.7, top to bottom, 24 x 72", desc: d.desc, pose: pose(0, 0, Math.floor(0.7 * d.travelY + 0.5)), width: 24, height: 72 },
      { name: "the engraving's hatched fill at 0.45, 72 x 26", desc: e.desc, pose: pose(0, Math.floor(0.45 * e.travelX + 0.5), 0), width: 72, height: 26 },
    ]
  })(),
  { name: "the roadster needle at 110 degrees, 64 px", desc: gaugeNeedle("roadster", 64), pose: pose(110), width: 64, height: 64 },
  { name: "the cockpit needle at -140 degrees, 64 px", desc: gaugeNeedle("cockpit", 64), pose: pose(-140), width: 64, height: 64 },
  ...(() => {
    const r = barNeedle("roadster", 72, 26, "left-to-right")
    const k = barNeedle("cockpit", 26, 72, "top-to-bottom")
    return [
      { name: "the roadster bar's needle at 0.8, 72 x 26", desc: r.desc, pose: pose(0, Math.floor(0.8 * r.travelX + 0.5), 0), width: 72, height: 26 },
      { name: "the cockpit bar's pointer at 0.35, top to bottom, 26 x 72", desc: k.desc, pose: pose(0, 0, Math.floor(0.35 * k.travelY + 0.5)), width: 26, height: 72 },
    ]
  })(),
  { name: "segments at level 2047: one lit, the next not yet", desc: bars, pose: pose(0, 0, 0, 2047), width: 24, height: 12 },
  { name: "segments at level 2048: the second lights", desc: bars, pose: pose(0, 0, 0, 2048), width: 24, height: 12 },
  { name: "the VFD ring at 0.6, 64 px", desc: gaugeNeedle("vfd", 64, { zones: [{ from: 0, to: 0.2, kind: "danger" }] }), pose: pose(0, 0, 0, levelOf(0.6)), width: 64, height: 64 },
  { name: "the VFD bar at 0.37, 80 x 30", desc: barNeedle("vfd", 80, 30, "left-to-right").desc, pose: pose(0, 0, 0, levelOf(0.37)), width: 80, height: 30 },
  ...(() => {
    const b = barNeedle("rally", 72, 26, "left-to-right")
    const n = barNeedle("night", 24, 70, "bottom-to-top")
    return [
      { name: "the rally bar at 0.63, 72 x 26", desc: b.desc, pose: pose(0, Math.floor(0.63 * b.travelX + 0.5), 0), width: 72, height: 26 },
      { name: "the night strip at 0.4, standing, 24 x 70", desc: n.desc, pose: pose(0, 0, Math.floor(0.4 * n.travelY + 0.5)), width: 24, height: 70 },
    ]
  })(),
].map((c) => ({ ...c, ground: GROUND, expected: render(c.desc, c.pose, c.width, c.height) }))

const out = {
  _comment:
    "Generated by scripts/needle-raster-vectors.ts from lib/needle-raster.ts. Each case: draw `desc` in `pose` onto a picture of `ground`; `expected` is the RGB565 result, 4 hex digits per pixel, row by row.",
  cases,
}
const file = path.join(__dirname, "..", "lib", "needle-raster", "vectors.json")
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n")
console.log(`wrote ${cases.length} cases to ${file}`)
