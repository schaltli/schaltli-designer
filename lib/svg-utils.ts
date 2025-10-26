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


