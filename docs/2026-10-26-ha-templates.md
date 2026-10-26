# Home Assistant templates, translated

Asked for by the user on 2026-10-26, after the survey of what discovery
templates need (`docs/2026-10-26-template-survey.md`). The user asked whether
a Jinja interpreter on the devices could do it; this spec says why not, and
what instead.

Status: draft, for the user's decision.

## Objective

An entity whose discovery config carries templates becomes a block like
any other, wherever its templates say something the designer already
knows how to store. Today only no template, `{{ value }}` and a path into
the JSON are followed (`lib/ha-discovery.ts`); every other template makes
its part read-only or skipped.

The user never sees Jinja. A template becomes what the designer's editor
already shows - a topic chip with a format, a fallback, a live value's
rules, a switch's states - and can be changed there like anything placed by
hand. What cannot become one stays unsupported, with its reason in the
Block menu as today.

## Decisions

1. **No Jinja on the devices.** The live values decided «no expression
   language … nothing to parse on three platforms» (`docs/2026-10-07-live-values.md`,
   decision 2 and «Not doing»). That holds: the designer translates
   templates when it reads the discovery, into data. A template is never
   stored and never exported.
2. **Translate into what exists; add as little as can be.** Most of what
   templates do has a counterpart already (table below). Two things do not,
   and are added as data, not as a language: a number scaled (a third kind
   of combined topic, the one the live values spec put off as «later»), and
   a command with a place for the value.
3. **What can be written with few values is rendered by the designer.** A
   switch has two states, a button one, a select, a lock or a mode a known
   list. The designer renders the command template for each and stores the
   finished payloads, as it stores `payload_on` today. No device change.
4. **The designer's Jinja is a subset, in TypeScript only.** It parses and
   evaluates what the survey found; anything else is a reason, not an
   error. It is a tool of the import, like `lib/json-path.ts`.
5. **Entities stay free controls** (decided 2026-10-26, «HA-Entitäten frei
   zerlegt»): nothing records which template a control came from.

## What a template becomes

Reading (`value_template`, `state_value_template`, `position_template` …):

| In the template | Becomes | Device change |
| --- | --- | --- |
| none, `{{ value }}`, `{{ value_json.a.b }}`, `value_json["a"]`, `value_json.a[0]` | the topic, `topic#a.b` | none (today) |
| `\| float`, `float(value)` alone | nothing: a device reads numbers from text anyway | none |
| `\| int` | the format `F0`, where the value is shown as text; Jinja cuts the decimals off where `F0` rounds, so 21.7 shows 22, not 21 | none |
| `\| round(n)`, on a value shown as text | the format `Fn` | none |
| `\| default(x)`, `x if value_json.a is defined` | the fallback `?? x` | none |
| `'on' if value_json.a else 'off'`, `"OFF" if value_json.a == 0 else "ON"`, `{% if … %}a{% elif … %}b{% else %}c{% endif %}` comparing the value with constants | a switch: its states' read values (the inputs that give `state_on`, `state_off`); a text: a live value with one rule per branch | none |
| `value_json.a / 1000`, `value * 3.6`, `\| multiply(2.55)`, `+ 273.15` - one value times a constant plus a constant | on a level whose read and write are each other's inverse (brightness on 0-255 shown in percent): the level's range, as `brightness_scale` today; elsewhere a **scaled topic** (new) | for scaled topics |
| text around one value: `{{ value_json.a }} %` | a live value with that text and the value in it | none |

Writing (`command_template`, `set_position_template` …):

| In the template | Becomes | Device change |
| --- | --- | --- |
| `{{ value }}` | the payload as it is (done, `fe3cb80`) | none |
| any template, on a switch, button, select, lock, mode, cover button | the payloads rendered by the designer, one per value | none |
| a number put into text: `{"brightness": {{ value }}}`, Shelly's `{"id":1,…,"params":{"value":{{ value }}}}` | a level with a **write payload** (new): text with a place for the value | yes |
| the number scaled first: `{{ value * 1000 }}`, `{{ (value * 2.55) \| round(0) }}` | the inverse of the read's range or scale where there is one; else a write payload with a scale | yes |
| `position`, `tilt_position` in a cover's templates | the percentage, as Home Assistant passes it beside `value` (the position in the cover's own range) | - |

## What stays unsupported

With the reason the Block menu shows (wording to settle when building):

- **What only Home Assistant knows:** `states()`, `is_state()`,
  `state_attr()`, `this`, `area_name()`, `device_attr()`, `expand()`.
  Entity ids are Home Assistant's own; MQTT does not carry them.
  Reason: «the value template: states()».
- **Time:** `now()`, `utcnow()`, `as_timestamp()`, `timestamp_local`,
  `timestamp_custom`, `relative_time()`. Would need a clock and time zone on
  every device; rare (a «last seen»).
- **Several values in one:** `{{ value_json.r }},{{ value_json.g }},…`,
  `[a, b] | max`. One control reads one value (live values, «Not doing»).
- **The rest of Jinja:** `{% for %}`, `{% set %}` beyond naming one value,
  `namespace`, `selectattr`, `map`, `zip`, `regex_*`, `.split()`,
  `truncate`, macros. A handful of templates in the survey (ebusd's version,
  some of Zigbee2MQTT's).
- **A number written through a computation that is not linear**, or a
  command template that builds more than one place for values.
- **A lock's `{{ code }}`** until the devices have a keypad.

## The two new pieces

### Scaled topic

A third kind of combined topic beside «all» and «any»: one source (a topic,
a JSON field, another combined topic), a factor and an offset; it reads as
`source × factor + offset`. Made by the import where a template scales, and
by hand with «Add combined topic» like the others. Read like any topic
(`combined:<name>`), so a text, a gauge, a bar or a live value can show it.

Device: computed like a combined topic, recomputed when its source changes.
The arithmetic is decimal, as the formats are (`docs/device-contract.md`:
«never through a float»): see open question 1.

### Write payload

On anything that writes a number (a level, a slider, an arc): an optional
text with one place for the value, e.g. `{"brightness":{value}}`, and an
optional factor and offset applied before it is put in. Absent: the number
alone, as today. The value is written in plain decimal, `.` as separator,
never the project's number format.

Device: the place is the only thing a device substitutes; `{{` and `}}`
are literal braces, as in placeholders.

## Stages

1. **Designer only.** The TypeScript subset (parse, evaluate, translate),
   rendered payloads for writes with few values, formats, fallbacks,
   rules, ranges. No firmware, no app, no new system generation. Covers:
   Shelly gen2 switches and modes, Shelly gen1 effects, Z-Wave JS's
   `if … else`, the rounding of rtl_433 and OpenMQTTGateway where nothing is
   scaled, Zigbee2MQTT's defaults.
2. **Scaled topics and write payloads**, in the designer, the firmware
   (4.3B, Knob, PaperS3) and the Android app, held to shared vectors as
   placeholders and live values are; a new minor system generation. Covers:
   rtl_433's conversions, OpenMQTTGateway's intervals, Shelly gen2 numbers
   over RPC, Zigbee2MQTT's cover position.

Stage 1 stands on its own: stage 2 can wait for a need.

## Testing strategy

- Fixtures from the survey's sources, real configs with their templates,
  in `e2e/fixtures/ha-discovery/`: each translated as the table says, or
  unsupported with its reason.
- The subset itself: one case per construct, parsed and evaluated against
  what Home Assistant renders (the expected values taken from Jinja, not
  from our code).
- Stage 2: `vectors.json` cases for scaling and write payloads, run on all
  three platforms; a placement test per new piece in `e2e/bausteine.spec.ts`;
  the HIL lanes publish to a scaled topic and read a written payload.

## Boundaries

- **Always:** a template the subset does not know is a reason, never a
  guess; the designer shows the translation, never the template.
- **Ask first:** anything that would put a template, or an expression, on
  a device; a fourth new piece beside the two above.
- **Never:** a Jinja editor or «Edit as code»; storing the template.

## Open questions

1. **Decimal arithmetic for scaling.** Formats round on the payload's
   digits, never through a float. A factor of 0.001 or 1000 is a shift of
   the point; 3.6 or 2.55 are exact in decimal too; `/ 60000` and `/ 2.55`
   are not. Proposed: factor as a fraction (numerator, denominator), the
   result rounded to the decimals the import takes from `round(n)` or the
   unit, else 3.
2. **`default` and a missing JSON field.** `?? x` applies while nothing has
   arrived; Jinja's `default` applies when the field is missing from a
   message that did. What a device shows today for a missing field is to
   check before stage 1 maps one onto the other.
3. **Where a translation came from.** Decision 5 keeps nothing; the import
   might still name the template in the Block menu's tooltip, so a user
   who knows Home Assistant sees why a rule or a factor is there.
