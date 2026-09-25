# Implementation plan: the dark variant in the export (`theme-export`)

Spec: `docs/2026-09-25-themes-export.md` (approved 2026-09-25, with its two
open points: measure the size in the first bake task; leave page icons
single). Capability map: `docs/2026-09-24-themes.md`. Task checklist:
`tasks/todo.md`. The previous plan (`theme-model`) is in git history.

## Overview

A 24-bit export gains, beside every field `X` that depends on the theme, an
optional `XDark`: colour properties, the screen background and every baked
file. Light stays byte-identical, so today's firmware and app keep showing
light and deploy keeps working (generation 1.0 → 1.1, a minor). Built in
four slices: the dark colours in the JSON, the dark bitmaps for the
firmware, the same for Android, and the reference render drawing dark.

## Architecture decisions

- **One rule, `X` → `XDark`.** Colours inside `properties`
  (`fillColorDark`), `backgroundColorDark` on the screen, `pathDark`,
  `pathNormalDark`, `pathActiveDark` beside the paths (user, 2026-09-25).
- **Dark values from the same resolution as light.** The exporter already
  calls `applyTheme(merged, theme, "light", depth)` per screen
  (`lib/project-zip.ts` `themedObjects`, `lib/android-export.ts`). It calls
  it a second time with `"dark"` and copies each colour key whose light
  source was a role (or a default role) across as `<key>Dark`. A key whose
  source was `transparent` or a device-format hex gets none.
- **Dark bakes run the same bake code, once more.** `AssetExporter` bakes
  from objects and a screen background it is handed; the dark pass hands
  it the dark-resolved objects and background and a filename suffix
  `-dark`. No second implementation of any bake. A dark file whose bytes
  equal its light file is not written; its `…Dark` field points at the
  light file.
- **Only 24-bit.** Grey and 1-bit exports run no dark pass at all.
- **The quantiser.** `quantizeColorsDeep` matches keys ending in `color`,
  which `…ColorDark` does not. Correct, because dark is 24-bit only and 24
  bit is not quantised; stated in the contract.
- **Generation 1.1** in `lib/system-generation.ts`; the frozen corpus gains
  a 1.1 case (`build-corpus.js` CASES), existing files untouched.

## Dependency graph

```
Task 1  dark colours + backgroundColorDark in firmware and Android JSON;
   │    generation 1.1 + corpus case
   │
Task 2  firmware dark bakes (all bake kinds) + …Dark paths + dedupe;
   │    size measured
   │
Task 3  Android dark bakes + …Dark paths
   │
   ├── Checkpoint A: full e2e, export sizes reviewed with the user
   │
Task 4  test-render variant: "dark"; reference = designer's Dark canvas
   │
Task 5  device-contract.md; code-reviewer; full suite; commit
```

Tasks 2 and 3 touch different exporters and could run in parallel; both
depend on Task 1's `darkColours` helper.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dark bakes double an export's asset size beyond a board's 1536 KB LittleFS | High | Measured in Task 2 on the largest colour fixtures; identical bakes deduped; if still tight, raise with the user before Task 3 (Checkpoint A). |
| A light field changes by accident (an old reader then shows something new) | High | Task 1's first test compares the export with every `…Dark` key stripped against the light-only export, byte for byte. |
| A bake reads the background or a colour from the raw project instead of what it is handed, and bakes light into a dark file | Medium | Task 2 checks the pixels of each dark file kind (icon, level icon, switch icon, button, flattened background) for the dark background and tint. |
| Android and firmware drift in field names | Medium | One test group asserts the same `…Dark` names in both bundles. |
| `master-icon-background`-class bugs (a master object baked once) come back for dark | Medium | Task 2 and 3 tests use a master object on two screens in two themes, as the review's R1 test does. |

## After theme-export: the background image as an object (decided 2026-09-25)

Its own module, specced after this one. A screen's background image becomes
an ordinary image object (PNG/JPG) placed on the screen or its master; the
screen's Background image field goes. The exporter stores byte-identical
bakes once across screens, not only between light and dark, so an opaque
picture used on five screens is one file. The app gets its own views for
`box`, `line` and `icon` (today they reach it only inside the baked
`backgroundImage` PNG), and then that PNG - and Task 3's
`backgroundImageDark` - goes. Fixes #16 on the way.

## Session note

Port 3000 on this machine may be served by another checkout's `next dev`;
Playwright reuses it. Run the suite against this checkout's server (a local,
uncommitted config pointing at port 3210) until that is sorted out.
