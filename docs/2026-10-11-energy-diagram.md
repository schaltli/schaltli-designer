# Energy diagram

Worked out with the user on 2026-10-11, from the idea in
`docs/ideas/energiediagramm.md`. Mockup of both modes with the demo van's
four situations: https://claude.ai/artifact/Fe7crSShAaeheK9UidGtcN.
Builds on live values (`docs/2026-10-07-live-values.md`, generation 1.4)
and popups (`docs/2026-10-06-popup-screens.md`, generation 1.3).

Status: specified, modules and assumptions approved by the user on
2026-10-11. The target picture, with motion, the user approves before
anything is built: https://claude.ai/artifact/RcPpfG1xFaarXN4VbuUKf3 (see «Target picture»).
Step 1, the firmware spike, comes before everything else (decision 14).
Plan: `tasks/energy-diagram-plan.md`.

## Objective

A van's energy - the sun, the mains charger, the engine's DC-DC charger,
the battery, what draws - is today shown on Schaltli screens with texts,
live icons, a gauge and lines that cannot move. One reads numbers to know
what flows, 6 W and 600 W look alike, and the way energy really takes
(a charger feeding the fridge while the battery idles) is not to be seen.

The energy diagram is one object that shows it at a glance: what comes in,
how much, where it goes, moving while it flows. Its user places it on a
screen, adds nodes (sources, sinks, a storage), gives each a topic, a name
and an icon, and picks a mode, Sankey or Flow. Nobody programs; nothing is
summed outside Schaltli.

Users: whoever builds a panel for a van in the designer - for the demo's
page «Energie» and for the author's van first -, and whoever looks at that
panel in the van.

## Modules

Built and checked one by one, in this order; each has its tasks in
`tasks/energy-diagram-plan.md`.

| Module | Responsibility | Depends on |
|---|---|---|
| `energy-spike` | 4.3B: running dots and one filled band; frame rate, touch latency, pixel diff measured; kept as a HIL test | - |
| `energy-layout` | `lib/energy-diagram.ts`: both modes' layout, the rest, signs, the dots' pace; pure functions, the reference for every renderer | - |
| `energy-designer` | the object in the designer: insert, nodes list, dragging in Flow, preview with motion, theme roles, copy and paste | `energy-layout` |
| `energy-contract` | export, contract §2.8, generation 1.7, baked icons, `supportedObjectTypes` | `energy-designer` |
| `energy-firmware` | the 4.3B draws both modes, motion if the spike allows it, a tap runs the action, HIL | `energy-contract`, `energy-spike` |
| `energy-android` | the Android app draws and moves, the orchestrator's HIL | `energy-contract` |
| `energy-demo` | the demo's page «Energie» rebuilt from the object | `energy-designer`, `energy-firmware` |

Order: `energy-spike` and `energy-layout` side by side → `energy-designer`
→ `energy-contract` → `energy-firmware` and `energy-android` side by side
→ `energy-demo`.

## Assumptions (approved 2026-10-11)

1. One value per node, in watts. Amps alone are turned into watts where
   they come from (the bridge, a flow), not by the object.
2. One bus and at most one storage per diagram; two batteries or a 230 V
   net beside the 12 V one are not in the first version.
3. At most 8 nodes besides the bus.
4. Motion in the designer and on Android in any case; on the 4.3B only if
   the spike shows it costs touch no more than success criterion 3 allows.
5. The rest counts only this diagram's nodes.
6. A tap offers every action a button has, not only «Open popup».

## Capability map

| Need | Exists | New |
|---|---|---|
| A value read from a topic, a JSON field of it | yes (topics, `topic#path`) | - |
| Text with values, rules, formats, «No value yet» | yes (live values, 1.4) | used per node line |
| Icons from the project's assets, themed | yes | - |
| Theme roles for colours, light and dark | yes (`lib/themes.ts`) | six energy roles |
| A tap opening a popup | yes (button action, 1.3) | the same action on a node |
| Redrawing a part of the 4.3B's screen | yes (`renderRegion`) | redrawn on a timer, for motion |
| Curved filled shapes on a device | no | the Sankey's bands |
| An object that moves by itself | no | the dots |
| Battery time to go on MQTT | yes since 2026-10-11 (`schaltli/state/battery/time_to_go`) | - |

## Decisions

1. **One object, `energy-diagram`, with a list of nodes.** Not built from
   lines and icons: the layout, the bands and the motion depend on all
   values at once, which no set of separate objects can share.
2. **A node** has an id, a role, a name, an icon, a read topic for its
   watts, a «reverse sign» switch, up to three lines of live text, a colour
   role, x/y, and optionally an action. UI word «Nodes», handbook «Knoten».
3. **Roles**: `source` (gives, watts ≥ 0), `sink` (takes, watts ≥ 0),
   `storage` (positive: takes, negative: gives; a second read topic for its
   charge in %), `rest` (no topic; see 4), and `bus` (exactly one; see 6).
   A negative source or sink counts as 0.
4. **The rest node** is what comes in and is not measured going out: the
   sum of what gives (sources, a giving storage) less the sum of what takes
   (sinks, a taking storage), never below 0. At most one per diagram. With
   only a battery and the sun this is what the van draws - no flow, no
   bridge sums it.
5. **Signs**: watts as the topic brings them, multiplied by −1 when
   «reverse sign» is on. The storage's convention is «positive while
   charging», as the VanPi bridge's `battery/power`.
6. **The bus** (12 V) is a node of its own, role `bus`, with a name and x/y
   only. Every band and line runs through it; none goes from a source
   straight to a sink, because who feeds whom is not measured.
7. **Two modes, one set of nodes**, a property `mode`: `sankey` or `flow`.
   Switching mode keeps every node and topic.
8. **Sankey**: givers on the left, takers on the right, the bus in the
   middle; a band never thinner than 3 px while it carries anything; a
   node with 0 W is left out - unless nothing flows at all: then every node
   stands on its side at 3 px, grey, with its label, the bus at 3 px too,
   and there is no band (the user, 2026-10-12, after a Sankey that was
   simply blank - «Reverse sign» had turned its only source to nought). The nodes' y orders each side top to bottom;
   their x is not used. A storage stands on the side its sign puts it.
   Each node keeps a label slot of at least 66 px however thin its band.
   Where a band meets a node's bar or the bus, nothing shows between them:
   the bars are rounded on their outer side only, the bus not at all, and
   a band runs 2-4 px under them and is drawn first (the user saw notches
   at rounded corners in the target picture, 2026-10-11).
   **Scale** (the user, 2026-10-11: «linear finde ich am ehrlichsten»):
   linear - a band is as wide as the room for bands times its watts ÷
   full scale, so a width means the same watts in every situation, and
   everything is full from the full scale on. **Full scale** is a property
   in watts, default 1000 W: the most that should still be told apart.
   With an inverter for an induction hob it is the inverter's rating, so
   the fridge is a thread and the hob fills the diagram (the user: «dann
   sieht man, dass der Kühlschrank kaum was nimmt, aber wenn der
   Induktionsherd läuft, die Post abgeht»); a full scale below it would
   show the hob and the DC-DC charger alike. Worked through for the
   author's van on the 4.3B (340 px of room), at 2500 W: fridge and light
   92 W → 13 px, mains charger 400 W → 54 px, DC-DC charger and sun 820 W
   → 112 px, induction hob 2000 W → 272 px; at the default 1000 W: rest
   9 W → 3 px (the minimum), fridge and light 92 W → 31 px, DC-DC charger
   and sun 820 W → 279 px. A quiet evening is a thread - which is what it
   says. Tried and dropped: the
   square root of the total (thicker evenings, but a width no longer means
   the same watts), and filling the room whatever flows (92 W looked like
   670 W).
9. **Flow**: each node a circle at its own x/y, the bus too; its name and
   lines under the circle, centred - or beside it on the right, left-aligned,
   when its line leaves the circle downwards, steeper than 60° below the
   level, and would run through them (the user, 2026-10-11: the target
   picture's Landstrom, straight above the bus, had its line through its
   label); a straight line
   from each node to the bus, its width growing with the logarithm of its
   watts (3-12 px); a node with 0 W is drawn grey with a grey line. The
   storage's charge is a ring round its circle.
10. **Motion**: in the Flow, dots run along each line that carries watts,
    from a giver towards the bus and from the bus to a taker; still where
    nothing flows. The dots stand for current (the user, 2026-10-12: «die
    Kugeln repräsentieren Strom»): all alike (radius 3.5 px), all at **one
    pace**, 40 px a second, and more watts mean **closer dots**. The gap
    shrinks by the same factor every tenfold: 120 px at 1 W, 49 px at
    10 W, 20 px at 100 W, 8 px at 1000 W and above (`dotGap`). So 1 W to
    1000 W can be told apart, and a line never shows fewer dots for more
    watts. Replaced the first build's dots 26 px apart that ran quicker
    with more watts: a long line at 12 W showed more dots than a short one
    at 40 W. In the Sankey a
    **wave** runs through each band instead (the user, 2026-10-11, after
    the C64's colour cycling): soft and subtle - 8 shades a little either
    side of the band's colour (towards the background by 0.42 ± 0.16),
    blended into one another, one period every 48 px along x. All waves
    run at **one calm pace**, a period every 4 s, whatever the band's
    watts: the width already says how much flows (the user, 2026-10-11:
    «ruhig langsam und dezent»; hard palette steps tried and dropped). A
    shade depends only on a pixel's x, so every column of a band is one
    colour, and a device redraws a step as one vertical stroke per column -
    no shape recomputed, nothing erased. A diagram property switches
    motion off. The pace is the same in the designer's preview and on a
    device.
11. **Node lines** are live text exactly as a text object's (`text` with
    `{live:<id>}`, `liveValues` with rules, format, No value yet). The
    first line defaults to the watts, `{watts} W`: **`{watts}`** is the
    node's watts as the diagram has them - after «Reverse sign», the rest
    worked out, whole, a hyphen while its topic has said nothing (a dash is in few device fonts) - put in
    before the line is resolved as live text (decided in D1, 2026-10-12:
    the rest has no topic a live value could read, and a live value on the
    topic would show the sign before «Reverse sign»). Names and quieter
    lines use the diagram's «Font», the first line its «Value font»
    (`fontId`, `valueFontId`; on insert the fonts nearest 16 and 22 px). A node's
    width in the Sankey's labels and the Flow's caption is reserved for
    the widest it can show (`lib/layout.ts`, as for texts since
    2026-10-11).
12. **Colours** come from the theme: six new roles - `energySun`,
    `energyGrid`, `energyEngine`, `energyCharge`, `energyDischarge`,
    `energyLoad` - each with a light and a dark value. A node picks one;
    the storage uses `energyCharge` while taking and `energyDischarge`
    while giving, whatever is picked. The bus uses `accent`. One light and
    one dark value per role, shared by every colour theme (Paper: greys);
    a colour from before themes is never matched to one (`nearestRole`).
    The diagram's own colours are keys like any object's - `textColor`
    (text), `mutedColor` (textMuted), `busColor` (accent), `idleColor`
    (track), `chargeColor`, `dischargeColor` - and each node's `colorRole`
    becomes its `color` when the theme is applied.
13. **A tap on a node** runs its action, the same actions a button has; in
    practice «Open popup». Without an action a tap does nothing.
14. **Order of work**: first a firmware spike on the 4.3B (motion and one
    band, measured), then the designer, then the contract, firmware and
    Android. If the spike shows motion costs the 4.3B its touch or its
    other redraws, the 4.3B draws the diagram still and only Android moves
    (decided then, not now).

    **Spike result, 2026-10-11** (`hil/waveshare4v3b/energy-motion-spike.js`,
    firmware `?set=energyspike`, five lines with 34 dots, one band of some
    80 000 px; a tap's latency measured by the board from the sample to the
    press feedback on the glass, 20 taps, medians):

    | | still | moving | factor | steps/s | blit a step |
    |---|---|---|---|---|---|
    | dots and the Sankey's wave | 73 ms | 121 ms | 1.66 | 8.6 | 21.2 ms |
    | dots alone (Flow) | 73.5 ms | 84.9 ms | 1.16 | 8.7 | 6.8 ms |

    Round two, the user's choice (2026-10-11), measured the same way but
    with the taps at random intervals:

    | | still | moving | factor | p90 moving | steps/s |
    |---|---|---|---|---|---|
    | dots and the Sankey's wave | 74.8 ms | 79.5 ms | 1.06 | 109 ms | 9.4 |
    | the same, again | 74.9 ms | 78.8 ms | 1.05 | 109 ms | 9.0 |
    | dots alone | 75.0 ms | 79.2 ms | 1.06 | 89 ms | 9.8 |

    **Decided: the 4.3B moves both** - the Flow's dots and the Sankey's
    wave. How, and why round one failed:

    - Round one repainted the band on the canvas and owed its rectangle to
      the three framebuffers; whichever present came next - a tap's press
      feedback included - copied it. Round two paints the wave's rows
      straight into every framebuffer and the canvas, from one row of
      colours in internal RAM (a column's colour depends on its x alone),
      and writes them back out of the cache (`esp_cache_msync`): no buffer
      owes the band, no present pays for it. A wave step costs ~20 ms.
    - The step runs at the end of the board's loop, after the touch was
      read, and not while a finger is down; steps keep a fixed 100 ms grid.
    - Round one's numbers were also too gloomy: its taps came at a fixed
      beat, which locked onto the steps' beat, so every tap met a step
      starting. A finger comes at any moment; the HIL test now taps at
      random intervals. About one tap in ten still meets a step and waits
      ~30 ms (the p90).

    Not yet checked: the wave on the glass with an eye (the snapshot reads
    the canvas, not the panel) - the first look at the 4.3B, and the band's
    pixel diff against the designer, which needs the designer's band
    renderer (`energy-designer`) and moves to `energy-firmware`.
15. **Devices**: the 4.3B and the Android app. The PaperS3 and the Knob do
    not list the type in their `supportedObjectTypes`; the designer then
    refuses it there, as for any unsupported type.
16. **Until `energy-contract`** the device zip and the Android bundle leave
    the object out (`lib/energy-diagram-object.ts`), so nothing half-made
    reaches a device. **Generation 1.7.** A device without it gets the diagram dissolved
    into nothing and the Deploy dialog's usual need for an update.

## Behaviour

### In the designer

- **Insert**: tool «Energy diagram» under «Show». A new diagram fills the
  rectangle drawn and comes with a bus and three example nodes - a source
  «Solar», a storage «Storage», a rest «Consumers» - (not «Battery»: the designer's source names no thing of the van, e2e/no-van-words.spec.ts; 2026-10-12) -, mode Flow, nodes
  placed round the bus.
- **Property panel**: Mode (Sankey / Flow), Motion (on / off), Full scale
  (watts, Sankey only; default 1000), and the
  list «Nodes»: each row its icon, name and role; «+ Add node» (Source,
  Sink, Storage, Rest); a row opens the node's fields - Name, Icon, Role,
  Reads (watts), Reverse sign, Charge (storage only), Colour, Lines (up to
  three, each the live text editor texts have), Action.
- **On the canvas, mode Flow**: a node and the bus are dragged by their
  circle when the diagram is selected; that is their x/y, relative to the
  diagram. Mode Sankey: nodes are not dragged; their order follows y,
  changed by dragging rows in the list.
- **Preview**: draws from the preview's values (broker or examples) as a
  device does, motion included.
- **Copy and paste** between projects carries its icons and topics like
  any object (`lib/clipboard-transfer.ts`).

### On a device

- Draws the diagram as the designer does; pixel parity within the HIL
  snapshot threshold for a still frame (motion off, or one fixed phase for
  the snapshot).
- Recomputes on every value of its topics; the rest after all of them,
  at most every 500 ms, so values arriving one by one do not make it jump.
- Moves the dots by redrawing only the bands' or lines' regions, on a
  timer; a touch, a swipe or another object's redraw goes first.
- A tap on a node runs its action.

## Export and device contract (§2.8, new)

The object exported as is, type `energy-diagram`, its properties:

```json
{
  "mode": "flow",
  "motion": true,
  "fullScale": 1000,
  "nodes": [
    { "id": "bus", "role": "bus", "name": "12 V", "x": 270, "y": 150 },
    { "id": "n1", "role": "source", "name": "Solar", "iconAssetId": "...", "topic": "van/energy/solar_watts",
      "colorRole": "energySun", "x": 80, "y": 60,
      "lines": [{ "text": "{live:w} W", "liveValues": [ ... ] }], "action": null },
    { "id": "n2", "role": "storage", "name": "Batterie", "topic": "schaltli/state/battery/power",
      "chargeTopic": "schaltli/state/battery/soc", "reverseSign": false, "x": 460, "y": 220, "lines": [ ... ],
      "action": { "type": "open-popup", "screenId": "..." } },
    { "id": "n3", "role": "rest", "name": "Verbraucher", "x": 460, "y": 60, "lines": [ ... ] }
  ]
}
```

Colours resolved per variant as every themed colour (`colorRole` →
`color`/`colorDark`), icons baked per node as navigator entries are.
Contract additions: the Sankey's layout and band shape (cubic, control
points at the horizontal midpoint), the Flow's line width rule, the pace
of the dots, the rest's computation and its 500 ms settle - all in §2.8 so
the designer and every device compute them the same.

## What the code says (checked 2026-10-11)

- The 4.3B renders a whole screen in about 782 ms and composes a cached
  frame into the panel in 66 ms (15 fps); internal SRAM to framebuffer
  would be 39 fps (`src/boards/waveshare4v3b/main.cpp`, panel benchmark
  of 2026-09-01). Motion is therefore only affordable as regional redraws.
- `renderRegion()` already redraws a rectangle (level drag, navigator
  scroll, feedback); value changes are throttled to one render per 150 ms
  (`TOPIC_RENDER_MIN_MS`).
- No firmware primitive fills a curved shape; lines, arcs, rounded rects
  and triangles exist (`ColorScreenRenderer`).
- Live text on devices (`liveText`, `liveValues`) exists since 1.4; JSON
  fields (`topic#path`) are resolved on devices.
- Object types are listed in `lib/object-types.ts`; a new one needs its
  renderer (`lib/render-screen.ts`), property panel, export
  (`lib/project-zip.ts`, `lib/android-export.ts`), asset baking
  (`lib/asset-export.ts`), generation (`lib/system-generation.ts`) and the
  DDF's `supportedObjectTypes`.

## Target picture

https://claude.ai/artifact/RcPpfG1xFaarXN4VbuUKf3 - an artifact the user
approves before building: the page «Energie» on the
4.3B's 800 × 480 with the master's navigator and light/dark switch, the
diagram in both modes, the dots running at the device's pace (and as the
4.3B would step them), three live lines per node, a tap opening a popup,
light and dark. Where the built thing and the picture differ, the picture
is right unless the spec says otherwise.

## Code style

As the rest of `lib/`: pure functions with the numbers every renderer
shares, English identifiers, a comment saying why with the date it was
decided, German only in the handbook and in the user's own labels.

```ts
/** The gap between two dots on a line carrying `watts`, in px (decision 10). */
export function dotGap(watts: number): number {
  const w = Math.min(1000, Math.max(1, Math.abs(watts)))
  return DOT_GAP_1W * Math.pow(DOT_GAP_FULL / DOT_GAP_1W, Math.log10(w) / 3)
}
```

The firmware's `EnergyDiagram.cpp` and Android's
`EnergyDiagramLayout.kt` mirror `lib/energy-diagram.ts` function by
function, with its name in a comment, as `NavigatorLayout` mirrors
`lib/navigator.ts`.

## Tech stack

Designer: Next.js, canvas renderer as for every object. Firmware:
PlatformIO, `ColorScreenRenderer` plus a band fill and a motion timer in
the 4.3B's loop. Android: Kotlin, a custom view as `NavigatorStripView`.

## Commands

- `npm run test:all` - everything; `npx playwright test e2e/energy-diagram*.spec.ts` - the designer.
- `node hil/energy-diagram.js --device <ip>` - the 4.3B (new).
- Android: the orchestrator in `hil/android/` with the diagram in its fixture.

## Project structure

- `lib/energy-diagram.ts` - layout of both modes, the rest, the pace;
  pure, shared by the canvas renderer and the export's contract tests.
- `components/canvas/renderers/render-energy-diagram.ts` - drawing.
- `components/property-panel/energy-diagram-properties.tsx` - the panel.
- Firmware: `src/project/EnergyDiagram.{h,cpp}` (layout, same numbers as
  `lib/energy-diagram.ts`), band fill in `ColorScreenRenderer`.
- Android: `EnergyDiagramView.kt`, layout in `data/EnergyDiagramLayout.kt`.

## Testing strategy

- The spike: `hil/waveshare4v3b/energy-motion-spike.js` measures frame
  rate, a touch's latency during motion and a band's pixel diff - kept as
  a HIL test, not thrown away.
- `lib/energy-diagram.ts`: unit tests of layout, rest, signs, minimum band
  width, Sankey order by y, the storage changing sides.
- e2e: inserting, the node list, dragging in Flow, mode switch, preview
  values, copy and paste, export shape.
- HIL: the 4.3B against the designer, still frame, both modes, the four
  situations of the mockup; motion running; a tap opening a popup.
- Android: the orchestrator's reference with the diagram.
- The demo's page «Energie» rebuilt from the object
  (`e2e/demo-camper.spec.ts`).

## Boundaries

- Always: the same numbers on the designer and every device (one layout
  module mirrored, contract §2.8); the rest computed, never sent.
- Ask first: dropping motion on the 4.3B after the spike; a third mode.
- Never: a band or line from a source straight to a sink.

## Success criteria

- The demo's page «Energie» is one energy diagram, and a visitor sees
  without reading numbers whether the van lives off the sun, the mains,
  the engine or the battery.
- In the author's van, the diagram shows the charger feeding the fridge
  while the battery idles (the case measured on 2026-10-11).
- On the 4.3B, with the diagram moving (five lines, dots running): the
  dots advance at least 8 times a second, and a tap's latency - from
  `/api/touch` to the redrawn feedback, measured as in the spike - is at
  most 20 % above the same tap on the same screen without motion. If not,
  the 4.3B draws still by decision 14.
- The target picture (`Target picture` below) and the designer's preview
  show the same layout and pace for the mockup's four situations.
- HIL parity for a still frame within the usual threshold on the 4.3B;
  the Android orchestrator passes.

## Not doing

- History, daily totals.
- Bands between a source and a sink.
- The PaperS3 and the Knob; a ring mode for round displays.
- Volts and amps drawn by the diagram itself (they are node lines).
- Routed or curved lines in the Flow mode.
- Warning colours by rule, the diagram as idle screen, insertion through
  Bausteine - next steps.

## Open questions

- Ask Pekaway to put the time to go into `pkw/tele/batt`, so the bridge
  need not read its global `ttgo`?
- The spike decides whether the 4.3B moves (decision 14).
