import type { ScreenmanObject, SnapGuide } from "@/components/screenman-editor"

/**
 * Grid snapping and alignment utilities
 */

export interface SnapResult {
  x: number
  y: number
  snapLines: Array<{ type: "vertical" | "horizontal"; position: number }>
}

/**
 * Snap a coordinate to the nearest grid point
 */
export function snapToGrid(
  value: number, 
  gridSize: number, 
  snapTolerance: number = 8
): number {
  const remainder = value % gridSize
  if (remainder < snapTolerance) {
    return value - remainder
  } else if (remainder > gridSize - snapTolerance) {
    return value + (gridSize - remainder)
  }
  return value
}

/**
 * Snap coordinates to grid and generate snap lines
 */
export function snapCoordinatesToGrid(
  x: number,
  y: number,
  gridSize: number = 20,
  snapTolerance: number = 8
): SnapResult {
  const snappedX = snapToGrid(x, gridSize, snapTolerance)
  const snappedY = snapToGrid(y, gridSize, snapTolerance)
  
  const snapLines: Array<{ type: "vertical" | "horizontal"; position: number }> = []
  
  if (snappedX !== x) {
    snapLines.push({ type: "vertical", position: snappedX })
  }
  
  if (snappedY !== y) {
    snapLines.push({ type: "horizontal", position: snappedY })
  }
  
  return {
    x: snappedX,
    y: snappedY,
    snapLines
  }
}

/**
 * Snap object to grid and return updated position with snap lines
 */
export function snapObjectToGrid(
  obj: ScreenmanObject,
  gridSize: number = 20,
  snapTolerance: number = 8
): SnapResult {
  return snapCoordinatesToGrid(obj.x, obj.y, gridSize, snapTolerance)
}

/**
 * Snap resize handle to grid while keeping opposite handle fixed
 */
export function snapResizeHandleToGrid(
  handle: "nw" | "ne" | "sw" | "se" | "baseline-left" | "baseline-right",
  obj: ScreenmanObject,
  newX: number,
  newY: number,
  gridSize: number = 20,
  snapTolerance: number = 8
): { x: number; y: number; width: number; height: number; snapLines: Array<{ type: "vertical" | "horizontal"; position: number }> } {
  const snapLines: Array<{ type: "vertical" | "horizontal"; position: number }> = []
  let finalX = obj.x
  let finalY = obj.y
  let finalWidth = obj.width
  let finalHeight = obj.height

  switch (handle) {
    case "nw":
      finalX = snapToGrid(newX, gridSize, snapTolerance)
      finalY = snapToGrid(newY, gridSize, snapTolerance)
      finalWidth = obj.x + obj.width - finalX
      finalHeight = obj.y + obj.height - finalY
      if (finalX !== newX) snapLines.push({ type: "vertical", position: finalX })
      if (finalY !== newY) snapLines.push({ type: "horizontal", position: finalY })
      break

    case "ne":
      finalY = snapToGrid(newY, gridSize, snapTolerance)
      finalWidth = snapToGrid(newX, gridSize, snapTolerance) - obj.x
      finalHeight = obj.y + obj.height - finalY
      if (finalWidth !== newX - obj.x) snapLines.push({ type: "vertical", position: obj.x + finalWidth })
      if (finalY !== newY) snapLines.push({ type: "horizontal", position: finalY })
      break

    case "sw":
      finalX = snapToGrid(newX, gridSize, snapTolerance)
      finalWidth = obj.x + obj.width - finalX
      finalHeight = snapToGrid(newY, gridSize, snapTolerance) - obj.y
      if (finalX !== newX) snapLines.push({ type: "vertical", position: finalX })
      if (finalHeight !== newY - obj.y) snapLines.push({ type: "horizontal", position: obj.y + finalHeight })
      break

    case "se":
      finalWidth = snapToGrid(newX, gridSize, snapTolerance) - obj.x
      finalHeight = snapToGrid(newY, gridSize, snapTolerance) - obj.y
      if (finalWidth !== newX - obj.x) snapLines.push({ type: "vertical", position: obj.x + finalWidth })
      if (finalHeight !== newY - obj.y) snapLines.push({ type: "horizontal", position: obj.y + finalHeight })
      break

    case "baseline-left":
      finalX = snapToGrid(newX, gridSize, snapTolerance)
      finalWidth = obj.x + obj.width - finalX
      if (finalX !== newX) snapLines.push({ type: "vertical", position: finalX })
      break

    case "baseline-right":
      finalWidth = snapToGrid(newX, gridSize, snapTolerance) - obj.x
      if (finalWidth !== newX - obj.x) snapLines.push({ type: "vertical", position: obj.x + finalWidth })
      break
  }

  return {
    x: finalX,
    y: finalY,
    width: Math.max(1, finalWidth),
    height: Math.max(1, finalHeight),
    snapLines
  }
}

/**
 * Snap to snap guides (alignment guides)
 */
export function snapToGuides(
  x: number,
  y: number,
  guides: SnapGuide[],
  snapTolerance: number = 8
): { x: number; y: number; snapLines: Array<{ type: "vertical" | "horizontal"; position: number }> } {
  const snapLines: Array<{ type: "vertical" | "horizontal"; position: number }> = []
  let snappedX = x
  let snappedY = y

  for (const guide of guides) {
    if (guide.type === "vertical" && Math.abs(x - guide.position) < snapTolerance) {
      snappedX = guide.position
      snapLines.push({ type: "vertical", position: guide.position })
    } else if (guide.type === "horizontal" && Math.abs(y - guide.position) < snapTolerance) {
      snappedY = guide.position
      snapLines.push({ type: "horizontal", position: guide.position })
    }
  }

  return {
    x: snappedX,
    y: snappedY,
    snapLines
  }
}

/**
 * Combine grid snapping with guide snapping
 */
export function snapToGridAndGuides(
  x: number,
  y: number,
  guides: SnapGuide[],
  gridSize: number = 20,
  snapTolerance: number = 8
): SnapResult {
  const gridSnap = snapCoordinatesToGrid(x, y, gridSize, snapTolerance)
  const guideSnap = snapToGuides(gridSnap.x, gridSnap.y, guides, snapTolerance)
  
  return {
    x: guideSnap.x,
    y: guideSnap.y,
    snapLines: [...gridSnap.snapLines, ...guideSnap.snapLines]
  }
}
