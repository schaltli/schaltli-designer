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

The designer ships with **zero** device knowledge baked in by default
(2026-08-16) - a device becomes known to a running instance one of three
ways: curated (a `.zip` checked into the designer's own `public/ddf/`, for
devices maintained alongside the designer), live MQTT announcement (device
publishes `url` in its `hello`, see §4's "Deploy-flow topics"),
or manual URL import (`app/api/ddf/fetch/route.ts`, a human pastes a URL on
the Startup Gate). The M5 Dial (below) is the reference example for the
latter two - its DDF source is maintained only in the firmware repo, never
shipped in the designer's own `public/ddf/`.

```
device.json
├── systemGeneration?        // "major.minor", absent = "1.0" — see lib/system-generation.ts
├── device { id, name, firmwareRepo?, platform?: "firmware"|"android" }
├── screen { width, height, colorDepth: "1bit"|"4bit"|"24bit", allowedRotations?: number[] }
├── adornment { svgPath }  // screen position AND every hardware button are both read off adornment.svg itself, not declared here (see below)
├── fonts[] { id, displayName, internalName, file, size, ascent, descent, format?: "bdf"|"ttf" }
├── supportedObjectTypes[]   // must exactly match what renderObject() dispatches — see §3
├── deviceActions?[]         // ids of actions only this device knows how to perform — see §5's registry
└── testInterface?           // HIL-only, see §6 — absent means no automated pixel-parity testing is possible
```

Fonts are shipped as **real on-device font data** (BDF bitmap glyphs for
firmware targets), not just a name reference — this is what makes
pixel-parity possible at all instead of hoping two independent font
renderers agree.

Whether a firmware *draws* with those glyphs is up to it, and the answer
matters more than it looks. `screenbee-waveshare-1v8` parses the `.bdf` out
of its own embedded DDF, so there is one font and the question "does the
device have this character?" has one answer. Firmware that instead selects a
compiled-in font by `internalName` has two, and they can differ silently:
that firmware shipped a 754-glyph `.bdf` while drawing with u8g2's
191-glyph `helvR18_tf`, so `€`, `—` and `…` rendered in the designer and
came out blank on the device, with both sides naming the same font
(2026-08-22). `internalName` is therefore informational unless a firmware
chooses to key on it; see DEVICE_GUIDE.md's "Ship the font, don't name it".

`allowedRotations` lists which 90°-multiples the device's physical
enclosure supports being mounted in, beyond native 0°. Omitted = native
orientation only.

### Adornment SVG element conventions

One fixed id and two id prefixes in the adornment SVG carry meaning for the
designer; every other element is just artwork.

- `id="screen"` — a `<rect>` marking exactly where the screen sits in the
  SVG's own coordinate space (2026-08-16, replaces the old
  `adornment.drawingArea` manifest field - see below). No fill/stroke
  needed; the designer reads its `x`/`y`/`width`/`height` attributes
  directly (`lib/device-description.ts`'s `extractScreenRect`) rather than a
  DDF author hand-transcribing coordinates into `device.json`. The document
  itself must be sized to the device's whole physical footprint (case +
  every visible button), not just the screen - an SVG loaded as an image is
  clipped strictly to its own `viewBox`, so any artwork outside the document
  edge (a real device's buttons routinely sit outside its screen rect) is
  silently dropped, not just cropped. See `DEVICE_GUIDE.md`'s "Building the
  adornment SVG" for the full authoring workflow.
- `id^="button"` — a hardware button's hit zone. There's no
  `hardwareButtons[]` array in `device.json` declaring these separately
  (removed 2026-08-16) - every matching element *is* a button, identified
  by that same id, which must be exactly what the device's own firmware
  uses to key that button's action in the exported `project.json` (§5) -
  no indirection table anywhere. Its display name comes from the element's
  `inkscape:label` attribute (required, must differ from the id itself -
  see `DEVICE_GUIDE.md`'s "Setting the `id` in Inkscape").
- `id="offscreen-N"` — **off-screen cover** (2026-08-14): a region of the
  framebuffer the device's physical panel never actually shows. A round
  panel is the motivating case: the M5 Dial's buffer is cartesian 240×240,
  but its glass is a circle, so the square's corners reach r≈170 from the
  center while the case ends at 140 — they used to stick out past the whole
  device as bare canvas background.

  These elements carry `fill="none"` in the file. The designer fills them at
  raster time with its own off-screen color (`--canvas-container-bg`, see
  `hooks/use-adornment-image.ts`) so they always match whatever sits behind
  the device, and any consumer that doesn't know the convention — the
  raw-SVG device thumbnail in the startup picker, say — simply draws nothing
  rather than a wrong-colored blob. The recolor happens on a copy; the
  project's stored `adornment` string is never mutated, so a designer-only
  color can't leak into device data or the export.

  A cover should span the whole viewBox, not just the drawing area: the
  designer paints rectangular chrome (a 1px border, a drop shadow) *around*
  that area, which would otherwise outline a rectangle the device doesn't
  have. Cut its inner edge slightly inside the case outline (139 vs 140 on
  the M5 Dial) so the case's own stroke covers the seam, and place it first
  in document order so the case and buttons still draw over it.

  Purely a designer-preview concern. Nothing masks the exported project or
  `app/test-render`'s reference render — those must keep matching the
  device's real framebuffer, corner pixels included, or HIL pixel-parity
  breaks for no gain. Opt-in: rectangular devices declare no covers.

**A DDF carries no version of its own** (`ddfVersion` was deleted
2026-08-21). Its identity is the `sha256` of its zip bytes, truncated to 16
hex characters, computed by whoever holds those bytes and rendered for
humans as a two-word name like `amber-otter` (`lib/ddf-name.ts`). That is
an identity, not a version: it has no ordering, only "same or not", which
is the only question a DDF version was ever asked. Nothing authors it, so
nothing can forget to bump it — the failure that produced the 1.7/1.9
history below. A *running* device optionally publishes that hash as
`ddfHash` alongside `url` in its MQTT `hello` to self-announce for the
designer's "Announced Devices" auto-discovery — see §4's "Deploy-flow
topics" for that mechanism.

**M5 Dial's current DDF** (source: `screenbee-m5dial/ddf-source/` in the
firmware repo, not this repo's `public/ddf/` — see this section's own intro
paragraph; embedded verbatim into `src/ddf_zip.h` by
`tools/generate-ddf-header.js` and served live at `GET /ddf.zip`, or
importable by URL on the Startup Gate. **The `ddfVersion` numbering below is
history**: the field no longer exists (see this section's identity
paragraph above), and it is kept here because it is the evidence that
motivated removing it. It last read 1.9 — 1.6 added the
`offscreen-0` cover described above; 1.7 (2026-08-16) replaced
`device.json`'s `adornment.drawingArea` with the `id="screen"` rect
convention and moved the DDF's canonical source out of the designer repo
entirely; 1.8 dropped the unused `x`/`y`/`width`/`height` fields from
`hardwareButtons[]` entries; 1.9 removed `hardwareButtons[]` from
`device.json` altogether, renumbering nothing (the SVG's `button-0`/
`button-1`/`button-2` already matched 1:1) but requiring `main.cpp`'s
button-action lookups to switch from `"btn-N"` to `"button-N"` literals
(§5) - all no visual change, all in sync with the firmware's own embedded
copy, stale until each pass regenerated it. Note (2026-08-19): 1.7 and 1.9
were changes to the DDF *file format*, not to this device's capabilities,
and by the test in docs/nested-provenance.md's "What counts as a
`schemaVersion` bump" they should have bumped the DDF's `schemaVersion`
rather than only `ddfVersion` - an older designer reads them as a silently
missing adornment, not as an error. Deliberately not renumbered
retroactively; see that section's "The one that already happened" for why,
and apply it to the next such change):
screen 240×240, 24bit, 3 hardware buttons (`button-0`/`button-1`/
`button-2` = "Rotate Left"/"Rotate Right"/"Push"), 4 BDF fonts (helvR08/12/
18/24, reused from the e-paper set), `supportedObjectTypes` = `[MqttDataField,
MQTTIconField, label, level-indicator, icon, line, box, SoftwareButton,
Switch, MqttDataLine, tab-control, panel]` — `MqttDataLine`/`tab-control`/
`panel` added 2026-08-14, ported from the e-paper reference's
`ScreenRenderer` into `ColorScreenRenderer` (see §8/§9 for the rest of the
M5 Dial gap history; `Switch` was already declared/implemented before this
doc caught up to it — a pre-existing drift in this paragraph, not a new
gap). **HIL-verified same day: 5/5 combinations, 0/57600 differing pixels**
against real hardware (`hil/m5dial/`), after clearing a LittleFS-full
condition on the test unit itself (unrelated to this code — a stale,
already-full filesystem on this specific device, fixed with an
`uploadfs`/empty-`data/` wipe plus redoing WiFi/MQTT setup) and fixing one
fixture-authoring mistake (a label's `borderColor: ""` isn't the same as
`"transparent"` to the designer's own reference renderer — see
`hil/m5dial/fixtures/build-comprehensive-test.js`'s comment on
`obj-panel-a-label`).

**Gaps:** no `allowedRotations` declared (fine if the physical enclosure
really is fixed-orientation — confirm, don't assume). Touch hit-testing
(`main.cpp`'s `findSoftwareButtonAt`/`findSwitchSegmentAt`) is still
top-level-only and doesn't recurse into an active `tab-control` panel's
children — a `SoftwareButton`/`Switch` nested inside a panel renders
correctly but isn't tappable yet (`testInterface` itself was a gap as of
2026-08-09 but has since been added — see §6/§9).

## 2. Project export — what the device receives

Built by `lib/project-zip.ts`, structurally mirrored field-for-field by the
firmware's `ProjectConfig`/`Screen`/`ScreenObject`/`ObjectProperties`
(`screenbee-m5dial/src/project/ProjectTypes.h` is the reference C++
mirror — keep both in sync by hand, there's no shared schema file).

Top level (`ProjectConfig`): `name`, `screenWidth`, `screenHeight`,
`exportColorDepth`, `topics[]`, `fonts[]`, `screens[]`, `hardwareButtons[]`
(id/name pairs only as of 2026-08-16 — no per-button default action here
anymore, see §5).

Each exported `Screen`: `id`, `name`, `path` (optional background bitmap,
already composited from color+image+static objects — see §7's
`createFlattenedBackground`), `backgroundColor`, `objects[]`,
`buttonActions[]` (keyed by button id). None of these three needs firmware
to know master screens exist: `backgroundColor`, `path`'s underlying image,
and `buttonActions[]` are all already the fully-resolved (local-override-or-
inherited-or-default) values by export time — `lib/project-zip.ts`
(`projectWithResolvedBackgrounds`) and `lib/master-screen.ts`
(`resolveBackgroundColor`/`resolveBackgroundImage`) do that resolution once,
the same way `objects[]` already gets a master's objects merged in and
`buttonActions[]` gets a master's actions resolved (§5). Grid color is the
one screen-level field that deliberately does *not* inherit — it's also
never exported at all, purely a designer-side alignment aid.

**`x/y/width/height` are always whole numbers.** The designer guarantees it
at both boundaries that own it (`lib/integer-geometry.ts`, since
**2026-08-26**): opening a project rounds what it holds, and building a
device export rounds again before anything reads it - the second is not
redundant, since an export can be built from a project this session never
loaded. Guaranteed here rather than asking each firmware to cope, because
coping is
what went wrong: ArduinoJson's `obj.x = objJson["x"] | 0` returns the
default for a value stored as a double, so a `150.5` written by the
designer's "Distribute H" loaded as `0` and put the object against the left
edge - silently, and plausibly enough to read as a designer bug. A reader
may take these as integers without checking; a reader that wants to be safe
anyway should round rather than default, since a fraction means "close to
here", never "at the origin".

Each `ScreenObject`: `type`, `id`, `x/y/width/height`, `zIndex`,
`properties {…}`, plus (firmware-export only, not `properties`) bitmap
paths the designer's export flattens onto the object: `path` (icon),
`pathNormal`/`pathActive` (SoftwareButton). `tab-control`/`panel` nest via
`children[]`, coordinates relative to the parent's own origin (the
renderer accumulates an offset descending).

Two consequences of that nesting, both spelled out since **2026-08-27**
because the designer's own export got each of them wrong and shipped a
screen of empty tiles:

- **Only a `tab-control` contributes to the offset; a `panel` contributes
  nothing.** A panel's own `x/y` is never applied — it fills its
  tab-control, and its children's coordinates are relative to the
  tab-control, not to it. Both renderers already work this way
  (`lib/render-screen.ts` translates by the tab-control's origin and then
  draws `activePanel.children` directly; `ColorScreenRenderer.cpp` does the
  same), so anything else that walks the tree has to match.
- **Baked bitmap paths appear at any depth, not only on `screen.objects`.**
  An icon inside a panel carries `path` exactly like a top-level one, and
  the bitmap is composited against the *absolute* screen position — a
  reader must not assume a path implies a top-level object.

`topics[]` carries two fields no firmware reads: `examples` (design-time
preview values, and what `hil/combinations.js` enumerates a HIL run from)
and, since **2026-08-25**, `mock` - what a mock MQTT host answers when that
topic receives a command, so an interaction can be tested without the real
installation. Both ship in the device export rather than being stripped,
because the HIL tooling reads the exported project and a second copy of
either would be free to disagree with the first. Ignore both; a reader that
skips unknown fields already does.

**Draw order is `zIndex`, then object id.** The id half is not decoration:
`lib/object-order.ts`'s `sortChildrenByZIndex` uses
`a.zIndex - b.zIndex || a.id.localeCompare(b.id)`, a total order, so two
overlapping objects can never come out in a different sequence twice. A
firmware that sorts on `zIndex` alone with a non-stable sort (`std::sort`)
resolves a tie however it likes, and the two sides are then free to disagree
about which object covers the other. Cost 1533 pixels on the first HIL run
that ever had two equal-`zIndex` objects overlapping (2026-08-25, a label
and a Switch on the Waveshare fixture); both sides were "correct" by their
own rule, only one of them had a rule. Byte comparison is close enough for
the ASCII ids this app generates.

`Switch` changed shape on **2026-08-25** and a firmware mirroring it needs
all four halves of that:

- `properties.mode` — `"segmented"` (absent counts as this) or `"single"`.
  Single draws one surface showing whichever state is active, and a tap
  advances to the next state in the list, wrapping. There is no "exactly
  two states" case to special-case: two states is a toggle, three is a
  cycle.
- The active state is marked by a **bar along the top edge**, never a
  filled segment: 10 px tall, inset 4 px from the top and 6 px from each
  side of its segment, corner radius 3, in `activeBackgroundColor` — which
  kept its name but now means the marker, not a fill. All whole numbers on
  purpose; a computed one is a rounding disagreement waiting to become a
  HIL diff on every Switch at once. Clamp the width to `max(4, segW - 12)`,
  or a narrow legacy object draws no marker at all.
- **Hollow means unconfirmed.** The same bar, outline only, drawn while a
  finger is down or a write is in flight, regardless of `showMarker` — a
  requested state that carries no marker would otherwise give no feedback
  for the up-to-3s the write is unacknowledged. The 3 px/1 px pending and
  pressed **rings are gone**; do not port them. In segmented mode the
  confirmed segment keeps its solid bar while the requested one shows
  hollow, so nothing has to lie about the current state.
- `states[].showMarker` (bool, single mode only — segmented always marks
  the active segment) and **no `activeTextColor` any more**: with nothing
  filled, a label never sits on a different background than its
  neighbours. Old projects still carry the key; ignore it.

Two consequences elsewhere: content lays out below a **fixed 14 px band**
reserved for the bar whether or not one is drawn, in both modes and every
state, so a Switch does not reflow when it is switched on; and
`states[].pathActive` is now only present when the author picked a
genuinely different picture for the active state, since both variants bake
against the same background. The existing "fall back to `path` when
`pathActive` is empty" branch already covers that — it was written for
exports predating the second variant and needs no change.

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

### 2.2 Zip compression — DEFLATE support is mandatory

`buildDeviceProjectZip()` (`lib/project-zip.ts`) **always** compresses the
project zip with DEFLATE — there is no STORE fallback and no per-device
allowlist. Every device's firmware **must** be able to extract a
DEFLATE-compressed zip correctly, from the very first version it ships:
this is a baseline requirement of this contract, not an opt-in capability
a device can decline. There is deliberately no DDF field to declare
"doesn't support DEFLATE" — a device that can't handle it isn't
contract-compliant.

This isn't a hypothetical: sending a naive miniz-based extractor a real
DEFLATE-compressed project zip has twice caused a genuine crash/reboot
loop on real hardware (M5 Dial, §8, 2026-08-09; e-paper reference
firmware, §10, 2026-08-11) — a real bug plus heap fragmentation exposing
it, not a transient glitch. Before writing a new device's extraction code,
read §8 and §10 in full; at minimum a new firmware target needs:

- A miniz build with the same fix already vendored in
  `screenbee-m5dial/lib/miniz/` and `MqttEPaperDisplay2/lib/miniz/` (static
  BSS buffers for the 32KB DEFLATE dictionary window instead of heap
  allocation — see either repo's `useDictReservingAllocator()`), applied to
  **every** extraction call site, not just the main install path (both
  reference firmwares originally missed a second, easy-to-overlook call
  site — `peekProjectDeviceId()` — that runs the same decompression
  internally).
- A real CRC32 check (`mz_crc32()` against `file_stat.m_crc32`) on
  extracted output, since `mz_zip_reader_extract_iter_free()`'s own return
  value isn't a trustworthy success/failure signal even with the fix
  above.
- A permanent on-device regression test exercising this against a real
  DEFLATE-compressed zip (see either repo's `test_deflate_zip.h` pattern),
  plus a HIL run through the actual upload/deploy paths before considering
  a new device contract-compliant here.

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

### Deploy-flow topics

Implemented on both e-paper and M5 Dial as of 2026-08-10 (M5 Dial:
`DeployManager.h`/`.cpp`, wired up in `main.cpp`'s `setupWiFi()`/`onMqttMessage()`).
This is the reference to port when adding self-deploy to a new device — the
topic/payload shapes below plus, more importantly, the "Implementation
gotchas" checklist after it. Every one of those gotchas came from a real bug
found on real hardware during the M5 Dial port; skipping any of them
reproduced the same failure mode there.

Under `screenbee/<clientId>/...` (`clientId` = firmware's own client id,
e.g. `"EPaper-" + MAC`, `"M5Dial-" + MAC`):
- `status` — retained, `online`/`offline` (offline = MQTT Last Will).
- `hello` — retained,
  `{deviceId, firmwareVersion, systemGeneration?, ddfHash?, url?}`,
  republished every (re)connect.
  - `url` is optional — a device that omits it is treated as "doesn't
    self-announce its DDF" and is silently skipped by the designer's
    "Announced Devices" auto-discovery
    (`components/device-scan-section.tsx`); a device that includes it must
    serve its own DDF zip at `url` (e.g. `GET http://<device-ip>/ddf.zip`)
    unauthenticated, byte-identical to what it ships embedded. See §1 for
    the DDF zip format itself.
  - `ddfHash` is optional and is the identity of exactly those bytes (§1):
    `sha256` of the served zip, first 16 hex characters, lowercase. Compute
    it in the build step that emits `ddf_zip.h` — it hashes the bytes it
    just wrote, so it cannot drift from them. **The designer verifies it**:
    if the bytes fetched from `url` hash to something else, the fetch is
    refused rather than cached, so an announcement that lies is visible
    instead of silently poisoning the designer's copy. Omit it and the
    designer simply hashes what it downloads (one fetch per session, no
    check possible).
  - `systemGeneration` is optional, `"major.minor"`, and declares what this
    firmware can read (`lib/system-generation.ts`). The deploy dialog checks
    it *before* uploading a project zip, so a device on an older major says
    so in the dialog instead of refusing the download afterwards where only
    its own logs would show it.
- `deploy` — retained, `{deployId, url, crc32}`, published by the browser.
  `url` points at a project zip the device downloads over plain HTTP;
  `crc32` is the zlib/miniz CRC32 of that zip's raw bytes.
- `deploy-status` — not retained, `{deployId, state, percent?, error?}`,
  published by the device through
  `downloading → download_complete → verifying → applying → rebooting`,
  or `error`/`busy`/`up_to_date`. `percent` (0-100, integer) is read
  directly by the designer's progress bar (`deploy-dialog.tsx`, via
  `status.percent ?? 0`) — omit it and the bar simply never moves even
  though every other part of the flow is working correctly. Report it at
  least at each throttled step during `downloading` (e.g. every 10%), not
  just at start/end.

### Implementation gotchas (found porting this to M5 Dial, 2026-08-10)

Every item below fixed a real, reproduced bug. Treat this as a checklist
when wiring deploy onto a new device, not just historical trivia:

1. **Clear the retained `deploy` trigger first, before any other
   processing.** `deploy` is retained so a browser-initiated deploy still
   reaches a device that's mid-reconnect. But that means the trigger stays
   on the broker forever until something clears it — and a successful
   deploy ends in `ESP.restart()`, so on the very next boot the device
   resubscribes, immediately receives the *same* retained trigger again,
   and redeploys — an infinite deploy→reboot→redeploy loop. Fix: publish
   an empty payload with `retain=true` to the `deploy` topic as the very
   first thing the handler does after parsing the JSON, before checking
   busy state, before downloading, before anything else.
2. **Never call `publish()` from directly inside the MQTT message
   callback.** The callback runs nested inside the MQTT library's own
   `loop()`/receive-processing call stack, which on constrained libraries
   (e.g. PubSubClient) may share a single RX/TX buffer between incoming
   and outgoing packets — publishing from inside the callback risks
   corrupting whichever packet is still being parsed. Defer the actual
   handling: set a flag + stash the payload in the callback, then act on
   it from the next iteration of the main `loop()`, after the MQTT
   library's own `loop()` call has fully returned.
3. **Audit any "clear all subscriptions" helper for device-level vs.
   project-level topics before adding a device-level (deploy) subscription
   to it.** This was the actual root cause on M5 Dial: project-loading
   code called a `clearSubscriptions()` convenience method to drop the
   *previous* project's MQTT topics before subscribing to the new
   project's, but that method had no concept of "device-level" topics and
   silently unsubscribed `deploy` too — moments after `deploy` had just
   been subscribed during the same boot. The device was only ever
   listening on `deploy` for the brief window before that wipe: long
   enough to usually catch an already-retained trigger (delivered
   essentially with the SUBACK) but never a genuinely live one published
   later during normal operation. Symptom looked exactly like "works if I
   reset the device, never works otherwise" — that pattern is a strong
   signal to check for exactly this bug. Fix: re-subscribe to `deploy`
   immediately after any project (re)load path that clears subscriptions,
   or better, give the MQTT wrapper a real distinction between
   device-level and project-level subscriptions so project reloads can
   never touch the former.
4. **Set a generous MQTT keepalive, especially on a shared/busy broker.**
   Short keepalives (e.g. PubSubClient's 15s default) make a device
   disproportionately sensitive to any transient broker/network hiccup —
   observed as frequent reconnect churn on a broker also serving a dozen+
   other clients (e.g. Home Assistant's `mqttthing` integrations) at 60s
   keepalive. A device that spends a meaningful fraction of its time
   mid-reconnect will intermittently miss live-published (non-retained)
   messages during exactly those gaps. Match whatever the busiest/most
   reliable other clients on the same broker already use (60s worked
   here) rather than trusting a library default.
5. **Verify the download with the same CRC32 the browser computed**,
   over the raw downloaded bytes, before installing anything — this catches
   truncated/corrupted downloads distinctly from install-time content
   errors, which matters when reporting `error` state back to the deploy
   dialog.
6. **Check the deploy payload's target device ID against this device's own
   ID before installing**, if the project zip carries one (peek the zip's
   own manifest without fully installing first) — protects against an
   in-flight deploy meant for a different device on the same broker.

When debugging "device confirms `publish()` returned true but the
subscriber never sees it" symptoms: don't trust confirmation the message
*left* the device as confirmation it *arrived* — verify directly on the
broker itself (e.g. `mosquitto_sub -h localhost -t 'screenbee/#' -v` run
over SSH on the broker host, not over the network path the device/browser
use) to rule out delivery-layer issues independent of anything device-side.

## 5. Hardware input contract

Every exported screen carries its own `buttonActions` object (button id ->
`ButtonAction`) - that is **the only place firmware ever needs to look**.
There is no project-wide default level anymore: what used to be
`HardwareButton.defaultAction` (a single fallback shared by every screen)
was deleted 2026-08-16 in favor of master-screen inheritance (§1's
`ProjectScreen.isMaster`/`masterScreenId` - already used to merge a master's
*objects* into every screen that references it). A master screen can define
its own `buttonActions`; any normal screen assigned to it inherits them
unless it sets its own entry for the same button id - and the designer
resolves that inheritance **at export time** (`lib/project-zip.ts`,
mirroring how it already flattens a master's objects into each screen), so
the exported `buttonActions` per screen is always the final, already-
resolved answer. Firmware's `getButtonAction(screenIndex, buttonId)`-style
lookup does not need to know the master mechanism exists, exactly as it
already doesn't need to know about master *objects*.

Each `ButtonAction`: `type: "next-screen"|"previous-screen"|"goto-screen"|
"send-mqtt"|"goto-setup-mode"|"device-action"` (an absent entry for a button
= no configured action; every button still sends a generic button-press MQTT
notification regardless). `goto-screen` needs `targetScreenId`; `send-mqtt`
needs `mqttTopic`+`mqttMessage`; `device-action` needs `deviceActionId` (see
the registry below). A fifth type, `"none"`, exists in the designer's
own `HardwareButtonAction` union (a screen can explicitly say "this button
does nothing here", distinct from inheriting nothing) but is a pure
designer-side sentinel - the export step strips it before it ever reaches
`buttonActions`, the same as any other button with no effective action.
Firmware never needs to parse `"none"`.

### Device action registry (`deviceActions` + `type: "device-action"`)

Everything else in the action model is something the *designer* understands
and the device merely performs. A device action is the inverse: the device
declares an id in its DDF (`deviceActions: ["showScreenMenu"]`), the designer
offers exactly those ids wherever a button action is configured and writes the
chosen one back as `{ "type": "device-action", "deviceActionId": "..." }`, and
what it actually does is entirely the firmware's business. That's what makes
an on-device capability bindable without teaching the designer a new action
type per device.

**Ids are a cross-device naming contract, which is the whole reason this
registry exists.** The same capability must carry the same id everywhere, or
a project stops being portable between two devices that both offer it. Add an
id here *and* to `lib/device-actions.ts` (the designer's label map) in the
same change - and only when a second device really offers it, rather than
speculatively.

| id | Meaning | Offered by |
|---|---|---|
| `showScreenMenu` | Open the device's own screen-switching navigator overlay | `waveshare-knob-1v8` |

**Both sides tolerate ids the other doesn't know, and neither may block on
the other's version:**

- Firmware: an unknown `deviceActionId` is **skipped and logged**, never an
  error - a project may legitimately have been built against a newer device.
- Designer: an id that isn't in the registry is still **offered raw** (its
  own id as the label, `describeDeviceAction`), so a device shipping a new
  action never has to wait for a designer release to be usable.

Adding `deviceActions` to a DDF is an **additive minor** under the version
model (a new optional field - see `docs/version-model-simplification-plan.md`),
and was its first real exercise.

The designer has no way to simulate one: preview mode shows a "would run X"
toast, the same stance it already takes for `goto-setup-mode`, because faking
behavior it deliberately doesn't know would be a lie about what the device
will do.

Only a button's `id` (e.g. `"button-0"`) matters to firmware. `id` is
exactly the adornment SVG's own element id - not an arbitrary DDF-declared
identifier - so firmware must key its own button lookups with that same
string (§1's "Adornment SVG element conventions"). This used to be two
different strings bridged by a `device.json` `hardwareButtons[]` entry
(`id: "btn-0"` / `svgElementId: "button-0"`, plus a `name` and a `shape`,
`x`/`y`/`width`/`height`) - all of that is gone as of 2026-08-16: `name` is
now read from the SVG element's own `inkscape:label` (designer-only, never
exported - firmware has no use for a human-friendly name), and the
position/shape fields existed only to place a small status-dot overlay in
the since-deleted Project Settings > Hardware Buttons page. The designer's
live belegt/vererbt/lokal (unassigned/inherited/local) status coloring that
replaced it lives entirely in the designer (`canvas.tsx`'s `draw()`,
`lib/hardware-button-actions.ts`) - also nothing firmware needs to know
about.

**Migrated 2026-08-16, both reference devices**: `MqttEPaperDisplay2`
(`Application.cpp`'s `dispatchButtonAction`) switched its
`"btn-" + String(buttonId)` formatting to `"button-" + String(buttonId)` -
a pure string-prefix change, `buttonId` itself (already the *logical*
button number, `BUTTON_PIN_MAP` in `main.cpp` handles the physical-pin
translation earlier) is untouched. Its adornment SVG's 12 button elements
were renumbered to match (old sequential `button-0`..`button-11` reading
order → the device's real physical/firmware numbering, e.g. the old
`button-0` element is now `button-10`, per the exact permutation that used
to live in its `hardwareButtons[]` `id`↔`svgElementId` pairing - see
`public/ddf/mqtt-epaper-display.ddf.zip`'s `adornment.svg`), each gaining
an `inkscape:label` (e.g. `"Button 10"`) carried over from its old `name`.
M5 Dial needed no SVG renumbering (its 3 buttons' SVG ids already matched
1:1) - just the same `"btn-" + N` → `"button-" + N` fix in `main.cpp`'s 4
call sites (§1's own M5 Dial paragraph has the ddfVersion history).

**M5 Dial specifics not yet covered by this contract as written:** the
device has a rotary encoder (2 of its 3 declared buttons are "Rotate
Left"/"Rotate Right", i.e. encoder direction, not discrete pushes) and a
touchscreen — neither has an established mapping onto the
next-screen/previous-screen/goto-screen/send-mqtt action model yet. Decide
this before wiring real button handling in firmware, not after — it
affects whether "Rotate Left" is even the right abstraction for an
encoder, versus something like a delta/scroll event type the current
`ButtonAction` union doesn't have a slot for.

### Getting back into setup mode

**Every device must offer one way into setup mode that no project can take
away, using only the device itself.** Agreed 2026-08-23 after the question
"how do I move a device to a different WiFi when I can't reach the network
it is on?" turned out to have no good answer.

The device falls back to its AP on its own when a saved network is *gone*,
so that case self-heals. The hole is the opposite one: the device connects
happily to a network you cannot reach - an IoT VLAN, a guest network, a
router you have no access to. Then the config page is on the far side of
exactly the thing you are trying to change.

`goto-setup-mode` exists as a bindable action, but binding it is a decision
made while *designing a project*, and a way back into device configuration
must not depend on that. The device this was found on had four screens and
bound the action nowhere; the only remaining route was
`POST /api/forget-wifi`, which reaches setup by **destroying** the
credentials first. Having to break one setting to change another is not a
recovery path.

**The gesture: hold the primary input for five seconds.** On a touch device
that is one finger held anywhere; on a device whose primary input is a
button or an encoder, that button held. Same behaviour everywhere, whatever
the hardware - this is one of the cross-device building blocks, like
setup-time text entry.

- After **one second** a countdown appears. Releasing before zero cancels,
  and nothing else happens either: from the moment the countdown shows, the
  gesture belongs to setup mode and no project action fires on release. A
  user who lets go wanted neither setup nor the button they were resting on.
- At **five seconds** the AP starts.
- If the display is off (see `displayOffAfterSeconds`), the touch that wakes
  it also starts the hold. Holding is unambiguous; requiring a second
  deliberate touch would just be a worse first touch.

**One finger, not several, and that is a hardware fact rather than a
preference.** Measured on the Waveshare's CST816 (2026-08-23, 15 trials):
a single finger reports continuously for as long as it is held - 223-342
samples over 1.5-2.4s - while a two- or three-finger contact is reported
for about **100ms** and then stops, however long it is actually held. The
reported count also saturates at 2, so three fingers cannot be told from
two. A multi-finger *hold* is not implementable on that panel, and a device
whose only guaranteed way into configuration depends on an unreliable
gesture has no guaranteed way in.

**While the AP is up** the device shows the SSID, the password, the config
URL, and a QR code carrying a `WIFI:` URI (`WIFI:S:<ssid>;T:WPA;P:<pass>;;`)
- phone cameras recognise that natively and offer to join, and the captive
portal then opens by itself. A URL QR code would be useless, since nothing
can reach it before joining. There is a cancel control, and a two-minute
timeout that **pauses as soon as a client connects**, so it cannot expire
while someone is typing. On timeout the device restarts.

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
- ~~`MqttDataLine`, `tab-control`, `panel` are unimplemented and correctly
  left out of the DDF's `supportedObjectTypes`~~ **done 2026-08-14** — see
  §1's DDF paragraph. Touch hit-testing was deliberately NOT extended into
  nested panel children as part of this (rendering-only port) — still a
  real, open gap, see §1's "Gaps" note.

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
composited in, not reproducible by hand the way the others are — **updated
2026-08-14**: `line` now exercises fillet/thick-stroke/arrowheads, and
MqttDataLine + tab-control/panel were added once `ColorScreenRenderer`
gained them, bringing coverage to 10 of the DDF's now-12 declared types;
SoftwareButton and the newer `Switch` type remain uncovered for the same
bake-not-reproducible-by-hand reason — **5/5 HIL pass, 0/57600 differing
pixels, verified against real hardware same day**) and
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
   `ColorScreenRenderer::getU8g2FontById()` only ever matches fonts by
   `internalName` against compiled-in u8g2 font tables (a BDF-file-driven
   renderer was dismissed as a fictional possibility here; the Waveshare
   firmware became exactly that on 2026-08-22, after the two-fonts problem
   this note assumes away turned out to be real), and the real
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

**The AP+STA setup-mode connectivity problem, root-caused and fixed
(2026-08-10) - a port conflict, not a WiFi radio coexistence issue as
first suspected.** `testInterfaceServer` (a `WebServer` on port 80) is
started once at boot and never stopped; re-entering setup mode via the
3-second button hold (`main.cpp`'s `loop()`) called
`wifiSetupServer.startAP()` directly, which binds its *own*
`WebServer(80)` without ever releasing the first one - two listening
sockets on the same port simultaneously. Once `setupModeActive` is true,
`loop()` only calls `wifiSetupServer.handleClient()` (not
`testInterfaceServer`'s) - any TCP connection that happened to land on
the still-bound-but-now-unserviced first socket just sat there until the
client gave up, exactly matching the observed symptom
(`ERR_CONNECTION_ABORTED`, reproduced identically across two different
phones, ruling out a client-side cause). `WiFiSetupServer` genuinely
does use `WiFi.mode(WIFI_AP_STA)`, and that theory was a reasonable first
guess given the AP-connect/disconnect flapping seen in the serial log,
but it was a red herring - the flapping was itself downstream of phones
retrying a request that could never succeed. Fixed with a new
`TestInterfaceServer::stop()` (releases the port-80 `WebServer`
entirely), called right before `wifiSetupServer.startAP()` in the
long-press handler. **Verified on real hardware with two different
phones** - the `/api/mqtt` endpoint added earlier this session to work
around this is no longer strictly necessary for reaching the setup page,
but stays (mirrors the e-paper firmware's own precedent, and remains the
faster path for HIL/automation use since it needs no AP mode at all).

**Permanent regression coverage:** `main.cpp`'s `runJtagDebugTest()`
(gated by the `JTAG_DEBUG_TEST` build flag, `env:m5dial_debug` only) and
`src/test_deflate_zip.h`'s embedded DEFLATE test zip reproduce this exact
bug on every boot, with zero WiFi/HTTP involved - originally built to make
JTAG debugging tractable, now doubles as a standing regression test for
this fix. No HIL/e2e fixture exists yet for this device (unlike the
e-paper firmware's `hil/epaper/`) to also cover the full HTTP-upload path
end-to-end; worth adding once this device gets its own `hil/` directory.

## 10. RESOLVED 2026-08-14 (opened 2026-08-11): ported the DEFLATE-extraction fix to the e-paper firmware

**Status when this section was opened: mitigated but not fixed.** The designer
(`lib/project-zip.ts`) had started compressing deploy zips with DEFLATE by
default (previously always STORE, JSZip's silent default - shrinks a
typical project zip by ~85%, see that file's own comment). Turning that on
and deploying to a real `MqttEPaperDisplay2` unit (`mqtt-epaper-display-2`,
instance `EPaper-9403004aec24`) sent it into a genuine crash/reboot loop
live, 2026-08-11 - confirmed by reading `MqttEPaperDisplay2/src/project/
ProjectInstaller.cpp` directly: it had **none** of §8's DEFLATE-extraction
fix. Read §8 in full for the original M5 Dial bug this ports - this
section only summarizes.

**Immediate mitigation applied at the time:** the retained MQTT deploy
trigger on `screenbee/EPaper-9403004aec24/deploy` was cleared (empty
retained publish) so the device stopped re-fetching the same deploy on
every boot, and `lib/project-zip.ts` was changed to only use DEFLATE for
device IDs on an explicit allowlist (`DEFLATE_SAFE_DEVICE_IDS`). The
physical unit needed a manual power cycle at the time - it had stopped
producing any serial output at all (not just a clean reboot loop), which
looked like a hard hang rather than a clean watchdog reset.

**Port completed and hardware-verified 2026-08-14**, `MqttEPaperDisplay2`
commit `725f125` ("Fix DEFLATE project-zip extraction crash: vendor
patched miniz, guard both extraction call sites") - implements exactly the
three items below. `"mqtt-epaper-display-2"` has been added back to
`DEFLATE_SAFE_DEVICE_IDS` in `lib/project-zip.ts`.

**Verification (real hardware, unit `EPaper-9403004aec24`, 2026-08-14):**
ran `hil/epaper/orchestrator.js` against a DEFLATE-compressed build of
`hil/epaper/fixtures/comprehensive-test.zip` two ways - (1) the setup-mode
HTTP upload path (`/api/project`), which is `installProjectZipFromFile()`'s
other caller: uploaded clean, device rebooted without a hang, 5/5
combinations pixel-exact (0/120000 differing pixels each); (2) `--deploy-
flow` mode, exercising the actual "Deploy to Device" MQTT self-deploy path
that crashed in production - full `downloading → verifying → applying →
rebooting` sequence, pixel-exact render after (0/120000), plus the
existing mismatched-deviceId rollback case still passed. No crash, no
hang, in either path. `e2e/deploy-dialog.spec.ts`'s designer-side
regression test (added alongside the original mitigation) was flipped
from asserting STORE to asserting DEFLATE is now used for this device,
matching the existing M5 Dial precedent in `e2e/page-icon-export.spec.ts`.

**What was ported, `screenbee-m5dial` → `MqttEPaperDisplay2`:**

1. **Vendored a locally-patched miniz.** `MqttEPaperDisplay2` had been
   fetching miniz via PlatformIO's library manager (unpatched upstream,
   landing in `.pio/libdeps/*/miniz/`, not a real `lib/miniz/` in the
   repo). `screenbee-m5dial/lib/miniz/` (the patched source, see
   `miniz_zip.c`'s patch comment on `mz_zip_reader_extract_iter_new()` for
   bug (1) - the OOM path freeing a non-heap pointer for in-memory
   archives) was copied into `MqttEPaperDisplay2/lib/miniz/`, and
   `MqttEPaperDisplay2/platformio.ini` no longer pulls the git/registry
   dependency (mirrors `screenbee-m5dial/platformio.ini`'s own comment on
   why it's vendored, not git-fetched).
2. **Static BSS buffers for the 32KB DEFLATE dictionary window (bug (2) -
   heap fragmentation exposing bug (1)).** `ProjectInstaller.cpp`'s
   `useDictReservingAllocator()` (custom `mz_pAlloc` handing out padded
   static buffers instead of heap) is wired into every
   `mz_zip_reader_extract_iter_new()` call site. `peekProjectDeviceId()`
   was also rewritten off `mz_zip_reader_extract_file_to_heap()` (a
   different miniz entry point that still runs `tinfl_decompress()`
   internally and turned out to hit the same bug) onto the same guarded
   iterator API.
3. **Stopped trusting `mz_zip_reader_extract_iter_free()`'s return value**
   (§8: "not trustworthy as a success/failure signal even after both
   fixes above") - `installProjectZipFromFile()` now computes a real
   CRC32 over the extracted output (`mz_crc32()`) and compares against
   `file_stat.m_crc32`, same as
   `screenbee-m5dial/src/project/ProjectInstaller.cpp`.

`MqttEPaperDisplay2` also gained its own permanent on-device regression
test as part of this port (`DEFLATE_SELFTEST` build flag, `src/
test_deflate_zip.h`, `runDeflateSelfTest()` at the end of `setup()`),
mirroring §9's approach for the M5 Dial - both against an embedded test
zip (fast, no WiFi/HIL needed) and the two real-hardware HIL runs above
(exercising the actual upload/deploy paths end-to-end).

**Follow-up done 2026-08-14:** with both reference devices now verified,
DEFLATE-extraction support was promoted from a per-device allowlist to a
hard requirement of this contract (§2.2) - `DEFLATE_SAFE_DEVICE_IDS` in
`lib/project-zip.ts` is gone, `buildDeviceProjectZip()` always
DEFLATE-compresses unconditionally. Any new device firmware must handle
this from day one; see §2.2 for what that requires.
