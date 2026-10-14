# Plan: no-made-up-values

Spec: `docs/2026-10-14-topic-discovery.md`, module `no-made-up-values`.
Where the broker reported nothing, a placed block stores no example; a
value heard live while the Block dialog is open counts like a retained
one. After `ha-sensor-type`; next: `broker-listener`. Run under the
user's «bau durch» of 2026-10-14 (plans of the later modules approved with
the spec).

## Decisions taken here

1. **`readTopicEntry` stores `[heard]` or `[]`** (`lib/bausteine.ts`). The
   `sample` argument stays where it measures a width (the number look's
   «100.0», a state's word) and is no longer stored. A JSON topic without a
   heard value gets no example either; its subtopic is still declared.
2. **Write topics keep their examples.** A switch's write topic lists the
   payloads it sends (`ON`, `OFF`) - not a made-up reading, what the block
   itself publishes.
3. **No example means no value yet, in the editor too.** A live-value text
   then draws its name and nothing after it, as the device does before the
   first message (`hasNoValue`, device contract §4); a level, gauge or
   switch draws its empty state. No placeholder text like «Topic … has no
   Examples» on a placed block.
4. **`useRetainedValues` keeps listening** while its topics are asked for
   (the dialog open): a retained message and a live one both set the
   value, the latest wins. Renamed `useHeardValues`.

## Tasks

- **N1 No sample stored.** `readTopicEntry` as decision 1; the level, choice,
  state and text cases follow. Test: cases in `e2e/bausteine.spec.ts` on
  `buildFromCatalog` - a value, a level, a state, a text without
  `reported` declare `examples: []`; with `reported`, the value; a switch's
  write topic keeps ON/OFF. Files: `lib/bausteine.ts`,
  `e2e/bausteine.spec.ts`.
- **N2 The editor draws no value yet.** What a placed block looks like with
  no example, checked for each look a catalog places (number, bar, gauge,
  text, switch, buttons, slider, dial); where one shows a placeholder
  text, it draws its no-value state instead. Test: e2e - Rajiva's «Service
  ID» with nothing on the broker: the topic has no examples, the canvas
  shows «Service ID» and no «60». Files: renderers as found,
  `e2e/bausteine.spec.ts`.
- **N3 Heard while the dialog is open.** `useHeardValues`; the Block
  dialog uses it. Test: e2e - the Service ID's value published live (not
  retained) after the dialog opened: the dialog shows it and the placed
  topic's example is it. Files: `hooks/use-block-catalog.ts`,
  `components/baustein-dialog.tsx`, `e2e/bausteine.spec.ts`.
- **N4 Handbook.** `handbuch/designer/bausteine.md`: the example values
  are what the broker sent, read while the dialog is open; with nothing
  heard the block shows no value until one arrives.

## Checkpoint

`npm run test:quick` green after the module; commits per task, pushed.
