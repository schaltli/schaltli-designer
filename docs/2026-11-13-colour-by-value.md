# Colour by value

Worked out with the user on 2026-11-13, out of the VanPi starter's header.
The starter warns with four red icons in the header (frost, battery, fresh
water, waste water). The user asked whether the navigator could light up
instead: «then it is clear where to look». Today it cannot. A rule gives an
icon or a text but never a colour, and the navigator draws every screen icon
in its own ink. **Status: draft, not yet approved.**

## Objective

The user's flow, which the spec has to make possible:

1. The fresh water drops to 1 %.
2. The navigator's icon of the Water screen turns red.
3. They tap it. On the Water screen, the tank's bar is red and «1 %» next to
   it too.

The limit («below 10 %») is set **once**, on the tank. The navigator follows
it and is not given a second copy of it to keep in step.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `icon-colour` | Wherever an icon is chosen, a colour can be chosen with it | designer, firmware, app | - |
| `result-colour` | A rule's result can carry a colour: icon, text, and the fill of a bar or gauge | designer, firmware, app | `icon-colour` |
| `screen-state` | Per screen, two derived combined topics: «something on it is Alarm», «something on it is Warning» | designer only | `result-colour` |

Build order: `icon-colour` and `result-colour` together, since they touch
the same drawing code on every device. Then `screen-state`, which needs no
firmware: devices compute combined topics already (generation 1.4), whichever
screen is showing.

## Decisions

### Colour where an icon is chosen (`icon-colour`)

1. **«This icon, in this colour».** Every place an icon is chosen offers a
   colour next to it, optional. That covers the Icon object, a rule's icon
   result, a screen's icon in the navigator, a button's icon and the energy
   diagram's nodes.
2. **No colour means as today.** The icon takes its surroundings' colour:
   the object's Icon colour, the navigator's ink, the button's label colour.
   Existing projects do not change.
3. **A colour is a role or a fixed colour**, stored as colours are stored
   everywhere else (a role name or `#rrggbb`). The picker offers roles first.
   A role is resolved on the device when it draws, so a light/dark switch
   recolours it.
4. **The colour on the icon wins** over the surroundings'. This is what lets
   the navigator draw one screen's icon red and the others in its ink.
5. **Icons with colours of their own stay as they are.** A multicoloured
   icon is not tinted, here or anywhere. The picker keeps its amber note
   (`IconTintField`) for such icons.

### Colour in a rule's result (`result-colour`)

6. **Every result can carry a colour.** `Result` gets an optional `colour`:
   `{ kind: "icon", icon, colour? }`, `{ kind: "text", parts, colour? }`.
   «Below 10 % → "{value}", in Alarm». The same goes for Otherwise and No
   value yet.
7. **A text result colours its whole Text object,** not only the part the
   live value inserts. If several live values in one text give a colour, the
   first in the text wins. (Colouring only the inserted part needs styled runs
   inside one label on every device. See open question 1.)
8. **The fill of a bar or a gauge** gets colour rules over its own value. A
   live value on the object's topic gives results of a third kind,
   `{ kind: "colour", colour }`. No rule applies: the fill colour set in the
   panel. The rule form is the one text and icon use, with a colour picker as
   the result.
9. **Precedence:** a result's colour, then the colour at the icon (decision
   1), then the object's colour, then the surroundings'.
10. **Devices:** Knob, 4", 4.3B, PaperS3 (a role as its grey) and the Android
    app take the colour per result and per icon instead of per object. The
    cases they must agree on go into `lib/live-value/vectors.json`. A project
    that uses a colour in a result needs the new firmware and app. The export
    raises the system generation, and the transfer dialog flashes or asks for
    an app update, as it does for local topics.

### Derived topics per screen (`screen-state`)

11. **Each screen has two combined topics, derived and never stored:**
    «Water: Alarm» and «Water: Warning». Each is «any» over every rule on the
    screen whose result has the role Alarm (or Warning). That means rules in
    texts, icons and fills, in nested objects too. The condition is the rule's
    own: its source, its operator, its operand.
12. **Only colours set by a rule count.** A button that is always red is not
    an alarm. Otherwise and No value yet do not count either (decision 14).
13. **Referenced by the screen's id, shown with its name.** In the project
    a reader stores `{ namespace: "combined", path: "screen:<screenId>:alarm" }`.
    The picker and the topic list show «Water: Alarm». Renaming the screen
    changes nothing in the project. Deleting it leaves a reference the designer
    marks red, as with any combined topic that is gone.
14. **Exact, or a warning.** Rules are read top to bottom, and the first that
    applies wins. So a coloured rule after another one only applies when the
    earlier one does not, and «any» over the rules' own conditions would light
    up too often. The derivation is exact when every rule before a coloured
    one has the same colour. Otherwise the designer says next to the rule that
    the screen's topic does not follow it. The same note goes on a colour set
    in Otherwise.
15. **Offered, not imposed.** The topics appear in the topic list as
    «automatic», greyed out and not editable, under the combined topics. Any
    reader can pick them: a screen's icon in the navigator, a warning in the
    header, a text. Nothing reads them unless someone picks them. An unread
    one is not exported.
16. **A screen with no coloured rule has no such topics** and offers none.

### The navigator

17. With all three modules, the screen's icon in the navigator becomes an
    ordinary live icon: «Water: Alarm» is yes → water drop, in Alarm;
    «Water: Warning» is yes → water drop, in Warning; otherwise water drop.
    Nothing in the navigator is special.

## The starter afterwards

Once built, the VanPi starter (`templates/vanpi-4.json`, golden copy
«VanPi-Starter (Fertig)») gets:

- On the Water screen: the fresh water's bar and value in Alarm below 10 %,
  the waste water's above 90 %.
- On the Energy screen: the battery below 20 %.
- In the navigator: Water, Energy and the climate screen read their
  screen's topics.

Whether the four warnings stay in the header is the user's call then. They
say *what*, and the navigator says *where*.

## Open questions

1. **Colouring only the inserted part of a text** («Fresh water» stays, «1 %»
   red). Is it worth styled runs in a label on four devices? Recommendation:
   not now. A value in a colour of its own can be its own Text object.
2. **Which objects besides bar and gauge** get fill rules: slider, dial, the
   energy diagram's charge ring? Recommendation: bar and gauge first, the
   others when a project asks.
3. **Good** as a third derived topic, for «everything fine» in green?
   Recommendation: no, until someone wants it.
4. **Objects that are not shown,** for example a panel of a switcher that is
   hidden. Should their rules count? Recommendation: yes. The value is the
   van's, not the panel's.

## Tests

- `lib/live-value/vectors.json`: results with a colour, the `colour` kind,
  precedence.
- e2e: the colour pickers next to icons and in the rule form, a red screen
  icon in the preview's navigator, the derivation (exact cases and the note
  of decision 14), rename and delete of a screen.
- HIL: one fixture per device with a coloured result in an icon, a text and a
  bar, switched light/dark.

## Handbook

`objekte/anzeigen.md` (colour in rules, bar and gauge),
`designer/topics.md` (the automatic topics per screen), `designer/screens.md`
(a screen's icon in the navigator), `geraete/waveshare-4.md` (the starter).
