# Undo and redo: tasks

Plan: `tasks/plan.md` · Spec: `docs/2026-09-23-undo.md`

## Task 1: Ctrl+Z / Ctrl+Y for discrete edits

**Description:** The history module plus the recording hook in
`project-editor.tsx`, wired to Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (and Cmd on the
Mac) in the existing `handleKeyDown`. No merging yet: each commit is its own
step. After this task, deleting an object and pressing Ctrl+Z brings it back.

**Acceptance criteria:**
- [x] Deleting an object, a screen or a topic can be undone and redone, with
      the same id and drawing-order position.
- [x] A new edit after an undo empties redo.
- [x] With a text input focused, Ctrl+Z leaves the project untouched; in
      preview mode the keys do nothing.

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts`
- [x] `npm run typecheck`
- [ ] Manual: delete three objects, three Ctrl+Z, two Ctrl+Y in `npm run dev`
      (not done yet - the e2e spec covers the same chords; left for Checkpoint A)

**Dependencies:** None

**Files touched:** `lib/project-history.ts`, `hooks/use-project-history.ts` (the
hook lives beside the other hooks, not inline in the 3000-line editor),
`components/project-editor.tsx`, `e2e/undo.spec.ts`

**Estimated scope:** M

## Task 2: One gesture = one step

**Description:** Pointer down to pointer up anywhere in the editor opens a
gesture. Every commit inside it joins one step. The gesture closes one
macrotask after `pointerup`, and also on `pointercancel` or window `blur`
(plan, decision 3). This goes first among the merge rules because it carries
the most risk.

**Acceptance criteria:**
- [ ] Dragging an object across many mousemove events is exactly one undo
      step, back to the exact start position.
- [ ] Creating an object by drag and resizing one by its handle are one step
      each.
- [ ] A click that changes nothing creates no step.

**Verification:**
- [ ] `npx playwright test e2e/undo.spec.ts`
- [ ] Manual: arc-handle drag and a property-panel slider, one Ctrl+Z each

**Dependencies:** Task 1

**Files likely touched:** `components/project-editor.tsx`,
`lib/project-history.ts`, `e2e/undo.spec.ts`

**Estimated scope:** S

## Checkpoint A
- [ ] undo spec and typecheck green
- [ ] Manual run on a real project
- [ ] Review with the user before Phase 2

## Task 3: Loads clear history; no step the user did not make

**Description:** A new project, an upload, an autosave restore, a Version
History restore and the device choice in the startup gate clear both stacks
and suppress recording of that commit. Check every `onProjectUpdate` caller,
starting with `DeployDialog`, for writes that are not user edits, and record
per caller in a comment whether its write is a step, a clear or suppressed.

**Acceptance criteria:**
- [ ] After each of the five loads, Ctrl+Z changes nothing.
- [ ] Deploying adds no undo step, unless the inventory decides otherwise
      and the user agrees.
- [ ] The inventory is written down as code comments at the call sites.

**Verification:**
- [ ] `npx playwright test e2e/undo.spec.ts e2e/autosave-recovery.spec.ts`

**Dependencies:** Task 1

**Files likely touched:** `components/project-editor.tsx`,
`components/deploy-dialog.tsx`, `components/version-history-dialog.tsx`,
`e2e/undo.spec.ts`

**Estimated scope:** M

## Task 4: Typing in a field is one step per field edit

**Description:** A commit made while an input, textarea or contenteditable is
focused joins the top step if it is the same element and the last change was
under 1 s ago.

**Acceptance criteria:**
- [ ] A label typed into the property panel and then blurred goes back to the
      old label with one Ctrl+Z.
- [ ] Two edits to the same field with a pause of more than 1 s are two
      steps; edits to two different fields are two steps.
- [ ] Works for a text, a number and a colour input.

**Verification:**
- [ ] `npx playwright test e2e/undo.spec.ts`

**Dependencies:** Task 2

**Files likely touched:** `components/project-editor.tsx`,
`lib/project-history.ts`, `e2e/undo.spec.ts`

**Estimated scope:** S

## Task 5: Undo restores screen and selection

**Description:** Each step also stores `currentScreenId` and
`selectedObjectIds` from before the change, read from `lastViewRef` (plan,
decision 2). Undo restores both; redo restores the view as it was right after
the change. Ids missing from the restored project are dropped.

**Acceptance criteria:**
- [ ] An edit on screen 1, a switch to screen 2, then Ctrl+Z: the editor
      shows screen 1 with the edit undone.
- [ ] Undoing a delete of two objects reselects exactly those two.
- [ ] Undoing a paste restores the selection from before the paste; redo
      selects the pasted objects again.

**Verification:**
- [ ] `npx playwright test e2e/undo.spec.ts`

**Dependencies:** Task 1

**Files likely touched:** `components/project-editor.tsx`,
`lib/project-history.ts`, `e2e/undo.spec.ts`

**Estimated scope:** S

## Checkpoint B
- [ ] `npm run test:e2e` green
- [ ] Review with the user before Phase 3

## Task 6: Undo/Redo toolbar buttons and the 100-step limit

**Description:** Two icon buttons in the toolbar with the tooltips *Undo* and
*Redo* plus the shortcut, disabled while their stack is empty and in preview
mode. The history drops the oldest step beyond 100. Measure the memory of 100
steps once with the combined test project.

**Acceptance criteria:**
- [ ] The buttons do the same as the keys and are disabled when their stack
      is empty.
- [ ] After 101 changes the first can no longer be undone, the second can.
- [ ] Memory measurement noted in the commit message.

**Verification:**
- [ ] `npx playwright test e2e/undo.spec.ts`
- [ ] Manual: button states in light and dark theme

**Dependencies:** Tasks 1-5

**Files likely touched:** `components/toolbar/toolbar.tsx`,
`components/project-editor.tsx`, `lib/project-history.ts`,
`e2e/undo.spec.ts`

**Estimated scope:** S

## Task 7: Handbook, shortcut list, close #5

**Description:** Remove both `handbuch-macke #5` warnings, add Ctrl+Z,
Ctrl+Y and Ctrl+Shift+Z to `tastatur.md`, and describe the toolbar buttons
with `<span class="ui">` labels. Run the text through `maettel-humanizer`.
Check that `keyboard-handlers.ts` stays consistent. Close issue #5 with the
commit reference.

**Acceptance criteria:**
- [ ] `grep -r "handbuch-macke #5" handbuch` finds nothing.
- [ ] `e2e/handbook-labels.spec.ts` green with the new labels.
- [ ] Issue #5 closed.

**Verification:**
- [ ] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`
- [ ] `npm run dev --prefix handbuch`, read the three pages

**Dependencies:** Task 6

**Files likely touched:** `handbuch/designer/index.md`,
`handbuch/designer/objekte.md`, `handbuch/designer/tastatur.md`,
`components/canvas/interactions/keyboard-handlers.ts`

**Estimated scope:** S

## Checkpoint C (done)
- [ ] `npm run test:all` green (hardware suites may be skipped with a warning)
- [ ] Every success criterion in `docs/2026-09-23-undo.md` ticked
