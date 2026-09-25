# Placeholders in texts: `{topic:a/bc:F2}`

Agreed 2026-09-25. The second module after
`block-topics` (docs/2026-09-25-block-topics.md, which declares the name
topics this one binds labels to).

## Objective

A text on a screen can carry live values. `Frischwasser {topic:schaltli/state/tank/1/level:F0} %`
reads «Frischwasser 72 %» on the device and follows the tank; a level's
label `{topic:schaltli/state/tank/1/name ?? "Frischwasser"}` follows the van
when a tank is renamed. Running text with values becomes possible, and a
block's label stops being a copy of a name that can go stale.

Decided with the user on 2026-09-24/25, in this order:

1. Texts may contain placeholders; everything outside `{…}` is literal.
2. Syntax borrowed from C# composite formatting, not invented: `{…:F2}` for
   the number format, `??` for "no value yet".
3. **A namespace is mandatory**: `topic:`, `device:`, `project:`. Clearer and
   consistent, and it makes the first `:` unambiguous.
4. The seven export placeholders (`{screen}`, `{project}`, `{screen_width}`,
   `{screen_height}`, `{export_date}`, `{export_time}`, `{export_datetime}`)
   are **removed**, not kept as aliases - they were never released.
5. The grammar reserves room for expressions later (comparisons,
   `(… ? … : …)`, arithmetic, functions) so that none of them breaks what is
   written today.
6. Typing `{` opens a picker with three sections, Topic, Device, Project.

## The language

### Grammar (v1 implements the unshaded part)

```
text        = { literal | "{{" | "}}" | placeholder }
placeholder = "{" expr [ ":" format ] "}"
expr        = reference [ " ?? " fallback ]            ; v1
            | "(" … ")" | reference op … | name "(" … ")"   ; reserved
reference   = namespace ":" path
namespace   = "topic" | "device" | "project"          ; more may follow
path        = 1*( any char except whitespace, "{", "}" )  ; see "format" below
fallback    = number | '"' { any char except '"' } '"'
format      = ( "F" | "N" ) digit                      ; F0..F9, N0..N9
```

- **Where the format starts.** A path may itself contain `:` (MQTT allows
  it). The format is the part after the **last** `:` inside the braces, and
  only if it matches `F0`-`F9` or `N0`-`N9`; otherwise the `:` belongs to the
  path. `{topic:a/bc:F2}` is topic `a/bc` in format F2; `{topic:a:b}` is topic
  `a:b`.
- **Whitespace** ends a path. It is required around `??` (and, later, around
  every operator) - that is what keeps `topic:a/bc` a topic when `/` one day
  divides.
- **`{{` and `}}`** are a literal brace, as in C# and Python.

### What it shows

| Text | value `75.193` | no value yet |
|---|---|---|
| `Tank {topic:a/bc}` | `Tank 75.193` | `Tank ` |
| `Tank {topic:a/bc:F2}` | `Tank 75.19` | `Tank ` |
| `{topic:…/name ?? "Frischwasser"}` | the name | `Frischwasser` |
| `{topic:a/bc ?? 0:F2} %` | `75.19 %` | `0.00 %` |
| `{topic:a/bc:N0}` with `12345.6` | `12,346` | `` |

- **No value yet** means no message has arrived on that topic since the
  device connected - C#'s `null`. An empty message that did arrive is an
  empty value, shown empty, and `??` does not apply (as in C#).
- **F*n***: fixed point, *n* decimals, rounded half away from zero
  (75.195 → 75.20, -2.5 → -3 at F0). **N*n***: the same with a thousands
  separator. A value that is not a number is shown as it is, whatever the
  format.
- **Which separators** is a project setting - C# does the same through its
  culture (decided 2026-09-25: a fixed choice would be wrong for half the
  users). The project stores **two characters**, `settings.decimalSeparator`
  and `settings.thousandsSeparator`; that is all a device reads, so a new
  country never needs firmware. They apply to every placeholder in the
  project, on every device.
- **In Settings** a **Number format** dropdown sets both at once, and
  **Custom** unlocks two fields to type them freely. The dropdown shows a
  preset whenever the two characters happen to match one:

  | Number format | decimal | thousands | `F2` of 12345.678 | `N2` of 12345.678 |
  |---|---|---|---|---|
  | Schweiz (default) | `.` | `'` | `12345.68` | `12'345.68` |
  | Deutschland | `,` | `.` | `12345,68` | `12.345,68` |
  | Österreich | `,` | space | `12345,68` | `12 345,68` |
  | English | `.` | `,` | `12345.68` | `12,345.68` |
  | Custom | typed | typed, may be empty | | |

  The two may not be the same character (`1.234.5` could not be read), and
  the decimal separator may not be empty.

  A value is only ever reformatted when a format is given; `{topic:a/bc}`
  shows the message exactly as it came. A per-placeholder culture is left
  for later (reserved, like expressions).
- **Rounding works on the digits the message carries**, not on a binary
  float: 75.195 is 75.19499… as a double, and three platforms rounding
  doubles would disagree (C#'s own F2 prints 75.19 for it since .NET Core
  3.0). A payload is decimal text, so it is rounded as decimal text, and all
  three evaluators give 75.20.
- **Unknown or reserved** (an unknown namespace, a field that does not
  exist, an expression v1 does not do, an unterminated `{`): the placeholder
  is shown as written, braces included - visibly wrong rather than silently
  empty. A device with older firmware meets a newer text the same way.

### Namespaces in v1

| Reference | Is | Example | Resolved |
|---|---|---|---|
| `topic:<path>` | the last value on that MQTT topic; `topic#json.path` as everywhere else in the designer | `{topic:schaltli/state/tank/1/level:F0} %` → `72 %` | live, on the device |
| `device:model` | what the device is: a board's model from its DDF, a phone's marketing name | `{device:model}` → `Waveshare Knob-Touch LCD 1.8`, `HUAWEI P20 Pro` | on the device |
| `device:id` | the device's instance id, the one its topics sit under (`schaltli/<id>/…`) | `{device:id}` → `gleaming-harvest` | on the device |
| `project:name` | the project's name as saved | `{project:name}` → `Van Sommer 2026` | at export, baked in |

In the designer's preview a `device:` reference shows the device the project
is for as the gate lists it; `project:` shows the open project.

**Reserved, not in v1** (checked 2026-09-25): `device:name` - no device can
be given a name yet; boards announce none and have no field for one in their
setup portal, a phone announces its marketing name (issue #19, which also
proposes the instance id as the default name). `project:version` - wanted in
the project list and the window title as well (issue #18). Both are shown as
written until then, like any reserved reference.

`project:` fields are fixed at export, so they are replaced in the exported
text and never reach a device as a placeholder. Which further fields
`device:` and `project:` get is left for later; each is an addition.

## Where placeholders apply

- The `text` object's text.
- The label of `bar`, `slider` and `gauge` (the level's name line).
- Not (yet): a switch's state labels, a button's text, `live-text`'s prefix
  and suffix. **`live-text` stays** as it is; whether it goes later, with a
  migration of saved projects into texts, is decided once placeholders run on
  every device.

## Behaviour per part

### Rendering - designer, firmware, Android

One evaluator per platform, the same rules, checked against the same test
vectors (below):

| Renderer | Where | Note |
|---|---|---|
| Designer preview | `lib/` (new `placeholders.ts`), used by `render-label.ts` and the level header | live values, or examples in Simulation |
| Firmware - knob, 4.3B, PaperS3 | one shared `ColorScreenRenderer`; new `Placeholders.cpp` | knob: its topic collection and partial redraw learn the new references; 4.3B and PaperS3 subscribe to all project topics already |
| Android | new `data/Placeholders.kt`, used by the text and level views | `TopicCollector` learns the references |
| E-paper (retired) | not updated | shows placeholders as written - so the designer warns when a project for it uses them |

A text whose value changes is redrawn like any bound object. A level whose
label comes from a topic keeps its header row even while the value is
missing, so it does not jump when the name arrives (this is why block
labels carry a `??` fallback).

### Subscriptions and topics

Every `topic:` referenced in a text or label is subscribed on every device
and declared in the project: the designer adds a missing one when the text
is committed (type `text`, no examples), as a block does.

### Blocks

Blocks write their label as a placeholder with the name found (or the
fallback) behind `??`:

- Tank, Dimmer: the level's label is `{topic:schaltli/state/<g>/<n>/name ?? "Frischwasser"}`.
- Switch: the text beside it is the same placeholder, and the text box takes
  all the width beside the switch rather than the width of today's name - a
  longer name arriving later would otherwise be cut off.
- Battery: no name topic; its label stays literal.

### The picker

- Typing `{` in a placeholder-capable field opens a list at the caret with
  three sections: **Topic** (the project's topics with type and first
  example; JSON topics with their fields), **Device** (`model`, `id`),
  **Project** (`name`).
- Typing filters across the whole reference, including the example value
  (typing `frisch` finds `…/tank/1/name` whose example is «Frischwasser»).
- ↑/↓ choose, Enter or Tab insert `{topic:…}` with the closing brace, the
  caret after it; Esc closes.
- After a `:` that follows a complete reference, the formats are offered with
  a preview on the topic's first example (`F2 → 75.19`).
- A placeholder the designer cannot resolve (reserved syntax, unknown
  namespace or field, a topic not in the project) is underlined in red, with
  the reason on hover.
- The "Insert" button row in the text panel is removed; the picker replaces
  it.

## Tech stack

Designer: Next.js / React 19 / TypeScript, Playwright. Firmware: C++ /
PlatformIO, ESP32 (knob, 4.3B, PaperS3). Android: Kotlin / Compose, JUnit.
No new runtime dependency; the firmware gains a PlatformIO `native` test
environment (Unity, which PlatformIO ships).

## Commands

```
Designer   npm run typecheck · npx playwright test e2e/placeholders.spec.ts · npm run test:e2e
Firmware   pio test -e native · pio run -e waveshare-touch-lcd-4v3b (and the knob, PaperS3 envs)
Android    gradle testDebugUnitTest
HIL        npm run test:all (with boards connected)
```

## Project structure

```
designer  lib/placeholders.ts                    evaluator + parser (TS)
          lib/placeholders/vectors.json          the shared test vectors - the one source
          components/property-panel/fields/…     the picker, red underline
          components/canvas/renderers/…          label + level header use the evaluator
          lib/bausteine.ts                        labels as placeholders
          project-settings-dialog.tsx            Number format: presets + Custom, stored as settings.decimalSeparator / thousandsSeparator
          lib/project-zip.ts, android-export.ts  project: baked in; old placeholders gone
          docs/device-contract.md                the language, for device authors
firmware  src/project/Placeholders.{h,cpp}       evaluator (C++)
          test/test_placeholders/                native tests over a copy of vectors.json
android   data/Placeholders.kt, TopicCollector   evaluator (Kotlin)
          app/src/test/…/PlaceholdersTest.kt      over a copy of vectors.json
handbuch  designer/…                              how to write one, the picker
```

The vectors file is copied into the firmware and Android repos; each repo's
test also checks that its copy is byte-identical to the designer's when the
designer is checked out beside it, and skips that check otherwise.

## Code style

As each repo already writes: comments say why, dates for decisions. One
evaluator shape on all three platforms, so a fix in one is found in the
others:

```ts
// No value yet is C#'s null: `??` applies. An empty message that did arrive
// is an empty string and stays empty (docs/2026-09-25-text-placeholders.md).
export function resolve(text: string, lookup: (ref: Reference) => string | undefined): string
```

## Testing strategy

- **Shared vectors** (`vectors.json`): input text, a map of values (with
  "never arrived" distinct from ""), the two separators, expected output.
  Covers every row of the tables above, all four presets and a custom pair, rounding, `{{ }}`, unknown namespace, reserved syntax, `:` in a
  path, JSON paths, unterminated `{`. Run by the designer (Playwright, no
  browser), the firmware (`pio test -e native`) and Android (JUnit).
- **Designer e2e**: the picker (open on `{`, sections, filter, insert, format
  preview), red underline, preview shows live and example values, a block's
  label is a placeholder and shows the name, auto-declared topics.
- **Device render**: the existing HIL and conformance render comparison
  gains a specimen with placeholders in a text and a level label, so the
  firmware's and Android's pixels are held to the designer's.

## Boundaries

- **Always:** keep the three evaluators in step through the vectors; update
  `docs/device-contract.md` and the handbook with the language; releases of
  firmware and app are part of shipping this.
- **Ask first:** removing `live-text`; any expression beyond v1; changing
  the e-paper firmware; a new namespace field.
- **Never:** evaluate anything beyond the grammar (no `eval`, no script
  engine on a device); let a placeholder publish anything.

## Success criteria

- [ ] All vectors pass on all three platforms.
- [ ] A Tank block placed on the van shows «Frischwasser» on the knob, the
      4.3B, the PaperS3 and the phone; renaming the tank on the Pekaway
      changes the label on each without a deploy.
- [ ] `Wasser {topic:schaltli/state/tank/1/level:F0} %` on a screen follows
      the tank on every device.
- [ ] Typing `{` offers the three sections; picking a topic and `:F2` writes
      `{topic:…:F2}`.
- [ ] The seven old placeholders are gone from the designer, the export and
      the handbook.
- [ ] Firmware and Android released with it.

## Open questions

1. ~~`device:name`~~ - settled 2026-09-25: no device has a name of its own
   yet, so v1 offers `device:model` and `device:id`; `device:name` waits for
   issue #19, `project:version` for issue #18.
2. ~~Thousands separator~~ - settled 2026-09-25: a project setting, see
   *Number format*. Still open: Österreich with a plain space or a narrow
   no-break space (U+202F)? The bitmap fonts on the boards may not carry
   U+202F; the draft uses a plain space.
3. ~~Split~~ - agreed 2026-09-25. Built as sub-modules, each shippable on
   its own, in this order: `placeholder-core` (grammar, vectors, designer evaluator and
   preview, old placeholders removed) → `placeholder-picker` (designer
   editing) → `placeholder-devices` (firmware + Android + releases) →
   `placeholder-blocks` (block labels as placeholders, once devices can show
   them). Agree?
