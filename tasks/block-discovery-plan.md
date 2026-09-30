# Implementation plan: block-discovery

Spec: `docs/2026-09-30-block-discovery.md` (agreed 2026-09-30).
Task checklist: `tasks/block-discovery-todo.md`.

**Order (2026-09-30):** the size and font standard comes first. Tasks 6, 7
and 13 place objects and wait for it; Tasks 1-5 and 9-12 do not depend on
it, but are not started before it either, so that two large rebuilds are
not open at once.

Replaces `tasks/block-options-*` (superseded). Kept in files of its own
because `tasks/plan.md` and `tasks/todo.md` hold another session's plan.

## Overview

The designer reads Home Assistant MQTT Discovery configs off the broker and
offers each supported entity as a block; every block it knew by itself goes.
The VanPi bridge publishes configs for what it has. No van word stays in
`lib/`, `components/`, `app/`.

## What the code looks like today

- `lib/bausteine.ts` (~1100 lines): five built-in `BausteinDef`s with
  instance discovery on `schaltli/state/<group>/…`, fallbacks, looks,
  states, step, icon query; the builders (`levelObject`, `arcObject`,
  `switchObject`, `buttonGroupObject`, `numberObject`, `labelPieces`,
  `arrange`) are generic and stay.
- `components/baustein-dialog.tsx`: instance list, then options (label,
  look, icon, states, step, label position), remembers last choices.
- `components/toolbar/toolbar.tsx`: Block menu over `BAUSTEINE`.
- `components/project-editor.tsx` `finishBaustein`: builds, declares topics
  and assets, places the group.
- `hooks/use-mqtt-connection.ts`: the broker address, stored per browser
  under `schaltli-mqtt-connection`; edited in the deploy, MQTT discovery and
  recover dialogs.
- `integrations/vanpi/bridge-logic.js` / `build-flow.js`: publishes
  `schaltli/state/…`, understands `schaltli/cmnd/…`; no discovery.
- Van words outside the blocks: ~40, mostly comments and example values
  (`render-level-indicator.ts`, `level-shape.ts`, `theme-preview.tsx`,
  `app/test-fields/page.tsx`, `placeholder-completion.ts` …).

## Architecture decisions

1. **`lib/ha-discovery.ts` is pure:** `expandConfig(topic, payload)` →
   zero or more full-key configs (abbreviations, `~`, `cmps`); 
   `toCatalogEntry(config)` → `{ supported: true, entry } | { supported:
   false, reason }`. No MQTT in it; the dialog feeds it what it collected.
   The abbreviation table is copied from HA's `abbreviations.py` with its
   source and date.
2. **A catalog entry is Schaltli's own vocabulary:** `{ id, name, device,
   icon?, controls: Control[] }`, a control being one of `switch` (states
   with read/write values), `value` (read topic, unit, level-able?),
   `level` (read, write, min, max, step), `choice` (options), `button`
   (topic, payload), `state` (binary, on/off payloads). Building objects
   from controls replaces the five `build()`s - one function, the looks
   per control kind.
3. **Template subset is a parser, not a regex soup:** tokenises
   `{{ value }}` / `{{ value_json<path> <filters> }}`, returns a JSON path
   or "unsupported: <why>". Filters on the allow-list are dropped.
4. **The catalog is read when the Block menu opens,** by the same settle
   rule as today; the menu shows "Looking…" until then. The dialog no
   longer asks the broker; picking an entry goes to the options step.
5. **Examples for declared topics** come from the retained state values
   read alongside the configs (one subscription per entry's read topics,
   same settle).
6. **The bridge builds configs in `bridge-logic.js`,** pure and tested
   like its state mapping, and re-reads them through `lib/ha-discovery.ts`
   in its spec, so it cannot publish something the designer rejects.

## Task list

See `tasks/block-discovery-todo.md`.

Phase 1 - the designer reads discovery
1. Expand configs: abbreviations, `~`, `cmps`, removal
2. Template subset
3. Entities to catalog entries: switch, binary_sensor, sensor, number, select, button
4. Entities to catalog entries: light, fan, climate
5. Prefix setting beside the broker address
   - Checkpoint A: the pure catalog from real configs
6. Block menu and dialog from the catalog; built-in blocks removed
7. Parts for entries with several controls
8. No van words in the source, and a test that keeps it so
   - Checkpoint B: Zigbee2MQTT and ESPHome configs on the local broker are blocks

Phase 2 - the VanPi bridge publishes discovery
9. Configs for tanks, battery, relays, WiFi relays, dimmers, theme
10. Heater as climate, timer and level
11. MaxxFan: both shapes, fan config, commands for shape A
12. vanpi-custom: the BLE flow listens on `schaltli/cmnd/maxxfan/#` (user's go-ahead)
   - Checkpoint C: on the van (the user deploys)
13. Handbook screenshots, humanizer pass, `npm run test:all`

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Real configs differ from the docs (abbreviation gaps, odd template spellings) | Med | Fixtures copied from real publishers' sources; unknown keys ignored, not fatal |
| Removing the built-in blocks breaks tests and handbook pictures that place them | Med | Task 6 moves those tests onto configs on the local broker; screenshots in Task 13 |
| The Block menu waits up to 5 s on an empty broker | Low | Shown as "Looking…"; the configs are retained, so a real one answers at once |
| HA on the same broker picks up the bridge's entities unasked | Low | Intended (spec); said in the handbook's bridge page |
| Many retained configs on a busy broker (Z2M with 100 devices) | Low | Configs are small; the menu groups by device and can filter |
| `lib/bausteine.ts` rewrite collides with nothing else | - | Only this plan touches it now |

## Open questions

None in the spec. Checkpoint C finds out on the van what the block-options
spec left open (a second heater timer command).
