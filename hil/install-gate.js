// A project upload a board cannot read the deviceId of is refused, not
// installed.
//
// Why (2026-11-01): ProjectInstaller::peekProjectDeviceId() answered "" for
// "the project names no device" and for "could not read the project" alike,
// and the upload and deploy gates let "" through - an older export without a
// deviceId has to install. On the 4.3B under load the read failed, and
// hil/internal-heap.js's large project *for another device* was installed;
// the board then had no internal RAM for WiFi. A gate that opens when it
// cannot look is no gate.
//
// Two uploads to the test interface, neither of which may install:
//  - a project.json whose bytes do not match the zip's CRC (stored, one byte
//    turned): readable as a zip, not as a project - refused as unreadable;
//  - a well-formed project for another device - refused as a mismatch, the
//    case the gate has always covered.
// After each: refused, and the board answered without having restarted.
//
// Run: node hil/install-gate.js --device <ip>
// Exit 0 pass, 1 fail, 2 device not reachable (skipped, loudly).
const http = require("http")
const JSZip = require("jszip")

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
  if (!args.device) {
    console.error("usage: node hil/install-gate.js --device <ip>")
    process.exit(1)
  }
  return args
}

function get(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, agent: false }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`no answer within ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

// Seconds since boot, from either /api/debug: the knob's JSON (uptimeMs) or
// the 4.3B's plain text ("uptime 1056 s"). null when the board says neither.
async function uptimeS(base) {
  const r = await get(`${base}/api/debug`)
  if (r.status !== 200) throw new Error(`/api/debug answered ${r.status}`)
  try {
    const j = JSON.parse(r.body)
    if (typeof j.uptimeMs === "number") return j.uptimeMs / 1000
  } catch {}
  const m = r.body.match(/uptime (\d+) s/)
  return m ? Number(m[1]) : null
}

async function upload(base, zip, name) {
  const form = new FormData()
  form.append("file", new Blob([zip]), name)
  const res = await fetch(`${base}/api/project`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) })
  return { ok: res.ok, text: await res.text() }
}

function project(deviceId) {
  return {
    name: "install gate",
    systemGeneration: "1.4",
    deviceId,
    screenWidth: 100,
    screenHeight: 100,
    screens: [{ id: "s", name: "S", objects: [] }],
    fonts: [],
    topics: [],
  }
}

// Stored, so the JSON's bytes sit in the zip as they are: one turned past
// the header and the entry's CRC no longer matches what extracts.
async function unreadableZip() {
  const json = Buffer.from(JSON.stringify(project("whatever-device")))
  const zip = new JSZip()
  zip.file("project.json", json)
  const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }))
  const at = bytes.indexOf(json.subarray(0, 20))
  if (at < 0) throw new Error("could not find project.json's bytes in the stored zip")
  const turn = at + 10
  bytes[turn] = bytes[turn] === 0x41 ? 0x42 : 0x41
  return bytes
}

async function foreignZip() {
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(project("not-this-device")))
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
}

async function main() {
  const { device } = parseArgs(process.argv)
  const base = `http://${device}`
  let before
  try {
    before = await uptimeS(base)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }
  const fails = []
  for (const [label, build, expect] of [
    ["a project.json that does not match its CRC", unreadableZip, /could not read/i],
    ["a project for another device", foreignZip, /mismatch/i],
  ]) {
    const answer = await upload(base, await build(), "gate.zip")
    const refused = !answer.ok && !/"success":\s*true/.test(answer.text)
    // Refused at the gate, before /PROJECT is touched - not by the install
    // failing after it has wiped the board's project (2026-11-01, the 4": «Zip
    // extraction failed», and its project was gone).
    const atGate = refused && expect.test(answer.text)
    console.log(`  ${atGate ? "PASS" : "FAIL"} ${label}: ${refused ? (atGate ? "refused at the gate" : "refused only by a failed install") : "INSTALLED"} (${answer.text.slice(0, 140)})`)
    if (!refused) fails.push(`${label} was installed`)
    else if (!atGate) fails.push(`${label} got past the gate (${answer.text.slice(0, 80)})`)
    await new Promise((r) => setTimeout(r, 3000))
    let now = null
    try {
      now = await uptimeS(base)
    } catch (e) {
      fails.push(`after ${label}, the board did not answer (${e.message})`)
      break
    }
    const restarted = before !== null && now !== null && now < before
    console.log(`  ${restarted ? "FAIL" : "PASS"} no restart after ${label} (uptime ${before} -> ${now} s)`)
    if (restarted) fails.push(`the board restarted after ${label}`)
    before = now
  }
  if (fails.length) {
    console.log(`FAIL - ${device}: ${fails.join("; ")}`)
    process.exit(1)
  }
  console.log(`PASS - ${device}: an unreadable project and one for another device refused, no restart`)
}

main().catch((e) => {
  console.log(`FAIL - ${e.message}`)
  process.exit(1)
})
