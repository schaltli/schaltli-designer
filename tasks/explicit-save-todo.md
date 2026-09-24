# Saving projects like files: tasks

Plan: `tasks/explicit-save-plan.md` · Spec: `docs/2026-09-23-explicit-save.md`

## Task 1: Name rule and project store

**Description:** `lib/project-name.ts` (validate with a reason, normalise,
compare) and `lib/project-store.ts` (server-only): atomic write, blob split
and join, create, add version, read newest / one version, list, rename,
delete, deploy marker, `by-instance`, pruning to 20, orphan blob removal,
`storeFormat: 1`. Root directory is a parameter so the spec runs against a
temp dir. No route, no UI.

**Acceptance criteria:**
- [x] Every invalid-name class from the spec is refused with its reason;
      «Van Knob» and « van knob» compare equal; the folder is created with
      the exact spelling given.
- [x] A second version writes exactly one file, at most 1 KB bigger than
      the project without payloads (the fixture's design alone is 53 KB, so
      "under 20 KB" could not hold); read back it is deep-equal to what was
      saved; two projects share one blob.
- [x] Rename, delete, pruning (20, newest deployed per device kept) and
      orphan removal behave as specified; no `.tmp` file remains; folders
      without `storeFormat` are not listed; a folder whose JSON name differs
      reads with the folder's name.

**Verification:**
- [x] `npx playwright test e2e/project-store.spec.ts` (11/11; with blobs switched off the two size tests fail, as they should)
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/project-name.ts`, `lib/project-store.ts`,
`e2e/project-store.spec.ts`

**Estimated scope:** M

## Task 2: API on the store; autosave and restore prompt out

**Description:** Replace `app/api/projects/[projectId]/` with `[name]/`
(GET, DELETE, `rename/`, `versions/`, `versions/[versionId]/`, `deploys/`),
add `app/api/projects/route.ts` (list, create) and
`app/api/by-instance/[instanceId]/`. Remove the autosave effect, the
«Continue where you left off?» screen and `LAST_PROJECT_ID_KEY` from the
editor. Extend e2e global setup/teardown to `.data/blobs` and
`.data/by-instance`.

**Acceptance criteria:**
- [x] Every row of the spec's API table answers as specified, including 400
      for invalid names, 404 for unknown, 409 on taken names.
- [x] Editing a loaded project for 5 s sends no request to `/api/projects`
      (`e2e/project-save.spec.ts`).
- [x] `autosave-recovery.spec.ts` is gone; undo.spec's three cases that read
      the autosave are `test.fixme` with a note naming the task that
      rewrites each (5, 7, 8) - three, not two as planned.

**Verification:**
- [x] `npx playwright test e2e/project-persistence-api.spec.ts e2e/project-store.spec.ts e2e/project-save.spec.ts e2e/undo.spec.ts`
      (33 passed, 3 fixme + 1 skipped)
- [x] `npm run typecheck` (lint is not set up in this repo)
- [x] Known red until Task 5: `version-history.spec.ts` (1 test). The
      versions assertion in `deploy-dialog.spec.ts` stays green: it reads the
      request body, not the answer. Note: the worktree needs `.env.local`
      (`NEXT_PUBLIC_DEPLOY_ENABLED=true`) or every deploy spec fails.

**Dependencies:** Task 1

**Files likely touched:** `app/api/projects/**`, `app/api/by-instance/**`,
`components/project-editor.tsx`, `e2e/project-persistence-api.spec.ts`,
`e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/undo.spec.ts`

**Estimated scope:** M (many small route files, each a few lines)

## Checkpoint A
- [x] Store and API specs green, typecheck clean
- [x] Task 3 starts right away (the branch cannot save until it lands)

## Task 3: First save

**Description:** `hooks/use-project-save.ts` (savedName, savedProject,
unsaved, save), `components/save-project-dialog.tsx` (project list, name
field with inline reasons, new names only for now), File > Save and Ctrl+S /
Cmd+S (browser save suppressed), the dot in header and tab title,
`beforeunload`. A failed save toasts and stays unsaved. `e2e/helpers.ts`
gets `saveProjectAs(page, name)`.

**Acceptance criteria:**
- [x] First Ctrl+S opens the dialog listing existing projects; a new valid
      name saves, clears the dot and puts the name in the header.
- [x] Next Ctrl+S saves without a dialog; an edit sets the dot, undo back to
      the saved state clears it.
- [x] An invalid name shows its reason and disables Save; a failed save
      (route aborted) toasts and keeps the dot.
- [x] Added while building: a project uploaded after a save is unnamed again
      (Ctrl+S asks, instead of writing into the project before); Project
      Settings shows the name read-only; undo carries the name.

**Verification:**
- [x] `npx playwright test e2e/project-save.spec.ts e2e/undo.spec.ts` (plus
      store, API, startup-gate, recover, download, migration, placeholders:
      47 passed, 9 skipped - the 3 parked undo tests and LAN/firmware-bound
      ones). Mutation check: without the reset on upload the new test fails.
- [x] Manual: `npm run dev`, save the combined project, check `.data/` -
      left for the user's run at Checkpoint B

**Dependencies:** Task 2

**Files likely touched:** `hooks/use-project-save.ts`,
`components/save-project-dialog.tsx`, `components/project-editor.tsx`,
`e2e/project-save.spec.ts`, `e2e/helpers.ts`

**Estimated scope:** M

## Task 4: Replace and Save As

**Description:** In the dialog: clicking an entry fills the field; an
existing name asks «Replace "…"?»; File > Save As… and Ctrl+Shift+S open
it any time.

**Acceptance criteria:**
- [x] Replace adds a version to the chosen project and continues there;
      Cancel returns to the dialog; the chosen project's older versions are
      all still there.
- [x] Save As… under a new name leaves the old project as it was and
      continues under the new one. (Menu label as the designer writes it:
      «Save As...», three dots, like «Choose File...».)

**Verification:**
- [x] `npx playwright test e2e/project-save.spec.ts` (8 passed)

**Dependencies:** Task 3

**Files likely touched:** `components/save-project-dialog.tsx`,
`hooks/use-project-save.ts`, `components/project-editor.tsx`,
`e2e/project-save.spec.ts`

**Estimated scope:** S

## Task 5: Uploads open unnamed; Version History by name

**Description:** Upload Project and Recover from Device open an unnamed,
unsaved project shown as «Untitled»; the file's name becomes the Save
dialog's suggestion, its `projectId` is ignored; `createDefaultProject` and
new saves stop writing `projectId`. Version History
lists by name with device type and deploy marker; Restore opens the version
as unsaved changes. Undo history clears on each of these loads as today.

**Acceptance criteria:**
- [x] An uploaded file shows «• Untitled» (as the spec says; this line had
      «• <its name>») and suggests its own name; saving it under an existing
      name asks Replace. Mostly landed with Tasks 3 and 4; here the file's
      `projectId` is dropped and no new one is made.
- [x] Version History shows device type per version and «Deployed to …»;
      Restore leaves all versions in place and marks the project unsaved; an
      unnamed project shows «Save the project to start its version history.»
- [x] After a restore there is nothing to undo; the parked undo test for a
      restored version without the shown screen is back, rewritten.

**Verification:**
- [x] `npx playwright test e2e/version-history.spec.ts e2e/project-save.spec.ts e2e/undo.spec.ts e2e/recover-project.spec.ts e2e/project-download.spec.ts e2e/project-migration.spec.ts`
      (34 passed, 8 skipped: 2 parked for Tasks 7/8, the rest need a LAN
      address - including recover-project, which shares the upload path)

**Dependencies:** Task 4

**Files likely touched:** `components/project-editor.tsx`,
`components/version-history-dialog.tsx`, `e2e/version-history.spec.ts`,
`e2e/undo.spec.ts`, `e2e/project-save.spec.ts`

**Estimated scope:** M

## Task 6: New Project dialog, and asking before leaving

**Description:** A `confirmLeave()` in `hooks/use-project-save.ts` that
resolves to carry on or stay: nothing to ask when saved, otherwise «Save
changes to "…"?» with Save (through the Save dialog if unnamed), Don't Save
and Cancel. New Project, Upload Project and Recover from Device go through
it; Task 8 adds opening from the panel.
`components/new-project-dialog.tsx` with two steps: device
type (the start page's device scan and DDF lists moved in unchanged, Next
once chosen) and name (name rule, taken names refused inline, Back keeps the
device, Create Project). Create saves the first version and opens the
project saved. The start page gets a New Project button that opens it and
loses its own device list; File > New Project opens it too. A
`createProject(page, device, name)` helper in `e2e/helpers.ts` replaces the
direct «Create Project» click in the 22 specs that use it.

**Acceptance criteria:**
- [x] Start page and File > New Project open the same dialog; Next is
      disabled until a device is chosen; Back keeps it.
- [x] A taken or invalid name is refused inline; Create Project opens the
      project saved, with the name in the header; Cancel creates nothing.
- [x] The start page shows no device list of its own (its button is «New
      Project...»); 20 specs (30 clicks) switched to `createProject` by a
      one-off script, plus startup-gate, ddf-url-import, handbook,
      handbook-screenshots and ddf-auto-discovery by hand.
- [x] With unsaved changes, New Project and Upload ask first; Save, Don't
      Save and Cancel behave as in the spec, including cancelling the Save
      dialog of an unnamed project. Recover from Device is only on the start
      page, where nothing is open, so it has nothing to ask.
- [x] Consequence noted: a newly announcing device is now discovered (its DDF
      fetched) while the New Project dialog is open, no longer while the
      start page merely shows.

**Verification:**
- [x] `npx playwright test e2e/new-project.spec.ts e2e/leave-unsaved.spec.ts e2e/startup-gate.spec.ts e2e/ddf-auto-discovery.spec.ts`
- [x] `npm run test:e2e`: 387 passed, 66 skipped, 6 failed. Fixed after:
      4 in ddf-auto-discovery (they expected the device list on the bare
      start page) and 1 in project-persistence-api (compared the whole
      projects folder while parallel workers write into it) - both files
      green again (19). Left red until Task 11: handbook-labels, because the
      handbook still quotes «Continue where you left off?» and «Restore
      Project».

**Dependencies:** Task 5

**Files likely touched:** `components/new-project-dialog.tsx`,
`hooks/use-project-save.ts`, `components/startup-device-gate.tsx`,
`components/project-editor.tsx`, `e2e/new-project.spec.ts`,
`e2e/leave-unsaved.spec.ts`, `e2e/helpers.ts` (plus the one-line switch to
the helper in 22 specs - mechanical, reviewed as one diff)

**Estimated scope:** M (L in line count because of the spec switch)

## Task 7: Deploy saves first and marks the version

**Description:** Pressing Deploy in the dialog saves first (Save dialog if
unnamed, silent if named; Cancel stops the deploy); a successful deploy
posts the marker for the saved version and updates `by-instance`; the
binding stays out of the unsaved check. A helper answers the Save dialog
in specs that press Deploy; `hil/firmware-designer.js` too.

**Acceptance criteria:**
- [x] Unnamed project + Deploy: Save dialog; Cancel: nothing sent to the
      device; a name: saved, then deployed, version marked. The version sent
      is the one saved (after a first save it carries the new name). A saved,
      unchanged project is only marked, not saved again.
- [x] After a deploy the project is not shown unsaved.
- [x] All specs that press Deploy pass unchanged in intent: 11 files (15
      presses) go through a new `pressDeploy` helper, switched by a one-off
      script. `hil/firmware-designer.js` never presses Deploy (it only
      installs firmware) and needed nothing. The parked undo test for deploy
      and binding is back; version-history's parked deploy test went, its
      case now in deploy-save.spec.ts.
- [x] Found on the way, by the handbook screenshots: the new dialogs were
      too wide (a grid item grows to its content; Radix ScrollArea defeats
      `truncate`) - one device card filled the row, the URL field and Save
      ran out of the dialog. Fixed in all five dialogs, carousel arrows moved
      inside; new layout test in e2e/new-project.spec.ts.
- [x] Also found: expandCachedDevices could wait forever on a toggle that
      vanished between count and read (three failed full runs); short
      timeouts now.

**Verification:**
- [x] `npx playwright test e2e/deploy-save.spec.ts e2e/deploy-dialog.spec.ts e2e/version-history.spec.ts e2e/software-button-render.spec.ts e2e/undo.spec.ts`
- [x] `npm run test:e2e` (see Checkpoint B)

**Dependencies:** Task 6

**Files likely touched:** `components/deploy-dialog.tsx`,
`components/project-editor.tsx`, `e2e/deploy-save.spec.ts`,
`e2e/helpers.ts`, `hil/firmware-designer.js`

**Estimated scope:** M

## Checkpoint B
- [x] `npm run test:e2e` green but for one: 397 passed, 64 skipped, 1 failed -
      handbook-labels, red until Task 11 rewrites the handbook (2026-09-24)
- [x] Manual run with the user: new project, save, replace, save as, deploy
      ("funzt alles", 2026-09-24)
- [x] Review with the user before Phase 3 - the missing piece is opening a
      saved project, which is Phase 3

## Task 8: Projects panel with open, rename and delete

**Description:** `components/project-list.tsx` (entries with name, device
type, last saved, «deployed to …»; click/Enter opens; menu via right-click
or `⋯` with Rename and Delete; rename in place with F2, inline reasons;
Delete key does nothing) inside `components/projects-panel.tsx`, far left of
the editor, collapsible, state in localStorage, hidden in preview, with a
New Project button in its header opening the Task 6 dialog. The open
project is highlighted with its dot. Delete on the open project shows an
error and deletes nothing.

**Acceptance criteria:**
- [x] A project saved elsewhere appears in the panel (the list reloads on
      each save, rename and delete - not live); clicking it opens its newest
      version and highlights it; with unsaved changes it asks first.
- [x] Rename (menu and F2) renames in place, refuses taken and invalid names
      with the reason, and renames the open project in the header; unsaved
      changes stay unsaved. Built with the menu kept mounted while renaming
      and focus handed to the field on close - a modal, unmounting menu took
      the focus back and cancelled the rename.
- [x] Delete in the menu removes the project and its versions without a
      dialog, and on the open project only shows the error; the Delete key
      with the list focused removes nothing; the
      panel's collapsed state survives a reload.
- [x] The last parked undo test is back: opening a saved project from the
      panel leaves nothing to undo.

**Verification:**
- [x] `npx playwright test e2e/project-list.spec.ts e2e/undo.spec.ts` (with
      new-project, leave-unsaved, project-save, preview-mode,
      right-panel-resize, object-tree: 50 passed, 3 skipped)
- [x] Manual: panel beside Screens panel in light and dark theme, canvas
      still usable at 1366 px width (a 400 px screen just fits; collapse for
      less)
- [ ] Not done: how fast the list loads on the Pi (plan risk table) - needs
      this version installed there; measure then.

**Dependencies:** Task 7

**Files likely touched:** `components/project-list.tsx`,
`components/projects-panel.tsx`, `components/project-editor.tsx`,
`e2e/project-list.spec.ts`

**Estimated scope:** M

## Task 9: Start page list and address

**Description:** The start page shows the same list between its New Project
button and the Upload / Recover actions. `app/projects/[name]/page.tsx` opens a project by address; the
editor keeps the address in step with `replaceState` (first save, Save As,
rename of the open project, opening from the panel); an unknown name shows
the start page with «No project "…"».

**Acceptance criteria:**
- [ ] The start page lists the projects and opens one on click.
- [ ] Opening puts `/projects/<name>` in the address; reload reopens it;
      first save and rename update it; other case opens the project.
- [ ] An unknown name lands on the start page with the message.

**Verification:**
- [ ] `npx playwright test e2e/project-list.spec.ts e2e/startup-gate.spec.ts`

**Dependencies:** Task 8

**Files likely touched:** `components/startup-device-gate.tsx`,
`app/projects/[name]/page.tsx`, `components/project-editor.tsx`,
`e2e/project-list.spec.ts`

**Estimated scope:** M

## Task 10: Draft in the browser

**Description:** `lib/project-draft.ts` over IndexedDB; the editor writes
the draft at most once a second while unsaved and deletes it when saved;
rename moves it. The list shows «Unsaved changes» with time, unnamed drafts
as «Untitled»; Open prefers the draft; Discard changes deletes it.

**Acceptance criteria:**
- [ ] Unsaved edit, reload: the list shows «Unsaved changes»; Open brings the
      edit back, shown unsaved.
- [ ] Saving, or undoing back to the saved state, removes the draft.
- [ ] An unnamed project's draft shows as «Untitled»; Discard changes
      removes it.

**Verification:**
- [ ] `npx playwright test e2e/draft-recovery.spec.ts e2e/project-list.spec.ts`

**Dependencies:** Task 9

**Files likely touched:** `lib/project-draft.ts`,
`components/project-editor.tsx`, `components/project-list.tsx`,
`e2e/draft-recovery.spec.ts`

**Estimated scope:** M

## Checkpoint C
- [ ] `npm run test:e2e` green
- [ ] Manual run with the user: panel, rename, delete, address, draft after
      a killed tab

## Task 11: Handbook, screenshots, cleanup

**Description:** Rewrite «Speichern» in `projekte.md` (with the Projects
panel, rename and delete), the panel in the editor layout of `index.md`, the versions and
backup parts of `versionen.md`, the save step in `deploy.md`, Ctrl+S and
Ctrl+Shift+S in `tastatur.md`, the storage table in `betrieb/daten.md`
(including: old UUID folders can be deleted). Labels in `<span
class="ui">`. Through `maettel-humanizer`. Regenerate affected screenshots.
Delete the old UUID folders under `.data/projects` on the dev machine.

**Acceptance criteria:**
- [ ] No handbook page mentions autosave, «Continue where you left off?» or
      «Restore Project».
- [ ] `e2e/handbook-labels.spec.ts` green with the new labels.
- [ ] Dev machine `.data/projects` holds only new-format folders.

**Verification:**
- [ ] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`
- [ ] `npm run dev --prefix handbuch`, read the five pages

**Dependencies:** Task 10

**Files likely touched:** `handbuch/designer/index.md`, `handbuch/designer/projekte.md`,
`handbuch/designer/versionen.md`, `handbuch/designer/deploy.md`,
`handbuch/designer/tastatur.md`, `handbuch/betrieb/daten.md`

**Estimated scope:** M

## Checkpoint D (done)
- [ ] `npm run test:all` green (hardware suites may be skipped with a warning)
- [ ] Every success criterion in `docs/2026-09-23-explicit-save.md` ticked
