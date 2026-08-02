/**
 * Icon renderer - handles SVG icon rendering with caching
 */

import type { ScreenObject, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, decodeSVGContent, encodeSVGContent } from "@/lib/svg-utils"

interface RenderIconOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  projectAssets: ProjectAsset[]
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

        // Use the asset data directly - it already contains any color modifications
        const svgContent = decodeSVGContent(asset.data)

        // Skip optimization for now - icons should already have correct viewBoxes
        // const optimizedSvgContent = optimizeSVGViewBox(svgContent)

        const modifiedDataUrl = encodeSVGContent(svgContent)
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
