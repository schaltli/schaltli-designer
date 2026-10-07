import type { KeyboardEvent } from "react"

/**
 * Enter or Esc in a text field finishes it (the user, 2026-10-07: draw,
 * type, Enter). The text is saved as typed, so finishing only lets go of the
 * field - and hands the keyboard back to the canvas, so a second Esc clears
 * the selection and Delete or the arrows act on the object again.
 *
 * The key stops here: the editor's own Esc (project-editor.tsx) would
 * otherwise see it after the canvas has the focus and leave a group being
 * edited. Inside a dialog the field only lets go, and the key goes on - the
 * dialog answers its own Esc.
 */
export function finishField(e: KeyboardEvent<HTMLElement>): void {
  const field = e.currentTarget
  field.blur()
  if (field.closest('[role="dialog"], [role="alertdialog"]')) return
  e.stopPropagation()
  document.querySelector<HTMLElement>("[data-canvas-keys]")?.focus({ preventScroll: true })
}

/** Whether a key finishes a text field. */
export function finishesField(key: string): boolean {
  return key === "Enter" || key === "Escape"
}
