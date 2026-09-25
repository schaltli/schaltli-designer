# Implementation plan: block-topics

Spec: `docs/2026-09-25-block-topics.md` (agreed 2026-09-25).
Task checklist: `tasks/block-topics-todo.md`.

Kept in files of its own because `tasks/plan.md` and `tasks/todo.md` hold
another session's unfinished themes plan (12 open tasks on 2026-09-25).

## Overview

Every block declares all its topics, including the name topic, with
examples a van would really send, and the value the broker reported while
the block was placed comes first. Designer only; three small tasks.

## What the code looks like today

- `lib/bausteine.ts`: `BausteinInstance` is `{ key, label, valueTopic }`.
  `discoverInstances` reads the retained snapshot, finds each instance's
  value topic and its name, and keeps only the name (as `label`).
  `fallbackInstances` builds the same shape without a broker. Each
  `BausteinDef.build()` returns `objects` and `topics`, the latter with the
  constant examples `PERCENT_EXAMPLES`, `POWER_EXAMPLES`, `DIMMER_EXAMPLES`.
- `components/baustein-dialog.tsx` collects the snapshot and offers either
  discovered or fallback instances.
- `components/project-editor.tsx` `finishBaustein` adds the topics the
  project does not have yet. That rule stays untouched.
- No test checks what ends up in the project's topics.

## Architecture decisions

1. **The instance carries what was found.** `BausteinInstance` gains
   `reportedValue?` and `reportedName?` (from the snapshot) and `nameTopic?`
   (derived for keyed blocks with a `nameLeaf`, found or fallback alike).
   `build()` already receives the instance, so no new parameter and no
   change in the dialog beyond what `discoverInstances` returns.
2. **One function builds the examples** for every block:
   `examplesWith(reported, defaults, accept)` - the reported value first if
   `accept` says it fits (numeric in range, one of on/off, rounded to the
   dimmer's step), then the defaults without duplicates, three at most. Pure,
   exported, so the spec can test it without a browser.
3. **Name topic** is added to `topics` by the three keyed blocks, type
   `text`, examples `[reportedName ?? fallback label]`. No object binds to it
   in this module.

## Task list

### Phase 1
- [x] Task 1: Realistic defaults and the name topic, without a broker
- [ ] Task 2: The broker's reported value and name come first

### Checkpoint A
- [ ] `npx playwright test e2e/bausteine.spec.ts` and typecheck green
- [ ] Review with the user

### Phase 2
- [ ] Task 3: Handbook

### Checkpoint B (done)
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing block tests assert the old examples or topic count | Low | Run the whole block spec in Task 1 and adjust only assertions about examples, never about behaviour |
| A reported value that is not a number (or an unexpected relay word) | Low | `accept` rejects it; the defaults stand; one test places a tank reporting `abc` |
| Round fixture device lacks a block's object type (e.g. no slider) | Low | The existing spec already picks fixtures per block; reuse them |
| Another session edits the same files (themes work touches the designer) | Med | Work only in `lib/bausteine.ts`, `e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`; commit per task, staging only those files |

## Open questions

None.
