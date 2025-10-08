/**
 * Canvas interaction utilities
 * 
 * This module provides a clean separation of interaction logic from rendering logic.
 * It includes utilities for:
 * - Hit testing and object detection
 * - Grid snapping and alignment
 * - Selection management
 * - Coordinate transformations
 * - Mouse event handling
 * - Keyboard shortcuts
 */

// Hit testing utilities
export * from "./hit-test-utils"

// Grid snapping utilities
export * from "./snap-utils"

// Selection management
export * from "./selection-utils"

// Coordinate transformations
export * from "./coordinate-utils"

// Mouse event handlers
export * from "./mouse-handlers"

// Keyboard event handlers
export * from "./keyboard-handlers"

// Re-export types for convenience
export type {
  DragState,
  MouseHandlerContext,
} from "./mouse-handlers"

export type {
  KeyboardHandlerContext,
} from "./keyboard-handlers"

export type {
  SelectionState,
} from "./selection-utils"

export type {
  SnapResult,
} from "./snap-utils"
