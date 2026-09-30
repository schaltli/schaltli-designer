# Blocks from Home Assistant MQTT Discovery

Agreed 2026-09-30, from a discussion with the user. Replaces
docs/2026-09-29-block-options.md (see "What happens to block-options").

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `ha-discovery` | Reads Home Assistant MQTT Discovery configs off the broker and turns each supported entity into a catalog entry of Schaltli controls | designer (`lib/`) | - |
| `block-catalog` | The Block menu and dialog built from that catalog; every block the designer knows by itself is removed | designer (UI) | `ha-discovery` |
| `bridge-discovery` | The VanPi bridge publishes discovery configs for what it has, and learns the commands the new entities need | `integrations/vanpi/` | - |

## Objective

A block puts a thing the installation has on the screen in one step, bound
right and labelled with its name. Until now the designer knew the van
itself: tanks, relays, dimmers, the battery, their topics and their names,
all coded into `lib/bausteine.ts`. A broker that is not the VanPi bridge
got nothing useful, and the designer could not tell whether `a/c/serd` is
a switch or a dimmer.

From here on **the designer makes no assumptions about the installation.**
What there is, what it is called and how it is read and written is said by
whoever publishes it, in the format Home Assistant defined and much of the
MQTT world already speaks (Zigbee2MQTT, ESPHome, OpenMQTTGateway, Shelly
scripts, Node-RED helpers, and on a VanPi Pekaway's own ci2mqtt). A
publisher that goes that extra mile gets blocks; one that does not gets
none, and everything else in the designer works as before.

Decided with the user 2026-09-30:

- Blocks stay recipes: once placed, a block is a plain group of ordinary
  objects, indistinguishable from the same objects arranged by hand
  (decided 2026-09-29, kept).
- The protocol is Home Assistant MQTT Discovery, a documented subset of it,
  not a format of our own.
- The label is the entity's name as the config gives it, fixed text. A
  switch placed as «Trittstufe» stays «Trittstufe» when the van renames it
  «Stufe». (Home Assistant has no name topic.)
- Without a broker there are no blocks.
- Pekaway's ci2mqtt Truma climate is left out for now: it needs templates
  beyond the subset (`replace('°C','') | int`).
- No word for a thing in a van - tank, relay, dimmer, heater, fan, battery -
  appears in the designer's source (`lib/`, `components/`, `app/`). Tests
  and the handbook may use them: they describe a van.

## Research this rests on

Done 2026-09-30 from the official docs (home-assistant.io/integrations/mqtt
and the per-platform pages) and the sources of the publishers named above.

- Configs are retained on `<prefix>/<component>/[<node_id>/]<object_id>/config`,
  prefix `homeassistant` by default; an empty payload removes one. Any key
  may be abbreviated (`stat_t`, `cmd_t`, `val_tpl`, `pl_on` …; the full
  table is HA's `abbreviations.py`); `~` at the start or end of a `*_topic`
  value is the base topic. Device-based discovery (2024) puts several
  components under `cmps` on `<prefix>/device/…/config`, sharing `dev`,
  `o`, `state_topic`, `command_topic`, `availability`.
- Reading: most entities need no template or only `{{ value_json.x }}` in
  one of its spellings (`value_json["x"]`, `value_json['a']['b']`), now and
  then with a filter that does not change the value for display (`| int`,
  `| float`, `| round(n)`, `| is_defined`, `| default(…)`). A reader that
  understands raw payloads and these paths reads an estimated 85-95 % of
  what real publishers announce.
- Writing: nearly everything is a fixed payload (`payload_on`) or the raw
  value on a command topic. `command_template`s that build JSON are rare and
  concentrated (Victron bridges, Shelly RPC, Zigbee2MQTT sirens and covers).
- Stock Tasmota announces itself in its own format (`tasmota/discovery`),
  not Home Assistant's. It is not covered by this.
- The VanPi's own relays and sensors under `pkw/` announce nothing; users
  write configs by hand (forum, 2026-09-07). The bridge closing that gap is
  useful beyond Schaltli: a Home Assistant on the same broker sees them too.

## Behaviour

### Reading the catalog (`ha-discovery`)

1. When the Block menu opens, the designer subscribes to
   `<prefix>/+/+/config` and `<prefix>/+/+/+/config` on the configured
   broker, collects the retained configs, and settles as the dialog does
   today (300 ms quiet, 5 s at most). It publishes nothing: no birth
   message, no `homeassistant/status`.
2. The prefix is a setting beside the broker address in the MQTT connection
   settings (per browser, like the address), default `homeassistant`.
3. Each config is expanded: abbreviations to full keys, `~` into the
   topics, `cmps` into one config per component inheriting the shared
   keys. `{"migrate_discovery": true}` and removal stubs are skipped.
4. Each entity is either **supported** - it becomes a catalog entry - or
   **not supported**, with the reason (unknown component, a template beyond
   the subset, a `command_template`, a JSON-schema light …).
5. Templates are understood only as: none (raw payload), `{{ value }}`, and
   a path into `value_json` in dot or bracket spelling, optionally followed
   by `| int`, `| float`, `| round(n)`, `| lower`, `| upper`, `| is_defined`
   or `| default(…)`. A path becomes Schaltli's `topic#a.b`. Filters are
   dropped; rounding is the object's own format.
6. A `command_template` makes the entity's writing part unsupported. Its
   reading part may still be offered (a switch that cannot switch is shown
   as a state).

### What an entity becomes

| Component | Controls in the entry |
|---|---|
| `switch` | a switch: states from `state_off`/`state_on` (read) and `payload_off`/`payload_on` (write), defaults `OFF`/`ON` |
| `binary_sensor` | a state text: `payload_on`/`payload_off` |
| `sensor` | a value: text `{topic:…} <unit>`; with `%` or `device_class: battery`, also a bar or gauge |
| `number` | a settable level: slider or dial, `min`/`max`/`step` as calibration and step |
| `select` | a button group, one button per option (up to 4); more options: not supported |
| `button` | a button that publishes `payload_press` (default `PRESS`) |
| `light` (basic schema) | a switch on `command_topic`, and a settable level on the brightness topics, `brightness_scale` as calibration |
| `fan` | a switch; a settable level on the percentage topics (`speed_range_min/max`); a button group for `preset_modes`; a switch for the direction |
| `climate` | a button group for `modes`; a settable level for the target temperature (`min_temp`/`max_temp`/`temp_step`); a value for the current temperature; a switch on the power topic if there is one |

Other components (`cover`, `valve`, `text`, `water_heater`, JSON- and
template-schema lights …) are not supported in this version.

An entry's name is the device's name and the entity's, as Home Assistant
joins them (`name: null` is the device's name alone). Its icon is the
config's `icon` (`mdi:…`, which Iconify has); without one, the icon search
of today on the name. Entries are grouped by device in the menu.

### The Block menu and dialog (`block-catalog`)

- The Block menu lists the catalog, grouped by device, each entry with its
  icon. Not supported entities are listed greyed out with their reason,
  so a user sees why a thing of theirs is missing. Without a broker, or
  with no configs on it, the menu says so and offers nothing.
- Picking an entry opens the options step:
  - **Look**, where the designer has more than one object for a control (a
    value: text, bar, gauge; a settable level: slider, dial; a switch:
    switch, buttons), greyed out where the device cannot draw it;
  - **Parts**, for an entry with several controls (fan, climate, light):
    a checkbox each, all ticked;
  - **Icon**, with Change... and None, as today;
  - **Insert**.
- Then the rectangle is dragged, as today, and the parts are placed in it
  under the label: icon and name, then each ticked control.
- The topics every placed object reads or writes are declared in the
  project, with the value the broker holds as the first example.
- A switch's state words are «Aus» and «An» unless the entity's are
  something else (a select's options are its buttons' words); they are
  edited afterwards in the properties, as any switch's are.

### The VanPi bridge (`bridge-discovery`)

The bridge publishes, retained, one config per thing, under a device
«VanPi» (`identifiers: ["schaltli-vanpi"]`, `origin: schaltli`), on the
schaltli topics it already publishes:

| What | Component | Notes |
|---|---|---|
| each tank | `sensor`, `%`, `icon: mdi:water` | name from `…/tank/<n>/name` |
| the battery | `sensor`, `device_class: battery` | |
| each relay, each WiFi relay | `switch`, `on`/`off` | name from `…/name` |
| each dimmer | `light` with brightness, scale 100 | name from `…/name` |
| the theme | `switch`, `light`/`dark` as off/on | `icon: mdi:weather-night` |
| the heater | `climate`: power, target 12-35, current temperature | from block-options Task 7; timer and Autoterm level as `number`s |
| the MaxxFan | `fan`: power, percentage, presets (off/manual/auto), direction; cover as a `switch` | both shapes of `pkw/tele/maxxfan`, from block-options Task 8; commands for shape B through the user's BLE flow (Task 9) |

- A config is published again when its name changes, and cleared (empty
  payload) when its thing disappears.
- Names are the van's, as today. The commands the new entities need
  (heater timer and level, MaxxFan) are as block-options' spec says.

### What happens to block-options

Kept, because nothing in them knows a van:

- the second dialog step, the look choice, the icon search, the settle
  timing and the per-connection client id;
- `labelText()`'s placeholder mechanism stays in the designer for texts;
  blocks no longer use it (fixed names, above).

Removed with the built-in blocks (`TANK`, `BATTERY`, `SWITCH`, `DIMMER`,
`THEME`, `fallbackInstances`, the fallback names, `iconQuery` words, the
default step, `colourOnly`):

- the label position choice, the state words and step in the dialog, and
  the dialog remembering the last choice (option B, 2026-09-29).

## Tech stack

Next.js / React 19 / TypeScript, Playwright; the bridge is ES5 inside a
Node-RED function. No new dependency: the template subset is a small
parser of our own, not a Jinja implementation.

## Commands

```
Typecheck:  npm run typecheck
Designer:   npx playwright test e2e/bausteine.spec.ts e2e/ha-discovery.spec.ts   (needs npm run hil:broker)
Bridge:     npx playwright test e2e/vanpi-bridge.spec.ts
Full:       npm run test:all
```

## Project structure

```
lib/ha-discovery.ts              → expand, validate, map configs to catalog entries (pure)
lib/bausteine.ts                 → building a catalog entry's objects; no built-in blocks
components/baustein-dialog.tsx   → options step from the entry
components/toolbar/toolbar.tsx   → Block menu from the catalog
integrations/vanpi/*             → publish configs, new commands
e2e/fixtures/ha-discovery/       → real configs: Zigbee2MQTT, ESPHome, Shelly, OMG, our bridge
e2e/ha-discovery.spec.ts, e2e/bausteine.spec.ts, e2e/vanpi-bridge.spec.ts
handbuch/designer/bausteine.md, handbuch/betrieb/vanpi-bruecke.md, handbuch/installieren/ohne-pekaway.md
```

## Testing strategy

- `e2e/ha-discovery.spec.ts`, pure: every component in the table, from real
  configs collected in `e2e/fixtures/ha-discovery/` (the research's
  examples, verbatim where the source allows): abbreviations, `~`, `cmps`,
  removal, each template spelling and filter, the reasons for not
  supported.
- `e2e/bausteine.spec.ts`: the menu from configs on the local broker, the
  options step, the placed objects and declared topics; no broker, no
  blocks.
- `e2e/vanpi-bridge.spec.ts`: the configs the bridge publishes, re-read
  through `lib/ha-discovery.ts` - the bridge's output must be fully
  supported.
- Checkpoint on the van: a real Home Assistant, if the user has one on the
  broker, shows the VanPi entities.

## Boundaries

- **Always:** no van words in `lib/`, `components/`, `app/`; blocks stay
  plain groups; handbook updated in the same piece of work.
- **Ask first:** publishing anything to the user's broker from the
  designer; deploying the bridge (the user deploys); changing `vanpi-custom`.
- **Never:** evaluate Jinja; publish `homeassistant/status`.

## Success criteria

- [ ] On the van, the Block menu lists the tanks, battery, relays, dimmers,
      theme, heater and MaxxFan from the bridge's configs, and nothing in
      the designer's source names any of them.
- [ ] A Zigbee2MQTT switch and an ESPHome sensor on the local broker appear
      as blocks without any change to the designer.
- [ ] Without a broker the Block menu says so and offers nothing.

## Open questions

None. Decided 2026-09-30: "no van words" covers `lib/`, `components/`,
`app/`; the theme is a `switch`; the prefix sits beside the broker address.
