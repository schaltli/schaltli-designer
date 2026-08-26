// A mock MQTT host for interaction testing (2026-08-25).
//
// The problem it solves: a Switch on a device only ever changes what it
// shows when its *read* topic changes, and a tap only publishes to its
// *write* topic. In the camper, Node-RED closes that loop. On a desk,
// nothing does - so a tap publishes, nothing answers, and since the marker
// rebuild the bar sits visibly hollow until the 3s timeout rolls it back.
// Every interaction test therefore had to happen in the vehicle.
//
// This closes the loop from the project itself. Every Switch already
// declares both halves - `topic` (read), `writeTopic` (write), and per
// state a `readValue`/`writeValue` pair - so the mapping
//
//     writeTopic + writeValue  ->  topic = readValue
//
// is derivable with no configuration to write and, more importantly, no
// second copy of a fact to drift from the first. Rename a state's value in
// the designer and the mock follows on the next run.
//
// What the project cannot describe on its own is declared instead, on the
// command topic, as `topics[].mock` (2026-08-25). Two cases needed it and a
// third was in sight: a SoftwareButton's `send-mqtt` action says nothing
// anywhere about which state topic it changes, and a rotary encoder
// publishing "up" is not a mapping at all but arithmetic on a value the
// project never names. A rule can therefore both set a literal payload and
// move a number within bounds - the second being what makes a dimmer
// testable on a desk.
//
// Rules win over the derived table where both cover the same payload, so a
// Switch whose real behaviour is unusual can be overridden without editing
// the Switch. Anything a rule does not cover and nothing can derive is
// listed at startup as unanswered rather than quietly ignored.
//
// Run:
//   node hil/simulate-project.js <project.zip> [options]
//
//   --broker <url>   default mqtt://localhost:1883, or $HIL_MQTT_URL
//   --delay <ms>     wait before answering (default 0)
//   --drop <match>   never answer write topics containing <match>
//   --seed           publish every read topic's first mapped value at start
//   --list           print the derived table and exit, connect to nothing
//   --allow-remote   required to point this at a non-local broker
//
// Needs a broker: `npm run hil:broker`.

const fs = require("fs")
const path = require("path")
const JSZip = require("jszip")
const mqtt = require("mqtt")
const { buildMockEngine } = require("../lib/mock-engine")

const DEFAULT_BROKER = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const has = (name) => process.argv.includes(name)

const projectPath = process.argv[2]
const brokerUrl = arg("--broker", DEFAULT_BROKER)
const delayMs = Number(arg("--delay", "0"))
const dropMatch = arg("--drop", null)
const seed = has("--seed")
const listOnly = has("--list")
const allowRemote = has("--allow-remote")

if (!projectPath || projectPath.startsWith("--")) {
  console.error("usage: node hil/simulate-project.js <project.zip> [--broker url] [--delay ms] [--drop match] [--seed] [--list] [--allow-remote]")
  process.exit(1)
}

// Reads either shape of project zip: the editable one (Download Project)
// and the device export both carry project.json with the same topics and
// screens. The editable one nests nothing relevant here, and the device
// export's `_source/project.zip` is deliberately not unwrapped - the outer
// project.json already has everything this needs, and unwrapping would
// silently prefer a possibly older embedded copy.
async function loadProject(zipPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const entry = zip.file("project.json") || zip.file(Object.keys(zip.files).find((n) => n.endsWith("project.json")))
  if (!entry) throw new Error(`${zipPath} contains no project.json`)
  return JSON.parse(await entry.async("string"))
}

// The rules themselves live in lib/mock-engine.js, not here: the designer's
// preview needs exactly the same answers, and a rule that behaved
// differently there than on the wire would send someone hunting through
// firmware for a difference that lives in the designer. This file is the
// part that talks to a broker - the part that decides anything is shared.
function describe(engine) {
  const lines = []
  if (engine.derived.length === 0 && engine.declared.length === 0) {
    lines.push("derived nothing - no Switch with both a read and a write topic, and no declared rule.")
  }
  if (engine.derived.length > 0) {
    const topics = new Set(engine.derived.map((l) => l.split(" = ")[0]))
    lines.push(`derived ${engine.derived.length} mapping(s) from ${topics.size} command topic(s):`)
    for (const l of engine.derived) lines.push("  " + l)
  }
  if (engine.declared.length > 0) {
    const topics = new Set(engine.declared.map((l) => l.split(" = ")[0]))
    lines.push(`declared ${engine.declared.length} mock rule(s) on ${topics.size} command topic(s):`)
    for (const l of engine.declared) lines.push("  " + l)
  }
  for (const c of engine.conflicts) lines.push(`  CONFLICT ${c}`)
  for (const s of engine.skipped) lines.push(`  skipped  ${s}`)
  for (const pr of engine.ruleProblems) lines.push(`  rule ignored: ${pr}`)
  if (engine.unhandled.length > 0) {
    // Not a warning about this tool being broken - a statement about what
    // the project does not describe. A rule would cover these; until there
    // is one, a tap on such a button will visibly do nothing here, and it
    // should be obvious why rather than look like a dead button.
    lines.push(`  ${engine.unhandled.length} SoftwareButton action(s) have no derivable answer and will go unanswered:`)
    for (const u of engine.unhandled) lines.push("    " + u)
  }
  return lines
}

function isLocal(url) {
  try {
    const host = new URL(url).hostname
    return host === "localhost" || host === "127.0.0.1" || host === "::1"
  } catch {
    return false
  }
}

async function main() {
  const project = await loadProject(projectPath)
  const engine = buildMockEngine(project)

  console.log(`project: "${project.name}" (${path.basename(projectPath)})`)
  for (const line of describe(engine)) console.log(line)

  if (listOnly) return

  // Publishing retained state onto somebody's real broker means fighting
  // whatever actually owns those topics - two answers to every command,
  // and displays that disagree with the hardware. Cheap guard, and the
  // accident it prevents is one you would debug for an hour.
  if (!isLocal(brokerUrl) && !allowRemote) {
    console.error(`\nrefusing to publish to ${brokerUrl}: not a local broker.`)
    console.error("this mock answers commands with retained state - on a broker that has a real")
    console.error("automation on it, both will answer and the two will disagree.")
    console.error("pass --allow-remote if that is really what you want.")
    process.exit(1)
  }

  const client = mqtt.connect(brokerUrl, { clientId: `screenbee-mock-${Date.now()}` })

  client.on("error", (err) => {
    console.error(`broker error: ${err.message}`)
    process.exit(1)
  })

  client.on("connect", () => {
    console.log(`\nconnected to ${brokerUrl}`)
    const topics = engine.commandTopics
    if (topics.length === 0) {
      console.log("nothing to subscribe to - exiting.")
      process.exit(0)
    }
    client.subscribe(topics, (err) => {
      if (err) {
        console.error(`subscribe failed: ${err.message}`)
        process.exit(1)
      }
      console.log(`listening on ${topics.length} command topic(s)`)
      if (delayMs > 0) console.log(`answering after ${delayMs}ms - long enough to watch the marker sit hollow`)
      if (dropMatch) console.log(`dropping anything matching "${dropMatch}" - those should roll back after 3s`)

      if (seed) {
        for (const publication of engine.seed()) {
          publish(publication.topic, publication.value)
          console.log(`  seeded ${publication.topic} = "${publication.value}"`)
        }
      }
      console.log("")
    })
  })

  // Every value this mock has published, so an "add" effect has something
  // to add to. Seeded by --seed, and updated on every answer - the same
  // role the real automation's own state plays.
  // A plain object, not a Map: that is the shape lib/mock-engine.js reads
  // (values[topic]), and the preview will hand it its own value record of
  // the same shape. A Map looks identical at the call site and silently
  // reads as undefined - which showed up as a dimmer that answered "10" to
  // every turn of the knob, never accumulating.
  const current = Object.create(null)
  const publish = (topic, value) => {
    current[topic] = value
    // Retained, like the real thing: state topics are what a device reads
    // back after a reconnect, and a non-retained answer would leave every
    // reboot at "?".
    client.publish(topic, value, { retain: true })
  }

  client.on("message", (topic, payload) => {
    const value = payload.toString()
    const stamp = new Date().toISOString().slice(11, 23)

    const publications = engine.respond(topic, value, current)
    if (publications.length === 0) {
      console.log(`${stamp}  ${topic} = "${value}"  -> no mapping, ignored`)
      return
    }
    if (dropMatch && topic.includes(dropMatch)) {
      console.log(`${stamp}  ${topic} = "${value}"  -> DROPPED (--drop)`)
      return
    }

    const answer = () => {
      // Recomputed at answer time, not when the command arrived: with
      // --delay in play, an "add" must see whatever the value has become in
      // the meantime, the way the real automation would.
      const now = engine.respond(topic, value, current)
      for (const publication of now) publish(publication.topic, publication.value)
      const described = now.map((p) => `${p.topic} = "${p.value}"`).join(", ")
      console.log(`${stamp}  ${topic} = "${value}"  ->  ${described}`)
    }
    if (delayMs > 0) setTimeout(answer, delayMs)
    else answer()
  })

  process.on("SIGINT", () => {
    console.log("\nstopping.")
    client.end(true, () => process.exit(0))
  })
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
