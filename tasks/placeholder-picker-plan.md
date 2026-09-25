# Implementation plan: placeholder-picker

Spec: `docs/2026-09-25-placeholder-picker.md` (agreed 2026-09-25), sub-module
of `docs/2026-09-25-text-placeholders.md`. Task checklist:
`tasks/placeholder-picker-todo.md`. Own files: `tasks/plan.md` belongs to
another session.

## Overview

`{` in a text's Text or a level's Name opens a list of topics, device and
project fields, then formats with a preview; problems show as lines under
the field. The logic is pure and tested without a browser; the field wraps
it in the `Popover` + `Command` the designer already has.

## What the code looks like today

- `components/property-panel/fields/text-field.tsx`: `TextField` - a plain
  `<input>`, with `onBlur` since placeholder-core task 5.
- `label-properties.tsx` (Text) and `level-indicator-properties.tsx` (Name)
  use it; both call `onDeclareTopics` on blur. `LabelProperties` gets no
  topics yet; `LevelIndicatorProperties` does.
- `property-panel.tsx` has the project's `topics`; separators, device and
  project name are not handed to the panel yet.
- `lib/placeholders.ts`: `parse`, `formatNumber`, `FIELDS`,
  `projectSeparators`; `components/ui/{popover,command}.tsx` on `cmdk`.

## Architecture decisions

1. **`lib/placeholder-completion.ts` is pure**: `completionContext(text,
   caret)` → `{ stage: "reference" | "format", start, query, topicPath?,
   closeAt, replaceEnd, … }` or undefined; `referenceEntries(query, topics)` → grouped, filtered entries;
   `formatEntries(query, example, separators)`; `applyCompletion(text,
   context, choice)` → `{ text, caret }`. The component only wires these to
   keys and a list.
2. **Focus stays in the input.** ↑/↓/Enter/Tab/Esc are handled on the input
   while the list is open; the list is a plain listbox with our own
   highlight (built 2026-09-25: cmdk's `Command` selects on its own and would
   fight it), not by moving focus into it. So typing keeps working
   and blur keeps meaning "left the field" (topic declaration).
3. **Anchored under the field at the caret's x**, measured with a canvas in
   the input's computed font; clamped to the field's width.
4. **Problems come from `parse`** plus the project's topics, as a list of
   `{ severity, text }` under the field; the hint line when there are none.
5. **One field component**, `PlaceholderTextField`, used by both panels;
   `property-panel.tsx` passes `topics`, `separators` down (device and project
   entries are the fixed `FIELDS`; their preview is not needed).

## Task list

### Phase 1
- [~] Task 1: Completion logic, pure
- [~] Task 2: The list in the Text field (stages 1 and 2)

### Checkpoint A
- [x] Typecheck green; manual try in the designer; review with the user

### Phase 2
- [~] Task 3: Problem lines, Ctrl+Space, and the level's Name
- [x] Task 4: Handbook

### Checkpoint B (done)
- [ ] All picker tests run and green - on the new machine
- [ ] Every success criterion in the spec ticked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `cmdk` filters and highlights on its own and fights our filter | Med | Use `Command` with `shouldFilter={false}` and a controlled `value`; our entries are already filtered |
| Caret position measured wrong with a TTF/BDF label font | Low | The input itself uses the designer's UI font, not the object's; measure in the input's computed style |
| Enter in the field is caught elsewhere (form submit, canvas shortcuts) | Low | `preventDefault` only while the list is open |
| Tests cannot be run on this machine | Med | Written with the tasks, run at Checkpoint B on the new machine |

## Open questions

None.
