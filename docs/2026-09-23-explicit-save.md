# Saving projects like files

Agreed 2026-09-24; the same day the Projects panel took over renaming and
deleting, New Project became a dialog, and leaving an unsaved project
asks first (decisions 11-17). Builds on the `undo` branch (docs/2026-09-23-undo.md).

The designer autosaves the whole project to the server three seconds after
every change. Each save rewrites `.data/projects/<id>/current.json` in full:
on the largest project here that is 3.4 MB, of which 13 KB is the design and
the rest is the ten BDF fonts (1.6 MB) and the embedded DDF zip (1.8 MB),
neither of which changes while editing. Every Version History checkpoint
copies the same 3.4 MB again. The file is overwritten in place, so a power
cut mid-write - normal in a van - leaves it corrupt.

The saved work is also nearly unreachable. A project is identified by a
hidden UUID, every new project is called "New Project", and the only way back
is «Continue where you left off?», which offers the one project this browser
last had open. The development machine holds 83 project folders, seven of
them called "Combined Test Project"; 82 cannot be opened from the designer.
A copy made by exporting and uploading a project keeps its UUID and silently
overwrites the original.

## Objective

Projects behave like files in one flat folder on the server. A project is
known by its name, and on disk it is a folder of that name holding its
versions - no hidden id. The first save asks for the name in a Save dialog that
shows what already exists; choosing an existing name asks before replacing
it. Every save adds a version under that name, as a commit does in git, so
replacing never loses anything. A Projects panel beside the canvas lists
the projects by name - flat, like an explorer without folders - and is where
they are opened, renamed and deleted; the start page shows the same list.
Any browser on the network sees the same projects.

A save writes kilobytes, not megabytes, and a power cut never leaves a
broken file. Nothing is written to the server while editing. Work that was
not saved survives a crashed tab in the browser that made it, without
touching the Pi's SD card.

Decisions taken with the user on 2026-09-23:

1. **Explicit save replaces the server autosave.** Nothing writes to the
   server on its own while editing.
2. **The name is the identity**, as in a file system, but flat: one folder,
   no subfolders.
3. **The name is asked on the first save**, in a Save dialog listing the
   existing projects. Save As… opens the same dialog at any time.
4. **Choosing an existing name asks** «Replace "…"?». Confirming makes the
   current state the newest version of that project; its history continues,
   as git's does when a file gets entirely new content.
5. **Every save is a version.** There is no separate "current" file: the
   newest version is the project.
6. **Deploy saves first.** An unnamed project opens the Save dialog before
   the deploy; a named one with unsaved changes is saved silently.
7. **Delete deletes at once**, all versions, no confirmation, no bin. It is
   reached only through an entry's menu, never through the Delete key (see
   decision 12).
8. **No migration.** Existing project folders are deleted.
9. **Unsaved work is kept in the browser** (IndexedDB), never on the server.
10. **The name is stored in the project JSON, and the versions of a project
    live in a folder of the same name.** There is no internal project id.
11. **Rename happens in the Projects panel** (decided 2026-09-24, replacing
    rename in the Save As dialog). It renames the folder and adds a version
    carrying the new name, so the rename is part of the history, as `git mv`
    is a commit.
12. **A Projects panel, far left**, left of the Screens panel, collapsible,
    lists the projects flat; open, rename and delete happen there. The start
    page shows the same list. Delete only through the entry's context menu:
    the panel sits next to the canvas, and a Delete key meant for an object
    must never delete a project.
13. **The Save dialog keeps its project list** for choosing an existing name;
    it no longer renames or deletes.
14. **Deleting the open project is refused** with an error message.
15. **New Project is a button in the Projects panel** and opens a two-step
    dialog: device type, then name. The start page starts the same dialog.
16. **The start page no longer offers the device choice directly**; it lives
    only in the New Project dialog.
17. **Leaving an unsaved project asks first**: save or discard. This holds
    for every way of leaving it inside the designer - New Project, opening
    another project, Upload Project, Recover from Device.

## Behaviour

### Names

- A name is the project's folder name on disk, so it must be one on every
  system the designer runs on (the Pi, and Windows for development). After
  trimming leading and trailing space it is 1 to 80 characters and has
  - no control characters and none of `/ \ : * ? " < > |`,
  - no trailing dot,
  - not one of the Windows device names `CON`, `PRN`, `AUX`, `NUL`,
    `COM1`-`COM9`, `LPT1`-`LPT9` (with or without an extension),
  - not `.` or `..`.
  An invalid name is rejected in the dialog with the reason; it is never
  rewritten silently, so the folder is always called exactly what the list
  shows.
- Two names are the same when they are equal after trimming, Unicode NFC
  normalisation and lower-casing. «Van Knob» and «van knob » are one
  project, on the case-sensitive Pi as on Windows. The spelling of the first
  save is kept.
- The name is stored in the project JSON as `project.name`, the same field
  the project-name placeholder reads. Save As… under a new name or a rename
  therefore changes what that placeholder shows on the device, from the next
  deploy on.
- The name is not edited anywhere else (settled while building, 2026-09-24).
  Project Settings shows it read-only with «The name is chosen when the
  project is saved.», and undo carries the current name the way it carries
  the deploy binding, so undoing past a save never brings back an older
  name.
- **The folder name is authoritative.** If a version's `project.name`
  differs from its folder (a power cut between the two steps of a rename),
  the folder name wins when the project is read, and the next save writes it
  into the JSON.

### A project's life

- **New Project** (button in the Projects panel, on the start page, and
  File > New Project) opens the New Project dialog:
  1. **Device type** - the device choice the start page shows today (device
     scan, «Server DDFs», «Announced Devices», cached devices), moved here
     unchanged. **Next** is enabled once a device is chosen.
  2. **Name** - a name field with the name rule's inline reasons, and
     **Create Project**. A name another project already has is refused
     inline; there is no Replace here, because a new project replacing an
     existing one would bury its work under an empty version. **Back**
     returns to step 1 with the device still chosen.
  **Create Project** saves the new project as its first version and opens
  it, saved, under `/projects/<name>`. Cancel at either step changes
  nothing. With unsaved changes in the open project, the question in
  *Leaving an unsaved project* comes first, before the dialog opens.
- **Upload Project** and **Recover from Device** open the file's content as
  an unnamed project, shown as «Untitled» until saved, unsaved. The file's name is kept as the suggestion
  for the first save. The `settings.projectId` inside the file is
  ignored: a file from outside becomes part of a project only by being saved
  under its name. New saves no longer write `settings.projectId`.
- **Save** (File > Save, Ctrl+S / Cmd+S) on an unnamed project opens the
  Save dialog; on a named one it adds a version without a dialog. The
  browser's own "save page" is suppressed. Works in preview mode too.
- **Save As…** (File > Save As…, Ctrl+Shift+S) always opens the Save dialog.
  After it, the open project is the one saved to.
- **Deploy** saves first, as above. If the Save dialog is cancelled, the
  deploy does not happen. After a successful deploy the version just saved is
  marked as deployed to that device. A failed deploy leaves the version
  unmarked.
- A failed save shows a toast with the reason and leaves the project
  unsaved. There is no automatic retry.

### Save dialog

- Title «Save Project» (or «Save Project As»), a list of the projects on the
  server - name, device, last saved, newest first - and a name field
  prefilled with the current or suggested name.
- Clicking a list entry puts its name into the field.
- **Save** with a name that matches no project creates a new one. With a
  name that matches one, a second step asks «Replace "Van Knob"?» with
  **Replace** and **Cancel**; Replace adds the current state as the newest
  version of that project.
- The field rejects invalid names inline with the reason; Save stays
  disabled.
- The list here only picks a name; renaming and deleting are in the
  Projects panel.

### Versions

- Every save stores a version: the project as saved, the time, and the
  device type (DDF name). A deploy adds a marker to the version it deployed:
  the device's name and `instanceId`.
- File > Version History lists the versions newest first with date and
  time, device type and deploy marker.
- **Restore** in Version History opens that version as unsaved changes on top
  of the newest one - like a checkout in git. Nothing is removed; saving
  makes it the newest version.
- Up to 20 versions are kept per project; the oldest undeployed ones go
  first, and the newest deployed version per device is never pruned (so a
  project deployed to several devices can hold slightly more than 20).

### Address

- An open named project has the address `/projects/<name>` (the name
  URL-encoded, so `Van Knob` shows as `/projects/Van%20Knob`). It can be
  bookmarked and reloaded.
- The start page, and an unnamed project, are at `/`.
- The first save, Save As… and renaming the open project change the address
  in place (`history.replaceState`), without a reload.
- Opening `/projects/<name>` does what Open in the project list does: the
  draft if this browser has one, otherwise the newest version. The name is
  matched with the name rule, so `/projects/van%20knob` opens `Van Knob`.
- An address naming no project shows the start page with «No project
  "<name>"».
- The address is replaced, never pushed (settled while building,
  2026-09-24; drafted as "Back leaves the project for the start page"): the
  designer adds no history entries of its own, so the browser's Back leaves
  it like any page - with the browser's "leave site?" if there are unsaved
  changes. Pushing entries would have needed Back handled inside the editor,
  against Next.js's own router, for little gain.
- While a project from the address is opening, the page shows «Opening
  "<name>"...» instead of flashing the start page first.

### Unsaved changes

- The project is *unsaved* when it differs from the version it was last
  saved as or opened from, compared with `sameState` from
  `lib/project-history.ts`, ignoring `settings.boundInstanceId` (a deploy's
  binding is a fact, not an edit - `carryDeviceBinding` in the undo work).
  Undoing back to the saved state makes it saved again. An unnamed project
  is always unsaved.
- An unsaved project shows a dot before its name in the header and in the
  browser tab title (`• Van Knob`, `• Untitled`).
- Closing or reloading the tab while unsaved triggers the browser's own
  "leave site?" warning (`beforeunload`).

### Leaving an unsaved project

- New Project, opening another project (panel, start page not applicable
  since nothing is open there), Upload Project and Recover from Device first
  ask, when the open project is unsaved: «Save changes to "Van Knob"?»
  («…to "Untitled"?» for an unnamed one) with **Save**, **Don't Save** and
  **Cancel**.
  - **Save** saves as File > Save would - for an unnamed project through the
    Save dialog - and then carries on with what was asked. Cancelling the
    Save dialog, or a failed save, stops there: the project stays open and
    unsaved.
  - **Don't Save** discards the changes (and their draft) and carries on.
  - **Cancel** stays in the project, nothing changes.
- A saved project is left without a question.
- Opening the project that is already open does nothing.

### Draft in the browser

- While a project is unsaved, the designer keeps a copy of it in IndexedDB,
  written at most once a second, keyed by the project's name (normalised as
  above) or, for an unnamed project, by a random key made when it was
  opened. A rename in this browser moves the draft to the new key. Saving,
  or undoing back to the saved state, deletes it.
- The draft never leaves the browser. It is a crash net for this browser,
  not a second storage location: it matters when the tab is closed,
  reloaded or crashes, since leaving a project inside the designer asks
  first (see *Leaving an unsaved project*).

### Project list

One list component, shown in the Projects panel and on the start page.

- Every project on this server, newest save first: name, device type, last
  saved, and «deployed to …» if a version was deployed.
- Projects with a draft in this browser show «Unsaved changes» and when they
  were made. Unnamed drafts appear as «Untitled» with their device type.
- **Open** (click, or Enter on the focused entry) opens the draft if there
  is one (the project then shows as unsaved), otherwise the newest version.
- Each entry has a menu (right-click, or a `⋯` button for touch) with:
  - **Rename** - the name becomes an editable field in place, as in a file
    explorer; F2 on the focused entry does the same. Enter confirms, Escape
    cancels. Confirming:
    - rejects an invalid name or one another project already has, inline
      with the reason - there is no Replace for a rename, it would merge
      two histories;
    - renames the folder, then adds a version that is that project's newest
      version with `project.name` set to the new name;
    - updates the `by-instance` entries that point to the folder;
    - if the renamed project is the one open in the editor, the editor takes
      the new name and address; unsaved changes stay unsaved.
    A rename is not an undo step; renaming back is the way back.
  - **Discard changes** (only with a draft) deletes the draft.
  - **Delete** removes the project from the server at once - all versions,
    deploy markers and `by-instance` entries pointing to it - and its draft
    in this browser. The Delete key does nothing in the list. On the open
    project, Delete does nothing but show an error: «"Van Knob" is open.
    Open another project to delete it.»

### Projects panel

- Far left of the editor, left of the Screens panel, about as wide as it
  (240 px). Title «Projects», with a **New Project** button in its header
  that opens the New Project dialog.
- The open project is highlighted, with the unsaved dot when it has one.
- Collapsible to a narrow strip with a button in its header; the state is
  remembered in this browser (localStorage), as the right panel's width is.
  Open by default.
- Hidden in preview mode, like the tools ribbon.
### Start page

- The start page shows a **New Project...** button (three dots, like
  «Choose File...», because it opens a dialog), which opens the same New
  Project dialog, the project list, and the existing Upload Project and
  Recover from Device actions.
- The device choice (device scan and DDF lists) is no longer on the start
  page itself; it moved into step 1 of the New Project dialog.
- «Continue where you left off?» and the `schaltli-last-project-id`
  localStorage key are removed.

### Server storage

Each project is a folder named exactly like the project. Everything that
belongs to it lives inside, so a rename moves it all at once.

```
.data/projects/<name>/versions/<ts>.json      one slim version per save
.data/projects/<name>/deploys.json            deploy markers: [{ versionId, instanceId, deviceName, at }]
.data/by-instance/<instanceId>.json           { name } - which project is on that device
.data/blobs/<sha256>                          each large payload once
```

- `by-instance` moves out of `projects/` so a project could never be called
  like it. It is updated on deploy, rename and delete.
- A rename is two steps: rename the folder (atomic on one file system), then
  write the new version. A crash between them leaves a correctly named
  folder whose newest JSON has the old name; the folder wins (see Names).
- Finding a project by name lists `projects/` and compares with the name
  rule, so a request for «van knob» finds the folder `Van Knob`.

- A version replaces large payloads with references: `fonts[i].data`,
  `assets[i].data` and `embeddedDdfZipBase64` longer than 4 KB become
  `{ "blob": "<sha256>" }`. A blob is written only if absent.
- Reading a version puts the payloads back, so the client always gets and
  sends the full project. Export is unchanged: the file contains everything.
- Every file write goes to a temporary file in the same directory, is
  fsynced, then renamed over the target.
- Deleting a project, and pruning versions, removes blobs nothing refers to
  any more.

### API

| Method | Path | Does |
|---|---|---|
`<name>` in a path is the URL-encoded project name, matched with the name
rule; an invalid name answers 400.

| Method | Path | Does |
|---|---|---|
| GET | `/api/projects` | `{ projects: [{ name, deviceName, savedAt, deployedTo? }] }` |
| POST | `/api/projects` | create `{ name, project }`; 409 with the existing name's spelling if taken |
| GET | `/api/projects/<name>` | newest version, full, plus `versionId` |
| DELETE | `/api/projects/<name>` | delete as described |
| POST | `/api/projects/<name>/rename` | `{ newName }`; 409 if taken; renames and adds the version |
| GET | `/api/projects/<name>/versions` | list: `versionId`, `savedAt`, `deviceName`, `deployedTo?` |
| POST | `/api/projects/<name>/versions` | add a version (Save, Replace) |
| GET | `/api/projects/<name>/versions/<versionId>` | one version, full |
| POST | `/api/projects/<name>/deploys` | mark `{ versionId, instanceId, deviceName }`, update `by-instance` |
| GET | `/api/by-instance/<instanceId>` | `{ name }`, 404 if none |

`/api/projects/<id>/autosave` is removed. `/api/projects/by-instance/<id>`
moves to `/api/by-instance/<id>` for the reason above; nothing in the client
calls it today.

### Existing data

No migration. The user's Pekaway Pi was cleared on 2026-09-23 (60 old
projects, 162 MB, plus 4 `by-instance` entries; `ddf/` and `deploys/` kept).
On the development machine the old folders under `.data/projects/` are
deleted by hand as part of this work. For any other installed Pi the
handbook says they can be deleted; nothing deletes them on its own.
Every version written by the new code carries `"storeFormat": 1` at its top
level (stripped when read). Folders whose versions lack it are ignored, so
the old UUID folders never show up as projects - including one whose UUID
happens to be a valid name.

## Not in scope

- Two tabs saving the same project: both add versions, the later is the
  newest.
- Sending only a hash for payloads the server already has. The client still
  posts the full project; the saving is on disk, not on the wire.
- Subfolders, search, thumbnails, commit messages on a save.
- Any change to the firmware or to what a deploy sends to the device.

## Tech stack

Next.js app router routes under `app/api/projects/`, React in
`components/project-editor.tsx`, Node `fs/promises` on the server, the
browser's IndexedDB without a library. No new dependencies.

## Commands

```
Dev:        npm run dev
Types:      npm run typecheck
Lint:       (not set up in this repo)
E2E:        npm run test:e2e
E2E, one:   npx playwright test e2e/project-save.spec.ts
Everything: npm run test:all
Handbook:   npm run dev --prefix handbuch
```

## Project structure

```
app/projects/[name]/page.tsx              mounts ProjectEditor with the name from the address
lib/project-store.ts                      server-only: names, blobs, atomic write, versions, list, delete, pruning
lib/project-name.ts                       name validation and comparison, shared by client and server
lib/project-draft.ts                      browser-only: IndexedDB get/put/delete/list
app/api/projects/route.ts                 GET list, POST create
app/api/projects/[name]/route.ts          GET, DELETE (replaces [projectId]/)
app/api/projects/[name]/rename/           rename
app/api/projects/[name]/versions/         list, add, get one
app/api/projects/[name]/deploys/          mark a deploy
app/api/by-instance/[instanceId]/         moved from app/api/projects/by-instance/
app/api/projects/[projectId]/             removed, with autosave/
components/save-project-dialog.tsx        Save / Save As dialog with Replace step
components/new-project-dialog.tsx         device type, then name; hosts the device choice from the start page
components/project-list.tsx               the list: entries, open, menu, rename in place, delete
components/projects-panel.tsx             the panel around the list, collapse state
components/project-editor.tsx             save, unsaved state, drafts, shortcuts, beforeunload, panel
components/startup-device-gate.tsx        New Project button, the list, Upload, Recover; device choice moves out
components/deploy-dialog.tsx              save before deploy, mark after
components/version-history-dialog.tsx     device and deploy columns, restore as unsaved
handbuch/designer/index.md                das Projects-Panel im Aufbau des Editors
handbuch/designer/projekte.md             Speichern, Save As, Projektliste, Umbenennen, Löschen, Startseite
handbuch/designer/versionen.md            Versionen, Löschen, Entwurf im Browser
handbuch/designer/deploy.md               Deploy speichert zuerst
handbuch/designer/tastatur.md             Ctrl+S, Ctrl+Shift+S
handbuch/betrieb/daten.md                 neue Ablage, alte Ordner löschen
```

## Code style

As in the surrounding routes: validate ids first, answer 400/404/409 as JSON,
comment the *why* with a date.

```ts
// Atomic on power loss (2026-09-23): a van's supply can drop mid-write.
// Write beside the target, flush it to the card, then rename - a rename
// replaces the file whole or not at all.
export async function writeFileAtomic(path: string, data: string) {
  const tmp = `${path}.${process.pid}.tmp`
  const handle = await open(tmp, "w")
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, path)
}
```

## Testing strategy

Playwright, as everywhere in this repo.

- `e2e/project-persistence-api.spec.ts` (rewrite): create, add version, get
  newest and a given version round-trip the full project; a version on disk
  holds no font, asset or DDF payload and is at most 1 KB bigger than the
  project with its payloads removed; the same payload from two projects is one blob;
  create with a taken name (other case, extra spaces) answers 409; each
  invalid-name class (reserved character, trailing dot, `CON`, `nul.txt`,
  `..`, 81 characters) answers 400 and creates no folder; the folder on disk
  is named exactly as created; rename moves the folder, adds a version with
  the new name, updates `by-instance`, answers 409 on a taken name; a folder
  whose newest JSON has another name reads with the folder's name; a folder
  without `storeFormat` is not listed; pruning
  keeps 20 and never the newest deployed per device; DELETE removes
  folder, `by-instance` entries and orphaned blobs, keeps shared ones; bad
  ids 400, unknown 404; no `.tmp` file remains.
- `e2e/project-save.spec.ts` (new): no server write while editing for 5 s;
  first Ctrl+S opens the dialog with the existing projects; a new name
  saves and clears the dot; the next Ctrl+S saves without a dialog; an edit
  sets the dot, undo back clears it; an existing name asks Replace, Cancel
  keeps the dialog, Replace adds a version to that project; Save As… saves
  under a new name and continues there; an uploaded file is unnamed and
  suggests its own name; an invalid name shows its reason and disables Save;
  a failed save toasts and keeps the dot.
- `e2e/new-project.spec.ts` (new): New Project from the panel and from the
  start page opens the same dialog; Next is disabled until a device is
  chosen; Back keeps the device; a taken or invalid name is refused inline;
  Create Project opens the project saved, listed in the panel and at
  `/projects/<name>`; Cancel creates nothing; the start page shows no device
  list of its own.
- `e2e/leave-unsaved.spec.ts` (new): with unsaved changes, New Project,
  opening another project, Upload and Recover each ask first; Save saves
  and carries on; Save on an unnamed project goes through the Save dialog,
  and cancelling it stays; Don't Save discards and carries on; Cancel stays
  with the changes; a saved project is left without a question.
- `e2e/helpers.ts`: a `createProject(page, device, name)` helper replaces
  the direct «Create Project» click in the 22 specs that make a project
  from a device; `startup-gate.spec.ts` and `ddf-auto-discovery.spec.ts`
  move their device-list checks into the dialog.
- `e2e/deploy-save.spec.ts` (new, with the mock device the deploy specs
  already use): deploying an unnamed project opens the Save dialog, Cancel
  stops the deploy; a deploy marks the version.
- `e2e/project-list.spec.ts` (new): a saved project appears with name,
  device and time in the panel and on the start page; clicking opens the
  newest version and highlights it in the panel; Rename in the menu and F2
  rename in place, refuse a taken or invalid name with the reason, and
  rename the open project in the header and address; Delete in the menu
  removes it without a dialog, and the Delete key in the list removes
  nothing; Delete on the open project shows the error and removes nothing;
  the panel
  collapses and stays collapsed after a reload; Version History Restore
  opens an older version unsaved; opening
  a project puts `/projects/<name>` in the address, a reload there reopens
  it, a first save and a rename update the address, `/projects/<other
  case>` opens the project, and an unknown name shows the start page with
  «No project "…"».
- `e2e/draft-recovery.spec.ts` (new): unsaved edit, reload, the list shows
  «Unsaved changes»; Open brings it back unsaved; Discard changes removes
  it; an unnamed draft shows as «Untitled».
- `e2e/autosave-recovery.spec.ts`: deleted, covered above.
- `e2e/global-setup.ts` / `global-teardown.ts`: keep the snapshot-and-clean
  of `.data/projects`, extend it to `.data/blobs`.
- Tests use unique project names: parallel workers share `.data`.

## Boundaries

- **Always:** keep export files complete; write every server file
  atomically; update the handbook pages listed above in the same work;
  state which tests were added.
- **Ask first:** deleting anything in `.data` outside the e2e cleanup and
  the agreed one-time cleanup; touching the firmware, the DDF format or what
  Recover from Device reads from a device; adding a dependency.
- **Never:** write to the server on a timer; store a project in
  `localStorage`; rewrite a name the user typed into a different folder
  name.

## Success criteria

1. Editing for any length of time writes nothing to `.data` until Save or
   Deploy.
2. A second save of a project writes exactly one file to `.data`, at most
   1 KB bigger than the project with its font, asset and DDF payloads
   removed. (Drafted as "under 20 KB"; the design of `COMBINED_TEST_PROJECT`
   alone is 53 KB of JSON, so the bound is relative to the design, not a
   fixed number.)
3. No save leaves a partially written file; the rename is the only step
   that touches a target.
4. No two projects on a server have the same name under the comparison
   rule, and every project's folder is named exactly as the list shows it.
5. Replacing a project never removes any of its versions.
6. The start page in a second browser lists a project saved in the first
   and opens it.
7. An unsaved edit survives a reload in the same browser and is offered on
   the start page.
8. Exporting a project after save and reopen gives the same file as before
   saving.
9. `npm run typecheck` and `npm run test:e2e` pass (`npm run lint` is not
   set up in this repo - `next lint` only offers to create a config);
   `e2e/handbook-labels.spec.ts` passes with the new labels.

## Open questions

1. **Delete without asking** cannot be undone, unlike every other delete in
   the designer. Settled as asked; noted so it is a choice, not an
   oversight.
