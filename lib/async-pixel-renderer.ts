/**
 * Async pixel rendering system for icons
 */

import { getPixelRenderedIcon, drawPixelIcon, getIconTargetResolution } from './icon-pixel-renderer'

interface PendingIcon {
  assetId: string
  svgContent: string
  targetWidth: number
  targetHeight: number
  backgroundColor: string
  resolve: (icon: any) => void
  reject: (error: Error) => void
}

class AsyncPixelRenderer {
  private pendingIcons = new Map<string, PendingIcon>()
  private loadedIcons = new Map<string, any>()
  private processing = false

  /**
   * Preload an icon for pixel rendering
   */
  async preloadIcon(
    assetId: string,
    svgContent: string,
    targetWidth: number,
    targetHeight: number,
    backgroundColor: string = 'transparent'
  ): Promise<any> {
    const cacheKey = `${assetId}-${targetWidth}x${targetHeight}-${backgroundColor}`
    
    // Return cached icon if available
    if (this.loadedIcons.has(cacheKey)) {
      return this.loadedIcons.get(cacheKey)
    }

    // Return pending icon if already being processed
    if (this.pendingIcons.has(cacheKey)) {
      return new Promise((resolve, reject) => {
        const pending = this.pendingIcons.get(cacheKey)!
        pending.resolve = resolve
        pending.reject = reject
      })
    }

    // Create new pending icon
    return new Promise((resolve, reject) => {
      this.pendingIcons.set(cacheKey, {
        assetId,
        svgContent,
        targetWidth,
        targetHeight,
        backgroundColor,
        resolve,
        reject
      })

      // Start processing if not already running
      if (!this.processing) {
        this.processPendingIcons()
      }
    })
  }

  /**
   * Process all pending icons
   */
  private async processPendingIcons() {
    this.processing = true

    while (this.pendingIcons.size > 0) {
      const pendingEntries = Array.from(this.pendingIcons.entries())
      
      // Process icons in batches to avoid blocking
      const batch = pendingEntries.slice(0, 3) // Process 3 icons at a time
      
      await Promise.all(
        batch.map(async ([cacheKey, pending]) => {
          try {
            console.log(`Processing pixel icon: ${pending.assetId}`)
            const pixelIcon = await getPixelRenderedIcon(
              pending.assetId,
              pending.svgContent,
              pending.targetWidth,
              pending.targetHeight,
              pending.backgroundColor
            )
            
            this.loadedIcons.set(cacheKey, pixelIcon)
            pending.resolve(pixelIcon)
            this.pendingIcons.delete(cacheKey)
          } catch (error) {
            console.error(`Failed to process pixel icon: ${pending.assetId}`, error)
            pending.reject(error as Error)
            this.pendingIcons.delete(cacheKey)
          }
        })
      )

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    this.processing = false
  }

  /**
   * Draw a preloaded pixel icon
   */
  drawIcon(
    ctx: CanvasRenderingContext2D,
    assetId: string,
    targetWidth: number,
    targetHeight: number,
    backgroundColor: string,
    x: number,
    y: number,
    zoom: number
  ) {
    const cacheKey = `${assetId}-${targetWidth}x${targetHeight}-${backgroundColor}`
    const pixelIcon = this.loadedIcons.get(cacheKey)
    
    if (pixelIcon) {
      drawPixelIcon(ctx, pixelIcon, x, y, zoom)
      return true
    }
    
    return false
  }

  /**
   * Check if an icon is loaded
   */
  isLoaded(assetId: string, targetWidth: number, targetHeight: number, backgroundColor: string): boolean {
    const cacheKey = `${assetId}-${targetWidth}x${targetHeight}-${backgroundColor}`
    return this.loadedIcons.has(cacheKey)
  }

  /**
   * Clear all cached icons
   */
  clearCache() {
    this.loadedIcons.clear()
    this.pendingIcons.clear()
  }
}

// Global instance
export const asyncPixelRenderer = new AsyncPixelRenderer()

/**
 * Preload icons for a list of assets
 */
export async function preloadIconsForAssets(
  assets: Array<{ id: string; data: string; type: string }>,
  iconSize: number,
  screenWidth: number,
  screenHeight: number,
  backgroundColor: string = 'transparent'
) {
  const targetRes = getIconTargetResolution(iconSize, screenWidth, screenHeight)
  
  const preloadPromises = assets
    .filter(asset => asset.type === 'icon' && asset.data)
    .map(async (asset) => {
      try {
        let svgContent = asset.data
        if (asset.data.startsWith("data:image/svg+xml;base64,")) {
          svgContent = atob(asset.data.split(",")[1])
        } else if (asset.data.startsWith("data:image/svg+xml,")) {
          svgContent = decodeURIComponent(asset.data.split(",")[1])
        }

        return await asyncPixelRenderer.preloadIcon(
          asset.id,
          svgContent,
          targetRes.width,
          targetRes.height,
          backgroundColor
        )
      } catch (error) {
        console.error(`Failed to preload icon ${asset.id}:`, error)
        return null
      }
    })

  await Promise.allSettled(preloadPromises)
  console.log('Icon preloading completed')
}
