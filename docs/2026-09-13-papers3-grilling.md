# PaperS3 port grilling, 2026-09-13

Decisions taken before any code was written, for the M5Stack PaperS3 joining
the firmware repo as a third board. Numbered so a comment can cite one
("decision 6 of the 2026-09-13 PaperS3 grilling") the way `CanvasPresenter.h`
cites decision 2 of the 2026-08-19 port grilling.

Each decision records why, because the why is what a later reader needs in
order to overturn it honestly.

## What the grilling established about the existing code

Three facts were checked rather than assumed, and two of them changed the
plan:

- **LVGL is not in the way.** It appears in five files, and the 4.3B already
  bypasses it with a direct blit through its own panel adapter. The repo
  therefore already carries a non-LVGL board; the PaperS3 is the second, not
  the first.
- **The DDF generator has a hardcoded vendor prefix.** `outputsFor()` builds
  `src/boards/waveshare` + board name, so a source directory named
  `ddf-source-papers3` would target `src/boards/waveshares3`. It exits when
  that directory is missing, so it fails loudly rather than silently - but
  the prefix has to go (decision 2).
- **Rotation exists only on the device being retired.** The e-paper is the
  only DDF declaring `allowedRotations`, and it gets it almost free because
  GxEPD2 owns the framebuffer and remaps every coordinate. In this repo we
  own the canvas, so rotation is not one call (decision 8).

## Decisions

**1. Rename the repo first, as its own step.**
`screenbee-waveshare-1v8` becomes `screenbee-firmware` before any board code
exists. It already holds two boards and is about to hold three, from two
vendors. Doing it first keeps the rename out of the same history as real
work, where it would bury it.

Blast radius, counted rather than estimated - and my first count, given
during the grilling as "exactly two functional", was wrong. Across four
repos: 55 mentions in 36 files. Six are real paths or names that break if
left alone: `hil/test-all.js` (repo path and the `SCREENBEE_WAVESHARE_REPO`
environment variable), `e2e/ddf-seed.ts`, `hil/waveshare/ddf-fonts.js`,
`hil/waveshare4v3b/ddf-fonts.js`, `scripts/gen-arc-sin-table.js`, and the
`firmwareRepo` field in both DDF sources - that last one changes the DDF
bytes, so both compiled headers and both curated zips have to be rebuilt.
The rest is prose.

**2. Generalize the board directory convention.**
`src/boards/waveshare<name>` becomes `src/boards/<name>`, and the generator's
`outputsFor()` follows. The board id is `papers3`, lowercase and without
separators like its two siblings; `M5Stack PaperS3` is the display name in
`device.json`. Mixed-case directory names are the same class of
cross-platform trap as line endings, which bit this project on 2026-09-12.

**3. No 4-bit framebuffer. RGB565 end to end.**
`ClippedCanvas16` and `ColorScreenRenderer` stay untouched, the snapshot stays
an RGB565 BMP, and the DDF keeps `snapshotQuantize: "rgb565"`.

The reason is that the panel's 16 grey levels are produced by the display
driver, downstream of the snapshot - and the HIL comparison reads the
framebuffer we drew into, not the glass. Whatever the driver does afterwards
therefore cannot affect pixel parity at all. A real 4-bit pipeline would cost
about a week and save 260KB on a board with 8MB of PSRAM.

**4. Chosen colours are quantized to greys by nearest luminance.**
A new `quantizeColorFor4Bit` in the designer, mirrored in the firmware's
colour parsing. Without it the designer previews in colour while the panel
shows grey, so a green label on a grey box can vanish on the glass while
conformance stays green - the test compares before the panel mapping and
cannot see it. The default `fillColor` is a green, so this is the normal case
and not an edge case.

Three conditions, all of them learned the hard way already:

- **One formula, identical rather than correct.** Rec. 601, Rec. 709 and a
  plain mean disagree materially on saturated colours, and gamma-encoded
  versus linear disagree again. TypeScript and C++ must use the same one with
  the same integer arithmetic and rounding, or a colour lands on level 7 on
  one side and 6 on the other. `quantizeColorFor1Bit` already says this in
  its own comment: it copies the firmware's red-nibble quirk deliberately,
  because "being more correct than it would only produce differences".
- **The sixteen targets are pure greys** (R=G=B), which the existing
  `GRAYSCALE_4BIT_PALETTE` already is. Any sane luminance formula maps a pure
  grey to itself, so the driver's own formula stops mattering.
- **It applies to chosen colours, not to every pixel.** The arc blends
  between two quantized greys in RGB565 and lands deliberately between
  levels; snapping that to the palette would put the hard edges back.

**5. Interactive device, USB-powered. No sleep in v1.**
Touch is a v1 feature, which only works because the device is mains-powered:
1800mAh against a permanently awake ESP32-S3 with WiFi is well under a day,
and a sleeping device answers neither a tap in 0.3s nor an MQTT subscription.
Battery reporting, the RTC and the IMU are explicitly out of v1, so nobody
half-wires them.

**6. Refresh: partial per object, full at ten, earlier when idle.**
A tap repaints its own object and ~0.3s of latency is accepted. A full
refresh happens at the latest after ten partial updates - a hard ceiling, not
a preference - and preferably sooner, whenever the device has gone ten
seconds without redrawing anything.

The ceiling exists because "clear the ghosts when idle" has no floor on its
own: a dashboard fed by MQTT redraws without anyone touching it and would
never reach an idle moment.

Conformance cannot verify any of this: the snapshot comes from the
framebuffer, so ghosting and refresh strategy are invisible to it and it
stays green whatever the panel does. Checked by hand once instead
(decision 11).

**7. Setup mode: hold ten seconds, top left.**
Long on purpose. The 4.3B's two-second hold would fire by accident here,
because 0.3s of feedback latency trains people to press longer. Ten seconds
is safe against that and undiscoverable by accident, so it belongs in the
instructions.

The per-second countdown does **not** count against the refresh budget of
decision 6. It would otherwise consume exactly ten partial updates and force
the full refresh into the final moment of the hold - a 1.7s black-and-white
flash immediately before setup mode appears, which reads as a fault. Reaching
setup mode draws a whole new screen anyway, so the ghosting the countdown
leaves in its corner is cleared regardless of whether it was counted.

**8. Landscape only in v1. The DDF declares no `allowedRotations`.**
Wanted at first and dropped once the cost was visible. On the e-paper
rotation is a single `setRotation()` call because GxEPD2 owns the
framebuffer; here we own the canvas, so it means a canvas sized per
orientation, a rotated blit, and rotated touch coordinates. Nothing in this
decision blocks adding it later.

**9. A plain grey frame as the adornment.**
960x540, generated rather than hand-drawn, since the device has no
hardware buttons to place on it.

**10. The e-paper repo is retired, but not yet.**
Three things live only there: the full-versus-partial escalation rule, the
ghosting-clear convention, and the 1-bit renderer. The first two are needed
on the PaperS3. So the order is: port the e-ink discipline, get the PaperS3
green, then retire. The 4.3B becomes the reference implementation the device
contract names in its opening line.

**11. Done means conformance green on all thirteen types.**
`Switch` and `SoftwareButton` included, driven through the `/api/touch`
endpoint the 4.3B's test interface already exposes. Plus exactly two manual
checks, for the two things no automated test can see: that a full refresh
really follows the tenth partial one, and that holding the top left for ten
seconds reaches setup mode.
