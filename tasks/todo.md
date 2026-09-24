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
- [x] Manual: delete three objects, three Ctrl+Z, two Ctrl+Y in `npm run dev`
      (by the user at Checkpoint A, 2026-09-23)

**Dependencies:** None

**Files touched:** `lib/project-history.ts`, `hooks/use-project-history.ts` (the
hook lives beside the other hooks, not inline in the 3000-line editor),
`components/project-editor.tsx`, `e2e/undo.spec.ts`

**Estimated scope:** M

## Task 2: One gesture = one step

**Description:** Pointer down to pointer up anywhere in the editor opens a
gesture. Every commit inside it joins one step. The gesture closes 100 ms
after `pointerup` (sooner on a keydown or the next pointerdown), and also on
`pointercancel` or window `blur` (plan, decision 3). This goes first among the merge rules because it carries
the most risk.

**Acceptance criteria:**
- [x] Dragging an object across many mousemove events is exactly one undo
      step, back to the exact start position.
- [x] Creating an object by drag and resizing one by its handle are one step
      each.
- [x] A click that changes nothing, or a drag back to where it began,
      creates no step.

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts`
- [x] Manual: arc-handle drag and a property-panel slider, one Ctrl+Z each
      (by the user at Checkpoint A, 2026-09-23)

**Dependencies:** Task 1

**Files likely touched:** `components/project-editor.tsx`,
`lib/project-history.ts`, `e2e/undo.spec.ts`

**Estimated scope:** S

## Checkpoint A
- [x] undo spec and typecheck green
- [x] Manual run on a real project
- [x] Review with the user before Phase 2

## Task 3: Loads clear history; no step the user did not make

**Description:** A new project, an upload, an autosave restore, a Version
History restore and the device choice in the startup gate clear both stacks
and suppress recording of that commit. Check every `onProjectUpdate` caller,
starting with `DeployDialog`, for writes that are not user edits, and record
per caller in a comment whether its write is a step, a clear or suppressed.

**Acceptance criteria:**
- [x] After each of the five loads, Ctrl+Z changes nothing.
- [x] Deploying adds no undo step, and undo keeps the binding it wrote
      (decided with the user 2026-09-23).
- [x] The inventory is written down as code comments at the call sites.

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts e2e/autosave-recovery.spec.ts`
      (plus version-history and deploy-dialog specs: 25/25)

**Dependencies:** Task 1

**Files touched:** `hooks/use-project-history.ts` (replace, amend, carry),
`components/project-editor.tsx`, `e2e/undo.spec.ts`. The dialogs themselves
needed no change: the editor hands them `history.amend` / `history.replace`.

**Estimated scope:** M

## Task 4: Typing in a field is one step per field edit

**Description:** A commit made while an input, textarea or contenteditable is
focused joins the top step if it is the same element and the last change was
under 1 s ago.

**Acceptance criteria:**
- [x] A label typed into the property panel and then blurred goes back to the
      old label with one Ctrl+Z.
- [x] Two edits to the same field with a pause of more than 1 s are two
      steps; edits to two different fields are two steps.
- [x] Works for a text and a number field. (Colours are palette picks, not
      typed - each pick is its own step already.)

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts`

**Dependencies:** Task 2

**Files touched:** `hooks/use-project-history.ts`, `e2e/undo.spec.ts`,
`docs/2026-09-23-undo.md` (step boundaries brought up to date).

**Estimated scope:** S

## Task 5: Undo restores screen and selection

**Description:** Each step also stores `currentScreenId` and
`selectedObjectIds` from before the change, read from `viewRef` (plan,
decision 2). Undo restores both; redo restores the view as it was right after
the change. Ids missing from the restored project are dropped.

**Acceptance criteria:**
- [x] An edit on screen 1, a switch to screen 2, then Ctrl+Z: the editor
      shows screen 1 with the edit undone.
- [x] Undoing a delete of two objects reselects exactly those two.
- [x] Undoing a paste restores the selection from before the paste; redo
      selects the pasted objects again.

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts`

**Dependencies:** Task 1

**Files touched:** `hooks/use-project-history.ts` (steps are now
`{ project, view }`), `components/project-editor.tsx` (`applyRestoredView`,
and `restoreVersion`, which also stops a Version History restore from
crashing when the version lacks the screen being shown), `e2e/undo.spec.ts`.

**Estimated scope:** S

## Checkpoint B
- [x] `npm run test:e2e` green, but for two failures not caused by undo (see
      the plan)
- [x] Review with the user before Phase 3

## Task 6: Undo/Redo toolbar buttons and the 100-step limit

**Description:** Two icon buttons in the top bar (not the tools ribbon,
which can be hidden) with the tooltips *Undo* and
*Redo* plus the shortcut, disabled while their stack is empty and in preview
mode. The history drops the oldest step beyond 100. Measure the memory of 100
steps once with the combined test project.

**Acceptance criteria:**
- [x] The buttons do the same as the keys and are disabled when their stack
      is empty.
- [x] After 101 changes the first can no longer be undone, the second can.
- [x] Memory measurement noted in the commit message - and kept as an
      assertion (< 5 MB for 101 steps; measured 2.1 MB).

**Verification:**
- [x] `npx playwright test e2e/undo.spec.ts`
- ~~Manual: button states in light and dark theme~~ - dropped: the designer
  has no themes yet (user, 2026-09-23)

**Dependencies:** Tasks 1-5

**Files touched:** `components/project-editor.tsx` (top bar),
`e2e/undo.spec.ts`, `docs/2026-09-23-undo.md`

**Estimated scope:** S

## Task 7: Handbook, shortcut list, close #5

**Description:** Remove both `handbuch-macke #5` warnings, add Ctrl+Z,
Ctrl+Y and Ctrl+Shift+Z to `tastatur.md`, and describe the toolbar buttons
with `<span class="ui">` labels. Run the text through `maettel-humanizer`.
Check that `keyboard-handlers.ts` stays consistent. Close issue #5 with the
commit reference.

**Acceptance criteria:**
- [x] `grep -r "handbuch-macke #5" handbuch` finds nothing.
- [x] `e2e/handbook-labels.spec.ts` green with the new labels.
- [x] Issue #5 closed - by "Fixes #5" in the handbook commit, when `undo`
      reaches `main`; not by hand before that.

**Verification:**
- [x] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`
- [x] `npm run build --prefix handbuch` builds (read the pages as source, not
      in `dev`)

**Dependencies:** Task 6

**Files touched:** `handbuch/designer/index.md`, `objekte.md`,
`tastatur.md`, and - found by searching the handbook for the old claim -
`screens.md` and `versionen.md`. `keyboard-handlers.ts` needed nothing: it
already listed z and y, which are now real.

**Estimated scope:** S

## Checkpoint C (done)
- [x] e2e only, by the user's choice (no HIL on hardware this time):
      429 passed, 1 skipped, 1 failed - the failure is the
      `handbook-screenshots` test that fails the same way on `main`
- [x] Every success criterion in the spec ticked, but for #5 being closed,
      which happens when this merge reaches GitHub
