# Value cards

Spec drafted 2026-11-11 from the starter's block review with the user
(`tasks/bausteine-review.md`, «Wert-Karten»; drafts «Wert-Karten» and
«Kopfzeile und Home» linked there). **Status: approved by the user on
2026-11-11.** Builds on docs/2026-11-03-card-blocks.md,
docs/2026-11-05-quick-blocks.md and docs/2026-10-16-charts.md.

## Objective

A block that shows a value - a temperature, the battery, solar power, a
tank - is placed from «Prebuilt» as a card of free parts: its name, then
the value as a text, a bar or a gauge. On the starter's Home they read as
a wall of equal grey texts: the name as big as the number, the number in
the text colour whatever it means, a thick bar with its percentage beside
it. CamperUI's cards are what the user liked: a small name, a big
coloured number.

Users: whoever places blocks in the designer - the starter first.

## Decisions (the user, 2026-11-11)

1. **The card stays a group of free parts**, no new object type
   (decision of 2026-10-26: entities decompose into free controls). The
   new look comes from the block builder (`lib/bausteine.ts`,
   `lib/block-card.ts`); whoever wants something else changes the parts.
2. **Heading small, number big.** The card's heading is the entity's
   name in the muted ink, one text size below the body (Standard on the
   4"), with a small one-colour icon before it where the entity has one.
   Under it the value as a live text, two sizes above the body, in the
   **colour of its meaning** (decision 4), with its unit.
3. **A level gets a thin bar across the card**: 6 px (4" scale), rounded,
   under the number, the bar's track the theme's track colour, its fill
   the number's colour. No percentage beside the bar - the number says
   it.
4. **The colour of its meaning**, from what discovery says - its device
   class and its icon, never its name (the designer knows nothing of the
   van's things, e2e/no-van-words.spec.ts) - fixed per block and changeable
   afterwards like any colour. The VanPi bridge gives a grey water tank the
   icon `mdi:water-opacity`, fresh water `mdi:water`, solar
   `mdi:solar-power`:
   - battery (`device_class: battery`, or a % level named so by the
     bridge): Good;
   - power from the sun (`device_class: power` and a name or id with
     solar/pv): the energy role Sun; any other power: the text colour;
   - temperature: the text colour;
   - a fresh water tank: Accent; grey/waste water: Accent 3; fuel and
     gas: Warning;
   - anything else: the text colour.
   A value can still turn colour with its own rules (live value rules,
   e.g. the battery below 20 % in Alarm) - set by hand, not by the
   builder.
5. **Wide cards for levels that read along**: a tank and the battery
   take both columns of a two-column grid. In a wide card name and number
   share one row - the name on the left, the number on the right - and
   the bar runs below across the card. A narrow card stacks name, number,
   bar.
6. **No trend arrow, no extra line** in the card. Further values are
   added by hand as rows of the card's table.
7. **The last three hours as a compact chart** - the chart object
   (charts spec) in a compact form: no axes, no legend, no date, a fixed
   window of 3 h, one series drawn as a line with a faint area, the
   series' colour, **as a sparkline to the right of the number** (the
   user, 2026-11-11), so a narrow card keeps its height; in a wide card
   between the name and the number. The block builder adds it to a value card when the
   device declares charts. The recorder records it like any deployed
   chart (charts spec decision 4); until it has, the designer's
   simulation draws an invented course (chart decision of 2026-11-11).
   On devices, a cap on how many series a project asks the recorder for.

## What changes

- `lib/bausteine.ts`: the value part's look «Number» builds the big
  coloured live text; a level's «Bar» builds the thin bar under it; the
  colour by decision 4; the compact chart where 7 applies.
- `lib/block-card.ts`: the heading in the muted ink and smaller text
  size, the icon before it; the wide form's single row.
- Chart object: a property «Compact» (no axes, legend, date; window 3 h
  fixed) - in the chart's renderer, export and devices, which already draw
  charts.
- The starter's Home, Wasser and Power use the new cards.

## Testing

- Block builder specs: a battery, a solar power sensor, a temperature, a
  fresh and a waste tank each become the card of decisions 2-5 with the
  right colour; a wide card has name and number in one row.
- Chart: the compact form's layout pinned (no axes, no legend); the
  simulation's invented course drawn when no history exists.
- HIL conformance: a compact chart on every board that declares charts.
- Handbook: the Prebuilt page and the chart's page updated, labels
  checked.

## Boundaries

- **Always:** typecheck and `test:quick` per change; live checks become
  tests; handbook in the same piece of work; stage single files.
- **Ask first:** changing what an existing block placed in a project looks
  like (only new placements change).
- **Never:** a value card as a new object type.

## Success criteria

- The starter's Home shows Innen, Solar, Batterie and Frischwasser as in
  the draft «Kopfzeile und Home», placed from Prebuilt without retouching.
- A compact chart shows the last 3 h on the 4" once the recorder has
  them, and an invented course in the designer before.

## Open questions

