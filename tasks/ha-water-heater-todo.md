# Todo: ha-water-heater

Third of the missing components of the 2026-10-26 overview, after
`tasks/ha-cover-plan.md` and `tasks/ha-valve-todo.md`. Source:
`homeassistant/components/mqtt/water_heater.py` (branch `dev`, read
2026-10-26) and source/_integrations/water_heater.mqtt.markdown. Asked for
by the user 2026-10-26.

Decisions:
- Climate's keys, fewer parts: Mode, Target temperature, Current temperature, Power.
- Default modes `eco, electric, gas, heat_pump, high_demand, performance, off`; default range 110-140 °F, in °C 43.3-60 (Home Assistant converts its °F default; to one decimal here), also where no unit is given; the step is `precision`, else 1 °F or 0.1 °C as Home Assistant's precision.
- Found on the way, for climate too: `value_template` stands in for every read template not set (VALUE_TEMPLATE_KEYS of climate.py and water_heater.py). Climate read the raw payload until now.

- [x] W1 The parts
  - `case "water_heater"` and `withValueTemplate` in lib/ha-discovery.ts; e2e/ha-discovery.spec.ts three water heater cases and one for the fallback of both; fixtures schaltli-boiler.json, ha-docs-water-heater-boiler.json
- [x] W2 Placed from the broker
  - e2e/bausteine.spec.ts «a boiler: its modes as buttons, the target temperature a slider, the current temperature named in its row»
- [x] W3 Handbook
  - handbuch/designer/bausteine.md: «Mehrere Teile» names the boiler, a paragraph on its parts and default range; checked against the maettel-humanizer catalog
- [x] Checkpoint: test:quick 2026-10-26: e2e 1692 passed, 1 skipped (a first run caught «water heater» in a comment, e2e/no-van-words.spec.ts; reworded); papers3 lane green; knob, 4v3b and the phone not reachable, skipped
