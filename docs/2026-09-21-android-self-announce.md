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
`schaltli-android-<timestamp>`, new every launch: harmless for a
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

## The first deploy showed the one before it

Found the same day, on the phone, and worth writing down because the
mechanism is general.

A deploy landed, the objects on the screen were the new project's, and the
background under them was an older project's - a blue frame and a black
field where the project says white. Both installs had reported `applied`;
the bytes were on disk; `adb` confirmed them there.

**The cache key was the file's name.** The renderer decoded the background
once per path and kept it - `remember(path)` - and the path is
`assets/<screenId>.png` in every project there has ever been. So the first
project's pixels were handed back for every project after it. The objects
were right because they come from `project.json`, which is parsed afresh each
time; only what was cached went stale. The same shape sat in four typeface
caches, keyed on `assets/fonts/<family>.ttf`.

**And there is a second half, which the fix has to cover too.** Re-install a
bundle whose `project.json` is byte for byte the one already loaded - a
different background, the same objects - and `ProjectRepository.project`
emits nothing at all: a StateFlow drops a value equal to the one it holds.
Nothing recomposes, so no cache key is even consulted. Keying on the project
therefore cannot work; keying on the *file* would work but puts a `stat` on
the UI thread for every cached asset on every recomposition.

What it keys on instead is the install: `ProjectRepository.installation`, a
counter that changes on every install whatever the zip contained, read at
each cache through `LocalBundleInstallation`. A composition local rather than
a parameter, because the composables that need it are leaves - a typeface
cache inside a button inside a tab-control - and nothing in between has any
business carrying it.

`hil/android/orchestrator.js` installs the fixture itself now, and installs a
marker bundle first to prove the install reached the screen. Nothing else in
that suite could have caught this: every case compares one installed project
against its own reference, and a stale background is only visible against the
project *before* it. The suite no longer needs a project imported by hand
either, which is what made this path untested in the first place.

## The deploy that stalled at 20%

Same day, and the reason a deploy to the phone would sit on a percentage
while the phone had in fact finished.

Reconnecting was keyed on the project. Every install changed the project, so
every install reconnected - and the client identifier is this phone's own and
stable now, so the connection being torn down and the one being built wanted
the same name. A client built with `automaticReconnect()` keeps trying on its
own, and `disconnect()` only stops one that is connected at that moment; one
caught mid-retry carried on, took the connection back, and the two swapped it
about once a second. Each round re-subscribed, and a re-subscription is how a
retained message is delivered again: the retained `deploy` came back 2427
times in one session, the app answered `busy` to its own deploy - a state with
no percentage on it - and the progress it published went out over whichever
connection was dying.

Three things, and the first is the one that matters:

**Connect when the broker changes, not when the project does.** A new project
is a different set of subscriptions, which is `setTopics` on the connection
already open. Nothing else about it is a reason to build a new connection.

**A superseded connection may not act.** Every listener now checks a
generation number against the one its client was built with, because
`disconnect()` alone cannot be relied on to silence a client that is
retrying.

**A deploy arriving again while it is being installed is not another
deploy.** It is ignored rather than answered `busy`; `busy` is for a
different one. The flags behind that are atomic now too - deploys arrive on
several of the client's threads, and two could each find the receiver idle
and both start downloading the same bundle into the same directory.

Held by `hil/android/orchestrator.js`, which installs twice per run and fails
if the phone ever calls its own deploy busy. One install never showed this;
the problem compounded with each one.

## Which way up

The phone turned its picture whenever it was tipped over, and could not be
used sideways on purpose. Both halves of one missing thing.

There was never a question to answer here: every device already carries a
rotation. The project holds one (`ProjectSettings.rotation`), the DDF says
which ones the device may be mounted in (`screen.allowedRotations`), the
designer swaps width and height for a quarter turn, and a board applies it to
its own panel. The Android target declared no rotations, so the designer
offered none - and the app, having nothing to obey, followed the sensor.

So it declares `[90, 180, 270]`, the export carries `rotation` as the
firmware bundle always has, and the app holds its activity in the matching
one of the four. A quarter turn cannot be inferred from the exported
width and height alone, because a half turn leaves them exactly as they were.

**A DDF always describes the native orientation**, and this is where it
nearly went wrong: with a landscape project installed, the phone began
announcing 679x333 - the screen it was currently showing - and the designer
would have turned that again. Nor can the upright size be recovered by
swapping those numbers, because the system bars take a different amount of
room along each edge: 360x679 upright is not 679x333 on its side. So the
upright measurement is written down whenever the activity is upright, and
that is what is announced from then on, whichever way a project has since
turned the phone.

The activity also declares `configChanges` for the turn. Without it Android
destroys and rebuilds it, `onCreate` runs again, `startLockTask()` runs again,
and Android's "Screen pinned" confirmation lands on top of the new screen
every single time.

## What it costs

You cannot create an Android project while the phone is not on the broker.
That is deliberate: there is no honest default size to offer, and a project
made against a guess is a project that does not fit. §1's argument for
curating boards - "without a curated copy, whether an instance knows the
device depends on the weather" - is about boards that are often off; a phone
running the app is the one device that is always to hand.

## What holds it

`schaltli-android`'s `DdfBuilderTest` asserts what the generated DDF
declares - the screen it was given, the types, the actions, the generation,
the adornment's own numbers, and that the bytes and the hash are
deterministic. Those assertions used to live in this repo's
`e2e/android-export.spec.ts`, against the checked-in zip; they moved with the
thing they describe.
