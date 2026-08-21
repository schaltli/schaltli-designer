import { readdir, rm } from "node:fs/promises"
import { join } from "node:path"

// Removes every DDF the suite seeded into .data/ddf, once, after the whole
// run.
//
// It has to be here rather than in each spec's afterAll: with
// fullyParallel, the tests of one file are spread across workers, and
// Playwright runs afterAll once *per worker* - so the worker that finishes
// first deletes a fixture another worker is still using. That is not
// theoretical, it turned into a 30s "gate never offered the device" timeout
// that only appeared under full parallel load (2026-08-21).
//
// Why clean up at all: .data/ddf is the same directory a developer's own
// instance reads, /api/ddf/list re-parses every zip in it on every request,
// and the Startup Gate offers each one as a device to build a project on.
// A leaked fixture is a device in a human's picker that no hardware will
// ever announce - and a project built on it can never be deployed.
export default async function globalTeardown() {
  const dir = join(__dirname, "..", ".data", "ddf")
  const files = await readdir(dir).catch(() => [] as string[])
  // Real devices are named after themselves (waveshare-knob-1v8,
  // m5stack-m5dial-v1-1, mqtt-epaper-display-2); every fixture this suite
  // creates is prefixed, which is what makes a prefix sweep safe.
  const fixtures = files.filter((file) => file.startsWith("e2e-") && file.endsWith(".zip"))
  await Promise.all(fixtures.map((file) => rm(join(dir, file), { force: true })))
  if (fixtures.length > 0) {
    console.log(`[global-teardown] removed ${fixtures.length} seeded DDF fixture(s) from .data/ddf`)
  }
}
