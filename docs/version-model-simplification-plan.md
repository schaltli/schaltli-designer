# Plan: collapse the version model to one number

Status: **complete — all six rollout steps done** (2026-08-22). Step 1
(the model itself, in `docs/nested-provenance.md`) and step 2
(`lib/system-generation.ts`, written and validated everywhere) landed
together; step 3, the frozen generation corpus in `test-projects/generations/`
plus `e2e/system-generation.spec.ts`, followed; step 4 deleted `ddfVersion`
outright and replaced it with the content hash and `lib/ddf-name.ts`. Step 5
landed in `screenbee-waveshare-1v8` on 2026-08-22: its half of the guard
(item 8) had in fact come in with the port itself, and item 9 - the `hello`
payload - followed. Step 6 followed the same day and closed the plan.

Two notes from step 5 worth keeping. The comment in `DeviceInfo.h`
justifying the delay ("the designer's auto-discovery does not understand a
hash yet") had been true when written and was stale by the time anyone read
it again - step 4 had taught the designer the hash weeks earlier. A blocker
recorded in a comment does not expire on its own; it reads as fact forever.
And the M5 Dial never got item 8: it was retired on 2026-08-18, so the
"across all devices at once" this plan originally imagined is now one
device plus the e-paper firmware.

What step 4 actually landed, including three things this plan did not
prescribe:

- `lib/sha256.ts`, a hand-written implementation. `crypto.subtle` exists
  only in a secure context and this app is meant to run over plain HTTP on
  a LAN IP, so the designer's own browser is exactly where the platform
  digest is unavailable - the same trap `lib/utils.ts`'s `generateUuid`
  already documents for `crypto.randomUUID`. It is pinned against the FIPS
  180-4 vectors *and* Node's own implementation at every length 0-200 in
  `e2e/ddf-name.spec.ts`, because a subtly wrong hash throws nowhere: it
  would surface as "the device announces a DDF the designer never
  recognizes", in another repo, weeks later.
- **The name is two curated lists (283 adjectives x 329 nouns), not one
  2048-word pool.** ~93,000 combinations instead of ~4.2M, traded for two
  properties the flat list could not have: the slots cannot collide into
  `sage-sage`, and an adjective-noun pair is what makes a name recognizable
  on sight, which is its only job. The plan's own criterion - avoid
  unfortunate combinations - is easier to meet with fixed slots than with a
  pool where any word can land anywhere. A collision costs a confusing
  glance, never a wrong decision, because nothing compares the name.
- **`.data/ddf/` filenames stay keyed by `deviceId`, not by hash** (the plan
  said "filenames follow"). A device serves exactly one DDF, so the cache
  holds that one and overwrites it. Hash-named files would accumulate one
  entry per revision a device ever announced, and the Startup Gate would
  list the same device several times with no way to tell which is current.
  The hash still decides *whether* to re-fetch, which is what "key on the
  hash" was actually for.

Two things landed that are strictly more than the plan asked for, both
cheap once the hash existed: `/api/ddf/fetch` **verifies** an announced hash
against the bytes it fetched and refuses on mismatch (an announcement that
lies is now visible rather than silently poisoning the cache), and the
deploy dialog checks the device's advertised Systemstand *before* uploading
a zip. The second is inert until step 5 gives firmware something to
advertise - by design, absent means unchecked.

Written 2026-08-19 after a
design session that concluded the current model (documented in
`docs/nested-provenance.md`'s "Version compatibility") is more machinery
than this project needs, and — more importantly — that its complexity is
itself the failure mode.

Nothing is released, there is no third-party data, and the designer and
every firmware repo move together under one operator. That makes now the
cheapest possible moment to simplify: there are no legacy artifacts to
migrate, so the change is a rename plus deletions.

## The problem, precisely

Not "too many numbers" — **too many numbers that a human has to remember
to increment.** Every actual failure so far traces to that:

- DDF **1.7** removed `device.json`'s `adornment.drawingArea` (a file
  *format* break) and shipped as a `ddfVersion` bump. An older designer
  reads it as a silently missing adornment — no bezel, no off-screen
  covers, no hardware-button hit-testing — because `canvas.tsx` guards the
  field as optional. **1.9** (`hardwareButtons[]` removed) has the same
  shape.
- A cosmetic adornment change shipped with **no** bump at all (correctly,
  under the current rules: no capability changed), and the installed
  project then pointed at stale artwork indefinitely, because the bump is
  what triggers correction.

Both are "a human classified a change, and the classification was the
load-bearing part." The target model removes the human from the loop
wherever possible, and makes the remaining decision mechanical.

## Target model

| Thing | Where | Semantics |
|---|---|---|
| **Systemstand** `major.minor` | project.json, device export project.json, DDF device.json, firmware | The only real version. `artifact.major > reader.major` → refuse cleanly. Otherwise accept. |
| **DDF content hash** | designer cache / auto-discovery, MQTT `hello` | Differs → re-fetch. No ordering, cannot be forgotten. |
| **…rendered as a word pair** (`banana-ship`) | every human-facing surface | A pure function of the hash — a *rendering*, not a second identifier. |
| `device.id` | unchanged | Different hardware → hard block. Not a version relationship. |
| `ddfVersion` | **deleted** | Superseded entirely by the hash and its word rendering. |
| `firmwareVersion` | display/diagnostics only | Already the case. Keep it that way. |

Underlying rule, worth stating because it decides both halves:
**numbers where ordering matters, words where only identity matters.** The
Systemstand needs ordering, because "newer than me" *is* the decision. A
DDF needs only "same or not", so it needs no number — and a word pair
actively helps by not implying an order that never existed. (`ddfVersion`
invited exactly that false question: "is another device's 1.4 older than
this one's 1.9?" — which the old design had to answer with a caveat.)

### The major/minor rule (mechanical, not a judgement call)

> **Default is major.** A change may be called minor only if it is
> (a) a new *optional* field, or (b) a new value in a list that already
> has a skip-or-default convention (`supportedObjectTypes`, object
> `type`). **Anything touching an existing field's meaning, type,
> nesting, or location is major.** No discussion.

This classifies every known example correctly without argument: the
coordinate-space flip, the `screenWidth` reinterpretation, `objects`
moving to per-screen files, and DDF 1.7's `drawingArea` removal are all
major; a new `CheckBox` type or a new `platform?` field are minor.

Minor forward-compatibility is **not new machinery** — it already exists
and is already tested: `ColorScreenRenderer.cpp`'s "unknown type → skip
and log" and the designer's "missing field → default" convention are
exactly what makes a 7.13 device able to run a 7.14 project.

### The word rendering, and its two rules

The hash is displayed as a two-word name (`banana-ship`) wherever a human
looks: UI badges, MQTT/serial logs, HIL reports, deploy dialogs.

1. **The hash stays the key; the name is display only.** Comparing on the
   name buys collisions — two words from a 2048-word list is only ~4.2M
   combinations, and a collision means "the cache thinks it already has
   this DDF" and serves a stale one, which is precisely the bug class this
   plan exists to kill. Cache keys, `.data/ddf/` filenames and the `hello`
   payload all carry the full hash.
2. **The wordlist is frozen data.** Changing it renames everything. Not a
   correctness problem (the hash decides), but it invalidates every name a
   human has memorized or written into a log, so pick once and treat edits
   as a migration. Keep it checked in, small and curated — avoid the
   ambiguous-when-spoken and unfortunate-in-combination cases the
   established lists (BIP39, the PGP wordlist, Docker's name generator)
   each had to deal with.

Side benefit that motivated this over a plain version number: `v1.9` can't
tell you whether the designer's cached copy is *the same bytes* as what the
device serves — a derived name can, at a glance. That drift is the thing
`nested-provenance.md` was written to fix in the first place.

### Who computes the hash, and when

**Nobody sets the name.** It is rendered from the hash at display time and
never stored, so there is no step to forget. The hash itself is computed
by whoever holds the bytes:

| Site | When | Feeds |
|---|---|---|
| `parseDeviceDescriptionFile()` (designer) | every DDF parse — entries are already unpacked | badge, cache key, `.data/ddf/` filename, project `settings.ddfHash` |
| `tools/generate-ddf-header.js` (firmware repo) | build time, alongside the existing `ddf_zip.h` generation | a compiled-in string constant, published in the MQTT `hello` |
| HIL orchestrators, `app/api/ddf/fetch/route.ts` | on demand | comparisons against the above |

**There is no shared implementation, and none is needed** — see the next
subsection. The device does not compute a hash in JS, and no firmware repo
takes a dependency on designer code.

`generate-ddf-header.js` already keeps `DeviceInfo.h`'s `DDF_VERSION` in
sync with `device.json` and already has a `--check` mode that exits 1 on
drift. It simply syncs a derived hash instead of a hand-written number,
which makes the sync *enforceable* rather than remembered. Worth noting
that script's own header comment records a third instance of this exact
failure class: it was an uncommitted one-off, "which is exactly why
designer/firmware versions drifted before — the designer's DDF went
1.4 → 1.5 → 1.6 while this firmware kept announcing and serving 1.4."

#### Hash the served bytes — plain sha256, no canonicalization

An earlier draft of this plan specified a canonical-content hash (sorted
`(entry path, sha256(entry bytes))` pairs, git-tree style) to survive
recompression. **Rejected 2026-08-19:** it turns the hash into a
*specification* that every producer must implement identically, which
forces either a shared module across separate repos or a
reimplementation in each firmware repo's build language — a cross-language
agreement problem, and exactly the kind of thing that drifts.

It is also unnecessary. `ddf_zip.h` is a fixed byte array, `GET /ddf.zip`
serves exactly those bytes, and the designer downloads exactly those bytes.
Both sides hold the identical byte string, so the algorithm is just
**sha256 over a byte array** — a standard function in every language, not a
protocol two implementations can read differently. The non-determinism
worry applied to *building* the zip from a directory, which is not the
question the hash answers.

Concretely:

- **Firmware side:** either the build tool writes the hash as a constant
  next to `DDF_ZIP` (it hashes the bytes it just emitted — one line, and it
  does not matter whether that tool is Node, Python or shell), or the
  device computes a CRC32 over `DDF_ZIP` at boot. miniz is already linked
  in for zip extraction and ships `crc32`, so the second option costs
  nothing either.
- **Designer side:** sha256 over the bytes it loaded.

**What this gives up:** name stability across recompression. Rebuilding a
content-identical DDF whose zip bytes differ flips the name, causing one
unnecessary re-fetch of a small file and a changed badge — **not a
correctness problem**, unlike the framing the earlier draft used to
justify canonicalizing. If it ever becomes annoying, the cheap fix is to
make `generate-ddf-header.js` byte-deterministic (fixed timestamps, fixed
entry order, fixed compression level): a local change in one script, not a
contract between repos.

Two things that otherwise bite:

- **The hash is never stored inside the DDF.** Putting it in `device.json`
  would mean hashing a field that contains the hash. It is always computed
  from outside — which is what makes "nobody sets it" literally true.
- **Length.** Full sha256 hex is 64 characters, unwieldy on the wire and in
  logs; truncate to 16 hex chars (64 bits) for keys and the `hello`. The
  word rendering is a separate, lossier projection: 2 words from a
  2048-entry list is 22 bits (~1-in-4M per pair), fine for eyeballing a
  handful of DDFs. Go to 3 words if the name should be trustworthy on its
  own. Either way the key stays the hash.

The only places the value is *stored* are caches of a derivable fact — the
project's `settings.ddfHash` and the firmware's compiled-in constant — and
both can be recomputed and checked at any time.

### The device never reads a DDF

Verified against `screenbee-m5dial/src`: the only consumer of `ddf_zip.h`
is `TestInterfaceServer::handleDdfZip()`, which **serves** it over
`GET /ddf.zip`. The renderer, `ProjectInstaller` and `ColorAssetLoader`
never read a DDF.

A DDF is the device's self-description *outward*, not an input. The device
is ground truth; it has its fonts compiled in (matched by
`internalName`), knows its own panel size, renders whatever it
implements, and does not draw its own bezel. So at runtime it applies its
own burned-in reality and compares nothing.

Consequence: the device needs neither `ddfVersion` nor a hash.

### Restore is already correct

`cbe471c` (current HEAD) already splices the device's **currently served**
DDF into a recovered project, discarding whatever vintage was frozen into
the retained deploy — designer-side, in `recover-project-dialog.tsx`, with
e2e coverage in `e2e/recover-project.spec.ts`. No firmware change, and no
change needed under this plan.

## What falls away

- **The OTA self-correction mechanism** (`nested-provenance.md` Fall 4's
  `ddfVersion`-mismatch branch: device overwrites its installed project's
  embedded DDF and rewrites font references after an update). It exists
  only so a *later* restore doesn't return a stale copy — which is what
  `cbe471c` already solved differently, without mutating stored project
  data on the device. **Never implemented, so this is deletion of a plan,
  not of code.**
- **Two of the three `schemaVersion` constants** (`PROJECT_SCHEMA_VERSION`,
  `EXPORT_SCHEMA_VERSION`, `SUPPORTED_DDF_SCHEMA_VERSION` → one).
- **`ddfVersion` entirely** — not just its decision role (the Fall 2 step 4
  "silently refresh after deploy" dance and the `deviceId`+`ddfVersion`
  cache-key comparison in auto-discovery), but the field itself, since the
  word rendering covers the display role it would otherwise have been kept
  for.
- **Roughly half of `nested-provenance.md`'s "Version compatibility"
  section** — the four Fälle's long-form prose and Fall 4's `ddfVersion`
  correction plan.

  > **Departed from, 2026-08-22.** This bullet also named the entire "Why
  > `ddfVersion` content changes turned out not to need a migration
  > mechanism" argument, on the grounds that it becomes moot once
  > `ddfVersion` carries no decisions. It was kept instead. Its conclusion
  > is moot; its *finding* is not, and the finding is what the rest of the
  > design rests on - the rendering model derives nothing, so a content
  > change degrades rather than breaks, which is the entire reason a DDF
  > can be identified by a hash with no compatibility question attached.
  > Delete the argument and only the conclusion survives, which is how a
  > settled question gets reopened from scratch later. Same reasoning kept
  > "Three `schemaVersion`s, one name", "The one that already happened"
  > and "Rejected, and why".

## Concrete changes

### Designer

1. `lib/project-zip.ts` — replace `PROJECT_SCHEMA_VERSION` and
   `EXPORT_SCHEMA_VERSION` with a single exported
   `SYSTEM_GENERATION = { major: 1, minor: 0 }` (serialized as
   `systemGeneration: "1.0"`). Write it into both `project.json` shapes.
2. `lib/device-description.ts` — drop `SUPPORTED_DDF_SCHEMA_VERSION`,
   `DeviceDescriptionFile.schemaVersion` and `ddfVersion`; validate
   `systemGeneration` against the shared constant instead. Add the content
   hash (over the DDF zip bytes) to `ParsedDeviceDescription`.
3. New `lib/ddf-name.ts` — hash → word-pair rendering plus the frozen
   wordlist. Pure, no state, trivially unit-testable; every UI surface and
   log line goes through it. The hash itself needs no module of its own:
   it's `sha256(bytes)` at each site, with no shared code between repos.
4. `components/project-editor.tsx` — `validateProjectSchemaVersion()`
   becomes `validateSystemGeneration()` with the major-comparison rule.
   `ProjectSettings.ddfVersion` → `ddfHash`.
5. Auto-discovery — `app/api/ddf/fetch/route.ts` and
   `app/api/ddf/list/route.ts` key on hash instead of
   `deviceId`+`ddfVersion`; `.data/ddf/` filenames follow.
6. `components/deploy-dialog.tsx` — delete the ddfVersion-refresh step,
   keep the object-type diff warning (it's independently useful), and add
   a **pre-deploy** Systemstand check using the hello's advertised
   generation, so a mismatch is caught before uploading a zip rather than
   after the device downloads it.
7. UI badges — `startup-device-gate.tsx`, `project-settings-dialog.tsx`
   show the word name instead of `v{ddfVersion}`. Two devices showing the
   same name now means genuinely the same bytes, which the old badge could
   not promise.

### Firmware (`screenbee-m5dial`, `screenbee-waveshare-1v8`, e-paper)

8. `DeviceInfo.h` — `EXPORT_SCHEMA_VERSION` → `SYSTEM_GENERATION_MAJOR` /
   `_MINOR`. `DeployManager.cpp`'s existing check becomes a major
   comparison; `ProjectInstaller::peekProjectSchemaVersion()` renames
   accordingly. This is the smallest firmware change in the list — the
   guard already exists in the right place.
9. `main.cpp`'s MQTT `hello` — add the device's own Systemstand, replace
   `ddfVersion` with the DDF hash, keep `url`. The hash is a build-time
   constant: `tools/generate-ddf-header.js` hashes the bytes it just wrote
   into `ddf_zip.h` and replaces `DeviceInfo.h`'s `DDF_VERSION` with it,
   with its existing `--check` mode guarding drift in CI or a pre-commit
   hook. No designer code is shared into this repo. (Alternative if a
   future firmware repo has no such build step: CRC32 over `DDF_ZIP` at
   boot via miniz, which is already linked in.) The device never renders
   words — it logs the raw value.

### Contract & docs

10. `docs/device-contract.md` §4 — document the `hello` change
    (`ddfVersion` → hash, plus the Systemstand field).
11. `docs/nested-provenance.md` — collapse "Version compatibility" to the
    two rules plus `device.id`. Fall 1 already needed no policy, Fall 3 is
    built, Fall 4 shrinks to the single major case ("new firmware can't
    read the installed project → safe state, redeploy, human closes the
    loop"), Fall 2 becomes `device.id` block + generation check +
    object-type warning. Keep the historical record of 1.7/1.9 — it is
    the justification for the whole change.
12. `DEVICE_GUIDE.md` — the major/minor rule goes here, since DDF authors
    and firmware authors are the ones who have to apply it.

### Tests

13. **Generation fixture corpus** — one sample project/export/DDF per
    generation under `test-projects/generations/`, plus a spec asserting
    the current reader opens every artifact whose major matches and
    cleanly refuses every higher major. This is what turns a
    misclassification into a red test instead of a field bug, and it is
    the piece that makes the mechanical rule enforceable rather than
    aspirational.
14. Unit coverage for `lib/ddf-name.ts`: same bytes → same name; one
    flipped byte → different name; and the wordlist's own size/uniqueness,
    since a duplicate entry would silently halve the space. Plus one
    end-to-end check that the hash a device announces in its `hello` equals
    the hash the designer computes from what it downloaded at `url` — with
    no shared implementation, that equality is the only thing worth
    asserting, and it is the whole contract.
15. Update the existing version-adjacent specs:
    `e2e/project-download.spec.ts`, `e2e/deploy-dialog.spec.ts`,
    `e2e/ddf-auto-discovery.spec.ts`, `e2e/ddf-url-import.spec.ts`,
    `e2e/recover-project.spec.ts` (all currently assert on `schemaVersion`
    or `ddfVersion`).

## Rollout order

Each step leaves the tree green; nothing needs a big-bang switch.

1. ~~Docs first — agree the model in `nested-provenance.md` before code, so
   the plan and the code can't diverge mid-refactor.~~ **Done.**
2. ~~Designer: one constant, `systemGeneration` written and validated
   (accept a missing field as `1.0` so nothing in `.data/` or
   `test-projects/` breaks).~~ **Done.**
3. ~~Fixture corpus + spec. Do this *before* the deletions, so the
   deletions are covered.~~ **Done** - `test-projects/generations/`
   (frozen artifacts, one set per generation case, rebuilt only by
   `build-corpus.js` when a *new* generation is added) and
   `e2e/system-generation.spec.ts`. Both halves of the rule are verified
   by mutation: disabling the refusal turns the 2.0 cases red, and
   refusing a newer *minor* turns the 1.999 cases red.
4. ~~DDF hash + `lib/ddf-name.ts`; retire `ddfVersion` entirely. The name
   rendering can land in the same step — it's a pure function, so it
   carries no risk of its own.~~ **Done** - see the status note at the top
   for the three places the implementation departed from this text.
5. ~~Firmware: rename the guard, change the hello payload.~~ **Done** for
   `screenbee-waveshare-1v8` (2026-08-22). `SYSTEM_GENERATION_MAJOR/_MINOR`
   and `peekProjectSystemGenerationMajor()` were already in place from the
   port; `hello` now sends `systemGeneration` and `ddfHash` and no longer
   sends `ddfVersion`. `tools/generate-ddf-header.js` hashes the zip it
   writes and keeps `DeviceInfo.h`'s `DDF_HASH` in step, its `--check` mode
   failing on drift (verified by mutating the constant). Covered by
   `hil/waveshare/orchestrator.js`, which reads the device's real retained
   `hello` and checks the announced hash against the bytes the device
   actually serves - the drift that would silently end auto-discovery. The
   e-paper firmware still announces the old payload; it stays discoverable
   either way, since both fields are optional by contract.
6. ~~Delete the superseded doc sections and the unimplemented OTA
   correction plan.~~ **Done** (2026-08-22). In
   `docs/nested-provenance.md` the four Fälle lost their long-form prose -
   which argued out a five-field reconciliation that no longer exists - and
   became one section stating where each ended up, with the live code
   references kept. Fall 4's `ddfVersion` correction plan went with it: it
   is unimplemented, there is still no OTA path in any firmware, and it is
   unbuildable as written now that a DDF has no version to compare and the
   device never reads one. Its surviving constraint is stated in the
   replacement, because it outlives the mechanism: **the designer has no
   visibility into an autonomous OTA event**, so anything needing
   correction at that moment must be corrected on the device or not at all.
   `DEVICE_GUIDE.md` gained "The one version number, and when to change
   it" - the major/minor rule, the silent-wrongness test for a major bump,
   and why a DDF has no version of its own - since DDF and firmware authors
   are who have to apply it.

   Kept deliberately, against the temptation to tidy: "Three
   `schemaVersion`s, one name", "Why `ddfVersion` content changes turned
   out not to need a migration mechanism", "The one that already happened"
   and "Rejected, and why". Each is an argument that killed a worse design,
   and the 1.7/1.9 misclassification is the justification for this entire
   plan. Deleting the reasoning would leave only the conclusion, which is
   how a settled question gets reopened from scratch two years later.

## Cost, honestly

- **Lockstep is relaxed, not eliminated.** A major bump still means every
  device must be reflashed before it accepts a new deploy. That is the
  intended behavior, and with `major.minor` it is now rare rather than
  constant.
- **The hash gives up ordering, on purpose.** `banana-ship` doesn't tell
  you whether it is newer than `cactus-lamp`. That question was never
  answerable for DDFs anyway (the old design had to caveat it: comparable
  only within one `device.id`), and ordering now lives entirely in the
  Systemstand, where it is real. The word rendering removes the last cost
  here — readability — so this axis has no remaining downside beyond the
  frozen-wordlist obligation above.
- **The `hello` contract changes**, so every firmware repo needs a touch
  (small, and the Waveshare board has no deploy path yet anyway).
- **`ddfVersion 1.7`/`1.9` stay misnumbered.** Decided 2026-08-19: not
  renumbered retroactively, because the designers that would have been
  protected predate the `schemaVersion` concept entirely and would ignore
  the field regardless.

## Upgrade scripts

Settled 2026-08-19, full reasoning in `nested-provenance.md`'s "Upgrade
scripts" subsection. Summary: **a major obligates a clean refusal, not a
migration.** An upgrade path is a per-case decision, and the criterion is
whether the data exist only in that artifact — true for project files,
false for DDFs (hand-authored source, two of them, ours), device exports
and installed projects (redeploy). Minor never gets one, and *needing* one
is the proof a change was misclassified as minor.

Consequence for this plan: **no migration framework is built.** The
generation fixture corpus (step 13) is what makes a refusal provably clean;
the first actual migration gets written when the first major arrives.

## Explicitly out of scope

- Renumbering DDF history.
- A migration-chain mechanism. The current design has never needed one,
  and Fall 4's answer stays "human closes the loop."
- Hardening `canvas.tsx`'s silent adornment guards (a missing adornment or
  screen rect should be visible, not a quietly blank frame). Worth doing —
  it is what made 1.7 silent rather than loud — but it is an independent
  fix, not part of the version model.
- `lib/export-utils.ts`'s dead `ExportManager` class.
