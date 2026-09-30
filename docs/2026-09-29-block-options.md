# Blocks with options: how they look, what they say, Heater and MaxxFan

Draft 2026-09-29, from an interview with the user.

**Superseded 2026-09-30** by docs/2026-09-30-block-discovery.md: blocks come
from Home Assistant MQTT Discovery, the designer knows no van. Tasks 1-5 are
done and committed; what of them stays is listed there. Tasks 7-9 move into
its `bridge-discovery` module; 10-12 are dropped. Builds on
docs/2026-09-25-block-topics.md (what a block declares) and
docs/2026-09-25-text-placeholders.md (section "Blocks", which this spec
carries out).

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `block-labels` | A block's label is a Text whose text is `{topic:…/name ?? "Frischwasser"}`; overwriting it in the dialog makes it a literal | designer | text-placeholders (built) |
| `block-dialog` | The Insert dialog gets options: look, label position, texts, icon (found by name) | designer | `block-labels` |
| `bridge-heater` | The bridge learns the timer and Autoterm's power level | `integrations/vanpi/` | - |
| `bridge-maxxfan` | The bridge reads both MaxxFan shapes into one set of topics and learns commands | `integrations/vanpi/` | - |
| `block-heater`, `block-maxxfan` | Two new blocks, each a group of the parts the user ticks | designer | `block-dialog`, their bridge module |

## Objective

A block today places one fixed arrangement - a text and a bar, a text and a
switch - with the van's name typed in as it was at that moment. The user
wants to choose how a block looks and what it says while placing it, wants
the label to follow the van when a name changes there, an icon that fits
without searching for it, and blocks for the heater and the MaxxFan, which
have more to them than one value.

What does **not** change: once placed, a block is a plain group of ordinary
objects. Nothing marks it as a block, nothing re-builds it later, and it is
indistinguishable from the same objects arranged by hand (decided
2026-09-29).

## Behaviour

### Label (`block-labels`)

1. The label of every block with a name topic (Tank, Switch, Dimmer, and the
   new ones where the bridge publishes a name) is a **Text** whose text is
   `{topic:schaltli/state/<g>/<n>/name ?? "<name found>"}`. Without a
   broker the fallback is the fallback label (`Tank 1`).
2. Battery and Theme have no name topic; their label stays literal.
3. The dialog shows the label as a text field, prefilled with the
   placeholder form. Typing over it leaves what was typed - a literal, or
   another placeholder. No extra rule, no checkbox.
4. The text box takes the width the block has for the label, not the width
   of today's name, so a longer name arriving later is not cut off (as
   text-placeholders already said).

### Options in the dialog (`block-dialog`)

Below the list of instances, per block:

| Block | Look | Texts |
|---|---|---|
| Tank, Battery | Bar · Gauge (arc) · number only (`{topic:…:F0} %`) | label |
| Switch | switch · buttons (a button group «Aus \| An»; a single toggle button was left out on 2026-09-29, it would not show whether the relay is on) | label, «Aus», «An» |
| Dimmer | Slider · Dial | label, step (default 5) |
| Theme | switch · buttons, as Switch | label, «Hell», «Dunkel» |
| Heater, MaxxFan | see below | label |

- **Label position:** above or left, for every block. Default as today
  (above for Tank, Battery, Dimmer; left for Switch).
- **Icon:** the dialog searches Iconify (`lib/icon-search.ts`) for the
  instance's name, falling back to the block's kind (`Frischwasser` →
  water, else `tank`), and shows the first hit. The user can pick another
  (the existing icon browser) or none. The icon goes before the label and
  is added to the project's assets once, as Theme's moon is today.
- An option whose object type the device does not declare is greyed out,
  with the reason, as blocks in the menu are today.
- The dialog remembers the last choice per block for the session.

### Heater (`bridge-heater`, `block-heater`)

The bridge has today: state `heater/power`, `target`, `status`, `temp`,
`error`; commands `schaltli/cmnd/heater` (on/off/toggle) and
`schaltli/cmnd/heater/target` (12-35).

New in the bridge:

- `schaltli/cmnd/heater/timer` with minutes 1-600 → `pkw/cmnd/heater/POWER/<target>/<min>`
  with `on`; `0` → `pkw/cmnd/heater/POWER` with `off`.
- `schaltli/state/heater/timer`: the minutes left, rounded up, `0` when no
  timer runs. From `runtime_remaining_s` where the van's flow reports it
  (Pekaway 2.1.0). The reference van runs 2.0.10, whose answer lacks it: there
  the bridge counts down itself from the last timer command it forwarded,
  and drops to `0` when `heater/power` goes `off`.
- `schaltli/state/heater/name` from `heater_name`, so the label follows the
  van as the other blocks' do.
- `schaltli/state/heater/power_level` from `autoterm1.powerlevel`;
  `schaltli/cmnd/heater/power_level` with 0-10 →
  `pkw/cmnd/heater/autoterm/heatingpower/<n>` with the current power state.
  Only published when the van reports an `autoterm1` object.

The block: the user ticks the parts, each placed under the label in this
order:

| Part | Object | Topic |
|---|---|---|
| Power | switch | `heater/power` / `cmnd/heater` |
| Setpoint | Slider 12-35 °C, step 1 | `heater/target` / `cmnd/heater/target` |
| Timer | Slider 0-600 min that counts down: it shows the minutes left and slides back as they run out; pushing it up or down runs the heater longer or shorter, pushing it to 0 switches it off | `heater/timer` / `cmnd/heater/timer` |
| Power level | Slider 0-10 | `heater/power_level` / `cmnd/heater/power_level` - offered only when the broker reports it |

### MaxxFan (`bridge-maxxfan`, `block-maxxfan`)

Two shapes arrive on `pkw/tele/maxxfan` (researched 2026-09-29):

- **A**, Pekaway's own, answer to a poll, not retained:
  `{"maxxfan":{"fan_power":false,"fan_direction":"out","fan_temp":26,"fan_auto":false,"fan_speed":3,"fan_vent":"close"}}`.
  Pekaway keeps this state itself (IR or RJ45, no feedback); its commands
  toggle or step (`pkw/cmnd/maxxfan/power|direction|vent|auto|speed|temp`).
- **B**, the user's BLE flow in `vanpi-custom`, retained, real feedback:
  `{"mode":"MANUAL","speed":90,"temperature":22,"cover":"OPEN","airflow":"OUT"}`.
  Commands are absolute, a JSON object with one key on
  `ble/<mac>/command/set`.

The bridge normalises both into one set of topics:

| Topic | Values | From A | From B |
|---|---|---|---|
| `maxxfan/mode` | `off`, `manual`, `auto` | `fan_power`, `fan_auto` | `mode` |
| `maxxfan/speed` | 10-100 % | `fan_speed` × 10 | `speed` |
| `maxxfan/temperature` | °C | `fan_temp` | `temperature` |
| `maxxfan/cover` | `open`, `closed` | `fan_vent` | `cover` |
| `maxxfan/airflow` | `in`, `out` | `fan_direction` | `airflow` |

- **Once B has been seen, A is ignored** until the bridge restarts. On the
  reference van A carries only Pekaway's defaults and is published every
  2 s; reading both would flip the values between real and made up (the
  reason the bridge reads only A today, `bridge-logic.js:109`).
- The old topics `maxxfan/power|direction|temp|auto|vent` are replaced by
  these.
- Commands `schaltli/cmnd/maxxfan/<part>` with an absolute value
  (`mode`, `speed`, `temperature`, `cover`, `airflow`, values as in the
  table):
  - **B:** the BLE flow in `vanpi-custom` subscribes to
    `schaltli/cmnd/maxxfan/#` itself and turns each into
    `{"<part>": <value>}` on `ble/<mac>/command/set` (decided 2026-09-29;
    the MAC stays where it is). A change in `vanpi-custom`, made by the user
    or with their go-ahead.
  - **A:** the bridge turns the value into the toggles or steps needed to
    get there from the current state - but only while it has not seen B,
    so a fan with B is never also driven through Pekaway.
- A fan with A only reports no state of its own: the screen shows what
  Pekaway believes, which drifts when the fan is used by its own remote.
  The handbook warns about it, with a `handbuch-macke` comment and its
  GitHub issue (decided 2026-09-29).

The block: the user ticks the parts:

| Part | Object |
|---|---|
| Mode | switch with three states OFF · MANUAL · AUTO |
| Speed | Slider 10-100 %, step 10 |
| Temperature (auto) | Slider 0-37 °C, step 1 |
| Cover | switch open · closed |
| Airflow | switch in · out |

## Tech stack

Next.js / React 19 / TypeScript, Playwright; the bridge is plain ES5 inside
a Node-RED function (`integrations/vanpi/`). No new dependency.

## Commands

```
Typecheck:  npm run typecheck
Blocks:     npx playwright test e2e/bausteine.spec.ts   (needs npm run hil:broker)
Bridge:     npx playwright test e2e/vanpi-bridge.spec.ts
Full:       npm run test:all
```

## Project structure

```
lib/bausteine.ts                 → labels, looks, parts, the two new blocks
components/baustein-dialog.tsx   → the options, icon suggestion
lib/icon-search.ts               → reused for the suggestion
integrations/vanpi/bridge-logic.js, build-flow.js → heater, maxxfan
e2e/bausteine.spec.ts, e2e/vanpi-bridge.spec.ts   → tests
handbuch/designer/bausteine.md, handbuch/betrieb/vanpi-bruecke.md → handbook
```

## Testing strategy

- `e2e/bausteine.spec.ts`: each look of each block places the objects it
  names; the label is the placeholder, a typed label stays literal; the
  icon suggestion for «Frischwasser» (Iconify mocked); greyed-out options;
  Heater and MaxxFan place only the ticked parts, bound to the right
  topics.
- `e2e/vanpi-bridge.spec.ts`: A alone, B alone, A after B (ignored); every
  new command, for A the toggle sequence; heater timer and power level.
- A HIL run against the reference van for the MaxxFan commands, then added
  to the relevant HIL fixture.

## Boundaries

- **Always:** blocks stay plain groups; handbook pages updated in the same
  piece of work; e2e and typecheck green before each commit.
- **Ask first:** deploying the bridge to the van (the user deploys);
  changing anything in `vanpi-custom`.
- **Never:** move the MaxxFan BLE flow into this repo (decided in
  docs/2026-09-23-schaltli-rename.md).

## Success criteria

- [ ] A Tank placed on a van with «Frischwasser» shows a Text
      `{topic:…/tank/1/name ?? "Frischwasser"}`, a water icon and the look
      chosen; renaming the tank in the van changes the screen.
- [ ] Heater and MaxxFan blocks place the ticked parts and switch the real
      heater and fan on the reference van.
- [ ] The reference van shows the fan's real state, not Pekaway's defaults.

## Open questions

Decided 2026-09-29: B's commands through the BLE flow itself; the timer as
a counting-down slider; `heater/name` published; the A-only warning in the
handbook.

To find out on the reference van, not to decide:

1. Whether a second `POWER/<target>/<min>` while a timer runs replaces the
   remaining time (what the slider needs) or is ignored. If ignored, the
   bridge sends `off` first, then the new timer.
2. ~~Whether a slider on the devices redraws from its state topic while
   untouched.~~ Answered 2026-09-29 (Task 6): yes on the 4.3B, the Knob,
   Android and the designer's preview, for Slider and Dial alike. While a
   finger is on it the handle follows the finger; after release it waits for
   the topic to report the value, at most 2.5 s, then follows the topic
   again (`schaltli-firmware` `src/boards/waveshare4v3b/main.cpp:1201-1208`,
   `src/main.cpp:2432-2444`; `schaltli-android` `mqtt/MqttRepository.kt:109-145`;
   `lib/asked-value.ts:43-45`). The countdown needs no device work.
