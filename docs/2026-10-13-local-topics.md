# Local topics

Asked for by the user on 2026-10-13, while the demo's page «Energie» was
to get a switch between Flow and Sankey: "eigentlich ist es doch völlig
sinnlos, wenn man für eine LOKALE Umschaltung ein MQTT Topic machen muss
… dann kann jedes Display seinen eigenen State haben". Builds on live
values and combined topics (`docs/2026-10-07-live-values.md`, generation
1.4) and the energy diagram (`docs/2026-10-11-energy-diagram.md`, 1.7).

Status: approved by the user on 2026-10-13.

## Objective

Some values only matter to the display that shows them: which look a page
shows (Flow or Sankey), which tab of a page is open, a «details» fold.
Today such a value has to be an MQTT topic, which needs someone to keep
it (the VanPi bridge keeps the theme), and it is shared: switching the
view on one display switches it on every display in the van - in the
demo, for every visitor at once.

A local topic is a topic the display keeps itself. A switch, a button
group or a button writes it, anything that reads a topic reads it, and it
never leaves the device: nothing is published, nothing subscribed. Each
display has its own value.

Users: whoever builds a panel in the designer; first the demo's page
«Energie», whose switch shows Flow or Sankey.

## Decisions

1. **The declaration says it, not the name.** A topic in `topics[]` with
   `local: true` is local, everywhere its name stands: an object's
   `topic` and `writeTopic`, a switcher's topic, a live value's
   `{namespace: "topic", path}`, a combined topic's condition, a button's
   send-mqtt `mqttTopic`, an energy node's `topic`. Its name can be
   anything; nothing is reserved, so no real MQTT topic can be taken for
   a local one by its name (decided 2026-10-13, instead of a `local/`
   prefix: a real topic `local/…` would have been silently never
   subscribed and never published). Every reader keys values by topic
   name as now; only whether to publish or subscribe looks the
   declaration up.
2. **Declared like any topic**, with its type and examples, and one more
   field: `initial`, the value it has when the display starts. Without
   `initial` it has no value yet, as a topic before its first message (a
   switcher shows its first panel). A topic used but not declared is
   never local.
3. **A write is a value.** Writing a local topic sets its value at once,
   as if it had arrived: combined topics are worked out again, and what
   reads it is drawn again. A write to a local topic is never published -
   not by a device, not by the designer's Live preview.
4. **Never subscribed.** No device and no designer subscribes to a local
   topic. Should a real topic of the same name be on the broker, its
   messages do not reach the display.
5. **Lost at a restart.** A display starts every local topic at its
   `initial` again after a restart and after a deploy. Keeping it across
   a restart is left out (decided 2026-10-13): for a view switch,
   starting at `initial` again is right.
6. **Generation 1.8.** A project using a local topic needs it; Deploy
   brings an older board up to the release first and asks for an app
   update, as with 1.7. A board that does not know local topics would
   subscribe to it and publish its writes.
7. **The designer.** Local topics have their own list in the project
   settings, «Local topics», below «Combined topics» and like it (asked
   for by the user on 2026-10-13), with «Add local topic»: name (suggested
   under `local/`, a convention only, for the name to show it), type,
   «Initial value». The list «Topics» shows only the others. In the
   project they stay in `topics[]` with `local: true` (decision 1), so
   every topic picker offers them as it does any topic. Discover MQTT
   Topics never offers a local topic's name, and warns when the broker
   carries a real topic of the same name. The preview keeps local topics
   in Simulation and in Live alike; the Topic Values panel shows and
   edits them.
8. **An energy diagram in a switcher's panel or a popup moves on the
   boards.** Today the firmware draws it there but only animates
   diagrams lying straight on a screen (`energyAnimations` walks
   `screen.objects`). The demo's switch puts two diagrams into a
   switcher, so this comes with it. Android already does it.
9. **The demo.** «Energie» gets a switch «Flow | Sankey» on the local
   topic `local/energie/view` (initial `flow`) and a switcher with both
   diagrams. Each visitor switches their own.

## Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `local-designer` | `local` and `initial` in `lib/`, preview (Simulation and Live), no publish, no subscribe, topic list and «Add topic», Discover leaves them out and warns | - |
| `local-contract` | `docs/device-contract.md` §4 local topics, generation 1.8, export, Deploy's check | `local-designer` |
| `local-firmware` | knob, 4.3B, PaperS3: a write applied locally through the same path as an arriving message, never published nor subscribed, `initial` at start; HIL | `local-contract` |
| `energy-nested` | the boards animate an energy diagram in a switcher's active panel and in a popup; HIL | - |
| `local-android` | the app: the same as the firmware; the orchestrator's HIL | `local-contract` |
| `local-demo` | «Energie» with the switch and the switcher; handbook | `local-designer`, `local-firmware`, `energy-nested` |

Order: `local-designer` and `energy-nested` side by side → `local-contract`
→ `local-firmware` and `local-android` → `local-demo`. The demo in the
browser needs only `local-designer`; it can go up before the boards have
it, the page then waiting for the next release on the devices.

## Where it goes in (from the survey of 2026-10-13)

- Designer: `handlePreviewPublish` (`components/project-editor.tsx`) is
  the one funnel for every preview write; Simulation already echoes, Live
  publishes and returns - a local topic is echoed in both and published
  in neither. Subscription lists: `lib/render-screen.ts`
  `projectSubscriptionTopics`, `previewHeardTopics`. One helper,
  `isLocalTopic(project, name)`, answers for all of them.
- Firmware: `ProjectLoader::setTopicValue` stores declared topics only
  and already looks the name up in `topics[]`; the same lookup gives
  `local`. The knob's `onMqttMessage` is its one apply-a-value function;
  the 4.3B's and the PaperS3's are lambdas in their MQTT callbacks, to be
  made functions. The 4.3B and PaperS3 subscribe to all of `topics[]`,
  the knob to what its objects read: both leave local topics out. Every
  publish site (switch, send-mqtt, level, energy node) goes through one
  «write» that decides.
- Android: `MqttRepository.publish` and `_topicValues`; a local write
  updates the values instead; `TopicCollector` leaves local topics out.

## Success criteria

1. In the designer's preview, Simulation and Live, a switch on a local
   topic switches a switcher reading it; the broker sees nothing of it
   (e2e, with the mock broker listening on `#`).
2. A local topic with a name a real topic on the broker also has: the
   display neither hears the real one nor publishes to it, and Discover
   warns (e2e).
3. On the knob, the 4.3B and the PaperS3 as 1, by HIL: a tap on the
   switch shows the other panel, a listener on `#` hears nothing of it,
   and after a restart the switch is at `initial` again.
4. Two displays on one broker hold different values of the same local
   topic (4.3B and knob side by side, HIL).
5. An energy diagram in a switcher's panel and in a popup moves on the
   knob and the 4.3B as one on the screen does (HIL, the energy motion
   checks reused).
6. The Android app as 3 and 5 (orchestrator HIL).
7. Deploy of a project with a local topic to a board below 1.8 updates
   it first; to an older app asks for an update (e2e).
8. The demo's «Energie» opens on Flow, switches to Sankey and back, and
   another visitor's view stays as it was (e2e against the demo build).
9. Handbook: a section on local topics (`handbuch/designer/topics` or
   wherever topics are explained), the demo page's switch.

## Not doing

- Keeping a local topic across a restart («Keep after restart»,
  written to the device's flash) - decision 5.
- Sharing a value among some displays but not all - that is what MQTT
  topics are for.
- Local topics a rule computes by itself (counters, timers): combined
  topics cover reading several topics; anything more is another idea.
- A local topic in Home Assistant or the VanPi bridge: they never see one.
- Reserving a name prefix (decision 1).

## Open questions

None.
