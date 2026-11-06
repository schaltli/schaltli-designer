/**
 * Software Button renderer - a Material 3 common button: a pill in one of three
 * styles, with its label and optional icon centred as one group.
 *
 * docs/2026-09-19-button-look.md; since 2026-11-04 (docs/2026-11-04-native-
 * buttons.md) the look and the layout are lib/button-shape.ts, which the export
 * writes into the project for a device to draw from - no picture of a button
 * leaves the designer. This draws the same: the pill through the Switch's
 * rasteriser (paint-pills.ts), the icon in the ink colour, the label at its
 * place.
 */
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { iconCacheKey, rasterisedIconOnBaseline, tintedIconDataUrl } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import type { BDFFont } from "@/lib/bdffont"
import { buttonContentLayout, buttonFaces, buttonPills, type ButtonContentLayout } from "@/lib/button-shape"
import { loadBdfFont } from "./render-text-box"
import { paintPills } from "./paint-pills"

export {
  BUTTON_ICON_GAP,
  buttonColorOf,
  buttonContentLayout,
  buttonCornerRadius,
  buttonLook,
  buttonStyleOf,
  type ButtonContentLayout,
  type ButtonLook,
  type ButtonStyle,
} from "@/lib/button-shape"

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
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
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
  /** The project's button radius in px (Settings › Cards), unset for a pill. */
  radiusPx?: number
  requestRedraw?: () => void
}

/**
 * The button, at its own position: what a device draws from the same numbers.
 * Returns where its content went, relative to the button - what the export
 * writes for a device (lib/button-shape.ts).
 */
export function drawSoftwareButton(o: DrawSoftwareButtonOptions): ButtonContentLayout {
  const { ctx, obj } = o
  const x = Math.round(obj.x)
  const y = Math.round(obj.y)
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const faces = buttonFaces(obj, o.background, o.colorDepth, o.radiusPx)
  const face = o.pressed ? faces.pressed : faces.normal

  // Through the Switch's rasteriser (paint-pills.ts; PillRaster.h and
  // PillRaster.kt on the devices): soft at 24 bit, whole pixels below, the
  // same pixels on all three. The browser's own anti-aliasing would differ
  // from the panel's at every corner - the reason the button was a picture
  // until 2026-11-04.
  paintPills(ctx, buttonPills(x, y, w, h, face), o.background, o.colorDepth)

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
  ctx.beginPath()
  ctx.rect(x + layout.clipX, y, layout.clipW, h)
  ctx.clip()

  if (layout.icon && o.icon && o.icon.complete && o.icon.naturalWidth > 0) {
    const key = buttonIconKey(String(obj.properties.iconAssetId))
    const raster = rasterisedIconOnBaseline(o.icon, layout.icon.size, layout.icon.size, key)
    if (raster) ctx.drawImage(colouredIcon(raster, key, face.ink), x + layout.icon.x, y + layout.icon.y)
  }

  ctx.fillStyle = face.ink
  if (bdfFont) {
    bdfFont.drawText(ctx, text, x + layout.textX, y + layout.baseline)
  } else {
    setBrowserFont()
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(text, x + layout.textX, y + layout.baseline)
  }
  ctx.restore()
  return layout
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
  const scratch = buttonScratch.getContext("2d", { willReadFrequently: true })
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
