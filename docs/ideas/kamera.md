# A camera you look through for a moment

Idea refined with the user on 2026-10-11. The user's picture: type the
camera's IP into the designer and it works. The camera is a XIAO ESP32S3
Sense, or an old Android phone hanging on the van's wall. This is not
surveillance: the camera is switched on when someone wants to look, they
check for a short while, and it goes off again.

The case that makes it concrete: the dog stays in the van while its owner
does the shopping. From the supermarket they open the Schaltli app on the
phone in their pocket, tap «Dog», and see the dog and the temperature inside.

Status: built (2026-11-10), spec docs/2026-11-09-camera.md, plan
tasks/camera-plan.md. What was measured is under «Update 2026-11-10» at the end.

## Update 2026-11-09: a moving picture, never for reversing

Refined with the user on 2026-11-09. The picture should move (5-10 fps), the
camera is a XIAO ESP32S3 Sense (not bought yet), and the use stays the glance
described below. **The control is not for reversing or anything else while
driving:** the user ruled that out as safety-relevant, because the delay can
hide a cyclist. This section overrides the rest of the document where they
differ.

### Problem Statement

How might a van owner glance at a moving picture from the van on their
Schaltli screen, with a frozen image never mistaken for a live one, and one
and the same control in the designer for every device?

### Recommended Direction

One object type, **Camera**, identical in the designer for every device: it
has a snapshot URL and no device-specific settings.

**The device fetches single images, the next one only when the last has
arrived.** It does not read an MJPEG stream. The spike tried a stream first:
the delay swung between 1 and 10 s, because the sender pushes frames faster
than a panel on weak WiFi takes them and they queue up on the way, where the
panel cannot drop them. With one image in flight nothing can queue, and the
delay on the glass stayed constantly small. The frame rate falls out per
device and per WiFi by itself. Aim: 5-10 fps or better.

The XIAO's stock `CameraWebServer` offers `/capture`, a phone with IP Webcam
`/shot.jpg`, most IP cameras a snapshot URL. The device fetches **directly from
the camera**: the user types in the address and needs no Pi. **go2rtc on the Pi
is an option**, not a requirement, for cameras speaking RTSP
(`/api/frame.jpeg`). To the control it is just another URL.

Fetching and decoding are separate, and only the newest image is decoded.

**Android gets no second path.** Android fetches the same images, faster and
sharper. WebRTC or RTSP would need H.264, which a XIAO does not deliver.

**A stale image must never look live.** If the newest frame is older than
about 1 s, the control replaces it with «No live image». Someone checking on
the dog must not take a frozen picture for the present.

The handbook says plainly that the Camera is **not for reversing or for use
while driving**. The estimated chain from camera to panel is 300-800 ms,
unmeasured, which is fine for a glance and unacceptable for traffic.

### Key Assumptions to Validate

- [x] **The panel stays usable and the delay small.** Spike on the 4" on
      2026-11-09, see below; with the Schaltli renderer and MQTT running
      alongside measured on every device on 2026-11-10 (see the end).
- [ ] **A XIAO answers `/capture` fast enough.** Measured so far only with a
      phone; a camera that needs longer per capture lowers the frame rate.
- [ ] **The van's WiFi carries it.** The XIAO's small antenna. Test in the van,
      measuring frame rate.

### Spike result (2026-11-09)

Waveshare 4" with its real panel, touch and framebuffer code, no Schaltli
renderer or MQTT; phone with IP Webcam as the camera; WiFi at -80 dBm; a 320x240
field, with a fake live value 5 times a second.

| | Images shown | Decode | Present | Longest loop pause |
|---|---|---|---|---|
| Stream, 320x240, ~10 KB | 14-16 fps, **delay 1-10 s** | 41 ms | 34 ms | 60 ms |
| Stream, 640x480 at 1/2, ~30 KB | 3.5-4.5 fps | 95 ms | 26 ms | 45 ms |
| **Single images, 320x240, ~3 KB** | **14-15 fps, delay constantly small** | 37 ms | 27 ms | 65 ms |

A fetch took about 70 ms, at most 146 ms. Without an image the longest loop
pause was 4 ms, so touch can wait up to about 65 ms while an image is drawn;
how that feels under a finger was not tried on purpose. Internal RAM stayed
above 220 KB free. The single-image run had small frames of 3 KB; see below
for realistic ones. VGA does not reach the aim, so **320x240 is the
size for the panels**. The delay was judged by eye, not filmed.

Repeated with panel and phone on the same WiFi at -68 dBm: the stream showed
21 fps and still a delay of about 4 s, so weak WiFi is not the only cause.
Where exactly the frames wait was not measured; the phone sent 27 fps. Single
images on the same WiFi: 14-16 fps at 3 KB (a fetch about 55 ms, at most
112 ms), but only **4-5 fps at 7-11 KB, a realistic picture** (a fetch about
200-260 ms, at most 383 ms). The same image took a PC 40-50 ms, so the time
goes on the panel's side.

Most of that was the spike waiting for the server to close the connection. Read
up to `Content-Length` instead: **about 11 fps at 7 KB**, a fetch about 85 ms, at
most 177 ms. So the device must stop at `Content-Length` and not wait for the
end of the connection. A kept-open connection stays untested: IP Webcam answers
`Connection: close` to every request. Whether a XIAO's `/capture` sends
`Content-Length` and allows keep-alive is to be measured on the module.

### The one exception: over the drain

Added on 2026-11-09. A camera under the van looks straight down and shows the
ground, so that the van can be stopped over a drain when emptying the waste
water. This is the only use while the van moves that the Camera is meant for,
and a narrow one: **at walking pace, for positioning only, after looking
around**. Nothing the driver must not miss is in this picture, and the delay
of about 200-300 ms is 10-15 cm at 0.5 m/s. The remaining risk is someone
staring at the display instead of out of the window, so the handbook says that
this does not replace looking out.

No XIAO here. A camera on an **Ethernet cable** to the router in the van avoids
WiFi under a steel floor, the worst place for it. The lens needs a **motorised
cover** that stays shut while the camera is off, because road dirt would soon
blind it; manoeuvring itself should not splash much. Ready-made candidates:

- [Vest rear-view IP camera](https://www.vest.no/_extension/media/197/orig/attachment/Productinformation_rearview_IP_camera.pdf):
  IP, PoE, M12, IP69K, shutter opened by a signal. The closest match; whether
  it has a snapshot URL or RTSP and what it costs is to be asked.
- Motorised covers in analogue or AHD cameras (Axion DBC 114065 S1 and 1240108S,
  Dometic CAM 80 AHD, CAM44): the mechanics fit, the picture does not reach the
  network without further hardware.
- PoE vehicle cameras without a cover (GPI GPCR-675A1GN): an image, but a lens
  that gets dirty.

The control does not change: it needs a snapshot URL, from the camera or, for
RTSP, from go2rtc on the Pi. The cover is switched by other blocks, not by the
control (docs/2026-11-09-camera.md, decision 1).

To check: does the chosen camera offer a snapshot URL or RTSP; PoE from the van's
12 V needs an injector (the GL-X3000 does not appear to supply PoE); the field of
view at about 35 cm ground clearance (a XIAO's would cover some 45 cm, so wide
angle helps); light at night.

### MVP Scope

In:
- The object type Camera: snapshot URL, an error state and the stale-image state.
- Panels and Android: one image at a time, newest only, the 1 s staleness rule.
- Designer: the same object for every device, placeholder where the browser
  blocks the image (see the https note above).
- Handbook page: XIAO setup, go2rtc as the option for several viewers or RTSP,
  and the warning that the Camera is not for reversing or use while driving,
  with the drain as the one exception and its limits.

### Not Doing (and Why)

- **Images over MQTT** - at 5-10 fps frames back up in the TCP connection and
  the picture falls further and further behind.
- **MJPEG streams** - the spike showed a delay of 1-10 s; frames queue up where
  the device cannot drop them.
- **WebRTC/RTSP on Android for now** - no gain with a JPEG-only camera.
- **Guide lines and controls over the image** - they suggest a precision the
  delay does not support, and redrawing costs the panel dearly.
- **Rear view, or any use while driving, apart from the drain above** -
  safety-relevant; the delay can hide a cyclist. A radio's wired camera input
  is the right tool for that.
- **Switching screens from the reverse gear** - follows from the point above.
- **PaperS3, recording, sound** - unchanged.

Overridden from below: «image interval» goes, images come as fast as the device
fetches them; playing the MJPEG stream on Android goes too; «Several viewers
at once» is possible through go2rtc, but needs no work in the control; the claim that an ESP32-P4 might decode H.264
needs checking, as its hardware H.264 is, as far as known, an encoder.

### Open Questions

- What does a second viewer do to a XIAO answering `/capture`: do both get
  images at half the rate, or does one lose out?

## Problem Statement

How might a van owner tap a button on their Schaltli screen - in the van or
in the supermarket - and see a few seconds later what a camera in the van
sees, without a cloud service in between and without the camera running when
no one is looking?

## Recommended Direction

A new object type, **Camera** (working name), shows the image of a XIAO
ESP32S3 Sense. Its sensor encodes JPEG in hardware at whatever resolution
it is set to, so the work a bridge would otherwise do - converting RTSP,
scaling down - is already done on the camera. The panel fetches the image
directly from the XIAO over HTTP (`http://<ip>/capture` of the stock
`CameraWebServer` example), about once a second, and draws it. Android does
the same, or plays the MJPEG stream on port 81, which is free because only
one person ever watches.

**The control carries the camera's lifecycle.** It has a URL and, optionally,
a power topic. As soon as the control becomes visible - usually in a popup
opened by a button - the device publishes `ON` to the power topic. Until the
first image arrives the control shows «Starting camera…». It shows images
until the popup closes or a maximum time runs out (say 60 s), then publishes
`OFF`. The user builds nothing but «button → popup with a Camera»; popups
gain no new logic.

The panel switching the camera off is not enough: if it crashes or loses
WiFi while the camera runs, nobody switches it off. The power side needs its
own guard - in Node-RED, «off after 2 minutes, whatever happens». That
belongs in the vanpi integration and the handbook, not in the firmware.

**Any camera with a local snapshot URL works the same way.** Most IP
cameras have one (Axis, Hikvision, Dahua, Bosch's professional line; the
exact path comes from the camera's manual). Their snapshots are often full
resolution (1080p to 4 MP), which the panel handles by scaling while it
decodes - JPEGDEC decodes at 1/2, 1/4 or 1/8 - or by a resolution parameter
or substream snapshot where the camera offers one. They usually want a user
and a password, so the control gets both as optional fields. A PoE camera
takes 30-60 s to boot, so it simply runs all the time and the power topic
stays empty. Everything that speaks RTSP, wants Digest auth or HTTPS only
goes through **go2rtc** on the Pi, which hands out `/api/frame.jpeg`,
scaled and without a password on the local network - to the panel, just
another URL.

**An old Android phone works as a camera today.** Apps such as «IP Webcam»
serve a snapshot URL (`/shot.jpg`) and an MJPEG stream; to the control it is
one more URL. That is also the first real test camera, before any XIAO is
bought. The camera needs no relay there: the phone stays on WiFi.

**From outside the van it is the same URL, over Tailscale.** The pocket
phone is on mobile data, not on the van's WiFi. With the Pi advertising the
van's network as a Tailscale subnet route and Tailscale on the pocket phone,
`http://<van address>/...` answers from anywhere - no cloud, no port
forwarding. A glance at about 30 kB a second costs under 2 MB a minute.

The image alone does not say whether the dog is fine; the heat does. The
popup with the Camera also holds the inside temperature as a live value -
nothing new, just the recommended way to build it.

The source is cut so that a later **self-announcing Schaltli camera** is
just a second source of the same control, not a new control. That camera is
more likely a **camera mode of the Schaltli Android app** than a firmware for
the XIAO: the app already announces itself
(docs/2026-09-21-android-self-announce.md), CameraX does the capturing, and
the camera goes on and off with the power topic in software, in well under a
second, with no relay.

## Key Assumptions to Validate

- [ ] **The pocket phone reaches the van.** The Schaltli app on mobile data,
      over Tailscale, gets its MQTT values and the camera URL. Test: a phone
      with IP Webcam on the van's WiFi, a second phone on mobile data with
      Tailscale, open the snapshot URL in its browser. Without this the dog
      case does not exist.

- [ ] **The Waveshare panel decodes a QVGA JPEG per second without stalling
      touch and live values.** The assumption that kills the idea if wrong.
      Test: a throwaway sketch on the ESP32-S3 panel fetching a QVGA snapshot
      (IP Webcam at 320×240 until a XIAO is there) in a loop and drawing it with JPEGDEC/esp_jpeg; measure decode time, frame
      time and touch latency. Per CLAUDE.md it then becomes a HIL test under
      `hil/waveshare/`.
- [ ] **The wait from tap to first image is acceptable.** Boot, WiFi and
      camera init on the XIAO. Test: a stopwatch from power-on to the first
      `/capture` that answers, with a fixed IP (no DHCP). Under ~3 s feels
      like a glance; 6 s or more needs a reason to look.
- [ ] **The XIAO can be switched on.** Still open (a phone as camera does
      not have the problem): a relay output the panel
      can already switch over MQTT (vanpi/Pekaway), or a XIAO that stays on
      WiFi and only puts the camera to sleep (~50-100 mA all the time, needs
      our own XIAO firmware). Decides whether the power topic is enough.
- [ ] **The van's WiFi carries it.** Two ESP32s, the XIAO with its tiny
      antenna, 15-30 kB per image. Test along with the first assumption, in
      the van rather than at the desk.
- [ ] **The designer can show the image.** Locally (http) an `<img>` from the
      camera's IP loads. The demo instance runs over https and blocks http
      images (mixed content): there the control shows a placeholder image.

## MVP Scope

In:
- The object type Camera: URL, optional user and password, image interval,
  optional power topic, maximum time; a «Starting camera…» state and an
  error state («No image»).
- Waveshare firmware: HTTP GET of a JPEG with Basic auth, software decode,
  scaled while decoding (1/2, 1/4, 1/8) and then drawn at the control's
  size.
- Android: the same, or the MJPEG stream.
- Designer: the image from the URL on the canvas and in the preview where
  the browser allows it, otherwise a placeholder; the mock engine/demo
  supplies a still image.
- Handbook page for the object, with the XIAO setup (`CameraWebServer`,
  fixed IP), an old phone with IP Webcam, Tailscale for looking from
  outside, and the guard on the power side.

Out: everything under «Not Doing».

## Not Doing (and Why)

- **Surveillance, permanent display, motion events** - not what this is for;
  a glance on demand needs none of it.
- **RTSP, Digest auth and HTTPS in the firmware** - go2rtc on the Pi turns
  all three into a plain local URL; Digest and HTTPS can follow if go2rtc
  turns out to be one step too many for users.
- **Cloud-only cameras** (Ring, Arlo, most app-only consumer models) - they
  have no local snapshot URL, so there is nothing to fetch.
- **Home Assistant as a source of its own** - its camera proxy is also just
  a URL with a token; no special handling.
- **A camera mode in the Schaltli app** - the step after the MVP; until then
  IP Webcam does the same job.
- **Our own camera firmware for the XIAO** - the camera mode in the app is
  the cheaper way to a self-announcing camera.
- **A phone showing its own camera** - the front camera shows whoever holds
  it; the phone that shows and the phone that films are two phones.
- **Our own way into the van from outside** (a cloud relay, port forwarding)
  - Tailscale already does it, and it is the user's to set up.
- **A push warning when the van gets too hot** - the natural next idea for
  the dog, but its own idea; the camera does not need it.
- **Real video on the Waveshare** - the ESP32-S3 has no H.264 decoder; a
  future ESP32-P4 device might.
- **PaperS3** - an e-paper display has no business showing a moving image.
- **Several viewers at once, recording, sound** - a glance has one viewer
  and needs no archive.
- **A timeout and open/close actions for popups in general** - the Camera
  brings its own lifecycle; popup timeouts stay deferred as in
  docs/2026-10-06-popup-screens.md.

## Open Questions

- How is the XIAO powered: a relay or always on? (See assumption 3.)
- Does `ON`/`OFF` on the power topic fit Pekaway's relays, or does the
  control need configurable payloads like the switch has?
- What if two devices show the camera at once - the phone on the wall and
  the one in the pocket: does the first one to close switch it off for the
  other? With a phone as camera this becomes likely, not hypothetical.
- Does the Schaltli Android app work outside the van today - MQTT over
  Tailscale, the right broker address - or does that need work of its own
  first?
- The camera's user and password end up in the exported project and so on
  every device. Acceptable for a camera on the van's own network, or should
  go2rtc (no password locally) be the recommended way for anything with
  credentials?

## Update 2026-11-10: built, and what each device does

Built on the branch `camera` in designer, firmware and Android app, measured by
HIL against a fake camera that plays the drain video by the clock
(`hil/camera-server.js`, 320x240, about 10 KB a frame) and carries its frame
number in the picture, so the delay is read off the glass, not judged by eye.
The screen under test has an energy diagram moving and values arriving over
MQTT beside the Camera, the worst case.

| Device | Images a second | Delay (median) | Longest loop pause |
|---|---|---|---|
| Waveshare 4" | 10.2 | about 100 ms | within 150 ms of the same screen without it |
| Waveshare 4.3B | 5.1, capped at 170 ms between requests | | 282-285 ms of 286 allowed |
| Knob | 12.9-13.3 | 133-200 ms | 67-69 ms (13 without) |
| Android (P20) | 57.8 | 0-33 ms | |

The 4.3B was the tight one: unlimited, its loop paused 389 ms, so the user chose
the cap. Fetching ahead was tried on the 4" and dropped: 19 images fetched a
second, 3.3 shown. Every failure mode (camera gone and back, wrong password, no
`Content-Length`, garbage, over 256 KB, another screen) passes on all four.

Thirty minutes on the 4" with a chart fed over MQTT beside the Camera
(`camera.js --soak`): no restart, 12 images a second throughout (84 windows of
84 above 5), internal heap lowest 138 KB against 156 KB for the same screen
without the Camera, and the same 142 KB in the first ten minutes as in the last.

Still open, as before: a real XIAO (`/capture`, `Content-Length`, a second
viewer) and the van's WiFi; the handbook's XIAO and IP Webcam addresses come from
their documentation, not from trying them.
