# Implementation plan: 4-bit fonts (`4bit-fonts`)

Spec: `docs/2026-11-01-4bit-fonts.md`. Tasks: `tasks/4bit-fonts-todo.md`.
Occasion: CamperUI on the same Waveshare 4" (2026-11-01) - its anti-aliased
text looks smoother than Schaltli's 1-bit BDFs.

## Overview

The colour boards (4", 4.3B, Knob) draw text with 16 coverage levels from
pre-rasterised 4-bit BDFs in their own DDF; the designer draws the same bytes
with the same RGB565 blend, so the HIL stays at 0 px. Standard becomes
Roboto, Humanist Inter, Technic Roboto Condensed with Seven Segment. Projects
switch on their own: each new font names the old ones it `replaces`, the
designer rewrites `fontId`s on open, the firmware resolves old ids until the
next deploy. PaperS3 and Android do not change.

## Architecture decisions

- **4-bit BDF, not a new format.** `BITS_PER_PIXEL 4`, one hex digit per
  pixel. The parsers on both sides, the tooling and a review diff stay as
  they are; only the bitmap rows change meaning. `BdfFont` already reads rows
  as hex nibbles (`bitsPerRow = len * 4`).
- **Blend once, the same on both sides.** Coverage 0-15 → alpha
  `(a * 256 + 7) / 15`, then `levelglow::blend565` on 5/6/5 channels; the
  firmware reads the pixel under it from the canvas buffer, the designer from
  its 565 working copy. A shared table of test values (JSON in the designer,
  copied into `test/` of the firmware) pins both.
- **1-bit stays a first-class path.** Every change branches on the font's
  `bpp`; a 1-bit font draws exactly as today. That is what keeps the PaperS3,
  a future OLED and every existing HIL fixture at 0 px through phases 1-3.
- **Migration through the DDF, not through code tables.** `replaces` lives in
  the device's DDF, so designer and firmware read one mapping. It is generated
  by `build-typography-fonts.py` from (typography, style, weight, nearest
  size), not written by hand.
- **Cap height picks the size, only for 4-bit typographies** (decision 10).
  `fontFor` keeps line height for 1-bit families.
- **Old BDFs stay in the colour DDFs for one release** (spec open question 3):
  a rollback of the firmware still draws, and dropping them is a separate,
  small task afterwards.

## Dependency graph

```
T1 contract ──┬─> T2 font tool ──> T5 DDFs ──┬─> T7 designer migration ──> T10 sample projects
              ├─> T3 firmware draw ──────────┤                              │
              └─> T4 designer draw ──────────┼─> T6 cap-height fontFor     │
                                             ├─> T8 firmware old ids       │
                                             └─> T9 HIL fixtures ──────────┴─> T11 perf ─> T12 handbook ─> T13 release
                                                                                              T14 drop old BDFs (next release)
```

T3 and T4 can run in parallel after T1; T6/T7/T8 after T5.

## Phases and checkpoints

**Phase 0 - contract and fonts (T1, T2).** Checkpoint: the 4-bit BDFs exist
for all three boards, licences next to them, glyph counts = what each family
has of the 753.

**Phase 1 - drawing (T3, T4).** Checkpoint: one hand-placed 4-bit font in a
test DDF draws on the 4.3B at 0 px against the designer; every existing
fixture on every board still 0 px; `pio test -e native` and the designer unit
tests share the blend table.

**Phase 2 - switching (T5-T8).** Checkpoint: a project with 1-bit ids opens
migrated (e2e); a board on the new firmware with the old project still on it
draws every text (HIL).

**Phase 3 - proof and polish (T9-T12).** Checkpoint: success criteria 1-8 of
the spec, `npm run test:all` green.

**Phase 4 - release (T13, later T14).**

## Risks

| Risk | Mitigation |
|---|---|
| Blend rounding differs by one step between designer and firmware | Shared value table in unit tests (T3/T4) before any HIL run |
| Text over a gradient, chart or image blends with the wrong "under" (partial redraws) | Fixtures with text over each (T9); the renderer already draws back to front and redraws regions with what lies under them, as the level glow relies on |
| Redraw slower on the 4.3B | Skip blank rows as today, write coverage 15 without blending; measure in T11 against criterion 6 |
| Migrated texts overflow their objects | Overflow list after migration (T7); starter and demo projects fixed in T10 |
| Knob was off the bench 2026-10-30 to 11-01 | Back on COM4 (user, 2026-11-01); its lane runs with the others |
| Inter/Roboto lack a glyph a project uses (285 of the 753 missing in Roboto, mostly Latin Extended-B) | The DDF lists what the font has; the designer's existing "device lacks this character" path covers it |

## Verification

Every task: `npm run test:quick`. Phase ends: `npm run test:all`. No
`pio test`/Playwright run beside a running `test:quick` (memory
*kein-playwright-neben-test-quick*). Ad-hoc checks become fixtures (CLAUDE.md).
