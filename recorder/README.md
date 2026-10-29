# The chart recorder

Collects the history the deployed charts ask for and lays it, retained, on
the broker (`docs/2026-10-16-charts.md`, `docs/device-contract.md` §2.13).
Plain Node.js; its only dependency is `mqtt`.

```
node recorder/index.js --broker mqtt://localhost:1883 --file ~/.schaltli/history.json
```

| Option | Default | |
|---|---|---|
| `--broker` | `mqtt://localhost:1883` | any MQTT URL, `mqtt://user:password@host:1883` with a login |
| `--file` | `~/.schaltli/history.json` | written every 30 minutes and when stopped (SIGTERM, SIGINT) |
| `--tz` | the system's | the time zone its days are counted in |
| `--id` | the host name | the name it records under on the broker |
| `--tick-ms`, `--save-ms` | | for tests: lay everything that often, write the file that often |

On a Pekaway, `deploy/pekaway-install.sh` installs it as
`schaltli-designer-recorder.service`, always on. Anywhere else, run it on a
machine that is always on and reaches the broker - with systemd, a unit as
in that script; elsewhere whatever keeps a process running.

Only one recorder records per broker: it says so retained on
`schaltli/history/recorder`, and a second one started on the same broker
waits until the first is gone.

Tests: `e2e/recorder-history.spec.ts`, `e2e/recorder-service.spec.ts`,
`hil/recorder.js`.
