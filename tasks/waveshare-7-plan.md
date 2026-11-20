# Plan: the Waveshare ESP32-S3-Touch-LCD-7 (`waveshare-7`)

Tasks: `tasks/waveshare-7-todo.md`. Occasion: Pekaway forum thread 2781,
#19-#21 (2026-11-12): Tobi asked for a 7" display; the user offered a test
program for his Windows PC; Tobi has an ESP32-S3-Touch-LCD-7 (800 × 480) lying
around and wants to try. There is no 7" on the bench.

## What we know

Waveshare's own board configuration for the 7"
(`waveshareteam/ESP32-S3-Touch-LCD-7`,
`examples/Arduino/examples/10_lvgl_v9_demo/esp_panel_board_custom_conf.h`)
and the one for the 4.3B (same path in `ESP32-S3-Touch-LCD-4.3B`) differ
only in the board name, plus a 1024 × 600 branch on the 4.3B side. The
800 × 480 values are identical (diffed 2026-11-12):

- panel ST7262, RGB, 16 MHz, HPW/HBP/HFP 4/8/8, VPW/VBP/VFP 4/8/8
- RGB pins DE 5, VSYNC 3, HSYNC 46, PCLK 7, DATA0 14 … (the 4.3B's pin map
  in `schaltli-firmware/src/boards/waveshare4v3b/BoardProfile.h`)
- GT911 touch on SDA 8 / SCL 9, INT 4
- CH422G expander on the same bus, backlight switched through it

The 4.3B firmware runs at 12 MHz, not 16 (WiFi, see its BoardProfile.h).
Product page: 16 MB flash, 8 MB PSRAM (the 4.3B's memory), 5 V 450 mA, two
USB-C ports (USB-to-UART and native USB), TF slot, CAN, RS485, I2C, a Li-ion
connector with charging. Active area is not stated on the page.

So the 7" is, electrically, a 4.3B with a larger glass. This turns the
«test program that tries settings» into a fallback: first see whether the
4.3B firmware as it is runs on Tobi's board.

## Decisions

1. **Step one needs no new code.** Tobi flashes the 4.3B's current factory
   image with the web flasher (Chrome or Edge on Windows, choosing the
   4.3B). If picture and touch work, the board is supported by a profile
   that only changes the DDF and the device id. The handbook-facing
   «test program» is then the web flasher.
2. **The sweeping probe only if step one fails.** A probe build of the
   RGB firmware cycles a few known-good timing sets (Waveshare's 16 MHz, our
   12 MHz, a slower 10 MHz; porches as Waveshare's and as the 4"'s) and
   shows a numbered colour-bar screen for each; it probes the GT911 at 0x5D
   and 0x14 and the CH422G and prints everything over serial, which the
   web flasher's log shows. Tobi says which number looks right and sends the
   log. Nothing is written to the board beyond the flash itself.
3. **Its own device id `waveshare-touch-lcd-7`**, as with the 4" - the
   designer must draw a 7" frame and scale fonts by its own px/mm, which a
   4.3B id would get wrong. Fixed before the DDF ships.
4. **One firmware, a third profile.** The env reuses the 4.3B's profile
   directory for pins, timings and the CH422G and adds its own `DeviceInfo.h`
   and `ddf_zip.h`; no copy of `BoardProfile.h` unless step one shows a
   difference.
5. **No HIL lane until there is a board on the bench.** «Kein Zoo» holds
   for features; for testing, its lane would only ever SKIP. The handbook
   says the board is tested by a user, not on the bench (open question 1).

## Dependency order

```
T1 Tobi: 4.3B image via the web flasher, photos + log
 ├ works ─────────────── T3 DDF (id, px/mm, frame) ── T4 env + release ── T5 flasher + handbook
 └ no picture / no touch ─ T2 probe build ─ Tobi runs it ─┘
                                            Checkpoint A: Tobi sees a designer project on his 7"
```

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tobi's board is another hardware revision than Waveshare's config | Medium | Photo of the back before T1; the 4.3B firmware says over serial what it found (CH422G, GT911 address) |
| He flashes the 4.3B image and the screen stays dark | Low | Nothing is lost: the flasher can write Waveshare's own demo back, or our probe (T2). Said in the forum post before he starts |
| The 4.3B image announces itself as a 4.3B in the designer | Low | Expected during T1; he does not deploy to it until T4 |
| 12 MHz on a larger glass flickers or tears | Medium | T2's timing sets include Waveshare's 16 MHz; `?set=pclk=` exists in the firmware for exactly this (4.3B profile comment) |
| Which of the two USB-C ports the flasher needs | Low | Same as the 4.3B's UART port; the handbook page names it with a photo |
| No board here: every later change is tested only by Tobi | High for the long run | Open question 1 |
| Active area unknown, px/mm guessed | Low | Measure on the glass from Tobi's photo with a ruler in it, as on the 4" (T3) |

## Open questions

1. Does a 7" come onto the bench (with its own HIL lane), or does it stay
   «tested by a user»?
2. The forum post to Tobi: say now that step one is just the web flasher
   with the 4.3B image, or wait until the plan is approved?
