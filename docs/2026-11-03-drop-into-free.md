# Drop into a free area

Spec for module `drop-into-free`, a follow-up to the cards
(docs/2026-11-03-cards.md), drafted 2026-11-03. **Status: awaiting
approval.**

## Objective

An object dragged onto a card does not go into it (the user, 2026-11-03).
Today an object enters a free area only as a new object while the area is
open, or by snapping into a table inside it. Dragged there, it lies over
the card on the screen: not under it in the object list, not moving with
it, and its Position and Dock do not apply.

After this module, dragging an object onto a free area or a card puts it
inside, and dragging it out over the edge takes it out again, as Figma
does with frames.

Success looks like: a text dragged onto a card shows the card highlighted
while it is over it, and once let go it is the card's child, standing
exactly where it was dropped, and moves with the card. Dragged back out over
the card's edge, it is on the screen again.

## Behaviour

- **In.** While an object is dragged, the free area under its middle (the
  dragged rectangle's centre) is highlighted. Let go there, the object
  becomes that area's child, at the place it was dropped, in the area's
  coordinates. It keeps its size; Position starts at Left/Top (no anchor
  set) and no Dock, as for any new object in a free area.
- **The innermost wins.** A table under the middle inside the area takes
  the object as today (snapping into a cell, a new column or row). Of
  nested free areas, the innermost one under the middle takes it. A
  switcher's open panel holding a free area works the same.
- **Out.** An object of an open free area dragged so that its middle is
  outside the area leaves it: let go, it goes into whatever is under its
  middle there - another free area, or the space the area stands in (the
  screen, a panel). It stays where it was dropped on the glass.
- **From outside, at the edge.** With its middle outside a free area but
  near its edge, the object makes a table with it as today (snapping by
  edges). Only the middle inside puts it in.
- **Ctrl/⌘ while dragging.** Nothing snaps, nothing changes parent: the
  object stays with its current parent and only moves, as today.
- **Several objects.** A selection dragged together goes in or out
  together, decided by the middle of the selection's bounding box. Objects
  of a snap table are not dragged into an area this way (taking one out of
  the table stays its own gesture).
- **What cannot go in.** A free area into itself or into one of its own
  descendants. A locked object stays put, as today.
- **Undo** puts it back in one step.
- **Devices:** nothing changes. The export dissolves free areas
  (lib/object-groups.ts); an object inside one arrives at the same place on
  the glass as one lying over it, now with the area's clip if Clip is on.

## Not in scope

- Dragging into a table's cell that holds a free area by the cell (it
  goes into the area if the middle is over the area, else the table's
  rules apply).
- Reordering inside an area by dragging (the object list does that).
- Dropping into a group (groups stay as they are).

## Code

- `lib/drop-into-free.ts` (new): the free area a rectangle's middle falls
  into, innermost first, among a space's objects (skipping the dragged
  objects and their descendants); moving objects into an area and out of it
  with their coordinates translated, as pure functions on the object tree.
- `components/canvas/canvas.tsx`: during a drag, the target area
  highlighted; at mouse-up, in or out through a new callback
  (`onMoveIntoArea`), after table snapping has had its turn.
- `components/project-editor.tsx`: the callback; one undo step; the moved
  objects stay selected.

## Testing

- `e2e/drop-into-free.spec.ts` (new): the pure functions - innermost
  area, own descendants refused, coordinates kept on the glass in and out,
  a selection by its bounding box.
- `e2e/drop-into-free-canvas.spec.ts` (new): a text dragged onto a card is
  its child at the dropped place (saved project); the card moved, the text
  moves with it; dragged out over the edge it is on the screen; near the
  edge from outside a table forms; with Ctrl it stays on the screen; a
  table inside the card still takes it into a cell; undo.

## Handbook

`handbuch/objekte/anordnen.md` «Free»: dragging an object in and out,
besides opening the area. Through `maettel-humanizer`.

## Boundaries

- **Always:** `test:quick` per change; handbook in the same work.
- **Ask first:** changing how snapping to tables decides between table and
  area.
- **Never:** a change to what a device receives.

## Success criteria

- [ ] Dragged onto a card or free area, an object becomes its child at the
      dropped place, the area highlighted while over it
- [ ] Dragged out over the edge, it leaves the area
- [ ] Innermost area wins; a table inside still snaps; near the edge from
      outside a table still forms; Ctrl changes nothing
- [ ] Undo in one step; nothing changes on a device
- [ ] Handbook updated; `test:quick` green apart from known load failures
