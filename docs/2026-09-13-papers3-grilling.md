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

**6. Refresh: partial always, clean up after ten once nobody touches it.**
*Revised 2026-09-14.* Every redraw is partial and ~0.3s of latency is
accepted. Once ten partial updates have piled up, the panel does one full
refresh as soon as nobody has touched it for ten seconds. A screen change is
a new picture and is always painted clean.

The first version said "full at ten, earlier when idle", with idle measured
from the last *draw*. The manual check of decision 11 found it backwards
within a minute: the idle rule was only applied to the next paint, so the
flash landed on the first tap after every pause - the one tap it was meant to
spare - and a panel left alone for ninety seconds was never cleaned. The hard
ceiling at ten existed only because a dashboard fed by MQTT never stops
drawing and so never went idle. Measured from the last *touch*, that
dashboard goes idle ten seconds after anyone last used it however busy MQTT
is, so the ceiling went: someone tapping without a ten-second break is never
interrupted by a flash. Fewer than ten partials are never cleaned on their
own.

Conformance cannot verify any of this: the snapshot comes from the
framebuffer, so ghosting and refresh strategy are invisible to it and it
stays green whatever the panel does. `hil/papers3/refresh-rule.js` asserts
the rule through `/api/debug`; whether the glass looks clean afterwards is
checked by hand (decision 11).

**7. Setup mode: hold ten seconds, top left.**
Long on purpose. The 4.3B's two-second hold would fire by accident here,
because 0.3s of feedback latency trains people to press longer. Ten seconds
is safe against that and undiscoverable by accident, so it belongs in the
instructions.

The per-second countdown was to be kept out of the refresh budget of
decision 6, so that ten ticks could not force a full refresh into the final
moment of the hold. Since the 2026-09-14 revision that cannot happen anyway:
a finger resting on the glass keeps the panel from counting as idle. As of
that date the countdown exists only in the serial log - nothing is drawn on
the panel during the hold.

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
endpoint the 4.3B's test interface already exposes. Plus three manual
checks, for the things no automated test can see:

- a full refresh really cleans the glass ten seconds after the last touch,
  once ten partials have piled up (first run 2026-09-14 found the original
  rule backwards - see decision 6; the revised rule looked right on the
  glass the same day, and is now asserted by `hil/papers3/refresh-rule.js` -
  this check is about what the glass shows),
- holding the top left for ten seconds reaches setup mode,
- and the setup screens themselves look right.

First run of the second and third, 2026-09-14: the hold opened setup mode
after ten seconds as intended, but the setup screen had no QR code (the
board inherited IDisplay's text-only default), flashed the whole panel every
second for its countdown (that default painted clean on every call), and
"tap to cancel" did nothing (setup mode never read the touch panel). All
three fixed the same day. The QR code and the partial countdown are now
asserted by `hil/papers3/setup-screen.js`; tap to cancel still needs a
finger.

After the fixes, the same day, all three checks passed on the glass: the
refresh clean-up looks clean, the QR code shows with no flashing during the
countdown, a tap restarts the board, and a slow drag starting in the top
left does not open setup mode.

The third was added on 2026-09-13, the day the board first drew text, after
every letter came up in a black box. Setup screens have no designer
counterpart, so conformance does not render them on any board and never
will - it compares against the designer, and there is nothing to compare
against here. The same bug in the *project* renderer would have been caught
instantly, which is exactly why this one survived: it lives in the one
drawing path the pixel comparison cannot see.
