/**
 * Software Button renderer - a Material 3 common button: a pill in one of three
 * styles, with its label and optional icon centred as one group.
 *
 * docs/2026-09-19-button-look.md. The button reaches a device as two bitmaps
 * the export bakes - normal and pressed - which the firmware only blits, so
 * everything here is drawn once, by drawSoftwareButton(), for the preview and
 * the bake alike. Until 2026-09-19 the bake had its own copy of this code.
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { iconCacheKey, rasterisedIconOnBaseline, tintedIconDataUrl } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import type { BDFFont } from "@/lib/bdffont"
import { applyColorDepth } from "@/lib/color-depth"
import { controlPalette } from "@/lib/control-palette"
import { blendColors, onColorFor } from "@/lib/material-colors"
import { fontMetricsOf, levelTrackLook } from "@/lib/level-shape"
import { loadBdfFont } from "./render-text-box"
import { fillRoundRect, fillRoundRectRing } from "./render-box"

/**
 * Material's three common buttons. Filled for the one action a screen is
 * about, tonal for ordinary switches - the default, because a page of filled
 * buttons is heavy and Material spends them sparingly - and outlined for the
 * quiet ones.
 */
export type ButtonStyle = "filled" | "tonal" | "outlined"

export function buttonStyleOf(obj: ScreenObject): ButtonStyle {
  const style = obj.properties.buttonStyle
  return style === "filled" || style === "outlined" ? style : "tonal"
}

/** The one colour the author sets; the palette's own when there is none. */
export function buttonColorOf(obj: ScreenObject, colorDepth: string | undefined): string {
  const color = obj.properties.buttonColor
  return typeof color === "string" && color.trim() !== "" ? color : controlPalette(colorDepth).fill
}

/** Between the icon and the label - Material's 8. */
export const BUTTON_ICON_GAP = 8

/** What a button is painted with, in one state. */
export interface ButtonLook {
  /** The pill's fill, or null where the background shows through. */
  container: string | null
  /** A 1-px outline, or null. */
  outline: string | null
  /** The label and the icon. */
  content: string
}

/**
 * The colours of a button, all from its one colour and what it stands on.
 *
 * - **filled**: the colour itself, the label white or black - whichever reads
 *   better on it (Material's on-primary is white on its purple; a light blue
 *   gets black).
 * - **tonal**: the colour halfway to the background - exactly the slider's
 *   empty track (levelTrackLook), so a tonal button and a slider on one screen
 *   are one family - and the label again white or black by contrast.
 * - **outlined**: no fill, an outline in that same tint, the label in the
 *   colour. Where the tint is the background (1 bit) the outline takes the
 *   colour instead, and a tonal button becomes an outlined one, as the slider's
 *   track becomes an outline.
 *
 * Pressed is Material's state layer: the content colour laid over the
 * container at 10 %. On a depth that cannot show 10 % - 1 bit always, some
 * grey pairs - the button turns inside out instead: filled draws outlined, and
 * anything else draws filled.
 */
export function buttonLook(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  pressed: boolean,
): ButtonLook {
  const color = applyColorDepth(buttonColorOf(obj, colorDepth), colorDepth)
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  const tint = levelTrackLook(color, ground, colorDepth)

  let style = buttonStyleOf(obj)
  if (style === "tonal" && tint.framed) style = "outlined"

  const filled: ButtonLook = { container: color, outline: null, content: onColorFor(color, colorDepth) }
  const look: ButtonLook =
    style === "filled"
      ? filled
      : style === "tonal"
        ? { container: tint.track, outline: null, content: onColorFor(tint.track, colorDepth) }
        : { container: null, outline: tint.framed ? color : tint.track, content: color }
  if (!pressed) return look

  const under = look.container ?? ground
  const layer = applyColorDepth(blendColors(under, look.content, 10), colorDepth)
  if (layer.toLowerCase() !== under.toLowerCase()) return { ...look, container: layer }
  return style === "filled" ? { container: null, outline: color, content: color } : filled
}

/**
 * The corner radius: a pill at rest, and pressed a fifth of the height - the
 * shape morph of Material 3 Expressive, whose pressed buttons go from round to
 * nearly square (8 dp on a 40 dp button, 12 on 56, 28 on 136). A colour change
 * of 10 % disappears under a finger; a changed silhouette does not, because the
 * ends of the button stick out beside the fingertip.
 */
export function buttonCornerRadius(w: number, h: number, pressed: boolean): number {
  const round = Math.min(w, h) / 2
  return pressed ? Math.min(round, Math.trunc(h / 5)) : round
}

/** A rounded rectangle; a pill when `r` is half the short side. */
function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * The icon every button loads: flattened to black, so one image serves every
 * colour a button can give it - the colour is put on when it is drawn
 * (colouredIcon). Loading one per colour would mean the preloaders and the
 * bake working out each button's colours before its picture could even load.
 */
export const BUTTON_ICON_INK = "#000000"

export function buttonIconKey(assetId: string): string {
  return iconCacheKey(assetId, BUTTON_ICON_INK, true)
}

export function buttonIconUrl(asset: ProjectAsset): string {
  return tintedIconDataUrl(asset.data || "", BUTTON_ICON_INK, true)
}

const colouredCache = new Map<string, HTMLCanvasElement>()

export function colouredIcon(raster: HTMLCanvasElement, key: string, colour: string): HTMLCanvasElement {
  const cacheKey = `${key}@${raster.width}x${raster.height}@${colour}`
  const hit = colouredCache.get(cacheKey)
  if (hit) return hit
  const canvas = document.createElement("canvas")
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(raster, 0, 0)
  ctx.globalCompositeOperation = "source-in"
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (colouredCache.size >= 64) {
    const oldest = colouredCache.keys().next().value
    if (oldest !== undefined) colouredCache.delete(oldest)
  }
  colouredCache.set(cacheKey, canvas)
  return canvas
}

/**
 * Where the content goes: the icon (a capital's height, standing on the
 * baseline - the slider header's rule) and the label, centred together inside
 * the pill's straight part. Needs the label's width, which the caller measures.
 */
export interface ButtonContentLayout {
  baseline: number
  icon: { x: number; y: number; size: number } | null
  textX: number
}

export function buttonContentLayout(
  obj: ScreenObject,
  fonts: ProjectFont[] | undefined,
  textWidth: number,
): ButtonContentLayout {
  const x = Math.round(obj.x)
  const y = Math.round(obj.y)
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const m = fontMetricsOf(fontMeta, 14)
  const baseline = y + Math.trunc((h - (m.ascent + m.descent)) / 2) + m.ascent
  const hasIcon = typeof obj.properties.iconAssetId === "string" && obj.properties.iconAssetId !== ""
  const iconSize = hasIcon ? Math.max(1, m.capHeight) : 0
  const group = (hasIcon ? iconSize + BUTTON_ICON_GAP : 0) + textWidth
  // The half-circles at the ends are the pill's, not the label's.
  const pad = Math.trunc(h / 2)
  const left = x + pad + Math.max(0, Math.trunc((w - 2 * pad - group) / 2))
  return {
    baseline,
    icon: hasIcon ? { x: left, y: baseline - iconSize, size: iconSize } : null,
    textX: hasIcon ? left + iconSize + BUTTON_ICON_GAP : left,
  }
}

export interface DrawSoftwareButtonOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  bdfFontCache: Map<string, BDFFont>
  colorDepth?: string
  /** The colour the button stands on - what the tonal tint is mixed with. */
  background: string
  pressed: boolean
  /** The icon as loaded by buttonIconUrl(), or null when there is none yet. */
  icon: HTMLImageElement | null
  requestRedraw?: () => void
}

/** The button, at its own position. The one drawing both the preview and the bake use. */
export function drawSoftwareButton(o: DrawSoftwareButtonOptions): void {
  const { ctx, obj } = o
  const x = Math.round(obj.x)
  const y = Math.round(obj.y)
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const look = buttonLook(obj, o.background, o.colorDepth, o.pressed)
  const radius = buttonCornerRadius(w, h, o.pressed)

  if (o.colorDepth === "1bit") {
    // Whole pixels on a panel that has no others. An anti-aliased edge is cut
    // at 50 % on the way to the glass, and a 1-px outline cut that way breaks
    // up along its curves - seen in the first 1-bit bake. The integer
    // rasteriser the slider's track uses (fillRoundRect) leaves nothing to cut.
    const r = Math.trunc(radius)
    if (look.container) fillRoundRect(ctx, x, y, w, h, r, look.container)
    if (look.outline) {
      // Cut out of a filled pill rather than drawn over one, so whatever is
      // behind the button - a background image - still shows in the middle.
      fillRoundRectRing(ctx, x, y, w, h, r, 1, look.outline)
    }
  } else {
    if (look.container) {
      pillPath(ctx, x, y, w, h, radius)
      ctx.fillStyle = look.container
      ctx.fill()
    }
    if (look.outline) {
      ctx.save()
      pillPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius - 0.5)
      ctx.strokeStyle = look.outline
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  }

  const text = obj.properties.text || "Button"
  const fontMeta = o.fonts?.find((f) => f.id === obj.properties.fontId)
  const bdfFont = loadBdfFont(obj, o.fonts, o.bdfFontCache)
  const size = fontMeta?.format === "ttf" && fontMeta.size > 0 ? fontMeta.size : fontMeta?.size || 14
  const setBrowserFont = () => {
    const isTtf = fontMeta?.format === "ttf"
    if (isTtf && fontMeta && !isTtfFontLoaded(fontMeta)) ensureTtfFontRegistered(fontMeta, o.requestRedraw ?? (() => {}))
    const family = isTtf && fontMeta ? `"${fontMeta.internalName ?? fontMeta.name}"` : "sans-serif"
    ctx.font = `${obj.properties.fontWeight || "normal"} ${size}px ${family}`
  }
  ctx.save()
  let textWidth: number
  if (bdfFont) textWidth = Math.ceil(bdfFont.measureText(text).width)
  else {
    setBrowserFont()
    textWidth = Math.ceil(ctx.measureText(text).width)
  }
  const layout = buttonContentLayout(obj, o.fonts, textWidth)

  // Content stays out of the round ends, and a label too long for the button
  // is cut there rather than running over the edge.
  const inset = Math.trunc(h / 4)
  ctx.beginPath()
  ctx.rect(x + inset, y, Math.max(0, w - 2 * inset), h)
  ctx.clip()

  if (layout.icon && o.icon && o.icon.complete && o.icon.naturalWidth > 0) {
    const key = buttonIconKey(String(obj.properties.iconAssetId))
    const raster = rasterisedIconOnBaseline(o.icon, layout.icon.size, layout.icon.size, key)
    if (raster) ctx.drawImage(colouredIcon(raster, key, look.content), layout.icon.x, layout.icon.y)
  }

  ctx.fillStyle = look.content
  if (bdfFont) {
    bdfFont.drawText(ctx, text, layout.textX, layout.baseline)
  } else {
    setBrowserFont()
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(text, layout.textX, layout.baseline)
  }
  ctx.restore()
}

interface RenderSoftwareButtonOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  isSelected: boolean
  zoom: number
  iconImageCache: Map<string, HTMLImageElement>
  bdfFontCache: Map<string, BDFFont>
  requestRedraw: () => void
  colorDepth?: string
  /** What the button stands on; white when absent. */
  screenBackgroundColor?: string
  /** Held down in the preview - drawn as the device draws its pressed bitmap. */
  pressed?: boolean
}

// A scratch canvas the button is drawn into, reused across redraws so the
// editor is not allocating one per frame.
let buttonScratch: HTMLCanvasElement | null = null

/** The button's icon from the preview's cache, loading it on first sight. */
function cachedButtonIcon(options: RenderSoftwareButtonOptions): HTMLImageElement | null {
  const id = options.obj.properties.iconAssetId
  if (!id) return null
  const asset = options.projectAssets.find((a) => a.id === id)
  if (!asset || asset.type !== "icon" || !asset.data) return null
  const key = buttonIconKey(asset.id)
  let img = options.iconImageCache.get(key)
  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    options.iconImageCache.set(key, img)
    const pending = img
    pending.onload = () => {
      if (pending.complete && pending.naturalWidth > 0) requestAnimationFrame(() => options.requestRedraw())
    }
    pending.onerror = () => options.iconImageCache.delete(key)
    pending.src = buttonIconUrl(asset)
  }
  return img
}

// Draws the button into a canvas of its own size and blits the result into
// place, the backdrop copied in first.
//
// Why not straight onto the screen (2026-09-10). lib/asset-export.ts bakes the
// bitmap the device blits by drawing into a canvas of exactly this size, onto
// the screen's own background. An anti-aliased edge - the pill's, the
// outline's - is not translation invariant: drawn at another offset on another
// grid it comes out a level different at some pixels, and at an RGB565
// boundary that is a whole level on the panel. Drawing on the same grid as the
// bake removes the question rather than the symptom, exactly as
// rasterisedIcon() does for icons.
export function renderSoftwareButton(options: RenderSoftwareButtonOptions): void {
  const outer = options.ctx
  const w = Math.max(1, Math.round(options.obj.width))
  const h = Math.max(1, Math.round(options.obj.height))
  const draw = (ctx: CanvasRenderingContext2D) =>
    drawSoftwareButton({
      ctx,
      obj: options.obj,
      fonts: options.fonts,
      bdfFontCache: options.bdfFontCache,
      colorDepth: options.colorDepth,
      background: options.screenBackgroundColor || "#ffffff",
      pressed: options.pressed === true,
      icon: cachedButtonIcon(options),
      requestRedraw: options.requestRedraw,
    })

  // Only when the destination is untransformed. The editor draws its canvas
  // under a zoom and pan, and this path reads a rectangle back out of it by
  // object coordinates - which are canvas coordinates only at 1:1. Zoomed, it
  // would copy the wrong region, so it draws in place instead. The reference
  // render and the export both run at 1:1, which is where agreeing with the
  // panel actually matters.
  const t = typeof outer.getTransform === "function" ? outer.getTransform() : null
  const untransformed = t ? t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0 : false
  if (!untransformed) {
    draw(outer)
    return
  }

  if (!buttonScratch) buttonScratch = document.createElement("canvas")
  if (buttonScratch.width !== w || buttonScratch.height !== h) {
    buttonScratch.width = w
    buttonScratch.height = h
  }
  const scratch = buttonScratch.getContext("2d")
  if (!scratch) {
    draw(outer)
    return
  }

  scratch.setTransform(1, 0, 0, 1, 0, 0)
  scratch.clearRect(0, 0, w, h)
  try {
    scratch.drawImage(outer.canvas, Math.round(options.obj.x), Math.round(options.obj.y), w, h, 0, 0, w, h)
  } catch {
    // A tainted or zero-sized source canvas: draw in place, which is never
    // wrong, only a level off at some anti-aliased edge pixels.
    draw(outer)
    return
  }

  scratch.translate(-Math.round(options.obj.x), -Math.round(options.obj.y))
  draw(scratch)
  scratch.setTransform(1, 0, 0, 1, 0, 0)

  outer.drawImage(buttonScratch, Math.round(options.obj.x), Math.round(options.obj.y))
}
