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
   What a swipe does is decided in this order (user, 2026-10-17):
   1. the screen's own swipe action;
   2. the neighbour in that direction;
   3. the swipe action the screen inherits from its master.

   So a master's «Swipe left → Next screen» still works everywhere, and
   in a single row the neighbour is the screen it would have shown
   anyway; a master's action never hides a screen docked below.
5. **The knob swipes too** (user, 2026-10-17): its CST816 reads a swipe as
   the round screens do now. The ring is not for navigating (user,
   2026-10-17): it turns the value a screen sets, a dimmer or a heater's
   temperature. A knob reaches a screen further away with the map
   (decision 15).
6. **No screen menu** (user, 2026-10-17). The device action «Show Screen
   Menu» goes, on the knob and in the Android app alike:
   - In the Android app the navigator has taken over its job.
   - **The knob shows where a swipe leads, while swiping**: as soon as a
     touch moves far enough to be a swipe, the knob shows at each edge
     that has a neighbour that screen's icon and name - 12, 3, 6 and 9
     o'clock on the round display - and they fade as the screen follows
     the finger. (proposed: how far is «far enough», and whether the
     hints show on touch-down already.)
   - A tap stays a tap: nothing shows before the touch moves.
   - **Projects that use it**: the designer removes the action when it
     opens the project and says so once («The screen menu is gone: swipe,
     the ring or the navigator change screens now»). A device keeps
     obeying it until its next deploy, so an older board's project does
     not break. The device-action mechanism itself (`deviceActions` in
     the DDF, `docs/device-contract.md`) stays, with no action left for
     now.
   - The screen icons stay: the navigator and the knob's hints show them.
7. **The navigator lists the main row, and «←» elsewhere** (user,
   2026-10-17). On a screen of the main row it lists the main row as it
   does now (`docs/2026-10-08-navigator.md`). On any other screen it
   shows one arrow back, pointing against the swipe that led there:
   swiped up to a history, the arrow points down. (proposed: the main row
   is the first screen and every screen docked left or right of it, in
   order; next and previous walk it.)
8. **Hidden screens, popups and masters have an area of their own**
   (user, 2026-10-17): in the designer's view of the
   surface they stand apart, not docked anywhere. A master is never seen
   on a device; it is a template. A popup opens over a screen as now
   (`docs/2026-10-06-popup-screens.md`); a hidden screen is reached only
   by an action naming it.
9. **The pull tab** is drawn by the device on every edge a swipe leads to
   a neighbour from: a short line centred on that edge, which a colour
   display nudges towards the middle now and then. There is no object for
   it. Where the screen's own swipe action takes that direction (decision
   4), the swipe does not lead to the neighbour, and there is no tab: a
   tab promises what the gesture does (user, 2026-10-17). The navigator's
   «←» stays even then, since it is tapped, not swiped. The designer
   warns when an own swipe action cuts a neighbour off, so that no swipe
   and no action reaches it. (proposed: the look of the tab)
10. **A swipe belongs to what it starts on** (user, 2026-10-17), as a slider's
    and the navigator's do now (`docs/2026-10-08-navigator.md`, decision
    13): a horizontal swipe that starts on a scrolling chart scrolls
    through time, one that starts beside it changes the screen. A
    vertical swipe changes the screen on a chart too, since a chart
    scrolls only sideways. No special case for a swipe from the very
    edge: on Android the edge belongs to the system's back gesture, and
    on the knob it is too narrow to hit.
11. **Existing projects** load as one row in their present order, so every
   swipe and every «Next screen» does what it did. (proposed)
12. **In the designer** the surface is shown as small screens dragged to
    an edge of another to dock them, as in Windows. (proposed)
13. **The device computes nothing** (user, 2026-10-17), as with charts
    (`docs/2026-10-16-charts.md`, «Data model»). In the project each
    screen has `dock: { screenId, edge }`; on export the designer writes
    out each screen's `neighbours: { up?, down?, left?, right? }`, its
    `back` (the direction of the screen it is docked on, for the «←») and
    the main row in order for next and previous. A device follows no
    tree.
14. **A feature the device declares** (user, 2026-10-17): `screen-graph` in its
    DDF. Deploy gates on it only when something is docked off the main
    row; a single row runs on an older board as it is. Otherwise Deploy
    brings the board up to date first, as with `local-topics`.

15. **The knob jumps through a map** (user, 2026-10-17). A swipe that
    ends in a pause, the finger still down, opens the screen graph as a
    map: the screens as small tiles around the current one, the branches
    between them. The finger becomes the pointer; the tile under it is
    lit, and lifting the finger jumps there. Lifting it over the current
    screen, or off every tile, cancels. Near the round edge the map pans,
    so a graph larger than the display is reached all the same. A short
    swipe stays a swipe to the neighbour. While the map is open the 5 s
    setup hold does not count: a finger resting on a tile is choosing,
    not asking for setup. Only screens of the graph are on the map;
    hidden screens, popups and masters are not (decision 8). Any device
    may show it; the knob needs it, having no navigator. (proposed: the
    pause is about 0.4 s, and the map is the designer's view of the
    surface, drawn small)
16. **Four actions for the neighbours** (user, 2026-10-17): «Go to the
    screen above», «… below», «… left» and «… right» do what the swipe in
    that direction would do without the screen's own swipe action. So a
    project can put the screen graph on hardware buttons, one for each
    direction, and work without swiping at all, as «Next screen» and
    «Previous screen» walk the main row. With no neighbour there, the
    action does nothing. The export already carries `neighbours`
    (decision 13); the device computes nothing for them.

## Open

- How far a touch must move on the knob before the swipe hints show.
- How long the pause is that opens the map (proposed: 0.4 s), tried on
  the knob in a hand.
