# Plan: Camera

From docs/2026-11-09-camera.md (approved 2026-11-09). Branch `camera` in the
designer, firmware and android.

## Approach

**Risk first.** The spike ran without the Schaltli renderer and MQTT, so the
one thing that could still change the feature is measured first: T1 and T2 build
the real path on the 4" from a hand-written project that follows the spec's
contract. Only once Checkpoint A has passed does the designer get the type.

**One feed, drawn by the object.** `CameraFeed` in the firmware owns the two
tasks of the spike: one fetches (next image when the last has arrived, to
`Content-Length`), one decodes the newest. The renderer only asks it for the
newest finished picture and its age. The spike's code at
`scratchpad/cam-spike/src/main.cpp` is a guide and is not copied unread; if the
scratchpad is gone, spec decisions 4-6 say all that matters.

**Visible only.** The feed runs from the moment a Camera is on the shown screen
or open popup until it no longer is, or the display goes off.

**Dependency order**

```
T1 camera server -> T2 4" path -> Checkpoint A -> T3 states and failures
                                               -> T4 designer type -> T5 preview
                                                                   -> T6 export
T6 -> T7 4.3B -> T8 Knob -> Checkpoint C
T6 -> T9 Android
T3, T6-T9 -> T10 handbook -> T11 all together
```

T7/T8 and T9 can run side by side.

## Tasks

### T1 HIL camera server (designer) - S

`hil/camera-server.js`: a fake camera at `/shot.jpg`, playing the user's drain
video (PXL_20261011_090503124.mp4, 1080p, 30 fps, 14.8 s) as a loop by the clock:
a request gets the frame for this moment, as a real camera would. On command:
slow, stop and restart, with or without `Content-Length`, Basic required,
garbage instead of a JPEG, over 256 KB. Counts requests, so a test can prove
there are none.

Frames are prepared once with ffmpeg (320x240, about 7-11 KB, the spike's realistic
size) into a git-ignored folder. **The video stays out of the repo**: the repo is
public, and it is 37 MB of someone's own footage. Its path comes from
`SCHALTLI_CAMERA_VIDEO`; without it the server uses frames from ffmpeg's `testsrc`
and says so visibly, so the tests still run.

Each frame carries its number as a row of black and white blocks in one corner.
A HIL case reads the glass (`/panel.bmp`), decodes the number and compares it with
the frame the server is on: **the delay is measured, not judged by eye**.

- Accept: each mode is reachable from a test and answered as described.
- Accept: the number survives JPEG and scaling to 1/2 (from `/panel.bmp` in T2).
- Verify: a small check of the server itself, run by hand and kept in `hil/`.

### T2 The real path on the 4" (firmware, fixture in designer) - M

`src/project/CameraFeed.{h,cpp}`, JPEGDEC with its memory in PSRAM, loader and
`ObjectTypes.h`, `ColorScreenRenderer` drawing the newest picture, `"camera"` in
the 4"'s device.json and DDF header (generate-ddf-header.js by hand).

- Accept: a hand-written project with a Camera, a chart and live values shows a
  moving picture on the 4" with MQTT connected.
- Accept: fetching stops when the screen is left.
- Accept: the frame number is read back correctly from `/panel.bmp`.
- Verify: a HIL case in `hil/waveshare/` measuring success criteria 1 and 4
  against T1's server, and the delay from the frame number.

### Checkpoint A: is it good enough on the real firmware?

Criteria 1 (>= 5 images/s at 7-11 KB) and 4 (loop pause <= 100 ms) on the 4".
**Stop and show the user the numbers.** If they fail, cap the frame rate or
decide anew before anything else is built.

### T3 States and failures (firmware) - M

«No live image» per decision 7, Basic auth, 256 KB limit, no credentials in
logs or `/api/debug`.

- Accept: success criteria 2, 3, 6, 7, 9 on the 4".
- Verify: HIL cases in `hil/waveshare/`, each against a mode of T1's server.

### T4 Designer: the type (designer) - M

`camera` in `lib/object-types.ts` and `lib/object-order.ts`, label «Camera»,
icon, palette part, `render-camera.ts` placeholder, size 80x60 to 320x240 in
`lib/layout.ts` and `lib/free-min-size.ts`, properties URL, Username and a masked
Password. Offered only where the device declares the type.

- Accept: place it, resize within limits, set the fields, save and reload.
- Accept: not offered on a PaperS3 project.
- Verify: `e2e/camera.spec.ts`, `npm run typecheck`.

### T5 Designer: preview (designer) - S

The URL's image where the browser can load it, else the placeholder; a still
image in the demo instance.

- Accept: a mocked image is shown; a failing one, an https page and a URL with
  credentials give the placeholder.
- Verify: extends `e2e/camera.spec.ts`.

### T6 Export (designer) - M

`lib/project-zip.ts`, `lib/android-export.ts`, `lib/asset-export.ts`, section in
`docs/device-contract.md`; a conformance specimen; T2's hand-written fixture
replaced by one built from the designer.

- Accept: the export matches the spec's contract for boards and Android.
- Accept: the 4" shows the designer's project; designer and device agree in
  conformance.
- Verify: an export spec, `hil/conformance/specimens.js`, `npm run test:quick`.

### Checkpoint B: one device, end to end

The user places a Camera in the designer, deploys to the 4", and sees it.

### T7 4.3B (firmware) - S

Declare the type, DDF header, fixture in `hil/waveshare4v3b/`.

- Accept: success criteria 1-7 and 9 on the 4.3B.
- Verify: its HIL suite. Watch COM3 (the memory of a panic under load).

### T8 Knob (firmware) - M

Its own `main.cpp` and display path; measured first.

- Accept: success criteria 1, 3, 4, or the numbers for the user.
- Verify: a HIL case for the Knob.

### Checkpoint C: does the Knob declare the type?

The user decides from T8's numbers (spec, criterion 8).

### T9 Android (android) - M

`CameraView.kt`, `ProjectModels.kt`, `ScreenRenderer.kt`, `DdfBuilder.kt`; the
same rules with `HttpURLConnection` and `BitmapFactory`; Ethernet networks as well.

- Accept: success criteria 1-3, 6, 7, 9 on the phone.
- Verify: `CameraViewTest`, a case in `hil/android/fixtures/`.

### T10 Handbook (designer) - S

`handbuch/objekte/anzeigen.md`: the object, XIAO and IP Webcam, go2rtc, a switch
for powering it, credentials in the clear, the warning with the drain exception.
«No live image» as `<span class="ui fw">`. Through `maettel-humanizer`.

- Accept: `e2e/handbook-labels.spec.ts` passes.
- Verify: `npm run dev --prefix handbuch`, read the page.

### T11 All together - S

30-minute soak on the 4" with chart and MQTT (criterion 5); `npm run test:all`;
idea and spec brought up to date with what was measured.

- Accept: no restart; every suite green or visibly skipped.

### After this, not part of it

XIAO on the real module (`/capture`, `Content-Length`, a second viewer) once one
is there; the Vest camera; several actions on a button and OnClose on popups (a
spec of its own, spec decision 14).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Renderer and MQTT leave too little CPU | High | T2 and Checkpoint A come before everything else |
| Internal RAM runs short (25-31 KB seen with a large project) | High | JPEGDEC and buffers in PSRAM; criterion 5 |
| WiFi on the 4" is touchy | Med | The bench's weak WiFi is the test; keep T1's server on the bench network |
| The Knob is too slow | Med | Checkpoint C, the user decides |
| 4.3B panic under load | Med | COM3 logged during T7 |
| New firmware tasks collide with the loop's drawing | Med | The renderer alone touches the panel; the feed only hands over pictures |

## Open questions

None that block T1.
