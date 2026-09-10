/**
 * Software Button renderer - handles software button rendering with optional icon and text
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, tintedIconDataUrl, iconCacheKey, rasterisedIcon } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { getFontAscent, getFontDescent } from "@/lib/font-utils"
import type { BDFFont } from "@/lib/bdffont"
import { loadBdfFont } from "./render-text-box"

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
}

// A scratch canvas the button is drawn into, reused across redraws so the
// editor is not allocating one per frame.
let buttonScratch: HTMLCanvasElement | null = null

// Draws the button into a canvas of its own size, at the origin, and blits
// the result into place.
//
// Why not straight onto the screen (2026-09-10). lib/asset-export.ts bakes
// the bitmap the device blits by drawing into a canvas of exactly this size
// at the origin. A filled path rasterises identically wherever it is drawn,
// so for a long time this did not matter - but this button has a 1px border,
// stroked half a pixel in, and a STROKE at a half-pixel offset is not
// translation invariant. Measured: the same button, same code, differs by 1
// in 255 at each corner between a 180x46 canvas and an 800x480 one.
//
// One in 255 is invisible until it lands on an RGB565 boundary, which at a
// corner it does - and then the preview and the panel disagree by a whole
// level. Drawing on the same grid as the bake removes the question rather
// than the symptom, exactly as rasterisedIcon() does for icons.
//
// The backdrop is copied in first because the drop shadow is translucent and
// has to composite against what is already there. That is the same thing the
// bake does with its flattened background.
export function renderSoftwareButton(options: RenderSoftwareButtonOptions): void {
  const outer = options.ctx
  const w = Math.max(1, Math.round(options.obj.width))
  const h = Math.max(1, Math.round(options.obj.height))

  // Only when the destination is untransformed. The editor draws its canvas
  // under a zoom and pan, and this path reads a rectangle back out of it by
  // object coordinates - which are canvas coordinates only at 1:1. Zoomed,
  // it would copy the wrong region, so it draws in place instead and keeps
  // the one-in-255 corner difference that nobody can see on a zoomed preview
  // anyway. The reference render and the export both run at 1:1, which is
  // where agreeing with the panel actually matters.
  const t = typeof outer.getTransform === "function" ? outer.getTransform() : null
  const untransformed = t ? t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0 : false
  if (!untransformed) {
    drawSoftwareButtonInto(options)
    return
  }

  if (!buttonScratch) buttonScratch = document.createElement("canvas")
  if (buttonScratch.width !== w || buttonScratch.height !== h) {
    buttonScratch.width = w
    buttonScratch.height = h
  }
  const scratch = buttonScratch.getContext("2d")
  if (!scratch) {
    drawSoftwareButtonInto(options)
    return
  }

  scratch.setTransform(1, 0, 0, 1, 0, 0)
  scratch.clearRect(0, 0, w, h)
  try {
    scratch.drawImage(outer.canvas, options.obj.x, options.obj.y, w, h, 0, 0, w, h)
  } catch {
    // A tainted or zero-sized source canvas: fall back to drawing in place,
    // which is what this did before and is never wrong, only one level off
    // at the corners.
    drawSoftwareButtonInto(options)
    return
  }

  // The object drawn at the origin, which is the grid the bake uses.
  scratch.translate(-options.obj.x, -options.obj.y)
  drawSoftwareButtonInto({ ...options, ctx: scratch })
  scratch.setTransform(1, 0, 0, 1, 0, 0)

  outer.drawImage(buttonScratch, options.obj.x, options.obj.y)
}

function drawSoftwareButtonInto(options: RenderSoftwareButtonOptions): void {
  const { ctx, obj, fonts, projectAssets, isSelected, zoom, iconImageCache, bdfFontCache, requestRedraw } = options

  // Button 3D effect constants
  const shadowOffset = 3
  const buttonWidth = obj.width - shadowOffset
  const buttonHeight = obj.height - shadowOffset
  
  // Normal state: button in upper-left, shadow in lower-right
  const buttonX = obj.x
  const buttonY = obj.y

  // Draw shadow (3px to bottom and right)
  const shadowColor = "rgba(0, 0, 0, 0.3)"
  ctx.fillStyle = shadowColor
  
  if (obj.properties.cornerRadius) {
    drawRoundedRect(ctx, obj.x + shadowOffset, obj.y + shadowOffset, buttonWidth, buttonHeight, obj.properties.cornerRadius)
    ctx.fill()
  } else {
    ctx.fillRect(obj.x + shadowOffset, obj.y + shadowOffset, buttonWidth, buttonHeight)
  }

  // Draw button background
  const bgColor = obj.properties.backgroundColor || "#ffffff"
  if (bgColor !== "transparent") {
    ctx.fillStyle = bgColor
    
    // Handle rounded corners if specified
    if (obj.properties.cornerRadius) {
      drawRoundedRect(ctx, buttonX, buttonY, buttonWidth, buttonHeight, obj.properties.cornerRadius)
      ctx.fill()
    } else {
      ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight)
    }
  }

  // Draw border with pixel-perfect rendering
  const borderColor = obj.properties.borderColor || "#cccccc"
  if (borderColor !== "transparent") {
    ctx.strokeStyle = borderColor
    const borderWidth = obj.properties.borderWidth || 1
    ctx.lineWidth = borderWidth
    
    // For odd-width strokes, offset by 0.5 to get crisp lines
    const offset = borderWidth % 2 === 1 ? 0.5 : 0
    
    if (obj.properties.cornerRadius) {
      drawRoundedRect(ctx, buttonX + offset, buttonY + offset, buttonWidth - borderWidth, buttonHeight - borderWidth, obj.properties.cornerRadius)
      ctx.stroke()
    } else {
      ctx.strokeRect(buttonX + offset, buttonY + offset, buttonWidth - borderWidth, buttonHeight - borderWidth)
    }
  }

  // Calculate available area for content (within the smaller button rect)
  let contentStartX = buttonX
  let contentWidth = buttonWidth
  const padding = 8 // Padding from edges

  // Render icon on the left if specified
  if (obj.properties.iconAssetId) {
    const asset = projectAssets.find((a) => a.id === obj.properties.iconAssetId)
    if (asset && asset.type === "icon" && asset.data) {
      const iconSize = Math.min(buttonHeight - padding * 2, buttonWidth * 0.3) // Icon is at most 30% of width
      const iconX = buttonX + padding
      const iconY = buttonY + (buttonHeight - iconSize) / 2

      const cacheKey = iconCacheKey(asset.id, obj.properties.iconColor, obj.properties.iconColorFlatten)
      let img = iconImageCache.get(cacheKey)

      if (!img) {
        img = new Image()
        img.crossOrigin = "anonymous"
        iconImageCache.set(cacheKey, img)

        img.onload = () => {
          if (img!.complete && img!.naturalWidth > 0) {
            requestAnimationFrame(() => {
              requestRedraw()
            })
          }
        }

        img.onerror = () => {
          iconImageCache.delete(cacheKey)
        }

        // Decode and encode the SVG (skip optimization for now)
        img.src = tintedIconDataUrl(asset.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
      }

      if (img.complete && img.naturalWidth > 0) {
        try {
          // Same grid as the bake - see rasterisedIcon().
          const raster = rasterisedIcon(img, iconSize, cacheKey)
          if (raster) ctx.drawImage(raster, iconX, iconY)
          // Reduce available text area.
          //
          // Measured from the BUTTON, not from the object. The two differ by
          // shadowOffset: the object also covers the 3px drop shadow to the
          // right, and the text belongs on the face. Until 2026-09-10 this
          // line used obj.width/obj.x while lib/asset-export.ts, which bakes
          // the bitmap the device actually blits, used buttonWidth/buttonX -
          // so the preview centred the label in an area 3px wider and drew it
          // 2px right of where the hardware would.
          //
          // Found by the first pixel-parity run on the Waveshare 4.3B: 151
          // pixels differing on one button, all of them the label, all of
          // them vanishing at a 2px shift. Only buttons WITH an icon were
          // ever affected - without one, both paths keep the button-sized
          // area they start with, which is why no board caught it before.
          contentStartX = iconX + iconSize + padding
          contentWidth = buttonWidth - (contentStartX - buttonX) - padding
        } catch (error) {
          // Silently fail - image may not be ready
        }
      }
    }
  }

  // Render text centered in available area
  const text = obj.properties.text || "Button"
  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const textColor = obj.properties.textColor || "#000000"
  ctx.fillStyle = textColor

  const centerX = contentStartX + contentWidth / 2
  const centerY = buttonY + buttonHeight / 2

  // The button's bitmap is baked once at export time and just blitted by
  // firmware (ColorScreenRenderer::renderSoftwareButton loads pathNormal/
  // pathActive and never draws text itself - screenbee-m5dial) - but the
  // preview still has to match what actually gets baked. One font
  // technology per device (2026-08-13 decision): firmware devices only ever
  // offer BDF-format fonts, so real BDF glyphs here (not a numeric-size-only
  // canvas-font approximation) is what makes the preview match the exported
  // bitmap pixel-for-pixel. Android offers TTF fonts instead (a native app
  // renders those live) - handled by the branch below, unchanged.
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)

  if (bdfFont && fontMeta) {
    const ascent = getFontAscent(fontMeta)
    const descent = getFontDescent(fontMeta)
    const textWidth = bdfFont.measureText(text).width
    const textX = Math.round(centerX - Math.min(textWidth, contentWidth) / 2)
    const baselineY = Math.round(centerY - (ascent + descent) / 2 + ascent)
    bdfFont.drawText(ctx, text, textX, baselineY)
  } else if (fontMeta?.format === "ttf") {
    if (!isTtfFontLoaded(fontMeta)) {
      ensureTtfFontRegistered(fontMeta, requestRedraw)
    }
    const familyName = fontMeta.internalName ?? fontMeta.name
    ctx.font = `${obj.properties.fontWeight || "normal"} ${fontMeta.size}px "${familyName}"`
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    ctx.fillText(text, centerX, centerY, contentWidth)
  } else {
    // No font resolved at all (no fontId, or a dangling reference) -
    // generic fallback so the designer stays usable/previewable, matching
    // render-text-box.ts's own final fallback.
    const fontSize = fontMeta?.size || 14
    const fontWeight = obj.properties.fontWeight || "normal"
    ctx.font = `${fontWeight} ${fontSize}px sans-serif`
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    ctx.fillText(text, centerX, centerY, contentWidth)
  }
}

// Shared with lib/asset-export.ts's button bake, which had a private copy
// of this until 2026-08-25 - the same curve, written out twice. The copies
// had not drifted, and the 6 remaining pixels of HIL difference turned out
// to come from somewhere else entirely (one quantization step, from the
// bake-then-blit pipeline rounding at a different point than a single live
// draw). Merged anyway: two identical copies of a shape are a drift that
// has not happened yet, and this one is invisible until a device is in the
// loop.
//
// Deliberately NOT render-box.ts's fillRoundRect: that is a port of
// Adafruit_GFX's integer midpoint-circle algorithm, matching a firmware
// that rasterizes the shape itself. A SoftwareButton is never rasterized on
// the device - it is a bitmap the designer bakes - so here the canvas's own
// anti-aliased curve is the thing both sides have to agree on.
export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

