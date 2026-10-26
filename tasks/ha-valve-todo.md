# Todo: ha-valve

Second of the missing components of the 2026-10-26 overview, after
`tasks/ha-cover-plan.md`, whose decisions it follows. Source:
`homeassistant/components/mqtt/valve.py` (branch `dev`, read 2026-10-26)
and source/_integrations/valve.mqtt.markdown. Asked for by the user
2026-10-26 («Push und weiter»).

Decisions beyond the cover's:
- One topic each way: `command_topic` with `command_template`, `state_topic` with `value_template`.
- Stop only where `payload_stop` is set: unlike a cover it has no default.
- `reports_position: true`: the state topic carries the position, so no State part; a Position level on `state_topic` and `command_topic` from `position_closed` to `position_open`; Open and Close send those two numbers, as Home Assistant does.

- [x] V1 The parts
  - `case "valve"` in `partsOf` (lib/ha-discovery.ts); e2e/ha-discovery.spec.ts five valve cases; fixtures schaltli-grauwasser.json, ha-docs-valve-state.json, ha-docs-valve-position.json, ha-docs-valve-no-close.json
- [x] V2 Placed from the broker
  - e2e/bausteine.spec.ts «a grey water valve: its state beside the name, Open and Close a button each sending its payload»
- [x] V3 Handbook
  - handbuch/designer/bausteine.md: row «Ventil (`valve`)» and a paragraph under «Mehrere Teile»; through maettel-humanizer
- [x] Checkpoint: test:quick 2026-10-26: e2e 1687 passed; papers3 lane green; knob, 4v3b and the phone not reachable, skipped
