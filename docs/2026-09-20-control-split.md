# The controls, split and renamed: one type is one component

Agreed 2026-09-20, the same day as the property panel and before it is built.
There is no release yet and no project that is not the user's own, so this is
the last moment at which the stored type names can change for the price of a
migration and an evening with the flasher.

It began as a naming question and turned into a structural one.

## What was found

**The names described the wrong thing.** Three of the thirteen names started
with "MQTT" - a protocol, which answers "where does the value come from", not
"what is this" - and since the live-preview work the same value can come from
the simulator. "Tab Control" draws no tabs: on the device it renders only the
active panel's children (`render-screen.ts:250`), and which one is active is
decided by the topic value against each panel's condition (`render-screen.ts:167`);
the tabs exist only in the designer, to open a panel for editing. "Software
Button" carried a word that only distinguishes it from the hardware buttons,
which are configured in a different panel and never appear in the toolbar.
"Level Indicator" said *indicator* about a thing a finger can set.

**Level Indicator was already two objects.** `levelHasHandle()`
(`level-shape.ts:70`) decides from `writeTopic`/`setpointTopic` whether a
handle is drawn, and the geometry follows - "the handle's length where there
can be a handle, the track's thickness where there cannot"
(`level-shape.ts:308`). The Switch likewise: `switchForm()` returns "knob" or
"group" at the top of `switch-shape.ts`, and below it are two disjoint families
of geometry functions sharing only colour, corner and font metrics. In Material
3 these are separate components - slider and linear progress indicator, switch
and connected button group.

**The seam mattered on hardware.** The e-paper display has no touch. Its DDF
declares `level-indicator` and `arc-level` but neither `SoftwareButton` nor
`Switch` - so it gets the bar and can never operate it, and the designer offers
the write topic and the step anyway (`level-indicator-properties.tsx:164`),
because touch is not a DDF capability at all: it is guessed from
`supportedObjectTypes.includes("SoftwareButton")` (`project-editor.tsx:2177`,
`device-description.ts:404`). A name that claims the interaction is wrong on
that device, wrong on any device when no write topic is set, and wrong on both.

**The stored strings disagreed about their own spelling.** `SoftwareButton`,
`level-indicator` and `box` are three conventions, and `MqttDataField` and
`MQTTIconField` disagree with each other. Nothing enforces any of it: the
firmware keeps the type as a plain `String` (`ProjectTypes.h:251`), Android
compares strings, TypeScript holds literals.

## Decisions

**1. One type is one Material component.** Every object that folded two
components into one property is split: Level Indicator into **Bar** and
**Slider**, Arc Level into **Gauge** and **Dial**, Switch into **Switch** and
**Button Group**. The Switch loses its `mode`. The rule has no exception, which
is what makes it a rule - and it lets a DDF say group-yes-knob-no later if a
device ever wants to.

**2. The read-only ones are named for what they are, not for progress.** Bar
and Gauge, not Material's *progress indicator*: a fresh-water tank makes no
progress. Slider and Dial for the two that a finger sets - the words everyone
has for sliding and turning. Four short words, two per axis (straight/round,
read/operate), and "Gauge" against "Dial" carries the read/operate distinction
by itself: the fuel gauge you read, the thermostat dial you turn.

**3. "MQTT" leaves the names; "Live" replaces it as one rule.** Text and
**Live Text**, Icon and **Live Icon**, Line and **Live Line**. The live one is
the static one plus a word, so the pairs sit side by side in the toolbar and
explain each other. "Live" says "comes from outside" without naming the
protocol, and stays true when the value comes from the preview. Chosen over
purpose-names (Value, Status Icon, Flow Line) because those were three
inventions with no shared rule - though "Flow Line" was the best single word
of the set, and is noted here for the day someone wants a second live line.

**4. Tab Control becomes Switcher; Software Button becomes Button.** Switcher
says what it does - it switches between panels, and the value decides. It
lives in Arrange, not Operate, which keeps it apart from Switch. "Button" is
the word everyone has; the place carries the distinction from hardware buttons.
Label becomes Text, since it is the static half of the Text / Live Text pair.

**5. Sixteen types, all kebab-case.** `text`, `live-text`, `icon`, `live-icon`,
`bar`, `gauge`, `slider`, `dial`, `switch`, `button-group`, `button`, `line`,
`live-line`, `box`, `switcher`, `panel`. The convention the three newest types
already used, and the one JSON, CSS and DDF files expect. `field` - a ghost
that is not creatable and was only ever an alias for `MqttDataField` - is not
renamed but removed: the migration maps it to `live-text` and it is gone.

**6. Only the write topic decides the split on load.** `level-indicator` with a
non-empty `writeTopic` becomes `slider`, otherwise `bar`; `arc-level` becomes
`dial` or `gauge` the same way. `setpointTopic` stays a property of both: a Bar
may show a target it cannot set - the thermostat on the e-paper - and a Slider
may show one it can. `levelHasHandle()` treated the setpoint as a reason for a
handle, and that is exactly the reading that made "Slider" wrong on the
e-paper. `Switch` splits by `mode`: `single` becomes `switch`, anything else
`button-group`. Across 3194 saved project snapshots this rule meets the edge
case exactly once - one Level with a setpoint and no write topic - and makes
it a Bar with a target marker, which is what it is.

**7. No converting between siblings.** A Bar does not become a Slider by a
menu entry; whoever wants a Slider places one. That is what the rule "one type
is one component" means when it costs something, and it costs the user 36
objects re-set by hand on the van's own screens. Chosen over a context-menu
"Convert to …" with open eyes.

**8. Everything on one evening, no aliases in the firmware.** Designer,
`screenbee-firmware` (Waveshare 1.8, PaperS3, 4.3B), `MqttEPaperDisplay2` and
`ScreensmithAndroid` change together and every live device is flashed. The
firmware accepts the new names only: an unknown type is ignored, as any unknown
type is today. The retired M5 Dial stays as it is.

Both halves of this were decided against the recommendation, which was to let
the designer change first and have the exporter write whatever each device
declares - the deploy dialog already matches types against a device's live
`supportedObjectTypes` (`deploy-dialog.tsx:239`) - or at least to keep a
ten-line alias table in each `ProjectLoader` for the evening itself. The
consequences are recorded so that nobody is surprised by them: a project zip
from before the evening shows empty space on every device where its Levels and
Switches were, and the only way back from a broken firmware is its previous
image. The van's devices are reachable for that only over the one-way
Tailscale route.

The migration on load in the designer is not an alias and is not optional:
the 3194 snapshots under `.data/projects` carry the old names and must open.

**9. Split before panels.** The property-panel rebuild (`2026-09-20-property-panel.md`)
waits for this. Otherwise it would build panels for Level Indicator and Switch
that are taken apart weeks later, and the expected-control lists for
`e2e/property-panel.spec.ts` would be written twice. The fourteen fields are
untouched by the split; the object table there gains rows, and three of the
new panels are shorter than the ones they replace, because a Bar has no write
topic, no step and nothing a finger does.

**10. The toolbar groups by what you want to do.** **Show** (Text, Live Text,
Icon, Live Icon, Bar, Gauge) - **Operate** (Slider, Dial, Switch, Button Group,
Button) - **Draw** (Line, Live Line, Box) - **Arrange** (Switcher). Pairs sit
together. The Show/Operate line is the touch line: an e-paper DDF declares
everything in Show and Draw and Arrange, and nothing in Operate.

**11. What the device does not declare is not shown.** A type missing from the
selected device's `supportedObjectTypes` leaves the toolbar entirely - not
shown-but-disabled, as `device-contract.md` §2.1 describes today. On the
e-paper the Operate group is simply absent. The dashed outline on the canvas
for an already-placed unsupported object (`canvas.tsx:1573`) stays, for the
one way such an object can still arise: a project file edited by hand.

**12. The toolbar icons are two-coloured where the object binds to data.** Ink
draws the frame, the accent draws the part the data moves: the bar's fill, the
gauge's fill, the switch's knob, the button group's chosen segment, the
switcher's shown sheet, the live line, the picture inside the live icon, the
letter of the live text. Text, Icon, Line, Box and Button bind to nothing and
stay one colour. A slider's handle is ink, not accent - it is the thing a
finger holds, not the thing the data moves.

## What follows from them

The touch guess goes away without a new DDF field. The two places that infer
touch from `includes("SoftwareButton")` become "does the device declare
anything in Operate" - which is what the split was for. The write topic no
longer needs hiding on the e-paper, because the e-paper has no object that
offers one.

`supportedObjectTypes` per device after the evening: the three colour boards
and Android declare all sixteen; the e-paper declares `text`, `live-text`,
`icon`, `live-icon`, `bar`, `gauge`, `line`, `live-line`, `box`, `switcher`,
`panel`.

Beyond the five `device.json` files and the four renderers, the names live in:
`device-contract.md` §2.1 (which still says "12 designer object types", without
Switch or Arc Level), `DEVELOPER_GUIDE.md`, `DEVICE_GUIDE.md`; 22 e2e specs and
4 HIL fixtures (`hil/epaper`, `hil/waveshare`, `hil/android`,
`hil/conformance/specimens.js`); `lib/object-order.ts`; and the panel-rebuild
document's object table. The dated grilling and look documents keep the old
names: they are history.

`supportsSoftwareButtons` in the project settings is the one stored key that
carries an old name. It stays as a key - projects are not rewritten for a
field name - and is fed from the new inference.

`SYSTEM_GENERATION` stays 1.0. `DEVICE_GUIDE.md`'s test for a major bump is
whether a reader on the other version would *silently produce something
wrong*, and it names "a skipped unknown object type" and "a new object type"
as the things that do not bump anything. That is this change exactly: an old
firmware skips `bar`, and before it gets the chance the deploy dialog refuses
the deploy because the device does not declare `bar`
(`deploy-dialog.tsx:275`) - a clean rejection, which is what the number is
for.

The migration on load is one function, `migrateProject()`, called at every
place a project enters the designer from JSON. There are four: the file import
(`project-editor.tsx:2251`), the project zip (`project-editor.tsx:2268`), the
version list (`app/api/projects/[projectId]/versions/route.ts:82`) and the
ordinary API load through `response.json()`, which a search for `JSON.parse`
does not find. A recovery snapshot that reaches the editor through an entrance
without the migration would open with names nothing renders any more.

## The evening

Each step is the test of the one before it, so the order is not negotiable.

1. **Designer.** The sixteen type strings in `ScreenObject["type"]`, the
   renderer switch in `lib/render-screen.ts`, the toolbar with the new groups
   and icons, the panel headings, `lib/object-order.ts`, `lib/object-tree.ts`,
   the two touch inferences, and `migrateProject()` at its four entrances.
   `npm run typecheck`, then the 22 e2e specs on the new names, green.
2. **HIL fixtures.** `hil/epaper/fixtures/build-comprehensive-test.js`,
   `hil/waveshare/fixtures/build-smoke-test.js`,
   `hil/android/fixtures/build-android-test.js`,
   `hil/conformance/specimens.js` on the new names; the e-paper fixture places
   nothing from Operate.
3. **Firmware and Android.** `screenbee-firmware` (`ProjectLoader.cpp`,
   `ColorScreenRenderer.cpp`, `ProjectTypes.h`, the two `boards/*/main.cpp`),
   `MqttEPaperDisplay2` (`ProjectLoader.cpp`, `ScreenRenderer.cpp`),
   `ScreensmithAndroid` (`ScreenRenderer.kt`, `TabControlView.kt`); the five
   `device.json` with their new `supportedObjectTypes`, the e-paper's without
   Operate. Build all.
4. **Flash** every live device: Waveshare 1.8, PaperS3, 4.3B, the e-paper;
   install Android. The van's devices over Tailscale.
5. **`npm run test:all`.** The HIL suites against the real devices are the
   proof that nothing went invisible - a device that skips a type does so
   silently, and only a pixel diff sees it.
6. **Documents.** `device-contract.md` §2.1, `DEVELOPER_GUIDE.md`,
   `DEVICE_GUIDE.md`.

Then, and not before, the property-panel rebuild starts.

## Left open

Whether a Bar should be allowed a *second* live line one day - the "Flow Line"
that lost to the naming rule - is noted, not decided.

Whether the icon toolbar's sixteen glyphs come from Lucide alone or need a few
drawn in its stroke style (Bar, Slider and Dial have no Lucide glyph that
rhymes) is a picture question and is being settled on the design canvas, not
here.
