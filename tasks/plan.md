# Implementation plan: undo and redo

Spec: `docs/2026-09-23-undo.md` (agreed 2026-09-23). Closes issue #5.
Task checklist: `tasks/todo.md`.

## Overview

A history of `Project` snapshots, recorded after each commit in
`project-editor.tsx`. Each step carries the project, screen and selection as
they were before the change. Keyboard, toolbar and handbook sit on top. The
work is split so that the first task already gives a usable Ctrl+Z for
discrete edits. The riskiest part, merging a gesture into a single step,
comes second.

## What the code looks like today

- All project state lives in `useState<Project>` in `project-editor.tsx`
  (line ~643). There are 39 `setProject` call sites there, all functional or
  whole-value updates, and none of them runs inside a `useEffect`. That makes
  recording after the commit safe: no effect produces a change of its own.
- `setProject` is also handed out as `onProjectUpdate` / `onRestoreVersion` to
  `DeployDialog`, `VersionHistoryDialog`, `ProjectSettingsDialog` and
  `ScreensPanel`, and as `onIncrementNextId`. The last one runs in the same
  event as `onAddAsset` (see the comment in `screens-panel.tsx`). React batches
  the two into one commit, so they become one step with no extra work.
- Wholesale replacements: new project (~2113, ~2156), upload/load (~2476),
  autosave restore (~2675), Version History restore (via `onRestoreVersion`).
- Ctrl+C/V/A live in one `handleKeyDown` in `project-editor.tsx` (~2583),
  together with `isInputFocused()`. Undo/redo go in there too.

## Architecture decisions

1. **Record after the commit, in an effect keyed on `project`.** Recording
   inside the updater is impure, and StrictMode runs updaters twice. A
   `previousProjectRef` holds the last committed value. A `suppressRef` marks
   commits that come from undo, redo or a load.
2. **The before-view comes from a ref, not from state.** Paste changes the
   project and the selection in the same commit. So the recording effect reads
   the screen and selection from a `lastViewRef`. A second effect keyed on
   `[currentScreenId, selectedObjectIds]` updates that ref, and it is declared
   *after* the recording effect, so within one commit the ref still holds the
   old view when the recording effect runs.
3. **Gesture = pointer down to pointer up anywhere in the editor**, observed
   with window listeners in the hook. `canvas.tsx` is not touched. This covers
   canvas drags, Radix sliders in the property panel and any drag in a panel.
   The gesture closes 100 ms after `pointerup`, because the canvas commits on
   mouse up too (creating an object, the end of a resize), and that commit -
   or the last mousemove render - can land after the window listener. A
   keydown or the next pointerdown closes it at once, and so do
   `pointercancel` and window `blur`. (Planned as `setTimeout 0`; changed
   while building Task 2, since a continuous-priority render is not
   guaranteed to beat a zero timeout.)
4. **Merge rule in one place:** a change joins the top step when a gesture is
   open, or when the same input element has focus and the last change was
   under 1 s ago. Otherwise it opens a new step. Joining means nothing is
   pushed, because the top entry already holds the before-state. Every change
   clears redo.
5. **`lib/project-history.ts` is pure** (past/future, push, undo, redo,
   clear, limit 100) with no React. The hook wraps it with refs and exposes
   `canUndo`/`canRedo` as state for the toolbar.

## Task list

### Phase 1: Foundation
- [x] Task 1: Ctrl+Z / Ctrl+Y for discrete edits
- [x] Task 2: One gesture = one step

### Checkpoint A
- [ ] `npx playwright test e2e/undo.spec.ts` and `npm run typecheck` green
- [ ] Manual: drag, resize, delete, paste on a real project; one Ctrl+Z each
- [ ] Review with the user

### Phase 2: Completeness
- [ ] Task 3: Loads clear history; no step the user did not make
- [ ] Task 4: Typing in a field is one step per field edit
- [ ] Task 5: Undo restores screen and selection

### Checkpoint B
- [ ] `npm run test:e2e` green
- [ ] Review with the user

### Phase 3: Surface and handbook
- [ ] Task 6: Undo/Redo toolbar buttons and the 100-step limit
- [ ] Task 7: Handbook, shortcut list, close #5

### Checkpoint C (done)
- [ ] `npm run test:all` green (hardware suites may be skipped with a warning)
- [ ] Every success criterion in the spec ticked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A commit from the mouse-up handler lands after the gesture has closed, so a drag leaves two steps | High | Close the gesture one macrotask late (decision 3); the Task 2 test drags *and* creates objects by drag |
| `DeployDialog` / another dialog writes into the project without the user making an edit (e.g. device or version fields), which creates phantom steps | Med | Task 3 goes through every `onProjectUpdate` caller; each write becomes a step, a history clear, or is suppressed, and the choice is written into the code comment |
| Keystroke-per-commit typing in property fields not recognised as one input (focus moves to a portal, Radix Select) | Med | The key is `document.activeElement` at commit time; Task 4 tests a text input, a number input and a colour field |
| Memory with large embedded assets (fonts, images) across 100 steps | Low | Snapshots share every unchanged branch; only changed paths are copied. Measure once in Task 6 with the combined test project |
| Ctrl+Y collides with a browser shortcut (history in some browsers) | Low | `preventDefault` as with Ctrl+C/V/A; only outside inputs |

## Parallelisation

Task 7 (handbook text) can be drafted alongside Tasks 4-6. Everything else
touches the same hook in `project-editor.tsx` and runs in order.

## Open questions

None at the moment. Task 3 may raise one if a dialog turns out to write
project fields the user never sees as an edit.
