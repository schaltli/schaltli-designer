# lilygo-t-encoder-pro - todo

Plan: `tasks/lilygo-t-encoder-pro-plan.md`. Firmware work in
`schaltli-firmware` (branch `t-encoder-pro`). Device lanes touched, so each
code task: `npm run typecheck`, then `npm run test:quick` (CLAUDE.md); name the
test added and the handbook page changed when reporting.

- [x] T1 Knob `BoardProfile.h` / `BoardHardware.h`: pins, panel, touch read, panel lit/unlit, early-boot pin releases, encoder, recorder pins out of `src/main.cpp`; the round setup screen (`CanvasDisplayAdapter`) sized from `BOARD_SCREEN_SIZE`.
  - 2026-11-22: knob builds, installed over WiFi (firmware-upload PASS); knob lane in test:quick.
- [x] T2 `src/boards/lilygotencoderpro/` + env `lilygo-t-encoder-pro`: SH8601 390 px at 40 MHz, power GPIO 3, displayOff/On as dark/lit, CHSC5816, `QuadratureEncoderReader` (2 steps/detent), push key GPIO 0 -> `button-2` (`pollKey` in main.cpp, a press on a dark screen only wakes), `dispatchedPresses` in /api/debug; `tools/release-firmware.js`.
  - 2026-11-22 on COM9 (192.168.1.58): setup screen, WiFi by the QR code (the user), every input through `hil/tencoder/input-check.js` PASS (clockwise = Rotate Right; a wake press dispatches nothing). Stock flash in `hil/factory-flash/lilygo-t-encoder-pro-stock-16MB.bin`.
  - USB-C sits at 11 o'clock seen from the front with the screen upright (the user).
- [x] T3 DDF `ddf-source-lilygotencoderpro/`: 390 × 390 round, 30.48 mm (12.80 px/mm), adornment with three buttons, 56 fonts (build-typography-fonts.py, Seven Segment 79 px); `public/ddf/lilygo-t-encoder-pro.ddf.zip` (1.37 MB); freshness step `tencoder-ddf` in test:all; in ddf-seed (seedTencoderDdf), adornment-screen-cutout-invisible, factory-image, firmware-build, new-project, size-scale, handbook-screenshots.
- [x] T4 HIL lane `tenc` in test:all (TENCODER_DEVICE, ROUND_FIRMWARE). The scripts that told the ring by `/knob/` now read the round screen (charts-actions, local-topics, popup).
  - Found on the way: the keyboard's `keyboardFont` walked every larger font when a label fit none - «Cancel» on the T-Encoder Pro: 10.8 s loop stall, then a blank key. Fixed in ColorScreenRenderer (stop at the first too-wide larger font; a cross for Cancel); `hil/text-field.js` checks every key shows something (1b).
  - `tenc-live-values` 2 px off on the thermometer's edge (one RGB565 step): the designer's preview drew a top-level live icon straight onto the screen, while the export bakes each of its icons at the origin. Fixed in `render-icon.ts` (a live icon takes `rasterisedIcon` as a nested one does); 0 px on the T-Encoder Pro, test:quick 2026-11-22 (the rest failed only under load, each PASS alone).
  - The knob hung once after a test:quick (ping yes, HTTP no); not again in two more runs with COM4 logged. Its WiFi is weak (-76 dBm).
- [x] T5 Flasher entry, handbook page `geraete/lilygo-t-encoder-pro.md` (revision, top, ring and press, burn-in, boot key), geraete/index, einrichten, einfuehrung/index, designer/tasten, designer/baugruppen, objekte/bedienen, sidebar; humanizer.
  - The newer revision's `handbuch-macke`: issue #84.
- [ ] Checkpoint A: the user deploys a designer project, turns and presses.
- [ ] T6 Release (the user's decision).
