// The undo/redo stacks behind Ctrl+Z (docs/2026-09-23-undo.md). Pure data,
// no React: hooks/use-project-history.ts decides *when* a step is recorded,
// this only keeps the stacks straight.
//
// A step is the state as it was *before* a change. Steps share structure
// with each other because the project is only ever updated immutably, so a
// hundred of them cost the changed branches, not a hundred copies.

export const HISTORY_LIMIT = 100

export interface History<T> {
  // Oldest first; the last entry is what Ctrl+Z goes back to.
  past: T[]
  // Nearest first; the first entry is what Ctrl+Y goes forward to.
  future: T[]
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

// A new change: the state before it becomes a step, and whatever was undone
// before can no longer be redone - it belonged to a branch that is now gone.
export function recordStep<T>(history: History<T>, before: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...history.past, before]
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] }
}

// Goes one step back from `current`, which moves onto the redo stack. Null
// when there is nothing to undo, so the caller can leave everything alone.
export function undoStep<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  if (history.past.length === 0) return null
  const state = history.past[history.past.length - 1]
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, state }
}

export function redoStep<T>(history: History<T>, current: T): { history: History<T>; state: T } | null {
  if (history.future.length === 0) return null
  const [state, ...future] = history.future
  return { history: { past: [...history.past, current], future }, state }
}
