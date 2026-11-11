# Energy diagram: its own mode switch

Spec drafted 2026-11-11 from the starter's block review with the user
(`tasks/bausteine-review.md`, «Energy diagram»). **Status: approved by the user on
2026-11-11.** Builds on docs/2026-10-11-energy-diagram.md.

## Objective

Switching an energy diagram between Flow and Sankey takes, today, a
Button Group writing a local topic and a Switcher with **two** diagrams
(the demo «Camper»): every node, topic and icon twice, and a control above
the diagram that looks like the main thing on the screen. The user found
it ugly (2026-11-11).

## Decisions (the user, 2026-11-11)

1. **The diagram carries its switch**: two small icons in a corner of the
   diagram - lines with a dot for Flow, bands for Sankey -, the active one
   in the text colour, the other muted. A tap on an icon switches. A tap on
   a node still runs the node's action; a tap elsewhere does nothing.
2. **Local by itself**: the mode shown is the object's on that display -
   no topic, no Switcher. After a restart or a deploy it starts at the
   object's `mode` again.
3. **Big enough for a finger**: each icon some 20 px, its tap area about
   44 px (4" scale).
4. **A property «Mode switch»**: None, Top left, Top right, Bottom left,
   Bottom right; default None for existing diagrams, Top right for new
   ones. The Sankey keeps that corner free; in the Flow the author places
   the nodes beside it.
5. **The demo «Camper»** is rebuilt to one diagram with its switch; the
   Button Group, the local topic and the second diagram go.

## Export and devices

The export carries the corner and the icons baked per look (active,
muted, light and dark), as node icons are. Devices draw them and hit-test
the two areas; switching re-lays the diagram with the layout they already
have for both modes. Firmware (4.3B, 4", Knob; PaperS3 still) and Android.

## Testing

- `e2e/energy-diagram*.spec.ts`: the property, the icons' place in each
  corner, the Sankey keeping it free, a tap switching in the preview, a
  node's action still run.
- Demo spec: one diagram, no Switcher.
- HIL: a tap on the icon switches on the 4.3B and the 4".
- Handbook: the energy diagram's page; the demo's description
  (`handbuch/einfuehrung/ausprobieren.md`).
