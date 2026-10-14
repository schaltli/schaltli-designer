# Plan: topic-picker

Spec: `docs/2026-10-14-topic-discovery.md` (decisions 4-6), module
`topic-picker`. Wherever a topic is chosen, what the designer heard is
offered beside the project's topics; choosing one adds it; a topic nobody
sent is added where it is typed. After `broker-listener`; next:
`listen-viewer`.

## Decisions taken here

1. **The picker is a popover, not a `Select`** - a `Select` cannot hold a
   search field. Trigger as today (the bound topic, its type, «unregistered»
   for one the project lacks). Inside: the search field (focused), the
   switch «All» / «Project only» with counts, the tree
   (`lib/topic-tree.ts`), «No topic» on top, «Manage Topics...» at the
   bottom. «All» is the default every time it opens.
2. **One item per topic name:** the project's `Topic` and what was heard
   (`useHeardTopics`), either or both. A row shows the latest heard payload
   (or «not heard», pale, for a project topic nobody sent), the type (the
   project's, else the guessed one) and ✓ for a project topic.
3. **Adding goes through a context,** `TopicAdderContext` from
   `project-editor.tsx`, so the dozen property panels that pass `topics`
   and `onManageTopics` down need no new prop. Adding and binding happen in
   one click handler, so React batches them into one change and one undo
   step.
4. **What an added heard topic brings:** its name, the guessed type, its
   JSON fields as subtopics, and as examples its kept messages, newest
   first, without repeats - for a read binding. For a write binding
   (`allowSubtopics` false) no examples: what others sent is not a command
   (spec, topic-picker).
5. **Added by hand:** when the search text is not a topic shown, «Add topic
   «…»» with the chips numeric, text, json; a click adds it with no
   examples and binds it. A name with `+`, `#` or spaces is not offered
   (an MQTT topic to publish to cannot hold wildcards).
6. **The `{topic:…}` completion** (`lib/placeholder-completion.ts`) lists
   heard topics after the project's, on the same fragment match, marked
   «heard»; picking one adds it as in 4.

## Tasks

- **P1 The popover and the tree.** Project topics only, as today, but in
  the new popover with search and counts. Test:
  `e2e/topic-selector.spec.ts` adapted to the popover; a search case.
- **P2 Heard topics and adding by use.** «All» / «Project only»; a heard
  topic chosen is added and bound in one undo step, with examples for a
  read binding and none for a write. Test: new
  `e2e/topic-picker.spec.ts` on a broker of its own (as
  `e2e/broker-listener.spec.ts`): `pkw/tele/water/fresh = 64` bound to a
  Level, added numeric with example 64; undo takes both back; «water»
  shows the water branch and the project's `van/water_pump`; «Project
  only» shows the project's alone.
- **P3 Adding by hand.** Test: «pkw/tele/tank/black» heard by nobody,
  «Add topic» text → added without examples and bound.
- **P4 The completion.** Test: typing `{` and «fresh» in a text offers the
  heard `pkw/tele/water/fresh`; picking it adds it.
- **P5 Handbook.** `handbuch/designer/topics.md` («Ein Topic an ein Objekt
  binden»): the picker's tree, search, «All» / «Project only», adding by
  use and by hand. Labels quoted are checked by
  `e2e/handbook-labels.spec.ts`.

## Checkpoint

`npm run test:quick` green; commits per task, pushed.
