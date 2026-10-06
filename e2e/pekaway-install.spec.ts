import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

// deploy/pekaway-install.sh cannot be run from here - it wants a Pekaway system,
// sudo and systemd - but the things that went wrong with it can be read off
// the script itself.

const script = fs.readFileSync(path.join(__dirname, "..", "deploy", "pekaway-install.sh"), "utf8")

test("the deploy flag is written before the build that compiles it in", () => {
  // NEXT_PUBLIC_* values are baked in at build time. Written after the build,
  // the flag only reached the second run, and a first install had no Deploy to
  // Device (issue #3).
  const writesFlag = script.indexOf('echo "NEXT_PUBLIC_DEPLOY_ENABLED=true" >')
  const builds = script.indexOf("npm run build")
  expect(writesFlag, "the script no longer writes the flag").toBeGreaterThan(-1)
  expect(builds, "the script no longer builds").toBeGreaterThan(-1)
  expect(writesFlag).toBeLessThan(builds)
})

test("the address it ends with is one a browser can reach", () => {
  // schaltli.peka.way resolves nowhere (issue #4). The last lines are what a
  // person copies into a browser, so they name the system's own address.
  const ending = script.slice(script.lastIndexOf('log "Done."'))
  expect(ending).not.toContain("${DOMAIN}")
  expect(ending).toContain("${APP_PORT}")
})

test("an existing install fetches from the address it would clone from", () => {
  // The repo moved to the schaltli account on 2026-10-06 and the old address
  // leads nowhere, so an install from before then must not keep fetching
  // from its old origin.
  const setsOrigin = script.indexOf('git remote set-url origin "$REPO_URL"')
  const fetches = script.indexOf("git fetch")
  expect(setsOrigin, "the script no longer points origin at REPO_URL").toBeGreaterThan(-1)
  expect(setsOrigin).toBeLessThan(fetches)
  expect(script).toMatch(/^REPO_URL="https:\/\/github\.com\/schaltli\/schaltli-designer\.git"$/m)
})
