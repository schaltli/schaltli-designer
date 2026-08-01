# Hardware-in-the-loop (HIL) test tooling

Compares what a real device actually renders against what the designer's
own headless render harness (`app/test-render`) says it *should* render,
for a given exported project - the same methodology that took the e-paper
firmware's label rendering from 15177/18008 differing pixels down to exact
0/0 (see memory: `project-pixel-perfect-mismatch`). Two orchestrators, one
per render target, sharing a report format and combination-generation
logic so results are directly comparable:

- `epaper/orchestrator.js` - MqttEPaperDisplay2 firmware.
- `android/orchestrator.js` - the Screensmith Android app (ScreensmithAndroid repo).
- `report-template.js` - shared HTML report builder (dark theme, one
  collapsible section per test case, expected | actual | blinking-diff
  columns).
- `combinations.js` - shared wrap-around MQTT-value combination generation
  (see its own header comment for the exact strategy).

Both orchestrators need the designer dev server running (`npm run dev`,
`http://localhost:3000`) - they drive `app/test-render` via Playwright to
get the reference image.

## E-paper

```
node hil/epaper/orchestrator.js --project <exported-project.zip> --device <device-ip>
```

`epaper/fixtures/` holds a standing comprehensive test project (box, label,
MqttDataField, level-indicator, a segmented/filleted line - every object
type the firmware's `ScreenRenderer::renderObject()` actually dispatches,
except tab-control/panel and MQTTIconField) instead of a fresh one-off
project for every manual run:

```
node hil/epaper/fixtures/build-comprehensive-test.js   # regenerates fixtures/comprehensive-test.zip
node hil/epaper/orchestrator.js --project hil/epaper/fixtures/comprehensive-test.zip --device <device-ip>
```

`comprehensive-test.zip` is checked in too (~220KB, mostly the embedded BDF
fonts) so a run doesn't require regenerating it first - re-run the build
script only after editing the fixture itself. **Uploading requires the
device to be in setup mode** (hold Button 0 for 3s - see
`Application::checkConfiguratorTrigger()`); `/api/project` (port 80) isn't
registered during normal operation at all, so an upload attempt while the
device is already running normally fails to even connect, and the
orchestrator's own "connection dropped = presumed success, the device
restarts before replying" tolerance can mask this if you're not watching
for it - the run still executes normally and reports a (large, confusing)
FAIL, just comparing the reference against a stale, several-uploads-old
snapshot the whole device-upload step silently never replaced (2026-07-30
finding, this fixture's own first couple of runs).

Uploads the project to the device (`/api/project`, setup mode), waits for
it to reboot, then for each screen/MQTT-value-combination: publishes the
values, forces a full re-render (`POST /api/screen`), fetches
`/snapshot.bmp`, and does a **strict** pixel comparison (any differing
pixel fails) - the device snapshot is captured at its exact native
resolution, so there's no reason to tolerate any drift.

Useful flags: `--skip-upload` (project is already on the device),
`--designer-preview` (render every screen once, no device/MQTT involved -
sanity-check a layout before spending a real hardware run on it),
`--partial-update-screen <index>` (exercise the MQTT-triggered partial-
redraw path specifically, instead of the full-refresh path every other
case already covers), `--report-only` (rebuild `report/index.html` from an
existing `report/results.json` without re-running anything).

**Known flaky case: combo 0 immediately after a fresh upload, for an
object newly bound to a topic that's never been published to this device
before.** The firmware has two independent redraw paths for the same MQTT
value change - the orchestrator's own explicit `POST /api/screen` (always
correct, reads `projectLoader_` state directly) and the device's own
`onMqttMessage`-triggered automatic partial update (fires asynchronously
whenever a subscribed topic's value changes) - and their relative
ordering isn't coordinated. If the device's own partial-update processing
runs *after* the explicit full-refresh completes but *before* the
subsequent `/snapshot.bmp` fetch, it silently overwrites the (correct)
full-refresh result. Reproduced consistently for `MqttDataLine`'s first
combination in this fixture (2026-07-31) - not a timing-margin issue (a
10s extra wait after upload had zero effect), and every other combination
in the same run - and the object in isolation on its own - render
correctly. Points at the two-redraw-path architecture itself, not
anything specific to that one object type; out of scope to fix here.

## Android

```
node hil/android/orchestrator.js --project <exported-android-project.zip> [--device <adb-serial>]
```

**Precondition**: the project is already imported into the Screensmith
Android app by hand (the app has no upload API to automate that part), and
the app is in the foreground on a connected, `adb`-authorized device.

For each MQTT-value combination on **screen 0 only** (the app has no
remote screen-switch API yet, so any other screen in the project is
reported as skipped, not silently wrong): publishes the values, waits, and
captures a real device screenshot via `adb exec-out screencap`. That
screenshot is at the phone's own resolution/density, not the reference's
pixel grid, so it's cropped to the detected screen-content region and
resized down to match before comparing - and because that resampling
alone introduces a few points of per-channel noise even for a perfect
visual match, comparison uses a **tolerance** (a pixel counts as differing
only if any RGB channel is off by more than 24, and the case passes below
2% mismatch), not the e-paper target's strict any-pixel-fails rule.

`ANDROID_ADB_PATH` env var overrides the default
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` location if adb lives
somewhere else. `--report-only` works the same as the e-paper script.

## Extending

If Android ever gains a debug intent (or similar) for remote screen
switching, `android/orchestrator.js`'s `si !== 0: skip` branch is the only
place that needs to change - everything else (combination generation,
capture, compare, report) already handles multiple screens.
