import { defineConfig, devices } from "@playwright/test"

// E2E suite for the designer app. Drives the real app in a real browser -
// no component mocking, no simulated DOM - because the bugs this catches
// (selection state drifting on a right-click, copy/paste silently failing
// for nested objects, tab-strip hit-testing) only show up in the actual
// interaction pipeline, not in isolated unit logic.
export default defineConfig({
  testDir: "./e2e",
  // Sweeps the DDF fixtures the suite seeds into .data/ddf. Global rather
  // than per-spec afterAll - see e2e/global-teardown.ts for why that
  // distinction is load-bearing under fullyParallel.
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],
  // Reuses a dev server you already have running (the common case while
  // iterating), otherwise starts one itself - either way the suite is
  // runnable with a single `npm run test:e2e`.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
