# Spec: `theme-export` - the dark variant reaches the device

Module of `docs/2026-09-24-themes.md` (capability map), after `theme-model`
(`docs/2026-09-24-themes-model.md`). Status: draft 2026-09-25.

## Objective

A project exported for a colour device carries both variants of every
screen's theme, so that a device which knows how can switch between light
and dark at runtime (`device-switch`, in the firmware and Android
repositories) without the designer being involved. This module builds the
export; it does not make any device switch.

Decided with the user on 2026-09-25: **the designer resolves, dark goes
beside light.** The export keeps today's shape - every colour a hex, the
light variant - and gains optional fields for the dark one. A reader that
does not know them ignores them and shows light, exactly as today, so
deploy keeps working with every firmware and app in the field. That makes
this a *minor* step of the system generation (1.0 → 1.1): additive fields
with the existing skip-or-default convention (`lib/system-generation.ts`,
`docs/nested-provenance.md`).

### User-visible behaviour (acceptance criteria)

1. A project for a colour device (24-bit colour depth; Android always)
   exports, per screen, the light values it exports today, unchanged
   byte for byte in every existing field, plus:
   - per screen, `backgroundColorDark`;
   - per object, in `properties`, `<key>Dark` beside each colour property
     that holds a role: `fillColorDark` beside `fillColor`, `textColorDark`
     beside `textColor`. Properties that are not roles (`transparent`, a
     hex in a device-format fixture) get none;
   - per baked bitmap, a dark file beside the light one: `pathDark` next
     to every `path` (icons, live-icon rules, level header icons),
     `pathNormalDark` / `pathActiveDark` next to a button's, and
     `pathDark` / `pathActiveDark` next to a switch state's. The flattened
     screen background is no longer exported at all, light or dark (see
     open question 1).
2. A dark bitmap is baked from the dark variant: the dark background and
   the dark tint, exactly as the designer draws it with `Dark` on. A
   bitmap whose light and dark bytes are identical (an icon that keeps
   its own colours on a transparent background of the same surface) is
   written once and both fields point at it.
3. A project for a grey or 1-bit device exports exactly what it exports
   today, with no dark fields: those devices have one variant.
4. The export carries `systemGeneration: "1.1"`. The deploy dialog still
   deploys it to a device that reports 1.0 (same major), as it does today
   for any minor.
5. `docs/device-contract.md` describes the new fields and the one rule for
   all of them - **for every field `X` there may be an `XDark`; while the
   theme is dark (`schaltli/state/theme`, `theme-topic`) a device takes
   `XDark` where there is one and `X` where there is not** - and what a
   device that does not know them does (nothing - light).
6. The HIL reference render (`app/test-render`) can draw a device-format
   project in its dark variant (`variant: "dark"` in a render request): it
   takes every `XDark` in place of its `X` - colours, the screen
   background, files - so HIL suites can compare a device showing dark
   against the reference.
7. What a device derives on its own (a level's track, an arc's marker, a
   switch's surface and ink, a button's pressed state) needs nothing new:
   it is computed from the object's colour and the screen background,
   and in dark both come from the dark values. The designer draws dark by
   the same rules, so the two agree.

## Contract shape (example)

One rule for everything: beside a field `X` there may be `XDark`
(decided with the user on 2026-09-25 - a separate `dark` block per object,
as first drafted, was a second pattern for the same thing).

```json
{
  "systemGeneration": "1.1",
  "screens": [{
    "id": "s1",
    "backgroundColor": "#f4f6f8",
    "backgroundColorDark": "#15202b",
    "objects": [
      { "id": "o1", "type": "text",
        "properties": { "color": "#1e2a36", "colorDark": "#e6edf3",
                        "backgroundColor": "transparent" } },
      { "id": "o2", "type": "icon",
        "path": "assets/s1_o2.bmp", "pathDark": "assets/s1_o2-dark.bmp",
        "properties": { "iconColor": "#2f6f9f", "iconColorDark": "#6aa8d8" } }
    ]
  }]
}
```

Readers skip keys they do not know (`docs/device-contract.md`), so a
`…Dark` key inside `properties` is as harmless to today's firmware and app
as `pathDark` beside `path`.

The export's quantiser finds colour keys by the suffix `color`
(`lib/project-zip.ts` `quantizeColorsDeep`); `fillColorDark` does not end
in it and is not quantised. That is correct as long as dark keys are only
written for 24-bit exports, where nothing is quantised - which criterion 3
guarantees. Anyone extending dark to other depths has to widen that match.

## Tech stack

The designer's existing export: `lib/project-zip.ts`
(`buildDeviceProjectZip`), `lib/asset-export.ts` (`AssetExporter`, the
bakes), `lib/android-export.ts`, `lib/themes.ts` (`applyTheme`,
`resolveColor`, `themeFor`), `lib/system-generation.ts`. No new
dependencies.

## Commands

```
Typecheck:       npm run typecheck
Export tests:    npx playwright test e2e/themes-export.spec.ts
Related:         npx playwright test e2e/android-export.spec.ts e2e/master-icon-background.spec.ts e2e/system-generation.spec.ts e2e/themes.spec.ts
Full suite:      npm run test:all
```

(While port 3000 is served by another checkout, run against this one's own
server - see the session note in `tasks/plan.md`.)

## Project structure

```
lib/themes.ts                darkColours(object, theme): the `<key>Dark` values per object
lib/asset-export.ts          bakes run once per variant; dark filenames carry "-dark"
lib/project-zip.ts           writes backgroundColorDark, dark, …Dark paths; generation 1.1
lib/android-export.ts        the same for the app's bundle
lib/system-generation.ts     SYSTEM_GENERATION minor 1
app/test-render/page.tsx     variant: "dark" in a render request
docs/device-contract.md      the fields and the reader rules
e2e/themes-export.spec.ts    tests below
test-projects/generations/   a 1.1 case added (never regenerate the others)
```

## Code style

As in `theme-model`: comments say why, the export stays readable as data,
and a dark field is written only where it carries information.

```ts
// For every colour that is a role, its dark value beside it under the same
// name with "Dark" appended - the one rule the whole export follows.
const properties = { ...exported.properties, ...darkColours(obj, theme) } // { colorDark: "#e6edf3" }
```

## Testing strategy

Playwright, `e2e/themes-export.spec.ts`, driving the real exporters through
`app/test-render`'s `__buildDeviceZipForTest` / `__buildAndroidZipForTest`
and the reference render:

1. **Light unchanged:** a themed project exported now and with the dark
   fields stripped is identical in every existing field to the light-only
   export (the old reader's view is untouched).
2. **Dark values:** every role-valued colour of every object has its
   `<key>Dark` with the dark hex of the screen's theme (including master
   objects, in the screen's theme); `backgroundColorDark` is the dark
   surface; no role name anywhere.
3. **Dark bitmaps:** each `…Dark` path exists in the zip; a tinted icon's
   dark file differs from its light file and its pixels carry the dark
   tint and the dark background; identical bakes are written once.
4. **Grey and 1-bit:** no dark field and no `-dark` file at all.
5. **Reference render:** `variant: "dark"` on the exported device project
   draws the same pixels as the designer's canvas with `Dark` on.
6. **Generation:** the export says 1.1; the deploy check accepts it for a
   device on 1.0; the frozen corpus gains a 1.1 case and every existing
   case still opens.
7. **Android:** the bundle carries the same `…Dark` fields and dark files.

## Boundaries

- **Always:** keep every existing export field byte-identical; write dark
  only for 24-bit; bake dark with the same code path as light (one bake
  function, a variant argument), never a copy; update
  `docs/device-contract.md` in the same change.
- **Ask first:** anything that changes a light field; a major generation
  bump; a new asset format; dropping the "write identical bakes once"
  rule if it complicates the exporter.
- **Never:** change what firmware or the app does (that is
  `device-switch`, in their repositories); regenerate the frozen
  generation corpus; ship roles or theme tables to a device.

## Success criteria

- Criteria 1-7 hold; the seven test groups pass; the existing export,
  Android, master-icon and generation specs pass unchanged.
- A real deploy of a themed project to a board on today's firmware still
  shows the light variant (HIL, where a board is reachable).
- The largest fixture project's export stays within its device's storage
  with dark added (measured and noted in the contract).

## Open questions

1. **Size - answered 2026-09-25.** Knob and 4.3B use `default_16MB.csv`,
   whose LittleFS is 0x360000 bytes (3,456 KB). The knob smoke-test
   fixture (5 screens) took 2.06 MB light and **4.10 MB (116%) with dark**:
   nearly all of it the flattened screen backgrounds, a full-screen bitmap
   per screen (389 KB on the knob, 1.15 MB on the 4.3B). No device reads
   that file - every current firmware, the PaperS3 included, draws with
   `ColorScreenRenderer`, and Android has its own `backgroundImage`; only
   the retired schaltli-eink did. Decided with the user: the flattened
   background is no longer exported for any device (commit a24d4bc,
   `docs/device-contract.md` §7). Now: **light 119,871 B (3.4%), with dark
   213,473 B (6.0%)**, pinned by `e2e/themes-export-size.spec.ts`. Side
   finding: a screen's background image reaches no firmware device (#16).
2. **`pageIconPath`.** Page icons (the Knob's screen menu) are baked in a
   fixed colour today, not from the theme. Leave them single, or tint them
   per theme and variant? Proposed: leave them as they are in this module.
