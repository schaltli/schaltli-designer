import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { emptyHistory, recordStep, redoStep, undoStep, type History } from "@/lib/project-history"

// Undo/redo for the whole project (docs/2026-09-23-undo.md). Every committed
// change to `project` becomes a step - the call sites of setProject stay
// exactly as they are, none of them has to know history exists.
//
// Recorded after the commit, in an effect, not inside setProject's updater:
// StrictMode runs updaters twice, which would push every step twice. It also
// means several setProject calls from one event (a multi-delete, onAddAsset
// followed by onIncrementNextId) are batched by React into one commit and so
// into one step, which is what the user did.
export function useProjectHistory<T>(project: T, setProject: Dispatch<SetStateAction<T>>) {
  const historyRef = useRef<History<T>>(emptyHistory())
  // The last committed project. Undo and redo set it to what they are about
  // to commit, so the effect sees "no change" for their own commit and does
  // not record it as a new step. Reading the current state from here rather
  // than from the `project` closure also keeps a held-down Ctrl+Z correct
  // when the next keydown arrives before React has re-rendered.
  const committedRef = useRef(project)
  const [depths, setDepths] = useState({ past: 0, future: 0 })

  const publish = useCallback(() => {
    const { past, future } = historyRef.current
    setDepths((prev) => (prev.past === past.length && prev.future === future.length ? prev : { past: past.length, future: future.length }))
  }, [])

  useEffect(() => {
    const before = committedRef.current
    committedRef.current = project
    if (before === project) return
    historyRef.current = recordStep(historyRef.current, before)
    publish()
  }, [project, publish])

  // Both return the state they restored (null when there was nothing), so
  // the caller can bring its view state in line in the same batch.
  const undo = useCallback((): T | null => {
    const result = undoStep(historyRef.current, committedRef.current)
    if (!result) return null
    historyRef.current = result.history
    committedRef.current = result.state
    setProject(result.state)
    publish()
    return result.state
  }, [setProject, publish])

  const redo = useCallback((): T | null => {
    const result = redoStep(historyRef.current, committedRef.current)
    if (!result) return null
    historyRef.current = result.history
    committedRef.current = result.state
    setProject(result.state)
    publish()
    return result.state
  }, [setProject, publish])

  return { undo, redo, canUndo: depths.past > 0, canRedo: depths.future > 0 }
}
