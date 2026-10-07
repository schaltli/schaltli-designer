# Implementation plan: live values, designer part (`live-values`)

Spec: `docs/2026-10-07-live-values.md` (draft 2026-10-07, open question 1
decided). Issue #55. Tasks: `tasks/live-values-todo.md`. Chat German, docs
English.

Scope: the spec's modules `live-value-core`, `combined-topics` (designer
side) and `live-value-designer`. **Stops before** `live-value-export` (rules,
icon results and combined topics on devices), the device contract,
firmware, Android, and the migration of Live Icon, Live Line, Switcher and
Switch onto live values.

## Overview

A text's values become chips: each chip is a live value kept on the object
(`properties.liveValues[]`, `{live:<id>}` in the text) with a source, a
format, rules, Otherwise and No value yet, edited in a popover under the
field. An icon can be Fixed or Live. Combined topics (all / any, nested by
name, no circular references) join the project's topics and can be read
wherever a topic is read. Everything works in the designer: canvas,
thumbnails, preview with examples, live MQTT and test values. Devices keep
working through an interim export that writes what today's placeholders can
say and warns about the rest.

## Architecture decisions

- **One pure core, `lib/live-value.ts`**, written to be ported line by line
  like `lib/placeholders.ts`: no regular expression doing what a loop could,
  no locale API, no float arithmetic for formatting. Its cases go to a new
  `lib/live-value/vectors.json` from the start, so firmware and Android
  inherit them later. `formatNumber` is reused, not copied.
- **The new comparison semantics live only in the core.** A non-number does
  not match `<` `<=` `>` `>=` (spec decision 5). `evaluateCondition` in
  `lib/render-screen.ts` and the live-icon matcher in `render-mqtt-field.ts`
  stay as they are until the migration, which is not in this plan.
- **`{topic:…}`, `{device:…}`, `{project:…}` leave texts by migration**, not
  by coexistence: `migrateProject` turns every such placeholder into a live
  value (format `F`/`N` → number format, `?? x` → No value yet). Blocks and
  discovery write live values directly. One representation from then on.
- **Interim export lowers live values to today's placeholders.** A live
  value without rules, with a number format or none, and a text No value yet
  is exactly what `{topic:path:F1 ?? "x"}` already says - devices on
  generation 1.2 show it unchanged. Anything else (rules, a duration, an icon
  live value, a combined topic) is not exported until `live-value-export`:
  the chip writes nothing, a live icon draws its Otherwise icon if it has
  one, and the deploy dialog names each such object, as it names objects a
  device cannot show today. A project of today's kind therefore exports
  byte-identical before and after the migration.
- **The chip field is a `contenteditable` with atomic chip spans**, its
  model the stored string with `{live:<id>}` tokens. Arrow keys step over a
  chip, Backspace/Del remove it whole, paste of a text with `{topic:…}` turns
  into chips. The `{` list of `placeholder-text-field.tsx` is reused for
  choosing a source. This is the riskiest task and comes early in Phase 2.
- **Icon results go through `IconSelectorModal`** with a new
  `IconSelectorContext` type `"live-value-rule"` (rule index + live value
  id), the way `"value-icon-pair"` and `"switch-state"` already do.
- **Combined topics are `project.combinedTopics[]`**, beside `topics`, with a
  pure `lib/combined-topics.ts` (evaluation order, circular-reference check,
  dependents). The topic picker gets a `writes` prop at the four write
  sites (switch, level, arc level, hardware button send) - there combined
  topics are not offered; everywhere else they are, as group «Combined».

## Task list

### Phase 1: Core and migration (`live-value-core`)
- [x] Task 1: The live value evaluates (model, operators, is yes / is no, rules, Otherwise, No value yet) with shared vectors
- [x] Task 2: Formats and text results (number, duration, the `value` token, empty results, `{live:<id>}` in a text)
- [x] Task 3: `{topic:…}` in a text becomes a live value on open; blocks and discovery write live values

### Checkpoint: Core
- [ ] `e2e/live-value.spec.ts`, `e2e/placeholders.spec.ts`, `e2e/project-migration.spec.ts`, `e2e/bausteine.spec.ts` pass; `npm run typecheck` clean
- [ ] A project with today's placeholders opens, every text reads as before

### Phase 2: Text with chips (`live-value-designer`, text)
- [x] Task 4: Canvas, thumbnails, preview and test-render draw texts through live values
- [ ] Task 5: Interim export: what today's placeholders can say is lowered to them, the rest is named in the deploy dialog
- [x] Task 6: The text field shows chips; arrows, Backspace, Del, copy and paste treat a chip as one
- [x] Task 7: `{` and «+ Value» insert a chip and open its live value
- [x] Task 8: The live value editor: source, «Value shown as», rules, Otherwise, No value yet, ‹ › between chips

### Checkpoint: Text
- [ ] Full `npx playwright test`; knob and 4.3B HIL with today's fixtures still green (interim export)
- [ ] The user builds «Heizung [status][timer] · [innen] °C» (mockup R3) in the designer and checks it in the preview

### Phase 3: Live icon and test value
- [ ] Task 9: An icon is Fixed or Live; rule results are icons picked in Select Icon; «This rule can show»
- [ ] Task 10: The test value: slider / text / «No value yet», the rule that applies marked, for text and icon

### Checkpoint: Icon
- [ ] The user builds the frost warning (mockup R1) without help

### Phase 4: Combined topics (`combined-topics`, designer)
- [ ] Task 11: Combined topics evaluate: all / any, nesting, order, circular references, no value yet
- [ ] Task 12: Combined topics in the Topics tab; delete and rename; the picker offers them only where something is read
- [ ] Task 13: The preview computes combined topics from examples, test values and live MQTT

### Checkpoint: Complete
- [ ] Full `npx playwright test`, `npm run test:all` with what is connected
- [ ] Every handbook page named in the tasks updated; `e2e/handbook-labels.spec.ts` green
- [ ] Spec status updated; ready for `live-value-export`

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `contenteditable` chip field fights React and the browser (caret, IME, undo) | High | Task 6 early in Phase 2, its own spec; the stored string stays the single source of truth, the DOM is rebuilt from it; Ctrl+Z keeps the editor's history, not the browser's |
| The migration changes what a text reads | High | Task 3 asserts every case in `lib/placeholders/vectors.json` reads the same after migration; Task 5 asserts byte-identical export |
| HIL fixtures and blocks write `{topic:…}` | Med | They keep working through migration + interim export; fixtures are switched to live values only in `live-value-export` |
| Two comparison semantics side by side until the migration | Med | Named in code at both places, with the spec decision; the migration plan removes the old one |
| The editor popover grows into a second property panel | Med | Built from existing pieces (`ConditionRow`, `IconField`, `TopicField`); mockup R3 is the bound |

## Decided with the user (2026-10-07)

- Durations: `h:mm:ss`, `h:mm`, `m:ss`, from seconds, as the first set.
- A pasted or typed `{topic:…}` always becomes a chip.
- Live value ids: `lv1`, `lv2` … per object.
