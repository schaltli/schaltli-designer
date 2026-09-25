# The placeholder picker: `{` opens a list

Agreed 2026-09-25. Sub-module `placeholder-picker` of
docs/2026-09-25-text-placeholders.md (the language, its section "The
picker"), built after `placeholder-core`, whose parser, evaluator, number
format and topic declaration it uses. Designer only.

## Objective

Nobody should have to remember a topic path or the format letters. Typing
`{` in a field that takes placeholders offers what can go there - the
project's topics with an example each, the device's and the project's fields
- and then the formats with a preview of what the number will look like.
Picking one writes the placeholder, correctly spelled and closed. Until now
(since `placeholder-core` removed the "Insert" row) placeholders are typed by
hand.

## Behaviour

### Where

The two fields that take placeholders: a text's **Text**
(`label-properties.tsx`) and a bar's or slider's **Name**
(`level-indicator-properties.tsx`). Both are single-line inputs.

### Opening and closing

- Typing `{` opens the list. A second `{` right after it closes it again -
  `{{` is a literal brace, not a placeholder.
- **Ctrl+Space** opens it wherever the caret is inside an unclosed `{…`, to
  pick again after editing by hand.
- It closes on Esc, on leaving the field, on typing `}`, and when the caret
  moves out of the placeholder being written.
- The list sits under the field, starting at the caret's horizontal position
  (measured in the field's own font), so it points at where the text will
  go.

### Stage 1: what to insert

What has been typed since the `{` filters the list. Three sections, each
hidden when nothing in it matches:

| Section | Entries | Each shows |
|---|---|---|
| **Topic** | every project topic; a JSON topic also as one entry per declared field (`topic#field`) | the path, its type, its first example |
| **Device** | `model`, `id` | what it is ("the device's model") |
| **Project** | `name` | the project's name |

- The filter matches anywhere in the reference **and** in the example: `frisch`
  finds `schaltli/state/tank/1/name` whose example is «Frischwasser».
  Typing a namespace narrows to its section: `topic:tank` searches topics
  only.
- ↑/↓ move, Enter or Tab insert, the mouse clicks.
- Inserting replaces what was typed after the `{` with the full reference
  and closes it - `{topic:schaltli/state/tank/1/level}` - and leaves the caret
  right before the `}`, so a `:` can follow for a format, or → steps out.

### Stage 2: the format

- Typing `:` right after a complete topic reference (caret before `}` or at
  the end) opens the formats: `F0`, `F1`, `F2`, `N0`, `N2` - each with its
  preview on the topic's first example in the project's number format:
  `F1 → 72.4`, `N2 → 12'345.68`.
- Typing narrows (`N`, `F2`); any of `F0`-`F9`, `N0`-`N9` typed in full is
  accepted without picking.
- A topic without a numeric example shows the formats without preview,
  since there is nothing to format.
- Inserting completes the format and the closing brace if it is missing.

`??` is not offered in the list - it is typed; the hint under the field
names it (below).

### Problems in the field

A single-line input cannot underline part of its text, so problems are
listed **under the field**, one line each, in the field's hint position:

- red: a placeholder shown as written on the device - unknown namespace or
  field (`{device:name}` - reserved), reserved syntax, unterminated `{`;
- amber: a topic the project does not have yet - "added when you leave the
  field" (task 5 of core does that);
- nothing when all is well; then the hint reads *Type { for a value, e.g.
  {topic:…:F1}. ?? gives a fallback.*

(The parent spec asked for a red underline; this is its equivalent for an
`<input>`, agreed 2026-09-25.)

## Tech stack

React 19 / TypeScript. The list is the existing `Popover` + `Command`
(`components/ui/`, on `cmdk` 1.0.4, already used by `subtopic-picker.tsx`);
no new dependency. `lib/placeholders.ts` supplies the parse and the
formatting, `lib/placeholders.ts`'s `projectSeparators` the number format.

## Commands

```
Typecheck:  npm run typecheck
This spec:  npx playwright test e2e/placeholder-picker.spec.ts
Handbook:   npm run build --prefix handbuch
```

## Project structure

```
lib/placeholder-completion.ts                  pure: where the caret is (stage, query), the entries, what inserting writes
components/property-panel/fields/placeholder-text-field.tsx   TextField + picker + problem lines
components/property-panel/label-properties.tsx                uses it for Text
components/property-panel/level-indicator-properties.tsx      uses it for Name
components/property-panel/property-panel.tsx                  hands topics / device / project / separators down
e2e/placeholder-picker.spec.ts                                the tests
handbuch/objekte/anzeigen.md                                  the Platzhalter section gains the picker
```

The completion logic is kept pure and apart from the component, so it can be
tested without a browser, like the evaluator.

## Code style

As the repo; one example of the split:

```ts
// Where the caret is relative to placeholders: inside an unclosed `{`, and
// which stage - choosing a reference, or a format after `topic:…:`.
export function completionContext(text: string, caret: number): CompletionContext | undefined
```

## Testing strategy

- **Without a browser** (`e2e/placeholder-picker.spec.ts`): the context for a
  caret in many positions (`{`, `{{`, `{topic:ta`, `{topic:a/b:`,
  `{topic:a/b:F`, after `}`, inside a quoted fallback), the filtered entries
  (by path, by example, by namespace), and the text and caret an insert
  produces.
- **In the browser**: `{` opens the three sections; `{{` does not; typing
  filters; Enter inserts a topic with the caret before `}`; `:` offers the
  formats with a preview in the project's number format; Esc and leaving the
  field close it; Ctrl+Space reopens it; the problem lines appear for
  `{device:name}` and for an undeclared topic.

To be run on the new machine (decided 2026-09-25).

## Boundaries

- **Always:** keep the completion logic pure; keep focus in the input while
  the list is open (the list is navigated from the input's own keys); update
  the handbook with it.
- **Ask first:** a picker in any other field (a switch's state labels, a
  button's text) - they do not take placeholders yet.
- **Never:** insert anything the grammar reserves; change what a device
  receives - the picker only writes text.

## Success criteria

- [ ] Typing `{`, `tank`, Enter, `:`, `F0`, Enter in a text writes
      `{topic:schaltli/state/tank/1/level:F0}` with the example's preview shown
      on the way.
- [ ] `{{` stays a literal brace and opens nothing.
- [ ] `{device:name}` in a field shows a red line saying why.
- [ ] Every browser and non-browser test above passes.
- [ ] The handbook's Platzhalter section says how to use the picker.

## Settled (2026-09-25)

1. Problems are lines under the field, not an underline in the text.
2. The list offers `F0`, `F1`, `F2`, `N0`, `N2`; every other format is
   accepted when typed.
