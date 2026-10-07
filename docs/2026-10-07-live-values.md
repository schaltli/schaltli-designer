# Live values and combined topics

Worked out with the user on 2026-10-07, out of the navigator (issue #54):
a screen's icon there should show a state - the bulb lit while a light is
on, the flame filled while the heater runs, a bolt in the battery while it
charges. Looking at how the designer does that today turned up five
mechanisms for one idea, and the decision to replace them with one while
there are no released projects or devices to keep working. Issue #55.
Mockups: R1-R3 in the «Navigator 4.3B» canvas
(https://claude.ai/artifact/535dvb6DZkCfUWQGdZ4Ekg), images in #55.

Status: spec draft 2026-10-07, not yet agreed. No plan yet.

## Objective

Whatever changes with a value from the van - a text, an icon, later a
colour, which panel a switcher shows, what a switch reports - is set in
one way, the **live value**, and a non-programmer can set it without
reading the handbook. Conditions over several topics become **combined
topics**, computed on the device.

Today there are five mechanisms for this, each with its own rules:

| Today | Where | Rules |
|---|---|---|
| Placeholders in a text | `lib/placeholders.ts` | `{topic:a:F1}`, `?? fallback` |
| Live Icon | `live-icon`, `valueIconPairs` | operator + value → icon |
| Live Line | `live-line` | operator + value → colour |
| Switcher | `switcher`, a panel's «Shown when» | operator + value → panel |
| Switch | `switch` states | value → text, icon, `showAsOn` |

All five are «one value → a result». After this, there is one.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `live-value-core` | The data model, evaluation, formats, «is yes / is no»; shared test vectors | designer (`lib/`), then ported | - |
| `live-value-designer` | «Fixed / Live» on text and icon, the rule form, chips in a text, the test value | designer | `live-value-core` |
| `combined-topics` | Combined topics in the project, the picker, the check for circular references, evaluation order | designer | `live-value-core` |
| `live-value-export` | Export format, baked icons, combined topics in order, `systemGeneration` | designer | the three above |
| `live-value-firmware` | Evaluation and combined topics on 4.3B, Knob, PaperS3 | `schaltli-firmware` | `live-value-export` |
| `live-value-android` | The same in the app | `schaltli-android` | `live-value-export` |
| `live-value-migration` | Live Icon, Live Line, Switcher, Switch onto live values | designer, firmware, app | all of the above |

Build order: core → designer (text and icon) → export → firmware and
Android side by side → combined topics → migration of the other objects.
The navigator (#54) can be built before all this with fixed icons and
names; its state icons need `live-value-export` and the firmware part.

## Decisions

1. **Understandable before complete.** The construct covers the common
   90 % so that it is understood without the handbook. What does not fit
   does not belong in the designer; it belongs in Node-RED.
2. **No expression language and no code editor.** A live value is stored
   as data, like today's `valueIconPairs`. Nothing to parse on three
   platforms, nothing a typo can break. (An earlier draft that day had a
   pipe language, `{topic:x | gt(0) | yesno("an", "aus")}`; dropped once
   the form turned out to cover all of it.)
3. **A live value reads exactly one value:** a topic or a field of a JSON
   topic, a device field, a project field, or a combined topic.
   «`temp` < 1 and `rain`» in one live value does not exist.
4. **Rules are read top to bottom; the first that applies wins.** A rule
   is «If value *op* *operand* → *result*». After the rules come
   **Otherwise** (no rule applied) and **No value yet** (nothing has
   arrived). «No value yet» is not «off»: a heater nobody has heard from
   is not a heater that is off (issue #49).
5. **Operators:** `<` `<=` `>` `>=` `==` `!=`, **is yes**, **is no**.
   - is yes: `true`, `on`, `yes`, `1` (any case, trimmed), and any number
     ≠ 0.
   - is no: `false`, `off`, `no`, `0` (any case, trimmed), an empty
     message, and any number = 0.
   - `==` and `!=` compare trimmed text.
   - The four order operators compare numbers. **A value that is not a
     number does not match them** - it is no longer read as 0, as
     `evaluateCondition` in `lib/render-screen.ts` does today.
6. **A result can contain the value itself.** In a text result, `value` is
   a token (shown as a chip in the form) that inserts the value in the
   live value's format: «␣timer {value}». A live value without rules
   shows the value.
7. **An empty result leaves no trace.** A space that should disappear with
   it belongs inside the result, not in the text around the chip.
8. **Results are fixed.** An icon in a rule is picked in «Select Icon» and
   written into the rule; an icon name taken from a topic is not
   possible. So the export knows every icon a live value can show and
   bakes each one beforehand - the device never needs the internet or an
   SVG renderer.
9. **What can be live:** a text's chips and an icon now; a colour (a theme
   role as the result), a switcher's panel and a switch's state with the
   migration. The panel shows «Fixed / Live» wherever something can be
   both.
10. **A combined topic** is a topic the project defines and the device
    computes. It is *yes* when **all** or **any** of its conditions apply,
    like a mail filter; each condition is shaped like a rule («`rain` is
    yes», «`outside_temp` < 1»). Flat: no nesting inside one.
11. **Combined topics nest by name.** A condition may read another
    combined topic: `frost` = all: `outside_temp` < 1; `nass` = any:
    `rain` is yes, `humidity` > 90; `glaette` = all: `frost` is yes,
    `nass` is yes. Every step stays a flat form, and every intermediate
    result has a name one can check on its own.
12. **No circular references.** A combined topic may not, through others,
    refer back to itself. Prevented in three places (see «Combined
    topics»). At most 8 levels.
13. **Combined topics are read-only.** Usable wherever a topic is read:
    live values, other combined topics, a switch's state, a switcher's
    panels. Not where something is written: a slider's, dial's or
    switch's write topic, «send-mqtt», hardware buttons.
14. **Namespace `combined:`** beside `topic:`, `device:`, `project:`, so a
    combined topic is never mistaken for an MQTT topic of the same name.
    The picker shows them as a group of their own.
15. **Combined topics stay on the device.** Each device computes its own
    and publishes nothing: three displays with the same project would
    otherwise overwrite each other. What the van itself needs belongs in
    Node-RED.
16. **Several chips per text.** A text holds any number of live values,
    each reading its own value: «Heizung [status][timer] · [innen] °C».
    The rule «one value» is per live value, not per text.

## Behaviour

### The live value

```ts
interface LiveValue {
  id: string
  source: Reference                 // { namespace: "topic" | "device" | "project" | "combined", path }
  format?: ValueFormat              // how `value` is written
  rules: Rule[]                     // top to bottom
  otherwise?: Result                // absent: the value, formatted
  noValueYet?: Result               // absent: empty
}
interface Rule { op: "<" | "<=" | ">" | ">=" | "==" | "!=" | "yes" | "no"; operand?: string; result: Result }
type Result =
  | { kind: "text"; parts: (string | { value: true })[] }   // "␣timer ", {value}
  | { kind: "icon"; icon: string }                          // "mdi:snowflake-alert", "upload:…"
  | { kind: "role"; role: string }                          // later: a colour
type ValueFormat =
  | { kind: "asIs" }
  | { kind: "number"; decimals: number; grouped: boolean }  // the project's separators
  | { kind: "duration"; pattern: "h:mm:ss" | "h:mm" | "m:ss" }   // seconds in; open question 3
```

Evaluation, the same on all three platforms:

1. No value has arrived → `noValueYet` (absent: empty).
2. The rules in order; the first that matches gives the result.
3. None matched → `otherwise` (absent: the value in its format).
4. A text result's `value` token → the value in its format. A number
   format on a value that is not a number writes the value as it is.

Rounding, separators and «-0.00 is 0.00» keep the rules of today's
`formatNumber` (`lib/placeholders.ts`): on the digits as written, half away
from zero, never through a float.

### Chips in a text

- A chip shows the source's short name and the result at the topic's
  example: «timer ␣timer 3:23:18». The field reads almost like the device.
- A click on a chip opens its live value under the field; the chip stays
  marked. A click on another chip switches to it. The header reads «Live
  value 2 of 3», with ‹ and › to the chip before and after in the same
  text.
- Keyboard: the arrow keys step over a chip as a whole; Enter on a chip
  opens it; Del removes it; Esc returns to the text.
- A new chip comes from `{` or «+ Value»: a search over Topics, Combined,
  Device and Project. Enter inserts the chip and opens its live value.
- How a chip is stored inside the text: open question 1.

### The rule form

- «Fixed / Live» where something can be both. «Live» shows the source
  picker, the format («Value shown as»), the rules, Otherwise, No value
  yet and «+ Add rule».
- A topic of type boolean gets «If value is yes» and «If value is no»
  proposed.
- Icons in rules are chips with a thumbnail; a click opens «Select Icon».
- The preview has a **test value** (a slider for numbers, a text field
  otherwise, «No value has arrived yet» as a checkbox) and marks the rule
  that applies. For an icon it also lists «This rule can show»: every
  icon the export will bake.

### Combined topics

- Listed with the project's topics, made with «Add combined topic»: a
  name, «all» or «any», conditions, «+ Add condition».
- **Circular references**, three places:
  1. Editing: the picker in a condition does not offer a combined topic
     that would create one, nor the topic itself; its tooltip says why
     («uses glaette»).
  2. Opening and exporting: a project that has one anyway (edited by hand)
     opens; the topics involved get a red line, and the export refuses,
     naming the chain: «glaette → nass → glaette».
  3. Device: the export writes combined topics in evaluation order, each
     after everything it uses. The device evaluates only in that order
     and treats a reference to a later one as «no value yet»; it can never
     loop.
- **No value yet:** «any» is yes as soon as one condition is yes, «all»
  is no as soon as one is no; otherwise no value until every source has
  one.
- **Recomputing:** a message on a source recomputes the combined topics
  that depend on it, in order, and goes on only where a result actually
  changed. To everything downstream this looks like an incoming message;
  partial redraw is untouched. The export ships the dependency list.
- **Delete and rename:** a combined topic still in use cannot be deleted
  (as a master with screens today); renaming carries every reference.
- The preview computes combined topics from their sources' examples and
  test values: moving `outside_temp` visibly changes `frost` and then
  `glaette`.

### Export and devices

- Each live value is exported as data next to the object it belongs to;
  each icon result as a baked bitmap per size and colour, referenced by
  index.
- Combined topics: `combinedTopics[]`, in evaluation order, with their
  dependents.
- A new minor system generation. Firmware or an app that does not know it
  is warned about by the designer on deploy, as for placeholders and
  popups (`lib/system-generation.ts`).
- PaperS3: an icon or text that changes state costs a partial refresh,
  as any value does today.

## What it replaces

- **Live Icon** as an object of its own → an icon with a live value; its
  `valueIconPairs` become rules.
- **Live Line**'s conditions → a line with a live colour.
- **Switcher**, a panel's «Shown when» → per panel a live value that is
  yes or no.
- **Switch** states → its text and icon as live values on its state topic.
- **Placeholder formats** `:F1`, `:N0` and `??` → the live value's format
  and «No value yet». `device:` and `project:` stay sources.
- **Navigator (#54)**: the state icons and dynamic names; «a light is on
  somewhere» is a combined topic with «any».

## What the code says (checked 2026-10-07)

- `lib/comparison-operators.ts` already has the six operators in one
  place, after four drifting copies. «is yes» and «is no» join it.
- `evaluateCondition` in `lib/render-screen.ts` reads a non-number as 0
  for the order operators - changed by decision 5.
- `lib/placeholders.ts` and `lib/placeholders/vectors.json` are the model
  for one rule set on three platforms; the live value's vectors go next
  to them.
- Live Text went into Text the same day (`liveTextToText` in
  `lib/object-types.ts`); Live Icon is the next one to go the same way.
- `lib/system-generation.ts`: placeholders are 1.2, popups 1.3.

## Tech stack

Designer: Next.js / React 19 / TypeScript, Playwright. Boards: PlatformIO,
Arduino-ESP32, `ColorScreenRenderer`. Android: Kotlin, Jetpack Compose. No
new dependency.

## Commands

```
Typecheck:   npm run typecheck
Designer:    npx playwright test e2e/live-values.spec.ts e2e/combined-topics.spec.ts
Full:        npm run test:all
```

## Project structure

```
lib/live-value.ts                     → new: model, evaluate(), formats, is yes / is no (pure)
lib/live-value/vectors.json           → new: shared cases for designer, firmware, app
lib/combined-topics.ts                → new: evaluation order, circular-reference check, dependents (pure)
lib/comparison-operators.ts           → «yes» / «no» added
lib/render-screen.ts                  → draws through evaluate()
components/property-panel/            → «Fixed / Live», the rule form, chip editor, test value
components/topic-selector*            → «Combined» group, read-only fields only
lib/project-zip.ts, lib/android-export.ts, lib/asset-export.ts → live values, baked icon results, combinedTopics[]
lib/system-generation.ts              → LIVE_VALUE_GENERATION
docs/device-contract.md               → live values, combined topics
handbuch/objekte/anzeigen.md, handbuch/objekte/gemeinsames.md, handbuch/designer/topics.md
```

## Testing strategy

- `lib/live-value/vectors.json`, run by the designer, the firmware and
  the app alike: every operator on numbers, on text, on a non-number;
  is yes / is no on every listed spelling and on numbers; no value vs.
  empty message; first rule wins; Otherwise absent and present; `value`
  in a result with each format; an empty result.
- `e2e/live-values.spec.ts`: «Fixed / Live»; the boolean proposal; a
  chip's editor from a click, ‹ › and the keyboard; `{` inserts; the test
  value marks the rule that applies; «This rule can show» lists every
  icon; export bakes every icon of an icon live value.
- `e2e/combined-topics.spec.ts`: all / any and no value yet; nesting;
  the picker leaves out what would close a circular reference; a project
  with one opens and refuses to export, naming the chain; a combined
  topic in use cannot be deleted; a rename carries the references; never
  offered in a write field.
- HIL: each board fixture and the Android fixture gets a text with three
  chips (yes/no, a duration that empties at 0, a number) and an icon with
  threshold rules, checked in every state including «no value yet»; and a
  two-level combined topic driving an icon.

## Boundaries

- **Always:** one rule set, three implementations held to the same
  vectors; handbook updated in the same piece of work.
- **Ask first:** anything that would let one live value read two values;
  a result computed from a topic (an icon name, a colour value).
- **Never:** an expression language; combined topics published to the
  broker.

## Success criteria

- [ ] Someone who does not program makes the frost warning (R1) without
      the handbook.
- [ ] «Heizung läuft timer 3:23:18 · 21.4 °C», «Heizung aus · 18.2 °C» and
      «Heizung ? · – °C» come from one text on every device.
- [ ] A navigator entry's icon follows a combined topic «any light on».
- [ ] Live Icon, Live Line's conditions, «Shown when» and the switch's
      states are gone from the designer, and each does what it did as a
      live value.

## Not doing

- **Several values in one live value.** Harder form, four «no value yet»
  cases, intermediate states between two messages, more redraw, more
  tests - and combined topics cover the need.
- **An expression or pipe language**, a code editor, «Edit as code».
- **Combinations in the bridge.** The bridge is our code and is replaced
  on every update; a user could not keep a combination there.
- **Noted as a possible extension, not planned:** a rule that checks a
  different topic than the one the chip shows (in the timer chip: «If
  `heizung/status` is no → empty»). One comparison per row, no «and».
- **Combined topics that compute numbers** (`sum`, `min`, `max`) - a
  third kind beside all / any, later; then also usable by bar and gauge.

## Open questions

1. How a chip is stored in the text: a reference such as `{live:<id>}` to
   a live value kept on the object, or the live value inline.
2. A colour as a result: theme roles only, or also a fixed colour.
3. Durations: does a timer send the time left or the end time? An end
   time needs the device to count by itself, with the time of day (NTP).
4. Templates («Frostwarnung», «Tank fast leer») and what blocks and
   discovery bring ready-made.
5. Whether a switch's state as a live value is enough, or whether «is
   on» needs to stay a property of its own.
