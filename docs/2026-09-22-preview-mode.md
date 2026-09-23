# The preview: a trial, not a rehearsal

Agreed 2026-09-22. The starting complaint was small — you cannot tell that you
are in preview mode — and the answer turned out to be somewhere else entirely.

## What the preview is actually for

Two uses, and only two:

1. **Checking that the chain stands.** Designer → MQTT → Node-RED → the
   installation. A tap here has to make the pump run over there. This is a
   diagnostic, used for a minute at a time.
2. **Letting someone judge the product without hardware.** Somebody who has
   just put the tool on their van's Pi, who has a broker and flows but no
   panel yet, wants to know whether this is worth buying a board for.

What it is **not**: a way to operate the vehicle. Nobody will run their van
from the designer, and the preview does not have to be designed as if they
would. An earlier draft of this document treated it as a third runtime beside
the device and the Android app; that was wrong.

## Decisions

**1. The simulated preview is retired.**

`previewSource` is `"live" | "simulation"` and defaults to **`"simulation"`** -
so the weaker of the two is what everyone meets first. It models *values*,
while everything interesting is *behaviour*: the step command with its 250 ms
coalescing, the tab control keyed on `mode`, the Doorman's `01`/`00`. All of
that lives in Node-RED and in the firmware, so a local imitation stops exactly
where the question gets interesting. The user's own verdict, which started
this: "ich habe die simulierte vorschau schon länger nicht mehr gebraucht."

Anyone with a van has a broker. Live is the only source worth having, and it
becomes the default and the only one.

**2. `topic.examples` stay exactly where they are.**

They look like preview data and are not. `lib/render-screen.ts` reads
`topic.examples[0]` for the reference render - the one HIL conformance
compares against photographs of the real boards, and the one
`app/test-render/page.tsx` serves to the whole e2e suite. Retiring the
simulation must not touch them. The tedium of filling them in is the price of
pixel parity, not of the preview, and it is addressed separately (see *Left
open*).

**3. A reading view, not a dimmed editor.**

Preview is temporary by nature, so it stays a mode rather than becoming its own
route. The model is PowerPoint's reading view: the shell goes dark behind a
scrim, the canvas stays lit and sits in the middle, and nothing else asks for
attention. `Esc` leaves, and the Exit control stays plainly visible above the
scrim - it is the one thing that must never be dimmed.

**4. An empty screen must not read as broken.** This is the decision that
matters most and it has nothing to do with the scrim.

Since the live-data decision an object shows *nothing* until a real value
arrives. Someone opening the tool for the first time builds a screen, presses
Preview, and sees an empty rectangle. They will not conclude that no value has
arrived yet. They will conclude the product is broken, and leave.

So the preview states the flow, quietly and always: which broker, how many
topics subscribed, when the last value came in, and which topic is still
silent. "Connected, 14 topics, nothing yet on `pkw/stat/tank/fresh`" is a
different experience from the same empty rectangle without a word. The status
vocabulary already exists - `liveStatus` is
`idle | connecting | live | unavailable | lost`.

It also has to say, without being asked, that **input is published for real**.
That is the whole point of use (1), and it must not be a surprise.

**5. The values panel becomes a strip.** It stays, because it carries the flow
from decision 4, but not as the full right-hand column that outweighs the
screen it is meant to explain. A slim bar along the bottom, above the scrim,
that expands when you want the detail.

**6. Screen navigation is the device's.** The editor's screen list is part of
the shell and goes behind the scrim with it. Inside the preview you move
between screens the way the device does - tabs, swipe, a button action. If a
screen cannot be reached that way, that is a finding about the design, not a
shortcoming of the preview.

**7. The panel is drawn 1:1 and cannot be zoomed.** No scaling control, no
integer steps, nothing. A 400×300 e-paper is about ten centimetres on a desk
monitor, and that is the truth about it - a preview that magnifies would
flatter the design and hide exactly the crowding a small panel suffers from.
It also keeps the preview honest against the reference render, which is 1:1 by
definition.

The reading view earns its keep here: a small lit rectangle in a dark field is
far easier to judge than the same rectangle surrounded by editor chrome. The
scrim is not decoration, it is what makes 1:1 workable.

**8. The hardware-button overlay stays live in the preview.** It is openly an
abstraction - the board has real buttons and the browser does not - but firing
a button action without the board is precisely use (1), and removing it would
take the diagnostic away. Implementation consequence: the overlay has to sit
**above** the scrim together with the canvas, or it would be dimmed and dead.

## What this costs

Gone: `previewSource` and the simulation branch of `handlePreviewButtonAction`,
`previewTopicValues`, and the mock engine's role in preview. **Check before
deleting**: `e2e/mock-engine.spec.ts` suggests the mock engine has a life of
its own; if it does, it keeps it and only the preview stops calling it.

Rewritten rather than deleted: `e2e/preview-mode.spec.ts` (22 mentions) guards
mode behaviour that is changing shape. `e2e/live-preview.spec.ts` (16) grows,
because live is now the only path.

Unaffected: conformance, the reference render, every fixture that carries
`examples`.

## Steps

Each step ends with `npm run test:all` green.

1. **Live becomes the only source.** Delete `previewSource` and everything that
   hangs off `"simulation"`. Preview without a reachable broker shows the
   honest empty screen plus the reason - which is what step 3 is for, so the
   two land together in practice.
2. **The reading view.** Scrim over the shell, canvas centred and lit, `Esc`
   and a visible Exit above the scrim. The screen list goes behind the scrim.
3. **The flow strip.** Broker, subscription count, last value, silent topics,
   and the plain statement that input is published for real.
4. **Navigation by the device's own means** inside the preview.
5. **Tests.** Rewrite `preview-mode.spec.ts` around the new shape; extend
   `live-preview.spec.ts`. One of them must assert decision 4 directly: with a
   connected broker and no value, the preview says so in words, and the
   assertion has to fail if that sentence disappears.

## Left open

- **Filling in `examples` is still tedious.** Independent of all of the above,
  a button per topic that takes the broker's current value as the example would
  turn transcription into one click and leave conformance its data. Worth doing,
  not part of this plan.
- ~~**`useMqttConnection("screenbee-preview")`** carries the old name and
  belongs to the rename, not here.~~ Done on 2026-09-23 with the rest of it
  (docs/2026-09-23-schaltli-rename.md); it now says `schaltli-preview`.
