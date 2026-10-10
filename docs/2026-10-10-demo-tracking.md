# Counting what demo visitors do

Decided with the user on 2026-10-10. Part of `docs/2026-10-09-demo-instance.md`.

## What it answers

Who visits demo.schaltli.com, and for how long. Roughly where visitors come from. What they do there.

## How

- **The page** (`hooks/use-demo-tracking.ts`) sends events to `POST /api/demo/event`, and only in the demo:
  - `visit`, with the referring page and whether it is the phone page;
  - `beat`, every 30 s while the tab is shown;
  - `leave`, sent with `sendBeacon`;
  - `mode` (preview or designer) and `screen` (opened in the preview);
  - `tap`, the command a tap in the preview published, as `topic=value` without `schaltli/cmnd/`;
  - `scene` (shower or refill) and `insert` (object types);
  - `download`, `upload`, and `refused` (save, deploy or versions).
- **The visit** is a random id per tab, kept in sessionStorage. There is no cookie.
- **The server** (`lib/demo-events.ts`) checks each event:
  - known type, an id of 8 to 32 characters, a detail of at most 120 characters;
  - at most 120 events a minute per visit, and at most 60 new visits an hour per address;
  - the body is at most 2000 characters.
  It then writes one JSON line into `.data/demo-events/<day>.jsonl`. Day files older than 30 days are deleted.
- **The place** (`lib/demo-geo.ts`) is looked up for `visit` only, from Caddy's `X-Forwarded-For`, in DB-IP's free city database on the server (`DEMO_GEO_DB`). It is kept as country and region. The city is kept only where GeoNames counts 50 000 people or more (`DEMO_BIG_CITIES`, made by `deploy/demo/big-cities.js`). Both files are fetched by `deploy/demo/setup.sh` and fetched again after a month.
- **The address is never written.** It lives in memory only for the place and the limits.
- **Browser and form** come from the user agent:
  - browser: Chrome, Firefox, Safari, Edge, Opera, other;
  - form: phone, tablet, desktop.
- **The report** is `deploy/demo/report.js` on the server, or `bash deploy/demo/report.sh [--days 7]` from the PC. It shows:
  - visits, their length, and how many opened the designer, inserted something or downloaded;
  - per day;
  - places, referring sites, browsers;
  - screens, switches, scene, inserts and refusals.
- **The same report as a page** is `/stats/<DEMO_REPORT_KEY>` (`app/stats/[key]/page.tsx`), with the periods today, 7 days and 30 days. The key is 32 random characters in `/etc/schaltli-demo.env`. `setup.sh` makes it once, keeps it, and prints the address at the end. A wrong key gets 404, and so does any request outside the demo. The page is not indexed and sends no referrer. Anyone who has the link sees the page, so the link is not passed on. Outside production the tests' fixed key works too.
- **The notice** sits in the demo's notice line and on its phone page: «Visits counted anonymously, no cookies». It links to the handbook (`einfuehrung/ausprobieren#demo-zaehlt`).

## Not done

- **No recording of the screen or the mouse.** It weighs too much, needs consent and would send data to others.
- **No third-party analytics.**

## Tests

`e2e/demo-tracking.spec.ts` covers:

- the checks, the place, the limits and the pruning;
- the route: absent outside the demo; in the demo it writes the line without the address;
- a visit in the browser: preview, designer, an insert, a refused Save, a download;
- that nothing is sent outside the demo;
- the report.
