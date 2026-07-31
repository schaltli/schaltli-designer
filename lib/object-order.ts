/**
 * Utilities for managing screen object drawing order
 * 
 * Objects are kept in a specific order in the array to ensure consistent rendering:
 * 1. Boxes
 * 2. Lines
 * 3. Icons
 * 4. Labels
 * 5. MQTT Icon Fields
 * 6. MQTT Data Fields
 * 7. Level Indicators
 * 8. Software Buttons
 */

import type { ScreenmanObject } from "@/components/screenman-editor"

/**
 * Get the sort order priority for an object type
 * Lower numbers are drawn first (appear behind)
 */
export function getObjectTypeSortOrder(type: ScreenmanObject["type"]): number {
  const orderMap: Record<ScreenmanObject["type"], number> = {
    "box": 1,
    "line": 2,
    "MqttDataLine": 2,
    "icon": 3,
    "label": 4,
    "MQTTIconField": 5,
    "field": 6, // Legacy field type
    "MqttDataField": 6,
    "level-indicator": 7,
    "SoftwareButton": 8,
    // Only affects where a newly-inserted top-level tab-control lands
    // relative to other top-level objects (insertObjectInOrder) - a
    // tab-control typically wraps controls added after the screen's basic
    // furniture is laid out, hence placed near the end, same reasoning as
    // SoftwareButton. "panel" never appears at top level in practice (only
    // ever a tab-control's own child, see sortChildrenByZIndex), this entry
    // exists purely so the Record stays exhaustive.
    "tab-control": 9,
    "panel": 10,
  }
  
  return orderMap[type] ?? 999 // Unknown types go to the end
}

/**
 * Sort objects array by drawing order
 * Returns a new sorted array
 */
export function sortObjectsByDrawingOrder(objects: ScreenmanObject[]): ScreenmanObject[] {
  return [...objects].sort((a, b) => {
    const orderA = getObjectTypeSortOrder(a.type)
    const orderB = getObjectTypeSortOrder(b.type)
    
    // Primary sort by type order
    if (orderA !== orderB) {
      return orderA - orderB
    }
    
    // Secondary sort by ID to maintain stable order within same type
    return a.id.localeCompare(b.id)
  })
}

/**
 * Sort a tab-control/panel's children by zIndex ascending (id as a stable
 * tiebreak). Deliberately NOT the same mechanism as
 * sortObjectsByDrawingOrder() above (type-category order) - that function
 * governs pre-existing top-level screen.objects ordering, an established
 * invariant (the interactive canvas trusts array order and never re-sorts
 * it; see the comment in canvas.tsx's draw loop) that this feature doesn't
 * touch. Children arrays are new with no such invariant to preserve, so
 * they use zIndex directly - the same field the firmware's ScreenRenderer
 * already sorts objects by (see the std::sort calls in renderScreen()/
 * renderObjectsPartial()), keeping this one new subtree's ordering
 * consistent between the designer and the device from the start.
 */
export function sortChildrenByZIndex(children: ScreenmanObject[]): ScreenmanObject[] {
  return [...children].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
}

/**
 * Insert an object into an array maintaining drawing order
 * Returns a new array with the object inserted at the correct position
 */
export function insertObjectInOrder(objects: ScreenmanObject[], newObject: ScreenmanObject): ScreenmanObject[] {
  const newOrder = getObjectTypeSortOrder(newObject.type)
  
  // Find the insertion index
  let insertIndex = objects.length
  for (let i = 0; i < objects.length; i++) {
    const currentOrder = getObjectTypeSortOrder(objects[i].type)
    if (currentOrder > newOrder) {
      insertIndex = i
      break
    }
  }
  
  // Insert at the found position
  const newArray = [...objects]
  newArray.splice(insertIndex, 0, newObject)
  return newArray
}

