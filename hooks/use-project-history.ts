import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { dropStep, emptyHistory, recordStep, redoStep, sameState, undoStep, type History } from "@/lib/project-history"

// How long a gesture stays open after the pointer is released. The canvas
// commits on mouse up as well (the object a create-drag drew, the end of a
// resize), and the last mousemove render may land after the window's pointerup
// listener has run; both have to join the gesture's step, not become a second
// one. Nobody starts a new edit within 100 ms of letting go - and a keydown or
// the next pointerdown closes the gesture at once anyway.
const GESTURE_TAIL_MS = 100

// Undo/redo for the whole project (docs/2026-09-23-undo.md). Every committed
// change to `project` becomes a step - the call sites of setProject stay
// exactly as they are, none of them has to know history exists.
//
// Recorded after the commit, in an effect, not inside setProject's updater:
// StrictMode runs updaters twice, which would push every step twice. It also
// means several setProject calls from one event (a multi-delete, onAddAsset
// followed by onIncrementNextId) are batched by React into one commit and so
// into one step, which is what the user did.
//
// Everything committed between pointer down and pointer up - anywhere in the
// window, so canvas drags, handle drags and property-panel sliders alike - is
// one step. The gesture is watched here with window listeners rather than
// reported by the canvas, so no component has to remember to report it.
export function useProjectHistory<T>(project: T, setProject: Dispatch<SetStateAction<T>>) {
  const historyRef = useRef<History<T>>(emptyHistory())
  // The last committed project. Undo and redo set it to what they are about
  // to commit, so the effect sees "no change" for their own commit and does
  // not record it as a new step. Reading the current state from here rather
  // than from the `project` closure also keeps a held-down Ctrl+Z correct
  // when the next keydown arrives before React has re-rendered.
  const committedRef = useRef(project)
  // `recorded`: this gesture already pushed its step, so further commits
  // join it instead of pushing their own.
  const gestureRef = useRef({ open: false, recorded: false })
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [depths, setDepths] = useState({ past: 0, future: 0 })

  const publish = useCallback(() => {
    const { past, future } = historyRef.current
    setDepths((prev) => (prev.past === past.length && prev.future === future.length ? prev : { past: past.length, future: future.length }))
  }, [])

  const closeGesture = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    const gesture = gestureRef.current
    if (!gesture.open) return
    // Dragged away and back to the very same spot: nothing happened, as far
    // as the user can tell, so it is not something to undo either.
    const { past } = historyRef.current
    if (gesture.recorded && past.length > 0 && sameState(past[past.length - 1], committedRef.current)) {
      historyRef.current = dropStep(historyRef.current)
      publish()
    }
    gestureRef.current = { open: false, recorded: false }
  }, [publish])

  useEffect(() => {
    const onPointerDown = () => {
      closeGesture()
      gestureRef.current = { open: true, recorded: false }
    }
    const onPointerUp = () => {
      if (!gestureRef.current.open) return
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(closeGesture, GESTURE_TAIL_MS)
    }
    // Only a gesture already released is cut short by a key - one still held
    // (Shift pressed mid-drag to constrain it) stays open.
    const onKeyDown = () => {
      if (closeTimerRef.current) closeGesture()
    }
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("pointerup", onPointerUp, true)
    window.addEventListener("pointercancel", onPointerUp, true)
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("blur", closeGesture)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("pointerup", onPointerUp, true)
      window.removeEventListener("pointercancel", onPointerUp, true)
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("blur", closeGesture)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [closeGesture])

  useEffect(() => {
    const before = committedRef.current
    committedRef.current = project
    if (before === project || sameState(before, project)) return
    const gesture = gestureRef.current
    if (gesture.open && gesture.recorded) {
      // Joins the gesture's step, which already holds the state from before
      // the gesture began.
      return
    }
    historyRef.current = recordStep(historyRef.current, before)
    if (gesture.open) gesture.recorded = true
    publish()
  }, [project, publish])

  // Both return the state they restored (null when there was nothing), so
  // the caller can bring its view state in line in the same batch.
  const undo = useCallback((): T | null => {
    closeGesture()
    const result = undoStep(historyRef.current, committedRef.current)
    if (!result) return null
    historyRef.current = result.history
    committedRef.current = result.state
    setProject(result.state)
    publish()
    return result.state
  }, [setProject, publish, closeGesture])

  const redo = useCallback((): T | null => {
    closeGesture()
    const result = redoStep(historyRef.current, committedRef.current)
    if (!result) return null
    historyRef.current = result.history
    committedRef.current = result.state
    setProject(result.state)
    publish()
    return result.state
  }, [setProject, publish, closeGesture])

  return { undo, redo, canUndo: depths.past > 0, canRedo: depths.future > 0 }
}
