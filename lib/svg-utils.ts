/**
 * SVG utility functions for icon rendering optimization
 */

/**
 * Optimize SVG viewBox to remove padding and make content fill the entire space
 */
export function optimizeSVGViewBox(svgContent: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgContent, "image/svg+xml")
    const svgElement = doc.querySelector("svg")
    
    if (!svgElement) return svgContent
    
    // Get the viewBox attribute
    const viewBoxAttr = svgElement.getAttribute("viewBox")
    if (!viewBoxAttr) {
      // If no viewBox, try to use width/height
      const width = svgElement.getAttribute("width")
      const height = svgElement.getAttribute("height")
      if (width && height) {
        svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`)
      }
      return new XMLSerializer().serializeToString(doc)
    }
    
    // Try to calculate the bounding box of all path/shape elements
    const bbox = calculateSVGBounds(svgElement)
    
    if (bbox && bbox.width > 0 && bbox.height > 0) {
      // Calculate the current viewBox
      const viewBoxValues = viewBoxAttr.split(/\s+|,/)
      if (viewBoxValues.length >= 4) {
        const currentX = Number.parseFloat(viewBoxValues[0]) || 0
        const currentY = Number.parseFloat(viewBoxValues[1]) || 0
        const currentWidth = Number.parseFloat(viewBoxValues[2]) || 0
        const currentHeight = Number.parseFloat(viewBoxValues[3]) || 0
        
        // Only modify the viewBox if content has significant padding (> 2px on any side)
        const paddingLeft = Math.abs(bbox.x - currentX)
        const paddingTop = Math.abs(bbox.y - currentY)
        const paddingRight = Math.abs((currentX + currentWidth) - (bbox.x + bbox.width))
        const paddingBottom = Math.abs((currentY + currentHeight) - (bbox.y + bbox.height))
        
        // If there's more than 2 pixels of padding on any side, crop the viewBox
        const hasPadding = paddingLeft > 2 || paddingTop > 2 || paddingRight > 2 || paddingBottom > 2
        
        if (hasPadding) {
          // Adjust viewBox to match actual content WITHOUT any additional padding
          const newViewBox = `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`
          svgElement.setAttribute("viewBox", newViewBox)
          
          return new XMLSerializer().serializeToString(doc)
        }
      }
    }
    
    return svgContent
  } catch (error) {
    console.warn("Failed to optimize SVG viewBox:", error)
    return svgContent
  }
}

/**
 * Calculate the bounding box of all visual elements in an SVG
 */
function calculateSVGBounds(svgElement: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  try {
    // Create a temporary SVG element in the document to get accurate bbox
    const tempSvg = svgElement.cloneNode(true) as SVGSVGElement
    tempSvg.style.position = "absolute"
    tempSvg.style.visibility = "hidden"
    document.body.appendChild(tempSvg)
    
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    
    // Get all visual elements (path, rect, circle, ellipse, line, polyline, polygon)
    const elements = tempSvg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, text, g")
    
    if (elements.length === 0) {
      document.body.removeChild(tempSvg)
      return null
    }
    
    elements.forEach((element) => {
      try {
        const bbox = (element as SVGGraphicsElement).getBBox()
        if (bbox.width > 0 || bbox.height > 0) {
          minX = Math.min(minX, bbox.x)
          minY = Math.min(minY, bbox.y)
          maxX = Math.max(maxX, bbox.x + bbox.width)
          maxY = Math.max(maxY, bbox.y + bbox.height)
        }
      } catch (e) {
        // Some elements might not support getBBox
      }
    })
    
    document.body.removeChild(tempSvg)
    
    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      return null
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  } catch (error) {
    console.warn("Failed to calculate SVG bounds:", error)
    return null
  }
}

/**
 * Decode SVG content from various data URL formats
 */
export function decodeSVGContent(data: string): string {
  if (data.startsWith("data:image/svg+xml;base64,")) {
    return atob(data.split(",")[1])
  } else if (data.startsWith("data:image/svg+xml,")) {
    return decodeURIComponent(data.split(",")[1])
  } else {
    return data
  }
}

/**
 * Encode SVG content to data URL
 */
export function encodeSVGContent(svgContent: string): string {
  return `data:image/svg+xml;base64,${btoa(svgContent)}`
}



/**
 * Icon tinting - the "Icon-Farbe" field the four icon-using property panels
 * offer (Icon, SoftwareButton, Switch, MQTTIconField).
 *
 * An icon asset is a *shape*, not a picture: the same lightbulb belongs on a
 * pale screen in black and on a dark one in white. Until 2026-08-25 the only
 * way to recolor one was the asset color editor in project settings, which
 * rewrote asset.data in place - so the same icon in two colors meant two
 * assets, and a later background change broke every one of them. The color
 * now lives on the object that uses the icon and is applied here, in one
 * place, both when the designer draws to canvas and when the export bakes a
 * bitmap. Nothing about this reaches firmware: the device still blits exactly
 * what the designer produced, which is what the 0-pixel HIL diffs rest on.
 */

// fill="currentColor", stroke='#000', stop-color="#78eb7b"
const PAINT_ATTR_RE = /\b(fill|stroke|stop-color)=(["'])([^"']*)\2/gi
// style="fill:#000;stroke:none" and the same inside a <style> block. Parens
// stay inside the value so rgb(0,0,0) survives; url(#grad) is caught here too
// and dropped by isPaintColor below.
const PAINT_STYLE_RE = /\b(fill|stroke|stop-color)\s*:\s*([^;"'{}]+)/gi

// Values that appear where a color would but name no paint - replacing these
// is how you accidentally fill an icon's whole bounding box: the multi-color
// sets open with <g fill="none"> and rely on it staying that way.
const NON_COLORS = new Set(["none", "transparent", "inherit", "initial", "unset", "context-fill", "context-stroke"])

function isPaintColor(raw: string): boolean {
  const value = raw.trim().toLowerCase()
  if (!value || NON_COLORS.has(value)) return false
  return !value.startsWith("url(")
}

export interface IconColorInfo {
  /** Distinct paint values the SVG names, lowercased. */
  colors: string[]
  /**
   * Whether one color replacement covers the whole icon. True for a stencil
   * that paints with a single value - whether it says so as `currentColor`
   * (most of Iconify) or hardcodes `#000` (some sets do) - and true for an
   * icon that names no color at all and so falls to SVG's black default.
   * False from two distinct values on, where a single color can only be
   * imposed, not substituted; that is what iconColorFlatten is for.
   */
  tintable: boolean
}

export function getIconColorInfo(svgContent: string): IconColorInfo {
  const colors = new Set<string>()

  for (const match of svgContent.matchAll(PAINT_ATTR_RE)) {
    if (isPaintColor(match[3])) colors.add(match[3].trim().toLowerCase())
  }
  for (const match of svgContent.matchAll(PAINT_STYLE_RE)) {
    if (isPaintColor(match[2])) colors.add(match[2].trim().toLowerCase())
  }

  return { colors: Array.from(colors), tintable: colors.size <= 1 }
}

/** Puts fill on the root <svg>, where it inherits down to shapes that name none. */
function setRootFill(svgContent: string, color: string): string {
  return svgContent.replace(/<svg\b([^>]*?)(\/?)>/i, (_m, attrs, selfClosing) => `<svg${attrs} fill="${color}"${selfClosing}>`)
}

function repaint(svgContent: string, color: string): string {
  return svgContent
    .replace(PAINT_ATTR_RE, (match, prop, quote, value) =>
      isPaintColor(value) ? `${prop}=${quote}${color}${quote}` : match,
    )
    .replace(PAINT_STYLE_RE, (match, prop, value) => (isPaintColor(value) ? `${prop}:${color}` : match))
}

/**
 * Returns svgContent painted in `color`, or unchanged when there is nothing to
 * do. A multi-color icon is left alone unless `flatten` says otherwise - a
 * color silently failing to appear is bad, but silently turning a deliberately
 * colorful icon into a silhouette is worse, so the panel asks first.
 */
export function applyIconColor(svgContent: string, color?: string | null, flatten?: boolean): string {
  if (!color) return svgContent

  const info = getIconColorInfo(svgContent)
  if (!info.tintable && !flatten) return svgContent
  if (info.colors.length === 0) return setRootFill(svgContent, color)
  return repaint(svgContent, color)
}

/**
 * The whole tint in one step, data URL in and data URL out - what both the
 * canvas renderers (into an <img>) and asset-export (into rasterizeSVG) need.
 * Returns the input untouched when no color is set, so an untinted project
 * exports byte-identical bitmaps to before this existed.
 */
export function tintedIconDataUrl(assetData: string, color?: string | null, flatten?: boolean): string {
  if (!assetData) return assetData
  try {
    const svg = decodeSVGContent(assetData)
    return encodeSVGContent(color ? applyIconColor(svg, color, flatten) : svg)
  } catch {
    // encodeSVGContent's btoa refuses anything outside Latin-1, which an SVG
    // carrying a non-ASCII <title> can be. Handing back the original data is
    // what the untinted renderers did before this existed, so such an icon
    // draws as it always has instead of vanishing.
    return assetData
  }
}

/**
 * Cache key for a tinted icon. The color has to be part of it: the caches key
 * rendered <img> elements by asset, so without this a color change would keep
 * handing back the previously painted bitmap.
 */
export function iconCacheKey(assetId: string, color?: string | null, flatten?: boolean): string {
  return `${assetId}_${color || "asis"}${flatten ? "_flat" : ""}`
}

// An icon rasterised into a canvas of exactly the size it will be drawn at,
// ready to be blitted without scaling.
//
// Why this exists (2026-09-10). An SVG is a vector until something draws it,
// and the browser rasterises it onto the pixel grid of whatever it is being
// drawn INTO. The export bakes an icon into a canvas of its own size at the
// origin; the live preview was scaling the same SVG straight onto the 800x480
// screen at the object's position. Same source, same size, different grid -
// measured at 25 of 961 pixels differing, worst channel 54 out of 255.
//
// No arithmetic could have reconciled those two. Rasterising into a canvas of
// the draw size and then blitting 1:1 makes both sides do the same operation,
// which is the only way two renderers agree on an anti-aliased edge.
//
// Cached by key and size because the preview redraws on every interaction and
// rasterising an SVG is not free. The cap is generous - a project has a
// handful of icons at a handful of sizes - and exists so a long session
// cannot grow it without bound.
const rasterCache = new Map<string, HTMLCanvasElement>()
const RASTER_CACHE_MAX = 64

// Width and height separately, because a standalone icon object is whatever
// shape the designer gave it while a switch or button icon is square.
export function rasterisedIcon(
  img: HTMLImageElement,
  width: number,
  height: number,
  key: string,
): HTMLCanvasElement | null {
  if (!img.complete || img.naturalWidth === 0 || width <= 0 || height <= 0) return null

  const cacheKey = `${key}@${width}x${height}`
  const hit = rasterCache.get(cacheKey)
  if (hit) return hit

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, width, height)

  if (rasterCache.size >= RASTER_CACHE_MAX) {
    const oldest = rasterCache.keys().next().value
    if (oldest !== undefined) rasterCache.delete(oldest)
  }
  rasterCache.set(cacheKey, canvas)
  return canvas
}
