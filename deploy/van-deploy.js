#!/usr/bin/env node
// Builds a pre-release, installs it on the Pekaway in the van and moves every
// device onto the van's network - one command for trying the current state
// by hand where it will run.
//
//   node deploy/van-deploy.js knob_crash --notes notes.md    # the real thing
//   node deploy/van-deploy.js knob_crash --dry-run           # build and check only
//   node deploy/van-deploy.js knob_crash --notes n.md --no-devices
//
// In order:
//
//   1. Preflight: both checkouts clean, gh logged in, the Pekaway answering
//      over SSH (the pekaway skill's pekaway-run.sh, credentials from its
//      store) and the van's broker reachable over Tailscale.
//   2. The designer's typecheck.
//   3. The firmware's tools/release-firmware.js --prerelease <name>: every
//      board built and checked, then - unless --dry-run - published as a
//      GitHub pre-release with its manifest on the designer branch
//      pre/<name>. Public, as every pre-release is, so it needs --notes.
//   4. On the Pekaway, pekaway-install.sh --ref <tag>, taken from the tag
//      itself so it is the script that knows --ref. This builds the designer
//      there, which takes minutes.
//   5. The Pekaway's /api/version, asked on the Pekaway: it has to name the
//      tag as its designer build and as the firmware it ships.
//   6. hil/boards-network.js camper, unless --no-devices.
//
// Afterwards the designer in the van offers the pre-release's firmware under
// Deploy to Device, as after any update. Back to the official version:
// pekaway-install.sh without --ref on the Pekaway; away with the pre-release:
// the firmware's release-firmware.js --drop-prerelease <tag>.

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync, spawn } = require("child_process")

const DESIGNER = path.join(__dirname, "..")
const FIRMWARE = path.join(DESIGNER, "..", "schaltli-firmware")
const RELEASE_REPO = "Matthias-Hess/schaltli-designer"
const PEKAWAY_RUN = path.join(os.homedir(), ".claude", "skills", "pekaway", "scripts", "pekaway-run.sh")

const args = process.argv.slice(2)
const name = args[0]
const dryRun = args.includes("--dry-run")
const noDevices = args.includes("--no-devices")
const notesIndex = args.indexOf("--notes")
const notes = notesIndex !== -1 ? args[notesIndex + 1] : null

function fail(message) {
  console.error(`[van-deploy] ERROR: ${message}`)
  process.exit(1)
}
function step(title) {
  console.log(`\n[van-deploy] === ${title}`)
}
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts })
  if (r.error) fail(`${cmd} could not be started: ${r.error.message}`)
  return r
}
function onPekaway(command, opts = {}) {
  return run("bash", [PEKAWAY_RUN, command], opts)
}
// Runs a command with its output shown as it comes, and hands it back too.
function stream(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { ...opts, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (d) => { out += d; process.stdout.write(d) })
    child.stderr.on("data", (d) => { out += d; process.stderr.write(d) })
    child.on("close", (code) => resolve({ code, out }))
  })
}

async function main() {
  if (!name || !/^[a-z0-9_]+$/.test(name)) {
    fail("usage: node deploy/van-deploy.js <name> --notes <file> [--dry-run] [--no-devices] - name: lower case, digits and _")
  }
  if (!dryRun && !notes) fail("a pre-release is public: say what it is for in --notes <file>")
  if (notes && !fs.existsSync(notes)) fail(`--notes ${notes} does not exist`)

  step("preflight")
  for (const [label, dir] of [["designer", DESIGNER], ["firmware", FIRMWARE]]) {
    if (!fs.existsSync(path.join(dir, ".git"))) fail(`no ${label} checkout at ${dir}`)
    const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: dir }).stdout.trim()
    if (dirty) fail(`the ${label} checkout has uncommitted changes - a pre-release is built from commits:\n${dirty}`)
    console.log(`[van-deploy] ${label}: clean`)
  }
  if (!dryRun) {
    if (run("gh", ["auth", "status"]).status !== 0) fail("gh is not logged in - gh auth login")
    console.log("[van-deploy] gh: logged in")
    if (!fs.existsSync(PEKAWAY_RUN)) fail(`the pekaway skill's pekaway-run.sh is not at ${PEKAWAY_RUN}`)
    const who = onPekaway("hostname")
    if (who.status !== 0) fail(`no SSH to the Pekaway:\n${(who.stderr || who.stdout).trim()}`)
    console.log(`[van-deploy] Pekaway: ${who.stdout.trim()} answers over SSH`)
  }

  step("designer typecheck")
  if (run("npm", ["run", "typecheck"], { cwd: DESIGNER, stdio: "inherit", shell: true }).status !== 0) fail("typecheck failed")

  step(dryRun ? "firmware pre-release (dry run)" : "firmware pre-release")
  const releaseArgs = [path.join(FIRMWARE, "tools", "release-firmware.js"), "--prerelease", name, "--designer", DESIGNER]
  if (!dryRun) releaseArgs.push("--publish", "--notes", path.resolve(notes))
  const release = await stream(process.execPath, releaseArgs, { cwd: FIRMWARE })
  if (release.code !== 0) fail("release-firmware.js failed - see above")
  const tag = /\[release\] (fw-\S+) from /.exec(release.out)?.[1]
  if (!tag) fail("could not tell the tag from release-firmware.js's output")
  if (dryRun) {
    console.log(`\n[van-deploy] dry run done: ${tag} builds and checks out. Nothing was published or installed.`)
    return
  }

  step(`install ${tag} on the Pekaway`)
  const script = `https://raw.githubusercontent.com/${RELEASE_REPO}/${tag}/deploy/pekaway-install.sh`
  const install = await stream("bash", [PEKAWAY_RUN, `curl -fsSL ${script} | bash -s -- --ref ${tag}`])
  if (install.code !== 0) fail(`pekaway-install.sh --ref ${tag} failed on the Pekaway - see above`)

  step("check the Pekaway's version")
  const version = onPekaway("curl -fsS http://localhost:3000/api/version")
  let body
  try {
    body = JSON.parse(version.stdout)
  } catch {
    fail(`the Pekaway's /api/version did not answer with JSON:\n${version.stdout}${version.stderr}`)
  }
  console.log(`[van-deploy] designer ${body.designer?.build}, firmware ${body.firmware?.release}`)
  if (body.designer?.build !== tag) fail(`the Pekaway's designer is ${body.designer?.build}, not ${tag}`)
  if (body.firmware?.release !== tag) fail(`the Pekaway's designer ships firmware ${body.firmware?.release}, not ${tag}`)

  if (!noDevices) {
    step("devices onto the van's network")
    const move = run(process.execPath, [path.join(DESIGNER, "hil", "boards-network.js"), "camper"], { cwd: DESIGNER, stdio: "inherit" })
    if (move.status !== 0) fail("not every device arrived on the van's broker - see above")
  }

  console.log(`\n[van-deploy] ${tag} runs in the van. Its firmware is offered under Deploy to Device.`)
  console.log(`[van-deploy] back to the official version: on the Pekaway, pekaway-install.sh without --ref`)
  console.log(`[van-deploy] remove the pre-release: node ../schaltli-firmware/tools/release-firmware.js --drop-prerelease ${tag}`)
}

main().catch((e) => fail(e.stack || e.message))
