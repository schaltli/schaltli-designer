# Device Guide — Creating a Device Description File (DDF)

This guide is for anyone building a new device target for ScreenBee: a Device
Description File (DDF) that tells the designer everything it needs to know
about your hardware, and a test plan for verifying the designer's output
actually matches what your firmware renders.

## Why DDFs exist

Screen size, color depth, physical button layout, and the exact fonts baked
into firmware used to be entered by hand in the designer's Project Settings,
per project. That was tedious and, worse, an easy way for a project to drift
out of sync with the real device. A DDF makes the device the single source
of truth: the designer imports it instead of the user re-entering the same
facts every time.

Every project must reference a device (see the startup screen). Since
"nested provenance" shipped (2026-08-15, see docs/nested-provenance.md), a
project built after that carries its own embedded DDF copy
(`_source/ddf.zip`) and opens against *that*, self-contained — it never
re-reads this instance's `public/ddf/`/`.data/ddf/` at all. `public/ddf/`'s
role is narrower: it only proposes a starting point when creating a **new**
project. So the DDF you write here (or serve live, or host at a URL - see
below) is what a fresh project gets built from; an already-open project
keeps using whatever it was actually built with.

## What a DDF is

A DDF is a `.zip` file with this layout:

```
your-device.ddf.zip
├── device.json       (required — the manifest, see below)
├── adornment.svg      (required — device mockup + physical buttons)
└── fonts/
    ├── some-font.bdf   (one .bdf file per font entry in device.json)
    └── ...
```

Three ways a running designer instance learns about a device - pick whichever
fits how you're maintaining this DDF:

1. **Curated**: drop the `.zip` into `public/ddf/` in the designer repo and
   it shows up automatically — the designer scans that folder
   (`app/api/ddf/list`) on every request, no server restart needed for local
   development. There's no upload UI on the hosted/public instance; devices
   are added by whoever runs that instance, by design (see "local-first"
   below). Best when you maintain both the designer and this device, or want
   it to always be there with zero setup.
2. **Live announcement**: have your device publish `ddfVersion`+`url` in its
   retained MQTT `hello` (see docs/device-contract.md §4's "Deploy-flow
   topics") and serve its own DDF zip at that `url`. The designer picks it
   up automatically the moment it's on the same network - see
   `components/device-scan-section.tsx`.
3. **Manual URL import**: paste a URL to a hosted `.ddf.zip` (a GitHub
   raw-file link, a release asset, anything reachable over plain HTTP) into
   the "Add device from URL" field on the Startup Gate. No live device
   needed - this is how a designer instance with **zero** curated devices
   still gets one (`components/ddf-url-import.tsx`,
   `app/api/ddf/fetch/route.ts`).

The M5 Dial's DDF (`m5stack-m5dial-v1-1`) is the worked example for (2)/(3):
its real source (`device.json`/`adornment.svg`/`fonts/`) lives only in the
`screenbee-m5dial` firmware repo's own `ddf-source/`, hand-edited there, not
shipped in this repo at all (2026-08-16 - see docs/device-contract.md §1).
The e-paper device (`public/ddf/mqtt-epaper-display.ddf.zip`) is still the
worked example for (1) - a real device (1-bit e-paper, paired with the
`MqttEPaperDisplay2` firmware repo), curated because that pairing is
maintained here.

## `device.json` reference

```jsonc
{
  "ddfVersion": "1.0",

  "device": {
    "id": "your-device-id",          // stable, unique - projects store this
    "name": "Human-Readable Name",   // shown in the device picker
    "firmwareRepo": "YourFirmwareRepo" // optional, informational only
  },

  "screen": {
    "width": 400,
    "height": 300,
    "colorDepth": "1bit"              // "1bit" | "4bit" | "24bit"
  },

  "adornment": {
    "svgPath": "adornment.svg"
    // Where the screen sits inside adornment.svg is NOT declared here - it's
    // read directly off a `<rect id="screen">` in that SVG. See "Building
    // the adornment SVG" below.
  },

  // No hardwareButtons array here at all (removed 2026-08-16 - see
  // docs/device-contract.md §5). Every element whose id starts with
  // "button" in adornment.svg *is* a hardware button; see "Building the
  // adornment SVG" below for the full convention, which is now mandatory
  // for your firmware too, not just this file.

  "fonts": [
    {
      "id": "font-helvR08",
      "displayName": "Helvetica 8px",
      "internalName": "u8g2_font_helvR08_tf", // must match what firmware selects by
      "file": "fonts/helvR08.bdf",
      "size": 12,      // = ascent + descent
      "ascent": 10,
      "descent": 2
    }
  ],

  // ScreenObject["type"] values your firmware actually renders. Anything
  // not listed here is still placeable in the designer, but gets disabled in
  // the toolbar / flagged on canvas, since it would be invisible on the real
  // device. Current valid types: "MqttDataField", "MQTTIconField", "label",
  // "icon", "line", "box", "level-indicator", "SoftwareButton".
  "supportedObjectTypes": ["MqttDataField", "MQTTIconField", "label", "level-indicator"],

  // Optional - see "Testing your device" below.
  "testInterface": { }
}
```

Get `ascent`/`descent`/`size` from the actual `.bdf` file's
`FONT_ASCENT` / `FONT_DESCENT` header lines rather than guessing — the
designer uses these numbers directly to position text, so a wrong value here
is a pixel-accuracy bug, not just cosmetic.

## Building the adornment SVG

The adornment SVG is a device mockup drawn **on top of** the actual project
canvas (`ctx.drawImage(...)` runs after all objects are drawn), with the
screen area left transparent so the real content shows through, and
`<rect>` elements marking physical button hit-areas. Recommended workflow if
you're building this in Inkscape: set the document size (Document
Properties, unit `px`) to your device's **whole physical footprint**
(case + every visible button), not just the screen - see point 3 below for
why that distinction matters. Three non-obvious requirements that will
otherwise cost you a confusing debugging session:

1. **The screen area must be a real punched-out hole, not just an unfilled
   shape drawn on top.** A `<rect fill="none">` sitting on top of an opaque
   device-body shape doesn't remove what's already painted there — it just
   paints nothing *additional*, so the body still shows through, covering
   your whole project. Build the body as a single `<path fill-rule="evenodd">`
   with two subpaths: the outer body shape, then the inner screen shape
   (rect or circle). This is the SVG equivalent of Inkscape's
   *Path → Difference*. See either shipped example DDF's `adornment.svg` for
   a working template (rectangular and round versions).

2. **The root `<svg>` needs explicit `width`/`height` attributes matching its
   `viewBox`** — not `viewBox` alone. The designer loads the adornment as an
   `Image()` and draws it with `ctx.drawImage(img, 0, 0)` (no explicit
   destination size), so it renders at the image's browser-computed natural
   size. Without explicit `width`/`height`, that natural size is unreliable,
   and the whole adornment silently ends up misaligned relative to the
   screen content. Hand-authored Inkscape SVGs usually have this by default
   (Inkscape always writes `width`/`height`); a hand-written or generated SVG
   easily doesn't.

3. **Nothing may extend past the document's own edge.** A browser clips an
   SVG loaded as an image strictly to its `viewBox` — unlike inline SVG in an
   HTML page, there's no way to opt out of this from outside the file. If
   your document is sized to just the screen, any button or bezel artwork
   that sits outside the screen rectangle (the normal case for real hardware:
   the M5 Dial's side buttons sit well outside its round screen) is silently
   discarded on load rather than just visually cropped at the edge. This is
   why the recommended document size above is the device's whole footprint,
   not the screen alone.

Mark the screen's position with a `<rect id="screen" x="…" y="…" width="…"
height="…" fill="none" stroke="none"/>` at the exact position/size Inkscape
already shows you for the punched-out hole above — the designer reads this
rect's own `x`/`y`/`width`/`height` attributes directly
(`lib/device-description.ts`'s `extractScreenRect`) rather than a
hand-transcribed number in `device.json`. It needs no fill or stroke; it's a
measurement-only marker, and the visible hole is still the path from point 1.
See any shipped example DDF's `adornment.svg` for a working template.

**Setting the `id` in Inkscape - use the right field.** Inkscape's Object
Properties dialog (Object → Object Properties…, or the German UI's
"Objekteigenschaften") has two separate text fields that look similar but
aren't: **ID** (German: "Kennung") and **Label** (German: "Beschriftung").
Only **ID/Kennung** becomes the real SVG `id` attribute the designer's code
searches for (`id="screen"`, `id="button-N"`, `id^="offscreen"`). **Label/
Beschriftung** becomes Inkscape's own `inkscape:label` attribute instead - a
purely cosmetic name shown in Inkscape's XML editor/Layers panel, completely
invisible to and ignored by the designer. Setting only the Label and leaving
the ID at Inkscape's auto-generated default (`rect1234`, `path5678`, …) is
the most common way this convention silently fails to work. The ID field is
only visible in Object Properties, not in the toolbar/status bar - open that
dialog to check or set it.

Buttons must be `<rect>` or `<path>` elements with an `id` starting with
`"button"` — hit-testing (`detectSvgButtonAtPoint` in `components/canvas/
canvas.tsx`) handles both: a `<rect>` via its own `x`/`y`/`width`/`height`
attributes, a `<path>` via `Path2D` + `isPointInPath()` against its `d`
attribute (added 2026-08-11 for the M5 Dial's curved rotate-arrow buttons,
which aren't representable as a plain rect at all). `<circle>`/`<ellipse>`/
`<polygon>` etc. still silently don't hit-test - use a `<path>` for a round
button instead. Whatever shape you use is also what the designer's own
canvas recolors directly while you work (gray/yellow/red for unassigned/
inherited-from-master/locally-defined - see docs/device-contract.md §5), so
give it a real fill to begin with, not `fill="none"`.

**The id itself is a hard contract with your firmware, not just a designer
convention** (2026-08-16 - see docs/device-contract.md §5). There is no
`hardwareButtons[]` array in `device.json` mapping a "nice" id to some
internal firmware id anymore - whatever a button's own `id` is in
adornment.svg (e.g. `"button-0"`) is *exactly* the string your firmware
must use to key that button's action when it reads the exported
`project.json` (`getButtonAction(screenIndex, "button-0")`, not `"btn-0"`
or a bare `0`). If your device's physical button numbering doesn't match
the SVG's natural drawing order 1:1 (a real, common case - e.g. buttons
wired to a GPIO expander in a different order than they're laid out
visually, see the e-paper reference device's own 12-button DDF), give each
SVG element the id your firmware *already* uses for that physical button,
not the other way around - don't invent a new numbering and then try to
make firmware match it.

The button's display name (shown wherever the designer lets you configure
that button's action) comes from Inkscape's **Label** field, not the **ID**
field - see "Setting the `id` in Inkscape" above for that distinction. It's
required, and must actually be a human name ("Rotate Left") rather than a
copy of the id ("button-0") - the designer rejects the DDF at import time
otherwise, with an error naming the offending button.

## Testing your device

Two tiers, aimed at the same underlying goal: what the designer shows should
be what the device actually renders, pixel for pixel.

### Tier 1 — designer-only regression

A headless-browser (Playwright) screenshot of the designer's canvas for a
known project, diffed against a previously-approved reference image. Catches
accidental regressions in the designer's own rendering code. No hardware
needed, fast enough to run on every commit.

### Tier 2 — hardware-in-the-loop (HIL)

**Status: designed, not yet built.** This section documents the plan so
device authors can design their firmware's test surface against it now,
before the orchestrator tooling exists.

The core idea: a ScreenBee **project is itself the test suite**, no separate
test-case format needed.

- Build one project with many screens; each screen is one test case.
- For object types bound to MQTT (data fields, icon fields, level
  indicators), give each test case its own dedicated topic with a fixed
  first example value (`topic.examples[0]`) — the designer already renders
  MQTT-bound fields using `examples[0]` when there's no live broker
  connection (see `getPreviewValueFromTopic` in `components/canvas/canvas.tsx`),
  so a headless render of the project automatically shows the exact value
  you're testing, with zero extra plumbing. One topic per distinct test
  value (e.g. six topics to cover a level indicator at -0.5, 0, 0.5, 0.75, 1,
  1.5), because all topics only need to be published once, at the start of a
  test run — not re-published between screens.
- The **expected image** is a fresh headless designer render of that same
  screen (same project file, same `examples[0]` values) — not a hand-curated
  golden image maintained separately. This keeps the test honest: it's
  always comparing against what the designer *currently* claims is correct,
  not a snapshot that can quietly go stale.
- The **actual image** comes from your real device, addressed via the
  optional `testInterface` block in `device.json`:

  ```jsonc
  "testInterface": {
    "uploadUrl": "http://{ip}/api/project",         // upload a project ZIP
    "uploadMethod": "POST",
    "uploadContentType": "multipart-zip",
    "screenSwitchUrl": "http://{ip}:8080/api/screen", // force-render screen N, no reboot
    "screenSwitchMethod": "POST",
    "screenSwitchBody": "form-urlencoded",            // body is "index=2", not JSON
    "snapshotUrl": "http://{ip}:8080/snapshot.bmp",   // fetch the current frame
    "snapshotFormat": "bmp",                          // "bmp" | "png"
    "postRenderSettleMs": 0   // extra wait after screenSwitchUrl responds, if
                                // it returns before the display has visually
                                // settled (e.g. e-paper refresh time)
  }
  ```

  `{ip}` is a placeholder the orchestrator substitutes with the actual
  device's address. `testInterface` is entirely optional and read only by
  test tooling — the designer app itself never touches it at runtime.

  Note `uploadUrl` and `screenSwitchUrl` are on **different ports** in the
  reference firmware, and that's deliberate, not an inconsistency to
  normalize away: project upload lives on the *configurator's* web server
  (port 80), which is a firmware design choice, not the running server — it
  only exists while the device is explicitly in setup mode (long-press a
  button, or automatically at boot with no stored WiFi credentials). The
  screen-switch and snapshot endpoints live on the always-on server (port
  8080 in the reference firmware) that runs continuously once WiFi connects,
  which is what makes repeatedly switching screens across a test run
  possible without re-entering setup mode. If your firmware's upload
  mechanism is also gated behind a similar mode, budget for that in your
  test rig (or expose upload on your always-on server too).

- Orchestration flow per test run: upload the test project once (device
  reboots once) → publish all topics' test values via MQTT once → for each
  screen: call `screenSwitchUrl` (must do a **full**, non-partial render, so
  results don't depend on leftover partial-refresh artifacts from whatever
  was on screen before) → wait `postRenderSettleMs` if needed → fetch
  `snapshotUrl` → pixel-diff against that screen's headless designer render.

What this buys device authors: implement `uploadUrl`, a full-render
`screenSwitchUrl`, and `snapshotUrl` for your firmware, declare them in your
DDF's `testInterface`, and the same test methodology and orchestrator (once
built) works for your device with no changes to the test logic itself.
Capturing a snapshot is the part that varies most in difficulty by platform:
it's cheap if your rendering library already keeps a full frame buffer in
RAM (as `GFXcanvas1` does for the e-paper firmware) and more work if your
display library writes straight to the panel controller without one.

The e-paper reference DDF's `testInterface` now documents three real,
implemented endpoints — `uploadUrl`, `screenSwitchUrl`
(`DisplaySnapshot::handleScreenSwitch`, `POST /api/screen` with a
form-urlencoded `index` field, always a full render, and it also updates the
firmware's tracked "current screen" so later MQTT-driven partial updates
keep targeting the right screen), and `snapshotUrl`. What's still missing is
the orchestrator itself (the script that drives upload → MQTT publish →
screen-switch loop → pixel-diff) and a decision on how to get the upload
step past the configurator's setup-mode gating in a fully automated rig.
