import { test, expect } from "@playwright/test"

// What a self-hosted install must not ask the outside world for. The app is
// meant to run on someone's own machine or their own Pi
// (deploy/pekaway-install.sh), often with no internet at all, so a request
// that only a hosting platform can answer is at best noise in the log and at
// worst a hang.
//
// Vercel's analytics script was exactly that: shipped unconditionally in
// app/layout.tsx, it asked every self-hosted page for
// /_vercel/insights/script.js and got a 404 - found on the van's own
// installation, 2026-09-16.

test("a self-hosted page requests nothing from a hosting platform", async ({ page }) => {
  const outside: string[] = []
  page.on("request", (request) => {
    const url = request.url()
    if (url.includes("/_vercel/") || url.includes("vitals.vercel-insights.com")) outside.push(url)
  })

  await page.goto("/")
  await page.waitForTimeout(1500)

  expect(outside, "requests only a hosting platform can answer").toEqual([])
})
