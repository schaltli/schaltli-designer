import type { ScreenmanObject, HardwareButton } from "@/components/screenman-editor"
import { findObjectAtPoint } from "./hit-test-utils"
import { getCanvasCoordinates } from "./coordinate-utils"
import { addToSelection, clearSelection, findObjectsInSelectionRect, normalizeSelectionRect } from "./selection-utils"

/**
 * Mouse event handlers for canvas interactions
 */

export interface DragState {
  mode: "select" | "drag" | "resize" | "create" | "line-endpoint" | "selection-rectangle"
  objectId: string | null
  startPos: { x: number; y: number }
  startObjectPos: { x: number; y: number; width: number; height: number }
  creatingType?: "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "background" | "SoftwareButton" | "tab-control"
  resizeHandle?: "nw" | "ne" | "sw" | "se" | "baseline-left" | "baseline-right"
  lineHandle?: "start" | "end"
  selectionRect?: { x: number; y: number; width: number; height: number }
}

export interface MouseHandlerContext {
  activeTool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "background" | "SoftwareButton"
  selectedObjectIds: string[]
  screenObjects: ScreenmanObject[]
  hardwareButtons: HardwareButton[]
  zoom: number
  screenWidth: number
  screenHeight: number
  offset: { x: number; y: number }
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  onSelectObjects: (ids: string[]) => void
  onUpdateObject: (objectId: string, updates: Partial<ScreenmanObject>) => void
  onAddObject: (object: Omit<ScreenmanObject, "id" | "zIndex">) => void
  onHardwareButtonClick?: (button: HardwareButton) => void
  onIconToolClick?: (position: { x: number; y: number }) => void
  setDragState: (state: DragState | null) => void
  setHoveredObjectId: (id: string | null) => void
  setHoveredSvgButtonId: (id: string | null) => void
  setActiveSnapLines: (lines: Array<{ type: "vertical" | "horizontal"; position: number }>) => void
  detectSvgButtonAtPoint: (x: number, y: number) => string | null
  findLineHandle: (obj: ScreenmanObject, x: number, y: number) => "start" | "end" | null
  findResizeHandle: (obj: ScreenmanObject, x: number, y: number) => "nw" | "ne" | "sw" | "se" | "baseline-left" | "baseline-right" | null
}

/**
 * Handle mouse down events
 */
export function handleMouseDown(
  e: React.MouseEvent,
  canvas: HTMLCanvasElement,
  context: MouseHandlerContext
): void {
  const coords = getCanvasCoordinates(
    e.clientX, 
    e.clientY, 
    canvas, 
    context.zoom, 
    context.screenWidth, 
    context.screenHeight, 
    context.offset
  )
  
  const isCtrlOrCmd = e.ctrlKey || e.metaKey
  const isShift = e.shiftKey

  // Check for SVG button click first
  const clickedSvgButton = context.detectSvgButtonAtPoint(coords.x, coords.y)
  if (clickedSvgButton) {
    const hardwareButton = context.hardwareButtons.find((button) => button.svgElementId === clickedSvgButton)
    if (hardwareButton && context.onHardwareButtonClick) {
      context.onHardwareButtonClick(hardwareButton)
      return
    }
  }

  if (context.activeTool === "icon") {
    if (context.onIconToolClick) {
      context.onIconToolClick(coords)
    }
    return
  }

  if (context.activeTool !== "select") {
    // Start creating the object with drag state
    context.setDragState({
      mode: "create",
      objectId: null,
      startPos: coords,
      startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
      creatingType: context.activeTool,
    })
    return
  }

  const clickedObject = findObjectAtPoint(coords.x, coords.y, context.screenObjects)

  if (clickedObject) {
    const isAlreadySelected = context.selectedObjectIds.includes(clickedObject.id)

    if (isCtrlOrCmd || isShift) {
      // Modifier key pressed - add/remove from selection
      context.onSelectObject(clickedObject.id, true)
    } else if (!isAlreadySelected) {
      // No modifier key and object not selected - single select it
      context.onSelectObject(clickedObject.id, false)
    }

    // Only allow dragging/resizing if this object is selected
    const willBeSelected = isAlreadySelected || !(isCtrlOrCmd || isShift)
    if (willBeSelected) {
      if (clickedObject.type === "line") {
        const lineHandle = context.findLineHandle(clickedObject, coords.x, coords.y)
        if (lineHandle) {
          context.setDragState({
            mode: "line-endpoint",
            objectId: clickedObject.id,
            startPos: coords,
            startObjectPos: {
              x: clickedObject.x,
              y: clickedObject.y,
              width: clickedObject.width,
              height: clickedObject.height,
            },
            lineHandle,
          })
          return
        }
      } else {
        const resizeHandle = context.findResizeHandle(clickedObject, coords.x, coords.y)
        if (resizeHandle) {
          context.setDragState({
            mode: "resize",
            objectId: clickedObject.id,
            startPos: coords,
            startObjectPos: {
              x: clickedObject.x,
              y: clickedObject.y,
              width: clickedObject.width,
              height: clickedObject.height,
            },
            resizeHandle,
          })
          return
        }
      }

      context.setDragState({
        mode: "select",
        objectId: clickedObject.id,
        startPos: coords,
        startObjectPos: {
          x: clickedObject.x,
          y: clickedObject.y,
          width: clickedObject.width,
          height: clickedObject.height,
        },
      })
    }
  } else {
    if (isCtrlOrCmd || isShift) {
      // Don't clear selection when using modifier keys on empty space
      return
    } else {
      context.onSelectObject(null)
      context.setDragState({
        mode: "selection-rectangle",
        objectId: null,
        startPos: coords,
        startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
        selectionRect: { x: coords.x, y: coords.y, width: 0, height: 0 },
      })
    }
  }
}

/**
 * Handle mouse move events
 */
export function handleMouseMove(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  dragState: DragState | null,
  context: MouseHandlerContext
): void {
  const coords = getCanvasCoordinates(
    e.clientX, 
    e.clientY, 
    canvas, 
    context.zoom, 
    context.screenWidth, 
    context.screenHeight, 
    context.offset
  )

  if (!dragState) {
    // Update hover state
    const hoveredObject = findObjectAtPoint(coords.x, coords.y, context.screenObjects)
    context.setHoveredObjectId(hoveredObject?.id || null)

    const hoveredSvgButton = context.detectSvgButtonAtPoint(coords.x, coords.y)
    context.setHoveredSvgButtonId(hoveredSvgButton || null)

    // Update cursor based on hover state
    if (context.activeTool !== "select" && context.activeTool !== "background") {
      canvas.style.cursor = "crosshair"
    } else if (hoveredObject && context.selectedObjectIds.includes(hoveredObject.id)) {
      if (hoveredObject.type === "line") {
        const lineHandle = context.findLineHandle(hoveredObject, coords.x, coords.y)
        canvas.style.cursor = lineHandle ? "grab" : "move"
      } else {
        const resizeHandle = context.findResizeHandle(hoveredObject, coords.x, coords.y)
        canvas.style.cursor = resizeHandle ? "nw-resize" : "move"
      }
    } else if (hoveredObject) {
      canvas.style.cursor = "pointer"
    } else {
      canvas.style.cursor = "default"
    }
    return
  }

  // Handle drag operations
  switch (dragState.mode) {
    case "create":
      // Update creation rectangle
      break

    case "selection-rectangle":
      if (dragState.selectionRect) {
        const width = coords.x - dragState.startPos.x
        const height = coords.y - dragState.startPos.y
        const normalizedRect = normalizeSelectionRect(
          dragState.startPos.x,
          dragState.startPos.y,
          coords.x,
          coords.y
        )
        
        context.setDragState({
          ...dragState,
          selectionRect: normalizedRect,
        })
      }
      break

    case "select":
      // Handle object dragging
      break

    case "resize":
      // Handle object resizing
      break

    case "line-endpoint":
      // Handle line endpoint dragging
      break
  }
}

/**
 * Handle mouse up events
 */
export function handleMouseUp(
  dragState: DragState | null,
  context: MouseHandlerContext
): void {
  if (!dragState) return

  switch (dragState.mode) {
    case "selection-rectangle":
      if (dragState.selectionRect) {
        const intersectingObjects = findObjectsInSelectionRect(
          context.screenObjects,
          dragState.selectionRect.x,
          dragState.selectionRect.y,
          dragState.selectionRect.width,
          dragState.selectionRect.height
        )
        
        if (intersectingObjects.length > 0) {
          const objectIds = intersectingObjects.map(obj => obj.id)
          context.onSelectObjects(objectIds)
        }
      }
      break

    case "create":
      // Create new object
      if (dragState.creatingType) {
        const width = Math.abs(dragState.startObjectPos.x - dragState.startPos.x)
        const height = Math.abs(dragState.startObjectPos.y - dragState.startPos.y)
        
        if (width >= 5 && height >= 5) { // Minimum size
          // Object creation logic would go here
          // This would call context.onAddObject with the new object
        }
      }
      break

    case "select":
    case "resize":
    case "line-endpoint":
      // Apply object updates
      break
  }

  context.setDragState(null)
  context.setActiveSnapLines([])
}
