import { readdir, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { projectsSnapshotPath } from "./global-setup"

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
  // mqtt-epaper-display-2); every fixture this suite creates is prefixed,
  // which is what makes a prefix sweep safe.
  const fixtures = files.filter((file) => file.startsWith("e2e-") && file.endsWith(".zip"))
  await Promise.all(fixtures.map((file) => rm(join(dir, file), { force: true })))
  if (fixtures.length > 0) {
    console.log(`[global-teardown] removed ${fixtures.length} seeded DDF fixture(s) from .data/ddf`)
  }

  await removeProjectsThisRunCreated()
}

/**
 * Removes the projects this run brought into being, and only those.
 *
 * Every test that gets past the startup gate mints a fresh UUID and an
 * autosave writes the whole project under it three seconds later, the DDF
 * included as base64. Nothing has ever deleted one: by 2026-09-22 there were
 * 5457 directories and 7.5 GB, since 2026-08-02, and four of them were real.
 *
 * The rule is deliberately the narrowest one that works: a directory goes
 * only if it was absent from the listing global-setup wrote before the run.
 * Not a prefix (there is none - the ids are opaque), not an age (a predicate
 * that can be wrong about a project saved a second before the run started).
 *
 * `by-instance/` is a sibling of the project directories INSIDE this folder,
 * not a project - it is how a real device recovers what it had. It was in the
 * snapshot if it existed, but it is named explicitly as well, because losing
 * it costs somebody their panel.
 */
async function removeProjectsThisRunCreated() {
  const dir = join(__dirname, "..", ".data", "projects")
  const snapshot = await readFile(projectsSnapshotPath(), "utf8").catch(() => null)
  if (snapshot === null) {
    // No snapshot means global-setup did not run, which means we cannot tell
    // this run's projects from anyone else's. Say so and delete nothing.
    console.warn("[global-teardown] no project snapshot from global-setup - leaving .data/projects alone")
    return
  }

  const before = new Set(JSON.parse(snapshot) as string[])
  const now = await readdir(dir).catch(() => [] as string[])
  const created = now.filter((name) => name !== "by-instance" && !before.has(name))

  // A second run in flight makes "appeared during this run" mean two things.
  // Its projects appeared during ours too, and deleting them takes the ground
  // out from under a suite that is still using them - the kind of failure that
  // reads as a mystery timeout and costs a day to trace. So: say what is being
  // left behind and leave it. A few directories too many is the cheap mistake;
  // deleting a neighbour's live data is not.
  const other = await runsInFlight()
  if (other > 0 && created.length > 0) {
    console.warn(
      `[global-teardown] ${other} other test run(s) in flight - left ${created.length} project(s) in .data/projects ` +
        `rather than risk deleting theirs. Remove them by hand, or re-run this suite alone.`,
    )
  } else {
    await Promise.all(created.map((name) => rm(join(dir, name), { recursive: true, force: true })))
    if (created.length > 0) {
      console.log(`[global-teardown] removed ${created.length} project(s) this run created from .data/projects`)
    }
  }

  // Last, and on every path out of here: while this file exists, another run's
  // teardown counts us as still going and leaves its own projects behind.
  await rm(projectsSnapshotPath(), { force: true })
}

/**
 * How many other suites are running right now, counted by their snapshots.
 *
 * Each run writes one named after its process and removes it on the way out,
 * so a snapshot that is not ours is a run that has not finished. A file left
 * behind by a crash would disable the sweep for good, so only a recent one
 * counts as a run: the full suite takes about forty minutes, and four hours is
 * well past any of it. That is a time predicate on our own bookkeeping, not on
 * the user's projects - which is the whole reason the snapshot exists.
 */
async function runsInFlight(): Promise<number> {
  const dataDir = join(__dirname, "..", ".data")
  const mine = projectsSnapshotPath()
  const files = await readdir(dataDir).catch(() => [] as string[])
  const fresh = Date.now() - 4 * 60 * 60 * 1000
  let count = 0
  for (const file of files) {
    if (!file.startsWith("e2e-projects-before-") || !file.endsWith(".json")) continue
    const full = join(dataDir, file)
    if (full === mine) continue
    const info = await stat(full).catch(() => null)
    if (info && info.mtimeMs >= fresh) count++
  }
  return count
}
