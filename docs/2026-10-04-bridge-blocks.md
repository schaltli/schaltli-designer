# Blocks described by the bridge

Idea agreed with the user on 2026-10-04 (session «raster-slider»), spec
2026-10-04. Builds on docs/2026-09-30-block-discovery.md. Its sibling is
docs/2026-10-04-ring-adjust.md, whose ring can adjust the switcher this
spec builds.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `block-description` | Reads Schaltli block descriptions off the broker and turns each into a catalog entry, parts with a condition included | designer (`lib/`) | - |
| `block-shown-when` | Builds the parts that carry a condition as a switcher with one panel per value, inside the placed block | designer (`lib/bausteine.ts`) | `block-description` |
| `block-menu` | The Block menu reads descriptions beside Home Assistant's configs; a description hides the entries it covers | designer (UI, hook) | `block-description` |
| `bridge-blocks` | The VanPi bridge publishes descriptions of the MaxxFan and the heater, and the heater's view topic | `integrations/vanpi/` | - |

Build order: `block-description` → `block-shown-when`, `block-menu`;
`bridge-blocks` alongside, its output checked through `block-description`.

## Objective

A user picking the MaxxFan in the Block menu gets a finished block: the
mode, in auto mode the temperature slider only, by hand the speed slider
only (10-100 in tens), off no slider at all, the cover and the airflow.
Today they get Home Assistant's climate: a mode, a temperature always
shown, and the speed as ten buttons, because a climate's `fan_modes` are
texts and Home Assistant does not say whether they are a scale.

The device's knowledge lives in the bridge, which knows the MaxxFan. The
designer stays general: it learns a second, small description format of
Schaltli's own, never a word about Pekaway or a van. Anyone publishing that
format gets the same.

**The rule (decided 2026-10-04): the bridge supplies what belongs to the
device, the designer decides what belongs to the screen.** The description
says which parts there are, how each is read and written, its range, and
when it is shown. Size, colour, font, arrangement and the look of each part
(slider or dial, buttons) stay the designer's, as for any Home Assistant
entity.

Decided with the user 2026-10-04:

1. **A format of our own**, small and versioned, mapped onto the
   designer's internal `CatalogEntry` the way Home Assistant configs are.
   The internal type stays free to change.
2. **One condition per part, on one topic.** Where visibility depends on
   two things - the heater's mode and preset - the bridge publishes a view
   topic that combines them. The designer builds one switcher, never
   switchers in switchers.
3. **A description replaces the entries it covers** in the Block menu. It
   names them by their Home Assistant `unique_id`.

## Behaviour

### The format (`block-description`)

Retained, JSON, on `schaltli/blocks/<id>/config`; an empty payload removes
it. The prefix is fixed: it is our own format, not a convention others
configure. Keys follow Home Assistant's spelling where the meaning is the
same, so a publisher who knows one knows the other.

```json
{
  "version": 1,
  "name": "MaxxFan",
  "icon": "mdi:fan",
  "device": { "identifiers": ["schaltli-vanpi"], "name": "VanPi" },
  "covers": ["schaltli-vanpi-maxxfan", "schaltli-vanpi-maxxfan_cover", "schaltli-vanpi-maxxfan_airflow"],
  "parts": [
    { "name": "Mode", "kind": "choice",
      "state_topic": "schaltli/state/maxxfan/hvac_mode", "command_topic": "schaltli/cmnd/maxxfan/mode",
      "options": [{ "value": "off", "label": "Aus" }, { "value": "fan_only", "label": "Hand" }, { "value": "auto", "label": "Auto" }] },
    { "name": "Temperature", "kind": "level",
      "state_topic": "schaltli/state/maxxfan/temperature", "command_topic": "schaltli/cmnd/maxxfan/temperature",
      "min": 0, "max": 37, "step": 1, "unit_of_measurement": "°C",
      "shown_when": { "topic": "schaltli/state/maxxfan/hvac_mode", "values": ["auto"] } },
    { "name": "Speed", "kind": "level",
      "state_topic": "schaltli/state/maxxfan/speed", "command_topic": "schaltli/cmnd/maxxfan/speed",
      "min": 10, "max": 100, "step": 10, "unit_of_measurement": "%",
      "shown_when": { "topic": "schaltli/state/maxxfan/hvac_mode", "values": ["fan_only"] } },
    { "name": "Cover", "kind": "switch",
      "state_topic": "schaltli/state/maxxfan/cover", "command_topic": "schaltli/cmnd/maxxfan/cover",
      "payload_on": { "value": "open", "label": "Offen" }, "payload_off": { "value": "closed", "label": "Zu" } },
    { "name": "Airflow", "kind": "switch",
      "state_topic": "schaltli/state/maxxfan/airflow", "command_topic": "schaltli/cmnd/maxxfan/airflow",
      "payload_on": { "value": "in", "label": "Rein" }, "payload_off": { "value": "out", "label": "Raus" } }
  ]
}
```

- **`version`**: the format's major. A description with a major the
  designer does not know is listed as not supported, with that reason. Keys
  it does not know are ignored, so a minor addition never breaks an older
  designer.
- **`name`, `icon`, `device`**: as in a Home Assistant config. `device`
  groups the entry in the menu with the device's other entities.
- **`covers`**: the `unique_id`s of Home Assistant entities this
  description replaces in the menu (`block-menu`).
- **`parts`**: in the order the block shows them. `kind` is one of the
  catalog's: `switch`, `state`, `value`, `level`, `choice`, `button`, with
  the keys each needs (`state_topic`, `command_topic`, `min`, `max`,
  `step`, `unit_of_measurement`, `options`, `payload_on`/`payload_off`,
  `payload_press`). Options and payloads may be plain strings or
  `{ value, label, icon }`: the value is what goes over MQTT, the label what
  the button says, the icon an Iconify name (`mdi:weather-sunny`) on the
  button - added 2026-10-04 for the theme's sun and moon; the dialog loads
  them with the block's icon. No templates: a description carries the
  topic's value as it is.
- **`shown_when`**: `{ topic, values }` - the part is shown while the topic
  holds one of the values.
- A part that cannot be used (a missing topic, an unknown kind) is skipped
  with its reason, the others offered - as Home Assistant entities' parts
  are today. A description with no usable part is not supported.

`lib/block-description.ts` reads it, pure, into the same `CatalogEntry`
`lib/ha-discovery.ts` produces, with two additions to the internal types:
a control may carry `shownWhen`, and an entry from Home Assistant carries
its `uniqueId`. Option and payload labels become the button words, which
for Home Assistant entities are the values themselves.

### The placed block (`block-shown-when`)

- Parts without `shown_when` are rows, as today.
- The parts with `shown_when` on the same topic become one `switcher` on
  that topic, in the row of the first of them. It has one `panel` per value
  named anywhere in those conditions (`==`), each holding the parts shown
  for that value, stacked as rows. A part named for two values is placed in
  both panels. The switcher is as tall as its fullest panel.
- A value no part names gets no panel: the switcher then shows nothing
  (the MaxxFan off).
- The topics of the switcher and of every part are declared, as for any
  block. The block stays a plain group of ordinary objects (decided
  2026-09-29).
- The Look of each part is chosen in the dialog as today: a level is a
  slider or a dial, a choice buttons.

### The Block menu (`block-menu`)

- The catalog reads `schaltli/blocks/+/config` beside the Home Assistant
  prefix, in the same retained burst.
- Each description is an entry under its device. Home Assistant entries
  whose `unique_id` a description covers are not listed; nothing else
  changes for them.
- Picking a description opens the options step as for any entry: Parts
  (all ticked), Look per part, Icon, Insert.

### The bridge (`bridge-blocks`)

The bridge publishes, retained, beside its Home Assistant configs:

| Description | Parts |
|---|---|
| `schaltli/blocks/maxxfan/config` | as above |
| `schaltli/blocks/heater/config` | Mode (Aus, Heizen, Lüften); Preset (Temperatur, Leistung) shown when view is `target` or `power`; Target 12-35 °C shown when `target`; Power 1-10 shown when `power`; Fan 1-10 shown when `fan`; current temperature |

- The heater's view topic `schaltli/state/heater/view` is `off`, `target`,
  `power` or `fan`, worked out from mode and preset each time either
  changes: off → `off`; fan only → `fan`; heat with preset power → `power`;
  heat otherwise → `target`. Retained.
- The heater's description covers its climate and its two level numbers;
  the timer stays an entity of its own.
- Without an Autoterm (no presets, no levels) the heater's description
  has Mode and Target only, Target shown when `target`.
- A description is published again when its parts or names change, and
  cleared when its device disappears, as the Home Assistant configs are.

## Tech stack

Next.js / React 19 / TypeScript, Playwright; the bridge is ES5 inside a
Node-RED function. No new dependency.

## Commands

```
Typecheck:  npx tsc --noEmit -p .
Designer:   npx playwright test e2e/block-description.spec.ts e2e/bausteine.spec.ts   (needs npm run hil:broker)
Bridge:     npx playwright test e2e/vanpi-bridge.spec.ts
Full:       npm run test:all
```

## Project structure

```
lib/block-description.ts         → read and validate a description into a CatalogEntry (pure)
lib/ha-discovery.ts              → CatalogEntry/CatalogControl gain uniqueId and shownWhen
lib/bausteine.ts                 → shownWhen parts as a switcher with panels
hooks/use-block-catalog.ts       → read both prefixes, hide covered entries
integrations/vanpi/bridge-logic.js → descriptions, the heater's view topic
e2e/block-description.spec.ts    → new: the format
e2e/bausteine.spec.ts, e2e/vanpi-bridge.spec.ts → extended
hil/discovery-devices.js         → a description on the local broker
handbuch/designer/bausteine.md, handbuch/betrieb/vanpi-bruecke.md
```

## Code style

As `lib/ha-discovery.ts`: pure functions, a reason string for everything
not supported, comments that say why.

```ts
/** A description's part, or why it cannot be one. */
function partOf(part: Json): { control: CatalogControl } | { skipped: string } {
  if (!KINDS.has(part.kind)) return { skipped: `unknown kind "${part.kind}"` }
  ...
}
```

## Testing strategy

- `e2e/block-description.spec.ts`, pure: the MaxxFan and heater
  descriptions verbatim; plain and labelled options; `shown_when`; an
  unknown major (not supported, with reason), an unknown key (ignored), a
  part without a topic (skipped), an empty payload (removed).
- `e2e/bausteine.spec.ts`: from descriptions on the local broker, the menu
  lists the MaxxFan and hides the entries it covers; placing it gives a
  switcher with an `auto` and a `fan_only` panel and no `off` panel; in the
  preview, changing the mode topic shows the other slider and `off` shows
  none.
- `e2e/vanpi-bridge.spec.ts`: the bridge's descriptions re-read through
  `lib/block-description.ts` are fully supported; the view topic for each
  mode × preset; cover and clear.
- HIL: the switcher-with-sliders shape on the Knob is already covered
  (`hil/waveshare` screen-6, ring-adjust). Checkpoint on the van: the user
  places the MaxxFan and the heater blocks and switches modes.

## Boundaries

- **Always:** no van words in `lib/`, `components/`, `app/`
  (`e2e/no-van-words.spec.ts`); blocks stay plain groups; handbook updated
  in the same piece of work.
- **Ask first:** deploying the bridge (the user deploys); changing the
  bridge's Home Assistant entities; anything published to the user's
  broker from the designer.
- **Never:** layouts, positions or colours from the bridge; templates in
  descriptions; nested switchers built from conditions.

## Success criteria

- [ ] On the van, the Block menu lists «MaxxFan» and «Heizung» from the
      bridge's descriptions, not their Home Assistant entities, and nothing
      in the designer's source names either.
- [ ] The placed MaxxFan shows the temperature slider in auto, the speed
      slider (10-100 in tens) by hand and no slider when off - on the
      device, in the preview, and with the Knob's ring bound to its
      switcher.
- [ ] The heater block shows target, power or fan level as its view topic
      says.
- [ ] A description from another publisher on the local broker becomes a
      block without any change to the designer.

## Not doing

- Recipes for bridge devices inside the designer - the designer learns
  formats, not Pekaway.
- Complete layouts from the bridge: it cannot know the device the block
  lands on (round Knob, 4.3B, e-paper without touch), the project's theme,
  font and size step, or the designer's object model version; the
  designer would have to translate them anyway.
- Guessing that a Home Assistant choice is a scale - it stays Buttons; only
  a description says «this is a level».
- Extra keys in the Home Assistant configs, or an extra `number` entity for
  the MaxxFan's speed - the description has its own topic.
- Conditions on more than one topic - the publisher combines them into a
  view topic.

## Open questions

None. The heater's part list and the German labels above confirmed by the
user 2026-10-04.
