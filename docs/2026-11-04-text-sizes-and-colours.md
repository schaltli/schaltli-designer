# Text sizes and colours

Spec drafted 2026-11-04, from the CamperUI comparison
(https://claude.ai/artifact/BPnD3obEVUqjN3zEYHwdvT) and the rebuild on the
branch `camperui-rebuild`. Two modules, built in this order:
`text-sizes`, then `colour-model`. **Status: approved by the user on 2026-11-04.**

## Objective

CamperUI looks calmer and richer than Schaltli with the same content, for
two reasons the user named (2026-11-03/04):

- **Sizes.** CamperUI has ten font sizes from 10 to 42 px; Schaltli has four
  styles, the smallest (Caption, 15 px on the 4") already bigger than most of
  CamperUI's text. Between 14 and 28 px CamperUI has six steps, Schaltli two.
  The rebuild had to set every size by hand.
- **Colours.** Every Schaltli theme is one hue: «everything blue» or
  «everything orange». CamperUI has a neutral ground (background, card, card
  border, track, text, quiet text) and a handful of distinct colours on top.

## Module `text-sizes`

### The seven sizes (decided by the user, 2026-11-04)

They are sizes, not styles: each is a height in millimetres, the same on
every device, with no colour or weight of its own (Bold stays a separate
switch). The names say how big, not what for.

| Size | mm | on the 4" | typical in CamperUI |
|---|---|---|---|
| **Micro** | 1.5 | 10 px | units, axes |
| **Mini** | 1.8 | 12 px | side info, times |
| **Standard** | 2.1 | 14 px | body text, the most common |
| **Large** | 2.4 | 16 px | card titles, names |
| **XL** | 3.0 | 20 px | highlighted values |
| **XXL** | 4.2 | 28 px | main values |
| **Huge** | 6.2 | 42 px | the one big value |

Ids in the project file: `micro`, `mini`, `standard`, `large`, `xl`, `xxl`,
`huge`.

### Behaviour

- The property panel's field «Text style» becomes **«Text size»**, offering
  the seven names in this order, each with its px on the current device.
- A new text gets **Standard**; a value (Number, a gauge's number) gets
  **XL**; what today gets Title gets **XXL**.
- «Custom» and «Snap to …» stay, snapping to the nearest of the seven.
- **Migration**, when a project is opened: each of the four old styles goes
  to the size nearest its millimetres - Caption 2.0 → Standard 2.1, Label
  3.0 → XL 3.0, Title 4.5 → XXL 4.2, Display 7.0 → Huge 6.2. Title and
  Display texts get a little smaller; the comparison images on the branch
  show whether that matters.
- Blocks (`lib/bausteine.ts`), the demo projects and the CamperUI rebuild
  use the sizes instead of their hand-set fonts.

### Devices

- A typography in a DDF names a font for every size instead of every style
  (`typographiesOf` in `lib/device-description.ts`, the DDFs under
  `public/ddf/`). Knob, 4" and 4.3B get fonts for the seven sizes in each of
  their three typographies; PaperS3 too.
- Flash: dropping the 55 px size outweighs three more sizes - the sum of the
  squares of the pixel heights falls from 5122 to 3644, about 30 % less.
- Whether the firmware or the Android app need a release depends on where
  the fonts are built; found out in the plan, before code.

### Handbook

- **A new page `handbuch/designer/schriftgroessen.md`** («Schriftgrössen»),
  in the sidebar under Designer, with exactly the table above (the column
  «typical in CamperUI» as «typisch für», without naming CamperUI).
- **A screenshot with callouts** on it: a 4" screen built from the sizes - a
  card like CamperUI's home card - with a numbered or named callout at each
  text pointing to its size, Micro to Huge. Made by
  `e2e/handbook-screenshots.spec.ts` like the others, the callouts drawn into
  the image there, so it is redone with every UI change.
- `handbuch/objekte/anzeigen.md` «Stile» becomes «Schriftgrössen» and links
  to the new page; every quoted «Text style» becomes «Text size».
- Through `maettel-humanizer`.

### Testing

- `e2e/size-scale.spec.ts`: the seven sizes in px per device.
- A migration test: a project with the four old styles opens with the
  mapped sizes.
- `hil/size-scale/text-styles.js`: each size drawn on the boards at its
  height.
- `e2e/handbook-labels.spec.ts` covers «Text size».

## Module `colour-model`

### The roles (proposal)

Every theme fills the same roles. Neutral names only - nothing about tanks,
water or vans.

**The ground**, the neutrals of a theme:

| Role (UI) | id | what for | dark | light |
|---|---|---|---|---|
| Background | `surface` | the screen | `#101318` | `#f1f5f9` |
| Card | `panel` | cards, bars, fields | `#181c24` | `#ffffff` |
| Card border | `outline` | a card's edge, quiet lines | `#272d3b` | `#e2e8f0` |
| Track | `track` | the empty part of a bar, slider, gauge | `#12151c` | `#dbe2ec` |
| Track edge | `trackEdge` | as today, colour themes have none | - | - |
| Text | `text` | text, icons | `#f1f5f9` | `#0f172a` |
| Text low | `textMuted` | units, side info, labels | `#94a3b8` | `#64748b` |
| Text on accent | `onAccent` | on a filled button | `#ffffff` | `#ffffff` |

**The colours**, four distinct hues per theme, so a page of dimmers, one of
switches and one of levels can each have their own:

| Role (UI) | id | dark | light |
|---|---|---|---|
| Accent | `accent` | `#0ea5e9` sky | `#0284c7` |
| Gradient end | `accentEnd` | `#38bdf8` | `#0ea5e9` |
| Accent 2 | `accentAlt` | `#f59e0b` amber | `#d97706` |
| Accent 3 | `accent3` (new) | `#06b6d4` cyan | `#0891b2` |
| Accent 4 | `accent4` (new) | `#a855f7` violet | `#9333ea` |

**The states**, the same meaning in every theme:

| Role (UI) | id | dark | light |
|---|---|---|---|
| Good | `good` (new) | `#10b981` | `#059669` |
| Warning | `warning` (new) | `#eab308` | `#ca8a04` |
| Alarm | `alarm` (new) | `#ef4444` | `#dc2626` |

The energy diagram's roles stay as they are.

- **Ids stay where the meaning stays.** Only the labels change (Surface →
  Background, Panel → Card, Outline → Card border, Muted text → Text low,
  Second accent → Accent 2). Projects keep their files; nothing to migrate.
  Five ids are new.
- **Devices are not touched:** roles are resolved to hex at export
  (`applyTheme`), so a device sees colours, as today.

### The themes

- The values above become the theme **Slate** (it keeps its id, its
  values change), and the default for new masters instead of Lavender.
- Every other colour theme is redone on the same scheme: a neutral ground
  tinted slightly towards its hue, its own colour as Accent, three more
  hues that go with it, the states as above. Their values are proposed on
  one page, light and dark side by side, for the user to choose from before
  they are built.
- Paper (16 greys) fills the new roles with greys and black.
- New objects pick from the roles as today; a new card gets Card and Card
  border, a switch that is on gets Good only where a block says so.

### Handbook

`handbuch/designer/themes.md` «Rollen»: the table with the new labels and
the five new roles; «Die Themes» with what changed. Through
`maettel-humanizer`.

### Testing

- `e2e/themes*.spec.ts`: every theme fills every role in light and dark;
  the new labels in the panel; old projects open unchanged.
- The CamperUI rebuild switched to roles; its pages compared with the
  original again.

## Boundaries

- **Always:** `test:quick` per change; handbook in the same work.
- **Ask first:** any other size names or role names than above; the other
  themes' values; a firmware or app release.
- **Never:** camper words in role names; hex in a project file.

## Success criteria

- [ ] Seven sizes, «Text size», old projects migrated to the nearest size
- [ ] Every device with a typography draws the seven sizes at their height
- [ ] Handbook page «Schriftgrössen» with the table and the screenshot with
      callouts
- [ ] The roles above in every theme, light and dark; Slate as proposed
- [ ] The other themes redone after the user chose their values
- [ ] `test:quick` green apart from known load failures

## Decisions (the user, 2026-11-04)

1. Migration to the nearest size: yes - Title and Display get a little
   smaller (4.5 → 4.2, 7.0 → 6.2 mm).
2. Slate, with the values above, is the theme of new masters instead of
   Lavender.
3. The button corner radius comes now, as the module `button-radius` -
   moved to docs/2026-11-04-native-buttons.md, since the devices then draw
   their buttons themselves.

The proposal is shown, with sample cards light and dark, at
https://claude.ai/artifact/BPnD3obEVUqjN3zEYHwdvT.
