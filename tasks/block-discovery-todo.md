# block-discovery: tasks

Plan: `tasks/block-discovery-plan.md` · Spec: `docs/2026-09-30-block-discovery.md`

## Definition of done (every task)

A task is done when its acceptance criteria are met **and**:

- new behaviour is covered by a test that fails without the change and
  passes with it; ad-hoc checks (a scratch script, a HIL run) have become a
  permanent e2e spec or HIL fixture (CLAUDE.md);
- `npm run typecheck` and the specs the task names are green, and the
  change was seen working in the running designer, not only compiled;
- no dead code, debug output or commented-out blocks; nothing outside the
  task changed in passing;
- a change a user can see has its handbook page updated, and the report
  names the page (CLAUDE.md);
- the user has seen it before it is committed.

## Phase 1 - the designer reads discovery

## Task 1: Expand configs: abbreviations, `~`, `cmps`, removal

**Description:** `lib/ha-discovery.ts` `expandConfig(topic, payload)`:
parses the topic (`<prefix>/<component>/[<node>/]<object>/config`,
`<prefix>/device/…`), expands every abbreviation (table from HA's
`abbreviations.py`, source and date in a comment), replaces `~` at the start
or end of `*_topic` values, splits `cmps` into one config per component
inheriting `dev`, `o`, `state_topic`, `command_topic`, `availability`,
`qos`. Empty payload = removal; `migrate_discovery` and `p`-only stubs are
skipped.

**Acceptance criteria:**
- [x] The Tasmota legacy relay (`stat_t`, `cmd_t`, `val_tpl`, `pl_on`,
      `dev.ids`), a Shelly `~` config and the HA docs' `cmps` example
      expand to the full keys the docs name.
- [x] Removal, `migrate_discovery` and a malformed payload give nothing,
      without throwing.

**Verification:** `npx playwright test e2e/ha-discovery.spec.ts`; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`,
`e2e/fixtures/ha-discovery/*.json`

**Estimated scope:** M

## Task 2: Template subset

**Description:** `readPath(template)` → `{ path }` (JSON path, possibly
empty for the raw value) or `{ unsupported: reason }`. Accepts none,
`{{ value }}`, `{{ value_json.a.b }}`, `{{ value_json["a"] }}`,
`{{ value_json['a']['b'] }}`, followed by `| int`, `| float`, `| round(n)`,
`| lower`, `| upper`, `| is_defined`, `| default(…)`.

**Acceptance criteria:**
- [x] Every spelling from the research's real configs (Z2M, Tasmota,
      Shelly, OMG) gives the right path.
- [x] `{% if … %}`, arithmetic, `split`, `replace`, `now()` give a reason
      naming what is not supported.

**Verification:** `npx playwright test e2e/ha-discovery.spec.ts`; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`

**Estimated scope:** S

## Task 3: Entities to catalog entries: switch, binary_sensor, sensor, number, select, button

**Description:** `toCatalogEntry(config)` for the six simple components, as
the spec's table says; the entry's name as HA joins device and entity name;
`icon`; device for grouping. A `command_template` makes writing
unsupported (reading may stay).

**Acceptance criteria:**
- [x] Z2M switch, ESPHome sensor, Z2M number, ESPHome select, a button:
      entries with the right topics, JSON paths, payloads, min/max/step.
- [x] A select with 5 options (a choice with five since 2026-10-01, no
      limit), a switch with a JSON-building
      `command_template`: unsupported (or read-only) with the reason.

**Verification:** `npx playwright test e2e/ha-discovery.spec.ts`; `npm run typecheck`

**Dependencies:** Tasks 1, 2

**Files likely touched:** `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`,
fixtures

**Estimated scope:** M

## Checkpoint A1: the entry's shape
- [x] Tasks 1-3 green; typecheck green
- [x] Review with the user: the catalog entry's shape and the reasons for
      "not supported", on the real configs - before light, fan and climate
      and the UI are built on it (2026-10-01: the six control kinds and a
      read-only switch as a state accepted; the limit of four options
      dropped)

## Task 4: Entities to catalog entries: light, fan, climate

**Description:** Basic-schema light (switch + brightness level on
`brightness_scale`), fan (switch, percentage level on `speed_range_*`,
preset choice, direction switch), climate (mode choice, target level
`min_temp`/`max_temp`/`temp_step`, current value, power switch). JSON- and
template-schema lights unsupported.

**Acceptance criteria:**
- [ ] The HA docs' fan and climate examples and a Tasmota dimmer give
      entries with every control they describe.
- [ ] An ESPHome JSON light and a Shelly template light: unsupported,
      with the reason.

**Verification:** `npx playwright test e2e/ha-discovery.spec.ts`; `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`,
fixtures

**Estimated scope:** M

## Task 5: Prefix setting beside the broker address

**Description:** `discoveryPrefix` in the MQTT connection config, stored
with the address (`schaltli-mqtt-connection`), default `homeassistant`;
a field beside **WebSocket URL** in the MQTT Discovery dialog.

**Acceptance criteria:**
- [ ] A prefix typed there is what the next reading of the catalog uses,
      after a reload too.
- [ ] Empty falls back to `homeassistant`.

**Verification:** `npx playwright test e2e/mqtt-discovery.spec.ts`
(extended); `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `hooks/use-mqtt-connection.ts`,
`components/mqtt-discovery-dialog.tsx`, `e2e/mqtt-discovery.spec.ts`,
`handbuch/…` (the page on the MQTT settings)

**Estimated scope:** S

## Checkpoint A2: the whole catalog
- [ ] `e2e/ha-discovery.spec.ts` green on every fixture; typecheck green
- [ ] The prefix setting works in the running designer

## Task 6a: Objects from a catalog entry

**Description:** One builder in `lib/bausteine.ts` turns a catalog entry
with one control into objects - label (the entry's name, fixed text) with
optional icon, and the control in the chosen look - and names the topics
to declare. It replaces the five built-in `build()`s' work but does not
remove them yet. Pure.

**Acceptance criteria:**
- [ ] A switch, value, level, choice, button and state control each give
      the objects the spec's table names, bound to the entry's topics, with
      JSON paths as `topic#a.b`.
- [ ] The looks per control kind (value: text/bar/gauge; level:
      slider/dial; switch: switch/buttons) give the right object type.

**Verification:** `npx playwright test e2e/bausteine.spec.ts` (pure part);
`npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `lib/bausteine.ts`, `e2e/bausteine.spec.ts`

**Estimated scope:** M

## Task 6b: The Block menu lists the catalog

**Description:** Opening the Block menu reads the catalog from the broker
(prefix from Task 5; settle 300 ms quiet, 5 s at most; "Looking…" until
then) and lists the entries grouped by device with their icons;
unsupported ones greyed out with their reason. No broker / no configs: the
menu says so. The retained values of the entries' read topics are read
alongside, for examples.

**Acceptance criteria:**
- [ ] A switch and a sensor config on the local broker appear under their
      device; a config with an unsupported template appears greyed out with
      the reason.
- [ ] Without a broker the menu says so and offers nothing.

**Verification:** `npx playwright test e2e/bausteine.spec.ts` (needs
`npm run hil:broker`); `npm run typecheck`

**Dependencies:** Tasks 3, 5

**Files likely touched:** `components/toolbar/toolbar.tsx`, a new
`hooks/use-block-catalog.ts`, `e2e/bausteine.spec.ts`

**Estimated scope:** M

## Task 6c: Placing a catalog entry; the built-in blocks go

**Description:** Picking an entry opens the options step (look, icon,
Insert), then the rectangle; `finishBaustein` places Task 6a's objects and
declares the topics with the broker's value as first example. Removed:
`TANK` … `THEME`, instance discovery and fallbacks, `iconQuery`,
`colourOnly`, the label position, state words and step fields, remembered
choices. Handbook `designer/bausteine.md` rewritten for blocks from
discovery.

**Acceptance criteria:**
- [ ] Picking the switch entry and dragging places a label and a switch
      bound to its topics; the Topics list has them with the broker's value
      first.
- [ ] Existing projects with placed blocks load unchanged.
- [ ] Nothing of the built-in blocks is left in `lib/`, `components/`.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/handbook-labels.spec.ts`;
`npm run build --prefix handbuch`; `npm run typecheck`

**Dependencies:** Tasks 6a, 6b

**Files likely touched:** `components/baustein-dialog.tsx`,
`components/project-editor.tsx`, `lib/bausteine.ts`,
`e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** M

## Task 7: Parts for entries with several controls

**Description:** Light, fan and climate entries show a checkbox per
control in the options step, all ticked; the ticked ones are placed
stacked under the label in the entry's order.

**Acceptance criteria:**
- [ ] A fan config with all four controls, only speed and presets ticked:
      a slider and a button group, bound right.
- [ ] Nothing ticked disables Insert.

**Verification:** `npx playwright test e2e/bausteine.spec.ts`; `npm run typecheck`

**Dependencies:** Tasks 4, 6c

**Files likely touched:** `lib/bausteine.ts`, `components/baustein-dialog.tsx`,
`e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** M

## Task 8: No van words in the source, and a test that keeps it so

**Description:** Remove tank, relay, dimmer, battery, heater, maxxfan,
Frischwasser … from `lib/`, `components/`, `app/` (comments, examples,
`app/test-fields`), and add a spec that fails when one comes back.

**Acceptance criteria:**
- [ ] The new spec passes and fails when a van word is added to `lib/`.
- [ ] Nothing else changes behaviour (full e2e as in Checkpoint B).

**Verification:** `npx playwright test e2e/no-van-words.spec.ts`; `npm run typecheck`

**Dependencies:** Task 6c

**Files likely touched:** the ~15 files with van words, `e2e/no-van-words.spec.ts`

**Estimated scope:** S - more files than the ~5 a task should touch, but
the edits are comments and example strings, one mechanical pass; kept as
one task so the guard spec lands with the clean-up it guards.

## Checkpoint B: blocks from anybody's discovery
- [ ] Z2M switch, ESPHome sensor and a fan config published on the local
      broker are blocks, placed right
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Review with the user in the running designer

## Phase 2 - the VanPi bridge publishes discovery

## Task 9: Configs for tanks, battery, relays, WiFi relays, dimmers, theme

**Description:** `bridge-logic.js` builds the configs (device «VanPi»,
`origin: schaltli`) from what it publishes; `build-flow.js` publishes
them retained, again on a name change, empty when a thing disappears. The
spec re-reads them through `lib/ha-discovery.ts`. Handbook
`betrieb/vanpi-bruecke.md`: what it announces, and that a Home Assistant
on the broker sees it too.

**Acceptance criteria:**
- [ ] For the recorded Pekaway answers every thing gets a config, all
      supported by `lib/ha-discovery.ts`, names from the van.
- [ ] Renaming a relay republishes its config; a tank gone clears its.

**Verification:** `npx playwright test e2e/vanpi-bridge.spec.ts`; `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `integrations/vanpi/bridge-logic.js`,
`integrations/vanpi/build-flow.js`, `e2e/vanpi-bridge.spec.ts`,
`handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** M

## Task 10: Heater as climate, timer and level

**Description:** As block-options Task 7 (name, timer 0-600 with own
countdown on 2.0.10, Autoterm level), published as a `climate` (power,
target 12-35, current temperature) and `number`s for timer and level.

**Acceptance criteria:**
- [ ] Timer 90 → `pkw/cmnd/heater/POWER/<target>/90` `on`; 0 → off; the
      countdown runs without `runtime_remaining_s`.
- [ ] The configs are supported by `lib/ha-discovery.ts`; level only with
      `autoterm1`.

**Verification:** `npx playwright test e2e/vanpi-bridge.spec.ts`; `npm run typecheck`

**Dependencies:** Tasks 4, 9

**Files likely touched:** `integrations/vanpi/*`, `e2e/vanpi-bridge.spec.ts`,
`handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** M

## Task 11: MaxxFan: both shapes, fan config, commands for shape A

**Description:** As block-options Task 8 (normalise A and B, ignore A
after B, A's toggles/steps), published as a `fan` (power, percentage,
presets off/manual/auto, direction) and a `switch` for the cover.
Handbook warning for A without feedback, with `handbuch-macke` and a
GitHub issue (created after asking).

**Acceptance criteria:**
- [ ] A alone and B alone give the same state topics; A after B ignored.
- [ ] The fan config is supported by `lib/ha-discovery.ts`.

**Verification:** `npx playwright test e2e/vanpi-bridge.spec.ts`; `npm run typecheck`

**Dependencies:** Tasks 4, 9

**Files likely touched:** `integrations/vanpi/*`, `e2e/vanpi-bridge.spec.ts`,
`handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** M

## Task 12: vanpi-custom: the BLE flow listens on `schaltli/cmnd/maxxfan/#`

**Description:** As block-options Task 9: in `vanpi-custom/flows/maxxfan.json`
an MQTT in on `schaltli/cmnd/maxxfan/#` turns `<part>` + value into
`{"<part>": <value>}` on `ble/<mac>/command/set`, with the value checks the
flow already has. Only with the user's go-ahead; the user deploys.

**Acceptance criteria:**
- [ ] Each of mode, speed, temperature, cover and airflow reaches the fan.
- [ ] An unknown part or an out-of-range value is dropped with a log line.

**Verification:** on the van at Checkpoint C, then kept as a HIL check

**Dependencies:** Task 11

**Files likely touched:** `../vanpi-custom/flows/maxxfan.json`

**Estimated scope:** S

## Checkpoint C: on the van (the user deploys bridge and flow)
- [ ] The Block menu lists tanks, battery, relays, dimmers, theme, heater,
      MaxxFan; each placed and working on a device
- [ ] A Home Assistant on the broker, if there is one, shows them
- [ ] The HIL run becomes a permanent test

## Task 13: Handbook screenshots, humanizer pass, full run

**Description:** New pictures of the Block menu and dialog
(`e2e/handbook-screenshots.spec.ts` publishing configs instead of
stubbing Iconify to nothing); every page touched through
`maettel-humanizer`; `npm run test:all`.

**Acceptance criteria:**
- [ ] The handbook's block page shows the menu and the options step with
      the VanPi bridge's entries.
- [ ] Every handbook page this plan touched has been through
      `maettel-humanizer`.

**Verification:** `npx playwright test e2e/handbook-screenshots.spec.ts e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`;
`npm run build --prefix handbuch`; `npm run test:all`

**Dependencies:** Checkpoint C

**Files likely touched:** `e2e/handbook-screenshots.spec.ts`,
`handbuch/designer/bausteine.md`, `handbuch/betrieb/vanpi-bruecke.md`,
`handbuch/installieren/ohne-pekaway.md`

**Estimated scope:** S

## Checkpoint D: complete
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
