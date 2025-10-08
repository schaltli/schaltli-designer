/**
 * Icon renderer - handles SVG icon rendering with caching
 */

import type { ScreenmanObject, ScreenmanAsset } from "@/components/screenman-editor"

interface RenderIconOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  projectAssets: ScreenmanAsset[]
  iconImageCache: Map<string, HTMLImageElement>
  requestRedraw: () => void
}

export function renderIcon(options: RenderIconOptions): void {
  const { ctx, obj, projectAssets, iconImageCache, requestRedraw } = options

  // Draw background if specified
  if (obj.properties.backgroundColor && obj.properties.backgroundColor !== "transparent") {
    ctx.fillStyle = obj.properties.backgroundColor
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Render icon from asset
  if (obj.properties.assetId) {
    const asset = projectAssets.find((a) => a.id === obj.properties.assetId)

    if (asset && asset.type === "icon" && asset.data) {
      // The asset data now contains the final SVG with any color changes applied
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

        // Use the asset data directly - it already contains any color modifications
        let svgContent = asset.data
        if (asset.data.startsWith("data:image/svg+xml;base64,")) {
          svgContent = atob(asset.data.split(",")[1])
        } else if (asset.data.startsWith("data:image/svg+xml,")) {
          svgContent = decodeURIComponent(asset.data.split(",")[1])
        } else {
          svgContent = asset.data
        }

        const modifiedDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`
        img.src = modifiedDataUrl
      }

      if (img.complete && img.naturalWidth > 0) {
        try {
          ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
        } catch (error) {
          // Silently fail - image may not be ready
        }
      }
    }
  }
}
