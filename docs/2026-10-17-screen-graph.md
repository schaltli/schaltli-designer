# The screen graph

Proposed by the user on 2026-10-17, while specifying charts
(`docs/2026-10-16-charts.md`, decision 12): a page's history lies below
it, a swipe up away, and that does not fit the list of screens that «Next
screen» and «Previous screen» walk through.

Status: a draft. Decisions marked (user, 2026-10-17) are the user's; the
rest is proposed.

## Objective

Screens are laid out on a surface, next to, above and under each other,
as monitors are in Windows' display settings:

```
   [Energie] ── [Wasser] ── [Licht] ── [Heizung]
       │            │                      │
   [Energie-     [Wasser-               [Heizung-
    Verlauf]      Verlauf]               Verlauf]
```

Swiping goes to the neighbour in that direction, and a page's history is
nothing but the screen under it: no screen type, no action and no field
of its own.

## Decisions

1. **Free in both directions** (user, 2026-10-17): a screen can lie left,
   right, above or below another.
2. **A neighbour is a screen docked on, not one that happens to lie
   beside** (user, 2026-10-17: with B right of A, A' above A and B' above
   B, there is no way from A' to B'). Every screen but the first is
   docked on one edge of exactly one other; the screens form a tree, and
   swiping follows only its branches. A' and B' lie side by side on the
   surface and are still not neighbours. (proposed: the designer draws
   the branches as lines between the screens, so one sees which touch.)
3. **No screen docked above or below one that is itself docked above or
   below, for now** (user, 2026-10-17: whether histories may be stacked
   is not known yet). A page has at most one screen above and one below;
   those have no further vertical neighbour. To be lifted when there is a
   use for it.
4. **Swiping goes to the neighbour.** Swiping up shows the screen docked
   below - what lies below is pulled up - swiping left the one docked on
   the right. A swipe with no neighbour in its direction does nothing.
   A swipe action set by hand comes first, for instance «Show Screen
   Menu» on swiping up; that neighbour is then reached another way, or
   not at all.
5. **The knob swipes too** (user, 2026-10-17): its CST816 reads a swipe as
   the round screens do now; the ring keeps next and previous.
6. **The navigator lists the main row, and «←» elsewhere** (user,
   2026-10-17). On a screen of the main row it lists the main row as it
   does now (`docs/2026-10-08-navigator.md`). On any other screen it
   shows one arrow back, pointing against the swipe that led there:
   swiped up to a history, the arrow points down. (proposed: the main row
   is the first screen and every screen docked left or right of it, in
   order; next and previous walk it.)
7. **Hidden screens and popups have an area of their own** (user,
   2026-10-17): in the designer's view of the surface they stand apart,
   not docked anywhere. A popup opens over a screen as now
   (`docs/2026-10-06-popup-screens.md`); a hidden screen is reached only
   by an action naming it.
8. **The pull tab** is drawn by the device on every edge with a neighbour:
   a short line centred on that edge, which a colour display nudges
   towards the middle now and then. There is no object for it.
   (proposed)
9. **Existing projects** load as one row in their present order, so every
   swipe and every «Next screen» does what it did. (proposed)
10. **In the designer** the surface is shown as small screens dragged to
    an edge of another to dock them, as in Windows. (proposed)

## Open

- What a master screen is on the surface: in the area apart, as hidden
  screens are, or not shown at all.
- Swiping on a screen that scrolls (a chart with scrolling on): a
  horizontal swipe scrolls the chart and does not change the screen;
  whether a swipe from the very edge still does.
- What the device contract and the DDF need: each screen's dock (the
  screen and the edge), a feature `screen-graph` for an older board.
