# Plan: ha-sensor-type

Spec: `docs/2026-10-14-topic-discovery.md`, module `ha-sensor-type`. A Home
Assistant sensor is a number only when its config says so - a unit, a
`state_class` or a numeric `device_class`; any other sensor is text. First
of five modules; next: `no-made-up-values`.

## Decisions taken here (to approve)

1. **The rule lives in `singlePart`** (`lib/ha-discovery.ts`, case
   `"sensor"`): numeric → `valuePart` as today; otherwise a `text` control
   (`{ kind: "text", read }`), which `buildFromCatalog` already places as
   a text beside the name, its topic typed `text`.
2. **Numeric device classes:** every sensor device class of Home Assistant
   but `date`, `enum` and `timestamp`, the three it documents as
   non-numeric. Written as the short exclusion list with a link to the
   source, not as the long inclusion list - a device class added by Home
   Assistant later is numeric, as there.
3. **Nothing the bridge publishes changes.** Every sensor of
   `integrations/vanpi/bridge-logic.js` carries a unit (tanks, battery,
   Autoterm, temperatures, minutes), so the demo and the van keep their
   blocks. Checked by the existing `e2e/vanpi-bridge.spec.ts` and
   `e2e/demo-van.spec.ts`.
4. **Rajiva's config as a fixture:** only the one whose content is known
   (the «Service ID» of the idea, `CamperServiceID/state`); the other two
   of his screenshot are not copied from memory.

## Tasks

- **H1 The rule.** `numericSensor(config)` in `lib/ha-discovery.ts`; the
  sensor case uses it. Test: cases in `e2e/ha-discovery.spec.ts` - no
  unit → text; only `unit_of_measurement`, only `state_class`, only
  `device_class: temperature` → value; `device_class: timestamp` and
  `enum` → text; the ESPHome temperature unchanged.
  Files: `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`.
- **H2 Rajiva's «Service ID» through the Block menu.** Fixture
  `e2e/fixtures/ha-discovery/rajiva-service-id.json`; an e2e case that
  retains it and `CamperVan_BiberTest` on a private broker, places the
  block and finds a text object reading the topic and the topic typed
  `text`. Files: fixture, `e2e/bausteine.spec.ts` or the Block menu's
  spec, whichever already places blocks from a broker.
- **H3 Handbook.** `handbuch/designer/bausteine.md`, row «Messwert
  (`sensor`)»: a sensor without unit, kind or measuring device class shows
  its value as text, as Home Assistant does. Through maettel-humanizer.

## Checkpoint

`npm run test:quick` green after each task; commits per task, pushed.
