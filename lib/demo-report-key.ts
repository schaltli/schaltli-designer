import { timingSafeEqual } from "crypto"

// The key in the address of the demo's stats page (app/stats/[key],
// docs/2026-10-10-demo-tracking.md): a long random word in the server's
// environment (DEMO_REPORT_KEY, made once by deploy/demo/setup.sh), so the
// page is found only by who was given the link. Outside production the
// tests' fixed key works too, as the demo header does (lib/demo-mode.ts).

/** The key the e2e suite uses against the dev server. Never in production. */
export const DEV_REPORT_KEY = "e2e-report-key-not-for-production"

const MIN_LENGTH = 24

function expectedKey(): string {
  const key = process.env.DEMO_REPORT_KEY?.trim() ?? ""
  if (key.length >= MIN_LENGTH) return key
  return process.env.NODE_ENV === "production" ? "" : DEV_REPORT_KEY
}

/** Whether `key` opens the stats page; never without a key long enough. */
export function demoReportKeyMatches(key: string): boolean {
  const expected = expectedKey()
  if (!expected) return false
  const a = Buffer.from(key)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
