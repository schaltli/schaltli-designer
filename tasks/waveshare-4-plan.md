# Implementation plan: the Waveshare ESP32-S3-Touch-LCD-4 (`waveshare-4`)

Tasks: `tasks/waveshare-4-todo.md`. Occasion: the CamperUI thread in the
Pekaway forum (forum.pekaway.de/t/2732), where at least six people already own
this board. Schaltli on the board they have is the cheapest way for them to
try it; flashing back to CamperUI stays one web-flasher run away.

## Overview

A fourth board with full parity, «kein Zoo»: firmware in `schaltli-firmware`,
a curated DDF, a factory image and a release in the manifest, a flasher entry,
its own HIL lane in `test:all`, a handbook page. Then a sample project in the
style the forum knows from CamperUI (Home, relays, tanks, heater), built from
the board's own DDF the way `deploy/demo/camper-project.ts` builds the demo's.

Board: Waveshare ESP32-S3-Touch-LCD-4, **Rev 4.0**, SKU 28154. 4" IPS,
480 × 480, RGB interface (ST7701, initialised over 3-wire SPI), GT911 touch
at 0x5D, CH32V003 IO expander at 0x24 (Waveshare's own I2C protocol, library
`ST_CH32_IO`), PCF85063 RTC at 0x51, buzzer. The I2C addresses are from a Rev
4.0 boot log in the thread (#43).

**On the bench since 2026-10-30:** one board on COM10, in the USB port the
knob had (MAC 3c:dc:75:f7:5e:a4). ESP32-S3 v0.2, 16 MB flash (QIO), 8 MB
octal PSRAM: the 4.3B's memory, so its env settings (`qio_opi`,
`default_16MB.csv`) carry over. It came with Waveshare's ESP-Brookesia demo
(IDF 5.5.1, Nov 2025), whose boot log confirms ST7701 over 3-wire SPI and
GT911 at 0x5D (config version 79), and whose code calls
`custom_io_expander_new_i2c_ch32v003(…, 0x24, …)`: it is a **Rev 4.0**. The
whole 16 MB flash is backed up before anything is written, so the demo can go
back on and serve as a reference for pins and timings.

## Architecture decisions

- **One RGB-board firmware, two profiles.** The 4.3B's `src/boards/waveshare4v3b/`
  (3300-line `main.cpp`, `RgbPanel.h`, `Gt911.h`, `FollowSwipe.h`, …) is the
  closest relative: same S3 LCD peripheral, same GT911, same three
  framebuffers. A copy would drift from the first day. Instead the 4.3B's code
  gets a board profile (resolution, pins, panel timing, expander, backlight,
  panel init), and each env compiles it with its own. The 4.3B's HIL at 0 px
  proves the split changed nothing, and it runs before any 4" hardware exists.
- **The expander behind an interface.** CH422G (4.3B) and CH32V003 (4") offer
  the same few things: backlight, LCD reset, touch reset, plus a buzzer on the
  4". `main.cpp` only sees that interface.
- **The DDF first.** With `ddf-source-waveshare4/` and its zip in `public/ddf/`,
  the designer can design for the board, and the e2e side (layout, size scale,
  energy diagram, navigator on a square that is not round) can be done
  before the boards arrive. px/mm is computed from Waveshare's drawing
  (≈ 6.7 px/mm), then measured on the glass.
- **Rev 4.0 only.** The V3 has a different expander (TCA9554) and is being sold
  off cheaply (thread #61–#66). The firmware recognises no CH32V003 at 0x24,
  says so on the glass and over serial, and does not guess.
- **Device id `waveshare-touch-lcd-4`**, after Waveshare's own name, in the
  same form as `waveshare-touch-lcd-4v3b`. Projects store it, so it is fixed
  before the DDF ships.
- **The knob is off the bench for good.** The 4" takes its USB port. The
  knob's lane in `test:quick` and `test:all` stays and reports SKIPPED with
  a warning, as for any board that is not reachable; nothing is deleted.
- **RS485 and CAN later.** The board has both (the demo starts them); this
  plan leaves them unused, they become an idea of their own once the board
  runs.
- **The sample project is built, not stored**, the way the demo's camper
  project is: from the DDF, with topics the VanPi bridge publishes and
  commands it takes, held to that by an e2e spec.

## Dependency graph

```
T1 board profile (4.3B unchanged) ──┐
T2 DDF + zip ──────────────────────┼── T3 env compiles (CH32V003, ST7701, pins)
                                   │          │
                                   │          │
                                   └── T4 panel + backlight on the glass
                                              │
                                        T5 touch + setup screen
                                              │
                                        T6 renderer, WiFi/MQTT, deploy, test interface
                                              │
                    ┌─────────────────────────┼──────────────────┐
              T7 core HIL lane          T9 flasher, factory   T10 handbook
                    │                     image, release          │
              T8 feature HIL                  │                   │
                    └──────────┬──────────────┴───────────────────┘
                         T11 sample project ── T12 forum post
```

T1 and T2 are independent of each other and of the hardware. T11's builder
needs only T2; its check on the glass needs T6. With the board on the bench,
Phase 1 follows Checkpoint A directly; nothing waits for a delivery.

In every `test:quick` from here on, the knob's lane reports SKIPPED; that is
expected and not a failure.

## Task list

### Phase 0: groundwork
- [ ] T1: Board profile in the 4.3B firmware, 4.3B unchanged
- [ ] T2: The DDF: `ddf-source-waveshare4/`, zip in `public/ddf/`, `--check` in test:all
- [ ] T3: Env `waveshare-touch-lcd-4` compiles: CH32V003, ST7701 init, pin map

### Checkpoint A
- [ ] 4.3B HIL green at 0 px on the profiled firmware; `test:quick` green
- [ ] The designer offers the board for a new project; the 4" env builds
- [ ] Review with the user

### Phase 1: bring-up on the board
- [ ] T4: Panel and backlight: a test pattern, no flicker with WiFi on
- [ ] T5: Touch and setup mode: setup screen with QR code, 5 s hold
- [ ] T6: A designer project on the glass at 0 px; WiFi, MQTT, deploy, test interface

### Checkpoint B
- [ ] Conformance run 0 px; firmware upload lands, foreign image refused
- [ ] Review with the user

### Phase 2: parity
- [ ] T7: Its own lane in test:all with the core checks
- [ ] T8: The feature HIL scripts run on it too
- [ ] T9: Flasher entry, factory image, release in the manifest
- [ ] T10: Handbook page and the device overview

### Checkpoint C
- [ ] `npm run test:all` green with the new lane; a release with the board in it
- [ ] Handbook builds, `handbook-labels` green
- [ ] Review with the user

### Phase 3: for the forum
- [ ] T11: Sample project in CamperUI style for the 4"
- [ ] T12: Forum post draft

### Checkpoint D
- [ ] Sample project on the glass against the demo van; post reviewed by the user

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Splitting the 4.3B firmware breaks it | High | T1 changes structure only; 4.3B HIL at 0 px and the pixel-clock and bandwidth checks before and after |
| CH32V003 protocol undocumented, `ST_CH32_IO` licence unclear | Med | Read Waveshare's library first (T3); if the licence does not allow it, write the few register writes ourselves from what it does. The factory demo drives the expander on this very board, so its behaviour is the reference |
| ST7701 init sequence or timings wrong | Med | Take them from Waveshare's Rev 4 demo (the one that came on the board, backed up); T4 checks on the glass before anything else |
| RGB flicker under WiFi (the 4.3B's pixel-clock lesson) | Med | Pixel-clock check as in `pixel-clock-radio.js` in T4 |
| Internal RAM tight (CamperUI needed 128 KiB LVGL heap) | Med | We don't use LVGL; watch `internal-heap.js` from T6 on |
| The two boards behave differently (thread #68) | Low | HIL on one, the other as a check for T6 and T9 |
| A tester has a V3 instead of Rev 4.0 | Med | The bench board is Rev 4.0; the firmware refuses a V3 out loud (T3), the flasher hint names «Rev 4.0» (T9) |

## Decisions (2026-10-30)

1. Device id `waveshare-touch-lcd-4`.
2. One firmware with two profiles instead of a copy; the 4.3B's code changes
   in T1 without any new feature.
3. Rev 4.0 only, no V3.
4. Buzzer silent and RTC unused, as on the 4.3B.
5. The knob stays off the bench; its lane skips with a warning.
6. RS485 and CAN later, not in this plan.

## Open question

How does the sample project reach the testers: a file to download from the
handbook, or offered in the designer when creating a project? Needed by T11.
