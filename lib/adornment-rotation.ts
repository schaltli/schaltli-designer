// Geometry for rotating a device's adornment (mockup image + hardware button
// hit-rects) around the center of its screen cutout, in 90-degree steps only
// (see ProjectSettings.rotation, project-editor.tsx). Deliberately integer/
// exact for 90-degree multiples - no sin/cos, no floating-point drift - by
// just permuting (dx, dy) -> (-dy, dx) per quarter-turn instead of a general
// rotation matrix. A DDF's adornmentDrawingArea/hardwareButtons positions are
// always stored native (0deg); every consumer (canvas.tsx, the interactive
// adornment view in project-settings-dialog.tsx) applies this transform live
// from the project's current rotation instead.

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// Normalizes degrees (any multiple of 90, positive or negative) to a 0-3
// count of clockwise quarter-turns.
export function toQuarterTurns(degrees: number): number {
  return (((degrees / 90) % 4) + 4) % 4
}

export function rotatePointCW(point: Point, pivot: Point, quarterTurns: number): Point {
  let dx = point.x - pivot.x
  let dy = point.y - pivot.y
  const turns = ((quarterTurns % 4) + 4) % 4
  for (let i = 0; i < turns; i++) {
    const nextDx = -dy
    const nextDy = dx
    dx = nextDx
    dy = nextDy
  }
  return { x: pivot.x + dx, y: pivot.y + dy }
}

// Rotates an axis-aligned rect around a pivot by a 90-degree multiple,
// returning the new axis-aligned bounding rect (width/height swap at 90/270,
// same as the pivot's own owning drawingArea does - see
// project-editor.tsx's ProjectSettings.rotation comment).
export function rotateRectCW(rect: Rect, pivot: Point, quarterTurns: number): Rect {
  const topLeft = rotatePointCW({ x: rect.x, y: rect.y }, pivot, quarterTurns)
  const bottomRight = rotatePointCW({ x: rect.x + rect.width, y: rect.y + rect.height }, pivot, quarterTurns)
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  }
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}
