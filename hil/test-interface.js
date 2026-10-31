// Switches the test interface of the bench's boards on or off over USB
// (schaltli-firmware TestInterfaceSwitch.h; docs/device-contract.md §6, #70).
//
// Since 2026-10-14 the test interface is off from the factory and, once on,
// wants a password. A person switches it in the setup portal; the bench's
// boards hang on USB anyway, so this sends the same over the serial port:
//
//   node hil/test-interface.js on  [--port COM5 ...]   hil-on <HIL_PASSWORD>, then a restart
//   node hil/test-interface.js off [--port COM5 ...]   hil-off, then a restart
//   node hil/test-interface.js status [--port ...]     hil?
//   node hil/test-interface.js reset --port COM4         a hard reset, the reset button's
//   node hil/test-interface.js check --device <ip[:port]> 401 without the password
//                                                     and with a wrong one, 200 with it
//
// Without --port: every board of this bench (hil/README.md: 4.3B COM3,
// PaperS3 COM5, the 4" COM10 - in the USB port the knob had until
// 2026-10-30; the knob is reached with --port COM4 where it is plugged in). The password is HIL_PASSWORD (hil/device-auth.js), and
// `on` writes a new one into .env.local when there is none yet.
//
// Through PlatformIO's own Python and its pyserial, with DTR and RTS held
// low while the port opens: on the S3's own USB those lines are a reset.

const { execFileSync } = require("child_process")
const crypto = require("crypto")
const fs = require("fs")
const os = require("os")
const path = require("path")

const BENCH = { COM3: "4.3B", COM5: "PaperS3", COM10: "4\"" }
const ENV_FILE = path.join(__dirname, "..", ".env.local")

function python() {
  const candidates = [
    path.join(os.homedir(), ".platformio", "penv", "Scripts", "python.exe"),
    path.join(os.homedir(), ".platformio", "penv", "bin", "python"),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) throw new Error("PlatformIO's Python was not found (~/.platformio/penv) - it brings pyserial")
  return found
}

function ensurePassword() {
  const { HIL_PASSWORD } = require("./device-auth")
  if (HIL_PASSWORD) return HIL_PASSWORD
  const fresh = crypto.randomBytes(9).toString("base64url")
  const env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : ""
  fs.writeFileSync(ENV_FILE, `${env}${env.endsWith("\n") || env === "" ? "" : "\n"}HIL_PASSWORD=${fresh}\n`)
  console.log(`a new HIL_PASSWORD is in .env.local`)
  return fresh
}

// Sends one line and returns what the board says back within `ms`.
function send(port, line, ms = 4000) {
  const script = `
import serial, sys, time
s = serial.Serial()
s.port = sys.argv[1]
s.baudrate = 115200
s.timeout = 0.2
s.dtr = False
s.rts = False
s.open()
time.sleep(0.3)
s.reset_input_buffer()
s.write((sys.argv[2] + "\\n").encode())
s.flush()
end = time.time() + float(sys.argv[3])
out = b""
while time.time() < end:
    out += s.read(256)
    if b"[hil]" in out and b"\\n" in out.split(b"[hil]", 1)[1]:
        break
s.close()
sys.stdout.write(out.decode("utf-8", "replace"))
`
  return execFileSync(python(), ["-c", script, port, line, String(ms / 1000)], { encoding: "utf8" })
}

// One GET over a bare socket, so nothing adds a header on the way
// (hil/device-auth.js would): the status code, or null when nothing answers.
function rawStatus(host, path, authorization) {
  const net = require("net")
  return new Promise((resolve) => {
    const [name, port] = host.split(":")
    const socket = net.connect({ host: name, port: Number(port) || 80 })
    let data = ""
    // What arrived counts even when the connection ends hard: the PaperS3
    // answers a refused request and resets the socket at once.
    const done = (v) => {
      socket.destroy()
      const m = /^HTTP\/1\.\d (\d{3})/.exec(data)
      resolve(v ?? (m ? Number(m[1]) : null))
    }
    socket.setTimeout(8000, () => done(null))
    socket.on("error", () => done(null))
    socket.on("connect", () => {
      const lines = [`GET ${path} HTTP/1.1`, `Host: ${host}`, ...(authorization ? [`Authorization: ${authorization}`] : []), "Connection: close"]
      socket.write(lines.join("\r\n") + "\r\n\r\n")
    })
    socket.on("data", (d) => {
      data += d.toString("latin1")
      const m = /^HTTP\/1\.\d (\d{3})/.exec(data)
      if (m) done(Number(m[1]))
    })
    socket.on("end", () => done(null))
  })
}

async function check(device) {
  const { HIL_PASSWORD } = require("./device-auth")
  const results = [
    ["no password: refused", await rawStatus(device, "/api/debug", null), 401],
    ["a wrong password: refused", await rawStatus(device, "/api/debug", "Bearer not-the-password"), 401],
    ["a wrong ?pw=: refused", await rawStatus(device, "/api/debug?pw=not-the-password", null), 401],
    ["the password: answered", await rawStatus(device, "/api/debug", `Bearer ${HIL_PASSWORD}`), 200],
  ]
  let failed = 0
  for (const [what, got, want] of results) {
    if (got !== want) failed++
    console.log(`  ${got === want ? "PASS" : "FAIL"} ${what} - ${got ?? "no answer"}`)
  }
  if (results[3][1] === null) process.exit(2)
  console.log(failed ? `FAIL - ${device}'s test interface` : `PASS - ${device}'s test interface wants its password`)
  process.exit(failed ? 1 : 0)
}

function main() {
  const args = process.argv.slice(2)
  const what = args[0]
  if (what === "reset") {
    // Through esptool, as hil/README.md's PaperS3 note does it by hand.
    const i = args.indexOf("--port")
    const port = args[i + 1] || "COM4"
    const esptool = fs.readdirSync(path.join(os.homedir(), ".platformio", "packages"))
      .filter((d) => d.startsWith("tool-esptoolpy"))
      .map((d) => path.join(os.homedir(), ".platformio", "packages", d, "esptool.py"))
      .find((f) => fs.existsSync(f))
    if (!esptool) throw new Error("PlatformIO's esptool was not found")
    execFileSync(python(), [esptool, "--port", port, "--after", "hard_reset", "read_mac"], { stdio: "ignore" })
    console.log(`ok   ${BENCH[port] ?? "board"} on ${port}: reset`)
    process.exit(0)
  }
  if (what === "check") {
    const i = args.indexOf("--device")
    return check(args[i + 1])
  }
  if (!["on", "off", "status"].includes(what)) {
    console.log("usage: node hil/test-interface.js on|off|status [--port COMx ...] | check --device <ip>")
    process.exit(1)
  }
  const ports = []
  for (let i = 1; i < args.length; i++) if (args[i] === "--port") ports.push(args[++i])
  const targets = ports.length ? ports : Object.keys(BENCH)
  const line = what === "on" ? `hil-on ${ensurePassword()}` : what === "off" ? "hil-off" : "hil?"
  let failed = 0
  for (const port of targets) {
    const label = `${BENCH[port] ?? "board"} on ${port}`
    try {
      const answer = send(port, line)
      const said = (answer.match(/\[hil\][^\r\n]*/) || [])[0]
      if (!said) {
        failed++
        console.log(`FAIL ${label}: no answer - is its firmware from fw-2026.10.14.2 or later?`)
      } else {
        console.log(`${said.includes("refused") ? "FAIL" : "ok  "} ${label}: ${said}`)
        if (said.includes("refused")) failed++
      }
    } catch (err) {
      failed++
      console.log(`FAIL ${label}: ${err.message.split("\n")[0]}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

main()
