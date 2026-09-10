/**
 * Icon renderer - handles SVG icon rendering with caching
 */

import type { ScreenObject, ProjectAsset } from "@/components/project-editor"
import { optimizeSVGViewBox, tintedIconDataUrl, iconCacheKey, rasterisedIcon } from "@/lib/svg-utils"

interface RenderIconOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  projectAssets: ProjectAsset[]
  iconImageCache: Map<string, HTMLImageElement>
  requestRedraw: () => void
  // True inside a tab-control panel - see RenderScreenObjectsOptions.nested.
  nested?: boolean
}

export function renderIcon(options: RenderIconOptions): void {
  const { ctx, obj, projectAssets, iconImageCache, requestRedraw, nested } = options

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
          // Which of the two routes this icon actually takes to the device
          // decides how the preview has to draw it.
          //
          // At the top level it is flattened into the screen background,
          // drawn in place and scaled onto the screen's own grid, so drawing
          // it the same way here matches. Inside a panel it is not: the
          // background is built from top-level statics only, so the export
          // bakes a nested icon as its own bitmap at the origin
          // (asset-export.ts's exportIconUsage with alreadyFlattened false)
          // and the device blits that. Scaling onto the screen grid in that
          // case puts the preview's anti-aliased edge on a sub-pixel phase
          // the shipped bitmap does not have.
          //
          // One pixel on one ring's edge, in the knob's tab-control and
          // panel cases, found by the generated type-coverage run
          // (2026-09-10). Switch and button icons take the separate-bitmap
          // route unconditionally and have always used rasterisedIcon().
          const raster = nested ? rasterisedIcon(img, obj.width, obj.height, cacheKey) : null
          if (raster) ctx.drawImage(raster, obj.x, obj.y)
          else ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
        } catch (error) {
          // Silently fail - image may not be ready
        }
      }
    }
  }
}
