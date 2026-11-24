/**
 * A styled gauge or bar as a device receives it - device contract §2.15,
 * feature `instrument-styles` (docs/2026-11-23-instrument-styles.md, «Two
 * layers»; tasks/instrument-styles-todo.md I7).
 *
 * The object keeps every property a flat gauge or bar has; beside them it
 * carries `instrument`: the face, baked here, as a file of its own named by
 * its content (two identical gauges share one), the needle as a description
 * for lib/needle-raster.ts's ports, how a value turns or moves it, and the
 * spring it swings with.
 */
import { isSettableLevel } from "@/lib/object-types"
import { normalizeInstrument, STYLE_META } from "@/lib/instrument"
import { bakedBarFace, bakedGaugeFace } from "@/lib/instrument-bake"
import { barNeedle, gaugeNeedle } from "@/lib/instrument-needles"
import type { NeedleDescription } from "@/lib/needle-raster"
import { encodeStrip, type ReadoutDescription, type ReadoutStrip } from "@/lib/instrument-readout"

export const INSTRUMENT_FEATURE = "instrument-styles"

type Obj = { id?: string; type?: string; width?: number; height?: number; properties?: Record<string, any>; children?: Obj[] }

/** Whether an object is drawn as a styled instrument: a read-only gauge or bar with a style. */
export function isStyledInstrument(obj: Obj | null | undefined): boolean {
  if (!obj || (obj.type !== "gauge" && obj.type !== "bar")) return false
  if (isSettableLevel(obj.type)) return false
  return Boolean(normalizeInstrument(obj.properties).style)
}

/** What a project needs of a device for its styled instruments, or null where it has none. */
export function instrumentFeature(project: { screens?: Array<{ objects?: Obj[] }> }): { feature: string; label: string } | null {
  let count = 0
  const walk = (objects: Obj[] | undefined) => {
    for (const o of objects ?? []) {
      if (isStyledInstrument(o)) count++
      walk(o.children)
    }
  }
  for (const s of project.screens ?? []) walk(s.objects)
  return count > 0 ? { feature: INSTRUMENT_FEATURE, label: `styled gauges and bars (${count})` } : null
}

/**
 * A baked face as bytes (§2.15): "S565", version 1, width and height
 * (little-endian u16), then width × height RGB565 pixels (little-endian
 * u16, row by row), then a mask of one bit per pixel, row by row, the
 * lowest bit first, 1 where the face is drawn - 0 leaves what lies beneath
 * (a background image in a round face's corners).
 */
export function encodeFace565(canvas: HTMLCanvasElement): Uint8Array {
  const w = canvas.width
  const h = canvas.height
  const data = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const n = w * h
  const out = new Uint8Array(9 + n * 2 + Math.ceil(n / 8))
  out.set([0x53, 0x35, 0x36, 0x35, 1], 0) // "S565", version 1
  out[5] = w & 255
  out[6] = w >> 8
  out[7] = h & 255
  out[8] = h >> 8
  const maskAt = 9 + n * 2
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const drawn = data[i * 4 + 3] !== 0
    const c = drawn ? ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3) : 0
    out[9 + i * 2] = c & 255
    out[10 + i * 2] = c >> 8
    if (drawn) out[maskAt + (i >> 3)] |= 1 << (i & 7)
  }
  return out
}

/** FNV-1a over the bytes, as eight hex digits: the face file's name. */
export function contentHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

export interface ExportedInstrument {
  style: string
  /** Asset path of the baked face (§2.15 «S565»). */
  face: string
  /** The moving part (lib/needle-raster.ts). */
  needle: NeedleDescription
  /** Gauge: the needle's angle at position 0 and 1, degrees, 0 = up, clockwise. */
  sweep?: { from: number; to: number }
  /** Bar: how far the pointer moves at position 1, eighths of a pixel. */
  travel?: { x: number; y: number }
  /** The spring a value change swings with; absent when the motion is direct. */
  spring?: { frequency: number; damping: number }
  /** The digital readout, where the style has one and it is on (lib/instrument-readout.ts). */
  readout?: ReadoutDescription
}

type ExportFile = { name: string; data: Uint8Array }

/**
 * The `instrument` block and the face file for one styled object on a
 * screen whose colour is `ground` (resolved, light). Null for anything
 * else, or when the style typefaces are not loaded (the caller awaits them
 * first: lib/instrument-fonts.ts whenInstrumentFontsReady).
 */
export function exportedInstrument(
  obj: Obj,
  ground: string,
): { instrument: ExportedInstrument; file: ExportFile; extraFiles: ExportFile[] } | null {
  if (!isStyledInstrument(obj)) return null
  const props = normalizeInstrument(obj.properties)
  const style = props.style!
  const w = Math.max(1, Math.round(obj.width ?? 1))
  const h = Math.max(1, Math.round(obj.height ?? 1))
  const gauge = obj.type === "gauge"
  const size = Math.min(w, h)
  const face = gauge ? bakedGaugeFace(obj.properties!, size, ground) : bakedBarFace(obj.properties!, w, h, ground)
  if (!face) return null
  const data = encodeFace565(face.canvas)
  const name = `assets/face-${contentHash(data)}.s565`
  const meta = STYLE_META[style]
  const spring = props.motion === "direct" ? undefined : { ...meta.spring }
  const extraFiles: ExportFile[] = []
  let readout: ReadoutDescription | undefined
  if (face.readout) {
    const strip = encodeStrip(face.readout.strip)
    const glyphs = `assets/glyphs-${contentHash(strip)}.a8`
    extraFiles.push({ name: glyphs, data: strip })
    readout = { glyphs, ...face.readout.desc }
  }
  const common = { style, face: name, ...(spring ? { spring } : {}), ...(readout ? { readout } : {}) }
  if (gauge) {
    return {
      instrument: { ...common, needle: gaugeNeedle(style, size, face.scale), sweep: { from: meta.sweepFrom, to: meta.sweepTo } },
      file: { name, data },
      extraFiles,
    }
  }
  const bar = barNeedle(style, w, h, obj.properties?.direction, face.scale)
  return {
    instrument: { ...common, needle: bar.desc, travel: { x: bar.travelX, y: bar.travelY } },
    file: { name, data },
    extraFiles,
  }
}

/** A readout strip as a PNG for the app: white, its alpha the strip's. */
async function stripPng(strip: ReadoutStrip): Promise<Uint8Array> {
  const canvas = document.createElement("canvas")
  canvas.width = strip.width
  canvas.height = strip.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const img = ctx.createImageData(strip.width, strip.height)
  for (let i = 0; i < strip.alpha.length; i++) {
    img.data[i * 4] = 255
    img.data[i * 4 + 1] = 255
    img.data[i * 4 + 2] = 255
    img.data[i * 4 + 3] = strip.alpha[i]
  }
  ctx.putImageData(img, 0, 0)
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the strip did not encode as PNG"))), "image/png"))
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * The same for the Android bundle: the face as a PNG (`assets/faces/`, named
 * by its content), every other field as for a board. The app decodes it
 * with BitmapFactory; transparent pixels are what the face does not cover.
 */
export async function exportedInstrumentPng(
  obj: Obj,
  ground: string,
): Promise<{ instrument: ExportedInstrument; file: ExportFile; extraFiles: ExportFile[] } | null> {
  const board = exportedInstrument(obj, ground)
  if (!board) return null
  const props = normalizeInstrument(obj.properties)
  const w = Math.max(1, Math.round(obj.width ?? 1))
  const h = Math.max(1, Math.round(obj.height ?? 1))
  const face = obj.type === "gauge" ? bakedGaugeFace(obj.properties!, Math.min(w, h), ground) : bakedBarFace(obj.properties!, w, h, ground)
  if (!face || !props.style) return null
  const blob: Blob = await new Promise((resolve, reject) =>
    face.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the face did not encode as PNG"))), "image/png"),
  )
  const data = new Uint8Array(await blob.arrayBuffer())
  // Named by the board's file's content: the same face, the same name.
  const name = board.instrument.face.replace(/^assets\/face-/, "assets/faces/").replace(/\.s565$/, ".png")
  const extraFiles: ExportFile[] = []
  let readout = board.instrument.readout
  if (readout && face.readout) {
    // Not premultiplied in a PNG: the alpha survives as it was baked.
    const glyphs = readout.glyphs.replace(/^assets\/glyphs-/, "assets/faces/glyphs-").replace(/\.a8$/, ".png")
    extraFiles.push({ name: glyphs, data: await stripPng(face.readout.strip) })
    readout = { ...readout, glyphs }
  }
  return { instrument: { ...board.instrument, face: name, ...(readout ? { readout } : {}) }, file: { name, data }, extraFiles }
}
