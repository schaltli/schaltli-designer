/**
 * Software Button renderer - handles software button rendering with optional icon and text
 */

import type { ScreenmanObject, ScreenmanFont, ScreenmanAsset } from "@/components/screenman-editor"
import { getBaselineY, ensureTTFFont } from "@/lib/font-utils"

interface RenderSoftwareButtonOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  fonts: ScreenmanFont[]
  projectAssets: ScreenmanAsset[]
  isSelected: boolean
  zoom: number
  ttfFontLoadMap: Map<string, Promise<void>>
  iconImageCache: Map<string, HTMLImageElement>
  requestRedraw: () => void
}

export function renderSoftwareButton(options: RenderSoftwareButtonOptions): void {
  const { ctx, obj, fonts, projectAssets, isSelected, zoom, ttfFontLoadMap, iconImageCache, requestRedraw } = options

  // Draw background
  const bgColor = obj.properties.backgroundColor || "#ffffff"
  if (bgColor !== "transparent") {
    ctx.fillStyle = bgColor
    
    // Handle rounded corners if specified
    if (obj.properties.cornerRadius) {
      drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, obj.properties.cornerRadius)
      ctx.fill()
    } else {
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
    }
  }

  // Draw border
  const borderColor = obj.properties.borderColor || "#cccccc"
  if (borderColor !== "transparent") {
    ctx.strokeStyle = borderColor
    ctx.lineWidth = obj.properties.borderWidth || 1
    
    if (obj.properties.cornerRadius) {
      drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, obj.properties.cornerRadius)
      ctx.stroke()
    } else {
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
    }
  }

  // Calculate available area for content
  let contentStartX = obj.x
  let contentWidth = obj.width
  const padding = 8 // Padding from edges

  // Render icon on the left if specified
  if (obj.properties.iconAssetId) {
    const asset = projectAssets.find((a) => a.id === obj.properties.iconAssetId)
    if (asset && asset.type === "icon" && asset.data) {
      const iconSize = Math.min(obj.height - padding * 2, obj.width * 0.3) // Icon is at most 30% of width
      const iconX = obj.x + padding
      const iconY = obj.y + (obj.height - iconSize) / 2

      const cacheKey = asset.id
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

        const modifiedDataUrl = asset.data.startsWith("data:") 
          ? asset.data 
          : `data:image/svg+xml;base64,${btoa(asset.data)}`
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
  const familyName = fontMeta?.name || obj.properties.fontFamily || "sans-serif"
  const fontWeight = obj.properties.fontWeight || "normal"
  const textColor = obj.properties.textColor || "#000000"

  // Ensure TTF font is loaded if URL is provided
  if (fontMeta?.url) {
    ensureTTFFont(fontMeta.id, familyName, fontMeta.url, ttfFontLoadMap)
  }

  ctx.fillStyle = textColor
  ctx.font = `${fontWeight} ${fontSize}px ${familyName}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"

  // Draw text centered in available area
  const textX = contentStartX + contentWidth / 2
  const textY = obj.y + obj.height / 2
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

