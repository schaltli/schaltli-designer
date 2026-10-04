# Blocks described by the bridge

Agreed with the user on 2026-10-04 (idea session «raster-slider»). Its
sibling is docs/2026-10-04-ring-adjust.md.

## Problem

How might a user get a ready, «perfect» block for a device the bridge
knows - without the designer learning anything about Pekaway?

From a Home Assistant entity the designer can only build what the
entity's schema says, and that is too little. A climate's `fan_modes` are
a list of texts: whether they are a scale or not (`low/medium/high`
against `off/heat/cool/auto`) Home Assistant does not say, so a choice
safely becomes a button group. The MaxxFan's speed, `10`…`100`, is ten
buttons today.

The bridge knows exactly what the MaxxFan should look like: in auto mode
the temperature slider only, by hand the speed slider only (10-100 in
tens), off no control at all. No Home Assistant entity can say that.

## Direction

**The knowledge lives in the bridge; the designer stays general.** Besides
its Home Assistant discovery, the bridge publishes a retained block
description per device on a discovery topic of Schaltli's own, e.g.
`schaltli/blocks/<id>/config`. The designer reads it with the Home
Assistant configs and lists it in the Block menu like any entity.

**The description says what the device is, not how it looks.** Its shape
is the designer's own catalog entry (`CatalogEntry` and `CatalogControl`
in `lib/ha-discovery.ts`): a name, an icon, parts of the kinds `switch`,
`state`, `value`, `level`, `choice`, `button`, each with its topics and
its min, max and step. Size, colour, font and arrangement stay the
designer's (`lib/bausteine.ts`), so a newer bridge cannot break an older
designer's layout.

**One new idea: a part shown only when a topic has a value.** A part may
carry `shownWhen: { topic, values[] }`. The designer turns the parts that
carry it into a `switcher` on that topic with one `panel` per value -
objects the contract and all devices already know. Any sender may use it;
nothing in the designer names a MaxxFan.

The MaxxFan, roughly:

```
MaxxFan
  Mode         choice  maxxfan/hvac_mode   off · fan_only · auto
  Temperature  level   0-37, step 1        shown when hvac_mode = auto
  Speed        level   10-100, step 10     shown when hvac_mode = fan_only
  Cover        switch  open · closed
  Airflow      switch  in · out
```

The bridge keeps publishing its Home Assistant entities as today, for
Home Assistant's sake; the block description sits beside them.

## Assumptions to check

- [ ] The catalog entry is a fair wire format: stable enough to publish,
      and nothing in it is the designer's private business. Read
      `CatalogEntry` against what the bridge would send.
- [ ] A switcher with panels drawn from parts lays out well inside a
      block, on every size step (switcher plus panels inside a block's
      table are not built anywhere today).
- [ ] The speed slider's write reaches the MaxxFan unchanged: the
      bridge's `maxxfan/speed` takes an integer 1-100 and rounds to the
      ten steps - check what the firmware and the app actually publish
      for `10` (`formatLevelPayload`, `formatSetValue`).
- [ ] The bridge knows the topics' final shape when it publishes (it
      announces the MaxxFan only once it has seen it).

## MVP

- Format: the description on `schaltli/blocks/<id>/config`, retained, a
  `version` field; `CatalogEntry` plus `shownWhen`.
- Bridge (`integrations/vanpi/bridge-logic.js`): the MaxxFan's
  description; then the heater's (temperature, power, fan level by
  preset).
- Designer: read the topic beside Home Assistant's; list the entry under
  its device; build `shownWhen` parts as a switcher with panels.
- Tests: the bridge's unit tests for the description; an e2e spec placing
  the MaxxFan block from a mocked broker and switching its mode; the HIL
  discovery devices (`hil/discovery-devices.js`) gain the description.
- Handbook: the block page, the VanPi bridge page
  (`handbuch/betrieb/vanpi-bruecke.md`).

## Not doing

- Recipes for bridge devices inside the designer - the designer learns
  Home Assistant, not Pekaway (decided 2026-10-04).
- Complete layouts from the bridge (positions, sizes, colours) - **the
  bridge supplies what belongs to the device, the designer decides what
  belongs to the screen.** The bridge cannot know which device the block
  lands on (a round Knob, the 4.3B, an e-paper without touch), the
  project's theme, font and size step, or which version of the object
  model the designer has; a layout from it would be wrong for all but one
  case and out of date with the next contract change, and the designer
  would have to translate it anyway. Turning «a level 10-100 in tens»
  into a slider - or a bar where there is no touch - is control
  knowledge, not vendor knowledge; the designer does it for any Home
  Assistant entity already.
- Hiding a choice's buttons behind a guess - a Home Assistant choice stays
  Buttons; only a description says «this is a scale».
- Extra keys in the Home Assistant discovery configs - Home Assistant's
  schemas are fixed; the description has its own topic.
- An extra `number` entity in Home Assistant for the MaxxFan's speed -
  not needed once the description carries it.

## Open questions

- When a device has both, does the Block menu show the bridge's block in
  place of its Home Assistant entities, or beside them?
- Is `shownWhen` the only condition needed (equals one of several
  values), or does the heater already want more?
- The topic's name and prefix: fixed `schaltli/blocks`, or configurable
  like the Home Assistant discovery prefix?
