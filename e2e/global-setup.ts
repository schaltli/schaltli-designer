import { mkdir, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Writes down which projects already existed, so the teardown can remove the
 * ones this run creates and nothing else.
 *
 * Why a snapshot rather than a prefix or a timestamp. Every project the suite
 * makes is stored under a fresh UUID minted in the app
 * (`createDefaultProject` in components/project-editor.tsx), so unlike the DDF
 * fixtures there is no `e2e-` to sweep on - a teardown cannot tell a test's
 * project from a human's. A timestamp would come close, but it is a predicate
 * that *can* be wrong: a clock change, a project saved a second before the run
 * began, a run started while someone was still typing. A list of what was
 * there cannot be wrong about what was there.
 *
 * Why this is needed at all: an autosave three seconds after any change POSTs
 * the whole project - the device's DDF included, as base64, about 300 KB a
 * time - and nothing ever deletes a project directory. By 2026-09-22 that was
 * 5457 directories and 7.5 GB, accumulated since 2026-08-02, of which four
 * were real.
 */
//
// Since 2026-09-24 projects are folders named like the project
// (docs/2026-09-23-explicit-save.md), and a test's project exists only once
// it saves - but the rule stays the same: what was there before the run is
// not ours. The device pointers in .data/by-instance are snapshotted the
// same way, since a deploy test writes one.
export interface DataSnapshot {
  projects: string[]
  byInstance: string[]
}

export default async function globalSetup() {
  const data = join(__dirname, "..", ".data")
  await mkdir(join(data, "projects"), { recursive: true })
  const snapshot: DataSnapshot = {
    projects: await readdir(join(data, "projects")).catch(() => [] as string[]),
    byInstance: await readdir(join(data, "by-instance")).catch(() => [] as string[]),
  }
  await writeFile(projectsSnapshotPath(), JSON.stringify(snapshot), "utf8")
  await warmUpRoutes()
}

/**
 * Has `next dev` compile the project routes once, before any test needs them.
 *
 * It compiles each route on its first request, and under a full parallel run
 * that took up to 30 s - inside whichever test happened to be first. With the
 * explicit-save work (2026-09-24) nine project routes and a second page came
 * in at once, and those first-request compiles landed in the middle of
 * deploy and undo tests as 34 s waits on a response. The web server is up by
 * the time global setup runs (Playwright starts it first), so a plain
 * request to each is enough; what they answer does not matter.
 */
async function warmUpRoutes() {
  const base = "http://localhost:3000"
  const probe = "__e2e_warm_up__"
  const requests: Array<[string, RequestInit?]> = [
    ["/"],
    [`/projects/${probe}`],
    ["/api/projects"],
    [`/api/projects/${probe}`],
    [`/api/projects/${probe}/versions`],
    [`/api/projects/${probe}/versions/2000-01-01T00-00-00.000Z`],
    [`/api/projects/${probe}/rename`, { method: "POST", body: "{}" }],
    [`/api/projects/${probe}/deploys`, { method: "POST", body: "{}" }],
    [`/api/by-instance/${probe}`],
  ]
  for (const [path, init] of requests) {
    await fetch(base + path, { ...init, signal: AbortSignal.timeout(120_000) }).catch(() => {})
  }
}

/**
 * Where the snapshot lives. Beside the projects rather than in the repo: it
 * describes this machine's state, not the code's.
 *
 * Named after the process, because two runs at once are not hypothetical -
 * that is exactly how this broke on the day it was written. A second suite
 * started in the same repo while the first was mid-run; its setup rewrote the
 * one shared snapshot with a listing that already contained the first run's
 * project, and the first run's teardown then read that file, concluded the
 * project had been there all along, and left it. Both setup and teardown run
 * in Playwright's own process, so the pid names the same file for the pair
 * and for nobody else.
 */
export function projectsSnapshotPath(): string {
  return join(__dirname, "..", ".data", `e2e-projects-before-${process.pid}.json`)
}
