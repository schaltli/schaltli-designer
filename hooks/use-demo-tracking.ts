"use client"

import { useEffect } from "react"

// The demo's count of what visitors do (lib/demo-events.ts,
// docs/2026-10-10-demo-tracking.md), from the page's side. Nothing happens
// outside the demo: trackDemo() does nothing until useDemoTracking() has
// started a visit there. A visit is a random id kept for the tab
// (sessionStorage), so a reload goes on with it; no cookie, nothing that
// outlives the tab.

/** The handbook's word on what the demo counts, where the notices point. */
export const DEMO_COUNTING_URL = "https://schaltli.com/einfuehrung/ausprobieren#demo-zaehlt"

const VISIT_KEY = "schaltli.demoVisit"
const BEAT_MS = 30_000

let visit: string | null = null

function visitId(): string {
  try {
    const kept = sessionStorage.getItem(VISIT_KEY)
    if (kept && /^[a-z0-9]{8,32}$/.test(kept)) return kept
  } catch {}
  const made = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("")
  try {
    sessionStorage.setItem(VISIT_KEY, made)
  } catch {}
  return made
}

function send(body: Record<string, unknown>, beacon = false) {
  const json = JSON.stringify(body)
  if (beacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/demo/event", new Blob([json], { type: "application/json" }))
    return
  }
  void fetch("/api/demo/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {})
}

/** Counts this, in the demo; elsewhere nothing. `detail` is cut to 120 characters. */
export function trackDemo(type: string, detail?: string) {
  if (!visit) return
  send({ visit, type, ...(detail ? { detail: detail.slice(0, 120) } : {}) })
}

/**
 * Starts the visit once the page knows it is the demo: where it came from,
 * whether it shows the phone page, then a beat every 30 s while the tab is
 * shown, and the leaving.
 */
export function useDemoTracking(demo: unknown, phonePage: boolean | null) {
  const on = !!demo && phonePage !== null
  useEffect(() => {
    if (!on || visit) return
    visit = visitId()
    send({ visit, type: "visit", referrer: document.referrer, ...(phonePage ? { detail: "phone page" } : {}) })
    const beat = setInterval(() => {
      if (document.visibilityState === "visible") trackDemo("beat")
    }, BEAT_MS)
    const leave = () => visit && send({ visit, type: "leave" }, true)
    window.addEventListener("pagehide", leave)
    return () => {
      clearInterval(beat)
      window.removeEventListener("pagehide", leave)
      visit = null
    }
    // Once per page: the phone page or not as it was when the visit began.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])
}
