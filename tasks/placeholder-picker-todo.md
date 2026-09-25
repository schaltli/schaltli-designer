# placeholder-picker: tasks

Plan: `tasks/placeholder-picker-plan.md` · Spec: `docs/2026-09-25-placeholder-picker.md`

Tests are written with each task and run at Checkpoint B on the new machine
(decided 2026-09-25); `[~]` = built and test written, not yet run.

## Task 1: Completion logic, pure

**Description:** `lib/placeholder-completion.ts` - `completionContext`,
`referenceEntries`, `formatEntries`, `applyCompletion` (plan decision 1).

**Acceptance criteria:**
- [~] Context: `{` → reference stage, query ""; `{{` → none; `{topic:ta` →
      reference, query "topic:ta"; `{topic:a/b:` and `{topic:a/b:F` → format;
      after a `}` → none; inside a quoted fallback → none.
- [~] Entries: filtered by path and by first example; `topic:` narrows to
      topics; JSON topics listed per field; device `model`, `id`; project
      `name`.
- [~] Formats: F0, F1, F2, N0, N2 with preview in the given separators; none
      for a non-numeric example; typed `N`/`F2` narrows.
- [~] Insert: reference → `{topic:…}` with the caret before `}`; format →
      `:F2}` completed, the caret after `}`.

**Verification:**
- [~] `npx playwright test e2e/placeholder-picker.spec.ts -g "completion"` (new machine)
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/placeholder-completion.ts`, `e2e/placeholder-picker.spec.ts`

**Estimated scope:** M

## Task 2: The list in the Text field (stages 1 and 2)

**Description:** `PlaceholderTextField`: a `TextField` whose `{` opens a
`Popover` + `Command` at the caret, keys handled on the input (plan decision
2), Esc/blur/`}` close it. Used for a text's Text; `property-panel.tsx` hands
`topics` and `separators` to `LabelProperties`.

**Acceptance criteria:**
- [~] `{` opens Topic / Device / Project; typing filters; Enter inserts with
      the caret before `}`; `:` shows formats with previews; Enter completes.
- [~] `{{` opens nothing; Esc and leaving the field close the list.

**Verification:**
- [~] `npx playwright test e2e/placeholder-picker.spec.ts -g "Text field"` (new machine)
- [ ] Manual: in the designer, the success criterion's key sequence

**Dependencies:** Task 1

**Files likely touched:** `components/property-panel/fields/placeholder-text-field.tsx`,
`components/property-panel/label-properties.tsx`,
`components/property-panel/property-panel.tsx`, `e2e/placeholder-picker.spec.ts`

**Estimated scope:** M

## Checkpoint A
- [x] Typecheck green
- [x] Manual try in the designer (2026-09-25: scrollbar click and { over a selection fixed on the way)
- [x] Review with the user

## Task 3: Problem lines, Ctrl+Space, and the level's Name

**Description:** Under the field, one line per problem (red: shown as written
on a device; amber: topic not in the project yet), else the hint. Ctrl+Space
opens the list inside an unclosed `{…`. The bar/slider Name uses the same
field.

**Acceptance criteria:**
- [~] `{device:name}` shows a red line with the reason; `{topic:new/one}` an
      amber one; a clean text the hint.
- [~] Ctrl+Space inside `{topic:ta` opens the list filtered to `topic:ta`.
- [~] A bar's Name has the same list (pulled into task 2, 2026-09-25) and the lines.

**Verification:**
- [~] `npx playwright test e2e/placeholder-picker.spec.ts` (new machine)
- [x] `npm run typecheck`

**Dependencies:** Task 2

**Files likely touched:** `components/property-panel/fields/placeholder-text-field.tsx`,
`components/property-panel/level-indicator-properties.tsx`,
`components/property-panel/property-panel.tsx`, `e2e/placeholder-picker.spec.ts`

**Estimated scope:** S

## Task 4: Handbook

**Description:** The Platzhalter section in `handbuch/objekte/anzeigen.md`
says how to pick instead of type: `{`, filter, Enter, `:` and the formats,
Ctrl+Space, the lines under the field. Through `maettel-humanizer`.

**Acceptance criteria:**
- [ ] The section describes the picker; the handbook builds.

**Verification:**
- [ ] `npm run build --prefix handbuch`
- [ ] `npx playwright test e2e/handbook-labels.spec.ts` (new machine)

**Dependencies:** Task 3

**Files likely touched:** `handbuch/objekte/anzeigen.md`

**Estimated scope:** XS

## Checkpoint B (done)
- [ ] All picker tests run and green (new machine)
- [ ] Every success criterion in the spec ticked
