# Implementation plan: placeholder-core

Spec: `docs/2026-09-25-text-placeholders.md` (agreed 2026-09-25), sub-module
`placeholder-core` - the first of four (`core` → `picker` → `devices` →
`blocks`). Task checklist: `tasks/placeholder-core-todo.md`.

Own files because `tasks/plan.md` / `tasks/todo.md` hold another session's
plan.

## Overview

The language exists in the designer: one evaluator, the shared test vectors,
the number format setting, texts and level labels rendered through it in the
preview, the seven old placeholders gone, `project:name` baked in at export.
Devices come in `placeholder-devices`; until then they show a placeholder as
written, and the designer warns before a deploy to one that cannot show it.

## What the code looks like today

- `lib/placeholder-utils.ts` (63 lines): `processPlaceholders(text, ctx)` for
  the seven `{screen}`-style tokens, `createPlaceholderContext`. Used by
  `render-label.ts:24`, `render-screen.ts`, `canvas.tsx`,
  `screen-thumbnail.tsx`, `app/test-render/page.tsx`, and baked at export in
  `lib/project-zip.ts` and `lib/android-export.ts`. The text panel's
  "Insert" row (`label-properties.tsx`) offers them;
  `e2e/label-placeholders.spec.ts` tests them; `handbuch/objekte/anzeigen.md`
  documents them.
- `lib/level-shape.ts` `levelName(obj)` is the raw label. It decides whether
  the header row exists (`:282`) and is what the header draws
  (`render-level-indicator.ts:593`).
- `lib/render-screen.ts` `projectSubscriptionTopics` (87-100): the project's
  topics plus each object's `topic` / `setpointTopic`.
- `lib/system-generation.ts`: `SYSTEM_GENERATION` = 1.1; every device
  announces its own in `hello`, and the deploy dialog already reads it.

## Architecture decisions

1. **One module, `lib/placeholders.ts`**: `parse(text)` → segments (literal
   or placeholder with namespace, path, fallback, format, or `raw` for
   anything unknown/reserved) and `resolve(text, lookup, separators)`. No
   React, no DOM, so the spec can test it without a browser and the firmware
   and Android ports can follow it line by line.
2. **Decimal rounding on the string**, never through a float: split the
   payload into sign, integer digits and fraction digits, round half away
   from zero at *n*, then group and join with the project's separators.
3. **`lookup(ref)` returns `undefined` for "never arrived"** and `""` for an
   empty message; the evaluator never needs to know where values come from.
   The preview's lookup is the live value, else (Simulation) the topic's
   first example; `device:` from the project's device; `project:name` from
   the project.
4. **The raw label still decides the layout**; only the drawn text is
   resolved. A label that is only a placeholder keeps its header row while
   the value is missing - the spec's "does not jump" - without the layout
   depending on values.
5. **Vectors are data, not code**: `lib/placeholders/vectors.json`, each case
   `{ text, values, missing, decimal, thousands, expected }`. The devices
   module copies the file as it is.
6. **The deploy warning keys on the device's generation**: placeholders need
   `PLACEHOLDER_GENERATION` = 1.2, which `placeholder-devices` makes the
   firmware and app announce. Core adds the check, so a device below it is
   warned about before anything is sent.

## Task list

### Phase 1: The language
- [x] Task 1: Parser, evaluator and the shared vectors
- [x] Task 2: Number format in Settings, stored as two characters

### Checkpoint A
- [ ] Vectors green; typecheck green; review with the user

### Phase 2: In the designer
- [x] Task 3: Texts and level labels render through the evaluator in the preview
- [x] Task 4: The old placeholders go; `project:name` is baked in at export
- [ ] Task 5: Referenced topics are declared and subscribed; deploy warns an old device

### Checkpoint B
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Review with the user

### Phase 3: Written down
- [ ] Task 6: Handbook and device contract

### Checkpoint C (done)
- [ ] Every core success criterion ticked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A saved project uses an old `{screen}` token | Low | Never released; a leftover shows as written, visibly, and Task 4's test proves the export does not choke on it |
| Devices without support show `{topic:…}` raw | Med | Task 5's deploy warning by generation; handbook says which firmware shows them |
| Rounding differs between TS and the later C++/Kotlin ports | Med | Decision 2 plus vectors that include half-way cases and negative numbers - the ports must pass the same file |
| Thumbnails and the headless test render page render labels too | Low | Task 3 moves every caller of `processPlaceholders` to the evaluator in one go; `renderLabel` is the single entry |
| Another session edits the text panel or project settings | Med | Commit per task, staging only this task's files |

## Parallelisation

Task 2 (settings UI) can run beside Task 1 once the separator shape is fixed
(decision 5). Tasks 3-5 touch the same rendering and panel files and run in
order.

## Open questions

None.
