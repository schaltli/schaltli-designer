import fs from "fs"
import path from "path"
import { lookUpPlace, type DemoPlace } from "@/lib/demo-geo"

// What visitors do in the demo (docs/2026-10-10-demo-tracking.md): the page
// sends small events - a visit begins, preview or designer, an object
// inserted, a switch tapped, still there - and the server writes each as one
// line of JSON into a file per day, kept 30 days. No cookie, no address: a
// visit is a random id the page makes per tab, and where it came from is
// kept as country and region (lib/demo-geo.ts), the referring site as its
// host, the browser as its family and form.
//
// deploy/demo/report.js reads the files.

/** What the page may say happened. */
export const DEMO_EVENT_TYPES = [
  "visit", // a visit begins: the referring page, the phone page or not
  "beat", // still there, every 30 s while the tab is shown
  "leave", // the tab goes
  "mode", // preview or designer
  "screen", // a screen opened in the preview
  "tap", // a command a tap in the preview published: topic=value
  "scene", // something done in the drawing of the van
  "insert", // an object placed in the designer: its type
  "download", // Download Project
  "upload", // Upload Project
  "refused", // a menu item the demo does not do: save, deploy, versions
] as const
export type DemoEventType = (typeof DEMO_EVENT_TYPES)[number]

export interface DemoEventLine {
  t: string
  visit: string
  type: DemoEventType
  detail?: string
  // On "visit" only:
  place?: DemoPlace | null
  from?: string | null
  browser?: string
  form?: "phone" | "tablet" | "desktop"
}

const VISIT_ID = /^[a-z0-9]{8,32}$/
const MAX_DETAIL = 120
const KEEP_DAYS = 30

export function demoEventsDir(): string {
  return process.env.DEMO_EVENTS_DIR || path.join(process.cwd(), ".data", "demo-events")
}

/** The host of a referring page, or null (none, unreadable, this site itself). */
export function referrerHost(referrer: unknown, ownHost: string | null): string | null {
  if (typeof referrer !== "string" || !referrer || referrer.length > 500) return null
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    return host && host !== ownHost ? host : null
  } catch {
    return null
  }
}

/** Browser family and form from the user agent - nothing finer. */
export function browserOf(userAgent: string | null): { browser: string; form: "phone" | "tablet" | "desktop" } {
  const ua = userAgent ?? ""
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "other"
  const form = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "phone" : "desktop"
  return { browser, form }
}

/**
 * An event as the page sent it, checked: the line to write, or null for
 * anything that is not one.
 */
export function eventLine(
  body: unknown,
  request: { address: string | null; userAgent: string | null; ownHost: string | null },
  now = new Date(),
): DemoEventLine | null {
  if (!body || typeof body !== "object") return null
  const { visit, type, detail, referrer } = body as Record<string, unknown>
  if (typeof visit !== "string" || !VISIT_ID.test(visit)) return null
  if (typeof type !== "string" || !(DEMO_EVENT_TYPES as readonly string[]).includes(type)) return null
  if (detail !== undefined && (typeof detail !== "string" || detail.length > MAX_DETAIL || /[\u0000-\u001f]/.test(detail))) return null
  const line: DemoEventLine = { t: now.toISOString(), visit, type: type as DemoEventType }
  if (detail) line.detail = detail
  if (type === "visit") {
    line.place = lookUpPlace(request.address)
    line.from = referrerHost(referrer, request.ownHost)
    Object.assign(line, browserOf(request.userAgent))
  }
  return line
}

// Enough for a busy visitor, not for a script: per visit and per minute, and
// new visits per address and hour. Kept in memory only.
const PER_VISIT_MINUTE = 120
const VISITS_PER_ADDRESS_HOUR = 60
const perVisit = new Map<string, { minute: number; count: number }>()
const perAddress = new Map<string, { hour: number; visits: Set<string> }>()

/** Whether this event may be written, counting it if so. */
export function withinLimits(visit: string, address: string | null, now = Date.now()): boolean {
  const minute = Math.floor(now / 60_000)
  const v = perVisit.get(visit)
  if (v && v.minute === minute && v.count >= PER_VISIT_MINUTE) return false
  if (address) {
    const hour = Math.floor(now / 3_600_000)
    let a = perAddress.get(address)
    if (!a || a.hour !== hour) perAddress.set(address, (a = { hour, visits: new Set() }))
    if (!a.visits.has(visit)) {
      if (a.visits.size >= VISITS_PER_ADDRESS_HOUR) return false
      a.visits.add(visit)
    }
  }
  perVisit.set(visit, v && v.minute === minute ? { minute, count: v.count + 1 } : { minute, count: 1 })
  if (perVisit.size > 50_000) perVisit.clear()
  if (perAddress.size > 50_000) perAddress.clear()
  return true
}

let prunedOn = ""

/** Appends the line to the day's file; once a day, files past 30 days go. */
export async function writeEvent(line: DemoEventLine, dir = demoEventsDir()): Promise<void> {
  const day = line.t.slice(0, 10)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.appendFile(path.join(dir, `${day}.jsonl`), JSON.stringify(line) + "\n")
  if (prunedOn !== day) {
    prunedOn = day
    await pruneEvents(dir, new Date(line.t))
  }
}

/** Deletes the day files older than 30 days. */
export async function pruneEvents(dir: string, now: Date): Promise<void> {
  const oldest = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
  for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
    if (m && m[1] < oldest) await fs.promises.rm(path.join(dir, name), { force: true })
  }
}
