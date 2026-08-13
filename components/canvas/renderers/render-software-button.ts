/**
 * Software Button renderer - handles software button rendering with optional icon and text
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, decodeSVGContent, encodeSVGContent } from "@/lib/svg-utils"
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

export function renderSoftwareButton(options: RenderSoftwareButtonOptions): void {
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

      const cacheKey = `${asset.id}_optimized`
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
        const svgContent = decodeSVGContent(asset.data)
        const modifiedDataUrl = encodeSVGContent(svgContent)
        img.src = modifiedDataUrl
      }

      if (img.complete && img.naturalWidth > 0) {
        try {
          ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
          // Reduce available text area
          contentStartX = iconX + iconSize + padding
          contentWidth = obj.width - (contentStartX - obj.x) - padding
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

function drawRoundedRect(
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

