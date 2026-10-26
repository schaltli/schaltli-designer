# Todo: ha-siren-event-update

The next round of the 2026-10-26 overview, asked for by the user the same
day: three components the existing controls can show. Sources (branch
`dev`, read 2026-10-26): `homeassistant/components/mqtt/siren.py`,
`event.py`, `update.py` and their pages in source/_integrations/.

Decisions:
- **siren**: Power a switch. Without a command template Home Assistant sends JSON, `{"state":"ON"}` / `{"state":"OFF"}`; with `{{ value }}` the payload itself; any other template leaves it to be read. The off command takes `command_off_template`, else `command_template`. Its state: `state_on`/`state_off`, else the payloads, through `state_value_template`. Where JSON goes and it has `available_tones`, a Tone part: a button per tone sending `{"state":"ON","tone":"<tone>"}`.
- **event**: one part, the type of the last event as text, `state_topic#event_type`. A value template building that JSON is not followed: not supported.
- **update**: Installed version, Latest version, Install (only where `payload_install` is set: no default). Without `value_template` and without `latest_version_topic` only the JSON state can carry both, so both are read from its fields; otherwise each as it comes, through its template.
- New helper `isPayloadTemplate` (`{{ value }}`); used for siren and event only. Other components still refuse it as a command template - worth a look of its own.

- [x] X1 The parts
  - `case "siren"`, `case "update"` in `partsOf`, `case "event"` in `singlePart` (lib/ha-discovery.ts); e2e/ha-discovery.spec.ts eight cases; fixtures ha-docs-siren-intrusion.json, ha-docs-siren-tasmota.json, ha-docs-event-doorbell.json, ha-docs-event-desk-button.json, ha-docs-update-shelly.json, schaltli-display-firmware.json
- [x] X2 Placed from the broker
  - e2e/bausteine.spec.ts «a siren: power sending JSON, a button per tone», «an update: both versions named in their rows, Install a button sending its payload», «an event: the type of the last one beside its name»
- [x] X3 Handbook
  - handbuch/designer/bausteine.md: row «Ereignis (`event`)», paragraphs on siren and update under «Mehrere Teile»; checked against the maettel-humanizer catalog
- [x] Checkpoint: test:quick 2026-10-26: e2e 1712 passed, 1 skipped; papers3 lane green; knob, 4v3b and the phone not reachable, skipped
