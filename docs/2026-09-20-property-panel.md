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
`localStorage` key, `schaltli.panelSections`, beside the existing
`schaltli.showAdornment`. Not in the project file: that would make every click
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
| Bar (Level Indicator, no write topic) | name, icon, show value | topic | direction, thickness, marker, marker width, setpoint topic | Calibration | font | fill, marker, text, icon | x y w h |
| Gauge (Arc Level, no write topic) | show value | topic, setpoint topic | angles, direction, thickness, marker width | Calibration | font | fill, track, marker, text, bg | x y size* |
| Slider (Level Indicator, write topic) | name, icon, show value | topic, write topic, step | direction, thickness, marker, marker width, setpoint topic | Calibration | font | fill, marker, text, icon | x y w h |
| Dial (Arc Level, write topic) | show value | topic, write topic, setpoint topic, step | angles, direction, thickness, marker width | Calibration | font | fill, track, marker, text, bg | x y size* |
| Switch (Switch, mode single) | - | read topic, write topic | style | States | font | switch | x y w h |
| Button Group (Switch, mode segmented) | - | read topic, write topic | style | States | font | colour | x y w h |
| Button (Software Button) | text, icon | action (+ target / topic + message / device action) | style | - | font | button | x y w h |
| Line | - | - | stroke width, style, caps, corner radius | Points | - | stroke | x y w h |
| Live Line (MQTT Data Line) | - | topic | corner radius | Points, Width by value, Arrows | - | stroke | x y w h |
| Box | - | - | stroke width, corner radius | - | - | fill, stroke | x y w h |
| Switcher (Tab Control) | - | topic | - | Panels | - | - | x y w h |
| Panel | - | shown when (Visibility) | - | - | - | - | derived* |
| Screen | name, icon | master, show master | swipe navigation | - | - | background, grid | - |
| Multiple | - | - | - | - | - | - | x y w h, align, distribute |
| Hardware Button | - | action | - | - | - | - | - |

`*` a derived dimension, locked with its reason. A Panel has no frame at
all - it fills its switcher's box - and no name either: it is known by the
value it answers to, which is what the object tree shows ("Panel: auto").
This table said it had one until round 1 went to build it.

Round 2 corrected the Bar and the Slider the same way. There is no Track
colour on either, though this table and the mockups both listed one: the
track is mixed from the bar's own colour and the screen's background
(`2026-09-19-slider-look.md`, decision 12), and a control for it would put
back the thing that decision removed. The Gauge and the Dial do have one -
their unfilled ring is a real colour - so the row stays on those two. And an
icon that is drawn gets a colour, which this table forgot for every object
that has one: it is the last row of the Colour section, shown only once an
icon is chosen.

The marker rows (style, width, setpoint topic, colour) belong to the Bar as
much as to the Slider, which is what the mockups show and what the renderer
has always done - `levelHasHandle` draws a marker for either binding. The
old panel hid all four unless the object was settable *and* had a write
topic, so a bar reporting a thermostat's target could only be given one by
editing the project file.

Round 3, the Gauge and the Dial, added the one rule this table cannot
express: **a field is shared unless the object has something no other
object has.** The arc has exactly one such thing - its scale has to be told
where it starts and where it stops - and the clock face that says so in
clock positions ("from half past seven to half past four") is kept, sitting
above the pair of angle boxes the mockups drew. It is the only bespoke
control in nineteen panels, and one is not a licence for one per panel.

Two smaller things fell out of that round. The four scale presets were
German ("Voll", "Tacho", "Halbrund") in an otherwise English panel and are
now Full ring, Thermostat, Speedometer and Half. And an arc's Frame shows
four boxes, not three: X, Y, Size, and a read-only H carrying the reason
the two are one number. Showing the height and locking it beats leaving it
out - "why is there no height here" is a question the panel should answer
rather than avoid.

Round 4, the Switch and the Button Group, is what the list was built for.
A state used to be a bordered card about 180 px tall holding five
controls, so the fixture's three states filled the panel twice over;
closed, a state is one line that says what it is - "1  Off · off" - and
three of them plus every other section now fit on one screen. The two
types differ in exactly two rows: a knob asks which states count as
switched on, a group asks each state for a second icon to wear while it is
the chosen one.

It added `TextPair`, which is not a fifteenth field: it is the pair layout
`NumberPair` already had, for text. A state's read value and write value
only mean anything together - "off" going out is the answer to "off"
coming in - and a row each costs a line per state for nothing. Both boxes
name themselves, as the arc's angles do.

The Colour row is named for what takes the colour - "Switch" on a knob,
"Buttons" on a group - rather than the mockups' "Colour", which under a
section already called Colour said the word twice and the thing not at
all.

Round 5, the Button, is the first panel whose second position is Action
rather than Data - and it is the same position: what the object is wired
to. A button is wired to a thing that happens instead of to a value that
arrives, and the rows that thing needs appear under it: a screen to go
to, an id the device knows, or a topic and a message. Nothing else about
the order changes, which is the point of having one.

It also corrects something round 2 wrote down wrongly: three object types
offer an icon colour (Bar, Icon, Live Icon), not four. A button's icon
takes the label's colour, which is worked out from the button's own
(`2026-09-19-button-look.md`), so there is nothing to set.

Round 6, Live Text, is the first panel whose Content is a formatting
block rather than a thing to write: what it shows is the topic's value,
and Content is how that value is dressed. Prefix and suffix became a
`TextPair` - they are the two ends of one idea - and the four formatting
rows appear only for a formatted number, since an arriving string is
shown exactly as it arrives.

That conditional is why the completeness list grew a variant. It only
ever recorded the as-is case, so prefix, suffix, decimals and thousands
were never in it at all; `mqtt-data-field-formatted` was harvested from
the *old* panel before the rewrite, so the rebuild had something to be
held against. New fixture objects go last, because `place` lays them out
in a grid in call order and every Frame summary is part of the list.

Two things were paid for. The type pills inside the "Show as" dropdown
("text", "numeric") cannot survive a native `<select>`; what they said -
a formatted number needs a numeric topic - is on the row's question mark
instead. And the height, which was already a disabled box in the old
panel, is a locked one here: read-only rather than disabled, so it can
still be selected and copied, with the reason on the row instead of in
the greyed-out look. The harvest records `:readonly` now, so a lock that
quietly disappears is a visible diff.

Round 7, Text, is the simplest object there is, which is what makes it
the place to stop hiding the placeholder tokens. `{screen}`, `{project}`
and the five others were behind an "Insert Placeholder" dropdown; they
are a `ButtonGroupRow` now - the use the field set was given it for - so
a person can see that they exist without opening anything. Align moved
to Text beside the font, where Live Text already had it: the table put
the same property in two different sections, and the promise is that it
is in one.

**The completeness list records names, not bindings**, and round 7 is
where that bit. The old panel wrote a text colour to `color`; the rewrite
wrote it to `textColor`, which the shared text-box renderer only consults
as a fallback and the firmware's ScreenRenderer likewise - so the row
would have looked perfect, harvested identically, and edited a property
nothing reads. Nothing in the list could have caught it. Reading the old
file line by line is not optional, and a default (`#ffffff` here, not
`transparent`) is part of what has to survive.

The harvester learned one thing from this round as well: a button is
named by what is written on it, with `title` the fallback for an
icon-only one, exactly as a screen reader takes it. A preset that says
"Full ring" was being recorded as its tooltip.

Rounds 8 and 9, Icon and Live Icon, went together: the shortest panel of
the nineteen and the longest saving of them (531 lines to under 200).
Both are square - the artwork is, and the canvas has always enforced it
when one is drawn or resized - so both lock the height to the size, which
leaves the panel no longer able to type an oval the canvas would never
produce. The icon slot itself was written out by hand in this file too;
that was the fifth copy.

Live Icon had the operator list that disagreed with the other three: `=`
where they say `==`, and no `!=` at all. Moving it onto the shared
`ConditionRow` means the panel now writes `==`, which the firmware has
long accepted both spellings of - but the designer's own preview knew
only `=`, so it was taught the same two, plus the `!=` the row can now
produce. A panel that can write something the preview cannot read is
worse than one that offers less.

And the list's grip became real. It was `cursor-grab` over nothing for
four rounds - the shared `ListItem` drew it because the design called for
it - while the only working reordering in the app was two arrow buttons
in this one panel. Now the grip drags, and it is drawn only where it
works. Order is the meaning in three of the five lists: a Live Icon's
rules are read top to bottom, a group's states are its segments left to
right, a switcher's panels are tried in turn. The Switch picked that up
in the same commit, having never had any way to reorder at all.

Rounds 10 and 11, Line and Live Line, took two more sliders - stroke
width and corner radius. (They did not take the last two: the Box still
had a pair, which round 12 found. Five `<Slider>` controls when this
started, none after round 12.) Live Line is also the only
panel with three lists, and they are three sections in the list
position: the points it is drawn through, the value-to-width table, and
the two conditions that decide whether each end carries an arrow.

Both of them now show a Frame they cannot edit rather than no Frame at
all. A line with real points has an x, y, width and height that are its
bounding box and nothing else, so the old panel hid all four and left
"where is this line?" unanswerable from the panel; the Live Line never
had them at all, exactly as this document predicted, although
`getLinePoints` falls back to them when a line has no points. They are
there and locked, saying what they are. That is the same rule as the
arc's size and the text's height, and it has now paid for itself three
times: **a derived value is shown and locked, never hidden.**

**Round 3's exception did not survive the week.** The clock face was kept
as the one bespoke control in nineteen panels, on the grounds that a round
display's scale is described in clock positions and two number boxes show
nothing. On 2026-09-21 the scale's ends became draggable on the ring
itself (`2026-09-21-arc-handles.md`), which is a better preview than a
picture of a clock beside the drawing - so the clock went, and the four
presets with it. The rule it was the exception to now has no exceptions:
**a field is shared unless the object has something no other object has,
and it turned out the arc did not.** What is left in Shape is what the
canvas cannot do - type an exact angle - plus the one line that still
translates 225 into "half past seven".

Rounds 12 and 13, Box and Switcher, are the plain ones. Box is four rows
and a frame, with no stored property anything else has to agree with -
and the last two sliders, each with a second line underneath to say
"3px" because a slider cannot say it itself, which is decision 8 in one
picture.

Rounds 14 and 15, Screen and Multiple, finish the objects. A screen has
no Frame - it is the size the device is - and no Text, which leaves five
positions filled and one blank. Its own name and icon are the shared
`ScreenEditorFields`, deliberately not rebuilt: that component is used by
Project Settings > Screens too, carries its own rename buffer and
duplicate-name check, and was made shared on purpose in August. Forking
it to gain a name column would put back the duplication this rebuild
removes, so it is wrapped like the colour and topic pickers - and it does
look like what it is, a borrowed editor sitting in a section. The title
line the screen used to draw for itself moved to the panel frame, so
every panel now opens the same way.

Round 16 is the hardware button, and there is no round 17, 18 or 19: the
table counts nineteen panels, and eleven of the sixteen rounds built two
at a time because the pairs turned out to be the same panel twice - Bar
and Slider, Gauge and Dial, Switch and Button Group, Icon and Live Icon,
Line and Live Line, Screen and Multiple. That is the rebuild's own answer
to whether the split was worth it: the differences between each pair are
two or three rows, and they now live in one file each.

The hardware button is the software Button's Action section without the
button - the same rows, the same order, the same names, which is the
point: whoever set up one already knows the other. It has one thing the
software button does not, an inherited state, and that is a value in the
same list rather than a control beside it, because to a person it is one
question with one more answer. It says what it would inherit ("Inherit:
Next screen"), since "Inherit" alone answers the wrong question.

`describeHardwareButtonAction` lost its title case with it. It is the
only describer of these actions, used by this panel and by the screen's
swipe rows, and it said "Next Screen" into a list whose other entries now
say "Next screen".

Multiple is the one panel that is all verbs. Position and Size are the
only rows in nineteen panels that do not take effect as you type: there
is no single current value to show, and writing one into every selected
object on every keystroke would be unrecoverable, so both keep an Apply
button and their boxes stay empty until filled. Align and Distribute are
what `ButtonGroupRow` was built for - six buttons and two, wrapping in
the control column, where they were two grids of full-width buttons down
the panel.

The Switcher's panels are the fifth list and the only one whose entries
are objects in their own right: each has a property panel of its own
(round 1), so an entry hands it over - "Open for editing" - instead of
repeating its fields. That button used to say "Edit", which read like an
edit of the row rather than of what the row stands for. The operator
beside it had no name at all in the old panel; it is a `ConditionRow`
now, so it says "Shown when" and offers the same six operators as
everywhere else.

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

## What it actually cost

Sixteen rounds, not nineteen, on 2026-09-20 and 21. About 5,200 lines of
panel became about 3,000, plus the ~900 of shared fields they are built
from. Four files went altogether: the legacy `field` panel (nothing could
create one), `icon-picker.tsx` and `color-picker-with-transparency.tsx`
(no importers left), and a fifth copy of the icon slot inside the switch
panel. The five `<Slider>` controls are gone; the only one left in the
designer is the canvas zoom, which is a zoom and not a property.

Nineteen specs needed updating, not six. The estimate counted the ones
that read a *label*; what it missed is that a panel is also found by its
shape - a spec clicking a shadcn option that is now a plain `<select>`,
or reading `#x` from a section that now starts closed, breaks without any
label changing. Two helpers absorbed most of that: `openFrameSection`
and `openAllTwisties`.

The completeness list paid for itself twice and failed once, which is
worth remembering in that order. It caught the Live Text formatting rows
that had never been in it (a variant harvested from the old panel before
the rewrite, so there was something to compare), and it caught nothing at
all when the Text panel's colour was bound to `textColor` instead of
`color` - the row harvested identically and would have edited a property
nothing reads. **The list records names, not bindings.**

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
