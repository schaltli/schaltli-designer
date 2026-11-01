# 4-bit fonts (`4bit-fonts`): tasks

Plan: `tasks/4bit-fonts-plan.md`. Spec: `docs/2026-11-01-4bit-fonts.md`.
Firmware work is in `schaltli-firmware` (next to this repo). Boards: 4" on
COM10, 4.3B on COM3, Knob on COM4 (back on the bench 2026-11-01).

## Phase 0: contract and fonts

## Task 1: Contract

**Description:** Write `bpp`, `replaces`, the 4-bit BDF form, the blend and
cap-height sizing into the device contract.

**Acceptance criteria:**
- [x] `docs/device-contract.md` §1 («Font depth»): `fonts[].bpp`, `fonts[].replaces`, `BITS_PER_PIXEL 4` rows one hex digit per pixel
- [x] The blend written out with its integer arithmetic and 14 worked values (`lib/fixtures/blend565-cases.json`), pinned by `e2e/blend565-cases.spec.ts`
- [x] Cap-height sizing for 4-bit typographies (`0.69 × line`, today's Helvetica ratio - measured: Roboto and Inter have 0.60, so by line height every text would have shrunk), line height for 1-bit

**Verification:** `npm run test:quick` green (docs only, nothing may break)
- [x] Run twice on 2026-11-01. Host steps all green, the new spec among the e2e; ws4 lane all green. Knob and 4.3B red for reasons outside this task: run 1 started right after the broker, before either board had announced itself; in run 1 `4v3b-internal-heap` left its large project on the 4.3B (see «Found on the way»), so in run 2 the 4.3B had no WiFi and its lane skipped; run 2's `knob-screen-graph` timed out once (all else on the knob green).

**Dependencies:** None
**Files likely touched:** `docs/device-contract.md`, new `lib/fixtures/blend565-cases.json`
**Estimated scope:** S

### Found on the way (T1)

- `hil/internal-heap.js --own-device-id` installs 40 copies of the smoke
  test's screens on the 4.3B and leaves them there. After the next restart
  the 4.3B preloads all 240 screens and WiFi cannot start
  (`esp_wifi_init 257`, ESP_ERR_NO_MEM, every 15 s) - so no test can send it
  another project. Repaired 2026-11-01 by erasing its LittleFS over USB
  (backup kept). Fixed the same day (user): the test now puts the smoke
  test's own screens back, and when the board has lost its network - the
  4.3B does, the moment it restarts onto the large project - erases its
  LittleFS over USB (`--usb-port`, COM3 from test-all), after which it is on
  its network again with its built-in fixture. Proved on the 4.3B: FAIL as
  before (the firmware issue it exists for, van 2026-10-30), board reachable
  after. The firmware issue itself is not part of this plan.

## Task 2: Font build tool

**Description:** `tools/ttf-to-bdf.py` gains `--bpp 4` (coverage quantised
`(v * 15 + 127) // 255`, variable-font axes); Roboto, Inter, Roboto Condensed
go to `tools/fonts-src/` with their licences.

**Acceptance criteria:**
- [x] A 4-bit BDF per requested size, glyph set = the family's cmap ∩ today's 753 (cmap read from the TTF in the tool, no new dependency; a mapped glyph that draws nothing - U+200B - stays). Roboto has 468 of them, Inter 738
- [x] Output reproducible byte for byte (same input, same file)
- [x] OFL texts in `tools/fonts-src/{roboto,roboto-condensed,inter}/` (google/fonts, ofl/)
- [x] `--by cap` picks the size by CAP_HEIGHT (OS/2 sCapHeight at that size), written as a property; `--axes` for variable fonts; the 1-bit path byte for byte as before

**Verification:** run twice, `diff` empty; spot check one glyph against the pre-study renders (`fontlab`)
- [x] Permanent: `tools/ttf-to-bdf-check/run.js` in schaltli-firmware, a host check of test-all (`fw-ttf-to-bdf`): DSEG7 1-bit byte-identical to the shipped seg7-61.bdf, Roboto 4-bit twice identical, well formed, CAP_HEIGHT, glyph set
- [x] Spot check: Roboto, Inter, Roboto Condensed Bold at cap 14 drawn from the generated BDFs - clean
- [x] `npm run test:quick` (with the internal-heap fix): all green but `4v3b-internal-heap` (FAIL as intended, and now it brings the 4.3B back over USB - seen in the run) and 4.3B `conformance` 60/64: four «before any value» cases timed out waiting for the board to apply cleared values; run alone right after, 64/64. A flake, noted, not chased. `fw-ttf-to-bdf` joins the host checks from the next run on

**Firmware commit:** `4bit-fonts` branch of schaltli-firmware
**Dependencies:** T1
**Files likely touched:** `schaltli-firmware/tools/ttf-to-bdf.py`, `tools/fonts-src/{roboto,inter,roboto-condensed}/`
**Estimated scope:** S

## Phase 1: drawing

## Task 3: Firmware draws 4-bit glyphs

**Description:** `BdfFont` reads `BITS_PER_PIXEL`, stores 4-bit rows (two
pixels per byte, PSRAM), and `drawGlyph()` blends coverage 1-14 onto the
canvas pixel, writes 15 straight. 1-bit path untouched.

**Acceptance criteria:**
- [x] Native tests: 4-bit parse, blend against `blend565-cases.json` - `test/test_glyph_pixels` (5 cases) on the pure helpers moved out of `BdfFont.cpp` into `src/project/GlyphPixels.h`; the table embedded as a raw string in `blend565_cases.h`, and the designer's `e2e/blend565-cases.spec.ts` checks that copy equals its own
- [x] Every existing fixture on 4.3B and 4" still 0 px (and the Knob's): `test:quick` on the new firmware - fw-native with the new test, every 0-px fixture of the three boards green; red in that run were knob-live-values (fetch failed), ws4-charts-draw (a second pixel change between two snapshots), ws4-charts-actions (no description within 30 s), 4.3B conformance 61/64 (three «before any value» timeouts) and 4v3b-internal-heap (as intended; it brought the board back over USB). Each of the four run alone right after: PASS, 0 px, conformance 64/64. The run took 20 min against 11 - load, not pixels

Done: `BdfFont` reads `BITS_PER_PIXEL 4`; the storage was already a hex digit per 4 bits, so nothing new in PSRAM. `drawCoverageRow()` writes coverage 15 as runs and mixes 1-14 into `getPixel()` under it; pixel i lands at ox + 1 + i, the 1-bit path's one-to-the-right. Firmware built for all four boards and installed on 4.3B, 4" and Knob over WiFi (`hil/firmware-upload.js --install-checkout`, all four checks passed).

**Verification:** `pio test -e native`; `npm run test:quick` (4.3B and 4" lanes)
**Dependencies:** T1
**Files likely touched:** `src/project/BdfFont.{h,cpp}`, `src/project/LevelGlow.h`, `test/test_bdf_font/`
**Estimated scope:** M

## Task 4: Designer draws 4-bit glyphs

**Description:** `lib/bdffont.ts` parses 4-bit fonts and draws them through
`blendCoverage565`, reading what lies under from the canvas.

**Acceptance criteria:**
- [x] Unit tests: 4-bit parse, blend against `blend565-cases.json` - `e2e/bdffont-4bit.spec.ts`: `blendCoverage565` (new `lib/blend565.ts`) gives all 14 values; a 4-bit glyph drawn onto a stand-in canvas lands at ox + 1 + i, full coverage in the ink, an edge pixel mixed in RGB565 into what lies under it at 1:1, at the coverage's opacity when zoomed; a 1-bit glyph as before
- [x] 1-bit drawing unchanged (existing e2e renders identical) - `test:quick`: all 214 pixel comparisons of the three boards 0 px, the e2e suite green

**Verification:** `npm run test:quick`
- [x] Run 2026-11-01: green but `4v3b-internal-heap` (as intended) and 4.3B `conformance` 62/64 - the «before any value» timeouts again, the third full run in a row; alone it passes 64/64. A recurring flake of the full run, not of this work; to look at separately

**Dependencies:** T1
**Files likely touched:** `lib/bdffont.ts`, new `lib/blend565.ts`, tests
**Estimated scope:** M

### Checkpoint: one 4-bit font in a test DDF, 4.3B HIL 0 px against the designer

Moved to the start of T5: a project takes its fonts from the board's DDF, so
the first 4-bit font in a board's DDF is that task's first step anyway.

## Task 4b: Font data out of projects, DDF out of the recovery copy

Added 2026-11-01 (spec decisions 11 and 12) after T5's first step - the
4-bit fonts in the colour boards' DDFs - broke test:quick: projects over
10 MB, installs of 1 MB, boards not back in 180 s.

**Acceptance criteria:**
- [x] Saved, drafted and zipped, a project leaves out the data of every font its embedded DDF holds byte for byte; opened (server, draft, version), it gets it back - `lib/project-font-data.ts`, `e2e/project-font-data.spec.ts` (6 cases)
- [x] A deploy to a board that announced the project's ddfHash carries no `_source/ddf.zip` and no DDF fonts in its recovery copy; a font of the project's own still goes along - `e2e/recovery-copy-size.spec.ts`; `e2e/recover-project.spec.ts` still green
- [x] The HIL's harness resolves a fixture's DDF as a recovery does and builds as for its own board, so no HIL script changes
- [x] `npm run test:quick` with the 4-bit DDFs on the boards (T5 step A, not committed yet): e2e 2063/2063 green, Knob and 4" lanes all green, installs 28-31 KB instead of ~1 MB, no request over 10 MB. Also needed: `e2e/ddf-seed.ts` zipped its seeded DDF stored, not deflated - 8 MB with 4-bit fonts, every project made from it over 10 MB; and `e2e/project-download.spec.ts` now asks that each font's data travels once (fonts/ or the embedded DDF) instead of that a fonts/ folder exists
- [ ] Open on the 4.3B with the 4-bit firmware (T5 step A): conformance 66/68, the two «snapshot failed after 3 attempts: terminated» and the run 39 min instead of ~5; and `4v3b-internal-heap` found a project for another device **installed** - `peekProjectDeviceId()` returns "" for "could not read" as well as for "no deviceId", and "" is let through (fail-open). At rest the board has 171 KB internal heap, 3.6 MB PSRAM

**Dependencies:** T4; before the rest of T5

## Phase 2: switching

## Task 5: The colour boards' DDFs

**Description:** `build-typography-fonts.py` writes the three 4-bit
typographies for 4", 4.3B and Knob (sizes by cap height, one either side,
regular and bold), with `bpp: 4` and `replaces` generated from typography,
style, weight and nearest size. The old BDFs stay (plan: one release).

**Acceptance criteria:**
- [ ] Every old font id on the three boards appears in exactly one `replaces`
- [ ] Firmware of each board fits its app slot with ≥ 10 % headroom
- [ ] PaperS3's DDF byte-identical to before

**Verification:** `pio run` for the three envs (size printed); script check of the `replaces` coverage; `npm run test:quick`
**Dependencies:** T2, T3
**Files likely touched:** `tools/build-typography-fonts.py`, `ddf-source{,-waveshare4,-waveshare4v3b}/device.json` + `fonts/`, generated `ddf_zip.h`
**Estimated scope:** M

## Task 6: Cap-height sizing in the designer

**Description:** `fontFor` picks 4-bit faces by cap height against the
style's target; 1-bit as before.

**Acceptance criteria:**
- [ ] Unit test: Roboto and Inter Label within 1 px cap height of each other
- [ ] PaperS3 project font choices unchanged

**Verification:** `npm run test:quick`
**Dependencies:** T4, T5
**Files likely touched:** `lib/size-scale.ts`, its tests
**Estimated scope:** S

## Task 7: Migration on open

**Description:** A project opened for a device whose fonts `replace` its
font ids gets them rewritten (`fontId`, `valueFontId`, every font field),
is marked changed, and lists texts that no longer fit.

**Acceptance criteria:**
- [ ] e2e: a 1-bit project on the 4.3B opens with only new ids, unsaved-changes marker set
- [ ] e2e: an overflowing text is listed by name
- [ ] Opening twice changes nothing more

**Verification:** new `e2e/4bit-font-migration.spec.ts`; `npm run test:quick`
**Dependencies:** T5, T6
**Files likely touched:** new `lib/font-migration.ts`, the project-open path, `e2e/`
**Estimated scope:** M

## Task 8: Firmware resolves old ids

**Description:** `ColorScreenRenderer::fontFor` falls back through
`replaces` when a project names a font the DDF only lists as replaced.

**Acceptance criteria:**
- [ ] HIL: old project uploaded, firmware updated, every text drawn

**Verification:** fixture in `hil/waveshare/fixtures/` (old project + new firmware); `npm run test:quick`
**Dependencies:** T5
**Files likely touched:** `src/project/ColorScreenRenderer.cpp`, `src/project/DdfFontStore.*`, HIL fixture
**Estimated scope:** S

## Phase 3: proof and polish

## Task 9: Pixel-parity fixtures

**Description:** Fixtures with 4-bit text in every typography, style and
weight, light and dark, over a gradient, a chart and an image, diacritics and
`€ — …`; conformance specimens for the same.

**Acceptance criteria:**
- [ ] 4.3B and 4" lanes 0 px on all of them; Knob lane skips with its warning

**Verification:** `npm run test:all`
**Dependencies:** T5-T8
**Files likely touched:** `hil/waveshare/fixtures/`, `hil/conformance/specimens.js`
**Estimated scope:** M

## Task 10: Starter and demo projects

**Description:** Migrate `deploy/demo/camper-project.ts` and the starter
project; fix every overflow T7 lists.

**Acceptance criteria:**
- [ ] No overflowing text in either; their e2e specs green

**Verification:** `npm run test:quick`
**Dependencies:** T7
**Files likely touched:** `deploy/demo/camper-project.ts`, starter project, their specs
**Estimated scope:** S

## Task 11: Redraw time

**Description:** Measure a full redraw of a text-heavy screen on the 4.3B
before and after (HIL timing).

**Acceptance criteria:**
- [ ] At most 20 % slower; if not, optimise (blend only coverage 1-14, skip blank rows) and measure again

**Verification:** timing fixture in the 4.3B lane
**Dependencies:** T9
**Files likely touched:** `src/project/BdfFont.cpp`, a HIL timing check
**Estimated scope:** S

## Task 12: Handbook

**Description:** Typographies with their new faces, that projects switched
on their own and what to look for (texts that got wider), device pages.

**Acceptance criteria:**
- [ ] `handbuch/designer/icons-schriften.md`, `handbuch/geraete/{waveshare-4,waveshare-4-3b,knob}.md` updated; no «Helvetica»/«Lucida» left where the colour boards are meant
- [ ] Through `maettel-humanizer`; `e2e/handbook-labels.spec.ts` green

**Verification:** `npm run test:quick`; `npm run dev --prefix handbuch` read through
**Dependencies:** T10
**Files likely touched:** the handbook pages above
**Estimated scope:** S

## Phase 4: release

## Task 13: Release

**Description:** Firmware release for the three boards, designer release;
`npm run test:all` green before.

**Acceptance criteria:**
- [ ] Spec success criteria 1-8 ticked with evidence

**Verification:** `npm run test:all`
**Dependencies:** T9-T12
**Estimated scope:** S

## Task 14: Drop the old BDFs (next release)

**Description:** Remove the 1-bit BDFs from the colour boards' DDFs once a
release with the migration is out; `replaces` stays so old projects still
resolve.

**Dependencies:** T13 released
**Estimated scope:** S
