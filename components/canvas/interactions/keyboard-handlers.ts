/**
 * Keyboard event handlers for canvas interactions
 */

export interface KeyboardHandlerContext {
  selectedObjectIds: string[]
  onDeleteObject: (objectId: string) => void
  onSelectObject: (id: string | null) => void
  onCopy: () => void
  onPaste: () => void
  hasClipboard: boolean
  onToolChange: (tool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "MqttDataLine" | "box" | "level-indicator" | "SoftwareButton") => void
}

/**
 * Handle keyboard events
 */
export function handleKeyDown(
  e: React.KeyboardEvent,
  context: KeyboardHandlerContext
): void {
  // Delete selected objects
  if (e.key === "Delete" && context.selectedObjectIds.length > 0) {
    context.selectedObjectIds.forEach((id) => context.onDeleteObject(id))
    return
  }

  // Clear selection
  if (e.key === "Escape") {
    context.onSelectObject(null)
    return
  }

  // Copy/Paste operations
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "c":
        if (context.selectedObjectIds.length > 0) {
          context.onCopy()
        }
        break
      
      case "v":
        if (context.hasClipboard) {
          context.onPaste()
        }
        break
      
      case "a":
        // Select all objects (would need to be implemented)
        e.preventDefault()
        break
    }
    return
  }

  // Tool shortcuts
  switch (e.key.toLowerCase()) {
    case "v":
      context.onToolChange("select")
      break
    case "t":
      context.onToolChange("label")
      break
    case "f":
      context.onToolChange("MqttDataField")
      break
    case "l":
      context.onToolChange("line")
      break
    case "r":
      context.onToolChange("box")
      break
    case "i":
      context.onToolChange("icon")
      break
    case "g":
      context.onToolChange("level-indicator")
      break
  }
}

/**
 * Check if a key combination is a known shortcut
 */
export function isKnownShortcut(e: React.KeyboardEvent): boolean {
  // Delete key
  if (e.key === "Delete") return true
  
  // Escape key
  if (e.key === "Escape") return true
  
  // Ctrl/Cmd combinations
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase()
    return ["c", "v", "a", "z", "y"].includes(key)
  }
  
  // Tool shortcuts
  const toolKeys = ["v", "t", "f", "l", "r", "i", "g"]
  return toolKeys.includes(e.key.toLowerCase())
}

/**
 * Get the display name for a keyboard shortcut
 */
export function getShortcutDisplayName(e: React.KeyboardEvent): string {
  const parts: string[] = []
  
  if (e.ctrlKey) parts.push("Ctrl")
  if (e.metaKey) parts.push("Cmd")
  if (e.altKey) parts.push("Alt")
  if (e.shiftKey) parts.push("Shift")
  
  parts.push(e.key.toUpperCase())
  
  return parts.join(" + ")
}
