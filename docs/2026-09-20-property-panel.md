# The property panel: seven positions and fourteen fields

Agreed 2026-09-20, after the slider, the button and the switch. Those three
settled what a control *looks like on the device*. This settles what its
properties look like *in the designer* - the one surface all of them are edited
from, and the last one still built the way each panel happened to be written.

The user's complaint was that the order of the properties looked accidental and
the panel looked noisy. Both turned out to be measurable.

## What was found

**The order was accidental.** The position block (X/Y/W/H) sits last in eight
panels, first in three (`text-field`, `icon`, `arc-level`), in the middle in one
(`tab-control`), and is missing entirely from `mqtt-data-line`. Within the
panels the same thing: the font sits *before* the states it labels in the
Switch and *after* everything in the Level Indicator. No panel had a section
heading; grouping was a `<Separator>` in three files, a bold `<Label>` in one,
a `border-t` in another, and nothing at all in nine.

**The same kind of value had different controls.** Stroke width and corner
radius are `<Slider>` in Box, Line and MqttDataLine and a number `<Input>` in
Arc and Level. Ten panels use the shadcn `<Select>`; Software Button and Switch
use a native `<select>` with their own class string. There are four icon
pickers: `icon-picker.tsx`, a local `IconPickerField` in `switch-properties.tsx`,
and an inline block each in `icon-properties.tsx` and
`software-button-properties.tsx`. There are four operator lists: three
byte-identical `const OPERATORS` (`panel-properties.tsx:8`,
`tab-control-properties.tsx:63`, `mqtt-data-line-properties.tsx:10`) and a
fourth in `mqtt-icon-field-properties.tsx` that uses `=` instead of `==` and
drops `!=`. The X/Y/W/H block is copied word for word into twelve files.

**Names collided.** `line-properties.tsx` has two controls labelled "Width" -
line 132 is the stroke, line 333 the object. The same quantity is "Stroke
Width", "Width", "Thickness", "Bar Thickness (px)" and "Marker width (px)"
depending on the file. The fill style is "Style" on the button and "Selection"
on the switch for the same stored values.

**The noise was an alignment problem, not a border problem.** Removing the
borders was tried first and read as untidy. Measuring showed why: the *text* in
each row starts at six different x positions across a 44 px span - 150 for a
text field, 170 for a colour name (the swatch pushes it), 176 for an icon name,
186 for a toggle label, and 187 or 194 for a number, which was right-aligned in
a 66 px box and therefore flutters against itself as digits are added. A filled
field hides this, because the eye locks onto the box edge instead of the text.
That is the whole reason the filled variant looked tidier.

## Decisions

**1. Seven positions, one order, every object.** Content -> Data -> Shape ->
List -> Text -> Colour -> Frame. A position an object does not need is left
out; none ever swaps place. Coarse to fine: what it says, where its value comes
from, what shape it takes, its repeated parts, its type, its colour, and last
the rectangle - which is last because you drag it on the canvas, not here.

**2. The position is fixed, the name fits the object.** Position 2 is "Data",
"Action" on the Software Button, "Visibility" on the Panel. Position 4 is
"States", "Panels", "Rules", "Calibration" or "Points". A heading that said
"List" over the switch's states would be true and useless.

**3. Every section keeps its heading, even with one row.** About fifteen
sections in the set hold a single row, and a heading costs 20 px plus a 16 px
gap to show 28 px of content. It is kept anyway: the promise is "the same
sections in the same order everywhere", and a font row that sometimes sits
under "Text" and sometimes floats free is exactly the arbitrariness being
removed. Every heading is also the handle that collapses it.

**4. The name on the left, in a fixed 124 px column.** Not above the field. That
halves a property from 52 px to 28 px and lets the names form a readable column.
The panel is resizable between 280 and 900 px (`project-editor.tsx:686`), so:
the name column stays 124 px, the control grows but stops at 360 px - past that
the panel keeps air on the right rather than a 744 px box around the number 28 -
and below 380 px of panel the name folds back above the field.

**5. Every control fills the column. One left edge, one right edge.** This is
the fix for the flutter, and it is what makes the fill a choice rather than a
crutch. The text of every row starts at the same inset; the unit, the chevron
and the type badge sit at the far edge. Numbers are left-aligned like every
other value.

**6. A quiet fill instead of a border.** `#f4f4f5`, no border, 6 px radius. On
hover the field takes a `#e4e4e7` border and a white ground; on focus the
border is the accent. Twenty rows stop being twenty rectangles without the
field stopping being a field. This was chosen over the borderless variant after
both were shown with the alignment fixed, so the choice was about the fill
alone.

**7. The swatch and the icon thumbnail stay on the left.** They were moved right
while the alignment was being chased, which is where a purely text-aligned
panel wants them. With the fill they can go back: the box edge carries the
column, so the swatch leading the name costs nothing. A colour is the value, not
an ornament, and it belongs where it is read first.

**8. One control per kind of value.** Every number is a number field with its
unit inside it - no sliders. A slider needs its own line under the name, about
26 px, and lands on a value worse. What a slider was good for comes back
another way: **the name on the left is a drag handle**, dragging it left and
right scrubs the value, the way Figma and Blender do it. Pointer events, so it
works on a touch panel too. Every list is the shadcn `<Select>`; the two native
`<select>` panels lose theirs.

**9. Short names. The placeholder says what a field wants; a question mark says
the rest.** Today the explanation is crammed into the label - "Name (optional,
drawn above the bar)", "Step (when set by a finger)", "Topic (setpoint marker,
optional)". None of that fits a 124 px column, and a permanent grey line under
the row would spend the height just saved. So the name is short, the empty
field carries a grey placeholder, and where that is not enough a small question
mark in the row opens the sentence on hover.

**10. Frame last, collapsed, four fields in one row.** X, Y, W and H side by
side with a caption under each, instead of two rows of two. A value the program
derives - a label's height, an icon's second dimension, an arc's size - is grey,
carries a lock, and says why. Today those are `disabled` with no explanation at
all (`label-properties.tsx:303`, `text-field-properties.tsx:102`,
`mqtt-data-field-properties.tsx:366`).

**11. Collapsing is remembered per section name, across objects.** One
`localStorage` key, `screenbee.panelSections`, beside the existing
`screenbee.showAdornment`. Not in the project file: that would make every click
a project change and leave the recovery copy stale. "Frame" starts collapsed,
everything else open. Somebody who never calibrates loses that section once,
everywhere - the names are shared vocabulary, so the setting is too, and
"Calibration" closed does not mean "States" closed.

**12. A collapsed section that has something to say, says it.** The summary on
the right of the heading turns amber and names the thing - "1 unregistered"
instead of the topic. `topic-selector.tsx:328` already raises that flag; it
would otherwise be invisible behind a closed section. The section does not open
itself: that would overrule decision 11 and make the panel jump.

**13. English, cleaned.** Not translated, although the audience is a
German-speaking forum. The object names are English in `device-contract.md` and
in every DDF, so translating the labels alone produces a mixture and
translating the type names too is a second project. After this rebuild every
label passes through fourteen components instead of twenty-four files, which
makes a later translation cheaper than it is today, not dearer. What is fixed
now: the second "Width" on the line becomes "Stroke width", units leave the
labels and move into the fields, "Selection" on the switch becomes "Style", and
capitalisation stops alternating.

## The fourteen fields

Under `components/property-panel/fields/`. Three existing components already do
their job and are wrapped, not replaced.

| Field | For | Replaces |
| --- | --- | --- |
| `PropertySection` | heading, collapse, summary, amber flag | `<Separator>`, bold `<Label>`, `border-t`, nothing |
| `PropertyRow` | name left, control right, drag handle | 24 hand-written row shapes |
| `TextField` | a string | scattered `<Input>` |
| `NumberField` | a number with a unit | `<Slider>` in 3 files, `<Input>` in 2 |
| `NumberPair` | two numbers that belong together | the arc's angles |
| `SelectField` | a choice | shadcn `<Select>` x10, native `<select>` x6 |
| `ColorField` | a colour | wraps `ColorDepthAwarePicker` |
| `FontField` | a font | wraps `FontSelect` (unified 2026-09-19) |
| `TopicField` | a topic and its type | wraps `TopicSelector` |
| `IconField` | pick, show, clear an icon | 4 separate implementations |
| `ConditionRow` | operator and value | 4 operator lists, one of them different |
| `ToggleRow` | a yes/no with a sentence | bare `<input type=checkbox>` |
| `FrameFields` | X, Y, W, H, locks | 12 copies of the same block |
| `ListSection` | states, panels, rules, points | 4 separate implementations |

`OPERATORS` moves to `lib/` and is one list: `==` `!=` `>` `>=` `<` `<=`.

## The geometry

Panel padding 14. Name column 124, gap 4, control fills the rest to a maximum
of 360. Inset inside a control 8, and that is the one left edge; the unit,
chevron and badge sit 8 from the right. Control height 28, radius 6, rows 8
apart, section heading 20 high, sections 16 apart. Fill `#f4f4f5`, hover border
`#e4e4e7`, focus border `#6750A4`.

## Per object

Position 4 is named per object. A dash means the object has no such section.
The objects are the ones after the split and rename agreed the same day
(`2026-09-20-control-split.md`); the old names are in brackets where they
differ, for reading the old panels.

| Object | 1 Content | 2 Data/Action | 3 Shape | 4 List | 5 Text | 6 Colour | 7 Frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Text (Label) | text, align | - | - | - | font | text, bg, border | x y w h* |
| Live Text (MQTT Data Field) | show as, prefix, suffix, decimals, thousands | topic | - | - | font, align | text, bg, border | x y w h* |
| Icon | icon | - | - | - | - | icon, bg, flatten | x y w h* |
| Live Icon (MQTT Icon Field) | - | topic | - | Rules | - | icon, bg | x y w h* |
| Bar (Level Indicator, no write topic) | name, icon, show value | topic | direction, thickness, marker, marker width, setpoint topic | Calibration | font | fill, track, marker, text | x y w h |
| Gauge (Arc Level, no write topic) | show value | topic, setpoint topic | angles, direction, thickness, marker width | Calibration | font | fill, track, marker, text, bg | x y size* |
| Slider (Level Indicator, write topic) | name, icon, show value | topic, write topic, step | direction, thickness, marker, marker width, setpoint topic | Calibration | font | fill, track, marker, text | x y w h |
| Dial (Arc Level, write topic) | show value | topic, write topic, setpoint topic, step | angles, direction, thickness, marker width | Calibration | font | fill, track, marker, text, bg | x y size* |
| Switch (Switch, mode single) | - | read topic, write topic | style | States | font | switch | x y w h |
| Button Group (Switch, mode segmented) | - | read topic, write topic | style | States | font | colour | x y w h |
| Button (Software Button) | text, icon | action (+ target / topic + message / device action) | style | - | font | button | x y w h |
| Line | - | - | stroke width, style, caps, corner radius | Points | - | stroke | x y w h |
| Live Line (MQTT Data Line) | - | topic | corner radius | Points, Width by value, Arrows | - | stroke | x y w h |
| Box | - | - | stroke width, corner radius | - | - | fill, stroke | x y w h |
| Switcher (Tab Control) | - | topic | - | Panels | - | - | x y w h |
| Panel | name | shown when (Visibility) | - | - | - | - | derived |
| Screen | name, icon | master, show master | swipe navigation | - | - | background, grid | - |
| Multiple | - | - | - | - | - | - | x y w h, align, distribute |
| Hardware Button | - | action | - | - | - | - | - |

`*` a derived dimension, locked with its reason.

Nineteen panels, not seventeen: the legacy `field` panel goes (it was never
creatable), and three objects become six. Bar and Gauge are the short ones -
no write topic, no step, nothing a finger does. Switch and Button Group differ
only in the Shape section: the knob has no `mode` left to choose, and the
group's style is the connected-button-group's.

Live Line gains a Frame section it never had. That is not cosmetic: it shares
`getLinePoints` with the plain line (`render-mqtt-data-line.ts:33`), and that
function falls back to `{x, y}` -> `{x+width, y+height}` when
`properties.points` is unset (`render-line.ts:46`). Such a line is positioned by
values its panel offers no way to edit.

## What this costs

Nineteen rounds, one panel each, a picture before the code - the rhythm the
slider and switch rebuilds used. For those days the designer holds two looks at
once: a Text already rebuilt, a Box not yet. That is irritating in a tool with
one user and nothing worse, and it buys the ability to stop or change course
after any round. The order runs small, then hardest, then the rest: Panel (2
rows) proves the field set at all, Slider (19 rows, ten of the fourteen fields)
finds what is missing in round two rather than round fifteen; Bar comes right
after it, because it is the Slider with three sections taken away and shows
whether the fields subtract as cleanly as they add.

The real risk is not ugliness, it is a property quietly disappearing while a
panel is rewritten. Before round one, every old panel's controls are harvested
into an expected list, and `e2e/property-panel.spec.ts` checks per object type
that the sections appear in the canonical order and every expected control is
reachable. Renames are explicit entries in that mapping - "Bar Thickness (px)"
-> "Bar thickness" - so a changed name is always a decision and never a slip.
Six of the 68 existing specs read panel labels and need updating:
`bausteine`, `mqtt-data-line`, `software-button-look`, `switch-render`,
`topic-selector`, `hardware-button-master-inheritance`.

No stored property key changes. The labels are display only; `updateProperty`
keeps writing `barThickness`, `markerStyle` and the rest, so projects stay
readable and no device firmware is touched.

## Left open

The dialogs keep their own look - `project-settings-dialog.tsx` alone is 1875
lines of tabs, tables and uploads, which is a different layout problem than a
list of properties. The rule agreed here covers the right-hand panel, including
the hardware-button panel that shares its frame, and nothing else.

Whether the panel should be German is deliberately deferred, not dismissed; see
decision 13 for why it gets cheaper rather than dearer by waiting.

Whether the Frame section deserves the Figma trick - the label as a glyph
inside the field, which is how Figma fits X/Y/W/H into a 240 px panel - was
raised and left alone. It works for X, Y, W and H, which everyone recognises,
and not for "Bar thickness" or "Setpoint topic", which is why the name column
stays.
