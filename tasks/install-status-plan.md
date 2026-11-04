# Plan: a status page while the designer installs

Asked by the user on 2026-11-04: during an install on the Pekaway, port 3000
refuses the connection («Die Website ist nicht erreichbar») for the whole of
npm ci and the build, some 10 minutes over the van's link, and nothing says
why or how far it is.

## What was found

- `deploy/pekaway-install.sh` stops the designer's socket, proxy and service
  before `npm ci` (section 3a, line ~127, so the build has the memory) and
  starts the socket again in section 5 (line ~285). In between nothing
  listens on 3000.
- The script logs with `log()` to stdout only. Where that ends up depends on
  how it was started (`nohup … > /tmp/schaltli-install.log`, or the terminal).
- Node is there before `npm ci` (NodeSource), and nothing else is needed.
- `e2e/pekaway-install.spec.ts` already checks the script's text.

## Approach

1. **Its own log.** The script writes everything it prints into
   `~/.schaltli/install.log` as well (`exec > >(tee -a …) 2>&1` right after
   the start), whatever the caller does with stdout. The file is begun anew
   for each install.
2. **A status server on 3000 while the designer is gone.** Right after the
   stop in 3a, the script starts a small Node server (no packages, written
   from the script itself to a temporary file) as a transient systemd unit
   (`systemd-run --unit schaltli-install-status`). That way it survives the
   end of the SSH session, as the install itself must. It answers every path:
   - `/`: a page «Schaltli wird aktualisiert»: the version being installed,
     the current step (the last `[pekaway-install]` line), and the last 40
     lines of the log. It reloads itself every 3 s.
   - `/api/*` and everything a device asks for: 503 with `Retry-After`, so
     a board or the app tries again later instead of reading a page.
3. **Handover.** In section 5, just before the socket starts again, the
   status unit is stopped. The page then reloads into the designer.
4. **When it fails.** A `trap` on error leaves the status server running and
   shows «Installation fehlgeschlagen» with the log's end. Then the van can
   see why from any browser. The next install, or a reboot, ends it (it is
   transient).

## Tasks

- **T1 log and status server** (done 2026-11-04) in `deploy/pekaway-install.sh`: tee to
  `~/.schaltli/install.log`, the server, start after 3a's stop, stop before
  section 5's socket start, trap on failure.
  Verify: `e2e/pekaway-install.spec.ts` extended. The server script is
  pulled from the shell script and run against a sample log: `/` shows the
  step and the log's end, `/api/projects` gives 503, and failure is shown.
  The script's order is checked too: the status unit starts after the stop
  and stops before the socket.
- **T2 handbook** (done 2026-11-04) `betrieb/updates.md` and `installieren/pekaway.md`: during
  an update, port 3000 shows the progress, and the log is in
  `~/.schaltli/install.log`.
- **T3 for real**: the next install in the van, the page watched from the PC.

## Open

- Whether the page should say anything for a device's own update screen. My
  proposal: no. Devices only get the 503 and retry.
