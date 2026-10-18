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
//
// hil/test-all.js builds and starts the server itself (startServer below),
// before its lanes, so the HIL scripts render on it too - `next dev` serves
// one request at a time, and four lanes at once had it time out - and then
// runs this with E2E_PROD_EXTERNAL=1: the tests against that server, no
// build of their own.

const { spawn, spawnSync } = require("child_process")
const path = require("path")

const ROOT = path.join(__dirname, "..")
const PORT = Number(process.env.E2E_PROD_PORT) || 3100
const WORKERS = process.env.PW_WORKERS || "10"
const DIST = ".next-e2e"
// A broker of the suite's own (hil/local-broker.js on other ports): its fake
// van and fake devices publish schaltli/state/theme and the like, which on
// the HIL broker every real display hears - beside test:all's device lanes
// the phone turned dark in the middle of its popup check (2026-10-13).
const BROKER_PORT = Number(process.env.E2E_BROKER_PORT) || 1884
const BROKER_WS_PORT = Number(process.env.E2E_BROKER_WS_PORT) || 9002
const SUITE_ENV = {
  HIL_MQTT_URL: `mqtt://localhost:${BROKER_PORT}`,
  HIL_MQTT_WS_URL: `ws://localhost:${BROKER_WS_PORT}`,
  E2E_BROKER_WS_PORT: String(BROKER_WS_PORT),
}

// Quoted again for the shell: `--grep-invert "@alone|@dev"` reaches this
// script already unquoted (test-all's own shell took the quotes), and cmd
// then read the | as a pipe into a command "dev" - e2e ended after 2 s
// (2026-10-14).
const forShell = (arg) => (/[|&<>^\s]/.test(arg) && !/^".*"$/.test(arg) ? `"${arg}"` : arg)

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args.map(forShell), { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...env } })
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

/**
 * Builds into .next-e2e and serves it on PORT. Returns a function that stops
 * it, or throws with what went wrong.
 */
async function startServer() {
  const started = Date.now()
  // A server left from an earlier run would be tested instead of this build,
  // and its files rebuilt under it.
  if (await portTaken()) throw new Error(`port ${PORT} is taken - a server from an earlier run? Stop it first.`)

  const broker = spawn(process.execPath, [path.join(__dirname, "local-broker.js")], {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, HIL_MQTT_PORT: String(BROKER_PORT), HIL_MQTT_WS_PORT: String(BROKER_WS_PORT) },
  })
  process.on("exit", () => stop(broker))

  console.log(`[e2e-prod] building into ${DIST}...`)
  const built = await run("npx", ["next", "build", "--webpack"], { NEXT_DIST_DIR: DIST, NEXT_PUBLIC_BROKER_WS_PORT: String(BROKER_WS_PORT) })
  if (built !== 0) throw new Error(`the build failed (exit ${built})`)
  console.log(`[e2e-prod] built in ${Math.round((Date.now() - started) / 1000)} s`)

  // Idle connections kept a minute: next start closes them after 5 s, and
  // a test reusing one met ECONNRESET under load (2026-10-13).
  const server = spawn("npx", ["next", "start", "-p", String(PORT), "--keepAliveTimeout", "60000"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    shell: true,
    env: { ...process.env, NEXT_DIST_DIR: DIST, SCHALTLI_E2E: "1" },
  })
  const stopServer = () => {
    stop(server)
    stop(broker)
  }
  process.on("exit", stopServer)
  if (!(await serverUp(60000))) {
    stopServer()
    throw new Error(`the production server did not answer on port ${PORT} within 60 s`)
  }
  return stopServer
}

async function main() {
  const started = Date.now()
  const seconds = () => Math.round((Date.now() - started) / 1000)
  process.on("SIGINT", () => process.exit(130))

  let cleanUp = () => {}
  if (process.env.E2E_PROD_EXTERNAL !== "1") {
    try {
      cleanUp = await startServer()
    } catch (err) {
      console.error(`[e2e-prod] ${err.message}`)
      process.exit(1)
    }
  }

  const testsFrom = Date.now()
  const code = await run("npx", ["playwright", "test", ...process.argv.slice(2)], {
    E2E_PORT: String(PORT),
    ...SUITE_ENV,
    // Lets a test that needs `next dev` (a file added to public/) skip itself.
    E2E_PROD: "1",
    PW_WORKERS: WORKERS,
  })
  console.log(`[e2e-prod] tests ${Math.round((Date.now() - testsFrom) / 1000)} s, all ${seconds()} s, ${WORKERS} browsers`)
  cleanUp()
  process.exit(code)
}

if (require.main === module) main()

module.exports = { startServer, PORT }
