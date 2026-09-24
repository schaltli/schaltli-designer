# Implementation plan: saving projects like files

Spec: `docs/2026-09-23-explicit-save.md` (agreed 2026-09-24).
Task checklist: `tasks/explicit-save-todo.md`.

`tasks/plan.md` and `tasks/todo.md` belong to the undo work, which this
branch builds on and which still has open tasks; they stay untouched.

## Overview

A server-side store that keeps each project as a folder of slim versions
under its name, a Save dialog on top of it, then the ways back in: start page
list, address, and a crash draft in the browser. The store comes first and is
tested on its own, because everything else only moves data through it. The
autosave goes in the same step as the API switch, so there is never a moment
where both write.

## What the code looks like today

- `app/api/projects/[projectId]/` holds `autosave/` and `versions/`
  (+ `versions/[timestamp]/`); `app/api/projects/by-instance/[instanceId]/`
  sits beside it. Next.js does not allow `[projectId]` and `[name]` side by
  side, so the folder is replaced, not extended.
- `project-editor.tsx`: autosave effect and restore prompt (~785-840 and
  ~2655), `LAST_PROJECT_ID_KEY`, `projectId: generateUuid()` in
  `createDefaultProject` (~633) and on upload (~2415). The File menu
  (~2789-2833) has New / Upload / Download / Version History. Keys live in
  one `handleKeyDown` (~2668), beside Ctrl+Z.
- `deploy-dialog.tsx` binds the project and POSTs a version after a
  successful deploy (~375-405).
- `version-history-dialog.tsx` lists `/versions` by `projectId`; restore
  goes through `restoreVersion` in the editor.
- `lib/project-history.ts` has `sameState`, cheap because versions share
  structure - the unsaved check uses it.
- 17 e2e specs and `hil/firmware-designer.js` click "Deploy to Device".
  `e2e/helpers.ts` `loadProject` uploads a zip through the start page.

## Architecture decisions

1. **One server module, `lib/project-store.ts`, owns the disk layout.**
   Routes stay thin: validate, call the store, map errors to 400/404/409.
   The store is tested directly from Playwright (no page), like
   `ddf-name.spec.ts` does for its lib, so disk behaviour is pinned before
   any route exists.
2. **`lib/project-name.ts` is shared** by client (dialog validation) and
   server (the rule that decides). Same function, so the dialog can never
   accept what the server refuses.
3. **Blob rule by field, not by scan:** `fonts[].data`, `assets[].data`,
   `embeddedDdfZipBase64` over 4 KB. A blind scan of all long strings would
   also catch things that are not payloads.
4. **Editor state for saving is two values**: `savedName: string | null`
   and `savedProject: Project | null` (the version last saved or opened).
   Unsaved = `savedName === null || !sameState(strip(project),
   strip(savedProject))`, with `strip` dropping `settings.boundInstanceId`.
   Kept in a small hook, `hooks/use-project-save.ts`, beside
   `use-project-history.ts`, not inline in the 3000-line editor.
5. **Deploy asks for a save when the Deploy button in the dialog is
   pressed, not when the dialog opens.** Most of the 17 specs only open the
   dialog to look at it; only those that press Deploy need a name. A helper
   in `e2e/helpers.ts` answers the Save dialog with a unique name.
6. **The address follows the editor, not the other way round.**
   `app/projects/[name]/page.tsx` mounts the same `ProjectEditor` with an
   `initialName`; after that the editor changes the address with
   `history.replaceState` and never navigates, so undo history and unsaved
   state survive a first save or a rename.
7. **One list component, two homes.** `components/project-list.tsx` knows
   entries, opening, the menu and rename in place; `projects-panel.tsx`
   (editor, far left) and the start page only frame it. Its keyboard handler
   stops Delete/Backspace from reaching the editor's `handleKeyDown`, so a
   focused list can neither delete a project nor an object.
8. **IndexedDB through a 60-line wrapper** (`lib/project-draft.ts`), no
   library. One object store, key = normalised name or `untitled:<random>`.

## Task list

### Phase 1: Store and API
- [x] Task 1: Name rule and project store
- [x] Task 2: API on the store; autosave and restore prompt out

### Checkpoint A

### Phase 2: Saving
- [x] Task 3: First save: Save dialog, File > Save, Ctrl+S, unsaved dot
- [x] Task 4: Replace and Save As in the dialog
- [x] Task 5: Uploads open unnamed; Version History by name, Restore as unsaved
- [x] Task 6: New Project dialog (device type, then name); device choice leaves the start page; asking before leaving an unsaved project
- [x] Task 7: Deploy saves first and marks the version

### Checkpoint B

### Phase 3: Finding projects again
- [x] Task 8: Projects panel with New Project, open, rename and delete
- [ ] Task 9: Start page list and `/projects/<name>`
- [ ] Task 10: Draft in the browser

### Checkpoint C

### Phase 4: Handbook and cleanup
- [ ] Task 11: Handbook pages, screenshots, dev-machine cleanup

### Checkpoint D (done)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Between Task 2 and Task 3 the branch cannot save at all | Med | Tasks 2 and 3 are done back to back; Checkpoint A is only a test gate, not a manual run |
| Specs that deploy break once Deploy wants a name | Med | Decision 5 keeps it to those that press Deploy; projects made through `createProject` are already named; one helper answers the dialog for uploaded ones; Task 7 updates them in one go, `hil/firmware-designer.js` included |
| Parallel e2e workers share `.data/projects` and see each other's projects in lists | Med | Unique names per test (`testInfo` + random); list assertions look for their own entries only |
| `rename()` of a folder on Windows fails while a file in it is open (dev machine) | Low | Store closes every handle before returning; rename test runs on Windows in `npm run test:e2e` |
| Case-insensitive lookup lists the folder on every request | Low | Measured in Task 2 with 60 projects on the dev machine: a lookup 2 ms - fine. `list()` 74 ms, since it reads each project's newest version; on the Pi several times that. Measure on the Pi in Task 8; add a small summary file per project only if the panel feels slow |
| `sameState` on every render of a 3.4 MB project | Low | It is reference-first; fonts and DDF are the same objects until a DDF reload. Checked in Task 3 with the combined project |
| Moving the device choice into a dialog touches 22 specs that click «Create Project» | Med | One `createProject` helper; the switch is mechanical and lands as one reviewed diff in Task 6; the device-list specs move their checks into the dialog |
| A third panel squeezes the canvas on small screens | Med | Collapsible, state remembered; manual check at 1366 px in Task 8 |
| Handbook screenshots of the start page and editor go stale | Low | Task 11 regenerates them with `npm run screenshots` |

## Open questions

None. Decided while planning, within the spec: the Save dialog appears on
pressing Deploy in the dialog (decision 5), not on opening it.
