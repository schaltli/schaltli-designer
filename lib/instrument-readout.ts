/**
 * A styled instrument's digital readout (docs/2026-11-23-instrument-
 * styles.md, «Fonts»: the style chooses the font; tasks/instrument-styles-
 * todo.md I12). The designer bakes the characters a readout can show - in
 * the style's own typeface, with the style's glow - into a strip of alpha;
 * a device writes the value with them, character by character, in the
 * style's colour. No project font, no fontId.
 *
 * Like the needle raster this is shared arithmetic: formatReadout() and
 * drawReadout() exist in each firmware and in the app, and arrive at the
 * same characters and pixels.
 */
import { blend565 } from "@/lib/level-glow"
import type { Rgb565Target } from "@/lib/needle-raster"

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/** What a readout can show, in the strip's order. */
export const READOUT_CHARS = "0123456789.-"

/** The readout as a device receives it (device contract §2.15). */
export interface ReadoutDescription {
  /** Asset path of the strip (`.a8`: alpha, one byte a pixel). */
  glyphs: string
  chars: string
  /** Per character: where its cell starts in the strip, how wide the cell is, how far the pen moves. Pixels. */
  cells: [number, number, number][]
  /** A cell reaches this far left of the pen (the glow's room). */
  pad: number
  height: number
  /** Pixels, in the object's box: the right edge (align right) or the middle (centre) of the text, and its top. */
  x: number
  y: number
  align: "right" | "center"
  /** RGB565, packed. */
  color: number
  decimals: number
}

/**
 * The text a readout shows for a raw value: the number rounded half away
 * from nought to `decimals` places, a minus only where something is left
 * after rounding, "" for no value or not a number.
 *
 * Integer arithmetic after one multiplication, so every platform rounds the
 * same: m = floor(|v| × 10^d + 0.5), then whole part and decimals of m.
 */
export function formatReadout(raw: string | number | null | undefined, decimals: number): string {
  if (raw === null || raw === undefined) return ""
  const s = typeof raw === "number" ? String(raw) : raw.trim()
  // A plain decimal number only - no hex, binary or a type letter, so every platform agrees.
  if (!DECIMAL.test(s)) return ""
  const v = Number(s)
  if (!Number.isFinite(v)) return ""
  let p = 1
  for (let i = 0; i < decimals; i++) p *= 10
  const m = Math.floor(Math.abs(v) * p + 0.5)
  const whole = Math.floor(m / p)
  let out = String(whole)
  if (decimals > 0) out += "." + String(m - whole * p).padStart(decimals, "0")
  return v < 0 && m !== 0 ? "-" + out : out
}

/** The pattern of unlit segments behind a readout: as many 8s as the range needs, and its decimals. */
export function unlitPattern(min: number, max: number, decimals: number): string {
  const widest = Math.max(Math.abs(min), Math.abs(max))
  const whole = Math.max(1, String(Math.floor(widest)).length)
  return "8".repeat(whole) + (decimals > 0 ? "." + "8".repeat(decimals) : "")
}

/** A baked strip: the description's metrics with the alpha itself. */
export interface ReadoutStrip {
  width: number
  height: number
  alpha: Uint8Array
  cells: [number, number, number][]
  pad: number
}

/**
 * Bakes the strip for `font` (a ctx.font string) at `px`, with a glow of
 * `glowPx` (0: none). Each character in a cell of its own, the pen at `pad`.
 */
export function bakeReadoutStrip(font: string, px: number, glowPx: number): ReadoutStrip {
  const pad = Math.ceil(glowPx * 2) + 1
  const height = Math.ceil(px * 1.25) + 2 * pad
  const probe = document.createElement("canvas").getContext("2d")!
  probe.font = font
  const cells: [number, number, number][] = []
  let x = 0
  for (const ch of READOUT_CHARS) {
    const m = probe.measureText(ch)
    const advance = Math.max(1, Math.round(m.width))
    const w = advance + 2 * pad
    cells.push([x, w, advance])
    x += w
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, x)
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.font = font
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#ffffff"
  const draw = () => {
    for (let i = 0; i < READOUT_CHARS.length; i++) ctx.fillText(READOUT_CHARS[i], cells[i][0] + pad, height / 2)
  }
  if (glowPx > 0) {
    ctx.filter = `blur(${glowPx}px)`
    draw()
    draw()
    ctx.filter = "none"
  }
  draw()
  const d = ctx.getImageData(0, 0, canvas.width, height).data
  const alpha = new Uint8Array(canvas.width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3]
  return { width: canvas.width, height, alpha, cells, pad }
}

/** The strip as a file: "SA08", version 1, width and height (u16 LE), then one alpha byte a pixel, row by row. */
export function encodeStrip(strip: ReadoutStrip): Uint8Array {
  const out = new Uint8Array(9 + strip.alpha.length)
  out.set([0x53, 0x41, 0x30, 0x38, 1], 0)
  out[5] = strip.width & 255
  out[6] = strip.width >> 8
  out[7] = strip.height & 255
  out[8] = strip.height >> 8
  out.set(strip.alpha, 9)
  return out
}

/** An alpha byte as a blend565 weight out of 256. */
const weight = (a: number) => a + (a >> 7)

/** Where the text starts (the pen's first position), from its width and the alignment. */
export function readoutStart(text: string, chars: string, cells: [number, number, number][], x: number, align: "right" | "center"): number {
  let total = 0
  for (const ch of text) {
    const i = chars.indexOf(ch)
    if (i >= 0) total += cells[i][2]
  }
  return align === "right" ? x - total : x - (total >> 1)
}

/**
 * Writes `text` into `t` in `color`, with the strip's alpha, `opacity` out
 * of 256 (256: lit; the face's unlit pattern takes less). A character the
 * strip lacks is skipped.
 */
export function drawReadout(
  t: Rgb565Target,
  r: Pick<ReadoutDescription, "chars" | "cells" | "pad" | "height" | "x" | "y" | "align" | "color">,
  strip: { width: number; alpha: Uint8Array },
  text: string,
  opacity = 256,
): void {
  const col = { r: (r.color >> 11) & 31, g: (r.color >> 5) & 63, b: r.color & 31 }
  let pen = readoutStart(text, r.chars, r.cells, r.x, r.align)
  for (const ch of text) {
    const i = r.chars.indexOf(ch)
    if (i < 0) continue
    const [sx, w, advance] = r.cells[i]
    const ox = pen - r.pad
    for (let y = 0; y < r.height; y++) {
      const ty = r.y + y
      if (ty < 0 || ty >= t.height) continue
      for (let x = 0; x < w; x++) {
        const tx = ox + x
        if (tx < 0 || tx >= t.width) continue
        const a = (weight(strip.alpha[y * strip.width + sx + x]) * opacity) >> 8
        if (a <= 0) continue
        const c = t.get(tx, ty)
        const m = blend565({ r: (c >> 11) & 31, g: (c >> 5) & 63, b: c & 31 }, col, a)
        t.set(tx, ty, (m.r << 11) | (m.g << 5) | m.b)
      }
    }
    pen += advance
  }
}
