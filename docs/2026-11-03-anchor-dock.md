# Anchor and Dock

Spec for module `anchor-dock` of docs/2026-11-03-cards.md, drafted
2026-11-03. **Status: approved by the user on 2026-11-03.**

## Objective

Two places hold objects inside a frame: a table's cell
(docs/2026-10-09-snap-tables.md) and a free area. They say differently how
an object stands in that frame, and the free area says nothing at all:

- In a cell, **Align** (Left/Center/Right), **Vertical align**
  (Top/Middle/Bottom) and **Fill** (Width, Height) - two fields for one
  question per axis.
- In a free area, every object keeps its x and y. Make the area larger and
  nothing follows: a value meant for the bottom right corner stays where it
  was, a heading meant to span the area keeps its width.

After this module, one question per axis, asked the same way in both places:

- **Horizontal**: Left · Center · Right · Stretch
- **Vertical**: Top · Middle · Bottom · Stretch

In a cell it says where the object stands in its cell (Stretch: across it).
In a free area it says which edges of the area the object keeps its distance
to when the area changes size (Stretch: both, so it grows with it). This is
WinForms' Anchor and Figma's Constraints, in words.

A free area also gets **Padding** and, for its objects, **Dock**: Top,
Bottom, Left, Right, Fill. A docked object is placed by the area - along
the edge it is docked to, inside the padding, one after another - so a
heading and a content below it stay in place however the area is sized.

Who it is for: everyone building a screen of cards (docs/2026-11-03-cards.md),
and anyone who resizes a free area today and moves its contents by hand.

Success looks like: a free area with a heading docked at the top and a table
filling the rest, resized by dragging, keeps the heading at the top across
its width and the table below it; a cell's object set to Right stands right
in its cell, as with Align Right today; every project saved before this
opens with every object exactly where it was.

## Behaviour

### In a cell

- **Horizontal** and **Vertical** replace Align, Vertical align and Fill
  in the property panel's «Cell» section.
- **Stretch** is offered where Fill is offered today: Horizontal for button,
  button group, bar, slider, box, free area and text field; Vertical for
  button, box and free area. Elsewhere the field has three options.
- **Defaults** are today's: a label Left, everything else Center; Middle.
- **A text** spans its cell as today; its Horizontal is its own text
  alignment (Left/Center/Right, no Stretch), as Align is today.
- Across a span, Stretch takes the whole span, as Fill does.

### In a free area

- **Horizontal / Vertical** in a section «Position» on every object directly
  in a free area (not in its tables' cells - those have «Cell»):
  - Left (Top): keeps its distance to the area's left (top) edge. The
    default, which is what every object does today.
  - Right (Bottom): keeps its distance to the right (bottom) edge.
  - Center (Middle): keeps its offset from the area's centre.
  - Stretch: keeps both distances; its width (height) changes with the area.
    Offered for the same types as in a cell, and for text (width).
- The rule applies whenever the area changes size: dragged on the canvas,
  typed into Frame, filled by its cell (Stretch in a table), docked in
  another area. It works from the area's size before the change, so a
  change that leaves the size as it was moves nothing (keepUnchanged,
  lib/layout.ts).
- **Padding** on the free area, in mm, one value for all four sides, 0 by
  default (today's areas unchanged). Only Dock uses it.
- **Dock** on every object directly in a free area: None (default), Top,
  Bottom, Left, Right, Fill.
  - Docked objects are placed inside the padding in the order of the
    object list, top of the list first: Top takes the top edge across the
    remaining width at its own height, Bottom the bottom, Left and Right the
    sides across the remaining height at their own width, Fill what is left.
  - Between docked objects stands the table gap, `SNAP_GAP_MM` (1.5 mm).
  - Across the dock (Top/Bottom: the width), an object takes the room if
    it can stretch that way, otherwise it stands by its Horizontal (Vertical)
    in it. A table docked Top or Bottom takes the width the way a switcher's
    panel stretches it (`arrangeSnapTable`'s `stretchTo`).
  - A docked object's x, y and the docked size are not editable; Frame
    shows them greyed. Horizontal/Vertical of the docked axis are hidden.
  - Undocked objects stay free, on top of the docked ones' area, anchored as
    above.
  - The object list shows a docked object with its dock as a small mark;
    its order is changed by dragging in the list, as today.
  - An area smaller than its docked objects need: they keep their own size
    and are clipped at the area's edge, on the canvas and on the device.
- Dock is not offered in a cell, on a screen or in a switcher's panel.

### Old projects

On load (`migrateProject`, lib/object-types.ts), a cell's `align`,
`alignY` and `fill` become `anchor`: `fill.width` → Stretch, else `align`;
`fill.height` → Stretch, else `alignY`. Nothing moves. Free areas get
nothing: no anchor means Left/Top, no padding means 0, no dock means None -
exactly today's behaviour.

## Not in scope

- The Card look, the table gap setting, blocks as cards (later modules).
- Anchor or Dock on a screen or in a switcher's panel.
- Padding per side.
- Reordering docked objects on the canvas.
- Any device change. Devices get placed objects, as today.

## Data model

```ts
// lib/anchor.ts (new)
export type AnchorX = "left" | "center" | "right" | "stretch"
export type AnchorY = "top" | "middle" | "bottom" | "stretch"
export type Dock = "top" | "bottom" | "left" | "right" | "fill"

// on any object in a cell or directly in a free area
properties.anchor?: { x?: AnchorX; y?: AnchorY }
// on an object directly in a free area
properties.dock?: Dock
// on a free area
properties.padding?: number // mm
```

`SnapCell` loses `align`, `alignY` and `fill`; it keeps row, column, spans
and `drawnWidth`/`drawnHeight` (the drawn size while stretched). Absent
means the place's default, so a project only stores what was chosen.

## Code

- `lib/anchor.ts` (new): the types; `placeInRoom(child, room, anchor)` for
  one object in a cell's room; `resizeFree(area, width, height, scale)`
  moving the children by their anchors from the area's old size;
  `dockFree(area, scale)` placing the docked children.
- `lib/snap-table.ts` `arrangeSnapTable`: placing by `placeInRoom`; `SnapCell`
  without align/alignY/fill.
- `lib/layout.ts` `layoutOne`: a free area's children docked and anchored
  after its own size is known.
- `lib/object-types.ts` `migrateProject`: the cell conversion.
- `lib/bausteine.ts`: `alignY: "top"`/`"bottom"` and `fill.width` written as
  `anchor`.
- `components/property-panel/snap-table-properties.tsx`: Horizontal and
  Vertical instead of Align, Vertical align and Fill; a new
  `free-area-properties` section «Position» (Horizontal, Vertical, Dock) and
  Padding on the area.
- `components/canvas/canvas.tsx`: resizing a free area goes through
  `resizeFree`; the object tree's dock mark.

Style, as the rest of `lib/`: pure functions returning new objects,
geometry in pixels of the layout scale, mm only at the edges:

```ts
/** One object in its room: at its own size, or across it where it stretches. */
export function placeInRoom(child: ScreenObject, room: Room, anchor: Anchor): Placed {
  const width = anchor.x === "stretch" ? room.width : child.width
  const dx = anchor.x === "right" ? room.width - width : anchor.x === "center" ? Math.round((room.width - width) / 2) : 0
  ...
}
```

## Commands

- Dev server: `npm run dev` (one per checkout, port 3000)
- One spec: `npx playwright test e2e/anchor-dock.spec.ts`
- Every change: `npm run test:quick`
- Handbook preview: `npm run dev --prefix handbuch`

## Testing

- `e2e/anchor-dock.spec.ts` (new, model): placeInRoom for every anchor;
  resizeFree for every anchor, and a resize to the same size moving nothing;
  dockFree in list order with padding and gap, a table docked Top stretched;
  a free area stretched in a cell taking its docked and anchored children
  with it.
- `e2e/snap-table-model.spec.ts`: Align/Fill cases rewritten as anchors;
  migration: a project with every align/alignY/fill combination lays out to
  the same pixels before and after.
- `e2e/snap-table-canvas.spec.ts`: the Cell section's Horizontal/Vertical.
- `e2e/anchor-dock-canvas.spec.ts` (new): dragging a free area's corner
  moves a Right/Bottom object along and stretches a Stretch one; Dock in the
  panel; the dock mark in the object list.
- `e2e/bausteine.spec.ts`: blocks unchanged on screen (right edges equal,
  name at the top).
- `e2e/handbook-labels.spec.ts`: the new labels.
- HIL: unchanged fixtures must still pass in `test:quick`; that every old
  project opens unchanged is the migration test above.

## Handbook

`handbuch/objekte/anordnen.md`: the «Cell» paragraph (Align, Vertical align,
Fill become Horizontal and Vertical), the free area section (Position,
Padding, Dock, with a small example: a heading at the top, a table below);
`handbuch/designer/objekte.md` line on Align if it refers to cells. Through
`maettel-humanizer`.

## Boundaries

- **Always:** designer-only; every old project opens with every object where
  it was; `npm run test:quick` per change; handbook in the same piece of
  work.
- **Ask first:** a device or export change; a new object type; changing which
  types can stretch; the table gap's size.
- **Never:** the word «Anchor» or the four-armed cross in the UI; layout
  that depends on something the object list does not show.

## Success criteria

- [ ] In a cell, Horizontal/Vertical place an object exactly as
      Align/Vertical align/Fill did; Align and Fill are gone from the panel.
- [ ] A project saved before this opens with every object at the same
      pixels (migration test).
- [ ] Resizing a free area keeps Right/Bottom objects at their distance to
      that edge, Center/Middle at their offset from the centre, stretches
      Stretch objects, and leaves Left/Top ones.
- [ ] A free area with Padding, a text docked Top and a table docked Fill
      keeps both in place when dragged larger or smaller, and when it
      stretches in a cell.
- [ ] Export unchanged in form: devices get placed objects and the area's box.
- [ ] Handbook updated, `test:quick` green apart from known load failures.

## Decided (the user, 2026-11-03)

1. **Center in a free area** keeps the offset from the area's centre, as in
   Figma.
2. **Between docked objects** stands the table gap, 1.5 mm.
3. **The section** for a free area's objects is called «Position».
4. **An area smaller than its docked contents** clips them.

## Open

- **How the clip of 4 reaches the device.** A free area is dissolved on
  export, and no device clips an object to the area it came from. The
  designer can only shrink what it exports - a docked object's docked size
  cut to the room left, one left with no room not exported - which clips a
  box or a table, not a text's glyphs. To be settled while planning, before
  `dockFree` is built; a device change is out of scope without asking.
