# Prebuilt: a tab of assemblies, no dialog, convert afterwards

Spec drafted 2026-11-05 from the user's idea. **Status: every decision taken by the user on 2026-11-05; ready for
approval.**

## Objective

Placing a block takes too long and asks too much. Today it is four steps:
click «Block», wait while the menu reads the broker afresh (a new
connection, then up to 5 s until the retained burst has settled -
`hooks/use-block-catalog.ts`), pick an entry, then a dialog
(`components/baustein-dialog.tsx`) with Look, Icon and Sections that most
people do not know how to answer - and only then the block hangs on the
cursor. The average user is impatient and wants something that looks right,
not options.

After this work a block is two steps: open the **Prebuilt** tab of the tools
ribbon - the devices' things are already there - and click one. It hangs on
the cursor at once, built the way the dialog's defaults build it today. What
the dialog asked is decided afterwards, on the screen, where the result can
be seen: a Dial is turned into a Slider with **Convert to**, an icon changed
or deleted like any other object, a section not wanted deleted.

Success looks like: with the van's broker listened to, the Prebuilt tab shows
VanPi's things without waiting; a click on «MaxxFan» and a click on the
screen place the card; its Dial turned into a Slider keeps its topics, its
range and its place in the card.

## Decisions (the user, 2026-11-05)

1. **Two tabs on the ribbon:** «Parts» (the tools of today: Select,
   Show, Operate, Draw, Arrange, Tables) and «Prebuilt» (the catalog).
   Decided by the user 2026-11-05. The Lego picture: a brick is the
   smallest part there is, and what the catalog places is built from
   several - an assembly, not a brick. «Standard Parts» was weighed and
   left: «Standard» is a text size already, and the tabs read better
   short. «Parts» also matches the handbook, which calls a block's pieces
   its Teile: a prebuilt one is made of parts.
2. **The handbook renames Bausteine to Baugruppen.** In running text
   «fertige Baugruppen», short «Baugruppen»; the tab quoted as
   <span class="ui">Prebuilt</span>, the other as
   <span class="ui">Parts</span> (Teile). `handbuch/designer/bausteine.md`
   becomes `baugruppen.md`, every link to it follows (14 pages use the
   word today). The code keeps its names (`lib/bausteine.ts`, `buildEntry`,
   the `baustein` tool): a comment in `lib/bausteine.ts` says that
   «Baustein» there means the prebuilt assembly. The wire format keeps its
   name too: `schaltli/blocks` descriptions are what other senders (the
   VanPi bridge) rely on.
3. **No dialog.** A block is built with fixed defaults: each part in its
   first look (`catalogLooks`, what the dialog preselects today), the icon
   the device announces or the one suggested for its name, every section,
   the entry's name as label. The result is what pressing Insert straight
   away gives today.
4. **The catalog is read from what the designer already hears.** The
   background listener (`components/broker-listener.tsx`) subscribes to `#`
   while «Listening» is on, so the discovery configs and `schaltli/blocks`
   descriptions are in `lib/broker-store.ts` already: the tab derives the
   catalog from there, and keeps it current as announcements come and go.
   With «Listening» off, the tab reads once as the menu does today, and
   again with a refresh button.
5. **Convert to** is a property of objects, not of blocks: every Slider,
   Dial, Bar, Gauge, Switch and Button Group can be converted within its
   family, placed by hand or by a block.
6. **The Block button goes**, with its menu. «Listen to Broker»'s pointer
   to the blocks (`OPEN_BLOCK_MENU_EVENT`) opens the Prebuilt tab instead.
7. **Placing starts in the ribbon, on both tabs.** Decided by the user
   2026-11-05. Today a tool is clicked and then nothing shows until the
   mouse button is pressed on the screen - the step nobody can see. Now,
   as in Visio and Canva: a tile **dragged** onto the screen brings its
   object along and lands it where it is let go; a tile **clicked** makes
   its object hang at the pointer at once, without a button held, and a
   click on the screen sets it down. Not Canva's «click puts it in the
   middle»: a screen of tables and cards has no good middle, and the hint
   at the pointer says where it goes. Line and Live Line stay drawing
   tools (clicked, then points set); Icon too keeps its click on the
   screen, which opens the icon picker first (found building T1,
   2026-11-05). The Row templates are a menu: clicked, not dragged.
8. **Alt stays the key that builds tables** (revised 2026-11-05, after
   T2 was tried; first decided as «Shift instead of Alt»). The worry was
   that a lone Alt with no mouse button held sends Chrome's focus to its
   menu on Windows, and a clicked tile carries with no button held. But the
   canvas already swallows Alt while anything is carried (`canvas.tsx`,
   «Chrome on Windows moves the focus to its menu on a lone Alt»), and a
   hanging carry is a carry; the recording of T2 showed the chip turn to
   «Click to make a table» with Alt held. The user, 2026-11-05: «passt,
   weiter». Should Alt get in the way on a real Windows Chrome after all,
   the switch to Shift is plan task T3, kept.
9. **Buttons stay the default** for on or off (revised 2026-11-05): a
   Button Group «Aus»/«An», as placed since 2026-10-01 (`lib/bausteine.ts`,
   `catalogLooks`) - each button says what it does, a tap is meant whatever
   state was reported last. A Switch only where a description asks for one
   (`look: "switch"`), or by «Convert to». The user, 2026-11-05: «Ja. Aus
   jedem Button group kann man einen Switch machen».
   A Switch always becomes a Button Group; a Button Group becomes a Switch
   only with two states - with three («manual», «auto», «off») a toggle
   has no place for the third, and the entry is greyed with that reason.
10. **The dialog goes, with no way back to it** (no Shift-click): one way,
    placed first, changed after.
11. **«Convert to» in two places:** the Properties panel, and the canvas's
    right-click menu that exists already (Copy, Cut, Paste, Select All,
    Group, Ungroup - `components/canvas/canvas.tsx`), as a submenu with the
    family's other types.
12. **Number later:** Bar ↔ Gauge now; into and out of Number (a text with
    a chip) a step of its own, if it turns out to be wanted.

## Behaviour

### The ribbon's tabs

- A row of two tabs above the ribbon's tools: «Parts», «Prebuilt». The
  ribbon keeps its height; the tabs take a strip of their own above it.
- The tab last open is remembered per browser (`localStorage`, guarded);
  the first time it is «Parts».
- «Tools» in the header still shows and hides the whole ribbon, tabs and
  all.

### The Prebuilt tab

- One ribbon group per device, the device's name as the group's caption
  below (as «Show» or «Operate» are captioned), each entry a tile: its icon
  above, its name below, the same size as a tool. A device with a single
  entry of its own name has no group caption repeating it (as the menu
  today).
- What cannot be placed is a greyed tile; its tooltip gives the reason
  («Not supported: …»), as the menu does.
- A block whose object types the loaded device does not render is greyed
  too, with the tools' reason.
- More than fits: the ribbon scrolls sideways, as it does today when
  narrow.
- No broker, nothing announced, still looking: one line of text in the tab
  in place of the tiles, the menu's texts today («Looking for devices on
  …», «No broker at …», «Nothing announces itself under …»).
- The entries' icons, and the suggested icons for entries that announce
  none, are fetched when the tab is first shown, not when a tile is
  clicked.

### Placing from the ribbon (both tabs)

The same for every tile - a tool of «Parts» (Text, Slider, Card, a Row
template …) and an entry of «Prebuilt» - except Line and Live Line.

- **Dragged:** the mouse button pressed on a tile and moved. Over the
  ribbon the pointer shows it carries something; as soon as it is over the
  screen the object hangs there by its middle, at its default size, with
  the hint chip (docs/2026-11-03-placing.md). Let go over the screen, it
  lands by the placing rule - into a card or an empty cell under the
  pointer, free elsewhere, tables with Alt. Let go outside the screen (on
  the ribbon, a panel), nothing is placed.
- **Clicked:** a click on a tile without moving. The tile shows pressed,
  and the object hangs at the pointer as soon as it is over the screen, no
  button held; it follows the pointer, with the hint chip. A click on the
  screen sets it down by the same rule. Esc, a click on the same tile or a
  click outside the screen gives it up; a click on another tile takes that
  one instead.
- **The hint chip** names what sets it down: «Release mouse button to …»
  while dragged, «Click to …» while it hangs without a button
  («Click to drop into Card», «Click to place»). The key line as today,
  with Alt, as today.
- **The tool hint at the top of the canvas** («Drag a rectangle to place
  it, or click a cell, a line or a + of a table» - from before
  docs/2026-11-03-placing.md) goes for everything carried; the chip at the
  pointer says it. Line and Live Line keep theirs («Click point by point
  …»).
- **Alt** (decision 8) works in both, pressed or let go while carried.
- **After placing** the object is selected and the tool back on Select, as
  today; nothing stays armed.
- **The tile's tooltip** says both ways: «Drag onto the screen, or click
  and place».
- **Line and Live Line:** clicked, as today - drawn by pressing and
  dragging on the screen, or point by point with clicks.
- **The old way goes:** a tool clicked and then the button pressed on the
  screen is the clicked way above - pressing on the screen sets the hanging
  object down where the press was (no second object, no rectangle).

### Placing a prebuilt

- A prebuilt is built with the defaults (decision 3) when its tile is
  dragged or clicked, and lands as today - a row for one part, a card for
  several (docs/2026-11-03-card-blocks.md).
- An icon not yet fetched when the tile is dragged or clicked: the block
  waits for it up to 4 s before it hangs at the pointer, as Insert did (the
  icons are fetched as soon as the tab shows the tile, so this is rare).
  Revised 2026-11-05, the user: «4s reicht» - no late insertion while
  carried. The icon service unreachable, the block comes without; an icon
  is added afterwards like any other.
- Example values for the topics the block adds: what the broker store has
  heard on them (retained or live), as the dialog collected while it was
  open. Nothing heard, no example (no-made-up-values, unchanged).
- Everything a block puts in the project otherwise - topics, combined
  topics, assets - as today (`buildEntry`, `adoptCombinedTopics`).

### Convert to

- In the Properties panel, beside the object's type, and in the canvas's
  right-click menu: «Convert to» with the other types of its family. One
  object selected - the menu's entry missing for several or for a type
  with no family - a type the device does not render greyed with the
  reason.
- The families (the looks `lib/bausteine.ts` already knows):
  - **A level a finger sets:** Slider ↔ Dial
  - **A level to read:** Bar ↔ Gauge
  - **On or off:** Switch ↔ Button Group - a Button Group only with two
    states becomes a Switch.
- What carries over: the id (so a Knob binding or a reference to it stays
  valid), the topics (read, write, setpoint), range, step, calibration,
  send-as, the value shown, colours, font. What the new type has and the old
  did not: its defaults, as the tool would place it.
- Its size: in a table's cell or a card it is sized as a block builds that
  look for that cell (a Dial square, about six text lines on a device with
  sizes in mm; a Slider a track across the cell); the row grows or shrinks
  with it and a card whose height was its content's follows. Free on a
  screen: the new type's natural size for the old width, the same top-left
  corner.
- One undo step.

### What happens to the dialog's other choices

| The dialog asked | Now |
|---|---|
| Look | the default; «Convert to» afterwards |
| Look per part | the default; «Convert to» on each part |
| Icon, Change…, None | the suggested icon; changed in the icon's properties, deleted with Del |
| Sections | all; a part not wanted deleted on the screen |
| Topics and live value shown | not shown; the values go into the examples as before |

## Not in scope

- Converting between families (a Bar into a Slider), or into Number (a
  text with a chip, decision 12).
- Converting a block card into a table or rows, or back.
- Click-to-insert into the middle of the screen (Canva's way, decision 7).
- Placing on touch screens (the designer is used with a mouse).
- A filter or search field in the Prebuilt tab.
- Anything on the devices: a converted object is an object of its new type.

## Code

- `components/toolbar/toolbar.tsx`: the two tabs; the Prebuilt tab's groups
  and tiles from a new `components/toolbar/block-tiles.tsx` (the catalog
  rendering of `block-catalog-menu.tsx`, as tiles); the Block button and
  menu removed, the vertical orientation with them if nothing else uses it
  (only the horizontal ribbon is mounted, `project-editor.tsx`).
- `hooks/use-block-catalog.ts`: from the broker store while listening
  (`readCatalog` over the stored config topics, recomputed when they
  change); the one-off read kept for «Listening» off. The values half
  (heard values of an entry's topics) read from the store too.
- `components/project-editor.tsx` `selectCatalogEntry`: builds with
  default options (a `defaultOptions(entry)` in `lib/bausteine.ts`, taken
  from what the dialog initialises) and arms the carry directly;
  `BausteinDialog` no longer mounted.
- `components/baustein-dialog.tsx`: removed; the icon prefetch it does
  (`suggestIcon`, `loadIcons` of `stateIconNames`) moves to a small cache
  the tiles fill.
- `lib/convert-object.ts` (new): `convertTargets(object)` and
  `convertObject(object, type, context)`, pure; the size rule shared with
  the block builders in `lib/bausteine.ts` (`arcObject`, the slider's).
- The Properties panel: the «Convert to» control; the canvas's context
  menu (`canvas.tsx`, beside Group / Ungroup): its submenu.
- Alt stays (decision 8, revised): nothing to change for the key.
- Placing from the ribbon (decision 7): the tiles start a drag with
  pointer events (not HTML drag and drop, which draws no object and no
  chip); `components/canvas/canvas.tsx` takes a carry that comes in from
  outside it, pressed or hanging, and sets it down on release or on click.
  The carry already exists for objects, rows, cards and blocks - what is
  new is that it starts before the pointer is on the canvas and may run
  without a button held. The hint's texts in `canvas.tsx` /
  `components/canvas/snap-table-overlay.ts` get their «Click to …» twins.

## Testing

- `e2e/bausteine.spec.ts`: every flow through the dialog rewritten for a
  tile click; expectations of the result unchanged (it is the dialog's
  default). The dialog's own tests (looks, sections, icon search, Waiting
  for icon…) go, or become conversion tests where they checked a look.
- `e2e/prebuilt-tab.spec.ts` (new): the tab shows the seeded catalog from the
  broker store without a new connection; greyed entries with their reason;
  a device's new announcement appears while the tab is open, and one
  withdrawn (an empty retained config) disappears; with
  «Listening» off the one-off read; the remembered tab.
- `e2e/place-by-dragging.spec.ts` and `e2e/placing.spec.ts`: placing a
  tool's object rewritten for the two ways; new cases for both tabs - a
  tile dragged onto the screen, into a card, into an empty cell, with Alt
  into a table, let go outside the screen (nothing placed); a tile clicked,
  the object hanging without a button, set down by a click, given up with
  Esc and with a second click on the tile; the chip's «Click to …» text;
  Line still drawn; Alt with a hanging object builds a table.
- `e2e/convert.spec.ts` (new, model and UI): each family both ways keeps
  id, topics, range, step, from the Properties panel and from the
  right-click menu; in a block card the row and the card follow;
  free, the corner stays; a type the device does not render is greyed;
  one undo restores it.
- `e2e/card-blocks.spec.ts`: placed through a tile.
- `e2e/handbook-labels.spec.ts`.

## Handbook

- `handbuch/designer/bausteine.md` becomes `handbuch/designer/baugruppen.md`
  (decision 2), «Bausteine» becoming «Baugruppen» in its text and on every
  page that names or links it, the sidebar of the VitePress config with it.
  «So geht's» rewritten for the tab <span class="ui">Prebuilt</span> and
  the click; the dialog's paragraphs (Look, Icon, Change…, None, Waiting
  for icon…, Sections) replaced by what is done afterwards; the screenshot
  `baustein-menue` retaken as the tab, `baustein-tank` gone.
- The old address `/designer/bausteine` (linked from the forum post and
  from outside) keeps working: a page there pointing to `baugruppen`, or a
  redirect if the Pages setup allows one.
- The object pages and the right-click menu where the handbook lists it:
  «Convert to».
- `handbuch/designer/objekte.md` («Wähle ein Werkzeug … und drück auf dem
  Screen die Maustaste») and `handbuch/objekte/anordnen.md` («nach dem
  Druck auf den Screen»): the two ways from the ribbon.
- Where the handbook describes the ribbon: the tabs
  <span class="ui">Parts</span> and <span class="ui">Prebuilt</span>.
- The object pages for Slider, Dial, Bar, Gauge, Switch and Button Group
  (`handbuch/objekte/`): «Convert to».
- Through `maettel-humanizer`.

## Boundaries

- **Always:** the placed result the same as the dialog's defaults today;
  no made-up example values; designer-only; `test:quick` per change;
  handbook in the same work.
- **Ask first:** changing a default look; a key other than Alt.
- **Never:** a device change; the Listening switch turned on by the tab on
  its own.

## Success criteria

- [ ] Ribbon with «Parts» and «Prebuilt»; the Block button gone
- [ ] The Prebuilt tab shows the catalog at once while listening
- [ ] A click on a tile carries the block, no dialog
- [ ] Icons arrive without holding up the carry
- [ ] A tile dragged onto the screen lands where let go, on both tabs
- [ ] A tile clicked hangs at the pointer without a button; a click sets
      it down
- [x] Alt builds tables for a dragged and a hanging carry alike (decision 8, revised)
- [ ] «Convert to» for the three families, keeping id and bindings, in the
      Properties panel and the right-click menu
- [ ] In a card the converted part fits and the card follows
- [ ] Handbook: Bausteine renamed Baugruppen, links following
- [ ] Handbook updated; `test:quick` green apart from known load failures
