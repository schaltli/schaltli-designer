# Plan: ha-cover

Home Assistant's `cover` (awning, roof hatch, blind, step) in the Block
menu. First of the components the 2026-10-26 overview ranks as missing.
Decided the same day: an entity is taken apart into ordinary controls as
today, no entity object on the devices and no stored reference to where a
block came from (memory `ha-entitaeten-frei-zerlegt`). So no firmware
change: every part is a control kind the devices already draw.

Source: `homeassistant/components/mqtt/cover.py` (branch `dev`, read
2026-10-26). Keys and defaults: `command_topic` with `payload_open`
"OPEN", `payload_close` "CLOSE", `payload_stop` "STOP", each nullable -
null drops that action; `state_topic` reporting `state_open` "open",
`state_opening` "opening", `state_closed` "closed", `state_closing`
"closing", `state_stopped` "stopped"; `position_topic` (read) and
`set_position_topic` (write, requires `position_topic`) between
`position_closed` 0 and `position_open` 100; `tilt_status_topic` and
`tilt_command_topic` between `tilt_min` 0 and `tilt_max` 100. Templates:
`value_template`, `position_template`, `tilt_status_template` (read),
`set_position_template`, `tilt_command_template` (write).

## Decisions taken here (to approve)

1. **Parts, in this order:** «State», «Open», «Stop», «Close»,
   «Position», «Tilt». From the coarse to the detail, as fan and climate;
   the state first so it stands beside the name in the block's first row,
   as Home Assistant's tile shows «Markise · Open».
2. **Open, Stop and Close are three `button` parts**, not one button
   group: each can be left out, made large or moved on its own (the
   user's point of 2026-10-26: a big button, or none). A payload set to
   null leaves its button out, as Home Assistant drops the feature.
3. **A button part names itself by its part** («Open»), not by the
   entity's name: today a `button` control takes the entry's label as its
   text, which is right for a `button` entity alone and wrong for three
   buttons all saying «Markise». Applies wherever a button is a part of
   several (`bare`), so a block description's button parts keep their own
   label where they give one.
4. **State is a `text` control**, showing the word the cover reports
   ("open", "closing" …) as it comes. No mapping to other words: the
   device shows what the broker says, as for a non-numeric sensor.
5. **Position** is a `level` from `position_closed` to `position_open`
   with `percent` (Home Assistant shows a cover's position in percent, as
   a light's brightness, #72) where `set_position_topic` is set; only
   `position_topic`: a read `value` as a fill (`level: true`), since a
   position always is one. **Tilt** likewise from `tilt_min` to
   `tilt_max`.
6. **Templates** as everywhere: a read template the JSON path can express
   is used, any other skips the part; a write template skips writing.
7. **Not supported:** a cover without `state_topic` whose state Home
   Assistant derives from the position (the position part shows it
   anyway), `optimistic`, and the stopped-means-closed rule.

## Tasks

- **C1 The parts.** `case "cover"` in `partsOf` (`lib/ha-discovery.ts`);
  a `buttonPart` helper beside `switchPart`; the read-only position as a
  fill. Test: cases in `e2e/ha-discovery.spec.ts` - the full awning of the
  overview (six parts, in order, ranges and payloads); a null
  `payload_stop` (no Stop); position read-only (a fill value); a
  `set_position_template` (Position read-only); a cover with nothing
  usable (unsupported, with reason). Fixture
  `e2e/fixtures/ha-discovery/cover-awning.json`.
  Files: `lib/ha-discovery.ts`, `e2e/ha-discovery.spec.ts`, fixture.
- **C2 A button part names itself.** `buildFromCatalog`, case `button`:
  `bare` and a part → the part's name (or a description's label) as the
  text. Test: the awning placed through the Block menu from a private
  broker - a table with the state beside the name, three buttons «Open»,
  «Stop», «Close» each sending its payload, the position as a slider;
  leaving Stop unticked places two buttons. Files: `lib/bausteine.ts`,
  `e2e/bausteine.spec.ts` (or the Block menu's spec that already places
  from a broker).
- **C3 Handbook.** `handbuch/designer/bausteine.md`: a row «Abdeckung
  (`cover`)» in the table of what each announcement becomes. Through
  maettel-humanizer.

## Checkpoint

`npm run test:quick` green after each task; a commit per task.
