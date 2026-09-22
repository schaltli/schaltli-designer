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
  // Writes down which projects already existed, so the teardown can remove
  // the ones this run creates and nothing else. See e2e/global-setup.ts for
  // why a snapshot rather than a prefix or an age.
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  // How many browsers run at once. Playwright's own default is half the cores,
  // which on this machine is two - and two Chromes beside a dev server, an
  // editor and three board builds ran it out of memory on 2026-09-20, which
  // killed a full run at test 227. PW_WORKERS=1 is the way to hand a loaded
  // machine a slower but survivable run.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,
  // 60s per test rather than Playwright's default 30s. Not a concession to
  // slow tests - the assertions here settle in seconds, and a failing one
  // still fails at once, since a wrong value does not wait out the clock.
  // It is a concession to what the suite runs against: `next dev` below,
  // which compiles a route the first time any test asks for it, on a
  // machine also running two browsers and a broker.
  //
  // Measured 2026-09-12 on a four-core box: the full suite failed six of
  // 203, always on a wait, never on a value, and every one of those specs
  // passed alone and passed again when the six were run together. The tests
  // were not racing each other; they were racing a busy machine, and 30s
  // was the line they crossed.
  timeout: 60_000,
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
