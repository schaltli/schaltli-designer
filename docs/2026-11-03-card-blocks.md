# Blocks as cards

Spec for module `card-blocks` of docs/2026-11-03-cards.md, drafted
2026-11-03. **Status: awaiting the user's approval.**

## Objective

A block of several parts - the MaxxFan, the heater, a light with
brightness - arrives today as a table of its own: its name in a column on
the left, its parts on the right (`blockTable`, lib/bausteine.ts), and it
snaps into nothing. CamperUI shows such a thing as a card: its name at the
top, its parts below, the card standing in a grid with others.

After this module a block of several parts arrives as a card (`card`): its
name docked at the top, its parts below filling the card. It snaps into a
table as a card does and fills its cell, so a grid of cards can be built
from blocks (`card-grid`).

Success looks like: the MaxxFan block placed on an empty screen is a card
with «MaxxFan» at the top and Betrieb, Deckel and the switcher below; placed
beside another card it forms a table with it, both filling their cells; a
light block of one part still arrives as a row and snaps into a list.

**Decisions** (the user, 2026-11-03):

- **Always a card** for a block of several parts: no option.
- **A block of one part stays a row**, for lists of switches.
- **Name at the top, parts below**: the name - with its icon, if one was
  chosen - docked Top; the parts in a table of one column (or the
  description's two) docked Fill, across the card's width.
- **It snaps like a card**: into a table or beside a free object, filling
  its cell.

## Behaviour

- **A block of several parts** is placed as a free area with Look Card
  (docs/2026-11-03-card.md):
  - **Heading:** the name as a text with Dock Top. With an icon, the icon
    and the name as a small table of one row, docked Top, stretched across
    (the name's column takes the rest).
  - **Parts:** the table `blockTable` builds today, without its name column,
    with Dock Fill: across the card's width, its parts stretched as today,
    a switcher's panels with it.
  - **Size:** as wide as the block is built today (60 % of the screen); as
    tall as its heading, the gap and its parts need inside the card's
    padding.
- **Carried and let go** it snaps as a card from the Card tool does: into a
  cell (green), at a table's edge (a line), beside a free object (a pair);
  with Ctrl held, nowhere. Where it snaps it fills its cell (`landed`,
  docs/2026-11-03-card-grid.md).
- **A block of one part** as today: a row, into a list.
- **Already placed blocks** stay as they are; nothing is converted.
- **On the device** nothing changes: a card is a box with its objects.

## Not in scope

- A choice between card and table per block, or a setting.
- Single-part blocks as cards.
- Converting placed blocks.
- Clipping to round corners (`card-clip`).

## Code

- `lib/block-card.ts` (new): `blockCard(built, scale)` - the card with its
  heading and parts docked, sized by laying it out.
- `lib/bausteine.ts`: `blockTable` able to leave out its name column
  (`{ name: false }`).
- `components/project-editor.tsx` `armedBlockCarry`: a block of several
  parts carried as `{ card }`; placing it with the snap it was let go at.
- `components/canvas/canvas.tsx`: a carried card snaps as a placed object
  does (`snapDropAt`), and is added with that snap (`onAddObject`'s
  `snap`), as a tool's object is.

## Testing

- `e2e/card-blocks.spec.ts` (new, model): blockCard for the MaxxFan (name
  Top, parts table Fill, a switcher in it), with an icon (a heading row),
  its height its content's; exported, a box and the block's objects.
- `e2e/card-blocks-canvas.spec.ts` (new): a block of several parts placed
  on an empty screen is a card; let go beside a card it forms a table with
  it, both filling their cells; a block of one part still a row in a list.
- `e2e/bausteine.spec.ts`: the expectations of «a block of several parts is
  a table of its own» rewritten for the card; the rest unchanged.
- `e2e/handbook-labels.spec.ts`.

## Handbook

`handbuch/designer/bausteine.md`: a block of several parts arrives as a
card, snaps like one; one part as a row as before. `objekte/anordnen.md`
«Card»: blocks build a grid of cards. Through `maettel-humanizer`.

## Boundaries

- **Always:** single-part blocks unchanged; placed blocks unchanged;
  designer-only; `test:quick` per change; handbook in the same work.
- **Ask first:** an option to place a block as a table again.
- **Never:** a device change.

## Success criteria

- [ ] A block of several parts arrives as a card, name at the top, parts
      filling it, its height its content's
- [ ] With an icon, icon and name at the top
- [ ] It snaps into a table and beside another card, filling its cell
- [ ] A block of one part still a row
- [ ] Handbook updated; `test:quick` green apart from known load failures
