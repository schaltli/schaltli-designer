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
nesting removes. (Doesn't conflict with Fall 3's later live-DDF-splice
revision below - that swap happens only in the designer's own in-memory
copy at open time, on top of a still-whole, still-untouched device-side
retained file. The device keeps storing everything whole, exactly as
decided here.)

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

**Revised 2026-08-19 — this is the authoritative model; fully implemented
as of 2026-08-22. Everything in this section below "Three `schemaVersion`s,
one name" is retained historical reasoning, not the design.** The plan that
carried it out, including what was deleted and why, is
`docs/version-model-simplification-plan.md`.

The previous model carried five things (three independent `schemaVersion`
integers, a `ddfVersion`, and `device.id`) and was cut down after the
observation that its complexity *was* the failure mode: every real bug so
far came from a human having to remember to increment something, and
choosing which thing. See "The one that already happened" below for the
two instances.

| Thing | Semantics |
|---|---|
| **Systemstand** `major.minor` | The only version. Carried by project.json, the device export, the DDF, and declared by each firmware. `artifact.major > reader.major` → refuse cleanly, with a message. Otherwise accept. |
| **DDF hash**, shown as a word pair (`banana-ship`) | `sha256` of the DDF bytes as served. Identity, not version: differs → re-fetch. Never hand-maintained, so it cannot be forgotten. |
| **`device.id`** | Different hardware → hard block. Not a version relationship at all. |

Underlying rule for why it splits that way: **numbers where ordering
matters, words where only identity matters.** "Newer than me" is a real
decision for the Systemstand, so it is numeric. A DDF only ever needs
"same or not", so it needs no number — and a word pair helps by not
implying an order that never existed. (`ddfVersion` invited exactly that
false question — "is another device's 1.4 older than this one's 1.9?" —
which the old design had to answer with a caveat.)

Two consequences worth stating plainly, because they delete machinery:

- **A device never reads a DDF.** Verified in `screenbee-m5dial/src`: the
  only consumer of `ddf_zip.h` is `TestInterfaceServer::handleDdfZip()`,
  which *serves* it. A DDF is a device's self-description outward, not an
  input — the device is ground truth. So it compares nothing at runtime and
  needs neither a version nor a hash for its own operation.
- **Restore is already correct** (`cbe471c`): the designer splices the
  device's currently-served DDF into a recovered project. No frozen-copy
  reconciliation, no on-device correction pass.

### Upgrade scripts: minor never, major only where the data has no other source

**A major bump obligates a clean refusal, not a migration.** Providing an
upgrade path is a per-case decision, and in most cases the answer is no.
The criterion is one question:

> **Do these data exist only in this artifact, or is there another source?**

| Old artifact | Other source? | Answer |
|---|---|---|
| Project file in the designer | none — this is the user's actual work | **Migrate** |
| DDF | hand-authored source in the firmware repo, two of them, both ours | Edit the source. No script. |
| Device export | the project it was built from | Redeploy |
| Project installed on a device | same | Redeploy (Fall 4) |

Worked example (the obvious next change of this shape): moving
`device.json`'s `screen.width`/`height` into the adornment SVG. The data is
**already duplicated** — the e-paper DDF declares `400×300` in
`device.json` *and* carries `<rect id="screen" … width="400" height="300">`
— so this is the same "read it off the SVG instead of hand-transcribing it"
move already applied to `adornment.drawingArea` and `hardwareButtons[]`,
and the destination already holds the values. It is a major (it changes
what an existing field means and where it lives). It needs **no upgrade
script**: there are two DDFs, both hand-maintained in repos we control, so
writing and testing a migration would cost more than the change itself and
would run exactly twice. Edit both sources, bump major, done.

This is also why the refusal has to be clean and well-worded: it is not
half a solution, it *is* the solution in most cases. "This DDF is
generation 2, I understand 1" plus a human editing the source is a
complete outcome.

**Minor bumps never get a migration**, in any case. Minor means additive —
a new optional field, or a new value in a list that already has a
skip-or-default convention — and both directions are handled by
conventions that already exist and are already tested. The useful
inversion: **if a change appears to need a migration, that is the proof it
is a major, not a minor.** That makes the migration question the
enforcement mechanism for the classification rule rather than another
judgement call.

Where a migration *is* written (realistically: project files only), it is
forward-only, applied on load so the in-memory model is always
current-generation, and written back on the next ordinary save so old files
decay out by themselves. The generation fixture corpus already planned for
the version check is also its test, so it costs no new test machinery.

**Do not build a migration framework before there is a migration to run.**
There has been roughly one major-shaped change in this project's life
(DDF 1.7). Write the rule down now; write the first migration when the
first major actually happens. Note also that the `migrate.js` currently
shipped inside `public/ddf/mqtt-epaper-display.ddf.zip` is *not* a
migration hook — it is a one-off authoring script (button-id rename,
`inkscape:label` insertion) that leaked into the distributed artifact and
should be deleted; it is hashed as part of the DDF.

### What counts as a major bump

Applies to the Systemstand's `major`. (Written while the field was still
called `schemaVersion`; the test is unchanged by the rename.) Sharpened
2026-08-19: the original wording drew the line at *"a question of whether
the bytes can be decoded at all, not what they mean once decoded."* That's
too narrow, and following it literally would let real breaks ship
unversioned — the most dangerous changes to this format decode perfectly
and simply mean something else. The test to apply instead:

> **Would a reader on the other version silently produce something wrong,
> rather than either failing cleanly or degrading gracefully?**

If yes, bump. "Silently" is the operative word — a clean rejection is
fine (that's what the version field is *for*), and a graceful degrade is
fine (a skipped unknown object type, a defaulted missing field). What's
not fine is a file that parses, renders, and lies.

Under the current model the counterpart question — "does a DDF content
change need a bump?" — no longer exists: a DDF is identified by its hash,
which changes by itself. The reasoning that established why that is safe
(nothing in the rendering model is derived, clipping rather than reflow is
the only response to "doesn't fit," unknown object types are skipped and
logged) is kept below as background.

Three concrete examples that would each bump (none of them exist today —
they're calibration, not a plan):

1. **Nested `children` coordinates flip from parent-relative to
   screen-absolute.** Today a `tab-control` at `x:10,y:10` holds a `panel`
   at `0,0` holding a `box` at `0,0`. Flip the convention and no field
   name and no type changes — every `x` stays a `number`. An old reader
   parses it without complaint and draws every nested object in the wrong
   place. Hits `PROJECT_SCHEMA_VERSION` and `EXPORT_SCHEMA_VERSION` both,
   since the object hierarchy is shared.
2. **`screenWidth`/`screenHeight` switch from post-rotation to native
   panel dimensions.** They're currently already-swapped values, with
   `rotation` alongside so the device can match its own orientation (see
   the comment at that field in `buildDeviceProjectZip()`). Move the swap
   to the device and a 240x320 project becomes a 320x240 project for old
   firmware — two integers, same types, silently 90° wrong, with no
   fallback that could notice. Hits `EXPORT_SCHEMA_VERSION`.
3. **`screens[].objects[]` moves out of `project.json` into per-screen
   files** (`screens[].objectsFile: "screens/3.json"`), or `assets` turns
   from an array into a keyed map. An old reader finds `undefined` where
   it expected a list and renders silently empty screens. This is the only
   one of the three that matches the original "can't decode the bytes"
   wording — which is exactly why that wording had to be widened.

And, to keep the contrast explicit — none of these bump anything: a new
object type (`CheckBox`), a new optional field (`platform?`), a device
gaining or losing a font (`ddfVersion`), or a device getting a physically
different display (a new `device.id`, not a version relationship at all).

#### The one that already happened: DDF 1.7 (and 1.9)

Not hypothetical, and the reason the criterion above got sharpened.
`docs/device-contract.md` records M5 Dial DDF **1.7** (2026-08-16) as
replacing `device.json`'s `adornment.drawingArea` with the
`<rect id="screen">` convention, and **1.9** as removing `hardwareButtons[]`
from `device.json` altogether. Both shipped as *`ddfVersion`* bumps. Both
were changes to the **DDF file format**, not to any device capability, and
by the test above both were `schemaVersion` bumps.

What an old designer (pre-2026-08-16) does with a 1.7+ DDF, from the code
as it stood at `58e79ab^`: `manifest.adornment.drawingArea` reads
`undefined`, and `canvas.tsx` had that field typed optional with guards
(`if (!adornmentSvgDoc || !adornmentDrawingArea)`, and
`if (showAdornment && adornmentImage && adornmentDrawingArea)`). So there
is no exception and no message — the adornment is simply never drawn.
Bezel gone, off-screen covers gone, and hardware-button hit-testing gone
with them, on a canvas that otherwise looks like it's working. 1.9's
`hardwareButtons[]` removal has the identical shape. This is the textbook
form of "parses, renders, and lies."

The *opposite* direction is fine and worth noting as the contrast: a
current designer given a pre-1.7 DDF fails cleanly and usefully —
`extractScreenRect()` throws *"Adornment SVG is missing a
`<rect id="screen">` … draw one at the screen's exact position and size."*
Only old-reads-new is silent.

**Decided 2026-08-19: the numbers are not being changed retroactively.**
A bump now would not fix this case anyway — the pre-2026-08-16 designer
had no `schemaVersion` concept at all (no `SUPPORTED_DDF_SCHEMA_VERSION`
anywhere in `lib/device-description.ts` at `58e79ab^`), so it would ignore
a `schemaVersion: 2` and swallow the adornment exactly as before. Both
shipped DDFs therefore stay on the implicit `schemaVersion` 1 (M5 Dial
`ddfVersion 1.9`, e-paper `1.5`; neither carries the field), and
`SUPPORTED_DDF_SCHEMA_VERSION` stays 1. It has been survivable only
because designer and DDF source have so far always moved together — the
exposure is real the moment a device announces its own DDF over MQTT (the
M5 Dial does) to an older designer instance.

**How to apply:** the next DDF-format change of this kind bumps the DDF's
`schemaVersion`, not just `ddfVersion`. Worth a look at the silent guards
in `canvas.tsx` at that point too — a missing adornment or screen rect
should be visible, not a quietly blank frame.

### Three `schemaVersion`s, one name

> **Superseded 2026-08-19 by the model at the top of this section** — the
> three collapse into one Systemstand. Kept because it is the record of
> *why*: three same-named, independently-bumped integers is the state that
> produced the misclassification below, and the plan's first code step is
> to merge them.

Written down 2026-08-19 after this section's "two version fields" wording
turned out to hide a real trap. `schemaVersion` is an *axis*, and three
separate files each carry their own number on it. They are independent —
bumping one does not imply bumping the others — and the only thing they
share is the question they answer ("can this file's shape be parsed?"):

| File | Constant | Read by |
|---|---|---|
| Editable `project.json` (Download Project) | `PROJECT_SCHEMA_VERSION` (`lib/project-zip.ts`) | `project-editor.tsx`'s `validateProjectSchemaVersion()` |
| Device export `project.json` (deploy/export) | `EXPORT_SCHEMA_VERSION` (`lib/project-zip.ts`) | firmware — `ProjectInstaller::peekProjectSchemaVersion()` vs. `DeviceInfo.h`'s `EXPORT_SCHEMA_VERSION` |
| DDF `device.json` | `lib/device-description.ts` | designer, on DDF load |

All three currently sit at 1. The export one was an inline magic number
until 2026-08-19 while the editable one already had a named constant —
the asymmetry made it easy to bump the wrong one; both are named
constants now. A device's `ddfVersion` is *not* on this axis at all.

**Also removed 2026-08-19:** a write-only `version: "1.0.0"` field that
`buildEditableProjectZip()`, `buildDeviceProjectZip()` and
`exportAndroidProject()` each wrote next to `schemaVersion`. Nothing read
it — not the designer, not `screenbee-m5dial`, not `MqttEPaperDisplay2`,
not `ScreensmithAndroid` — and sitting beside the real format-version
field it read like a fourth one. Guarded now by
`e2e/project-download.spec.ts` and `e2e/deploy-dialog.spec.ts`.
(`lib/export-utils.ts`'s `ESP32Export.version` is untouched: that whole
`ExportManager` class is dead code with no call site outside its own
file — a separate cleanup, not this one.)

Four places two DDF/project versions can meet, worked out separately:
opening a project (Fall 1), deploying to a physical device (Fall 2),
recovering a lost project from a device (Fall 3), and a device updating
its own firmware while a project is already installed (Fall 4).

### The four Fälle — where each one ended up

Worked out separately in 2026-08-15's session, when there were five
version-ish fields to reconcile. Under the model at the top of this section
they collapse to the following, and the long-form prose that argued each
one out was deleted on 2026-08-22 (the version-model plan's last step) once
the code it described had shipped. Git history has it if the reasoning is
ever wanted again.

**Fall 1 — project vs. this editor instance, at open time.** No policy
needed, and never did: a project opens against its own embedded
`_source/ddf.zip`, so there is no second DDF to reconcile with. Live
(`e2e/ddf-auto-discovery.spec.ts`). A project saved before nested
provenance shipped has no embedded copy and still falls back to resolving
against this instance's `public/ddf/`.

**Fall 2 — project vs. the physical device, at deploy time.** Three guards,
in order:

1. **Systemstand major → clean refusal, before anything is parsed.** The
   device peeks the incoming zip's generation before touching `/PROJECT`
   (`ProjectInstaller::peekProjectSystemGenerationMajor()`, in
   `DeployManager.cpp` ahead of the `device.id` check below), and the
   deploy dialog checks the device's announced `systemGeneration` from its
   `hello` *before* uploading, so an incompatible pairing is refused in the
   dialog rather than after the download, where the only evidence would be
   a serial log nobody is watching.
2. **`device.id` mismatch → hard block, unconditional.** Different physical
   hardware is not a version relationship at all, so no number gates it.
   Changing a project's target device stays a deliberate step in Project
   Settings, with manual rework expected.
3. **Object-type diff → warning, never a block.** The device renders what
   it has: an unknown object type is skipped with a log line, a font swap
   renders differently rather than incorrectly. The one check worth having
   is the designer diffing the project's actually-placed object types
   against the device's `supportedObjectTypes` and saying so before the
   deploy, instead of the user discovering a missing widget by staring at
   the device. It should rarely fire — `toolbar.tsx` already disables tools
   outside that list and `canvas.tsx` flags placed objects outside it — so
   it fires exactly when that data was stale, which is the drift this
   document exists to fix.

There is no fourth step any more. The old one refreshed the project's
stored `ddfVersion` after a successful deploy; a DDF is identified by the
hash of its bytes now, and nothing stores a version to keep honest.

**Fall 3 — recovering a lost project from a device.** Built and shipped
(`cbe471c`). The designer splices the device's currently-served DDF into
the recovered project, so there is no frozen-copy reconciliation and no
on-device correction pass.

**Fall 4 — a device updating its own firmware, project already installed.**
Still the one case no other guard covers, because firmware can change
underneath an installed project with no deploy, and therefore no designer,
involved at all. **No OTA path exists in any firmware yet** — there is no
`esp_ota`/`Update.begin` anywhere — so this is calibration for when one is
built, not a description of anything running.

Only the Systemstand-major case survives: new firmware boots and cannot
read the installed `/PROJECT/project.json`.

1. **Accept the update; do not roll back.** Automatic rollback was
   considered and rejected — see "Rejected, and why" below.
2. The device enters the same safe state Fall 3 uses for a missing recovery
   copy: a clear "project incompatible with this firmware, please redeploy"
   message, with nothing rendered that could be mistaken for correct.
   Nothing is lost — the retained export zip still holds the last-known-good
   project.
3. **A human closes the loop, not the device.** Load the project into a
   current designer, which keeps the ability to read older project
   generations, and redeploy.
4. **Escape hatch:** the device can be told, deliberately and on request,
   to fetch a specific *older* firmware over the same OTA mechanism —
   restoring the last firmware that could read the installed project and
   buying time. Not automatic, not a default.

The other half of this case is gone. It described the device correcting its
own installed project after an OTA whose `ddfVersion` no longer matched -
overwriting the embedded DDF reference, then best-effort-swapping font
references that no longer resolved. Deleted 2026-08-22, unimplemented, and
now unbuildable as written: a DDF has no version to compare, the device
never reads one, and the drift it was built to catch (a reflash with a
cosmetic adornment change leaving the installed project pointing at old
artwork) is caught instead by the hash changing, which makes the designer
re-fetch on its own. Worth remembering as the reason a device-side
correction was ever thought necessary: **the designer has no visibility
into an autonomous OTA event at all**, so anything that must be corrected
at that moment has to be corrected on the device or not at all. That
constraint still holds for whatever OTA eventually needs.


## Why `ddfVersion` content changes turned out not to need a migration mechanism

> **Historical background as of 2026-08-19, no longer live design.**
> `ddfVersion` is being removed entirely (a DDF is identified by its
> content hash), so the question this section answers cannot arise. It is
> kept for two reasons: it is the argument that killed the first,
> over-engineered draft, and its central finding — that the rendering model
> derives nothing, so content changes degrade rather than break — is what
> makes minor-level forward compatibility real rather than aspirational
> under the new model too.

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
  even apply it itself. **Note (2026-08-19):** this one is listed here
  only to show it needs no *`ddfVersion`* migration chain — it isn't a
  device-capability change at all. As a change to the project/export file
  format it *does* bump `schemaVersion`, and it's example 1 under "What
  counts as a `schemaVersion` bump" above. The deterministic formula is
  what the migration on that bump would do, not a reason to skip the bump.
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
construction. `schemaVersion` (the file format's own shape and the meaning
of its fields, Fall 2 step 1 and Fall 4) remains the one axis where a
real, unresolvable break is possible — because that's where a change can
make a file parse cleanly and still be wrong, with no fallback able to
notice. See "What counts as a `schemaVersion` bump" above for the test
and worked examples; note in particular that a *reinterpretation* of an
existing field counts, even though it decodes fine.

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

> **A snapshot of 2026-08-15, kept as written.** It predates the version
> rework, so it still says `schemaVersion` where the system now says
> Systemstand, and `ddfVersion` where a DDF is now identified by hash. The
> current state is the model at the top of this document plus "The four
> Fälle — where each one ended up"; the M5 Dial it reports on was retired
> on 2026-08-18 and the board carrying this work forward is the Waveshare
> Knob-1.8.

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
