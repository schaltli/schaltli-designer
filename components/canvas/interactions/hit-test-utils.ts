import type { ScreenmanObject } from "@/components/screenman-editor"

/**
 * Hit testing utilities for canvas interactions
 */

/**
 * Check if a point is on a line object
 */
export function isPointOnLine(obj: ScreenmanObject, x: number, y: number): boolean {
  if (obj.type !== "line") return false
  
  const lineWidth = (obj.properties.strokeWidth || 1) + 4 // Add tolerance
  const halfWidth = lineWidth / 2
  
  const x1 = obj.x
  const y1 = obj.y
  const x2 = obj.x + obj.width
  const y2 = obj.y + obj.height
  
  // Calculate distance from point to line
  const A = x - x1
  const B = y - y1
  const C = x2 - x1
  const D = y2 - y1
  
  const dot = A * C + B * D
  const lenSq = C * C + D * D
  
  if (lenSq === 0) {
    // Line has zero length
    return Math.sqrt(A * A + B * B) <= halfWidth
  }
  
  const param = dot / lenSq
  
  let xx, yy
  
  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }
  
  const dx = x - xx
  const dy = y - yy
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  return distance <= halfWidth
}

/**
 * Find the object at a specific point, considering z-index order
 */
export function findObjectAtPoint(
  x: number, 
  y: number, 
  objects: ScreenmanObject[]
): ScreenmanObject | undefined {
  return [...objects]
    .sort((a, b) => b.zIndex - a.zIndex)
    .find((obj) => {
      if (obj.type === "line") {
        return isPointOnLine(obj, x, y)
      } else {
        return x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
      }
    })
}

/**
 * Check if a point is within a rectangle
 */
export function isPointInRect(
  x: number, 
  y: number, 
  rectX: number, 
  rectY: number, 
  rectWidth: number, 
  rectHeight: number
): boolean {
  return x >= rectX && x <= rectX + rectWidth && y >= rectY && y <= rectY + rectHeight
}

/**
 * Check if two rectangles intersect
 */
export function rectsIntersect(
  x1: number, y1: number, width1: number, height1: number,
  x2: number, y2: number, width2: number, height2: number
): boolean {
  return !(x1 + width1 < x2 || x2 + width2 < x1 || y1 + height1 < y2 || y2 + height2 < y1)
}
