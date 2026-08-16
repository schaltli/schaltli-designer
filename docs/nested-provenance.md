# Nested provenance

**Status: agreed 2026-08-14, not implemented.** This describes a direction
and the reasoning behind it, so the next person changing export, deploy or
project loading doesn't have to rediscover it. What exists today is
described under "Where we actually are".

## The principle

Every artifact embeds the artifact it was derived from:

```
DDF  ⊂  project file  ⊂  export file  →  installed on the device
```

so any layer can be opened on its own and traced back to an editable
source. Concretely, the intended end state:

- The **DDF** describes a device: screen, adornment SVG, hardware buttons,
  real BDF font data, supported object types. It is authored alongside the
  firmware and is the device's own truth about itself.
- The **project file** embeds the DDF it was built against, instead of
  copying selected fields out of it.
- The **export file** embeds the project file it was baked from, alongside
  the flattened bitmaps and rewritten object model the device consumes.
- The **device** keeps that embedded project file after installing, and
  serves it back on request.

The last step is the point of the whole thing: a project file gets lost in
practice, and the device is the one copy that physically stays with the
installation. A server-side recovery chain already exists (a deploy writes
`boundInstanceId` onto the project, `.data/projects/by-instance/<id>.json`
maps device → projectId, and version history takes a checkpoint on every
deploy) — but this app is local-first with no cloud, so all of that lives
in one `.data/` directory on one machine. The device is the only
independent copy.

## Why embed rather than copy fields

The project file *already* carries the DDF's content, denormalized into
`project.json`: adornment SVG, `adornmentDrawingArea`, `hardwareButtons`,
font metadata plus the BDF files, `colorDepth`, `deviceId`, `deviceName`,
`supportedObjectTypes`. `project-editor.tsx`'s upload path re-resolves from
the local DDF when the device is available on this instance, and otherwise
opens anyway from that embedded copy with a warning.

That copy is a hand-maintained subset, and subsets drift. Measured on
`test-projects/combined-test-project.zip`: it claims 4
`supportedObjectTypes` where the current e-paper DDF declares 9. And no
`ddfVersion` is stored anywhere in a project, so the fallback path cannot
detect that its device data is stale — it can only warn unconditionally.

Embedding the DDF zip itself replaces the subset with the original: nothing
is copied, so nothing can drift, and `ddfVersion` and `testInterface` —
which the denormalized copy loses entirely — come along for free.

This is the same failure mode the firmware's own `ddf_zip.h` had. It sat
two DDF versions behind because the script that generated it was never
checked in; see `tools/generate-ddf-header.js` in the firmware repo, which
now also has a `--check` mode so the drift is visible rather than silent.

## Decisions already taken

**Store the device copy whole, DDF included.** Stripping the DDF to save
flash was considered and rejected. It would need a re-nesting step at
recovery that refetches the DDF from the device — and if that firmware has
since been reflashed with a newer DDF, you would reassemble a project from
device data it was never saved with, reintroducing exactly the drift the
nesting removes.

**Space is not the constraint it first appeared to be.** An installed
project occupies 25,650 bytes extracted on the M5 Dial — 1.7% of its
1536 KB LittleFS partition; the e-paper fixture 221,713 bytes, 14%. The
disk-full incidents of 2026-08-11 and 2026-08-14 were debris, most likely
from extractions that crashed before the miniz fix, not a budget problem.
An earlier argument for frugality here was built on misreading those.

**Nesting an already-compressed DDF is free.** 75,278 bytes standalone,
75,181 nested — DEFLATE gains 97 bytes on data that is already DEFLATEd,
and does not make it worse.

**Nesting is zip-in-zip (an opaque blob entry), never a flattened merge of
the inner archive's files into the outer one.** Settled 2026-08-15. The
inner artifact sits at a fixed path, `_source/<name>.zip` (e.g.
`project.zip`'s `_source/ddf.zip`; `export.zip`'s `_source/project.zip`,
which — since that project.zip already carries its own `_source/ddf.zip`
— nests the DDF two levels deep automatically, no special-casing). A flat
merge was considered and rejected: it would need per-file prefixing
discipline to avoid collisions with the outer artifact's own same-named
files (both could plausibly have a `fonts/helvR08.bdf`), and recovery
would need to re-zip the scattered files back into a standalone archive
instead of just extracting one entry — reintroducing exactly the
reconstruction risk "store the device copy whole" (above) already rejected
stripping for. Zip-in-zip also keeps the extraction filter (Fall 3) a
one-line prefix check (`startsWith("_source/")`) regardless of nesting
depth, since each nested artifact is one entry, not a subtree.

**The backup is the retained download, not a separate write — so it
doesn't need to be best-effort.** Originally framed as "best-effort, log
and continue if it fails," on the assumption that saving a recovery copy
was one more write that could independently fail. It isn't: the firmware
already streams the whole export zip to flash before extracting anything
from it (`DeployManager.cpp`'s `DEPLOY_DOWNLOAD_PATH`, consumed by
`ProjectInstaller::installProjectZipFromFile()`) — a plain sequential
write, not the fragile DEFLATE-extraction path. Today that staged file is
deleted unconditionally afterward, success or failure
(`DeployManager.cpp:101`); once nested provenance ships, it should instead
be promoted to a permanent recovery slot, replacing the previous one only
after the new copy is safely in place. Extraction failure then stays what
it already is — a real, loudly-reported deploy failure — without also
costing the recovery copy, since that copy exists independently of whether
extraction ever succeeds. See "Version compatibility" below.

## Version compatibility

Settled 2026-08-15, not implemented, and revised twice the same day as
counterexamples got stress-tested against the actual rendering code — see
"Why `ddfVersion` content changes turned out not to need a migration
mechanism" below for the reasoning that killed the first draft of this
section. Two version fields, two separate meanings — collapsing them into
one was the source of most of the early confusion:

- **`schemaVersion`** (new, doesn't exist yet) — versions the DDF/project
  *file format* itself (its shape: which fields exist, how they nest). A
  single integer, bumped only on a real structural break; additive changes
  keep using the existing "optional field, default when omitted"
  convention (e.g. `platform?`, `format?` in `lib/device-description.ts`)
  and don't bump it. A consumer that doesn't recognize a file's
  `schemaVersion` refuses to parse it at all, with a clear error, before
  reading anything else — not even `device.id`. This is the one axis where
  a real, unresolvable incompatibility can still occur (see Fall 2 and
  Fall 4 below) — because it's a question of whether the bytes can be
  decoded at all, not what they mean once decoded.
- **`ddfVersion`** — a plain, monotonically increasing marker of *which
  revision of a specific device's own described capabilities* (screen,
  buttons, fonts, `supportedObjectTypes`...) a file was built against.
  Only ever comparable *within the same `device.id`* — a different device
  model's `ddfVersion` numbering is an independent sequence (one model's
  "8" says nothing about whether it's older or newer than another model's
  "1"). No `major.minor` split, and no version-number-driven blocking
  policy: see the dedicated section below for why that turned out
  unnecessary. It still earns its keep as a simple "is the device's
  description newer than what this project was last checked against"
  marker (Fall 2's step 4).

Four places two DDF/project versions can meet, worked out separately:
opening a project (Fall 1), deploying to a physical device (Fall 2),
recovering a lost project from a device (Fall 3), and a device updating
its own firmware while a project is already installed (Fall 4).

### Fall 1 — project vs. this editor instance, at open time

**Resolved: no separate policy needed.** Once nested provenance ships, a
project always opens against its own embedded DDF — self-contained,
regardless of what this instance currently curates for that device model.
There's nothing to reconcile: the whole point of embedding is that the
project stops depending on the instance's copy once it exists. The
original open question below ("update silently or ask?") assumed the risk
was letting the editor's palette get ahead of what a project's actual
firmware supports — but that risk is now fully covered downstream, at the
one point it actually matters: Fall 2's deploy-time check.

Curated DDFs (`public/ddf/`) stay for the devices that still ship one, but
their role narrows to **only** proposing a starting point when creating a
*new* project — never consulted when opening an existing one. Only
`public/ddf/mqtt-epaper-display.ddf.zip` and `public/ddf/android-phone.ddf.zip`
remain as of 2026-08-16; the M5 Dial's curated copy was removed entirely
(see docs/device-contract.md §1) - its DDF source now lives only in the
`screenbee-m5dial` firmware repo, reachable by this instance via live MQTT
announcement or manual URL import
(`components/ddf-url-import.tsx`/`app/api/ddf/fetch/route.ts`), never a
checked-in file here. The e2e specs that build M5-Dial-targeted test
projects (`e2e/software-button-render.spec.ts`,
`e2e/m5dial-hardware-buttons.spec.ts`, `e2e/screen-icon.spec.ts`,
`e2e/page-icon-export.spec.ts`, `e2e/adornment-offscreen.spec.ts`,
`e2e/project-download.spec.ts`, `e2e/switch-render.spec.ts`) now self-seed
its real DDF straight into `.data/ddf/` via `e2e/ddf-seed.ts`, reading it
from the firmware repo directly (skipping gracefully if that repo isn't
checked out alongside this one) rather than depending on a file in this
repo. `devicePlatform: "android"` targets (`public/ddf/android-phone.ddf.zip`)
still can't go the live-announcement route at all - they never self-announce
over MQTT (`device-scan-section.tsx` has no Android handling), so "a live
device must be available" has no meaning for that platform; that DDF stays
curated for now (a candidate for the same URL-import-only treatment later,
not done in this pass - see docs/device-contract.md §1's intro).

### Fall 2 — project vs. the physical device, at deploy time

Checked in this order, each guard gating the next:

1. **`schemaVersion`** unreadable → refuse to even parse, before anything
   else. On the device, this is a peek, not a full parse — the firmware
   already has the pattern for this: `ProjectInstaller::
   peekProjectDeviceId()` opens the incoming zip, reads just enough of
   `project.json` to check one field, and bails before touching
   `/PROJECT/`. The same peek should read `schemaVersion` too, rejecting
   before `installProjectZipFromFile()` ever runs, mirroring
   `DeployManager.cpp`'s existing "`device.id` check happens here, still
   before `installProjectZipFromFile()` ever wipes `/PROJECT`" comment.
2. **`device.id`** mismatch (project built for a different device model
   than the one connected) → **hard block, unconditional**, independent of
   any version number — "older/newer" isn't meaningful across models
   (different physical hardware isn't a version relationship at all, see
   the note in Fall 4 below). Changing a project's target device is a
   deliberate manual step in Project Settings, with manual rework
   expected; an automatic migration wizard is future work, not scoped
   here.
3. **`ddfVersion` content mismatch** (screen/buttons/fonts/
   `supportedObjectTypes` differ from what the project was last checked
   against, either direction) → **no version-number gate at all.** The
   device renders what it has: an object whose type isn't in
   `supportedObjectTypes` is skipped with a log line exactly like an
   unimplemented type today (`ColorScreenRenderer.cpp:1057-1059`, *"Object
   type ... not implemented yet, skipping"*), and a font swap or a
   changed-but-still-present field just renders differently, not
   incorrectly (see the dedicated section below for why no case was found
   that this doesn't cover). The one check worth keeping is a **precise
   diff of the project's actually-placed object types against the
   device's own `supportedObjectTypes`**, surfaced as a warning (not a
   block) before deploy, so the designer can flag "this project places a
   `MQTTIconField`, this device doesn't have one" instead of the user
   discovering it by staring at a device that's silently missing a
   widget. Should rarely trigger: `toolbar.tsx:257` already disables
   palette tools for types outside `supportedObjectTypes`, and
   `canvas.tsx:1380` flags already-placed objects that fall outside it —
   this only surfaces when that gate's data was stale (the very drift this
   document exists to fix), after a device swap in Project Settings, or
   after a project sat untouched while the device's firmware moved on.
4. **Device's `ddfVersion` is newer** than what the project last saw →
   silently allowed (nothing the project uses is missing), then the
   project's stored `ddfVersion` is silently refreshed after a successful
   deploy — keeps the stored value honest without a needless dialog.

### Fall 3 — recovering a lost project from a device

Reduces to Fall 1 + Fall 2, plus one firmware-level fix this discussion
surfaced:

- **Opening** the recovered project follows Fall 1: it opens against its
  own embedded DDF, whatever vintage that is.
- **Redeploying** it afterward is just Fall 2 again, against whatever
  `ddfVersion` the device is actually running now — potentially a bigger
  gap than usual if the device was reflashed multiple times since the
  original install, but the same rules apply unchanged.
- **What makes recovery reliably possible at all** needed correcting: see
  the revised "backup" bullet above. Concretely: `DeployManager.cpp:101`
  needs to stop deleting the staged export zip unconditionally, and
  `ProjectInstaller::installProjectZipFromFile()`'s extraction loop
  (`ProjectInstaller.cpp:329`) needs to skip the embedded recovery-only
  entries rather than extracting everything — only the runtime-needed
  subset (assets, object model) gets unpacked to `/PROJECT/`; the embedded
  project/DDF backup stays compressed inside the retained zip, read only on
  an actual recovery request.

Runtime assets themselves stay extracted once at deploy, not read
on-the-fly from the archive — see the new rejected idea below for why.

### Fall 4 — a device updating its own firmware, project already installed

Not implemented — there's no OTA path in the firmware at all yet (no
`esp_ota`/`Update.begin` anywhere in `screenbee-m5dial/src`). Written down
now so it's built right the first time, since this is the one place the
version-compatibility work above doesn't fully cover: firmware can change
underneath an already-installed project with no deploy, and therefore no
designer, involved at all.

The device drives its own update (not the designer pushing firmware bytes
directly — a different, higher-stakes operation with its own security
posture).

**`ddfVersion` content mismatches: revised 2026-08-15, superseding an
earlier, incomplete answer.** The first draft of this section said Fall
2's step 3 (render what you have, skip/degrade the rest) covers this with
no new mechanism — true for *rendering*, but incomplete: that's a
render-time fallback, not something that keeps the *stored* project data
honest. Found live, the same day: a device's firmware was reflashed with a
cosmetic adornment change (no capability change, so no `ddfVersion`
bump), and its already-installed project kept pointing at the old
artwork indefinitely — nothing was ever going to fix that on its own,
because there is no deploy step in this scenario for a designer-side check
(object-type/font diff, deploy-dialog.tsx) to run against. **The designer
has no visibility into an autonomous OTA event at all** — any correction
has to happen on the device, at the moment of the update, or it doesn't
happen until the next deploy, which may never come.

So: the device corrects its own installed project, entirely on its own,
the moment it finishes an OTA update and finds its installed project's
embedded `ddfVersion` doesn't match its own new one -

1. Overwrite the installed project's embedded DDF reference with the
   firmware's own current one.
2. Best-effort-fix any content that no longer resolves against it - in
   practice, today, that's font references: `ColorScreenRenderer::
   getU8g2FontById()` matches by `internalName` against a fixed,
   compiled-in u8g2 table, so a `fontId` whose `internalName` doesn't
   exist in the new firmware gets swapped for a suitable currently-
   supported one, directly in the stored project data.

No warning, no confirmation, no designer round-trip - "Punkt" (there's
no human to ask at that moment, and every case examined under "Why
`ddfVersion` content changes turned out not to need a migration
mechanism" above already established these swaps are always safely
degradable, never catastrophic, so there's nothing a confirmation would
actually be protecting against). This is squarely the same "silent, no
dialog" territory Fall 2 step 4's ddfVersion refresh already occupies -
just triggered by an OTA event instead of a deploy, and correcting the
persisted project data instead of only a version marker string.

Designer-side, deploy-dialog.tsx's object-type diff warning (Fall 2 step
3) stays worth having on its own terms - useful the moment a *human* is
actively deploying and could benefit from knowing before it happens - but
it is not what makes drift correction actually reliable. That guarantee
lives entirely on the device, here.

`schemaVersion` mismatches are the real case: new firmware boots, can't
parse the already-installed `/PROJECT/project.json` structurally (not
"missing a feature" but "can't walk the shape at all"). The resolution
path:

1. **Accept the update. Do not roll back.** Automatic rollback was
   considered and rejected — see "Rejected, and why" below.
2. The device enters the same safe state Fall 3 uses for a missing
   recovery copy: a clear "project incompatible with this firmware, please
   redeploy" message, nothing rendered that could be mistaken for correct.
   Nothing is lost — the retained export zip (Fall 3's fix) still holds
   the last-known-good project.
3. **The human closes the loop, not the device.** Load the project into a
   current designer (which keeps the ability to read older project
   schemas, same reasoning as Fall 2's parser note); the schema migration
   runs there, with confirmation, exactly as scoped above; redeploy.
4. **Escape hatch if step 3 isn't possible right now:** the device can be
   told to fetch a specific *older* firmware version over the same OTA
   mechanism, deliberately, on request — not automatic, not a default. A
   plain downgrade, restoring the last firmware that could still read the
   installed project, buying time until the human is ready for step 3.
   Needs the device to remember which firmware version it was running
   before an update, and that old image to still be fetchable somewhere —
   an implementation detail, not a design gap.

Mitigation that reduces how often step 2 even triggers, without being
load-bearing: unlike a designer (which only needs to support the current
schema), firmware can keep an old `schemaVersion` read path around for a
few generations even after a new one is added, purely to widen the window
before a project *must* be migrated. Worth doing where practical, not a
substitute for the flow above — even with it, some jump will eventually be
too large.

## Why `ddfVersion` content changes turned out not to need a migration mechanism

The first draft of this section built an elaborate machinery for
`ddfVersion`: semver `major.minor`, a hard block on `major`, and a
migration-chain mechanism (declared per-version transforms, applied
automatically) to resolve it — modeled on database schema migrations. It
didn't survive contact with concrete examples.

Every candidate for "a real, same-device `ddfVersion` break that can't
just be skipped or defaulted" turned out, once checked against the actual
rendering code, to be either not a break or trivially resolvable:

- **A new object type or a new optional export field** (a `CheckBox`
  control; a button gaining a `pathActive` bitmap) — purely additive,
  covered entirely by the existing "unknown type → skip and log"
  (`ColorScreenRenderer.cpp:1057-1059`) and "missing field → default"
  conventions. Nothing to migrate in either direction.
- **Reinterpreting what an existing coordinate field means** (e.g. a
  tab-control panel child's `x`/`y` switching from tab-control-relative to
  screen-absolute) — a genuine structural change that "ignore what you
  don't know" can't catch, since nothing is unknown, just reinterpreted.
  But the fix is one deterministic arithmetic formula
  (`new_x = old_x + tabControl.x`), unambiguous enough that a device could
  even apply it itself.
- **Swapping a font entirely** (e.g. discontinuing `helvR08` for
  `robotoR09`) — looked like it would need real text-layout recomputation,
  but doesn't: `drawTextBox` (`ColorScreenRenderer.cpp:156-208`) clips to
  the object's stored `width`/`height` unconditionally — box size is
  always author-set data, never derived from font metrics, on the device
  or in the designer's own live rendering. A font swap is a reference
  rewrite, full stop; the result may look different (more clipping, a
  different look between live-rendered labels and already-baked bitmaps
  that still show the old font until re-exported) but never breaks.
  `lib/asset-export.ts:770-784` confirms baking is always redone from
  originals at export time anyway, so even the "old font is frozen into
  already-baked bitmaps" mismatch resolves itself on the next ordinary
  re-export — no dedicated bake-migration step needed.
- **Removing a screen dimension or a physical button** turned out not to
  be a same-device case at all: those are physical hardware properties, so
  a real change is definitionally a new `device.id` (Fall 2's step 2), not
  a `ddfVersion` bump on the same device.

No real `major`-shaped break exists in this project's actual DDF history
either — every observed bump (e.g. the M5 Dial's 1.5→1.6, which added the
`offscreen-0` cover, `docs/device-contract.md:81-82`) has been additive.

The pattern underneath all of this: the rendering model never derives
anything — every position, every size is author-set data, honored
unconditionally, with clipping (not reflow) as the only response to
"doesn't fit," and an unknown type is skipped rather than erroring. That
design, chosen for pixel-perfect predictability
([[project-pixel-perfect-mismatch]]), incidentally makes almost every
conceivable `ddfVersion` content change gracefully degradable by
construction. `schemaVersion` (container/structural readability, Fall 2
step 1 and Fall 4) remains the one axis where a real, unresolvable break
is possible — because it's about whether the bytes can be parsed at all,
a binary capability question, not a "does this look right" content
question.

## Rejected, and why

**Automatic OTA rollback when new firmware can't read the installed
project.** ESP32 already has the primitive for this (pending-verify
partitions, `esp_ota_mark_app_valid_cancel_rollback`, automatic revert if
the new app never confirms itself) and it looked like the obvious fit for
Fall 4's `schemaVersion` case. Rejected: it deadlocks the update instead of
resolving anything. If every update that meets an incompatible installed
project rolls itself back, the firmware never actually advances — the
human intervention that migration always eventually needs (see "Why
`ddfVersion` content changes turned out not to need a migration
mechanism") doesn't get invited, it gets postponed by an automatic system
quietly undoing the update on its own timeline. Accepting the update and
entering a clear, honest "incompatible, please redeploy" state does the
same job (nothing broken is ever shown) without hiding that an update
happened or blocking it from ever completing.

**On-the-fly extraction of runtime assets from the retained zip.** Tempting
once the whole export zip is kept around anyway for recovery (see
"Version compatibility" above) — why not skip a separate extraction step
and decompress assets straight from the archive when rendering needs them?
Wrong for the M5 Dial specifically: there's no partial-redraw path —
`main.cpp:284-287`, every MQTT-driven change triggers a full
`renderScreen()` that re-reads every asset on screen, so this would run on
every live update, not once at deploy. That's exactly the code path
(`mz_zip_reader_extract_iter_*`, the 32KB DEFLATE window) that took a
multi-day investigation on 2026-08-09 to stabilize against heap
fragmentation caused by WiFi/WebServer/LittleFS activity — moving it into
the render hot path means it now competes with that same fragmentation
continuously, for the device's whole operational lifetime, instead of once
per deploy. `ColorAssetLoader.h`'s existing in-RAM cache for grayscale
masks is a sign even plain uncompressed file reads already needed help
here. The idea is right for data read rarely (the recovery copy) and wrong
for data read on every redraw.

**ZIP-level deduplication** of a background image stored in both the
project file and the export. ZIP compresses each entry independently with
no shared dictionary, so a byte-identical second copy costs full price
(measured: 20,884 bytes for a 20,906-byte first copy). Solid archives can
do this; ZIP structurally cannot. The two copies wouldn't be byte-identical
anyway — source encoding versus baked raw bitmap.

**JPEG for background images.** It would shrink photographs substantially,
but it is lossy: the device's decoder and the designer's would not agree
bit-for-bit, ending the strict zero-differing-pixel HIL comparison this
project is built on. PNG is the lossless alternative and M5GFX already
vendors a decoder. Better still and format-neutral: keep assets compressed
on flash and inflate at render time — the same pixels, just smaller at
rest, and miniz is already vendored for zip extraction.

**Downscaling background images at import** is worth doing, but for a
different reason than it was proposed: a phone photo is 3-12 MB where the
device needs 240×240. It is destructive, though — today the project keeps
originals and bakes at export, which is what makes device swaps, rotation
and colour-depth changes re-derivable. Middle ground: downscale to the
largest edge the device could need in any allowed rotation, not to the
current screen size, and warn rather than silently degrade when a project
moves to a larger device. Deferred; no project has an image background yet.

## Where we actually are

Substantially built 2026-08-15 (designer + M5 Dial firmware, same session
as the version-compatibility design above); e-paper firmware
(`MqttEPaperDisplay2`) not touched at all yet.

**Built and verified (e2e-tested, and TypeScript-checked where
applicable):**

- The human-editable project file (`lib/device-description.ts`,
  `project-editor.tsx`'s download/upload) embeds the real DDF zip whole as
  `_source/ddf.zip` (zip-in-zip, `e2e/project-download.spec.ts`) instead of
  only the old denormalized fields (which still get written too, for
  backward compatibility with anything reading them directly).
- Fall 1 is live: opening a project with an embedded DDF uses only that,
  never re-resolving against this instance's `public/ddf/`
  (`e2e/ddf-auto-discovery.spec.ts`'s two device-resolution tests, one per
  path). A project without one (saved before this shipped) still falls
  back to the old instance-resolve behavior, unchanged.
- Both the DDF format (`lib/device-description.ts`) and the human project
  file format (`project-editor.tsx`) have their own `schemaVersion`,
  rejected before anything else is read if too new
  (`e2e/ddf-auto-discovery.spec.ts`, `e2e/project-download.spec.ts`). The
  device-facing *export* format (`lib/project-zip.ts`) now carries
  `schemaVersion: 1` too (`e2e/deploy-dialog.spec.ts`).
- Fall 2, step 1 (`schemaVersion` peek before touching `/PROJECT`) and
  step 2 (`device.id` hard block) are both live on the M5 Dial
  (`ProjectInstaller::peekProjectSchemaVersion()`, `DeviceInfo.h`'s
  `EXPORT_SCHEMA_VERSION`, wired into `DeployManager.cpp` ahead of the
  existing `device.id` check) — code-verified only, no compiler or real
  hardware available this session to confirm it actually builds/runs.
- Fall 2, steps 3-4: `DeployDialog` now fetches the selected device's live
  DDF (reusing `/api/ddf/fetch`, same as auto-discovery) and warns
  (non-blocking) if the project places an object type the device's
  `supportedObjectTypes` doesn't cover, then silently refreshes the
  project's stored `ddfVersion` after a successful deploy
  (`e2e/deploy-dialog.spec.ts`).
- `ProjectInstaller::installProjectZipFromFile()` (M5 Dial) skips
  `_source/*` on extraction — code-verified only, not hardware-verified,
  and **not yet covered by `hil/m5dial/fixtures/build-comprehensive-
  test.js`**: that fixture's own header comment claims an "observed
  ceiling ~31KB" for a single contiguous malloc of the whole zip in
  `installProjectZipFromFile()`, which doesn't match the function's actual
  code (streaming reader, no whole-zip malloc) — either the comment is
  stale or a real ceiling still exists elsewhere in the upload path.
  Deliberately left unresolved rather than guessed at; needs real M5 Dial
  hardware before adding a `_source/ddf.zip` entry (20-75KB+) to that
  fixture.

**Also built this session, M5 Dial only:**

- A prerequisite this session discovered was missing entirely:
  `lib/project-zip.ts`'s `buildDeviceProjectZip()` now embeds the full
  editable project as `_source/project.zip` (extracted into a new shared
  `buildEditableProjectZip()`, also used by `project-editor.tsx`'s
  `downloadProject()` — both must always agree, never drift, hence the
  extraction). Without this, a device would have nothing editable to hand
  back on recovery, only baked bitmaps. `e2e/deploy-dialog.spec.ts`.
- Fall 3 itself: `DeployManager.cpp` promotes the verified download to a
  permanent `RECOVERY_PROJECT_PATH` (`DeviceInfo.h`) via `LittleFS.rename()`
  right before extraction, not after — survives a failed
  `installProjectZipFromFile()`, and `LittleFS.rename()`'s atomic-replace
  guarantee means there's never a window with zero recovery copies. New
  `GET /recovery-project` on `TestInterfaceServer` streams it back
  (chunked, not one big malloc). **`TestInterfaceServer.cpp`'s separate
  `/api/project` upload path (setup-mode/HIL manual upload, distinct from
  the MQTT deploy path) does NOT get this same retention treatment** —
  deliberately left alone this session rather than touching a second
  file's behavior without being asked; a project installed only via that
  path still isn't recoverable.
  **Real-hardware status (2026-08-15, flashed to a real M5 Dial, then
  fully closed the same day):** every file in this section compiles clean
  (`pio run -e m5dial`) and the firmware boots and runs correctly with it
  present. The MQTT deploy path itself (where `peekProjectSchemaVersion`,
  the `LittleFS.rename()` promotion, and `GET /recovery-project` all
  actually live) is now verified too, via a new `hil/m5dial/
  orchestrator.js --mqtt-deploy` mode that drives the real designer UI
  through a real "Deploy to Device" against the real connected unit:
  `GET /recovery-project` → 404 before, real deploy completes
  (downloading → ... → rebooting), device reboots cleanly, `GET
  /recovery-project` → 200 after with `_source/project.zip` present and
  correctly nested `_source/ddf.zip` inside it. Full chain confirmed
  intact end-to-end on real hardware.
- The designer side is built too: `components/recover-project-dialog.tsx`
  (Startup Gate, gated behind `NEXT_PUBLIC_DEPLOY_ENABLED` like Deploy) —
  lists devices announcing over MQTT, fetches `GET /recovery-project`
  through a new server-side proxy (`app/api/recovery/fetch/route.ts`,
  same reasoning as `app/api/ddf/fetch`: a direct browser fetch to a
  device's own IP is CORS-blocked, found live building this), unwraps
  `_source/project.zip` from the retained export, and feeds the result
  into `project-editor.tsx`'s upload pipeline via a new
  `processUploadedProjectFile()` (extracted out of `uploadProject()` so
  both a real file-picker upload and a synthetic recovered `File` share
  one implementation). `e2e/recover-project.spec.ts` covers both the
  happy path and "this device has never had anything deployed to it".

**Unrelated real bug found + fixed while flashing the above (2026-08-15):**
booting with this session's changes present surfaced a pre-existing,
intermittent boot crash (2 of 3 boots) in `ProjectLoader::parseScreens()`
— unbounded `std::vector` growth via repeated `push_back()` with no
`reserve()`, an uncaught `std::bad_alloc` on the reallocation spike.
Nothing to do with nested provenance, but real and worth fixing while
hardware was attached. Fixed (`reserve()` at all three growth sites plus a
try/catch safety net) and given permanent HIL coverage: `hil/m5dial/
orchestrator.js --reboot-stress [N]`, re-uploads the same project N times
and requires each reboot back within a tight budget. Run for real against
the hardware that crashed: 5/5 clean, ~4.1s/boot (was 1/3 clean
pre-fix). Full writeup: [[project_m5dial_firmware_status]].

**Not built yet:**
- Fall 4 (OTA update vs. installed project): no OTA path exists in the
  firmware at all (no `esp_ota`/`Update.begin` anywhere in
  `screenbee-m5dial/src`) — pure forward design, nothing to retrofit.
- None of the above has been ported to `MqttEPaperDisplay2` (e-paper). The
  designer-side pieces (embedding, `schemaVersion`, Fall 1, the deploy
  dialog's object-type warning) already apply to *any* device via the
  shared designer code path, but the two firmware-side pieces
  (`peekProjectSchemaVersion`/`EXPORT_SCHEMA_VERSION`, the `_source/*`
  extraction filter) only exist in `screenbee-m5dial` so far.
- The startup gate's copy still claims "Its device must be available on
  this instance", which the code doesn't enforce even in the old fallback
  path — stale UI text, not fixed this session.

## Naming

Started as the "Matroska principle", renamed because Matroska is already a
container format and the reference is unwelcome. Alternatives considered:
*self-contained artifacts* (names the user-facing property), *nesting
dolls* (keeps the image, drops the loaded word), *ship the source with the
build* (the plain-language version, same idea as source maps or debug
symbols). "Nested provenance" was chosen for saying both what it does and
why.
