# Plan: ha-text - a text the screen can write

First of the three components left from the 2026-10-26 overview that need
input the devices do not have yet: `text` (this plan), then `time` (a time
picker, a heater's start time), then `alarm_control_panel`. Asked for by
the user 2026-10-27; every device types, the layout follows a language
setting of the device (the user, 2026-10-27).

Source: `homeassistant/components/mqtt/text.py`, `mqtt/const.py`. An MQTT
text has `command_topic` (required), `command_template`, `state_topic`,
`value_template`, `min` (0), `max` (255), `mode` (`text` | `password`),
`pattern` (a regular expression Home Assistant checks before it sends).

Repos: `schaltli-designer`, `schaltli-firmware` (4.3B, Knob, PaperS3),
`schaltli-android`.

## What the code says

- The catalog already has a control kind `text`, but it only reads (a
  sensor that is not a number, a cover's state). Nothing on a screen writes
  a text today; a `text` entity is listed as unsupported.
- The firmware had a touch keyboard on the Knob (2026-08-18, `55ef4da`,
  `e50e34c`) and removed it the next day: text was only needed at setup,
  and the captive portal does that for every board. What was learnt then:
  LVGL's keyboard, sized 260×150 and set 45 px below the centre, stays
  inside the round bezel; a character ring turned by the knob worked but
  was slower than tapping; this panel's presses release after about
  225 ms. LVGL's keyboard is still compiled in, but the screens are now
  drawn by `ColorScreenRenderer` into its own canvas, LVGL only shows it:
  a keyboard is drawn by the renderer, like a popup.
- A DDF carries its fonts whole (helvR18: 754 glyphs, Latin Extended), so
  the keys and what is typed can use the project's font.
- Settings of the device, not of the project, live in NVS and on the
  device's own settings page (`src/DeviceSettings.h`, decided 2026-08-23:
  a deploy must not reconfigure the device it lands on). There is no
  language setting yet.
- The app draws every object itself (`render/`), but runs on Android: it
  can ask the system keyboard for a text.

## Decisions taken here (to approve)

1. **A new object: «Text field».** `type: "text-field"`, among the
   operating objects. It shows a topic's value in a field and, tapped,
   lets you type a new one and sends it to its write topic. Properties:
   Topic, Write topic, «Min length» (0), «Max length» (1-255, 255), «Hide
   text» (dots instead of letters, HA's `password`), the field's colours
   and font as a slider's. Not an option of the Text object: that one is
   for showing, with live values and rules, and stays so.
2. **Every device types.** A tap on the field opens a keyboard on the
   4.3B, the Knob, the PaperS3 and the phone.
3. **The layout is a device setting: «Keyboard».** On each board's
   settings page, stored in NVS beside the display timeout: `de-CH`,
   `de-DE`, `en-US`. Not in the project, for the reason
   `DeviceSettings.h` gives. The default follows the browser (the user,
   2026-10-27): the setup portal and the settings page send
   `navigator.languages`, and a device with nothing stored keeps the first
   that maps - `de-CH`/`de-LI` → `de-CH`, any other `de` → `de-DE`, `en` →
   `en-US`; nothing maps: `en-US`. Until a browser has been seen (a board
   set up before this), `en-US`. The layouts:
   - `de-CH`: QWERTZ, ü ö ä right of P and L, with shift è é à.
   - `de-DE`: QWERTZ, ü ö ä, ß.
   - `en-US`: QWERTY, no umlauts.
   Each with a shift key and a layer for digits and signs.
   The phone has no such setting: it uses the system keyboard, whose
   layout follows the phone's own language - with dictation and the
   user's layout for free.
4. **The board keyboards.** Typing goes at the end only, no cursor to
   move; backspace, space, «Cancel», «OK»; the text so far with its count
   («12/255») above the keys.
   - 4.3B (800×480): an overlay over the lower half, keys about 72×56.
   - Knob (360 round): the text above, the keys 260×150 below the centre,
     as tested 2026-08-18; the knob does nothing while it is open.
   - PaperS3 (540×960 e-paper): the keys over the lower third, large;
     each key redraws only the text line in the fast partial mode, the
     screen is refreshed whole when the keyboard closes. The time from tap
     to letter is measured (F3) and goes in the handbook if it is long.
5. **Length counts characters, the device enforces it.** Min and max count
   characters (code points), as Home Assistant's `len()` does. Keys stop at
   max; «OK» is grey below min. What is sent is UTF-8, as it stands.
6. **Writing as a slider writes.** «OK» publishes the text on the write
   topic, with the retain the other writes use. Until the topic reports
   back the field shows what was sent; without a read topic it keeps
   showing it (HA's optimistic text).
7. **One feature in the DDF: `"text-field"`.** As `"scaled-values"`: every
   device announces it; deploy asks for it when the project has a text
   field, updates a board's firmware first, asks for an app update.
8. **The import.** An MQTT `text` becomes a catalog control `{ kind:
   "text-field", read?, write, min, max, hidden? }` and a placed block a
   Text field. A `command_template` other than `{{ value }}` leaves it
   read-only, as a text, with the reason (a typed text put into JSON would
   need escaping Home Assistant does not do either). An entity with a
   `pattern` is read-only too, with the reason «a pattern»: a device does
   not check a regular expression, and sending what HA would have refused
   is worse than not sending (the same choice as a lock with
   `code_format`).

## Tasks

### Designer

- **D1 The object.** Type, default size, canvas drawing (field, value or
  dots, the hint when empty), property panel (decision 1), the preview: a
  tap opens a browser input line and «OK» publishes to the broker. Test:
  `e2e/text-field.spec.ts` (panel, drawing, a preview tap that publishes,
  min/max, hidden). Fixture `e2e/fixtures/property-panel-controls.json`
  regenerated.
- **D2 Export and deploy.** Both exports (boards, Android) carry the
  object; the feature of decision 7 in `lib/deploy-plan.ts` beside
  `scaled-values`. Test: extend `e2e/deploy-plan.spec.ts` and the export
  spec.
- **D3 The import.** `case "text"` in `lib/ha-discovery.ts` (decision 8),
  the block places a Text field. Test: `e2e/ha-discovery.spec.ts` (plain,
  password, template, pattern, no state topic), `e2e/bausteine.spec.ts`.
- **D4 Handbook.** A section on the Text field in
  `handbuch/objekte/bedienen.md` (how each device types), «Keyboard» in
  `handbuch/geraete/einrichten.md` (the device settings), a paragraph in
  `handbuch/designer/bausteine.md`. Through `maettel-humanizer`.

### Firmware

- **F1 Drawing on all three boards.** Loader and `ColorScreenRenderer`:
  the field, its value or dots, the asked value until it comes back. The
  feature in the three DDF sources. Test: a specimen in
  `hil/conformance/specimens.js` (empty, text, hidden, too long for the
  field: cut with «…»).
- **F2 The keyboard, shared.** Layouts (decision 3) as data, the typed
  text, length rules, shift and layers, «Cancel» and «OK», publish - one
  piece of code, the key geometry per board. The «Keyboard» setting on the
  settings page and in NVS. Test: native unit tests under `test/` for the
  layouts and the length rules (a code point is not a byte).
- **F3 Per board.** Geometry, hit test and drawing on the 4.3B, then the
  Knob, then the PaperS3 (its partial refresh). Test: a HIL script per
  board that taps the field, types «Grüezi 1» by taps with `de-CH`, «Straße»
  with `de-DE`, presses «OK» and reads the broker; one that stops at max,
  one that cancels; on the PaperS3 also the time from tap to letter.

### Android

- **A1 The app.** Drawing as F1, a tap opens the system keyboard with the
  value, «OK»/Enter publishes, back cancels; length rules; the feature in
  the DDF. Test: a screen in `hil/android/fixtures/build-android-test.js`
  typed by `adb shell input text`, compared with the designer's preview.

### Checkpoint

`npm run test:all`, COM3 logged (memory «4.3B-Panic unter Last»).

## Not in this plan

`time`, `alarm_control_panel` (next plans, they reuse the keyboard's
overlay); moving a cursor inside the text; checking a `pattern` on the
device; more layouts than the three.
