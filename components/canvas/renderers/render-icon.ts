/**
 * Icon renderer - handles SVG icon rendering with caching
 */

import type { ScreenObject, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, tintedIconDataUrl, iconCacheKey } from "@/lib/svg-utils"

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
      // The color lives on the object, not in the asset - see applyIconColor()
      // in svg-utils. It has to be part of the key: the cache hands back a
      // rendered <img>, so keying by asset alone would keep returning the
      // previously painted one after a color change.
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

        // Skip optimization for now - icons should already have correct viewBoxes
        // const optimizedSvgContent = optimizeSVGViewBox(decodeSVGContent(asset.data))

        img.src = tintedIconDataUrl(asset.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
      }

      if (img.complete && img.naturalWidth > 0) {
        try {
          // Drawn in place, scaled, which is exactly how a plain icon is
          // baked into the screen's flattened background - and that is the
          // route it reaches the device by. Rasterising it separately here
          // would put the preview on a grid nothing else uses. Switch and
          // button icons are the other way round, and use rasterisedIcon().
          ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
        } catch (error) {
          // Silently fail - image may not be ready
        }
      }
    }
  }
}
