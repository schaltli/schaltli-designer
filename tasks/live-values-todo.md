# Tasks: live values, designer part (`live-values`)

Plan: `tasks/live-values-plan.md` · Spec: `docs/2026-10-07-live-values.md`
· Issue #55. Chat German, docs English.

## Task 1: The live value evaluates

**Description:** `lib/live-value.ts`: the `LiveValue`, `Rule` and `Result`
types of the spec and `evaluate(liveValue, value | undefined)` → the result
that applies (rules top to bottom, Otherwise, No value yet). Operators
`<` `<=` `>` `>=` `==` `!=`, `yes`, `no` per spec decision 5, «is yes / is
no» as one exported function each. `lib/comparison-operators.ts` gets
`yes`/`no` as rule operators beside the six. Cases in a new
`lib/live-value/vectors.json`, run by a new `e2e/live-value.spec.ts`.

**Acceptance criteria:**
- [x] Every operator on a number, on text and on a non-number; a non-number
      matches no order operator.
- [x] Every listed yes / no spelling, any case, trimmed; numbers ≠ 0 / = 0;
      an empty message is no; no value at all is No value yet, never no.
- [x] First matching rule wins; Otherwise absent means «the value».

Done 2026-10-07. `RULE_OPERATORS` sits beside `COMPARISON_OPERATORS`
rather than in it: Live Icon, Live Line and Switcher still offer the six.

**Verification:** `npx playwright test e2e/live-value.spec.ts`; `npm run typecheck`.

**Dependencies:** none · **Scope:** S

**Files likely touched:** `lib/live-value.ts`, `lib/live-value/vectors.json`,
`lib/comparison-operators.ts`, `e2e/live-value.spec.ts`

## Task 2: Formats and text results

**Description:** `ValueFormat` (as is, number with decimals and grouping,
duration `h:mm:ss` / `h:mm` / `m:ss` from seconds) and the text result with
its `value` token. `resolveLiveText(text, liveValues, lookup, separators)`:
each `{live:<id>}` replaced by its live value's text, an unknown id shown as
written, `{{`/`}}` as today. Number formatting through `formatNumber` from
`lib/placeholders.ts`.

**Acceptance criteria:**
- [x] Number formats agree with every number case in
      `lib/placeholders/vectors.json`; a non-number under a number format is
      written as it came.
- [x] Durations: 12198 → `3:23:18`, `3:23`, `203:18`; a negative or
      non-number duration is written as it came.
- [x] An empty result leaves nothing, the space inside it included; an
      unknown `{live:x}` stays as written.

Done 2026-10-07. `formatValue`, `textOf`, `resolveLiveText` in
`lib/live-value.ts`; 33 more vectors (`text`, `resolve`). That every
placeholder case reads the same is Task 3's check, after migration.

**Verification:** `e2e/live-value.spec.ts` (vectors extended); `npm run typecheck`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `lib/live-value.ts`, `lib/live-value/vectors.json`,
`e2e/live-value.spec.ts`

## Task 3: `{topic:…}` in a text becomes a live value on open

**Description:** `migrateProject` turns every `{topic:…}`, `{device:…}`,
`{project:…}` in a text into a live value on the object: `:F<n>`/`:N<n>` →
number format, `?? "x"` / `?? 0` → No value yet, ids `lv1`, `lv2` … per
object. `liveTextToText` writes a live value straight away. Blocks
(`lib/bausteine.ts`) and discovery write live values instead of
placeholders. `placeholderTexts`, `referencedTopics`,
`projectSubscriptionTopics` and `exportedTopics` read the live values'
sources.

**Acceptance criteria:**
- [x] Every case in `lib/placeholders/vectors.json`, written into a text and
      migrated, reads exactly the same through `resolveLiveText`.
- [x] Opening twice changes nothing more (idempotent); `{{` stays a brace.
- [x] A block placed today and the same block placed after this read alike
      on the canvas; its subscription topics are unchanged.

Part 1 done 2026-10-07: `placeholdersToLiveValues` in `lib/live-value.ts`,
every placeholder vector reads the same after it, a second pass changes
nothing. **Order changed:** wiring it into `migrateProject`, blocks and
discovery (part 2) waits until Tasks 4 and 5 draw and export live values -
switched on before, the canvas and the devices would show `{live:lv1}` as
written.

Part 2 done 2026-10-07: `migrateObjects` turns a text's placeholders into
live values in the project's number format (a Live Text through its
placeholder, so the same way); `labelObject` in `lib/bausteine.ts` places
blocks with live values. Until Task 6 the text field shows a live value as
the placeholder that says it and keeps every edit as live values.
`placeholderProblems` skips `{live:…}`. Tests that asserted a block's or a
migrated text's placeholder read it back through `asPlaceholders`
(`e2e/helpers.ts`). Full suite: 1258 passed; `project-save:66` and
`undo:412`/`undo:539` failed now and then under load and passed alone and in
two further repeated runs - noted, not traced to this change.

**Verification:** `e2e/project-migration.spec.ts`, `e2e/bausteine.spec.ts`,
`e2e/block-description.spec.ts`, `e2e/label-placeholders.spec.ts`; `npm run typecheck`.

**Dependencies:** Task 2 · **Scope:** M

**Files likely touched:** `lib/object-types.ts`, `lib/live-value.ts`,
`lib/bausteine.ts`, `lib/render-screen.ts`, `e2e/project-migration.spec.ts`

## Checkpoint: Core
- [ ] `e2e/live-value.spec.ts`, `e2e/placeholders.spec.ts`,
      `e2e/project-migration.spec.ts`, `e2e/bausteine.spec.ts` pass;
      `npm run typecheck` clean
- [ ] A project with today's placeholders opens, every text reads as before

## Task 4: Texts are drawn through live values

**Description:** `placeholderScope` and its callers resolve `{live:<id>}`
through `resolveLiveText`: canvas (and a popup's underlay), screen
thumbnails, the read-only `renderScreenObjects` path, `app/test-render`.
The value per source comes as today: examples, live MQTT in the preview,
`topicOverrides` in test-render.

**Acceptance criteria:**
- [x] A text with chips reads the same on the canvas, in the thumbnail and
      through `__renderScreenForTest`.
- [x] Preview with live values: a chip follows its topic; nothing arrived
      → No value yet.
- [x] `e2e/live-preview.spec.ts` and `e2e/empty-values.spec.ts` pass with
      their texts migrated.

Done 2026-10-07. Every renderer draws a text through `renderLabel`, which
now calls `objectText` (new `lib/object-text.ts`, apart from render-screen
to keep the two from importing each other): live values where the object
has them, placeholders otherwise. `objectReferencedTopics` feeds the live
preview's subscriptions, the exported topics and the generation warning.
The live preview's own specs run through live values once Task 3 part 2
migrates their texts.

**Verification:** `e2e/live-preview.spec.ts`, `e2e/empty-values.spec.ts`,
`e2e/placeholder-*.spec.ts`; knob HIL reference rendering unchanged.

**Dependencies:** Task 3 · **Scope:** M

**Files likely touched:** `lib/render-screen.ts`,
`components/canvas/renderers/render-label.ts`, `components/canvas/canvas.tsx`,
`components/screens-panel/screen-thumbnail.tsx`, `app/test-render/page.tsx`

## Task 5: Interim export

**Description:** Both exports write a text's live value back as today's
placeholder where one can say it (source, number format or none, text No
value yet, no rules). Any other live value writes nothing, and the deploy
dialog lists each object it affects: «shows on devices once they read live
values», like the placeholder generation warning. `{project:name}` stays
baked in at export.

**Acceptance criteria:**
- [x] Every placeholder case, migrated and written back, reads the same on
      a device's path (`resolve` of lib/placeholders). Byte-identical is not
      kept: `?? 0:F1` comes back as `?? 0.0:F1`, the fallback as it reads.
- [x] A chip with a rule is left out of the exported text and the dialog
      names its object and screen.
- [ ] Knob and 4.3B HIL pass with today's fixtures - at the Text
      checkpoint, once Task 3 part 2 migrates on open.

Done 2026-10-07 but for the HIL run. `placeholderFor` / `lowerLiveText` in
`lib/live-value.ts`, `exportedTextProperties` and `liveValuesNotOnDevices`
in `lib/object-text.ts`; both exports call the first, the deploy dialog
shows the second (`live-value-warning`). A project without live values
exports as before.

**Verification:** a new export case in `e2e/live-value.spec.ts`;
`e2e/label-placeholders.spec.ts`, `e2e/deploy-dialog.spec.ts`,
`e2e/android-export.spec.ts`; knob + 4.3B HIL.

**Dependencies:** Task 4 · **Scope:** M

**Files likely touched:** `lib/project-zip.ts`, `lib/android-export.ts`,
`lib/live-value.ts`, `components/deploy-dialog.tsx`

## Task 6: The text field shows chips

**Description:** Replace the `<input>` of `PlaceholderTextField` by a
`contenteditable` whose model is the stored string: a `{live:<id>}` is a
chip span (source short name · result at the example), not editable.
Arrows step over a chip; Backspace/Del remove it and its live value; copy
carries the chip (and its live value, a new id if taken); a pasted
`{topic:…}` becomes a chip. Enter/Esc still finish the field
(`finish-field.ts`). Its focus id stays `#text`.

**Acceptance criteria:**
- [x] Typing around chips keeps them; the caret never lands inside one.
- [x] Deleting a chip removes its live value; Ctrl+Z restores both.
- [x] Copying a chip into another text gives that object its own live value.

Done 2026-10-07 with Task 7 in one commit (without Task 7 the new field
could not insert a value at all). `components/property-panel/fields/
live-text-field.tsx`, a contenteditable built from the stored string. A
zero-width space after every chip (Chrome otherwise moves the caret into the
text before it) is never stored; Backspace, Delete, the arrows, Home and End
step over chip and space together. Ctrl+Z inside the field is the browser's;
a deleted chip's live value stays until the field is left, so it finds it.
The old `PlaceholderTextField` and the completion stages only it used
(`completionContext`, `applyCompletion`, `formatEntries`) are gone.

**Verification:** new `e2e/live-value-chips.spec.ts`; `e2e/focus-on-create.spec.ts`,
`e2e/placeholder-picker.spec.ts` (adapted); manual check in Chrome and Firefox.

**Dependencies:** Task 4 · **Scope:** M

**Files likely touched:** `components/property-panel/fields/placeholder-text-field.tsx`,
`components/property-panel/fields/live-text-editor.tsx` (new),
`components/property-panel/label-properties.tsx`, `e2e/live-value-chips.spec.ts`

## Task 7: `{` and «+ Value» insert a chip

**Description:** `{` in the field, or the «+ Value» button, opens the
source list (Topics, Combined later, Device, Project; filtered as today by
`referenceEntries`). Enter inserts a chip with a new live value of that
source (format: number, 1 decimal for a numeric topic; as is otherwise)
and opens its editor. A topic the project lacks is added on leaving, as
today.

**Acceptance criteria:**
- [x] `{` + filter + Enter inserts a chip at the caret and opens its editor.
- [x] Esc closes the list and removes the typed `{`; a literal brace is
      `{{`, as today.
- [x] The list keeps today's keyboard behaviour (arrows, Tab, Ctrl+Space).

Done 2026-10-07 with Task 6. `{` opens a search with a field of its own
(as mockup R3), not a list that follows the text typed after the brace: with
chips in the text, tracking that run is fragile. `{` again at once writes
`{{`, a brace, as before. Handbook: `objekte/anzeigen.md` («Werte im Text»
replaces «Platzhalter»), `designer/tastatur.md` (chip keys),
`designer/deploy.md`, `designer/projekte.md`, `designer/bausteine.md`,
`objekte/anordnen.md`, `objekte/gemeinsames.md`.

**Verification:** `e2e/live-value-chips.spec.ts`; `e2e/placeholder-picker.spec.ts`.

**Dependencies:** Task 6 · **Scope:** S

**Files likely touched:** `components/property-panel/fields/live-text-editor.tsx`,
`lib/placeholder-completion.ts`, `e2e/live-value-chips.spec.ts`

## Task 8: The live value editor

**Description:** A click on a chip (or Enter on it) opens its live value
under the field, the chip marked: source (`TopicField`), «Value shown as»,
the rules (`ConditionRow` with `is yes`/`is no` added, result as text with
a `value` token), Otherwise, No value yet, «+ Add rule»; header «Live value
2 of 3» with ‹ ›. A boolean-looking topic gets «is yes»/«is no» proposed.
Handbook: `objekte/anzeigen.md` (Text, «Live values» replaces
«Platzhalter»), `designer/tastatur.md` (chip keys).

**Acceptance criteria:**
- [x] Every field of mockup R3 edits the live value and the canvas follows.
- [x] ‹ › and a click on another chip switch without closing; Esc returns
      to the text.
- [x] The handbook describes chips and the editor; handbook labels exist.

Done 2026-10-07. `components/property-panel/live-value-editor.tsx`, under
the field: Reads, Value shown as, rules, Otherwise, No value yet, ‹ ›, Esc
back into the text. A result is typed as text with `{value}` for the value.
«is yes / is no» is proposed where a topic's examples are such words (no
topic type says boolean). The handbook warns that rules, an own Otherwise
and durations do not reach devices yet (`handbuch-macke #55`; #55 labelled
`handbuch`).

**Verification:** `e2e/live-value-chips.spec.ts`, `e2e/handbook-labels.spec.ts`;
manual: mockup R3 rebuilt in the designer.

**Dependencies:** Task 7 · **Scope:** M

**Files likely touched:** `components/property-panel/live-value-editor.tsx` (new),
`components/property-panel/fields/condition-row.tsx`,
`components/property-panel/label-properties.tsx`, `handbuch/objekte/anzeigen.md`,
`handbuch/designer/tastatur.md`

## Checkpoint: Text
- [ ] Full `npx playwright test`; knob and 4.3B HIL with today's fixtures green
- [ ] The user builds «Heizung [status][timer] · [innen] °C» (mockup R3)
      and checks it in the preview

## Task 9: An icon is Fixed or Live

**Description:** The Icon panel gets «Fixed / Live». Live: a live value
whose results are icons, picked in `IconSelectorModal` through a new
`IconSelectorContext` type `"live-value-rule"`; «This rule can show» lists
every icon. The canvas draws the icon that applies (`renderIcon` with the
evaluated asset). Interim export: a live icon exports its Otherwise icon
and is named in the deploy dialog. Handbook: `objekte/anzeigen.md` (Icon).

**Acceptance criteria:**
- [x] The frost warning of mockup R1 can be set up and draws the right
      icon at each example.
- [x] Switching Live → Fixed keeps the Otherwise icon as the fixed one.
- [x] Every icon of a rule is in `project.assets`; «Remove Unused Assets»
      keeps them.

Done 2026-10-07. `properties.liveIconId` names the icon's live value in
`properties.liveValues`. `iconAsDrawn` (lib/object-text.ts) picks the
asset in the canvas and the read-only path; test-render preloads every
result icon. The editor has an icon mode (`resultKind="icon"`, «Live icon»,
«This rule can show»); `IconSelectorContext` type `"live-value-rule"`
writes a pick into a rule, Otherwise or No value yet. Both exports send a
live icon as its Otherwise icon (`withLiveIconsAsFixed`), the recovery copy
keeps it live; the deploy dialog names it. «Remove Unused Assets» already
keeps every id anywhere in the project. Handbook: `objekte/anzeigen.md`
(Icon, with a `handbuch-macke #55` warning).

**Verification:** new `e2e/live-icon-value.spec.ts`; `e2e/icon-*.spec.ts`;
`e2e/handbook-labels.spec.ts`.

**Dependencies:** Task 8 · **Scope:** M

**Files likely touched:** `components/property-panel/icon-properties.tsx`,
`components/property-panel/live-value-editor.tsx`, `components/project-editor.tsx`,
`components/canvas/renderers/render-icon.ts`, `lib/assets-in-use.ts`

## Task 10: The test value

**Description:** The live value editor has a test value: a slider for a
numeric source, a text field otherwise, a checkbox «No value has arrived
yet». The rule that applies is marked; the canvas shows the object at the
test value while the editor is open.

**Acceptance criteria:**
- [x] Moving the slider marks the rule that applies and redraws the object.
- [x] Closing the editor returns the canvas to the example value.
- [x] Works for a chip and for a live icon.

Done 2026-10-07. `lib/live-value-test.ts`, a small store the editor sets and
the canvas reads, so nothing between them carries it: while an editor is
open the canvas reads its test value for that source (every object reading
it, not only the one edited). The rule that applies is marked
(`data-applies`). Handbook: `objekte/anzeigen.md` («Ausprobieren»).

**Verification:** `e2e/live-value-chips.spec.ts`, `e2e/live-icon-value.spec.ts`.

**Dependencies:** Task 9 · **Scope:** S

**Files likely touched:** `components/property-panel/live-value-editor.tsx`,
`components/project-editor.tsx`, `components/canvas/canvas.tsx`

## Checkpoint: Icon
- [ ] The user builds the frost warning (mockup R1) without help

## Task 11: Combined topics evaluate

**Description:** `lib/combined-topics.ts`: `CombinedTopic {id, name, mode:
"all" | "any", conditions[]}`, evaluation order, circular-reference check
naming the chain, dependents, at most 8 levels, No value yet per spec
(«any»: one yes is enough; «all»: one no is enough). Cases in
`lib/live-value/vectors.json`.

**Acceptance criteria:**
- [x] `frost` / `nass` / `glaette` of the spec evaluate in every
      combination, including missing sources.
- [x] A circular reference is found and named, e.g. «glaette → nass → glaette».
- [x] Evaluation order puts every topic after what it uses.

Done 2026-10-07. `lib/combined-topics.ts`: `evaluationOrder` (with the
circular chain, started at the first name so a cycle always reads the same,
and `tooDeep`), `evaluateCombined`, `computeCombined`, `dependentsOf`. A
combined topic reads as "true" / "false", so «is yes» on it works as on any
topic. 14 cases in `lib/live-value/vectors.json` («combined»).

**Verification:** `e2e/live-value.spec.ts` (combined cases); `npm run typecheck`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `lib/combined-topics.ts`, `lib/live-value/vectors.json`,
`e2e/live-value.spec.ts`

## Task 12: Combined topics in the designer

**Description:** Project settings › Topics: «Add combined topic» with name,
all / any and conditions. In use → cannot be deleted (says where);
renaming carries every reference. `TopicSelector` gets a `writes` prop, set
at the four write sites; elsewhere it shows group «Combined» with
`combined:<name>`. The condition picker leaves out what would close a
circular reference. Handbook: `designer/topics.md`.

**Acceptance criteria:**
- [x] A combined topic is offered in a live value (chip search, Reads, a
      live icon). Not yet in a switch's state, and so in no `TopicSelector`
      at all: the objects those serve do not read combined topics until the
      migration turns their states into live values - offering it there
      would bind something that never draws. No write field offers it.
- [x] A project with a circular reference (written by hand) opens, shows
      it red, and the export refuses naming the chain.
- [x] Delete in use refused; rename updates live values and conditions.

Done 2026-10-07. `project.combinedTopics`; `components/combined-topics-section.tsx`
in Project Settings › Topics; `referenceEntries` offers them as «Combined»;
`combinedUsage`, `renameCombined`, `combinedReadableFrom`,
`assertCombinedExportable` in `lib/combined-topics.ts`. Both exports refuse
a circular reference or more than 8 levels, naming it. Handbook:
`designer/topics.md` («Combined topics», with a `handbuch-macke #55`
warning).

**Verification:** new `e2e/combined-topics.spec.ts`; `e2e/topic-*.spec.ts`;
`e2e/handbook-labels.spec.ts`.

**Dependencies:** Task 11, Task 8 · **Scope:** M

**Files likely touched:** `components/project-settings-dialog.tsx`,
`components/property-panel/topic-selector.tsx`, `components/project-editor.tsx`,
`lib/combined-topics.ts`, `handbuch/designer/topics.md`

## Task 13: The preview computes combined topics

**Description:** Wherever a value is looked up (examples, live MQTT, test
values, test-render overrides), a `combined:` source is computed from its
sources in evaluation order. Interim export: a live value reading a
combined topic is not exported and is named in the deploy dialog.

**Acceptance criteria:**
- [ ] Changing `outside_temp`'s test value changes `frost` and `glaette`
      and the icon that reads `glaette`.
- [ ] In the live preview a combined topic follows its sources' messages.
- [ ] The deploy dialog names objects that read a combined topic.

**Verification:** `e2e/combined-topics.spec.ts`; `e2e/live-preview.spec.ts`.

**Dependencies:** Task 12 · **Scope:** S

**Files likely touched:** `lib/render-screen.ts`, `lib/combined-topics.ts`,
`app/test-render/page.tsx`, `components/deploy-dialog.tsx`

## Checkpoint: Complete
- [ ] Full `npx playwright test`; `npm run test:all` with what is connected
- [ ] Every handbook page named above updated; `e2e/handbook-labels.spec.ts` green
- [ ] Spec status updated; ready for `live-value-export`
