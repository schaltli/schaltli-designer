# Todo: ha-lock

Fourth of the missing components of the 2026-10-26 overview. Source:
`homeassistant/components/mqtt/lock.py` and `mqtt/const.py` (branch `dev`,
read 2026-10-26), source/_integrations/lock.mqtt.markdown. Asked for by the
user 2026-10-26 («weiter»).

Decisions:
- Parts: State (text: a lock reports more than two states, jammed among them), Lock (a switch, buttons «Lock» and «Unlock», reading `state_locked`/`state_unlocked`, default LOCKED/UNLOCKED, writing `payload_lock`/`payload_unlock`, default LOCK/UNLOCK), Open (a button, only where `payload_open` is set: it has no default).
- Only read (no command topic): the state alone, not a second reading of it as two states.
- A lock with `code_format` is only read: Home Assistant checks the code before it sends, a button on a screen would not. Lock and Open are skipped with «a code».

- [x] L1 The parts
  - `case "lock"`, `writtenOnly`, the switch's states may carry a label (lib/ha-discovery.ts); e2e/ha-discovery.spec.ts three lock cases; fixtures schaltli-zentralverriegelung.json, ha-docs-lock-frontdoor.json
- [x] L2 Placed from the broker
  - e2e/bausteine.spec.ts «a central locking: its state beside the name, Lock and Unlock as buttons»
- [x] L3 Handbook
  - handbuch/designer/bausteine.md: a paragraph under «Mehrere Teile»; checked against the maettel-humanizer catalog
- [x] Checkpoint: test:quick 2026-10-26: e2e 1696 passed, 1 skipped; papers3 lane green; knob, 4v3b and the phone not reachable, skipped
