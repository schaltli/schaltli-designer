# Preview performance (#58)

Idea refined with the user on 2026-10-08/09, out of tester Arno's "Reaktionszeit
ca. 15 Sek" in the live preview. Measured in the van and profiled locally the
same night; the numbers are in #58 and below.

Status: spec agreed 2026-10-09 (section «Spec» at the end). Plan:
tasks/preview-performance-plan.md. The release waits for it.

## Problem Statement

How might a click in the live preview stay under 0.3 s however large the
project, however many values arrive, and on a browser as slow as a tablet's?

## What the profile says

The large test project (4 screens, ~230 objects, 30 values/s), local `next dev`,
CPU unthrottled, 6 s recorded:

| Where the time goes | 30 values/s | clicks only |
|---|---|---|
| browser busy | ~650 ms | ~350 ms |
| `drawObject` (canvas.tsx) | 361 ms | 214 ms |
| of it the Switch's pills (`paintPills` → `pillPixelBands` → `insidePillBand`) | 317 ms | 185 ms |
| of it the sliders (`renderLevelIndicator`) | 81 ms | 57 ms |
| of it text (`drawText`, `drawChar`) | 28 ms | 18 ms |
| React rendering components | ~100 ms | ~50 ms |
| `resizeCanvas` (canvas.tsx), around a second full draw | 202 ms | 135 ms |

Three findings:

1. **The pills are the cost.** `pillPixelBands` (lib/pill-raster.ts) tests 16
   sub-samples per pixel against every band, for every pill, on every draw,
   though the shape has not changed.
2. **The canvas is drawn twice.** The resize effect depends on `draw`, whose
   identity changes on every editor render, so it reallocates the canvas
   buffer and draws again beside the regular draw effect.
3. **React is the small part.** Moving the live values out of the editor's
   state (a store of their own) would save little; it is not doing.

## Recommended Direction

**Cache the pills' coverage, not their colours.** What is expensive is the
geometry: how many of a pixel's 16 sub-samples each band claims. That depends
only on the bands relative to their bounding box - positions, sizes, radii,
tips, order - never on colour, background, glow or gradient. So the cache
stores, per pixel, one count (0..16) per band, keyed by the bands translated
to the box's origin. The colouring pass (`softPills`) then runs as today on
the cached counts: the pixels come out identical, so the match with the
firmware and Android (`PillRaster.h`, `PillRaster.kt`) is untouched.

Checked against the alternative of caching the finished image per colour:

- **Coverage cache (chosen).** Hits whenever the shape repeats - every Switch
  of the same size, every state of it, both themes. Glow (mixed into what
  lies under the control) and gradients (`colourAt`) keep working, because
  colour is applied after the cache. A single alpha per pixel would not be
  enough: a Switch is several bands sharing pixels by priority (track, knob,
  outline holes), so it is one count per band - still small, a byte or a
  nibble each.
- **Finished-image cache.** Faster on a hit (one `drawImage`), but the key
  has to carry every colour, the background, the theme variant and the
  colour depth; glow reads the pixels underneath and a gradient is a
  function, so neither can be keyed at all. More misses, more memory, and
  correctness depends on not forgetting a key. Worth adding on top later
  only if the colouring pass shows up in a new profile.

Beside the cache, two cheap fixes: the resize effect runs on a real size
change only (a `ResizeObserver`, not `draw` in its dependencies), and incoming
MQTT values are collected and applied at most once per frame instead of once
per message (`project-editor.tsx`, `startLive`).

## Key Assumptions to Validate

- [ ] The coverage cache removes most of the 317 ms - a profile of the same
      project after the change, same script.
- [ ] Shapes repeat enough for the cache to hit - count hits and misses in
      the large project and in a real one (blockneu, Arno's once he sends it).
- [ ] The pixels stay identical - the existing pill and arc golden tests
      (`app/test-render`, the HIL conformance specimen) pass unchanged.
- [ ] 6× throttling stands for a tablet - one run of the e2e test on a real
      tablet's browser, or at 10× throttling.

## MVP Scope

For the release:

- Coverage cache in `paintPills` (24-bit path; the hard path below 24 bit
  draws whole pixels with `fillRoundRect` and is not slow).
- Resize effect only on a size change.
- Live values applied once per frame.
- An e2e test: the large project, CPU throttled 6×, 30 values/s on the local
  broker, click → paint under 0.3 s; built from the measuring script of
  2026-10-08 (`hil`-free, local broker only).

After it, measured again: if a tablet still lags, the next candidates are a
finished-image cache on top and redrawing only the objects whose topic
changed.

## Not Doing (and Why)

- **A store of its own for live values** - React is ~15 % of the time; the
  rewrite of `askedValues` it drags along is not worth it.
- **Redrawing only changed objects (dirty rects)** - large and risky in a
  4540-line canvas with overlaps, glow and tables; the cache may make it
  unnecessary. Decided after the next profile.
- **A fixed preview frame rate** - the per-frame batching gives the same
  bound without making a single value look late.
- **Changing the firmware or Android** - their rasterizers are not the
  problem here; the cache is the designer's alone.

## Open Questions

- Cache size and eviction: a simple LRU of a few hundred entries, or cleared
  when the project changes?
- Does the editor (not the preview) gain enough to say so in the release
  notes?

## Spec

Agreed 2026-10-09: the MVP above, for the next official release.

### Decisions

1. **Coverage cache in `lib/pill-raster.ts`.** `pillCoverage(bands, bounds)`
   returns the per-pixel counts of every band over the bounds - a
   `Uint8Array` of `w * h * bands.length`, the same numbers
   `pillPixelBands` returns pixel by pixel. Cached by a key made of the
   bands relative to the bounds' origin (x, y, w, h, rLow, rHigh,
   vertical, tip, in order) and the bounds' size. A sub-sample's position
   inside its pixel is the same everywhere, so a shape moved by whole
   pixels has the same counts; the key cannot alias two shapes.
2. **`softPills` reads the counts from the cache** and colours exactly as
   today. `pillPixelBands` stays, for `app/test-render` and as the
   definition the cache is checked against.
3. **The cache is bounded:** at most 512 entries, the oldest dropped first
   (a `Map` in insertion order, an entry re-inserted on a hit). A screen
   holds a few dozen distinct shapes; 512 is many screens and a few MB at
   worst.
4. **The canvas is resized on a size change only.** A `ResizeObserver` on
   the container sets the canvas size and draws; it no longer depends on
   `draw`. One effect draws whenever `draw` changes, replacing the resize
   effect's accidental redraw and the hand-kept dependency list.
5. **Live values once per frame.** `startLive`'s message handler writes
   into a ref; one `requestAnimationFrame` per burst moves what arrived into
   `liveValues` and `askedValues` in one state update each.
6. **The test:** `e2e/preview-performance.spec.ts` - four screens, ~230
   objects, 30 values a second on the local broker, a responder answering
   the Switch as the bridge does, CPU throttled 10x (about a tablet), three
   clicks on a Switch, each drawn within 1 s. Before the change 1.7 s, after
   it 0.6 s (`next dev`).

7. **Values for screens out of view without a redraw** (added 2026-10-09,
   after the profile): `previewHeardTopics` names what the view reads; any
   other value reaches `liveValues` within 500 ms without a redraw of its
   own, and a change of view takes in everything at once. Missing a reader
   makes a value late by at most that, never wrong.
8. **A hover draws once:** the canvas's separate hover effect is gone.

### Not in this spec

Everything under «Not Doing», and the hard path below 24 bit, which never
rasterizes.
