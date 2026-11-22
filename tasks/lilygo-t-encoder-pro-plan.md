# Plan: the LilyGO T-Encoder Pro (`lilygo-t-encoder-pro`)

Tasks: `tasks/lilygo-t-encoder-pro-todo.md`. Occasion: the user connected one
on 2026-11-22 (COM9) and asked how much work supporting it is.

## What we know (probe 2026-11-22)

A probe firmware (scratchpad, not in a repo) ran on the bench unit:

| Part | Found | Note |
|---|---|---|
| SoC | ESP32-S3R8, 16 MB quad flash, 8 MB octal PSRAM | the knob's memory: `qio_opi`, `default_16MB.csv` |
| Panel | **SH8601** AMOLED, 390 × 390 round, QSPI CS 10, SCLK 12, D0-D3 11/13/7/14, RST 4, power enable GPIO 3 | Arduino_GFX `Arduino_SH8601`, 40 MHz; colours right; a square at odd x/y drawn clean, so no even-address rounding |
| Touch | **CHSC5816** at 0x2E, SDA 5, SCL 6, RST 8, INT 9 | register 0x2000002C (4 address bytes), 8 bytes: `FF`, fingers, x lo, y lo, z, x hi \| y hi << 4, event; coordinates match the panel |
| Encoder | quadrature on GPIO 1/2, **2 steps per detent**; push key GPIO 0 (the boot strap) | the knob's is a pulse encoder, so a second decoder |
| Buzzer | GPIO 17, LEDC | works; not used (no feature asks for one) |

LilyGO also ships a newer revision (CO5300 panel + CST816 touch, same pins
per their `pin_config.h`). Not on the bench.

Stock flash backed up: `hil/factory-flash/lilygo-t-encoder-pro-stock-16MB.bin`
(git-ignored).

## Decisions

1. **One firmware, a second profile of the knob's.** `src/main.cpp` is the
   knob's firmware and holds its pins, panel, touch chip and backlight
   inline. They move into `src/boards/waveshareknob1v8/BoardProfile.h`; the
   T-Encoder Pro gets `src/boards/lilygotencoderpro/` with its own
   `BoardProfile.h`, `DeviceInfo.h`, `ddf_zip.h`. `main.cpp` keeps no board
   name and no pin. Same pattern as the RGB boards.
2. **Device id `lilygo-t-encoder-pro`**, name «LilyGO T-Encoder Pro», env of
   the same name extending the knob's.
3. **Turning is the knob's contract:** `button-0` «Rotate Left», `button-1`
   «Rotate Right», one dispatch per detent. **The push key is a third
   button, `button-2` «Press»**, an ordinary hardware button in the
   adornment SVG, so the designer offers it without new code.
4. **Display off is the existing blanking.** No backlight: the profile's
   `panelLit(false)` sends display off (SH8601 0x28) and power stays on.
   Against AMOLED burn-in the handbook points to «Display off after»; no
   new feature (no pixel shift, no dimming).
5. **Only the bench revision is supported and said so.** The CO5300/CST816
   revision would need its panel driver and the knob's CST816 code chosen at
   run time by probing 0x15/0x2E; that is a later task when someone has one.
6. **Its own HIL lane `tenc`**, since the board is on the bench: the knob's
   smoke test and the board-agnostic steps the knob runs.
7. **Screen size**: 1.2" round = 30.48 mm diameter (LilyGO states only the
   diagonal), 12.8 px/mm. Fonts sized for it like every other DDF.

## Dependency order

```
T1 knob BoardProfile (refactor, knob unchanged) ── knob lane green
 └ T2 T-Encoder Pro profile + env (panel, CHSC5816, quadrature, key)
    └ T3 DDF ddf-source-lilygotencoderpro + designer seeds/specs
       └ T4 HIL lane tenc + fixtures
          └ T5 flasher + handbook
             └ Checkpoint A: a designer project on the T-Encoder Pro, turned and pressed
                └ T6 release (the user's)
```

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The refactor changes the knob | High | Knob builds byte-identical where possible; knob lane in test:quick before T2 |
| GPIO 7/8 are panel/touch pins here, the knob's recorder and RTC-hold release touch them | High (dead panel) | Recorder pins and early-boot releases come from the profile |
| GPIO 0 is the boot strap: holding the key at power-on enters download mode | Low | Expected ESP32 behaviour; handbook says so |
| SH8601 at 80 MHz garbles | Low | Start at LilyGO's 40 MHz; try 80 on the bench, keep what is clean |
| AMOLED burn-in on static screens | Medium (long run) | «Display off after» in the handbook page |
| The newer revision (CO5300/CST816) shows nothing | Medium for buyers | Handbook names the tested revision and how to tell them apart |
