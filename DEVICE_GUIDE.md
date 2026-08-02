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

Every project must reference a device (see the startup screen), and the
designer always re-resolves a project's device fresh from the local
`public/ddf/` folder rather than trusting whatever was embedded in an
uploaded project file — so the DDF you write here is the thing that actually
governs how projects using your device render, not a one-time import.

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

Drop the `.zip` into `public/ddf/` in the designer repo and it shows up
automatically — the designer scans that folder (`app/api/ddf/list`) on every
request, no server restart needed for local development. There's no upload
UI on the hosted/public instance; devices are added by whoever runs that
instance, by design (see "local-first" below).

Two real examples ship in this repo — read them alongside this guide:

- `public/ddf/mqtt-epaper-display.ddf.zip` — a real device (1-bit e-paper,
  paired with the `MqttEPaperDisplay2` firmware repo)
- `public/ddf/m5stack-m5dial.ddf.zip` — a round, full-color touch device.
  This one is a **UI test fixture only** (no real firmware behind it yet) —
  useful as a second worked example, not as a firmware-integration reference.

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
    "svgPath": "adornment.svg",
    "drawingArea": {
      // Where the screen sits inside adornment.svg's own coordinate space -
      // NOT the same as screen.width/height. See "Building the adornment
      // SVG" below.
      "x": 30, "y": 50, "width": 400, "height": 300,
      "svgViewBox": { "x": 0, "y": 0, "width": 460, "height": 400 }
    }
  },

  "hardwareButtons": [
    {
      "id": "btn-0",
      "name": "Button 1",
      "svgElementId": "button-0",   // must match a <rect id="..."> in the SVG
      "shape": "rectangular",         // "rectangular" | "round" (display hint only)
      "x": 40, "y": 20, "width": 30, "height": 20
    }
  ],

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
`<rect>` elements marking physical button hit-areas. Two non-obvious
requirements that will otherwise cost you a confusing debugging session:

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

`adornment.drawingArea` describes where the screen sits **within the SVG's
own coordinate space** (i.e. inside `svgViewBox`), which is generally not
the same numbers as `screen.width`/`height` — the designer scales one onto
the other at render time.

Buttons must be `<rect>` elements (not `<circle>` or `<path>`) with an `id`
starting with `"button"` — hit-testing specifically looks for
`rect[id^="button"]`. Give them `rx`/`ry` if you want rounded corners
visually; the hit box itself stays rectangular.

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
