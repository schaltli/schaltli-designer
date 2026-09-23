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

// Takes back the newest step without offering it for redo - for a gesture
// that ended where it started, which the user never experienced as a change.
export function dropStep<T>(history: History<T>): History<T> {
  return { past: history.past.slice(0, -1), future: history.future }
}

// Structural equality that costs only the parts that differ: the project is
// updated immutably, so an untouched branch is the same reference on both
// sides and is skipped at the first `===`. Used so that a commit which
// rebuilds the project without changing it (a click that "moves" an object
// by zero pixels) does not become a step.
export function sameState(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((item, i) => sameState(item, other[i]))
  }
  const aKeys = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const bKeys = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => sameState((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
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
