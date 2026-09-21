# Das Telefon sagt seine eigene Bildschirmgröße

Agreed 2026-09-21. The Android app announces its own Device Description File
over MQTT and serves it over HTTP, the way every board does. The curated
`public/ddf/android-phone.ddf.zip` is gone.

## What was wrong

That file declared `screen: 360x800`. The app draws one project unit as one
dp and applies no fit step at all - `ScreenRenderer`'s own note says the
reference resolution "was deliberately chosen to already be dp-scaled". So on
any phone with more room than 360x800 dp, a project stopped short of the
edges, and there was no way to make one that filled the screen.

A curated file cannot fix that. It holds one size, and "Android phone" is not
a device, it is a class of them. **Curate a device, not a class of them**:
anything whose specs are only knowable from the thing in front of you has to
say them itself. Every board is curated because a board's specs are a fact
about that board, decided in its own repo; a phone's are a fact about the
phone in your hand.

## What it does now

**1. The app builds its DDF at runtime** (`ddf/DdfBuilder.kt`) from
`LocalConfiguration`'s dp size, with the supported types, fonts, device
actions and system generation it has always declared. Deterministic bytes -
fixed entry order, fixed timestamps - so the same phone gives the same hash
and the designer's cached copy is not invalidated by the clock.

**2. The adornment is generated with it.** Every number in the phone
silhouette comes from the screen size, so a fixed drawing around a screen of
any other size would show the screen hanging out of the phone. Same
proportions as the drawing it replaces: 16 px either side, 60 top and bottom,
corner radius 28.

**3. It serves that zip at `http://<phone>:8080/ddf.zip`**
(`ddf/DdfServer.kt`) - a socket, a request line and a response, because a
whole HTTP library is a lot of jar for one static file already in memory.
Unauthenticated, as the boards are, and for the same reason: the designer has
no credentials to offer, it is a local network, and what is behind the port
is a description of a screen.

**4. It announces a retained `hello`** with `deviceId`, `name`,
`firmwareVersion`, `systemGeneration`, `ddfHash` and `url`, plus a retained
`status` and an `offline` Last Will - exactly §4's shape, so the designer's
existing discovery picks it up with no change at all on that side.

**5. Its identity is stable.** The MQTT client id was
`screensmith-android-<timestamp>`, new every launch: harmless for a
subscriber, but a *retained* announcement under it would leave one more
corpse on the broker per app start. It is `android-<8 chars of ANDROID_ID>`
now. Reinstalling the app gives a new id, and the designer then sees a new
device, which is the truth as far as it can tell.

**5a. The name is the one a person would use.** `Build.MODEL` alone is a
part number - "CLT-L29" in a list beside "Waveshare Knob-Touch LCD 1.8" -
so the app tries three things in order: the vendor's marketing string
(`ro.product.marketname`, `ro.config.marketing_name`), then the name the
owner gave the device if it differs from the model, then maker and model
together ("Huawei CLT-L29"). Android has no public API for the words on the
box; every vendor puts them in a system property instead, so the first step
reads `getprop` in a subprocess - `android.os.SystemProperties` is hidden
and blocked. On the phone this was built against, that yields "HUAWEI P20
Pro".

Changing the name changes the DDF's bytes and therefore its hash, so the
designer re-fetches it. The *id* does not change, so a project already bound
to that phone stays bound.

**6. A broker alone is enough to connect.** The app used to connect only once
a project *and* a broker were present. A phone the designer has never seen is
exactly the one with no project yet, so with a broker configured it connects,
announces, and subscribes to nothing.

## Deploying to it

Added the same day, once the announcement made it possible. The deploy
button was hidden for an Android project - "no self-update firmware path
exists there yet" - and the app took a project only through the file picker.

It takes one over the air now, on the same topics every board uses. The
designer's side is two small things: send the *Android* bundle
(`exportAndroidProject`, JSON and PNGs) rather than the firmware's, and stop
hiding the button. `/api/deploy` and the topics are device-independent and
needed nothing.

**The phone does not reboot, and does not pretend to.** A board restarts to
pick up a project; a phone puts the new screen up under whoever is looking
at it, which is the point of deploying to one. Its terminal state is
therefore `applied`, a new one - `rebooting` was the only state the dialog
read as "done", so the bar would have spun for ever, and showing "Rebooting"
for a phone would have been a small lie.

Two things the app had to learn with it:

- **Unpack beside the running project, then swap.** The importer deleted the
  live directory and wrote into it, which is survivable when a human picks a
  file and waits, and is not when a deploy lands mid-glance: a half-written
  project is a screen of missing icons and a parse error. Two renames now,
  and the file picker gets the same safety. A zip entry naming its way out of
  the directory is refused - theoretical from a picked file, not from the
  network.
- **Cleartext HTTP**, which Android has blocked by default since 9.
  Everything this app talks to is on the local network and speaks it. Not an
  allowlist: the designer's address is whatever LAN address its machine has.

## What it costs

You cannot create an Android project while the phone is not on the broker.
That is deliberate: there is no honest default size to offer, and a project
made against a guess is a project that does not fit. §1's argument for
curating boards - "without a curated copy, whether an instance knows the
device depends on the weather" - is about boards that are often off; a phone
running the app is the one device that is always to hand.

## What holds it

`ScreensmithAndroid`'s `DdfBuilderTest` asserts what the generated DDF
declares - the screen it was given, the types, the actions, the generation,
the adornment's own numbers, and that the bytes and the hash are
deterministic. Those assertions used to live in this repo's
`e2e/android-export.spec.ts`, against the checked-in zip; they moved with the
thing they describe.
