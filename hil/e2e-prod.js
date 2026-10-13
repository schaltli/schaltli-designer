#!/usr/bin/env node
// The e2e suite against a production build of the designer, not `next dev`.
//
// Measured 2026-10-13: the suite (1529 tests) took 45.7 min against the dev
// server with four browsers - `next dev` compiles a route the first time a
// test asks for it and serves on one thread, so more browsers only queue
// there (playwright.config.ts). A production build has every route compiled
// before the first test and serves many at once.
//
// It builds into .next-e2e (next.config.mjs reads NEXT_DIST_DIR), beside the
// dev server's .next, and serves it on port 3100 with SCHALTLI_E2E=1, which
// lets the tests' demo header and stats key work as they do against the dev
// server (lib/demo-mode.ts, lib/demo-report-key.ts). The dev server on 3000
// is left alone. Every run builds again: it tests the working tree as it is.
//
//   node hil/e2e-prod.js [playwright args...]
//
// PW_WORKERS sets the browsers (default 10), E2E_PROD_PORT the port (3100).
// Exit code: Playwright's, or 1 when the build or the server fails.

const { spawn, spawnSync } = require("child_process")
const path = require("path")

const ROOT = path.join(__dirname, "..")
const PORT = Number(process.env.E2E_PROD_PORT) || 3100
const WORKERS = process.env.PW_WORKERS || "10"
const DIST = ".next-e2e"

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...env } })
    child.on("close", (code) => resolve(code))
    child.on("error", () => resolve(1))
  })
}

// The whole tree: `npx` and `next start` are a shell, a node and its server.
// Synchronously, since it runs on the way out: a taskkill merely started there
// never ran, and the next run's build swapped the files under that server.
function stop(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  else child.kill("SIGTERM")
}

async function portTaken() {
  try {
    await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

async function serverUp(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/version`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  const started = Date.now()
  const seconds = () => Math.round((Date.now() - started) / 1000)

  // A server left from an earlier run would be tested instead of this build,
  // and its files rebuilt under it.
  if (await portTaken()) {
    console.error(`[e2e-prod] port ${PORT} is taken - a server from an earlier run? Stop it first.`)
    process.exit(1)
  }

  console.log(`[e2e-prod] building into ${DIST}...`)
  const built = await run("npx", ["next", "build"], { NEXT_DIST_DIR: DIST })
  if (built !== 0) {
    console.error(`[e2e-prod] the build failed (exit ${built})`)
    process.exit(1)
  }
  console.log(`[e2e-prod] built in ${seconds()} s`)

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    shell: true,
    env: { ...process.env, NEXT_DIST_DIR: DIST, SCHALTLI_E2E: "1" },
  })
  const cleanUp = () => stop(server)
  process.on("exit", cleanUp)
  process.on("SIGINT", () => process.exit(130))

  if (!(await serverUp(60000))) {
    console.error(`[e2e-prod] the production server did not answer on port ${PORT} within 60 s`)
    process.exit(1)
  }

  const testsFrom = Date.now()
  const code = await run("npx", ["playwright", "test", ...process.argv.slice(2)], {
    E2E_PORT: String(PORT),
    // Lets a test that needs `next dev` (a file added to public/) skip itself.
    E2E_PROD: "1",
    PW_WORKERS: WORKERS,
  })
  console.log(`[e2e-prod] tests ${Math.round((Date.now() - testsFrom) / 1000)} s, all ${seconds()} s, ${WORKERS} browsers`)
  cleanUp()
  process.exit(code)
}

main()
