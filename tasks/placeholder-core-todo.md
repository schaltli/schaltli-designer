# placeholder-core: tasks

Plan: `tasks/placeholder-core-plan.md` · Spec: `docs/2026-09-25-text-placeholders.md`

## Task 1: Parser, evaluator and the shared vectors

**Description:** `lib/placeholders.ts` with `parse()` and `resolve()` per the
spec's grammar (namespaces, `??` with number or quoted text, F0-F9/N0-N9 on
the last `:`, `{{ }}`, reserved and unknown shown as written), decimal
rounding on the string. `lib/placeholders/vectors.json` holds every case.

**Acceptance criteria:**
- [x] Every row of the spec's tables is a vector, plus half-way rounding
      (75.195 → 75.20, -2.5 → -3), `:` inside a path, a JSON path, an
      unterminated `{`, reserved `(…)`, `device:name` and `project:version`
      shown as written, empty-message vs never-arrived.
- [x] All vectors pass through `resolve()`.

**Verification:**
- [x] `npx playwright test e2e/placeholders.spec.ts` (no browser)
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/placeholders.ts`,
`lib/placeholders/vectors.json`, `e2e/placeholders.spec.ts`

**Estimated scope:** M

## Task 2: Number format in Settings, stored as two characters

**Description:** `settings.decimalSeparator` / `thousandsSeparator` on the
project (default Schweiz `.` / `'`), a Number format dropdown (English,
Deutschland, Österreich, Schweiz, Custom) in Project Settings; Custom unlocks
two fields; equal characters or an empty decimal are refused. Exported with
the project.

**Acceptance criteria:**
- [x] Choosing Deutschland stores `,` / `.`; typing `.` / ` ` under Custom
      stores those and the dropdown shows Custom; typing the same character
      twice is refused with a reason.
- [x] A project saved before has the Schweiz default when opened.
- [x] The two characters are in the exported `project.json`.

**Verification:**
- [x] `npx playwright test e2e/placeholders.spec.ts`

**Dependencies:** None (shape fixed by plan decision 5)

**Files likely touched:** `components/project-editor.tsx` (settings type,
default), `components/project-settings-dialog.tsx`, `components/number-format-field.tsx` (new),
`lib/placeholders.ts` (presets), `e2e/placeholders.spec.ts`

**Estimated scope:** M

## Checkpoint A
- [x] Vectors green; typecheck green
- [ ] Review with the user

## Task 3: Texts and level labels render through the evaluator in the preview

**Description:** `renderLabel` and the level header draw the resolved text;
the lookup is the live value, else in Simulation the first example;
`device:` from the project's device, `project:name` from the project, the
project's separators. The layout keeps using the raw label (plan decision
4). Every caller of `processPlaceholders` moves over.

**Acceptance criteria:**
- [x] A text `Tank {topic:…/level:F0} %` shows `Tank 72 %` with example 72,
      and follows a live value.
- [x] A bar labelled `{topic:…/name ?? "Frischwasser"}` shows the name, and
      `Frischwasser` when the topic has no example; its header row is the
      same height either way.
- [x] Thumbnails and the headless test render show the same (the harness is
      tested; thumbnails share its renderScreenObjects path).

**Verification:**
- [x] `npx playwright test e2e/placeholders.spec.ts e2e/level-header.spec.ts`

**Dependencies:** Task 1, Task 2

**Files likely touched:** `components/canvas/renderers/render-label.ts`,
`components/canvas/renderers/render-level-indicator.ts`,
`lib/render-screen.ts`, `components/screens-panel/screen-thumbnail.tsx`,
`app/test-render/page.tsx`

**Estimated scope:** M

## Task 4: The old placeholders go; `project:name` is baked in at export

**Description:** `lib/placeholder-utils.ts` and its seven tokens are removed;
the "Insert" row in the text panel goes (the picker replaces it in the next
module). The export replaces `{project:name}` with the name and leaves
`topic:` and `device:` placeholders as written, in the device zip and the
Android export alike.

**Acceptance criteria:**
- [x] No `{screen}`-style token is resolved anywhere; one left in a text
      shows as written.
- [x] An exported text `{project:name} - {topic:a/b:F1}` reads
      `Van Sommer 2026 - {topic:a/b:F1}` in `project.json`.
- [x] `e2e/label-placeholders.spec.ts` rewritten for the new behaviour.

**Verification:**
- [x] `npx playwright test e2e/label-placeholders.spec.ts e2e/placeholders.spec.ts e2e/android-export.spec.ts`

**Dependencies:** Task 3

**Files touched:** `lib/placeholder-utils.ts` (deleted), `lib/placeholders.ts`
(`bakeProjectFields`), `lib/project-zip.ts`, `lib/android-export.ts`,
`components/property-panel/label-properties.tsx`, `components/canvas/canvas.tsx`
(comment), `e2e/label-placeholders.spec.ts`, `e2e/android-export.spec.ts`,
`e2e/placeholders.spec.ts`, `e2e/fixtures/property-panel-controls.json`,
`hil/android/fixtures/build-android-test.js`. A level's label is baked as a
text is.

**Estimated scope:** M

## Task 5: Referenced topics are declared and subscribed; deploy warns an old device

**Description:** Committing a text or label that references a topic the
project lacks declares it (type text, no examples); `projectSubscriptionTopics`
includes every referenced topic. The deploy dialog warns when the project
uses placeholders and the chosen device announces a generation below
`PLACEHOLDER_GENERATION` (1.2).

**Acceptance criteria:**
- [~] Typing `{topic:van/new:F1}` into a text adds `van/new` to Settings ›
      Topics once, and the live preview subscribes to it.
- [~] Deploying such a project to a device announcing 1.1 shows the warning;
      to one announcing 1.2, none.

**Verification:**
- [ ] `npx playwright test e2e/placeholders.spec.ts e2e/deploy-dialog.spec.ts` -
      **written, not run** (user's call 2026-09-25: this machine is too slow;
      run on the new one). `[~]` above = built, test written, not yet run.
      Typecheck green.

**Dependencies:** Task 3

**Files touched:** `lib/render-screen.ts` (subscriptions, `placeholderTexts`,
`projectUsesLivePlaceholders`), `lib/system-generation.ts`
(`PLACEHOLDER_GENERATION`, `generationBelow`), `components/project-editor.tsx`
(`declareTopics`), `components/property-panel/{property-panel,label-properties,level-indicator-properties}.tsx`,
`components/property-panel/fields/text-field.tsx` (`onBlur`),
`components/deploy-dialog.tsx`, `e2e/placeholders.spec.ts`.

**Estimated scope:** M

## Checkpoint B
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Review with the user

## Task 6: Handbook and device contract

**Description:** `handbuch/objekte/anzeigen.md` (and wherever texts are
described) explains placeholders, formats, `??`, the number format setting,
and that devices show them from firmware/app generation 1.2;
`docs/device-contract.md` gets the language for device authors.
Through `maettel-humanizer`.

**Acceptance criteria:**
- [x] No handbook page mentions the old tokens.
- [~] `e2e/handbook-labels.spec.ts` green (written labels exist in the source;
      spec not run); the handbook builds.

**Verification:**
- [ ] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts` -
      not run, new machine
- [x] `npm run build --prefix handbuch`

**Dependencies:** Tasks 1-5

**Files touched:** `handbuch/objekte/anzeigen.md` (section Platzhalter; `{{ }}`
in a `::: v-pre` block, VitePress reads it as Vue otherwise),
`handbuch/designer/projekte.md` (Number format), `docs/device-contract.md` §2.4.

**Estimated scope:** S

## Checkpoint C (done)
- [ ] Every core success criterion in the spec ticked
