# Device Contract — Designer → Firmware Handoff

What a device implementation must do to correctly interpret a ScreenBee
designer project export, plus the current gap status for the M5 Dial
target (`C:\GitHub\screenbee-m5dial`). Written to be read *outside* this
repo, without needing the designer's source open side by side.

The reference implementation of everything below is `MqttEPaperDisplay2`
(1-bit e-paper, ~15 months of iteration, HIL-verified pixel-exact). M5 Dial
is the second device family (24-bit color LCD) and is where most current
gaps live.

## 1. Device Description File (DDF) — how a device announces itself

A DDF is a ZIP (`device.json` + an adornment SVG + font files) the device/
firmware project supplies; the designer imports it instead of a human
re-entering screen specs. Schema lives in `lib/device-description.ts`.

```
device.json
├── ddfVersion
├── device { id, name, firmwareRepo?, platform?: "firmware"|"android" }
├── screen { width, height, colorDepth: "1bit"|"4bit"|"24bit", allowedRotations?: number[] }
├── adornment { svgPath, drawingArea: { x, y, width, height, svgViewBox } }
├── hardwareButtons[] { id, name, svgElementId, shape, x?, y?, width?, height? }
├── fonts[] { id, displayName, internalName, file, size, ascent, descent, format?: "bdf"|"ttf" }
├── supportedObjectTypes[]   // must exactly match what renderObject() dispatches — see §3
└── testInterface?           // HIL-only, see §6 — absent means no automated pixel-parity testing is possible
```

Fonts are shipped as **real on-device font data** (BDF bitmap glyphs for
firmware targets, matching the u8g2 font named in `internalName`), not just
a name reference — this is what makes pixel-parity possible at all instead
of hoping two independent font renderers agree.

`allowedRotations` lists which 90°-multiples the device's physical
enclosure supports being mounted in, beyond native 0°. Omitted = native
orientation only.

**M5 Dial's current DDF** (`public/ddf/m5stack-m5dial.ddf.zip`, v1.1):
screen 240×240, 24bit, 3 hardware buttons (`button-0`/`button-1`/`button-2`
= "Rotate Left"/"Rotate Right"/"Push"), 4 BDF fonts (helvR08/12/18/24,
reused from the e-paper set), `supportedObjectTypes` = `[MqttDataField,
MQTTIconField, label, level-indicator, icon, line, box, SoftwareButton]`.

**Gaps:** no `testInterface` (blocks HIL entirely, see §6), no
`allowedRotations` declared (fine if the physical enclosure really is
fixed-orientation — confirm, don't assume). Not declared as supported:
`MqttDataLine`, `tab-control`/`panel` — consistent with the firmware not
implementing them yet (§3), not a drift bug.

## 2. Project export — what the device receives

Built by `lib/project-zip.ts`, structurally mirrored field-for-field by the
firmware's `ProjectConfig`/`Screen`/`ScreenObject`/`ObjectProperties`
(`screenbee-m5dial/src/project/ProjectTypes.h` is the reference C++
mirror — keep both in sync by hand, there's no shared schema file).

Top level (`ProjectConfig`): `name`, `screenWidth`, `screenHeight`,
`exportColorDepth`, `topics[]`, `fonts[]`, `screens[]`, `hardwareButtons[]`
(project-wide default action per button id).

Each `Screen`: `id`, `name`, `path` (optional background bitmap),
`backgroundColor`, `objects[]`, `buttonActions[]` (per-screen override of a
button's action, keyed by button id — takes priority over the project-wide
default for the same screen only).

Each `ScreenObject`: `type`, `id`, `x/y/width/height`, `zIndex`,
`properties {…}`, plus (firmware-export only, not `properties`) bitmap
paths the designer's export flattens onto the object: `path` (icon),
`pathNormal`/`pathActive` (SoftwareButton). `tab-control`/`panel` nest via
`children[]`, coordinates relative to the parent's own origin (the
renderer accumulates an offset descending).

Static content (background color/image + `box`/`line`/`icon`) is
pre-flattened by the designer into one background bitmap per screen
(`AssetExporter.createFlattenedBackground`, `lib/asset-export.ts`) — **but
only for bitmap-blit targets**. The reference e-paper firmware instead
re-renders every object live from `project.json` every redraw via its own
`ScreenRenderer`, never touching the flattened export at all; the M5 Dial
firmware does the same (`ColorScreenRenderer::renderScreen`). Only a
platform with no native rendering of its own (there is none today) would
actually consume the flattened bitmaps. Don't assume the flattened export
is load-bearing for a new firmware target — it isn't.

Bitmap format is driven by `exportColorDepth`: `1bit` → PBM (P4), `4bit`/
`24bit` → BMP (4-bit palette / 24-bit RGB respectively), bottom-up rows,
BGR channel order for 24-bit — see `AssetExporter.bitmapToFile` and its
three `bitmapTo*` methods for the exact byte layout if a firmware's own
BMP/PBM decoder needs to match it.

### 2.1 Object types and their `properties`

12 designer object types exist (`components/project-editor.tsx`
`ScreenObject["type"]`): `label`, `box`, `line`, `MqttDataLine`, `icon`,
`MqttDataField`, `field` (legacy alias for `MqttDataField` — firmware
should treat both identically, see `ColorScreenRenderer.cpp:489`),
`MQTTIconField`, `level-indicator`, `SoftwareButton`, `tab-control`,
`panel`. A device only needs to implement the subset it declares in
`supportedObjectTypes` — everything else is shown-but-disabled in the
designer toolbar, and flagged with a dashed orange outline on canvas if
already placed.

Common `properties` fields: `topic` (MQTT binding, see §4), `displayAs`,
`backgroundColor`/`borderColor`/`textColor`/`color`, `textAlign`,
`fontId`/`fontWeight`.

Per-type properties (non-exhaustive, see `ObjectProperties` in either
repo's type definitions for the full field list):
- **label**: `text`, `fontSize`.
- **MqttDataField** / **field**: `prefix`, `postfix`, `thousandsSeparator`,
  `numberOfDecimals`.
- **MQTTIconField**: `valueIconPairs[]` (`comparisonOperator`, `value`,
  `thenShowIcon` → asset id, rendered per-usage as its own exported bitmap).
- **level-indicator**: `barDirection` (4-way), `displayValue`
  (`none`/`percentage`/`value`), `fillColor`, `calibrationPoints[]`
  (`{value, barSizePercent}` — maps a raw MQTT value to fill %).
- **line**: `strokeWidth`, `strokeStyle` (only `"solid"` actually renders),
  `points[]` (real vertices — empty means fall back to the legacy
  `(x,y)`–`(x+width,y+height)` two-point derivation), `filletRadius`,
  `arrowStart`/`arrowEnd` (booleans).
- **MqttDataLine**: like `line` but arrow presence is data-driven —
  `arrowStartOperator`/`arrowStartValue` and `arrowEndOperator`/
  `arrowEndValue` are independently evaluated against the topic's live
  value; `calibrationPoints[]` (reused from level-indicator) maps
  `abs(value)` to stroke width.
- **box**: `strokeColor` (empty = no border), `strokeWidth`,
  `cornerRadius`.
- **SoftwareButton**: exported as pre-rendered `pathNormal`/`pathActive`
  bitmaps (background + icon + text baked in) — a device just blits
  whichever bitmap matches current press state, no live text/icon
  rendering needed for this type.
- **panel**: matched against its parent `tab-control`'s own `topic` value
  via `comparisonOperator`/`comparisonValue` (string compare for `==`/`!=`,
  numeric for the rest) — shown only when its condition matches the
  tab-control's current value.

## 3. Rendering parity rules — non-obvious, each cost real debugging time

These came out of a real HIL campaign on the e-paper target (15177/18008
→ 0/0 differing pixels across 6 fixed bugs — see `hil/README.md` and
memory `project-pixel-perfect-mismatch`). Any new renderer should assume
these apply rather than rediscover them:

1. **Draw order is background → border → text, text always last.**
   Drawing the border after text lets it erase glyph ink wherever a
   descender reaches the box's bottom row.
2. **u8g2's `setFont()` silently resets font mode to opaque** on every
   call — a one-time `setFontMode(1)` at startup does not survive past the
   first font change. Reassert transparent mode after every `setFont()`.
3. **Don't trust `getUTF8Width()` for cursor advance** — it doesn't equal
   what a real `print()` actually advances by (~1px off). Do a real
   dry-run `print()` through a zero-area-clipped throwaway instance to get
   the true width, and apply a `+1px` cursor-bias offset on top (u8g2
   draws ink 1px left of nominal cursor) — both together, not separately.
4. **Quantize colors to the declared `colorDepth` before drawing**, don't
   draw literal CSS colors a 1-bit/4-bit target can't represent as-is
   (`lib/color-depth.ts` `parseColor()` on the designer side).
5. **1px strokes need a 0.5px alignment offset** to land pixel-crisp
   instead of anti-aliased across a pixel boundary (`strokeRect` centers
   the stroke on the path by default).
6. **A line/arrowhead's own bounding box is degenerate for perfectly
   horizontal/vertical lines** (0–1px in one dimension) — anything that
   sizes a partial-redraw buffer off `x/y/width/height` alone will clip an
   arrowhead that paints perpendicular to the line, well outside that box.
7. **Shorten the line body toward each arrowhead end by a constant
   fraction of the arrowhead's own length** (not a fixed pixel amount) —
   otherwise a thick line's straight edges poke out past the arrowhead
   triangle's tapering sides at high `strokeWidth`.
8. **The very first MQTT-triggered partial redraw after boot may need to
   escalate to a full render** (e-paper ghosting-clear convention) — if a
   firmware does this, know that it blocks `mqttClient.loop()` for the
   duration, so other topics published in the same batch can arrive after
   the render already started. Don't rely on a fixed sleep to work around
   this; expose a way to poll "has this specific value actually been
   applied yet" instead (§6).

Whether all 8 apply to a non-e-paper renderer varies (a color LCD has no
ghosting, so #8 may not apply at all) — but #1–#5 and #7 are drawing-model
issues independent of display technology and should be assumed to apply
anywhere u8g2 + a designer-parity goal are both in play.

## 4. MQTT contract

`topics[]` (project-wide): `{id, topic, type: "numeric"|"string"|"boolean"|"json", examples[], subtopics[]}`.
For `type: "json"`, `subtopics[]` pulls named fields out of one payload via
a JSONPath *subset* (member/index access only — no wildcards, recursive
descent, filters, slices, unions): `"temp"`, `"$.temp"`, `"nested.temp"`,
`"readings[0].value"`. An object binds to a specific field via the
composite string `"<topic>#<path>"` stored in its own `properties.topic`.

A device must implement the same JSONPath subset identically on-device —
see `ProjectLoader::extractJsonField`/`tokenizeJsonPath()` in the e-paper
firmware, mirrored by `lib/json-path.ts` on the designer side, as the
reference parser to port rather than reinvent.

### Deploy-flow topics (e-paper only today, not yet extended to M5 Dial)

Under `screenbee/<clientId>/...` (`clientId` = firmware's own client id,
e.g. `"EPaper-" + MAC`):
- `status` — retained, `online`/`offline` (offline = MQTT Last Will).
- `hello` — retained, `{deviceId, firmwareVersion}`, republished every
  (re)connect.
- `deploy` — retained, `{deployId, url, crc32}`, published by the browser.
- `deploy-status` — `{deployId, state, percent?, error?}`, published by
  the device through
  `downloading → download_complete → verifying → applying → rebooting`,
  or `error`/`busy`/`up_to_date`.

## 5. Hardware input contract

`hardwareButtons[]` (project-wide default) + per-screen `buttonActions[]`
(override, same button id, screen-scoped priority). Each `ButtonAction`:
`type: "next-screen"|"previous-screen"|"goto-screen"|"send-mqtt"` (empty
type = no configured action; every button still sends a generic
button-press MQTT notification regardless). `goto-screen` needs
`targetScreenId`; `send-mqtt` needs `mqttTopic`+`mqttMessage`.

Only a button's `id` (e.g. `"btn-0"`) and its default action matter to
firmware — `name`/`svgElementId`/`shape`/`x`/`y`/`width`/`height` are
on-canvas overlay metadata for the designer UI only, not consumed
on-device.

**M5 Dial specifics not yet covered by this contract as written:** the
device has a rotary encoder (2 of its 3 declared buttons are "Rotate
Left"/"Rotate Right", i.e. encoder direction, not discrete pushes) and a
touchscreen — neither has an established mapping onto the
next-screen/previous-screen/goto-screen/send-mqtt action model yet. Decide
this before wiring real button handling in firmware, not after — it
affects whether "Rotate Left" is even the right abstraction for an
encoder, versus something like a delta/scroll event type the current
`ButtonAction` union doesn't have a slot for.

## 6. Test interface contract (`testInterface` in the DDF) — required for HIL

```
uploadUrl, uploadMethod: "POST"|"PUT", uploadContentType: "multipart-zip"|"raw-zip"
screenSwitchUrl, screenSwitchMethod, screenSwitchBody: "form-urlencoded"|"json"
snapshotUrl, snapshotFormat: "bmp"|"png"
postRenderSettleMs
```

Only used by `hil/*/orchestrator.js`, never by the designer app itself.
`"{ip}"` in any URL is a placeholder the orchestrator substitutes with the
real device address. The e-paper reference exposes all of this at
`/api/project` (setup-mode only), `/api/screen` (`index=N` form field),
`/snapshot.bmp`, plus `/api/topic-values?topics=a,b,c` — a readback API
that lets the orchestrator poll "has the device's cache actually applied
these MQTT values yet" instead of guessing with a fixed sleep (built to
fix the combo-0-after-fresh-upload flakiness described in §3 point 8).

**M5 Dial has none of this today** — no project-upload HTTP endpoint, no
forced screen-switch endpoint, no snapshot endpoint, no topic-value
readback. This is the single biggest reason no HIL/pixel-parity campaign
can start on this target yet, independent of whatever else is or isn't
wired up in the render path itself.

## 7. Existing test projects / fixtures

`hil/epaper/fixtures/build-comprehensive-test.js` generates
`comprehensive-test.zip`, a standing project exercising every object type
the e-paper firmware dispatches (box, label, MqttDataField,
level-indicator, a segmented/filleted line) except tab-control/panel and
MQTTIconField — checked into the repo (~220KB, mostly embedded BDF fonts)
so a HIL run doesn't need to regenerate it first.

MQTT test-value combinations are generated by `hil/combinations.js`, not
hand-authored per fixture: for each screen, run `max(examples.length)`
across every topic that screen's objects (including nested
`tab-control`→`panel` children) bind to; combination *i* uses
`examples[i % examples.length]` per topic; a screen with no MQTT-bound
objects gets exactly 1 combination. The orchestrator publishes each
combination, forces a render, fetches a snapshot, and does a **strict**
pixel comparison (any differing pixel fails) against the designer's own
headless render harness (`app/test-render`, driven via Playwright) as
ground truth.

**No M5 Dial equivalent fixture exists yet.** Building one (mirroring
`build-comprehensive-test.js`'s structure, covering the 8 types M5 Dial's
DDF already declares as supported) is a prerequisite for any pixel-parity
work on this target — but it's blocked on §6 first (nothing to snapshot
against without a `testInterface`).

## 8. M5 Dial — current state vs. this contract (2026-08-09)

**In place:** DDF matches firmware's actual `renderObject` dispatch
exactly (no drift) for all 8 declared types (checkpoint 2 commits, per
`screenbee-m5dial` git log). WiFi provisioning + MQTT hello/status wired
and verified on hardware (checkpoint 3). `ProjectTypes.h` mirrors the
designer's schema field-for-field, including M5-Dial-specific additions
(`path`/`pathNormal`/`pathActive` on `ScreenObject` for icon/SoftwareButton
bitmap paths — properties the e-paper firmware never needed since it never
implemented those two types).

**Done (2026-08-09, checkpoint 4):** `main.cpp` now wires `MqttClient`'s
callback to `ProjectLoader::setTopicValue()` and triggers a full
`renderScreen()` + blit whenever the current screen actually displays the
changed topic (`onMqttMessage`/`subscribeToAllTopics`/`collectTopics`/
`screenUsesTopic`, ported from `Application::onMqttMessage` et al. in the
e-paper firmware — see §3's rendering-parity list for what carried over
and what didn't, e.g. no partial-update path since a color LCD has no
e-paper ghosting cost to optimize around). **Manually verified on real
hardware**: pointed the device's MQTT config at a local broker
(`npm run hil:broker` in the designer repo) via its AP setup mode's
`/api/mqtt` form (no restart-on-save for this form specifically — a
manual reboot was needed to pick it up, unlike the WiFi-credentials form),
confirmed `hello`/`status` arrive, then published to `test/level` and
watched the on-device `Level:`/bar-fill redraw from 67% to 23% live.

**Still not wired:**
- No project-upload endpoint, no forced-render endpoint, no snapshot
  endpoint → no `testInterface`, no HIL possible yet (§6). This is also
  why the checkpoint-4 verification above was eyes-on-a-real-screen, not
  an automated test — there's nothing yet to assert against
  programmatically. Building the test-interface endpoints (suggested
  order's step 2, below) turns this into a real regression test instead
  of something that has to be re-verified by hand every time.
- Rotary encoder and touchscreen input aren't mapped onto the
  `ButtonAction` model at all (§5) — only the physical push button's
  long-press → setup-mode path exists in `loop()` today.
- `MqttDataLine`, `tab-control`, `panel` are unimplemented and correctly
  left out of the DDF's `supportedObjectTypes` — not a bug, just not done.

**Suggested order of work in the firmware repo**, each step individually
verifiable rather than one large jump: (1) ~~wire `MqttClient`'s callback
to `ProjectLoader`'s topic-value store + trigger `renderScreen()` on
change, verified by hand against a real broker~~ **done 2026-08-09**;
(2) ~~add the HTTP test-interface endpoints (§6) and a `testInterface`
block to the DDF~~ **done 2026-08-09, works with both STORED and
DEFLATE-compressed project zips** — see §8's Checkpoint 6 writeup for the
two miniz bugs found and fixed; (3) build the comprehensive test fixture
(§7, either compression works now) and run a first HIL pass — expect to
find real pixel-parity bugs, same as the e-paper campaign did, not zero;
(4) only then take on encoder/touch → `ButtonAction` mapping, since
that's a model extension this contract doesn't currently have an answer
for and deserves its own design pass rather than being bolted on
mid-render-work.

**Hardware note (2026-08-09):** this specific M5 Dial unit is prone to a
boot-loop (repeated `rst:0x3 RTC_SW_SYS_RST`, sometimes with `invalid
header: 0xffffffff` from the ROM bootloader in between) on marginal USB
power. Two workarounds, both confirmed to actually fix it on this unit:
hold the back button while plugging in the USB cable to force clean
download-mode entry before flashing, and/or attach a second, dedicated
power source alongside the data USB connection if the loop persists after
flashing. Try the button-hold first (cheaper); reach for extra power if
the loop continues after a clean flash. By the end of this same session
the unit had become fully unresponsive (no serial output, no network
presence, LED on, USB enumerated) after many erase/reflash/reset cycles -
**resolved and explained**: M5Burner-flashed official `M5Dial-UserDemo`
firmware came up immediately, and that official firmware *also* shows a
black screen without the extra power source attached, independently
confirming this is a genuine power characteristic of this physical unit -
not a bug introduced by this repo's own firmware, and not a brick. Always
have the extra power source attached before booting, not just before
flashing.

**Checkpoint 6 (2026-08-09): HIL test-interface endpoints, all 4 working,
including DEFLATE-compressed project uploads.** `TestInterfaceServer`
(`screenbee-m5dial/src/TestInterfaceServer.*`) implements §6's contract -
unlike the e-paper firmware, every endpoint (including project-upload) is
always-on once WiFi connects, not gated to a setup mode, since this
device has no "field deployment hardening" story yet to protect.
`POST /api/screen`, `GET /snapshot.bmp` (24-bit BMP straight from the
live RGB565 canvas buffer), and `GET /api/topic-values` are
hardware-verified working. `POST /api/project` (multipart zip upload,
`ProjectInstaller` ported from the e-paper firmware's miniz-based
extractor) **works end-to-end for both STORED and DEFLATE-compressed
zips, verified on real hardware** (uploaded, installed to
`/PROJECT/project.json`, survived a reboot).

**The DEFLATE-extraction crash - root-caused and fixed.** What looked
like one deep bug across most of this session's debugging was actually
two separate, real bugs, both in the vendored `miniz` library (now
vendored directly in `lib/miniz/` instead of fetched from git, so the fix
could be applied as a source patch - see `lib/miniz/miniz_zip.c`'s patch
comment on `mz_zip_reader_extract_iter_new()` for the exact change):

1. **A genuine upstream miniz bug.** `mz_zip_reader_extract_iter_new()`'s
   out-of-memory cleanup path calls `m_pFree()` on `pState->pRead_buf`
   unconditionally. For an in-memory archive (`m_pState->m_pMem` set -
   which every use in this codebase is, since `mz_zip_reader_init_mem()`
   is always used), `pRead_buf` is a raw pointer *into* the caller's own
   zip-bytes buffer, never something `m_pAlloc` returned - freeing it
   passes an arbitrary interior pointer to `free()`, corrupting the heap.
   `mz_zip_reader_extract_iter_free()` guards the equivalent free with an
   `m_pMem` check a few hundred lines later in the same file; this OOM
   path just never had it. Only reachable when the dictionary-window
   allocation below fails, which is why it went unnoticed upstream and
   why every earlier hypothesis in this session's history (stack size,
   task isolation, miniz version, output-buffer padding, unaligned
   access, JTAG-caught "`pZip->m_pState` already invalid at entry") never
   found it - all of those were investigating the *symptom* (heap
   corruption manifesting somewhere nearby) without knowing an OOM path
   existed at all.
2. **A heap-fragmentation problem exposing bug (1).** `pWrite_buf`, the
   32KB DEFLATE dictionary window, needs one *contiguous* heap block. By
   the time a project upload reaches this code, WiFi + WebServer +
   LittleFS have fragmented the heap enough that no 32KB block survives -
   confirmed via `heap_caps_get_largest_free_block()`: 100KB+ total free,
   ~45KB largest contiguous block. This allocation failure was *always*
   happening on DEFLATE entries; bug (1) is what turned "cleanly return
   NULL" into "corrupt the heap and crash." A dedicated FreeRTOS task
   with its own large stack was tried as a fix for this and made it
   *worse* (the task's own stack is itself a large contiguous
   allocation, competing for the same scarce blocks) before being
   removed entirely.

**The fix (`ProjectInstaller.cpp`'s `useDictReservingAllocator()`):**
patch bug (1) directly in the vendored miniz source, and reserve both
fixed-size buffers DEFLATE extraction needs - the 32KB dictionary window
and the ~9.5KB iterator-state struct, both always the same compile-time
size - as padded **static** buffers (BSS, not heap) handed out by a
custom `mz_pAlloc`. Static memory is reserved once at link time and never
competes with runtime heap fragmentation, which is what actually made
the 40KB-task/padded-heap-allocator approaches tried first unreliable.
The padding around each buffer (4KB on each side, pure BSS so effectively
free) exists because `tinfl_decompress()` was independently confirmed
(via a padded-canary probe, no JTAG needed - malloc a buffer with a
known 0xCC-filled guard region on each side, extract, then check whether
the guards are still intact) to write 100-270+ bytes past the end of
whichever of these two buffers it's currently touching, during normal,
successful DEFLATE decompression. That overrun's exact source line was
never pinned down - JTAG hardware watchpoints on this board's dual-core
USB-JTAG repeatedly armed without ever firing, a dead end independent of
the two bugs above - but with generous static padding on both buffers it
lands in dead space instead of corrupting anything, which is sufficient
without needing the exact instruction.

One more thing the fix required: `mz_zip_reader_extract_iter_free()`'s
own return value is not trustworthy as a success/failure signal even
after both fixes above - `ProjectInstaller.cpp` computes its own CRC32
over the extracted output (via `mz_crc32()`) and compares against
`fileStat.m_crc32` instead of trusting miniz's internal bookkeeping.

Net result: `TestInterfaceServer::runValidateAndExtractOnDedicatedTask()`
was removed entirely (no longer needed - the static buffers fixed the
fragmentation problem the dedicated task existed to work around, and
extraction now runs inline on whatever task handles the HTTP request,
same as normal project loading always has).

**Follow-up above, resolved 2026-08-10 (was more severe than first
diagnosed):** what looked like a narrow edge case for unusually small
project files turned out to be a **deterministic failure on every single
boot, for every project regardless of size** - `ESP.getMaxAllocHeap()` at
this point in boot (right after WiFi connects, before this call) measured
the exact same 31732 bytes across every boot captured on this unit, never
fluctuating, always 1036 bytes short of the hardcoded 32768 floor. Found
while building the M5 Dial HIL fixture (§8 below): even a 598-byte
single-object test project failed to load after a successful install.
Fixed by lowering the floor from 32768 to 4096 in both
`ProjectLoader::parseJSONFromFile()` and `parseJSON()` - the `fileSize *
1.5` sizing this floor was layered on top of already scales with actual
content, so a fixed 32KB minimum was never protecting against anything
real for small projects, just guaranteeing failure on this unit's actual
available headroom.

## 9. M5 Dial HIL fixture + two more real bugs (2026-08-10)

Continuing from checkpoint 6 above: `hil/m5dial/` (designer repo) now
exists, mirroring `hil/epaper/`'s own structure -
`hil/m5dial/fixtures/build-comprehensive-test.js` (hand-built project
covering box/label/MqttDataField/level-indicator/line/icon/MQTTIconField -
7 of the 8 types the DDF declares; SoftwareButton excluded, its bitmap is
baked by the designer's export pipeline with shadow/border/label text
composited in, not reproducible by hand the way the others are) and
`hil/m5dial/orchestrator.js` (adapted from the e-paper orchestrator for
this device's simpler always-on single-port HTTP API - see both files'
own header comments for the full detail). Wired into `hil/test-all.js`
and documented in `hil/README.md`.

**A latent bug in the shared test harness itself, found before any
device-specific bug:** `app/test-render/page.tsx`'s `__renderScreenForTest`
took a synchronous `canvas.toDataURL()` snapshot immediately after calling
`renderScreenObjects`, but every icon-drawing renderer (`render-icon.ts`,
`render-mqtt-field.ts`, `render-software-button.ts`) only draws an icon
already sitting in `iconImageCache` with `img.complete` set - on every
cache miss (and the cache is rebuilt fresh on every single
`__renderScreenForTest` call) it kicks off `new Image(); img.src = ...`
and returns without drawing, relying on `img.onload` to redraw on a
*later* paint that never comes here. Every icon or MQTTIconField object
was silently rendering as blank in the reference image - latent in the
e-paper fixture's own MQTTIconField coverage too (added 2026-08-02),
never noticed since nothing had visually diffed it before now; that
fixture's last committed `results.json` predates ever exercising this
correctly and is worth a fresh e-paper hardware run to confirm. Fixed by
walking the screen for every referenced icon asset and pre-loading +
`await`ing `img.decode()` into `iconImageCache` before the synchronous
render pass.

**Real M5 Dial firmware bugs found via the new fixture, all fixed and
hardware-verified:**

1. **`ColorScreenRenderer::renderBox()` read `properties.backgroundColor`
   for the box's own fill color, not `properties.fillColor`.** Matches
   neither the designer's `render-box.ts` (`obj.properties.fillColor`)
   nor `ObjectProperties.fillColor`'s own "Color of filled portion"
   field - every box with a border rendered a plain white interior
   (`backgroundColor`'s own default) regardless of what `fillColor` said,
   never anything else. One-line fix.
2. **Icon/SoftwareButton/MQTTIconField asset paths were never resolved
   against where `ProjectInstaller` actually installs files.** The
   designer's export pipeline (`lib/project-zip.ts`) writes `path`/
   `pathNormal`/`pathActive`/`valueIconPairs[].path` relative to the zip
   root (e.g. `"assets/icon-lock.bmp"`) - the same convention the e-paper
   firmware's own fixtures already use. `ProjectInstaller` always installs
   every zip entry under `/PROJECT/` (e.g.
   `/PROJECT/assets/icon-lock.bmp`), but `ProjectLoader.cpp` never
   accounted for that prefix when parsing these four fields, so
   `ColorAssetLoader::drawBMPToCanvas()` (a literal `LittleFS.open()` on
   whatever string it's handed) always missed - every icon/
   MQTTIconField/SoftwareButton fell into its own "asset missing" black
   ‑square placeholder instead of its real bitmap. Fixed with a small
   `resolveAssetPath()` helper in `ProjectLoader.cpp`, applied at all four
   parse sites (plus a screen's flattened-background `path`, unused today
   but the same class of field).

**The bigger one - `installProjectZipFromFile()`/`peekProjectDeviceId()`
could not reliably install a realistically-sized project at all.** Both
loaded the *entire* uploaded zip into one contiguous `malloc(zipSize)`
block before handing it to `mz_zip_reader_init_mem()`. This device has
**no PSRAM** (confirmed via the PlatformIO board definition -
`maximum_ram_size: 327680`, exactly the ESP32-S3's internal SRAM alone,
consistent with the `m5stack_stamp_s3` chip variant this board uses
having no embedded PSRAM), so there's a hard ceiling on what a single
contiguous allocation can ever get. The HIL fixture's first real zip
(118KB, mostly an embedded BDF font file the firmware never actually
reads - see below) failed outright; even after shrinking the fixture to
21KB it failed specifically once the device was in its normal running
state (project loaded, MQTT connected, canvas drawn) though the *same*
21KB zip installed fine immediately after a fresh boot - the largest
contiguous free block shrinks measurably once other subsystems are live,
same class of problem as checkpoint 6's original DEFLATE-dictionary-window
fragmentation, just against the whole-file read this time instead of one
32KB buffer.

Two changes together brought this from "fails during normal operation"
to "verified 0/57600 differing pixels on real hardware":

1. **Fixture size fix (designer repo):** the fixture's own
   `fonts/helvR08.bdf` embedding was pure dead weight - `M5 Dial`'s
   `ColorScreenRenderer::getU8g2FontById()` (unlike the fictional
   possibility of a BDF-file-driven renderer) only ever matches fonts by
   `internalName` against compiled-in u8g2 font tables, and the real
   `buildDeviceProjectZip()` export pipeline never embeds a font file for
   this device at all - confirmed by reading it directly. Removing the
   embedded BDF (still resolved from the DDF zip for the *designer's own*
   headless reference render, which does need real glyph data) shrank the
   fixture from 118KB to 21KB with no loss of firmware-relevant coverage.
2. **Streaming zip reader (firmware repo):** replaced the single
   `malloc(zipSize)` + `mz_zip_reader_init_mem()` pattern in both
   functions with `mz_zip_reader_init()` (miniz's callback-based variant)
   plus a small `m_pRead` callback that seeks/reads directly against the
   still-open LittleFS `File` - central directory parsing and each
   entry's extraction now happen in small on-demand chunks instead of
   requiring the whole archive in RAM at once. No upper bound on
   installable zip size beyond LittleFS itself. The source zip `File` has
   to stay open for the whole call now (miniz seeks around
   non-sequentially while parsing the central directory), unlike the old
   malloc-then-close-immediately pattern.

**Root cause of the MQTT gap, found and fixed:** the device's saved MQTT
broker host was simply empty (confirmed via a one-line diagnostic added to
`setupWiFi()`: `MQTT config: host="" port=1883 user=""`) - nothing was
misbehaving, the broker had genuinely never been (re-)configured on this
unit's current saved credentials. The normal fix path (`M5Dial-Setup` AP,
`http://192.168.4.1`) turned out to be its own dead end for this session:
the AP accepted a client connection (`station connected` / `IP assigned`
in the serial log) but every page-load attempt aborted
(`ERR_CONNECTION_ABORTED`), with `station connected → disconnected →
connected` flapping in between and no crash/reset in the serial log -
consistent with `WiFiSetupServer::start()`/`startAP()`'s
`WiFi.mode(WIFI_AP_STA)` (AP + STA sharing one radio, a known ESP32
coexistence sharp edge), though a full power cycle before re-entering
setup mode didn't resolve it either.

Rather than keep chasing AP+STA radio coexistence, added a new always-on
`POST /api/mqtt` to `TestInterfaceServer` (`docs/device-contract.md` §6's
class of endpoint) - same field names and save-to-`WiFiCredentials` logic
as `WiFiSetupServer::handleMqttConfigure()`, reachable over the device's
already-working normal WiFi connection, no AP mode needed at all. Mirrors
the e-paper firmware's own existing precedent (`hil/README.md`: "`/api/mqtt`
is reachable without setup mode on the `xiao_esp32s3_hiltest` build") -
this device already has no field-hardening story gating anything else on
this server, so there was no consistency reason to gate this one endpoint
differently. No restart-on-save (matches the AP page's own behavior) - a
manual reboot (or, in practice, just the next project upload's own
reboot) is needed to pick up the new broker host, same one-time-per-device
step `hil/README.md` already documents for the e-paper target's `/api/mqtt`.

**Status: full 5/5 HIL pass against real hardware, 0/57600 differing
pixels on every combination** (`hil/m5dial/report/index.html`) - this
device's HIL suite is now genuinely green end to end, not just the
zip-install fix in isolation.

**Permanent regression coverage:** `main.cpp`'s `runJtagDebugTest()`
(gated by the `JTAG_DEBUG_TEST` build flag, `env:m5dial_debug` only) and
`src/test_deflate_zip.h`'s embedded DEFLATE test zip reproduce this exact
bug on every boot, with zero WiFi/HTTP involved - originally built to make
JTAG debugging tractable, now doubles as a standing regression test for
this fix. No HIL/e2e fixture exists yet for this device (unlike the
e-paper firmware's `hil/epaper/`) to also cover the full HTTP-upload path
end-to-end; worth adding once this device gets its own `hil/` directory.
