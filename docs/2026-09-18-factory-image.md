# A factory image: flashing a brand-new device

Agreed 2026-09-18. Firmware reaches a ScreenBee device over the air
(`docs/2026-09-15-firmware-ota.md`), which presumes a device that already
runs ScreenBee and is on the broker. A board fresh from the shop runs
something else, and the image a release ships is the app slot alone - no
bootloader, no partition table, no OTA selector. There is today no way for
someone who just bought a board to get ScreenBee onto it at all.

## Decisions

**1. Flashed from the buyer's own computer, over USB.** Not from the Pi: in a
van the Pi tends to sit behind a panel, and its two serial ports are already
taken by other hardware (`/dev/ttyACM0`, `/dev/ttyUSB0`) with no esptool
installed. A path on the Pi stays possible later and is nearly free once the
image exists, but it is not the way this is built for.

**2. One merged factory image per board, built by the release tool.** Four
parts at their flash offsets, in one file that is written at 0x0:

| offset | part | size |
| --- | --- | --- |
| 0x0 | `bootloader.bin` | ~20 KB |
| 0x8000 | `partitions.bin` | 3 KB |
| 0xe000 | `boot_app0.bin` | 8 KB |
| 0x10000 | `firmware.bin` (the app) | ~1.9 MB |

That is one thing a person can be told in one line - "write this at 0x0" -
and it suits a browser and a command line equally. It is built by
`tools/release-firmware.js` in the firmware repo, the same tool that already
checks that every image carries the marker of the device it is filed under,
so the factory image is checked by the same hand that builds it.

No filesystem part. The firmware calls `LittleFS.begin(true)`, so a chip with
no valid filesystem formats its own - shipping an empty one would only make
the image bigger.

No esptool either: merging is placing four buffers and padding the gaps with
0xFF, which the tool does itself.

**3. The OTA asset stays exactly as it is.** OTA writes into an app slot and
can do nothing with a merged image. The factory image is an *additional*
release asset, `<device-id>-factory-<tag>.bin`, with its own `factory` entry
in `firmware/manifest.json` beside the existing one. Nothing in the designer's
OTA path ever touches it.

**4. Our own flasher page, not a pointer at someone else's.** A browser can
write flash over WebSerial, and esptool-js (0.6.1, `writeFlash`,
`eraseFlash`, `readFlash`) does it with no install, no drivers and no Python.
Espressif hosts such a page itself, but sending a newcomer there means
explaining files and offsets; our page asks for a board and a version.

WebSerial needs a secure context. That rules out the designer as its home:
in a van the designer answers at `http://192.168.8.107:3000`, which is not
one. The page has to be hosted, over https, and a buyer's laptop needs nothing
but a browser and a cable.

**5. Hosted as a GitHub Pages stand, assembled by a workflow.** On
`release: published` (and by hand), a workflow downloads the factory images
from the last releases, puts them beside the page and publishes the result to
`https://matthias-hess.github.io/screenbee-designer/`. A Pages stand is not a
branch: nothing binary ever enters the repository, so `git clone` in a van
stays small - the rule the release tool already keeps for the OTA images.

The page cannot fetch the images from the release itself: GitHub's release
assets send no CORS header. Hence images beside the page, same origin.

**6. Three releases to choose from, newest preselected.** A downgrade path
matters when a new firmware misbehaves, and with tags like `fw-2026.09.18.2`
two would be used up by a single busy day. Each entry names its date and
system generation rather than a tag number. Releases without a factory image
are skipped, so the list starts at one entry and fills up.

**7. Erasing is a checkbox, off by default.** Writing without erasing leaves
NVS alone, so a device that already had ScreenBee keeps its WiFi and MQTT
credentials and is back on the broker the moment it boots; on a brand-new
chip it makes no difference, nothing is there. The OTA selector at 0xe000 is
part of the image and so is always reset, and a broken filesystem heals
itself (decision 2) - so not erasing is safe, not merely faster. The checkbox
exists for a board coming from another project, and as the first answer to
"it doesn't work for me".

**8. The board is chosen by a person, and checked by their eyes.** Nothing is
preselected on the page - not even the first board in the list. All three
boards are ESP32-S3 with 16 MB: the chip cannot tell them apart, so detection
is not an option, and a board offered by default is a wrong flash waiting for
an impatient finger. (The firmware version does get a default: there the newest
is the right answer.) Reading the marker off the chip before writing is possible
but expensive - it sits at no fixed offset in a 1.9 MB app, and over the
knob's CH340 that is twenty seconds - and it helps exactly not at all in the
main case, a virgin chip with no marker. Instead: the exact product name on
each button, and after flashing a sentence saying what must now be on the
glass. A wrong choice costs one more flash and breaks nothing.

What *can* be detected is settled, though: the chip family. All three boards are
ESP32-S3, so a cable in an ESP32 or a C3 is refused after connecting and before
writing (`refuseChip`) - that is a guess the hardware can answer, unlike which
of three S3 boards it is sitting on.

**9. One structural test on every run, one real flash on demand.** In
`test:all`: the merged image has the right length, `0xE9` at 0x0, the
partition magic `0xAA50` at 0x8000, `boot_app0` at 0xe000, is byte-identical
to the OTA image from 0x10000, and carries exactly one device marker, the
right one; plus the page's own behaviour (three boards, three versions,
SHA-256 shown, a corrupted image refused). What that cannot prove is that an
empty chip boots from it, and that proof erases a board's credentials and
needs a cable - so it is a permanent script under `hil/factory-flash/`, armed
by an environment variable, skipped otherwise, and run by hand when the merge
changes.

**10. Named in three places.** The README and the forum post, for someone
starting out; the designer's firmware dialog, for someone whose device never
appeared; and every release note, written by the release tool, for someone who
just saw a new firmware.

## Where it lives

| piece | what it is |
| --- | --- |
| `lib/factory-image.mjs` | the byte layout, merge and checks - one module, imported by the release tool in the firmware repo and by the page in a browser, so they cannot drift apart. Also holds the page's URL. |
| `tools/release-firmware.js` (firmware repo) | merges and verifies a factory image per board, attaches it and `manifest.json` to the release, writes the `factory` entry |
| `flasher/` | the page: `index.html`, `app.mjs`, `boards.mjs` (the product names and what must appear on the glass) |
| `scripts/build-flasher.js` | assembles the page, the shared layout module, the images of the staged releases and a bundled esptool-js into one directory |
| `.github/workflows/flasher.yml` | on a published release, stages the last three releases' factory images and publishes that directory as the Pages stand |
| `e2e/factory-image.spec.ts` | the structural checks, against fixtures built from real bytes, plus real build artifacts when a built firmware checkout is beside this one |
| `e2e/flasher-page.spec.ts` | the page, built and served the way Pages serves it |
| `hil/factory-flash/` | the armed-by-hand proof on real hardware |

A note for whoever reads the tests: the fixtures in `e2e/factory-fixtures.ts`
carry real bytes from a real build on purpose. The first version of this was
written with the partition magic the wrong way round (0xaa50 for 0x50aa), and a
fixture built from the module's own constants would have agreed with it. What
caught it was merging an actual build.

## What this does not do

No Wi-Fi provisioning from the page. A flashed device opens its own access
point and captive portal, which is the standard for every board
(`docs`/DEVICE_GUIDE), and improv over serial would be a second way to do the
same thing.

No version archive. Three releases, then they fall off the list; older
firmware is what OTA is for, not a fresh flash.
