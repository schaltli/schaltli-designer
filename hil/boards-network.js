#!/usr/bin/env node
// Moves every board between the home network and the camper's, broker and
// WiFi both, so a design can be tried by hand on the camper's real broker and
// the boards brought back for the HIL suites afterwards.
//
//   node hil/boards-network.js camper      # all boards onto the camper's WiFi and broker
//   node hil/boards-network.js home        # and back
//   node hil/boards-network.js camper --only knob,epaper
//   node hil/boards-network.js home --dry-run
//
// The passwords live in the designer's .env.local, which git ignores - this
// repository is public:
//
//   SCHALTLI_HOME_WIFI_SSID=datentrampolin       (default)
//   SCHALTLI_HOME_WIFI_PASSWORD=...
//   SCHALTLI_HOME_BROKER=192.168.1.120:1883      (default: this PC's 192.168. address)
//   SCHALTLI_CAMPER_WIFI_SSID=GL-X3000-378       (default)
//   SCHALTLI_CAMPER_WIFI_PASSWORD=...
//   SCHALTLI_CAMPER_BROKER=192.168.8.107:1883    (default)
//   SCHALTLI_<HOME|CAMPER>_BROKER_USER / _BROKER_PASSWORD   (optional)
//
// How it finds the boards: every board leaves a retained hello on the broker
// it talks to, and the hello's url carries its address. Both brokers are
// asked - the camper's over Tailscale - and a board counts only if it answers
// at that address, since a board that moved leaves its old hello behind.
//
// How it moves one: it asks the board which networks it can hear (GET
// /api/scan) and leaves it where it is if the target is not among them - a
// board sent to a network it cannot reach is stranded in its setup portal.
// Then POST /api/mqtt with the target broker, and POST /api/wifi, which
// stores the network and reboots onto it. Both need the firmware from
// 2026-09-27 on (schaltli-firmware's TestInterfaceServer, schaltli-eink's
// UnifiedConfigurator); older firmware answers 404 and is left alone.
//
// An Android phone on the USB cable (--only android) moves half by itself:
// Android 10 lets adb change no WiFi, so the script sets the broker (the app's
// BrokerConfigReceiver, which only adb may call) and, when the phone is on the
// other network, says which one to switch it to by hand and waits for it.
//
// How it knows one arrived: before anything moves it subscribes on the
// target broker, and a board has arrived when its status "online" or hello
// comes in live there - not the retained copy every subscriber gets, which
// may be from last week.

const fs = require("fs")
const path = require("path")
const os = require("os")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")

const REPO_ROOT = path.join(__dirname, "..")
const ARRIVAL_TIMEOUT_MS = 120_000
// Long enough to pick up the phone and switch its WiFi by hand.
const MANUAL_ARRIVAL_TIMEOUT_MS = 300_000
const ADB = process.env.ANDROID_ADB_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe")

// The boards this knows, by the prefix of the client id they say hello under.
const BOARDS = [
  { name: "knob", prefix: "waveshare-knob-1v8-" },
  { name: "4v3b", prefix: "waveshare-touch-lcd-4v3b-" },
  { name: "papers3", prefix: "m5stack-papers3-" },
  { name: "epaper", prefix: "EPaper-" },
]

function loadEnvLocal() {
  const file = path.join(REPO_ROOT, ".env.local")
  const env = {}
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2")
  }
  return env
}

function lanAddress() {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal && iface.address.startsWith("192.168.1.")) return iface.address
  }
  return "192.168.1.120"
}

function network(env, which) {
  const key = which.toUpperCase()
  const get = (name, fallback) => process.env[`SCHALTLI_${key}_${name}`] ?? env[`SCHALTLI_${key}_${name}`] ?? fallback
  const [host, port] = get("BROKER", which === "home" ? `${lanAddress()}:1883` : "192.168.8.107:1883").split(":")
  return {
    which,
    ssid: get("WIFI_SSID", which === "home" ? "datentrampolin" : "GL-X3000-378"),
    password: get("WIFI_PASSWORD", undefined),
    broker: { host, port: Number(port || 1883), username: get("BROKER_USER", ""), password: get("BROKER_PASSWORD", "") },
  }
}

function brokerUrl(net) {
  // The home broker is this PC's own; asking it by its LAN address works too,
  // but localhost keeps the script working while the LAN address changes.
  const host = net.which === "home" && net.broker.host === lanAddress() ? "localhost" : net.broker.host
  return `mqtt://${host}:${net.broker.port}`
}

function connect(net) {
  return new Promise((resolve) => {
    const client = mqtt.connect(brokerUrl(net), {
      username: net.broker.username || undefined,
      password: net.broker.password || undefined,
      connectTimeout: 5000,
      reconnectPeriod: 0,
    })
    client.once("connect", () => resolve(client))
    client.once("error", () => resolve(null))
    client.once("close", () => resolve(null))
  })
}

// Retained hellos on one broker: client id -> address from the hello's url.
async function hellos(client) {
  const found = new Map()
  client.on("message", (topic, payload) => {
    const clientId = topic.split("/")[1]
    try {
      const url = new URL(JSON.parse(payload.toString()).url)
      found.set(clientId, url.hostname)
    } catch {}
  })
  await client.subscribeAsync("schaltli/+/hello")
  await new Promise((r) => setTimeout(r, 2000))
  return found
}

async function http(method, url, form, timeoutMs = 20_000) {
  const init = { method, signal: AbortSignal.timeout(timeoutMs) }
  if (form) init.body = new URLSearchParams(form)
  const res = await fetch(url, init)
  const text = await res.text()
  return { status: res.status, text }
}

async function answers(ip) {
  return http("GET", `http://${ip}/api/scan`, null, 15_000)
    .then((r) => r.status)
    .catch(() => 0)
}

// The SSIDs a board can hear. The firmware answers {networks:[...]}; the
// e-paper wraps the same JSON as a string in {success, message}.
async function heard(ip) {
  const { status, text } = await http("GET", `http://${ip}/api/scan`, null, 30_000)
  if (status !== 200) throw new Error(`GET /api/scan answered ${status}`)
  let body = JSON.parse(text)
  if (typeof body.message === "string") body = JSON.parse(body.message)
  return new Set((body.networks || []).map((n) => n.ssid))
}

function adb(serial, ...args) {
  return execFileSync(ADB, ["-s", serial, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
}

// The WiFi a phone is on. Filtered on the phone: all of dumpsys wifi runs to
// a megabyte and more, past what execFileSync buffers.
function phoneSsid(serial) {
  const line = adb(serial, "shell", "dumpsys wifi | grep -m1 'mWifiInfo SSID'")
  return (/mWifiInfo SSID: ([^,]*),/.exec(line)?.[1] ?? "").replace(/^"|"$/g, "")
}

function bringToFront(phone) {
  adb(phone.serial, "shell", "am", "start", "-n", "com.schaltli.android/.MainActivity")
  phone.inFront = true
}

// The phones adb can reach, with the WiFi each is on and its address there.
function androidPhones() {
  let out
  try {
    out = execFileSync(ADB, ["devices", "-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return []
  }
  const phones = []
  for (const line of out.split(/\r?\n/).slice(1)) {
    const m = /^(\S+)\s+device\b.*?model:(\S+)/.exec(line)
    if (!m) continue
    const [, serial, model] = m
    const ssid = phoneSsid(serial)
    const ip = /inet (\d+\.\d+\.\d+\.\d+)/.exec(adb(serial, "shell", "ip", "-4", "addr", "show", "wlan0"))?.[1] ?? ""
    phones.push({ name: "android", serial, model, ssid, ip })
  }
  return phones
}

async function main() {
  const args = process.argv.slice(2)
  const target = args[0]
  if (target !== "camper" && target !== "home") {
    console.error("Usage: node hil/boards-network.js camper|home [--only knob,4v3b,papers3,epaper] [--dry-run]")
    process.exit(2)
  }
  const onlyArg = args.find((a) => a.startsWith("--only"))
  const only = onlyArg ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : args[args.indexOf(onlyArg) + 1]).split(",") : null
  const dryRun = args.includes("--dry-run")

  const env = loadEnvLocal()
  const nets = { home: network(env, "home"), camper: network(env, "camper") }
  const to = nets[target]
  if (!to.password && !dryRun) {
    console.error(`SCHALTLI_${target.toUpperCase()}_WIFI_PASSWORD is not set - put it in .env.local (see the top of this file).`)
    process.exit(2)
  }
  console.log(`Target: ${target} - WiFi "${to.ssid}", broker ${to.broker.host}:${to.broker.port}`)

  // Find the boards on both brokers.
  const clients = {}
  for (const which of ["home", "camper"]) {
    clients[which] = await connect(nets[which])
    console.log(`${which} broker ${brokerUrl(nets[which])}: ${clients[which] ? "connected" : "not reachable"}`)
  }
  if (!clients[target]) {
    console.error(`The ${target} broker is not reachable from here, so arrivals cannot be confirmed. ` +
      (target === "camper" ? "Is Tailscale up?" : "Is npm run hil:broker running?"))
    process.exit(1)
  }
  const candidates = new Map()
  const allHellos = []
  for (const which of ["home", "camper"]) {
    if (!clients[which]) continue
    for (const [clientId, ip] of await hellos(clients[which])) {
      allHellos.push([clientId, ip])
      const board = BOARDS.find((b) => clientId.startsWith(b.prefix))
      if (!board || (only && !only.includes(board.name))) continue
      if (!candidates.has(clientId)) candidates.set(clientId, { ...board, clientId, ips: new Set() })
      candidates.get(clientId).ips.add(ip)
    }
  }
  const boards = []
  for (const c of candidates.values()) {
    for (const ip of c.ips) {
      if ((await answers(ip)) !== 0) {
        boards.push({ ...c, ip })
        break
      }
    }
    if (!boards.some((b) => b.clientId === c.clientId)) {
      console.log(`${c.name} (${c.clientId}): not answering at ${[...c.ips].join(" or ")} - left alone`)
    }
  }
  const phones = !only || only.includes("android") ? androidPhones() : []
  for (const p of phones) {
    // Its client id is in the hello whose url is this phone's address; a
    // phone that never said hello is still recognised by the prefix.
    p.clientId = allHellos.find(([id, ip]) => id.startsWith("android-") && ip === p.ip)?.[0]
  }
  for (const b of only ?? []) {
    if (b !== "android" && !BOARDS.some((x) => x.name === b)) {
      console.log(`--only ${b}: no such board (${[...BOARDS.map((x) => x.name), "android"].join(", ")})`)
    }
  }
  if (only?.includes("android") && phones.length === 0) console.log("android: no phone on adb - left alone")
  if (boards.length === 0 && phones.length === 0) {
    console.log("No boards found.")
    for (const c of Object.values(clients)) c?.end()
    process.exit(1)
  }

  // Listen for arrivals before anything moves.
  const arrived = new Set()
  // What the target broker already holds, for a phone that is there already:
  // its broker does not change, so the app has no reason to say hello again.
  const retainedOnline = new Set()
  const retainedAt = new Map()
  clients[target].on("message", (topic, payload, packet) => {
    const [, clientId, kind] = topic.split("/")
    if (packet.retain) {
      if (kind === "status" && payload.toString() === "online") retainedOnline.add(clientId)
      if (kind === "hello") try { retainedAt.set(clientId, new URL(JSON.parse(payload.toString()).url).hostname) } catch {}
      return
    }
    if (kind === "hello" || (kind === "status" && payload.toString() === "online")) arrived.add(clientId)
  })
  await clients[target].subscribeAsync(["schaltli/+/status", "schaltli/+/hello"])
  await new Promise((r) => setTimeout(r, 1000))

  const moving = []
  for (const b of boards) {
    const label = `${b.name} (${b.clientId}, ${b.ip})`
    try {
      // One scan misses a faint network now and then - the knob heard the
      // camper in one and not in the next, a minute apart - so up to three.
      const ssids = new Set()
      for (let i = 0; i < 3 && !ssids.has(to.ssid); i++) for (const s of await heard(b.ip)) ssids.add(s)
      if (!ssids.has(to.ssid)) {
        console.log(`${label}: cannot hear "${to.ssid}" (hears ${[...ssids].filter(Boolean).join(", ") || "nothing"}) - left alone`)
        continue
      }
      if (dryRun) {
        console.log(`${label}: hears "${to.ssid}" - would move (dry run)`)
        continue
      }
      const m = await http("POST", `http://${b.ip}/api/mqtt`, {
        protocol: "mqtt://",
        host: to.broker.host,
        port: String(to.broker.port),
        username: to.broker.username,
        password: to.broker.password,
      })
      if (m.status !== 200 || !/"success"\s*:\s*true/.test(m.text)) throw new Error(`POST /api/mqtt: ${m.status} ${m.text}`)
      // The board reboots as soon as the answer is out, so a dropped
      // connection here is the expected end of the request, not a failure.
      const w = await http("POST", `http://${b.ip}/api/wifi`, { ssid: to.ssid, password: to.password }).catch((e) => ({ status: -1, text: e.message }))
      if (w.status === 404) throw new Error("POST /api/wifi: 404 - this board's firmware predates it; flash it first")
      if (w.status > 0 && !/"success"\s*:\s*true/.test(w.text)) throw new Error(`POST /api/wifi: ${w.status} ${w.text}`)
      console.log(`${label}: broker and WiFi set, rebooting onto "${to.ssid}"`)
      moving.push(b)
    } catch (e) {
      console.log(`${label}: ${e.message} - left alone`)
    }
  }

  let manual = false
  for (const p of phones) {
    const label = `android (${p.model}, ${p.serial}, ${p.ssid || "no WiFi"} ${p.ip})`
    if (dryRun) {
      console.log(`${label}: would set the broker${p.ssid === to.ssid ? "" : ` and ask for "${to.ssid}"`} (dry run)`)
      continue
    }
    try {
      const extras = ["--es", "host", to.broker.host, "--ei", "port", String(to.broker.port)]
      if (to.broker.username) extras.push("--es", "username", to.broker.username)
      if (to.broker.password) extras.push("--es", "password", to.broker.password)
      const out = adb(p.serial, "shell", "am", "broadcast", "-n", "com.schaltli.android/.data.BrokerConfigReceiver",
        "-a", "com.schaltli.android.SET_BROKER", ...extras)
      if (!/result=0/.test(out)) throw new Error(`broadcast: ${out.trim()}`)
      if (p.ssid === to.ssid) {
        console.log(`${label}: broker set, already on "${to.ssid}"`)
        bringToFront(p)
        // Online on the target broker at the address it has now: already there.
        if (p.clientId && retainedOnline.has(p.clientId) && retainedAt.get(p.clientId) === p.ip) arrived.add(p.clientId)
      } else {
        console.log(`${label}: broker set.`)
        console.log(`  >>> Switch this phone to the WiFi "${to.ssid}" now - Android 10 lets no computer do it.`)
        manual = true
      }
      moving.push(p)
    } catch (e) {
      console.log(`${label}: ${e.message} - left alone`)
    }
  }

  const hasArrived = (b) => (b.clientId ? arrived.has(b.clientId) : [...arrived].some((id) => id.startsWith("android-")))
  let failed = 0
  if (moving.length > 0) {
    const timeout = manual ? MANUAL_ARRIVAL_TIMEOUT_MS : ARRIVAL_TIMEOUT_MS
    console.log(`Waiting up to ${timeout / 1000} s for ${moving.length} device(s) on the ${target} broker ...`)
    const deadline = Date.now() + timeout
    let tick = 0
    while (Date.now() < deadline && moving.some((b) => !hasArrived(b))) {
      await new Promise((r) => setTimeout(r, 1000))
      // The app reconnects only in front, and switching the WiFi by hand
      // leaves the Settings app there - so once a phone is on the target
      // network, Schaltli is brought back to the front.
      if (++tick % 3 !== 0) continue
      for (const p of moving) {
        if (p.name !== "android" || p.inFront || hasArrived(p)) continue
        const ssid = phoneSsid(p.serial)
        if (ssid === to.ssid) {
          console.log(`  android (${p.serial}) is on "${to.ssid}" - bringing Schaltli to the front`)
          bringToFront(p)
        }
      }
    }
    for (const b of moving) {
      const ok = hasArrived(b)
      if (!ok) failed++
      console.log(`  ${ok ? "arrived" : "NOT SEEN"}  ${b.name} (${b.clientId ?? b.serial})`)
    }
  }
  for (const c of Object.values(clients)) c?.end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
