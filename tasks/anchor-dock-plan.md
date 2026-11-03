# Anchor and Dock (`anchor-dock`): plan

Spec: `docs/2026-11-03-anchor-dock.md` (approved 2026-11-03). Capability map:
`docs/2026-11-03-cards.md`. Branch `anchor-dock` from `main`. Designer only.

## The open point: clipping on the device

The user decided: a free area smaller than its docked objects clips them.
A free area is dissolved on export and no device clips to it. What the
firmware does today (ColorScreenRenderer.cpp, drawText): a text is clipped
to its own **width**; its **height** is the font's, whatever the object says.

So the designer clips by what it exports, and nothing needs the firmware:

- A docked object's size along the dock is cut to the room left (Top/Bottom:
  its height, Left/Right: its width, Fill: both).
- An object that cannot take a smaller size that way - a text's height, an
  icon, a ring, anything outside the Stretch sets - and does not fit whole is
  **left out**: not exported, and not drawn in the preview. In the editor it
  is drawn as an outline, so it can still be found and selected.
- A text cut in width is clipped by the device as today.

Put into the spec as the answer to «Open» in Task 3.

## Order

The cell first, because it replaces what exists and must not move anything;
the free area second, anchors before dock, because dock places objects that
anchors then must not move.

```
T1 lib/anchor.ts + cells (model, migration, blocks, panel, handbook)
 └─ T2 anchors in free areas (resizeFree, «Position», handbook)
     └─ T3 padding and dock (dockFree, clipping, panel, object list, handbook)
         └─ T4 final run and spec ticked
```

Strictly sequential: each task changes `lib/anchor.ts` and the layout pass.

## Checkpoints

- **After T1:** every old project lays out to the same pixels (the
  migration test), blocks unchanged, `test:quick` green. Nothing a user sees
  has changed but the Cell section's two fields.
- **After T2:** a free area dragged larger takes its anchored objects along;
  areas never touched behave as before.
- **After T3:** the card from the spec's success criteria works by hand in
  the designer (heading docked Top, table Fill, area dragged and stretched in
  a cell); shown to the user before T4.

## Risks

| Risk | Mitigation |
|---|---|
| The migration moves an object by a pixel (text's textAlign, labels' default, spans) | The migration test lays out every align/alignY/fill combination, a text and a span, before and after, and compares pixels |
| Anchors applied on every layout pass drift (a stretched area in a cell resized on each pass) | `resizeFree` works from the previous size; a pass that keeps the size returns the same object (keepUnchanged); a test runs the layout twice and expects equal |
| Dragging a free area's corner today moves nothing inside; with Right/Stretch it does, and undo must take both | One `onUpdateObject` with the area and its children; e2e undoes it |
| Dock order follows the object list, which sorts by zIndex | The list order *is* zIndex order; dockFree reads the same sort (`sortChildrenByZIndex`) the list shows |
| Old saved blocks (`alignY: "top"`) | Converted by the same migration |
