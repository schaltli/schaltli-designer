/**
 * Software Button renderer - handles software button rendering with optional icon and text
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, decodeSVGContent, encodeSVGContent } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"

interface RenderSoftwareButtonOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  isSelected: boolean
  zoom: number
  iconImageCache: Map<string, HTMLImageElement>
  requestRedraw: () => void
}

export function renderSoftwareButton(options: RenderSoftwareButtonOptions): void {
  const { ctx, obj, fonts, projectAssets, isSelected, zoom, iconImageCache, requestRedraw } = options

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
  const fontSize = fontMeta?.size || 14  // Use font's size, not separate fontSize property
  // TTF fonts render correctly here once actually registered with the
  // browser (see lib/ttf-font-registry.ts) - this resolves the font's real
  // internal/family name and kicks off loading if it hasn't started yet.
  // BDF fonts have no browser-registered equivalent, so this still falls
  // back to whatever the declared display name happens to resolve to (a
  // system font, in practice) - unchanged pre-existing behavior for those.
  if (fontMeta?.format === "ttf" && !isTtfFontLoaded(fontMeta)) {
    ensureTtfFontRegistered(fontMeta, requestRedraw)
  }
  const familyName = fontMeta?.internalName || fontMeta?.displayName || fontMeta?.name || obj.properties.fontFamily || "sans-serif"
  const fontWeight = obj.properties.fontWeight || "normal"
  const textColor = obj.properties.textColor || "#000000"

  // Software buttons use standard canvas text rendering (not BDF fonts)
  // This is intentional for design-time preview
  ctx.fillStyle = textColor
  ctx.font = `${fontWeight} ${fontSize}px "${familyName}"`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"

  // Draw text centered in available area
  const textX = contentStartX + contentWidth / 2
  const textY = buttonY + buttonHeight / 2
  ctx.fillText(text, textX, textY)
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

