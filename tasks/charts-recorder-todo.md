# Todo: charts-recorder

Plan: `tasks/charts-recorder-plan.md`. Approved by the user on 2026-10-29 («ok, go!»), all decisions as written.

- [x] R1 Steps
  - recorder/compare.js: the designer's `matches` and JSON field, copied; recorder/history.js `Series`: level and power at 1, 5, 15 min, time-weighted, a value held 15 min at most, the positive integral for energy in; state periods (no condition: «is yes»)
  - e2e/recorder-history.spec.ts: the two copies against the designer's on the same vectors (2), steps (5)
- [x] R2 Payloads and days
  - recorder/history.js: `dayPayload` (15 min, 92/96/100 steps; a state's minutes since midnight), `recentPayload` (2 h at 1 min, 48 h at 5 min; a state's periods in unix seconds - written into the spec), `dailyPayload` (30 days: energy in and out, decline, rise, mean, min, max; run time, starts), `prune`, `toJSON`/`fromJSON`
  - e2e/recorder-history.spec.ts «the recorder's payloads (R2)» (6), a full day under 4 KB among them
- [x] R3 The service
  - recorder/service.js `createRecorder`: the union of `schaltli/history/wants/+` (one series per topic; a topic wanted as two kinds keeps the first, said in the log), subscribed by its bare topic; `recent` each minute, `recent6` each five, today's `day` and `daily` each quarter hour, the day just ended once more at midnight, `now` each tick; days older than 30 cleared; a series nobody wants and with nothing left forgotten
  - presence `schaltli/history/recorder` {state, id, since, seen}, renewed each minute, «offline» as its last will; a second recorder waits while another's is online and seen within 3 minutes
  - recorder/index.js: the command line (`--broker`, `--file`, `--tz`, `--id`, `--tick-ms`, `--save-ms`)
  - found on the way: a `#` cannot be in a published topic name - the history of `x#path` lies under `x~path` (`historyName`, lib/chart.ts and recorder/service.js; spec and contract say so)
  - e2e/recorder-service.spec.ts (aedes, the test's clock): wants in, history out, unwanted stops; a second recorder waits; e2e/recorder-history.spec.ts: both `historyName` the same
- [x] R4 Persistence
  - recorder/store.js: written to `.tmp` and renamed; read on start, then today and every day with something recorded laid again
  - e2e/recorder-service.spec.ts: stopped, the broker emptied, started again - the same day laid; a torn `.tmp` leaves the last good file
- [x] R5 Deploy lays the wants
  - components/deploy-dialog.tsx: once the board is back after «rebooting», or an app reports «applied», `schaltli/history/wants/<instance>` retained from `historyWants` of the project sent; empty, the want is cleared; a failed deploy publishes nothing (`HISTORY_WANTS`, lib/chart.ts)
  - e2e/deploy-dialog.spec.ts «the recorder's wants» (3)
- [x] R6 A real run on the bench
  - hil/recorder.js: the recorder as a process against the bench's broker - a want, a level with a JSON field and a heater, the history read back retained; killed, the broker's day cleared, started again: the day back from its file; everything cleared at the end; SKIPPED without a broker or with another recorder on it
  - its first run found `recorder/index.js`'s `~` expansion broken (a regular expression that did not compile): fixed
  - hil/test-all.js: host lane, quick; hil/README.md «The recorder»
- [x] R7 Install and handbook
  - deploy/pekaway-install.sh 5a: `schaltli-designer-recorder.service`, always on, `Restart=always`, `MemoryMax=256M`, its file `/home/pi/.schaltli/history.json`; named in the closing lines
  - e2e/pekaway-install.spec.ts: the unit always on, after the build; the closing lines with it
  - recorder/README.md; handbuch/betrieb/daten.md «Der Verlauf», the unit and the file under backup and «Was ausserhalb liegt» (through maettel-humanizer)
  - spec decision 3 reworded (plan decision 1)
- [ ] Checkpoint: test:quick green; the user installs on the Pekaway; memory and Mosquitto persistence measured, answers in the spec
