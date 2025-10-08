/**
 * Coordinate transformation utilities for canvas interactions
 */

export interface CanvasOffset {
  x: number
  y: number
}

/**
 * Convert client coordinates to canvas coordinates
 */
export function getCanvasCoordinates(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  screenWidth: number,
  screenHeight: number,
  offset: CanvasOffset
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
  const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
  const x = Math.round((clientX - rect.left) / zoom - screenX)
  const y = Math.round((clientY - rect.top) / zoom - screenY)
  
  return { x, y }
}

/**
 * Convert canvas coordinates to client coordinates
 */
export function getClientCoordinates(
  canvasX: number,
  canvasY: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  screenWidth: number,
  screenHeight: number,
  offset: CanvasOffset
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
  const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
  const x = (canvasX + screenX) * zoom + rect.left
  const y = (canvasY + screenY) * zoom + rect.top
  
  return { x, y }
}

/**
 * Get the canvas bounding rectangle adjusted for zoom and offset
 */
export function getCanvasBounds(
  canvas: HTMLCanvasElement,
  zoom: number,
  screenWidth: number,
  screenHeight: number,
  offset: CanvasOffset
): { x: number; y: number; width: number; height: number } {
  const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
  const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
  
  return {
    x: -screenX,
    y: -screenY,
    width: screenWidth,
    height: screenHeight
  }
}

/**
 * Check if coordinates are within canvas bounds
 */
export function isWithinCanvasBounds(
  x: number,
  y: number,
  canvas: HTMLCanvasElement,
  zoom: number,
  screenWidth: number,
  screenHeight: number,
  offset: CanvasOffset
): boolean {
  const bounds = getCanvasBounds(canvas, zoom, screenWidth, screenHeight, offset)
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}
