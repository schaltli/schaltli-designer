import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import { execFileSync } from "child_process"

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

test("without --ref it installs the newest official release, not main and not a pre-release", () => {
  // Until 2026-10-08 it installed main: whatever had just been committed went
  // to every installation, with the firmware of the last release beside it.
  // The choice is the script's own pipeline, run in a throwaway repository
  // whose tags mimic the real ones.
  const pick = /TARGET="\$\((git tag -l 'fw-\*'[^)]*)\)"/.exec(script)?.[1]
  expect(pick, "the script no longer picks a release tag").toBeTruthy()
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pekaway-install-tags-"))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" })
  try {
    git("init", "-q")
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x")
    for (const tag of [
      "fw-2026.09.28.8",
      "fw-2026.10.04.2",
      "fw-2026.10.04.10",
      "fw-2026.10.06.2-pre.popups",
      "fw-2026.10.09.1-dryrun",
    ]) {
      git("tag", tag)
    }
    // Numbers compare as numbers: .10 is after .2. A pre-release and a dry
    // run, newer or not, are never the default.
    expect(execFileSync("bash", ["-c", pick!], { cwd: repo, encoding: "utf8" }).trim()).toBe("fw-2026.10.04.10")
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
  expect(script).toMatch(/\[ -n "\$TARGET" \] \|\| TARGET="main"/)
})

test("run as curl | bash, the whole script is read before anything runs", () => {
  // On 2026-10-09 a command in the install read stdin - which, under
  // `curl … | bash`, is the rest of the script - and ate the closing lines:
  // "Schaltli Designer: http://192.168.8.107:9001". Everything runs inside
  // main(), called on the last line, so bash has the whole text first.
  const lines = script.trimEnd().split("\n")
  expect(lines[lines.length - 1]).toBe('main "$@"')
  const opens = lines.indexOf("main() {")
  expect(opens, "no main() wrapping the body").toBeGreaterThan(0)
  // Before it only the shebang, comments, blank lines and the shell options.
  for (const line of lines.slice(0, opens)) {
    expect(line.trim() === "" || line.startsWith("#") || line === "set -euo pipefail", line).toBe(true)
  }
  // And it closes just before the call.
  expect(lines.slice(opens).filter((l) => l === "}").length).toBeGreaterThanOrEqual(1)
  expect(lines[lines.length - 3]).toBe("}")
  // And the text bash reads from the pipe parses as a whole.
  expect(execFileSync("bash", ["-n"], { input: script, encoding: "utf8" })).toBe("")
  // What the wrapping buys, shown on a script of the same shape: a command
  // that reads stdin first, a line after it. Without main() the cat eats
  // the echo; with it the echo runs.
  const shaped = (wrapped: boolean) =>
    wrapped ? ["main() {", "cat >/dev/null", "echo after", "}", 'main "$@"', ""].join("\n") : ["cat >/dev/null", "echo after", ""].join("\n")
  expect(execFileSync("bash", [], { input: shaped(false), encoding: "utf8" }).trim()).toBe("")
  expect(execFileSync("bash", [], { input: shaped(true), encoding: "utf8" }).trim()).toBe("after")
})

test("the Pi builds without the type check, and leaves nothing behind", () => {
  // Tester Arno's install sat at "Checking validity of types" for 45 minutes
  // (2026-10-09): the check is where a Pi with Node-RED runs out of memory.
  // The types are checked before a release exists; on the Pi a
  // next.config.js beside the tag's next.config.mjs turns it off for the
  // build and is gone after it.
  const build = script.indexOf("npm run build")
  const wrapper = script.lastIndexOf("cat > next.config.js", build)
  expect(wrapper, "no next.config.js before the build").toBeGreaterThan(0)
  expect(script.slice(wrapper, build)).toContain("ignoreBuildErrors: true")
  expect(script.slice(wrapper, build)).toContain('import("./next.config.mjs")')
  // Taken away right after the build by end_build, and by the same function
  // on exit when the build fails and set -e ends the script.
  expect(script.slice(build)).toMatch(/^npm run build\nend_build\ntrap - EXIT\n/)
  const endBuild = /end_build\(\) \{\n([\s\S]*?)\n\}/.exec(script)?.[1] ?? ""
  expect(endBuild).toContain('rm -f "$INSTALL_DIR/next.config.js"')
  expect(script.indexOf("\ntrap end_build EXIT\n")).toBeGreaterThan(0)
  expect(script.indexOf("\ntrap end_build EXIT\n")).toBeLessThan(script.indexOf("\nnpm ci\n"))
})

test("npm ci and the build get a compressed swap in RAM, on its own zram device, gone after them", () => {
  // Tester Arno's 2 GB Pi had some 770 MB free for the build and no swap
  // (2026-10-09). Every install now adds a zram swap for npm ci and the build
  // - never /dev/zram0, which Pekaway's image uses for /var/log - and takes
  // it away after. Run here with stand-ins for sudo and the zram tools, so
  // what the script would do to a Pi is a log, not a Pi.
  const block = /# BUILD-SWAP-BEGIN\n([\s\S]*?)# BUILD-SWAP-END/.exec(script)?.[1]
  expect(block, "the build-swap functions are not marked").toBeTruthy()
  const at = (line: string) => script.indexOf(`\n${line}\n`)
  expect(at("start_build_swap")).toBeGreaterThan(0)
  expect(at("start_build_swap")).toBeLessThan(at("npm ci"))
  const endBuild = /end_build\(\) \{\n([\s\S]*?)\n\}/.exec(script)?.[1] ?? ""
  expect(endBuild).toContain("stop_build_swap")

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pekaway-install-swap-"))
  try {
    // The stand-ins write what they were asked to a file: the script sends
    // mkswap's output to /dev/null, as it should.
    const run = (stubs: string) => {
      fs.writeFileSync(path.join(dir, "calls"), "")
      const out = execFileSync("bash", ["-c", `set -euo pipefail
log() { echo "LOG $*"; }
${stubs}
${block}
start_build_swap
echo "SWAP=$BUILD_SWAP"
stop_build_swap
echo "AFTER=$BUILD_SWAP"`], { encoding: "utf8", cwd: dir })
      return out + fs.readFileSync(path.join(dir, "calls"), "utf8")
    }

    // A Pi with zram: a free device found, made a swap, and reset after.
    const withZram = run(`sudo() { if [ "$1" = "-n" ]; then return 0; fi; "$@"; }
modprobe() { echo "CALL modprobe $*" >> calls; }
zramctl() { echo "CALL zramctl $*" >> calls; if [ "$1" = "--find" ]; then echo /dev/zram1; fi; }
mkswap() { echo "CALL mkswap $*" >> calls; }
swapon() { echo "CALL swapon $*" >> calls; }
swapoff() { echo "CALL swapoff $*" >> calls; }`)
    expect(withZram).toContain("CALL mkswap /dev/zram1")
    expect(withZram).toContain("CALL swapon --priority 100 /dev/zram1")
    expect(withZram).toContain("SWAP=/dev/zram1")
    expect(withZram).toContain("CALL swapoff /dev/zram1")
    expect(withZram).toContain("AFTER=")
    expect(withZram).not.toContain("zram0")

    // No zram tools: the build runs as before, nothing set up, nothing reset.
    const without = run(`sudo() { if [ "$1" = "-n" ]; then return 1; fi; "$@"; }
swapoff() { echo "CALL swapoff $*" >> calls; }`)
    expect(without).toContain("LOG No zram tools - building without extra swap.")
    expect(without).toContain("SWAP=")
    expect(without).not.toContain("CALL swapoff")

    // A device found but swapon refused: given back, and the build goes on.
    const refused = run(`sudo() { if [ "$1" = "-n" ]; then return 0; fi; "$@"; }
modprobe() { :; }
zramctl() { echo "CALL zramctl $*" >> calls; if [ "$1" = "--find" ]; then echo /dev/zram1; fi; }
mkswap() { :; }
swapon() { return 1; }
swapoff() { echo "CALL swapoff $*" >> calls; }`)
    expect(refused).toContain("LOG Could not use /dev/zram1 as swap - building without it.")
    expect(refused).toContain("CALL zramctl --reset /dev/zram1")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("an update stops the running designer before it builds, and starts its socket after", () => {
  // On an update the designer from before was still running beside npm ci
  // and next build, some 180 MB the build needed (tester Arno, 2026-10-09).
  const at = (line: string) => script.indexOf(`\n${line}\n`)
  const stop = at('sudo systemctl stop "${SERVICE_NAME}.socket" "${SERVICE_NAME}-proxy.service" "${SERVICE_NAME}.service" 2>/dev/null || true')
  expect(stop, "the designer is not stopped before the build").toBeGreaterThan(0)
  expect(stop).toBeLessThan(at("npm ci"))
  expect(stop).toBeLessThan(at("npm run build"))
  // And the socket listens again afterwards, so the next visit starts the new build.
  expect(at('sudo systemctl restart "${SERVICE_NAME}.socket"')).toBeGreaterThan(at("npm run build"))
})
