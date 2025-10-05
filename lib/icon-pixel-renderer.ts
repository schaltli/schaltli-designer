/**
 * Utility for rendering SVG icons as pixel-based images at target resolution
 */

interface PixelRenderedIcon {
  imageData: ImageData
  width: number
  height: number
}

/**
 * Renders an SVG string as a pixel-based ImageData at the specified resolution
 */
export async function renderSvgToPixels(
  svgString: string,
  targetWidth: number,
  targetHeight: number,
  backgroundColor: string = 'transparent'
): Promise<PixelRenderedIcon> {
  return new Promise((resolve, reject) => {
    // Create a temporary canvas for rendering
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }

    // Set canvas size to target resolution
    canvas.width = targetWidth
    canvas.height = targetHeight

    // Fill background if specified
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, targetWidth, targetHeight)
    }

    // Create image from SVG
    const img = new Image()
    img.onload = () => {
      try {
        console.log(`SVG loaded successfully, drawing at ${targetWidth}x${targetHeight}`)
        // Draw the SVG at the exact target resolution
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        
        // Get the pixel data
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
        console.log(`Got image data: ${imageData.width}x${imageData.height}`)
        
        // Clean up the URL after processing
        URL.revokeObjectURL(url)
        
        resolve({
          imageData,
          width: targetWidth,
          height: targetHeight
        })
      } catch (error) {
        console.error('Error in img.onload:', error)
        URL.revokeObjectURL(url)
        reject(error)
      }
    }
    
    img.onerror = (error) => {
      console.error('Failed to load SVG:', error)
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG'))
    }

    // Convert SVG string to data URL
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    console.log(`Loading SVG from URL: ${url.substring(0, 50)}...`)
    img.src = url
  })
}

/**
 * Cache for pixel-rendered icons to avoid re-rendering
 */
const pixelIconCache = new Map<string, PixelRenderedIcon>()

/**
 * Gets or creates a pixel-rendered version of an icon
 */
export async function getPixelRenderedIcon(
  iconId: string,
  svgString: string,
  targetWidth: number,
  targetHeight: number,
  backgroundColor: string = 'transparent'
): Promise<PixelRenderedIcon> {
  const cacheKey = `${iconId}-${targetWidth}x${targetHeight}-${backgroundColor}`
  
  if (pixelIconCache.has(cacheKey)) {
    return pixelIconCache.get(cacheKey)!
  }

  try {
    console.log(`Rendering icon ${iconId} to pixels: ${targetWidth}x${targetHeight}`)
    const rendered = await renderSvgToPixels(svgString, targetWidth, targetHeight, backgroundColor)
    pixelIconCache.set(cacheKey, rendered)
    console.log(`Successfully rendered icon ${iconId} to pixels`)
    return rendered
  } catch (error) {
    console.error('Failed to render icon to pixels:', error)
    throw error
  }
}

/**
 * Draws a pixel-rendered icon onto a canvas context
 */
export function drawPixelIcon(
  ctx: CanvasRenderingContext2D,
  icon: PixelRenderedIcon,
  x: number,
  y: number,
  scale: number = 1
) {
  try {
    // Disable smoothing for pixel-perfect rendering
    ctx.imageSmoothingEnabled = false
    
    // For now, use a simpler approach - draw the ImageData directly
    const scaledWidth = Math.round(icon.width * scale)
    const scaledHeight = Math.round(icon.height * scale)
    
    // Save current context state
    ctx.save()
    
    // Create a temporary canvas to draw the pixel data
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = scaledWidth
    tempCanvas.height = scaledHeight
    const tempCtx = tempCanvas.getContext('2d')
    
    if (!tempCtx) {
      console.error('Could not get temp canvas context')
      return
    }
    
    // Disable smoothing on temp canvas
    tempCtx.imageSmoothingEnabled = false
    
    // Put the pixel data on the temp canvas at the scaled size
    tempCtx.putImageData(icon.imageData, 0, 0)
    
    // Draw the temp canvas onto the main canvas
    ctx.drawImage(tempCanvas, x, y)
    
    // Restore context state
    ctx.restore()
  } catch (error) {
    console.error('Error drawing pixel icon:', error)
  }
}

/**
 * Clears the pixel icon cache
 */
export function clearPixelIconCache() {
  pixelIconCache.clear()
}

/**
 * Gets the target resolution for icons based on screen dimensions
 */
export function getIconTargetResolution(
  iconSize: number,
  screenWidth: number,
  screenHeight: number
): { width: number; height: number } {
  // For now, use the icon size as the target resolution
  // This could be made smarter based on screen resolution
  return {
    width: Math.round(iconSize),
    height: Math.round(iconSize)
  }
}
