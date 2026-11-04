import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import { execFileSync } from "child_process"

// deploy/pekaway-install.sh cannot be run from here - it wants a Pekaway system,
// sudo and systemd - but the things that went wrong with it can be read off
// the script itself.

const script = fs.readFileSync(path.join(__dirname, "..", "deploy", "pekaway-install.sh"), "utf8")

// bash: on the PATH, or on Windows the one Git brings - its cmd folder is on
// the PATH, its bin folder often not, and a test:quick started from
// PowerShell had no bash at all (spawnSync bash ENOENT, 2026-10-28).
const bash = (() => {
  try {
    execFileSync("bash", ["-c", "true"], { stdio: "ignore" })
    return "bash"
  } catch {}
  const git = execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" }).split(/\r?\n/)[0]
  const beside = path.join(path.dirname(path.dirname(git)), "bin", "bash.exe")
  if (!fs.existsSync(beside)) throw new Error(`No bash on the PATH, and none beside ${git}`)
  return beside
})()

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
    expect(execFileSync(bash, ["-c", pick!], { cwd: repo, encoding: "utf8" }).trim()).toBe("fw-2026.10.04.10")
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
  }
  expect(script).toMatch(/\[ -n "\$TARGET" \] \|\| TARGET="main"/)
})

test("run as curl | bash, the whole script is read before anything runs", () => {
  // A command in the install that read stdin - which, under `curl … | bash`,
  // is the rest of the script - would eat the lines after it. Everything
  // runs inside main(), called on the last line, so bash has the whole text
  // first.
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
  expect(execFileSync(bash, ["-n"], { input: script, encoding: "utf8" })).toBe("")
  // What the wrapping buys, shown on a script of the same shape: a command
  // that reads stdin first, a line after it. Without main() the cat eats
  // the echo; with it the echo runs.
  const shaped = (wrapped: boolean) =>
    wrapped ? ["main() {", "cat >/dev/null", "echo after", "}", 'main "$@"', ""].join("\n") : ["cat >/dev/null", "echo after", ""].join("\n")
  expect(execFileSync(bash, [], { input: shaped(false), encoding: "utf8" }).trim()).toBe("")
  expect(execFileSync(bash, [], { input: shaped(true), encoding: "utf8" }).trim()).toBe("after")
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
  // on exit (on_exit, while BUILDING is set) when the build fails and set -e
  // ends the script.
  expect(script.slice(build)).toMatch(/^npm run build\nend_build\nBUILDING=""\n/)
  const endBuild = /end_build\(\) \{\n([\s\S]*?)\n\}/.exec(script)?.[1] ?? ""
  expect(endBuild).toContain('rm -f "$INSTALL_DIR/next.config.js"')
  const onExit = /on_exit\(\) \{\n([\s\S]*?)\n\}/.exec(script)?.[1] ?? ""
  expect(onExit).toContain('[ -z "$BUILDING" ] || end_build')
  expect(script.indexOf("\ntrap on_exit EXIT\n")).toBeGreaterThan(0)
  expect(script.indexOf("\nBUILDING=1\n")).toBeLessThan(script.indexOf("\nnpm ci\n"))
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
      const out = execFileSync(bash, ["-c", `set -euo pipefail
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

test("the closing lines name the designer's and the broker's address, each on its own line", () => {
  // Until 2026-10-09 they came out as one: "Schaltli Designer:
  // http://192.168.8.107:9001". The fallback "<this system's IP>" had an
  // apostrophe, which bash takes as a quote inside "${…:-…}". Run here as the
  // script runs them, with an address and without.
  const NL = String.fromCharCode(10)
  const end = script.slice(script.lastIndexOf(NL + 'LAN_IP="$(hostname -I'), script.lastIndexOf(NL + "}" + NL))
  const run = (hostname: string) =>
    execFileSync(bash, ["-c", `log() { echo "[pekaway-install] $*"; }
hostname() { echo "${hostname}"; }
APP_PORT=3000
MQTT_WS_PORT=9001
SERVICE_NAME=schaltli-designer
SERVICE_USER=pi
${end}`], { encoding: "utf8" }).trim().split(NL)
  expect(run("192.168.8.107 fd00::1")).toEqual([
    "[pekaway-install] Done.",
    "[pekaway-install] Schaltli Designer: http://192.168.8.107:3000/",
    "[pekaway-install] MQTT WebSocket broker: ws://192.168.8.107:9001",
    "[pekaway-install] Chart recorder: systemctl status schaltli-designer-recorder - its history in /home/pi/.schaltli/history.json",
  ])
  expect(run("")).toEqual([
    "[pekaway-install] Done.",
    "[pekaway-install] Schaltli Designer: http://<IP of this Pi>:3000/",
    "[pekaway-install] MQTT WebSocket broker: ws://<IP of this Pi>:9001",
    "[pekaway-install] Chart recorder: systemctl status schaltli-designer-recorder - its history in /home/pi/.schaltli/history.json",
  ])
})

test("a Node.js too old for Next.js is refused before anything is touched", () => {
  // Next.js 16 needs Node.js 20.9 (#61). The check is the script's own
  // expression, run against versions on either side of the line, and it
  // comes before the script stops or replaces the installed designer.
  const check = /node -e '([^']+)'/.exec(script)?.[1]
  expect(check, "the script no longer checks the Node.js version").toBeTruthy()
  const passes = (version: string) => {
    try {
      execFileSync(process.execPath, ["-e", check!.replace("process.versions.node", JSON.stringify(version))])
      return true
    } catch {
      return false
    }
  }
  expect(["18.19.1", "20.8.1"].filter(passes)).toEqual([])
  expect(["20.9.0", "20.18.3", "22.23.2", "24.1.0"].every(passes)).toBe(true)
  expect(script.indexOf("node -e '")).toBeLessThan(script.indexOf("git clone"))
  expect(script.indexOf("node -e '")).toBeLessThan(script.indexOf("systemctl stop"))
  const engines = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).engines
  expect(engines?.node, "package.json names a different minimum").toBe(">=20.9.0")
})

test("the chart recorder is always on, restarted when it ends, and started after the build", () => {
  // docs/2026-10-16-charts.md decision 3: it records day and night, so it is
  // not socket-activated as the designer is (tasks/charts-recorder-plan.md
  // decision 10).
  const unit = script.slice(script.indexOf('"/etc/systemd/system/${SERVICE_NAME}-recorder.service"'))
  expect(unit.length, "the script installs no recorder unit").toBeLessThan(script.length)
  const body = unit.slice(0, unit.indexOf(String.fromCharCode(10) + "EOF" + String.fromCharCode(10)))
  expect(body).toContain("${INSTALL_DIR}/recorder/index.js --broker mqtt://localhost:1883")
  expect(body).toContain("Restart=always")
  expect(body).toContain("MemoryMax=")
  expect(body).not.toContain("StopWhenUnneeded")
  // Enabled, so it starts again after the Pi restarts: without [Install]
  // systemctl enable did nothing, and the unit stayed «static» (2026-10-29,
  // the first install in the van).
  expect(body).toContain("WantedBy=multi-user.target")
  expect(script).toContain('sudo systemctl enable "${SERVICE_NAME}-recorder.service"')
  expect(script.indexOf('sudo systemctl restart "${SERVICE_NAME}-recorder.service"')).toBeGreaterThan(script.indexOf("npm run build"))
})

// While the designer is stopped for npm ci and the build - ten minutes and
// more over a van's link - port 3000 refused every connection, and nothing
// said why (the user, 2026-11-04). Now the install writes its own log and a
// page on the port shows it (tasks/install-status-plan.md).
test.describe("the progress page while the designer installs", () => {
  const NL = String.fromCharCode(10)
  const at = (line: string) => script.indexOf(NL + line + NL)

  test("the install writes its own log, begun anew, and says when it failed", () => {
    expect(script).toContain('INSTALL_LOG="/home/${SERVICE_USER}/.schaltli/install.log"')
    expect(at('exec > >(tee -a "$INSTALL_LOG") 2>&1')).toBeGreaterThan(0)
    expect(at(': > "$INSTALL_LOG"')).toBeLessThan(at('exec > >(tee -a "$INSTALL_LOG") 2>&1'))
    // Before anything that can fail or stop the designer.
    expect(at('exec > >(tee -a "$INSTALL_LOG") 2>&1')).toBeLessThan(script.indexOf("command -v node >/dev/null"))
    // A failure set -e ends with leaves a line the page knows - run as the
    // script runs it.
    const onExit = /BUILDING=""\non_exit\(\) \{\n[\s\S]*?\n\}\ntrap on_exit EXIT\n/.exec(script)?.[0]
    expect(onExit, "no on_exit trap").toBeTruthy()
    const run = (body: string) =>
      execFileSync(bash, ["-c", `INSTALL_LOG=/x\nend_build() { echo CLEANED; }\n${onExit}\n${body}`], { encoding: "utf8" }).toString()
    const fails = (() => {
      try {
        run("BUILDING=1\nfalse_cmd() { return 3; }\nset -e\nfalse_cmd")
        return ""
      } catch (e: any) {
        return String(e.stdout)
      }
    })()
    expect(fails).toContain("CLEANED")
    expect(fails).toContain("[pekaway-install] FAILED (exit 3)")
    expect(run("true")).not.toContain("FAILED")
  })

  test("the page starts after the designer is stopped and gives the port back before the socket takes it", () => {
    const stopDesigner = at('sudo systemctl stop "${SERVICE_NAME}.socket" "${SERVICE_NAME}-proxy.service" "${SERVICE_NAME}.service" 2>/dev/null || true')
    expect(at("start_status_page")).toBeGreaterThan(stopDesigner)
    expect(at("start_status_page")).toBeLessThan(at("npm ci"))
    expect(at("stop_status_page")).toBeGreaterThan(at("npm run build"))
    expect(at("stop_status_page")).toBeLessThan(at('sudo systemctl restart "${SERVICE_NAME}.socket"'))
    // Its own transient unit, so it outlives the SSH session; on the port the designer answers on.
    const block = /# STATUS-PAGE-BEGIN\n([\s\S]*?)# STATUS-PAGE-END/.exec(script)?.[1] ?? ""
    expect(block).toContain('sudo systemd-run --quiet --collect --unit "$STATUS_UNIT" --uid "$SERVICE_USER"')
    expect(block).toContain('"$STATUS_JS" "$APP_PORT" "$INSTALL_LOG" "$TARGET"')
  })

  test("the page shows the version, the step and the log's end; a device gets 503; a failure stays on it", async () => {
    const js = /cat > "\$STATUS_JS" <<'STATUSJS'\n([\s\S]*?)\nSTATUSJS\n/.exec(script)?.[1]
    expect(js, "no status server in the script").toBeTruthy()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pekaway-install-status-"))
    const server = path.join(dir, "status.js")
    const log = path.join(dir, "install.log")
    fs.writeFileSync(server, js!)
    const port = await new Promise<number>((resolve) => {
      const probe = require("net").createServer().listen(0, () => {
        const p = probe.address().port
        probe.close(() => resolve(p))
      })
    })
    const { spawn } = require("child_process") as typeof import("child_process")
    fs.writeFileSync(log, ["[pekaway-install] Installing fw-2026.11.04.1 (fw-2026.11.04.1)", "[pekaway-install] Installing dependencies (npm ci)...", "\x1b[32madded 812 packages\x1b[0m", "[pekaway-install] Building...", "  Generating static pages (3/7)\r  Generating static pages (7/7) <done>", ""].join(NL))
    const child = spawn(process.execPath, [server, String(port), log, "fw-2026.11.04.1"], { stdio: "ignore" })
    try {
      const get = async (p: string) => {
        for (let i = 0; ; i++) {
          try {
            return await fetch(`http://127.0.0.1:${port}${p}`)
          } catch (e) {
            if (i > 50) throw e
            await new Promise((r) => setTimeout(r, 100))
          }
        }
      }
      const page = await get("/")
      expect(page.status).toBe(503)
      expect(page.headers.get("content-type")).toContain("text/html")
      const html = await page.text()
      expect(html).toContain("Schaltli is being updated")
      expect(html).toContain("fw-2026.11.04.1")
      expect(html).toContain('<p class="step">Building...</p>')
      expect(html).toContain('http-equiv="refresh"')
      expect(html).toContain("added 812 packages")
      expect(html).not.toContain("\x1b")
      // Of a line redrawn with \r only how it ended, escaped.
      expect(html).toContain("Generating static pages (7/7) &lt;done&gt;")
      expect(html).not.toContain("(3/7)")

      const api = await get("/api/projects")
      expect(api.status).toBe(503)
      expect(api.headers.get("retry-after")).toBe("30")
      expect(await api.text()).toContain("being updated")

      fs.appendFileSync(log, "[pekaway-install] FAILED (exit 1) - the designer is not running. The log: /x" + NL)
      const failed = await (await get("/")).text()
      expect(failed).toContain("The update of Schaltli failed")
      expect(failed).toContain("The designer is not running.")
    } finally {
      child.kill()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
