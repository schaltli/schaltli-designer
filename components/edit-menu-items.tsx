"use client"

import type { SnapSide } from "@/lib/snap-table"

// What the right-click menus of the canvas and of the object list both offer
// for the clipboard (the user, 2026-11-15: the same in both). Each item
// closes the menu through `onDone` after it has acted.

export interface EditMenuActions {
  hasSelection: boolean
  hasClipboard: boolean
  onCopy: () => void
  onCut?: () => void
  onPaste: () => void
  /** Paste Above, Below, Left, Right (lib/paste-beside.ts). */
  onPasteBeside?: (side: SnapSide) => void
  canPasteBeside?: boolean
  /** Paste Replace: the clipboard's one object where the chosen one was. */
  onPasteReplace?: () => void
  canPasteReplace?: boolean
}

const PASTE_SIDES: ReadonlyArray<readonly [SnapSide, string]> = [
  ["top", "Paste Above"],
  ["bottom", "Paste Below"],
  ["left", "Paste Left"],
  ["right", "Paste Right"],
]

export const MENU_ITEM_CLASS =
  "w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"

export function EditMenuItems({ actions, onDone }: { actions: EditMenuActions; onDone: () => void }) {
  const act = (fn: () => void) => () => {
    fn()
    onDone()
  }
  const a = actions
  return (
    <>
      <button className={MENU_ITEM_CLASS} onClick={act(a.onCopy)} disabled={!a.hasSelection}>
        Copy
      </button>
      {a.onCut ? (
        <button className={MENU_ITEM_CLASS} onClick={act(a.onCut)} disabled={!a.hasSelection}>
          Cut
        </button>
      ) : null}
      <button className={MENU_ITEM_CLASS} onClick={act(a.onPaste)} disabled={!a.hasClipboard}>
        Paste
      </button>
      {a.onPasteBeside
        ? PASTE_SIDES.map(([side, label]) => (
            <button key={side} className={MENU_ITEM_CLASS} onClick={act(() => a.onPasteBeside!(side))} disabled={!a.canPasteBeside}>
              {label}
            </button>
          ))
        : null}
      {a.onPasteReplace ? (
        <button className={MENU_ITEM_CLASS} onClick={act(a.onPasteReplace)} disabled={!a.canPasteReplace}>
          Paste Replace
        </button>
      ) : null}
    </>
  )
}
