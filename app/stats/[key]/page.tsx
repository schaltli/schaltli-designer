import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { isDemo } from "@/lib/demo-mode"
import { demoEventsDir } from "@/lib/demo-events"
import { demoReportKeyMatches } from "@/lib/demo-report-key"
import report from "@/deploy/demo/report.js"

// The demo's stats (docs/2026-10-10-demo-tracking.md): what
// deploy/demo/report.js sums up, as a page at an address only who was given
// it knows - /stats/<DEMO_REPORT_KEY>. Anything else, and anywhere but the
// demo, is not found. Never indexed, and it sends no referrer.

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Demo stats",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

const PERIODS = [1, 7, 30]

type Rows = [string, number][]

function List({ title, rows }: { title: string; rows: Rows }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">-</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([key, value]) => (
              <tr key={key} className="border-t border-border first:border-t-0">
                <td className="py-1 pr-2">{key}</td>
                <td className="py-1 text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Figure({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {note ? <div className="text-xs text-muted-foreground">{note}</div> : null}
    </div>
  )
}

export default function DemoStatsPage({ params, searchParams }: { params: { key: string }; searchParams: { days?: string } }) {
  if (!isDemo({ headers: headers() as unknown as Headers }) || !demoReportKeyMatches(params.key)) notFound()
  const days = PERIODS.includes(Number(searchParams.days)) ? Number(searchParams.days) : 7
  const s = report.summarize(report.readEvents(demoEventsDir(), days))
  const perDay = [...s.days.entries()].sort().reverse() as [string, { visits: number; seconds: number[]; designer: number; downloads: number }][]

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-foreground">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Demo stats</h1>
        <nav className="flex gap-1 text-sm" aria-label="Period">
          {PERIODS.map((d) => (
            <a
              key={d}
              href={`?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={d === days ? "rounded-md bg-foreground px-2 py-1 text-background" : "rounded-md px-2 py-1 hover:bg-accent"}
            >
              {d === 1 ? "Today" : `${d} days`}
            </a>
          ))}
        </nav>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Figure label="Visits" value={s.visits} note={`${s.phonePage} on the phone page`} />
        <Figure label="Median length" value={report.duration(s.medianSeconds)} note={`longest ${report.duration(s.longest)}`} />
        <Figure label="Opened Designer" value={s.designer} note={report.pct(s.designer, s.visits)} />
        <Figure label="Inserted something" value={s.inserted} note={report.pct(s.inserted, s.visits)} />
        <Figure label="Download Project" value={s.downloads} note={report.pct(s.downloads, s.visits)} />
      </div>

      <section className="mb-4 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium">Per day</h2>
        <table className="w-full text-sm" data-testid="stats-per-day">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Day</th>
              <th className="py-1 text-right font-normal">Visits</th>
              <th className="py-1 text-right font-normal">Median</th>
              <th className="py-1 text-right font-normal">Designer</th>
              <th className="py-1 text-right font-normal">Downloads</th>
            </tr>
          </thead>
          <tbody>
            {perDay.map(([day, d]) => (
              <tr key={day} className="border-t border-border">
                <td className="py-1">{day}</td>
                <td className="py-1 text-right tabular-nums">{d.visits}</td>
                <td className="py-1 text-right tabular-nums">{report.duration(report.median(d.seconds))}</td>
                <td className="py-1 text-right tabular-nums">{d.designer}</td>
                <td className="py-1 text-right tabular-nums">{d.downloads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <List title="Where from" rows={report.top(s.places, 15)} />
        <List title="Came from" rows={report.top(s.from, 10)} />
        <List title="Form / browser" rows={report.top(s.browsers, 8)} />
        <List title="Screens opened in the preview" rows={report.top(s.screens, 10)} />
        <List title="Switched in the preview (topic)" rows={report.top(s.taps, 15)} />
        <List title="In the drawing of the van" rows={report.top(s.scene, 5)} />
        <List title="Inserted in the designer" rows={report.top(s.inserts, 15)} />
        <List title="Asked for what the demo does not do" rows={report.top(s.refused, 5)} />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        No cookie, no address: a visit is a random id per tab, kept 30 days. IP Geolocation by{" "}
        <a href="https://db-ip.com" className="underline">
          DB-IP
        </a>
        .
      </p>
    </main>
  )
}
