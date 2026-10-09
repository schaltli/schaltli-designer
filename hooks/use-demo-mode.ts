"use client"

import { useEffect, useState } from "react"

// Whether this designer is demo.schaltli.com's demo (lib/demo-mode.ts,
// docs/2026-10-09-demo-instance.md, decision 3), and the project it opens.
// The server decides per request and says so in /api/version; the client
// asks once per page load rather than reading a build-time flag, so one
// build serves both and the tests can switch it with a header.

/** The handbook's install page, where the demo's notice points. */
export const DEMO_INSTALL_URL = "https://schaltli.com/installieren/pekaway.html"

/** The demo, when this is it: the project it opens at once. */
export interface DemoMode {
  start: string
}

let asked: Promise<DemoMode | false> | null = null

function askServer(): Promise<DemoMode | false> {
  if (!asked) {
    asked = fetch("/api/version", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((body: { demo?: { start?: string } }) =>
        body.demo && typeof body.demo.start === "string" ? { start: body.demo.start } : false,
      )
      .catch(() => false as const)
  }
  return asked
}

/** The demo (truthy), not the demo (false), or null until the server has said. */
export function useDemoMode(): DemoMode | false | null {
  const [demo, setDemo] = useState<DemoMode | false | null>(null)
  useEffect(() => {
    let current = true
    void askServer().then((answer) => {
      if (current) setDemo(answer)
    })
    return () => {
      current = false
    }
  }, [])
  return demo
}
