# Todo: ha-humidifier

Sixth and last of the missing components of the 2026-10-26 overview that
the existing controls can show. Source:
`homeassistant/components/mqtt/humidifier.py` and `humidifier/const.py`
(branch `dev`, read 2026-10-26), source/_integrations/humidifier.mqtt.markdown.
Asked for by the user 2026-10-26.

Decisions:
- As a fan: Power (`state_topic` with `state_value_template`, `command_topic`, ON/OFF), Mode (`modes`), Target humidity (a level from `min_humidity` to `max_humidity`, default 0 to 100, in %), Current humidity (a value in %, a fill).
- No `value_template` stands in here: humidifier.py has none.
- Its action (`action_topic`: humidifying, drying, idle) left out, as a climate's is.

- [x] U1 The parts
  - `case "humidifier"` in `partsOf` (lib/ha-discovery.ts); e2e/ha-discovery.spec.ts two humidifier cases; fixtures ha-docs-humidifier-bedroom.json, schaltli-entfeuchter.json
- [x] U2 Placed from the broker
  - e2e/bausteine.spec.ts «a dehumidifier: power as buttons, the target humidity a slider in its range, the current humidity a fill»
- [x] U3 Handbook
  - handbuch/designer/bausteine.md: «Mehrere Teile» names it, a paragraph on its parts; checked against the maettel-humanizer catalog
- [x] Checkpoint: test:quick 2026-10-26: e2e 1701 passed, 1 skipped; papers3 lane green; knob, 4v3b and the phone not reachable, skipped. A first run failed e2e/leave-unsaved.spec.ts (ECONNRESET saving a project; nothing of this module), green on the rerun
