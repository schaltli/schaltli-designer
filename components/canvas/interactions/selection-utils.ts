import type { ScreenmanObject } from "@/components/screenman-editor"

/**
 * Selection management utilities
 */

export interface SelectionState {
  selectedObjectIds: string[]
  hoveredObjectId: string | null
}

/**
 * Check if an object is selected
 */
export function isObjectSelected(objectId: string, selectedObjectIds: string[]): boolean {
  return selectedObjectIds.includes(objectId)
}

/**
 * Add object to selection (with modifier key support)
 */
export function addToSelection(
  objectId: string, 
  selectedObjectIds: string[], 
  modifierKey: boolean
): string[] {
  if (modifierKey) {
    // Toggle selection
    if (selectedObjectIds.includes(objectId)) {
      return selectedObjectIds.filter(id => id !== objectId)
    } else {
      return [...selectedObjectIds, objectId]
    }
  } else {
    // Single selection
    return [objectId]
  }
}

/**
 * Remove object from selection
 */
export function removeFromSelection(objectId: string, selectedObjectIds: string[]): string[] {
  return selectedObjectIds.filter(id => id !== objectId)
}

/**
 * Clear all selections
 */
export function clearSelection(): string[] {
  return []
}

/**
 * Select multiple objects
 */
export function selectMultipleObjects(objectIds: string[]): string[] {
  return [...objectIds]
}

/**
 * Get selected objects from the objects array
 */
export function getSelectedObjects(
  objects: ScreenmanObject[], 
  selectedObjectIds: string[]
): ScreenmanObject[] {
  return objects.filter(obj => selectedObjectIds.includes(obj.id))
}

/**
 * Find objects that intersect with a selection rectangle
 */
export function findObjectsInSelectionRect(
  objects: ScreenmanObject[],
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number
): ScreenmanObject[] {
  return objects.filter(obj => {
    // Check if object rectangle intersects with selection rectangle
    return !(
      obj.x > rectX + rectWidth ||
      obj.x + obj.width < rectX ||
      obj.y > rectY + rectHeight ||
      obj.y + obj.height < rectY
    )
  })
}

/**
 * Check if selection rectangle is valid (has minimum size)
 */
export function isValidSelectionRect(width: number, height: number): boolean {
  return Math.abs(width) >= 5 && Math.abs(height) >= 5
}

/**
 * Normalize selection rectangle coordinates (handle negative width/height from drag direction)
 */
export function normalizeSelectionRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  
  return { x, y, width, height }
}
