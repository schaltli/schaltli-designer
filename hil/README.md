# Hardware-in-the-loop (HIL) test tooling

Compares what a real device actually renders against what the designer's
own headless render harness (`app/test-render`) says it *should* render,
for a given exported project - the same methodology that took the e-paper
firmware's label rendering from 15177/18008 differing pixels down to exact
0/0 (see memory: `project-pixel-perfect-mismatch`). One orchestrator per
render target, sharing a report format and combination-generation logic so
results are directly comparable:

- `device-driver/driver.js` - any device, generated from its own DDF. See
  its own section below; the orchestrators under it are per-device.
- `epaper/orchestrator.js` - MqttEPaperDisplay2 firmware.
- `waveshare/orchestrator.js` - screenbee-waveshare-1v8 firmware (Waveshare ESP32-S3-Knob-Touch-LCD-1.8, 360x360 color).
- `android/orchestrator.js` - the Screensmith Android app (ScreensmithAndroid repo).
- `report-template.js` - shared HTML report builder (dark theme, one
  collapsible section per test case, expected | actual | blinking-diff
  columns).
- `combinations.js` - shared wrap-around MQTT-value combination generation
  (see its own header comment for the exact strategy).

**Every HIL run replaces the project installed on the device under test.**
Each orchestrator (and `waveshare/verify-smoke-test.js`) uploads its own
fixture and leaves it there - that is the point, but it means `npm run
test:all` silently discards whatever you had deployed, on every board it
can reach. Redeploy your own project from the designer afterwards. Bit us
on 2026-08-21: a device was mid-investigation with a hand-built project on
it, and several test runs later the bezel produced no screen changes at
all, because the fixture that had replaced it binds the knob to something
else entirely.

`npm run test:all` opens with `npm run typecheck` (`tsc` over the whole
tree, using `tsconfig.typecheck.json`). It is first because it is the one
step that needs no device, no broker and not even the dev server, so it
fails immediately rather than after several minutes of setup. It is also
the only place the whole tree gets type-checked in practice: `next dev`
compiles on demand and never sees it all, and nothing else here runs
`next build`. Zero errors as of 2026-08-22, and `next.config.mjs` no longer
ignores them at build time either.

Every orchestrator needs the designer dev server running (`npm run dev`,
`http://localhost:3000`) - they drive `app/test-render` via Playwright to
get the reference image. They all also need an MQTT broker reachable by
both this machine and the device under test - see below.

## MQTT broker

Every orchestrator used the public `test.mosquitto.org` broker until
2026-08-01, when it started refusing every connection outright
(`ECONNRESET`, reproduced independently via a plain MQTT Explorer client
too - a block/rate-limit on this network's public IP after a day of heavy
HIL use, not anything wrong with our own client code). The orchestrators all
default to a **local broker** instead - matches this project's own
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
session, same convention as the dev server - no orchestrator starts it
automatically, since each is just as often run standalone (iterating on one
HIL case) as through `npm run test:all`.

Override the broker an orchestrator connects to via `HIL_MQTT_URL`
(e.g. a real HiveMQ instance) if you don't want the local one.

### Closing the loop without the vehicle

A broker alone is not enough to test an *interaction*. A Switch only ever
changes what it shows when its **read** topic changes, and a tap only
publishes to its **write** topic - in between sits whatever automation owns
the thing (Node-RED, Tasmota, a Zigbee bridge). On a desk nothing sits
there, so a tap publishes, nothing answers, and since the 2026-08-25 marker
rebuild the bar sits visibly hollow until the 3s timeout rolls it back.
Every interaction test therefore had to happen at the real installation.

```
npm run hil:mock -- <projekt.zip> [--delay ms] [--drop match] [--seed] [--list]
```

`hil/simulate-project.js` derives the missing half **from the project
itself**. Every Switch already declares both sides - `topic` (read),
`writeTopic` (write), and per state a `readValue`/`writeValue` pair - so

```
writeTopic + writeValue  ->  topic = readValue
```

needs no configuration to write and, more to the point, keeps no second
copy of a fact that could drift from the first. Rename a state's value in
the designer and the mock follows on the next run. It prints the table it
derived at startup; a Switch whose command it cannot map is listed rather
than skipped quietly, and two Switches claiming the same command are
reported as a conflict instead of resolved by a coin flip.

Three things it can do that the real installation cannot:

- `--delay 800` answers late, which is the only practical way to *see* the
  hollow unconfirmed marker at all - a real automation replies in
  milliseconds.
- `--drop <match>` never answers, so the 3s rollback becomes observable
  without unplugging hardware.
- `--seed` publishes one retained value per read topic at startup, so a
  freshly booted device shows state instead of `?` - or leave it off to
  look at exactly that case.

It answers **retained**, like the real thing: a device reads its state back
off the broker after a reconnect, and a non-retained answer would leave
every reboot at `?`.

**What it cannot derive is declared** on the command topic, as
`topics[].mock` - edited in Project Settings > Topics beside Examples. Two
cases forced it and neither is describable any other way:

- A `SoftwareButton`'s `send-mqtt` action. A button publishing `"aus"` to a
  command topic says nothing, anywhere, about which state topic that
  changes - that rule lives only in the real automation.
- A rotary encoder publishing `"up"`. That is not a mapping at all but
  arithmetic on a value no object in the project names, which is why a
  plain value table could never have expressed it.

A rule matches one payload exactly (trimmed, same comparison a Switch state
uses - `"up"` never accidentally matches `"wakeup"`) and carries any number
of effects, so one command can move several topics at once. An effect
either **sets** a literal payload or **adds** a signed number to the topic's
current value, clamped to an optional min/max. An unknown topic starts at
its lower bound, or at zero: the first turn of a knob has to do something
visible, or the mock looks like it is not running.

Declared rules win over the derived table for the same payload - derivation
is a convenience, a declaration is a decision. A half-written rule (no
payload, or no effects) is reported at startup rather than dropped
quietly; it is the shape of a rule someone started and did not finish, and
it would otherwise leave a command that looks configured and answers
nothing. Anything neither derived nor declared is still listed as
unanswered.

`mock` travels in the device export like `examples` does, and no firmware
reads either. Stripping it would mean the HIL tooling - which reads the
exported project - needed a second, divergent copy.

It refuses a non-local broker without `--allow-remote`. It answers commands
with retained state, so on a broker that already has a real automation on
it both would answer and the two would disagree - an hour of debugging for
a flag that costs nothing.

The decisions themselves live in `lib/mock-engine.js`, not in the script:
the designer's preview is about to need exactly the same answers, and a rule
that behaved differently there than on the wire would send someone hunting
through firmware for a difference that lives in the designer. The engine is
pure - it returns what *should* be published and never publishes - so the
script hands its result to MQTT while the preview will apply it to its own
value map. Plain `.js` in a TypeScript `lib/` because this script is plain
Node and the repo has no TypeScript runner; `allowJs` lets the app import it
and infer its types from the JSDoc.

**The designer's preview uses the same engine** (2026-08-25). A Switch tap
there had never been wired up at all, and a SoftwareButton's `send-mqtt`
wrote its payload onto the *command* topic, which no object on screen reads
- so preview could not tell you whether a Switch was configured correctly:
a wrong `writeValue` looked exactly like a right one, inert. Both taps now
publish and let the engine answer, against the project that is *open*,
unsaved edits included. No broker and no process are involved: on a desk
with nothing running, preview is the mock.

Covered by `e2e/mock-simulator.spec.ts` (derivation, conflicts, the round
trip, `--drop`, `--delay`, the remote guard, and every half of the rules -
set, accumulate-and-clamp, one command moving several topics, a rule
overriding a derived mapping, and a half-written one being reported)
against the real script and a real broker - a unit test of the table alone
would have passed while nothing ever answered. The editor half, a rule
surviving the topic form and coming back on reopen, is in
`e2e/topic-selector.spec.ts`: a rule that does not survive Save is a rule
nobody would ever find missing. The engine on its own - purity, clamping,
effect ordering, nested objects - is pinned in `e2e/mock-engine.spec.ts`,
where neither caller's plumbing can hide a difference.

The local broker also listens for **WebSocket** connections on
`ws://localhost:9001` (`HIL_MQTT_WS_PORT` to override) - the orchestrators
themselves don't need this (plain TCP, `mqtt://`), but the designer's own
browser-side MQTT features do (MQTT Discovery, and the deploy flow below) -
browsers can't open a raw TCP socket. `e2e/deploy-dialog.spec.ts` connects
here directly.

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

**Resolved 2026-08-01: combo 0 immediately after a fresh upload** used to
fail (up to ~1700/120000 differing pixels), for an object newly bound to a
topic never published to the device before. Diagnosed via temporary serial
logging (`Serial.printf` at every MQTT connect/subscribe/receive and every
render call, since removed) added to a HIL-test build, correlating exact
`millis()` timestamps against the orchestrator's own combo timeline. Real
root cause, confirmed on-device: `ScreenRenderer::renderObjectsPartial()`
escalates the very *first* MQTT-triggered partial update after every boot
into a full render (`partialUpdateCounter_ == 1`, meant to clear ghosting
after startup) - a genuine e-paper full refresh, ~2-4s of blocking work,
during which the single-threaded firmware's `mqttClient_.loop()` never
runs, so whichever of a combo's *other* just-published topics hadn't
already arrived sit undelivered for that whole window. No fixed sleep
before `POST /api/screen` can be safe against this - the delay is bounded
by real e-paper refresh hardware, not network jitter, and depending on
which topic happens to arrive first, only combo 0 (or, as briefly seen
while debug logging itself was slowing the device down further, every
combo) can be affected.

Fixed properly rather than papered over with a longer sleep: the firmware
now exposes `GET /api/topic-values?topics=a,b,c` (`DisplaySnapshot.h/.cpp`,
wired through `Application::setupDisplaySnapshot()` to
`ProjectLoader::getTopicValue()`), and the orchestrator's
`waitForTopicValuesApplied()` polls it after publishing a combo's values,
proceeding to `/api/screen` only once the device's own cache actually
reflects every published value - deterministic regardless of how long the
device takes to get there. Verified via two consecutive full (non-
`--skip-upload`) runs against real hardware, 5/5 combos at exact 0/120000
diff each time, combo 0 included.

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

## M5 Dial (retired 2026-09-10)

The device was dropped: no PSRAM, so it was never going to ship. `hil/m5dial/`
and its fixtures are gone, and nothing below is runnable any more.

The section is kept because most of what was learned here was never about
this device. The icon-cache bug, the RGB565 quantization reasoning and the
always-on-endpoint precedent all still describe how the color targets work,
and the Waveshare boards inherited every one of them. Its MQTT deploy check
outlived it too and now runs against the knob - see that section.

Covers box (rounded corners + inset border), label, MqttDataField,
level-indicator, line, icon, and MQTTIconField - 7 of the 8 types
the M5 Dial DDF declares (`screenbee-m5dial/ddf-source/device.json`, since
2026-08-16 - see docs/device-contract.md). **Not** covered: SoftwareButton
(`ColorScreenRenderer::renderSoftwareButton()` draws a bitmap the designer's
export pipeline bakes with shadow/border/label text already composited in -
reproducing that byte-for-byte by hand isn't tractable the way the other
object types are; would need driving a real "Export Project"/deploy flow
through Playwright instead, see `e2e/master-screen.spec.ts`'s own comment on
`buildDeviceProjectZip` being "the only real path that serializes a project
for a device to read"). The fixture's own `line` object is also
deliberately limited to a single straight 2-point segment (strokeWidth 1,
no fillet, no arrows) - `ColorScreenRenderer::renderLine()` doesn't
implement fillet/arrowhead/thick-line yet, unlike the e-paper firmware, so
testing those here would just assert a known, already-documented firmware
gap as a failure.

Unlike the e-paper target, **every** endpoint (project upload, screen
switch, snapshot, topic-values) lives on one always-on port 80 once WiFi
connects - no setup-mode gating, no split 80/8080 between an upload server
and a snapshot server (see `TestInterfaceServer.h`'s own header comment in
the firmware repo for why: this device has no field-hardening story yet, so
there's no safety property being traded away by leaving upload always
reachable). The same "connection dies with zero bytes on a *successful*
upload, because the device restarts itself before replying" behavior
applies here too - see `uploadProjectToDevice()`'s comment in the
orchestrator.

Color quantization matters here in a way it doesn't for the e-paper target:
the M5 Dial DDF declares `colorDepth: "24bit"` (meaning "don't restrict the
user's color palette"), but the actual hardware canvas is genuinely RGB565
internally, truncated on the way in and bit-replication-expanded on the way
out for a snapshot. There's no "16bit"/"rgb565" quantization mode in this
codebase's shared renderer the way there is for the e-paper target's
`"1bit"`, so `m5dial/fixtures/build-comprehensive-test.js` pre-quantizes
every fixture color through that exact transform by hand instead (see its
own header comment) - not a workaround, just supplying colors that were
always going to survive the hardware's real color depth unchanged.

**Found and fixed while building this fixture (2026-08-10): every icon or
MQTTIconField object rendered as blank in the headless reference render**
(`app/test-render/page.tsx`) - `renderIcon()`/`renderIconFromAsset()`/`renderSoftwareButton()`'s own inline
icon-drawing block only draw an icon already sitting in
`iconImageCache` with `img.complete`/`naturalWidth` set; on a cache miss
they kick off `new Image(); img.src = <svg data url>` and return without
drawing, relying on `img.onload` to `requestRedraw()` on a *later* paint.
That's fine for the live interactive canvas (there's always another
frame), but `__renderScreenForTest` calls `renderScreenObjects` exactly
once per invocation and takes a synchronous `canvas.toDataURL()` snapshot
immediately after, with a **fresh** `iconImageCache` every single call - so
every icon-bearing object rendered blank, on every call, unconditionally.
This was already latent in the e-paper fixture's own MQTTIconField coverage
too, just never noticed (the last committed `hil/epaper/report/results.json`
predates it ever being exercised correctly - worth a fresh e-paper hardware
run to confirm that coverage is real now, not just this device's). Fixed by
walking the screen for every icon asset it references and pre-loading +
`await img.decode()`-ing each one into `iconImageCache` before the
synchronous render pass, so every renderer's already-proven cache-*hit*
path is what runs here.

**Pointing the device's MQTT broker at this machine's local broker**
(`hil:broker`, see above) is a one-time step per device, same reasoning as
the e-paper target's `/api/mqtt` (also documented above) - except this
device's is reachable over its normal WiFi connection, no setup-mode AP
needed at all:

```
curl -X POST http://<device-ip>/api/mqtt \
  --data-urlencode "protocol=mqtt://" \
  --data-urlencode "host=<this-machine's-LAN-IP>" \
  --data-urlencode "port=1883" \
  --data-urlencode "username=" \
  --data-urlencode "password="
```

Takes effect on the next reboot (any project upload triggers one), same as
the e-paper target. Added 2026-08-10 as a new endpoint on
`TestInterfaceServer` specifically because the `M5Dial-Setup` AP page
(`http://192.168.4.1`, the only other way to set this) turned out to be
unreliable on real hardware - the AP accepted a client connection but every
page load aborted (`ERR_CONNECTION_ABORTED`), consistent with
`WiFi.mode(WIFI_AP_STA)`'s AP+STA radio-sharing being a known ESP32 sharp
edge. This device already has no field-hardening story gating any other
endpoint on this server (see this section's earlier note), so there was no
consistency reason to gate this one differently - matches the e-paper
firmware's own precedent of exposing `/api/mqtt` outside setup mode too.

## Waveshare Knob-1.8

```
node hil/waveshare/orchestrator.js --device <ip> [--project <zip>] [--skip-upload]
```

Same test interface shape as the M5 Dial (everything on port 80), so the
orchestrator is the same strategy: publish MQTT values, poll
`GET /api/topic-values` until the device reports them back rather than
sleeping, force a render with `POST /api/screen`, and pixel-diff
`GET /snapshot.bmp` against the designer's own headless render. `--project`
defaults to `waveshare/fixtures/smoke-test.zip`, rebuildable with:

```
node hil/waveshare/fixtures/build-smoke-test.js
```

**That builder needs the dev server** (`npm run dev`), unlike every other
fixture builder here. Since 2026-08-25 it produces the zip by driving the
designer's own export (`app/test-render`'s `__buildDeviceZipForTest`)
instead of writing `project.json` by hand.

The reason is `SoftwareButton`. It is the one object type nothing renders
live: the export composites its border, shadow and label into a bitmap and
ships that, and the firmware blits the bitmap or draws nothing at all. A
hand-built fixture therefore described a state no real deploy can produce -
the device drew nothing while the reference renderer drew the button - and
the first HIL run that ever looked at it reported 11710 differing pixels
against a device behaving perfectly correctly. Baking the bitmap in the
builder would have put a second, drifting copy of `asset-export.ts` next to
the first, which is exactly why the m5dial fixture excluded SoftwareButton
from coverage instead.

Two things the switch exposed, both now derived rather than restated:

- **Button ids.** The export only emits a screen's `buttonActions` for ids
  listed in `project.hardwareButtons`. Writing that list by hand dropped the
  knob on the first attempt - the fixture still built, still uploaded, and
  the loss surfaced only as `knob actions: FAIL (published [])` on hardware.
  It is now collected from the bindings themselves, and the builder fails
  if any id does not survive the export.
- **Font bytes.** The bake needs the real BDF, not the metrics a project
  carries. Without it the reference drew real glyphs while the baked bitmap
  fell back to a generic canvas font - 698 pixels on the word "SENDEN".
  Both the builder and the orchestrator now read them through
  `hil/waveshare/ddf-fonts.js`, so there is one answer to "where do the
  fonts come from". `path` stays unset, so no font file ships: the device
  already has them from its own DDF.


It also asserts one thing the pixel diff can't see: the knob's two
directions, fired through `POST /api/input`, publish the `send-mqtt` actions
the fixture binds them to. That check needs a broker to observe, which is why
it lives here and not in the verifier below. Because it has no image pair, it
never reaches `results.json` - the orchestrator's own exit code carries it,
and `test-all.js` reads both.

### MQTT deploy check

```
node hil/waveshare/deploy-check.js [--device <ip>] [--project <zip>]
```

Separate from the orchestrator because it drives a completely different
code path. The orchestrator installs projects over HTTP
(`POST /api/project`), so it never reaches the firmware's `DeployManager`
at all — the MQTT deploy flow (download from a URL, CRC32 verify, install,
reboot) had no coverage until this existed.

Serves the fixture zip over HTTP itself and publishes the deploy trigger
the designer would, then follows `deploy-status` through to `rebooting` and
waits for the device to actually come back serving snapshots — "rebooting"
is the device's own claim, coming back is the proof. Needs the broker
(`npm run hil:broker`) and a LAN address the device can route to
(auto-detected; override with `HIL_LAN_IP`). Produces no report, just
pass/fail output. Included in `npm run test:all`.

Added 2026-08-14 alongside two guards in `DeployManager::downloadToFile()`
against a disk-full download silently reporting success. The risk those
carry is the *happy* path — a wrong guard fails every deploy, not just the
rare out-of-space one — which is exactly what this asserts. It ran against
the M5 Dial until 2026-09-10; `DeployManager` is shared firmware (`src/`,
not `src/boards/`), so the knob exercises the same code.

### Smoke-test verifier

```
node hil/waveshare/verify-smoke-test.js <device-ip> [--skip-upload]
```

Installs the fixture and checks what the device drew by counting exact RGB565
colors in the snapshot - no designer, no broker, device HTTP only. It also
fires `swipe-up` through `POST /api/input` and asserts the screen menu is
actually rendered (the `showScreenMenu` device action, see
`docs/device-contract.md` section 5), then that it times out on its own.

Neither script simulates the physical gesture or the knob's pulse decoding -
those still need a human. Dispatching by input id is deliberately the seam:
it leaves the half that changes most often, action resolution, under
automated test.

Both are included in `npm run test:all`, which runs the verifier *after* the
orchestrator: the screen menu dismisses itself on a timer, and a snapshot
taken while it is still up would look like a rendering bug.

## Deploy flow (MQTT self-deploy)

Designer-triggered live deploy (2026-08-01) - "Deploy to Device" in the
File menu, e-paper devices only (see `components/deploy-dialog.tsx`'s
header comment for the full design rationale). No device HTTP endpoint is
involved: the designer's own backend stores the exported zip
(`app/api/deploy`), the browser publishes a **retained** MQTT trigger
naming that zip's URL + a CRC32, and the device downloads/verifies/applies
it itself. Topics, all under `screenbee/<clientId>/...` (`clientId` is
the firmware's own `"EPaper-" + MAC`):

- `status` - retained, `online`/`offline` (the `offline` half is an MQTT
  Last Will, published by the broker itself the moment the device's
  connection drops, not something the device sends deliberately).
- `hello` - retained, `{ deviceId, firmwareVersion }`, (re-)published on
  every connect/reconnect.
- `deploy` - retained, `{ deployId, url, crc32 }`, published by the
  browser.
- `deploy-status` - `{ deployId, state, percent?, error? }`, published by
  the device through `downloading → download_complete → verifying →
  applying → rebooting`, or `error`/`busy`/`up_to_date`.

`e2e/deploy-dialog.spec.ts` covers the designer side (device-picker
filtering, offline labeling, live status UI) against the local broker's
WebSocket listener, with a fake device (just another MQTT client
publishing the same messages a real one would) - no hardware needed there.
The firmware side (`DeployManager`, `ProjectInstaller`) needs real
hardware to verify meaningfully - see `epaper/orchestrator.js`'s
`--deploy-flow` mode (below) for that.

```
node hil/epaper/orchestrator.js --project <zip> --device <device-ip> --deploy-flow
```

Exercises the real end-to-end path against actual hardware: uploads the
zip to the designer's own `/api/deploy`, publishes a `deploy` trigger with
its real CRC32, asserts the `deploy-status` sequence arrives in order, and
asserts the device's `/snapshot.bmp` matches the deployed project
afterward (same pixel-exact comparison as every other case here). Also
runs a negative case: deploys a project whose `deviceId` doesn't match the
target device's compiled `DEVICE_ID`, and asserts an `error` status plus
that the device's *previous* project is still what's rendered - proving
the "never touch /PROJECT until verified" rollback guarantee, not just the
happy path.

### Pekaway prerequisite

A real Mosquitto broker (unlike the local HIL broker, which already has
one out of the box) needs a WebSocket listener added for the browser side
of this to work at all - a one-time `/etc/mosquitto/conf.d/websockets.conf`
addition:

```
listener 9001
protocol websockets
```

## Android

```
node hil/android/orchestrator.js --project hil/android/fixtures/comprehensive-test.zip [--device <adb-serial>]
```

### The fixture

`fixtures/comprehensive-test.zip` is committed, and is rebuilt with:

```
node hil/android/fixtures/build-android-test.js     # needs npm run dev
```

It covers every object type the Android DDF declares, including the two
this target gained on 2026-08-29 (`arc-level` and `Switch`), and puts every
screen under a master screen so inheritance is exercised on every run. It is
built through the designer's real export rather than written by hand, for
the same reason the Waveshare fixture is: the bundle contains a flattened
background PNG per screen and per-usage tinted icon SVGs, neither of which a
hand-written project.json can produce. The builder then checks the bundle it
got back - every icon path resolves to a file that is actually in the zip,
the master is gone as a screen of its own, and its swipe bindings and
`{screen}` placeholders arrived resolved - and refuses to leave a fixture
behind that would make a correct app look broken.

### The arc rasterizer, without hardware

The one part of Android rendering that does not need a phone to verify:

```
node hil/android/fixtures/build-arc-golden.js       # needs npm run dev
cd ../ScreensmithAndroid && gradle testDebugUnitTest
```

The arc-level rasterizer exists three times over (`lib/arc-raster.ts` here,
`ArcRaster.cpp` in each firmware, `ArcRaster.kt` in the Android app) and is
written in integer arithmetic precisely so the copies cannot disagree. The
generator records what the designer's copy produces for eight geometries -
sub-pixel band counts and the colour they mix to - into the Android repo,
where a plain JVM test holds its copy to the same numbers. `npm run test:all`
runs that test itself, because the golden is generated from this repo and a
change here is what invalidates it.

Small rings are recorded pixel by pixel, and one case puts every sector
boundary at a fraction of a degree. That case exists because of a mutation
test: dropping the rounding term from the sine interpolation - the single
most likely thing for a port to leave out - changed nothing in any of the
other cases, because they all sat on whole degrees where that term cannot
matter, and every test passed against a rasterizer that measurably was not
the reference.


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

## Device driver (generated from the DDF)

```
node hil/device-driver/driver.js --device <ip> [--ddf <dir|zip>]
                                 [--only <type,type>] [--batch <n>] [--keep]
```

Contacts the board, fetches its DDF, builds a project with one screen per
object type the DDF declares, exports it through the real designer, installs
it, and compares every screen against the designer's own renderer.

The point is that none of that is written down per device. `supportedObjectTypes`
says what to draw, `testInterface` says where to upload, switch and snapshot,
and the DDF's own font entries carry both the metrics and the BDF bytes - so a
new board needs no fixture, no orchestrator and no entry in any table here.
`--ddf` reads a local directory instead, for a board whose HTTP server is not
serving one yet.

What it proves: the device draws what the designer draws. What it does not:
that either is right. A control the designer draws wrongly and the firmware
copies faithfully passes here. For bringing a new board up against an
established reference that is the correct question; for the reference itself
it is not one.

**Why it exists.** Every other suite here compares a hand-built fixture, so a
type is covered on a board only if someone remembered to put it in that
board's fixture. Coverage was an accident of authoring rather than a property
of the device - and the 4.3B had no fixture at all, comparing whatever project
happened to be installed on it.

The first run on the 4.3B put 13 types on the glass and found two
disagreements that no fixture had ever exercised on this renderer:

- **`line` is drawn wrongly.** The designer draws a symmetric spike with an
  arrowhead at each lower end; the board puts the apex at the top left and
  points the left arrowhead into the middle of the shape. It is not the
  fillet - setting `filletRadius` to 0 leaves it just as wrong. No `line`
  object exists in the knob's fixture and the 4.3B had no fixture, so this
  is the first time `ColorScreenRenderer::renderLine()` has been photographed
  at all, despite claiming full parity with the e-paper reference since
  2026-08-14.
- **`Switch` segment dividers land one pixel apart.** With a 555px switch and
  two states the boundary falls at x.5, and the two sides round it in
  opposite directions - the board draws the divider one pixel left of where
  the designer does. The knob's fixture never showed it because its switch is
  280px wide with two states, which divides exactly.

Both are real and neither is a regression: they are places nothing looked.

**One screen per type, and installs in batches.** A screen with two objects
on it answers a question worth asking, but when it fails someone still has to
work out which object moved - so each specimen gets a screen to itself and the
screen is named after the type. The cost is storage: the export flattens each
screen's static content into a full-screen 24-bit bitmap, which on this panel
is 1.15MB per screen against a filesystem of a few megabytes. The driver
therefore installs in chunks sized by a byte budget rather than a fixed count,
since a 360x360 panel fits five screens where this one fits one. `--batch`
overrides it.

That constraint bites quietly if ignored: the upload's reply never arrives
even on success (the board reboots mid-request), so a project the device
rejects looks exactly like one it accepted, and the run then compares against
whatever was already installed. The first run here did precisely that, for a
different reason - the export writes `deviceId` from `project.settings`, and
the generator had set it at the top level, so the zip carried none and the
board refused it.

`specimens.js` is the only file that knows what a control needs to be worth
photographing, and it is device-independent. A type declared by a DDF with no
specimen there is reported loudly and counts as a failure, because that is the
most useful thing this driver can say: the designer grew a control and nothing
covers it.

## Extending

If Android ever gains a debug intent (or similar) for remote screen
switching, `android/orchestrator.js`'s `si !== 0: skip` branch is the only
place that needs to change - everything else (combination generation,
capture, compare, report) already handles multiple screens.
