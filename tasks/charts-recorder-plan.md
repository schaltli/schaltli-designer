# Plan: charts-recorder

Spec: `docs/2026-10-16-charts.md` (decisions 1-7, «What the recorder gets»,
«What the recorder lays on the broker», «Open»). Beside `charts-model`,
which works out the wants (M6) this plan publishes. The recorder collects
what the deployed charts ask for and lays their history on the broker; no
display draws it yet.

## Decisions taken here (to approve)

1. **A standalone Node program in `recorder/`**, plain JavaScript modules,
   no build step, no Next.js, its only dependency `mqtt` (already in the
   designer's). It runs wherever Node and a broker are:
   `node recorder/index.js --broker mqtt://localhost:1883 --file <path>`.
   This loosens spec decision 3 («a systemd unit installed with the
   designer»): installed with the designer is one way, not the only one
   (user, 2026-10-29, after the discussion of setups outside Pekaway). The
   spec gets the line once this is approved.
2. **The core is pure and takes the time from outside.** `recorder/history.js`
   ingests `(topic, raw payload, now)` and answers the payloads; the
   service around it (`recorder/service.js`) only connects, subscribes,
   schedules and publishes. So every rule of the spec - steps, day
   boundaries, summaries, pruning - is tested without a broker and without
   waiting.
3. **Steps.** Level and power: per step `mean`, `min`, `max` of what
   arrived, `null` where nothing did. The mean is weighted by time (a
   value holds until the next one), not by message count: a sensor that
   reports every second while charging and once a minute otherwise would
   otherwise weigh its fast phase far too much, and the energy (mean × time,
   decision 5) would be wrong. A value carried over into a step where no
   new one arrived counts there, up to 15 minutes after it came; after
   that the step is `null` - a sensor that went quiet is not a flat line.
   State: on-periods in minutes since midnight, cut at midnight.
4. **Time zone and days** come from the system the recorder runs on
   (`Intl`), written into `schaltli/history/now`. A day is a calendar day
   there; the 23- and 25-hour days of the clock change have 92 and 100
   steps.
5. **One recorder per broker.** The recorder lays retained
   `schaltli/history/recorder` `{ "state": "online", "id": <host>,
   "since": <unix s> }`, its last will the same with `"offline"`. A
   recorder that starts and finds another `id` online stays passive -
   records nothing, says why in its log - until that one goes offline.
   The preview reads the same topic for decision 11 («no recorder»).
6. **Values it cannot read are skipped, not guessed.** A level or power
   payload that is not a number (after `#path`) is ignored; a state
   compares with `onMeans` by the same rules as a Live Icon's rule
   (`==` compares text, decision of 2026-10-29). Those rules live in
   TypeScript (`lib/live-value.ts`); the recorder has its own small copy,
   and a test feeds both the same vectors so they cannot drift.
7. **What stops being wanted stops being recorded.** Its days stay on the
   broker and age out after 30 days like any other; the retained topics
   of a day older than 30 days are cleared (empty retained payload).
8. **On the disk**: one JSON file, written atomically (temporary file,
   rename) every 30 minutes and on SIGTERM/SIGINT; read on start, after
   which every kept day is published again (the spec's «Open» on
   Mosquitto persistence). Default path
   `~/.schaltli/history.json`.
9. **Deploy publishes the wants.** After a deploy the device confirmed,
   the deploy dialog lays `schaltli/history/wants/<instance>` retained,
   from `historyWants` (charts-model M6) of the project as sent to that
   device; a project without charts clears it. Nothing is published for a
   deploy that failed.
10. **Installed with the designer on a Pekaway** as `schaltli-recorder.service`:
    always on (not socket-activated like the designer), `Restart=always`,
    `MemoryMax=` as a guard. `deploy/pekaway-install.sh` installs it;
    only the user runs that script. A short handbook section says what it
    is, where its file lies, and how to run it on another machine.

## Tasks

- **R1 Steps.** `recorder/history.js`: level and power at 1, 5 and 15
  minutes, time-weighted (decision 3); state periods; the carry-over and
  its 15-minute limit.
  Test: `e2e/recorder-history.spec.ts` (pure, imports the module): a
  fast and a slow phase give the time-weighted mean; a gap gives `null`;
  a state on across midnight is cut into two days; `#path` and a non-number.
  Files: `recorder/history.js`, `recorder/compare.js`,
  `e2e/recorder-history.spec.ts`.
- **R2 Payloads and days.** The payloads of «What the recorder lays on
  the broker» - `day/<date>`, `recent`, `recent6`, `daily` (energy in and
  out, decline, rise, mean, min, max, run time, starts) - day rollover in
  the time zone, clock-change days, pruning after 30 days and 48 hours.
  Test: `e2e/recorder-history.spec.ts`: each payload against hand-worked
  numbers; a tank refilled counts no decline; a DST day has 92 steps.
  Files: `recorder/history.js`, `e2e/recorder-history.spec.ts`.
- **R3 The service.** `recorder/service.js` and `recorder/index.js`:
  subscribes to `schaltli/history/wants/+`, records their union, publishes
  each topic's payloads at the end of each step and `now` every minute,
  presence and last will, the passive second recorder (decision 5).
  Options for tests: a step length in seconds.
  Test: `e2e/recorder-service.spec.ts` against an in-process aedes
  (`e2e/own-broker.ts`): a want appears, values arrive, the retained
  `day`/`recent` topics appear; a want cleared stops recording; a second
  recorder stays passive until the first ends.
  Files: `recorder/service.js`, `recorder/index.js`,
  `e2e/recorder-service.spec.ts`.
- **R4 Persistence.** Write and restore (decision 8).
  Test: `e2e/recorder-service.spec.ts`: stopped and started again, the
  recorder publishes the same days; a torn temporary file leaves the old
  one intact.
  Files: `recorder/store.js`, `recorder/service.js`, the spec.
- **R5 Deploy lays the wants** (decision 9).
  Test: `e2e/deploy-dialog.spec.ts`: after a confirmed deploy of a
  project with a chart the retained want is on the own broker; a deploy
  without charts clears it; a failed one publishes nothing.
  Files: `components/deploy-dialog.tsx`, `e2e/deploy-dialog.spec.ts`.
- **R6 A real run on the bench.** `hil/recorder.js`: starts the recorder
  as a process against the local broker (`hil/local-broker.js`), lays a
  want, publishes values at a short step length, checks the retained
  history and the restart; in the host lane of test:quick.
  Files: `hil/recorder.js`, `hil/test-all.js`, `hil/README.md`.
- **R7 Install and handbook.** `schaltli-recorder.service` in
  `deploy/pekaway-install.sh` (decision 10); `recorder/README.md` for
  other machines; a section in `handbuch/betrieb/` through
  maettel-humanizer; spec decision 3 reworded (decision 1).
  Files: `deploy/pekaway-install.sh`, `recorder/README.md`,
  `handbuch/betrieb/*.md`, `docs/2026-10-16-charts.md`.
- **Checkpoint:** test:quick green; the user installs on the Pekaway
  (`van-deploy`); then measured there: the recorder's memory with the van's
  topics (spec «Open») and whether Mosquitto keeps retained messages over
  its restart. Both answers go into the spec.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Memory on a 2 GB Pi | Medium | `MemoryMax` guard; measured at the checkpoint; the arrays are fixed-size per topic |
| Two recorders write the same topics | Medium | presence with last will (decision 5), tested in R3 |
| SD card wear | Low | one write per 30 minutes (decision 2 of the spec) |
| The recorder's comparison drifts from the designer's | Low | shared vectors test (decision 6) |
| A knob's MQTT buffer too small for a day | Low | a day is about 2-3 KB; R2's test asserts the size of a full day |

## Not in this plan

Drawing the history (the designer's preview and the devices), Home
Assistant's history API, export of the history, a Docker image (later, if
someone without a Pekaway asks for it).
