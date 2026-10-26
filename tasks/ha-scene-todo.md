# Todo: ha-scene

Fifth of the missing components of the 2026-10-26 overview. Source:
`homeassistant/components/mqtt/scene.py` (branch `dev`, read 2026-10-26)
and source/_integrations/scene.mqtt.markdown. Asked for by the user
2026-10-26.

Decisions:
- A scene is a press like a `button`: one part, `command_topic` with `payload_on`.
- `payload_on` defaults to "ON" as the docs say; scene.py has no default.

- [x] S1 The part
  - `case "scene"` in `singlePart` (lib/ha-discovery.ts); e2e/ha-discovery.spec.ts «the docs' scenes …»; fixtures ha-docs-scene-party.json, ha-docs-scene-json.json
- [x] S2 Placed from the broker
  - e2e/bausteine.spec.ts «a scene: a button named after it, sending its payload»
- [x] S3 Handbook
  - handbuch/designer/bausteine.md: row «Szene (`scene`)»; checked against the maettel-humanizer catalog
- [x] Checkpoint: test:quick 2026-10-26: e2e 1698 passed, 1 skipped; papers3 lane green; knob, 4v3b and the phone not reachable, skipped
