/**
 * Utilities for managing screen object drawing order
 * 
 * Objects are kept in a specific order in the array to ensure consistent rendering:
 * 1. Boxes
 * 2. Lines
 * 3. Icons
 * 4. MQTT Icon Fields
 * 5. Labels (including icon-labels)
 * 6. MQTT Data Fields
 * 7. Level Indicators
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
    "icon": 3,
    "MQTTIconField": 4,
    "label": 5,
    "icon-label": 5, // Same as label
    "field": 6, // Legacy field type
    "MqttDataField": 6,
    "level-indicator": 7,
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

