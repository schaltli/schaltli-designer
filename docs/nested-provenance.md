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

**The backup is best-effort and must never fail a deploy.** If the source
copy cannot be written, log it and carry on; the project still installs. A
backup that can break the device's actual purpose is the worse trade.

## Open question

A project carrying DDF v1.3, opened on an instance holding v1.6: update
silently (today's behavior, just better informed) or ask first? Auto-update
can enable object types the user's own firmware doesn't render yet, if that
firmware is older than this instance's DDF. Unresolved.

## Rejected, and why

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

- The project file carries a denormalized copy of the DDF, not the DDF.
- Loading a project whose device is missing works and warns — but the
  startup gate's copy still claims "Its device must be available on this
  instance", which the code stopped enforcing. That text is stale.
- No project carries a `ddfVersion`.
- Exports embed nothing of the project file; a deployed device cannot hand
  back anything editable.
- The download path and the export path are both DEFLATE-compressed as of
  2026-08-14.

## Naming

Started as the "Matroska principle", renamed because Matroska is already a
container format and the reference is unwelcome. Alternatives considered:
*self-contained artifacts* (names the user-facing property), *nesting
dolls* (keeps the image, drops the loaded word), *ship the source with the
build* (the plain-language version, same idea as source maps or debug
symbols). "Nested provenance" was chosen for saying both what it does and
why.
