# Toggle Button: a switch that is one tile

Idea refined with the user on 2026-11-06, from the CamperUI rebuild
(deploy/demo/camperui-project.ts). Variants compared on a page of seven
(claude.ai/artifact/DdwDKCfbjxXxNRasww4yzS); the user chose 1 and 3, which
turned out to be one form.

Status: idea. No spec yet.

## Problem Statement

How might we let a screen show a relay as CamperUI does - one tile that is
its state, coloured while on, a tap switching it - without composing it
from a switcher, a panel per state and a button in each?

Today `relayTile` / `stateTile` build exactly that: seven objects per tile,
16 buttons on «Schalter» alone. It looks right and knows nothing: no ring
for "asked, not confirmed", no «?» when nothing is reported, no Convert to.

## Recommended Direction

A new object type, **Toggle Button**, beside Switch and Button Group, with
the same states, topics, `switchColor` and `switchStyle`. One rectangle
shows the reported state:

- a state with `showAsOn`: filled in the colour, ink by the tone rule;
- any other state: the card colour with its 1-px edge, ink the text
  colour - CamperUI's own look, not the half mixture the knob uses;
- a tap sends the **next** state, wrapping after the last.

Content comes from what a state already has, plus one new optional field:

| | from |
|---|---|
| icon | the state's icon |
| large line | the object's **name** (new, optional) |
| small line | the state's label |

Without a name it is the plain tile: icon and label centred, laid out by
`switchContent` as a segment of a button group is today. With a name it is
the rich tile: icon in a circle on the left, name, state below. One form,
so one port: SwitchShape.h / SwitchShape.kt, a conformance specimen,
`stateIndexForTap` extended by "next".

Convert to gains a chain: Switch <-> Button Group <-> Toggle Button. The
CamperUI rebuild replaces `stateTile` with it, and its GAPS line about
composed tiles goes.

## Key Assumptions to Validate

- [ ] Card colour + edge reads as "off" next to a filled tile, also on 1 bit
      and the PaperS3's greys - render all three depths in the designer.
- [ ] A ring around a full tile says "asked, not confirmed" as clearly as
      the knob does - try it in the preview with a delayed echo.
- [ ] "Next state" is enough for more than two states: try it with the
      Maxxfan's Aus/Manuell/Auto; if it feels like blind cycling, the
      button group stays the answer there and the handbook says so.
- [ ] The rich layout fits CamperUI's 216 x 84 tile at Large with the
      longest name («Abwasserventil») - and degrades sensibly when smaller.

## MVP Scope

In: the type, plain and named layout, the off look, tap = next, ring and
«?», the property panel, Convert to, firmware + Android port, conformance
specimen, the CamperUI rebuild switched over, e2e spec, handbook page.

Out: everything below.

## Not Doing (and Why)

- A button that reads a topic (variant 2) - a second state model beside
  the switch's.
- A colour per state - one colour per object covers CamperUI (green
  relays, a blue roof hatch).
- The name from Pekaway (GAPS line 6) - needs placeholders in the name;
  the field is where it will go, later.
- `outlined` for switches (4), the vertical list (5), a project-wide form
  (7) - each waits for someone who needs it.
- A rocker switch (6) - breaks the Material line, mush on 1 bit.

## Open Questions

- Pressed look: Material's state layer as on the native button, or the
  knob's grow? The button's is already ported.
- Is the name a fixed text or a text style of its own (size of the large
  line)?
- English label in the designer: «Toggle Button» - check it does not clash
  with anything the handbook already calls a toggle.
