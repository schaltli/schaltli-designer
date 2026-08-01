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
get the reference image. They also both need an MQTT broker reachable by
both this machine and the device under test - see below.

## MQTT broker

Every orchestrator used the public `test.mosquitto.org` broker until
2026-08-01, when it started refusing every connection outright
(`ECONNRESET`, reproduced independently via a plain MQTT Explorer client
too - a block/rate-limit on this network's public IP after a day of heavy
HIL use, not anything wrong with our own client code). Both orchestrators
now default to a **local broker** instead - matches this project's own
"local-first, no cloud" stance (see memory: `project-local-first-no-cloud`)
and removes an external service's availability from the critical path
entirely. Bonus: it also turned out to be *faster and more reliable* than
the public one, incidentally resolving a previously-documented flaky first-
combination race (see below).

```
npm run hil:broker
```

Starts `hil/local-broker.js` (`aedes`, pure JS, already a devDependency -
no system Mosquitto install or Docker needed) listening on `0.0.0.0:1883`,
printing every reachable address. Leave it running for the whole work
session, same convention as the dev server - neither orchestrator starts
it automatically, since both are just as often run standalone (iterating
on one HIL case) as through `npm run test:all`.

Override the broker either orchestrator connects to via `HIL_MQTT_URL`
(e.g. a real HiveMQ instance) if you don't want the local one.

**The e-paper device needs pointing at the same broker once**, since its
own MQTT broker host is stored on-device (`/config.json`, set via the
configurator), not passed in the uploaded project:

```
curl -X POST http://<device-ip>/api/mqtt \
  --data-urlencode "protocol=mqtt" \
  --data-urlencode "host=<this-machine's-LAN-IP>" \
  --data-urlencode "port=1883" \
  --data-urlencode "username=" \
  --data-urlencode "password="
```

Takes effect after the next reboot (any project upload triggers one) - the
setting is persisted, so this is a true one-time step per device, not
something you need to repeat every session. `/api/mqtt` is reachable
without setup mode on the `xiao_esp32s3_hiltest` build (same as
`/api/project` - see the firmware section below), or via setup mode
otherwise.

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

**Still flaky: combo 0 immediately after a fresh upload**, for an object
newly bound to a topic never published to the device before - reproduced
with a fresh `--project` upload even against the local broker (below), not
resolved by switching off the public one as first thought. It **is**
reliably fine once the device has been up for a bit (e.g. `--skip-upload`
runs, or combo 0 on a *second* run against an already-warm device) - only
the very first render after a reboot is affected. Root cause suspected but
not yet confirmed: the firmware has two independent redraw paths for the
same MQTT value change - the orchestrator's own explicit `POST
/api/screen` and the device's own `onMqttMessage`-triggered automatic
partial update - and their relative ordering isn't coordinated for the
very first message a freshly-rebooted device receives on a given topic.
Investigation ongoing.

**`MqttDataLine`'s arrowhead could render visibly clipped during a
partial update** (fixed 2026-08-01, `f71b063` in the firmware repo): a
line-shaped object's own x/y/width/height bounding box is degenerate for
a perfectly horizontal or vertical line (0-1px in one dimension), but its
arrowhead paints *perpendicular* to the line, well outside that box.
`renderObjectsPartial()`'s temporary canvas was sized to that same
degenerate box, silently clipping the arrowhead to a thin band -
diagnosed via pixel-exact matching *within* the clipped band (ruling out
a wrong stroke width) plus the redraw-rect arithmetic independently
confirming an 8px-tall window against an arrowhead needing roughly 20px.

**A thick line's body could poke out past its own arrowhead's tip** (fixed
2026-08-01, both repos): the arrowhead triangle tapers to a single point
at its tip, but the line was drawn all the way to that same point at a
constant `strokeWidth` - past wherever the triangle's own local half-width
dropped below `strokeWidth/2`, the line's straight edges stuck out past
the triangle's tapering sides. Only visible at a large enough `strokeWidth`
relative to the arrowhead (the comprehensive fixture's `MqttDataLine` now
calibrates up to 16px specifically to keep exercising this). Both
`render-line.ts`/`render-mqtt-data-line.ts` (designer) and
`ScreenRenderer.cpp` (firmware) now shorten the line body toward whichever
end(s) show an arrow before drawing it - by a *constant fraction* of the
arrowhead's own length (not a fixed pixel amount), since both the
triangle's length and half-width scale linearly with `strokeWidth`
together, so the safe stopping point turns out to be size-independent.

## Android

```
node hil/android/orchestrator.js --project <exported-android-project.zip> [--device <adb-serial>]
```

**Precondition**: the project is already imported into the Screensmith
Android app by hand (the app has no upload API to automate that part), and
the app is in the foreground on a connected, `adb`-authorized device. The
app's own MQTT broker (configured in-app via its Settings screen, stored
via DataStore - separate from the orchestrator's `HIL_MQTT_URL`) needs
pointing at the same broker described above too, same one-time reasoning
as the e-paper device's `/api/mqtt` step.

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
