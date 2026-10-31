# The Waveshare ESP32-S3-Touch-LCD-4 (`waveshare-4`): tasks

Plan: `tasks/waveshare-4-plan.md`. Firmware work is in `schaltli-firmware`
(next to this repo). The board is on COM10 since 2026-10-30 (Rev 4.0,
factory flash backed up); the knob's lane skips from now on.

## Phase 0: groundwork

## Task 1: Board profile in the 4.3B firmware, 4.3B unchanged

**Description:** Pull everything board specific out of
`src/boards/waveshare4v3b/` (resolution, pins, panel timing, backlight,
expander, panel init) into a profile header, and put the CH422G behind a
small expander interface (backlight, LCD reset, touch reset). No new feature.

**Acceptance criteria:**
- [x] The 4.3B env builds from the profiled code; `main.cpp` names no pin and no CH422G
- [x] 4.3B HIL (`hil/waveshare4v3b/orchestrator.js --rebake --dark`) 0 px, pixel-clock, bandwidth and setup-screen checks green (orchestrator on the text-styles project, 12/12 light and dark: `--rebake` needs a recovery copy, which only an MQTT deploy leaves)
- [x] Firmware host checks green (`pio test -e native`)

**Verification:**
- [x] `npm run test:quick` green, 4.3B lane included - all but `4v3b-internal-heap`, which fails the same on the firmware before T1 (see «Found on the way»)
- [ ] Manual: the 4.3B boots, a tap and a swipe work (boots: yes; tap and swipe by hand still open)

**Dependencies:** None
**Files likely touched:** `schaltli-firmware/src/boards/waveshare4v3b/{main.cpp,RgbPanel.h,Ch422g.h,DeviceInfo.h}`, new `BoardProfile.h`, `platformio.ini`
**Estimated scope:** M

## Task 2: The DDF

**Description:** `ddf-source-waveshare4/` with `device.json` (id
`waveshare-touch-lcd-4`, 480 × 480, 24 bit, touch, the features the 4.3B
declares), an adornment SVG drawn from Waveshare's dimensions with
`<rect id="screen">`, fonts from `build-typography-fonts.py` at the computed
px/mm. The zip goes into `public/ddf/`, and `test-all.js` checks it with
`generate-ddf-header.js --check`.

**Acceptance criteria:**
- [x] The designer offers «Waveshare ESP32-S3-Touch-LCD-4» for a new project and draws a screen in its frame
- [x] `test:all` fails when the zip and `ddf-source-waveshare4` differ (`waveshare4-ddf`)
- [x] e2e: the board is in `ddf-seed.ts` and in the device specs that list every board (layout, size scale, cut-out; navigator and popups got a 4" case; the energy diagram specs use the 4.3B as the colour board and list no boards)

**Verification:**
- [x] `npx playwright test e2e/adornment-screen-cutout-invisible.spec.ts e2e/size-scale.spec.ts e2e/layout-model.spec.ts`
- [x] `npm run test:quick`

**Dependencies:** None
**Files likely touched:** `schaltli-firmware/ddf-source-waveshare4/*`, `tools/build-typography-fonts.py`, `public/ddf/waveshare-touch-lcd-4.ddf.zip`, `hil/test-all.js`, `e2e/ddf-seed.ts`
**Estimated scope:** M

## Task 3: Env `waveshare-touch-lcd-4` compiles

**Description:** A profile for the 4": pin map and RGB timing from Waveshare's
Rev 4 demo, the ST7701 init over 3-wire SPI, a CH32V003 driver behind the
expander interface (from what `ST_CH32_IO` does, licence checked first). No
CH32V003 at 0x24 means: say «unsupported board revision» over serial and on
the glass if possible, and stop. Entry in `tools/release-firmware.js`.

**Acceptance criteria:**
- [x] `pio run -e waveshare-touch-lcd-4` builds; the 4.3B env still builds
- [x] `ST_CH32_IO` licence noted in the driver's header (or the driver is our own) - Apache-2.0, our own driver from what it does
- [x] `e2e/firmware-build.spec.ts` covers the new env

**Verification:**
- [x] `npx playwright test e2e/firmware-build.spec.ts`
- [x] `npm run test:quick`

**Dependencies:** T1, T2
**Files likely touched:** `schaltli-firmware/platformio.ini`, `src/boards/waveshare4/{BoardProfile.h,Ch32v003.h,St7701Init.h,DeviceInfo.h}`, `tools/release-firmware.js`
**Estimated scope:** M

## Checkpoint A
- [x] 4.3B HIL green at 0 px on the profiled firmware; `test:quick` green (but for the heap check below)
- [x] The designer offers the board; the 4" env builds
- [ ] Review with the user


## Status 2026-10-30 (evening)

T1-T3 done and committed (schaltli-firmware 79f718e, 3791a6f, 730a08f).
Ahead of the plan, the 4" was flashed over USB: it boots to the setup screen
with its QR code, GT911 at 0x5D, three framebuffers. The backlight PWM turned
out inverted against Waveshare's README (0 is brightest; their BSP does it so)
- fixed. Next: the user sets up WiFi and MQTT through the QR code (T5's manual
check), then T4's test pattern and pixel clock, T5, T6.

Found on the way, not part of this plan:
- `4v3b-internal-heap` (in test:quick since 13f2d06, today) fails on the
  firmware before T1 as well: the 240-screen project it installs leaves the
  4.3B too little internal RAM to start WiFi (`esp_wifi_init 257`), and the
  board stays off the network until its LittleFS is erased over USB. Every
  test:quick leaves it so.
- The 4.3B came home from the camper on a far access point (-88 dBm), which
  made the first test:quick fail half its 4.3B steps; a restart fixed it.
- Flaky in these runs, on boards this plan does not touch: PaperS3 charts-draw
  (18 px) once, PaperS3 popups (timeout) once, knob screen-graph (timeout)
  once, android-HIL (`adb uiautomator dump`) every time.

## Phase 1: bring-up on the board

## Task 4: Panel and backlight

**Description:** USB flash, test pattern on the glass: colours in order, no
offset, no tearing; backlight on and off through the CH32V003. Pixel clock
checked against WiFi like the 4.3B's. Measure px/mm on the glass and correct
the DDF if it differs.

**Acceptance criteria:**
- [x] Test pattern correct (photo), backlight switches - judged on the glass by the user (no photo); colours and edges right, display-off and wake work; the PWM is inverted against the README
- [x] No flicker with WiFi transmitting (a `pixel-clock-radio.js` run for this board) - at 12 MHz, not the BSP's 16
- [x] px/mm measured and in the DDF - 6.73 x 6.83

**Verification:**
- [x] `node hil/waveshare4v3b/pixel-clock-radio.js --device <ip>` green (the 4.3B's script, it takes any board)
- [x] Manual: the test pattern judged on the glass

**Dependencies:** T3
**Files likely touched:** `schaltli-firmware/src/boards/waveshare4/*`, `hil/waveshare4/pixel-clock-radio.js`
**Estimated scope:** S

## Task 5: Touch and setup mode

**Description:** GT911 through the shared driver, touch reset through the
expander; setup mode with its own WiFi `waveshare-touch-lcd-4-setup` and a
QR code; the 5 s hold to get back into setup. The setup-screen check made to
take this board.

**Acceptance criteria:**
- [x] A tap lands where it is drawn, in all four corners (`hil/touch-corners.js`, by hand)
- [x] Setup screen: QR code and text fit on 480 × 480; the countdown redraws only its line - stacked, text under the code
- [x] 5 s hold with a still finger opens setup, a moving finger restarts the count (by hand; its countdown no longer cut off)

**Verification:**
- [x] `node hil/waveshare4v3b/setup-screen.js --device <ip>` (or its generalised form) green
- [x] Manual: set up WiFi and MQTT from a phone through the QR code

**Dependencies:** T4
**Files likely touched:** `schaltli-firmware/src/boards/waveshare4/*`, `hil/waveshare4v3b/setup-screen.js`
**Estimated scope:** S

## Task 6: A designer project on the glass

**Description:** The shared renderer, MQTT, deploy, firmware update and the
test interface on the 4". A project deployed from the designer shows exactly
what the designer shows.

**Acceptance criteria:**
- [x] `hil/conformance/run.js` against the board: 0 px, light and dark (conformance 64/64 light; the orchestrator dark, text styles 12/12 and `--rebake --dark` 2/2)
- [x] Firmware upload lands in the other slot; the 4.3B's image is refused without a restart, and the other way round
- [x] Test interface off from the factory, on with the password (`hil/test-interface.js` knows COM10)

**Verification:**
- [x] `node -r ./hil/device-auth.js hil/conformance/run.js --device <ip>`
- [x] `node hil/firmware-upload.js --device <ip> --env waveshare-touch-lcd-4 --foreign-env waveshare-touch-lcd-4v3b`

**Dependencies:** T5
**Files likely touched:** `schaltli-firmware/src/boards/waveshare4/DeviceInfo.h`, `hil/test-interface.js`, `hil/boards-network.js`
**Estimated scope:** M

## Checkpoint B
- [x] Conformance 0 px; firmware upload lands, foreign image refused; an MQTT deploy lands (`deploy-check.js`)
- [ ] Review with the user

## Status 2026-10-31 (morning)

T4-T6 done (schaltli-firmware 5f55978, 4d9e6e9, 7fdedb8; designer 451cff6,
a40516f, e55a91e). The 4" is on 192.168.1.122. Found and fixed on the way:
the conformance navigator specimen's width (80 on the 4.3B by chance), the
setup screen and the hold countdown running off a 480 px panel, a measuring
pattern on a dark panel staying dark.

Open, for the user to weigh:
- The 4"'s WiFi: 170-300 KB/s for snapshots where the 4.3B on the same
  access point at the same signal does 700+, and it is touchy about how it
  lies (36 against 318 KB/s from turning it over). Enough for what it does.
  Once, after a failed upload, it answered ping but not HTTP until reset.
- `4v3b-charts-draw` failed once in test:quick (the NowPoint did not pulse
  between two snapshots) and passed alone right after.

## Phase 2: parity

## Task 7: Its own lane in test:all with the core checks

**Description:** A `4` lane in `hil/test-all.js` with the board's IP and
COM port (COM10): pixel HIL (the 4.3B's orchestrator, taking the device id from the
DDF), DDF `--check`, stalled snapshot, radio awake, late WiFi, firmware
upload (own and foreign image), OTA and designer firmware update, setup
screen, pixel clock. Skipped with a warning when the board is not reachable.

**Acceptance criteria:**
- [x] `test:all` and `test:quick` run the lane in parallel with the others
- [x] Board unplugged: the lane reports SKIPPED with the IP, never silently
- [x] `hil/README.md` names the lane and what it runs

**Verification:**
- [x] `npm run test:quick` with the board connected, and once without (designer 2fa3261)

**Dependencies:** T6
**Files likely touched:** `hil/test-all.js`, `hil/waveshare4v3b/orchestrator.js`, `hil/README.md`, `hil/boards-network.js`
**Estimated scope:** M

## Task 8: The feature HIL scripts on the 4"

**Description:** The scripts that already take `--device` run on the new
lane too: placeholder redraw, live-value redraw, navigator, screen graph,
popup, scaled values, energy diagram, size-scale text styles, layout
containers, big-icon redraw, pinch.

**Acceptance criteria:**
- [ ] Each of them green on the 4" in `test:all` - all but two in the run of
  2026-10-31 (46 min): `waveshare-ws4-bandwidth` failed for being faster than
  the 4.3B's floor (17.9 against 18 ms on a frame 60% the size; the floor now
  follows the frame), `ws4-conformance` for the link (snapshots at 17-30 KB/s
  under the full run's load, the second install timed out; green in
  test:quick). Afterwards the 4" answered ping but not HTTP, as once before.
- [x] A script that cannot run on it says why in the summary (the internal-heap
  check with its own large project stays the 4.3B's)

**Verification:**
- [ ] `npm run test:all`

**Dependencies:** T7
**Files likely touched:** `hil/test-all.js`, `hil/size-scale/text-styles.js`, `hil/layout/containers.js`, `hil/conformance/specimens.js`
**Estimated scope:** M

## Task 9: Flasher, factory image, release

**Description:** Entry in `flasher/boards.mjs` (hint: square, 480 × 480,
«Rev 4.0» on the back; note against the V3), factory image through
`hil/factory-flash/run.js`, the board in a firmware release and in
`firmware/manifest.json`.

**Acceptance criteria:**
- [ ] The flasher page lists the board and flashes a blank one over USB to the setup screen
- [ ] The manifest has an image and a factory image for `waveshare-touch-lcd-4`
- [ ] «Install release» in the Deploy dialog works on it

**Verification:**
- [ ] `npx playwright test e2e/flasher-page.spec.ts e2e/factory-image.spec.ts`
- [ ] `node hil/factory-flash/run.js` for the board
- [ ] `hil/firmware-designer.js --source release` on the board

**Dependencies:** T6
**Files likely touched:** `flasher/boards.mjs`, `firmware/manifest.json`, `hil/factory-flash/run.js`, `e2e/flasher-page.spec.ts`, `e2e/factory-fixtures.ts`
**Estimated scope:** M

## Task 10: Handbook

**Description:** `handbuch/geraete/waveshare-4.md` in the 4.3B page's
shape (at a glance, power, operation, back into setup, without WiFi), the board
in the overview table and the showcase, in `einrichten.md`, `flashen.md`
and `erste-schritte.md` where the boards are listed. Screenshot through
`handbook-screenshots.spec.ts`. Swiss spelling, humanizer before it counts.

**Acceptance criteria:**
- [ ] Page and overview describe the board as it behaves on the glass (power checked on the board, not copied)
- [ ] `e2e/handbook-labels.spec.ts` and `e2e/handbook-screenshots.spec.ts` green
- [ ] `maettel-humanizer` pass done

**Verification:**
- [ ] `npm run build --prefix handbuch`; `npm run dev --prefix handbuch` and look

**Dependencies:** T6 (facts), T9 (flasher)
**Files likely touched:** `handbuch/geraete/{waveshare-4.md,index.md,einrichten.md,flashen.md}`, `handbuch/.vitepress/theme/HomeShowcase.vue`, `e2e/handbook-screenshots.spec.ts`
**Estimated scope:** M

## Checkpoint C
- [ ] `npm run test:all` green with the new lane; a release with the board in it
- [ ] Handbook builds, `handbook-labels` green
- [ ] Review with the user

## Phase 3: for the forum

## Task 11: Sample project in CamperUI style

**Description:** Built from the 4"'s DDF like `deploy/demo/camper-project.ts`:
a Home screen (house battery, solar, fresh water, inside and outside
temperature), relays (incl. WiFi relays), tanks, heater (Autoterm block,
Truma where the bridge has it), navigator along the bottom. Every topic one
the VanPi bridge publishes, every command one it takes. Delivered the way
open question 4 decides.

**Acceptance criteria:**
- [ ] e2e like `demo-camper.spec.ts`: every topic read is published by the demo van, every one written is a bridge command, nothing overlaps on 480 × 480
- [ ] On the glass against the demo van: values arrive, a relay switches
- [ ] A tester can get it (download or in the designer) without asking

**Verification:**
- [ ] `npx playwright test e2e/demo-camper.spec.ts` (extended or its sibling)
- [ ] Manual: deploy to the board, switch a relay through the demo van

**Dependencies:** T2 (builder), T6 (glass), open question 4
**Files likely touched:** `deploy/demo/camper-project.ts` (or a sibling), `e2e/demo-camper.spec.ts`, handbook page that offers it
**Estimated scope:** M

## Task 12: Forum post draft

**Description:** Reply in thread 2732: Schaltli runs on the board they already
have, web flasher, sample project, back to CamperUI by flashing again. A
complement for people who want to design screens themselves, not a rival.
German (as the forum writes), humanizer pass, the user posts it.

**Acceptance criteria:**
- [ ] Draft names what works and what is untested
- [ ] Reviewed and posted by the user

**Dependencies:** T9, T10, T11
**Estimated scope:** XS

## Checkpoint D
- [ ] Sample project on the glass against the demo van; post reviewed by the user

## Status 2026-10-31 (afternoon)

- T9 in part (designer 2d8c438): flasher entry with the V3 note,
  factory-flash env, flasher-page and factory-image specs green (the real
  4" build merges into a sound image). Open: `hil/factory-flash/run.js` on
  the board (back up NVS 0x9000/0x5000 first, write it back after), release
  and manifest by the user.
- T10 (designer dc304a9): `handbuch/geraete/waveshare-4.md` and the lists;
  power from the user (green terminal block, 7-36 V, screw terminals);
  humanizer, handbook build and handbook-labels green. The homepage showcase
  stays three boards.
- The 4" stopped answering HTTP after test:all (ping fine) and COM10 is gone:
  waiting for the user to plug it back in.
