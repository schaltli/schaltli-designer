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
export default async function globalSetup() {
  const dir = join(__dirname, "..", ".data", "projects")
  await mkdir(dir, { recursive: true })
  const before = await readdir(dir).catch(() => [] as string[])
  await writeFile(projectsSnapshotPath(), JSON.stringify(before), "utf8")
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
