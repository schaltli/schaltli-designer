// Updates a real board's firmware through the designer's own UI, end to end
// (docs/2026-09-15-firmware-ota.md, step 6).
//
// The halves are tested apart elsewhere: e2e/firmware-update-dialog.spec.ts
// proves the dialog publishes the right trigger to a fake device, and
// hil/firmware-ota.js proves a real board acts on a trigger it is sent. What
// neither can see is the two together - the URL the designer hands out being
// one the board can reach, the image it serves being the one it hashed, the
// status the board reports landing in the dialog. This clicks through the
// Deploy dialog in a real browser against a real board and then asks the
// board what it runs.
//
//   --source file      "From file..." with the image the board already runs
//                      (the checkout's build must have the running MD5).
//                      Repeatable, so this is what test:all runs.
//   --source release   "Update firmware" / "Install release" with the release
//                      the designer ships (GET /api/firmware/release must name
//                      an image for this board). Changes the board's firmware
//                      to that release, so it is run deliberately.
//
// Asserts the dialog reaches "Firmware update - Rebooting" without failing,
// and that the board then boots from the other slot, by software, running
// the image that was sent: the running MD5 must be the MD5 of the bytes the
// designer serves, and for a release the announced build must be the
// release's.
//
// Run: node hil/firmware-designer.js --device <ip> --env <platformio env> [--source file|release]
// Needs the designer (npm run dev) and the broker (npm run hil:broker).
// Exit 0 pass, 1 fail, 2 device, designer or broker unreachable, 3 nothing to
// install (see --source).

const fs = require("fs")
const os = require("os")
const path = require("path")
const crypto = require("crypto")
const mqtt = require("mqtt")
const JSZip = require("jszip")
const { chromium } = require("playwright")
const { get, readBoot, waitForBoot, loadBuild } = require("./firmware-common")

const DESIGNER = process.env.HIL_DESIGNER_BASE || "http://localhost:3000"
const brokerUrl = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const COMBINED_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "combined-test-project.zip")

function parseArgs(argv) {
  const args = { device: null, env: null, source: "file" }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--env") args.env = argv[++i]
    else if (argv[i] === "--source") args.source = argv[++i]
  }
  if (!args.device || !args.env || !["file", "release"].includes(args.source)) {
    console.error("usage: node hil/firmware-designer.js --device <ip> --env <platformio env> [--source file|release]")
    process.exit(1)
  }
  return args
}

function skip(message, code) {
  console.warn(`SKIPPED - ${message}`)
  process.exit(code)
}

// The board's MQTT client id - its instance id in the dialog - from its
// retained hello, matched by the DDF url on its own address.
async function findInstanceId(device) {
  const client = mqtt.connect(brokerUrl, { connectTimeout: 5000, reconnectPeriod: 0 })
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no hello from ${device} within 15s`)), 15000)
      client.on("error", reject)
      client.on("connect", () => client.subscribe("schaltli/+/hello"))
      client.on("message", (topic, payload) => {
        const m = topic.match(/^schaltli\/([^/]+)\/hello$/)
        if (!m || payload.length === 0) return
        try {
          const hello = JSON.parse(payload.toString())
          if (hello.url && hello.url.startsWith(`http://${device}/`)) {
            clearTimeout(timer)
            resolve(m[1])
          }
        } catch {}
      })
    })
  } finally {
    client.end(true)
  }
}

async function main() {
  const { device, env, source } = parseArgs(process.argv)
  const base = `http://${device}`

  let before
  try {
    before = await readBoot(base, 4000)
  } catch (e) {
    skip(`${device} not reachable (${e.message})`, 2)
  }
  if (!before || !before.installsOnlyFor) {
    console.error(`FAIL - ${device} does not report its slot and the images it installs - flash a build from 2026-09-15 or later`)
    process.exit(1)
  }
  const deviceId = before.installsOnlyFor

  try {
    await get(`${DESIGNER}/api/firmware/release`, 30000)
  } catch (e) {
    skip(`the designer is not reachable at ${DESIGNER} (${e.message}); start it with npm run dev`, 2)
  }

  let instanceId
  try {
    instanceId = await findInstanceId(device)
  } catch (e) {
    skip(`no hello from ${device} on ${brokerUrl} (${e.message}); start the broker with npm run hil:broker`, 2)
  }

  // What will be sent, and what the board must run afterwards.
  let expected
  if (source === "file") {
    const build = loadBuild(env)
    if (!build || build.md5 !== before.md5) {
      skip(`${device} runs ${before.md5}, the checkout's ${env} build is ${build ? build.md5 : "missing"} - --source file only sends the running image`, 3)
    }
    expected = { md5: build.md5, build: before.build, file: build.file }
  } else {
    const release = JSON.parse((await get(`${DESIGNER}/api/firmware/release`, 30000)).body).devices[deviceId]
    if (!release || !release.available) {
      skip(`the designer ships no fetched release image for ${deviceId}`, 3)
    }
    const served = await new Promise((resolve, reject) => {
      require("http").get(`${DESIGNER}/api/firmware/release/${release.file}`, (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => resolve(Buffer.concat(chunks)))
      }).on("error", reject)
    })
    if (crypto.createHash("sha256").update(served).digest("hex") !== release.sha256) {
      console.error(`FAIL - the designer serves ${release.file} with a different sha256 than its manifest says`)
      process.exit(1)
    }
    expected = { md5: crypto.createHash("md5").update(served).digest("hex"), build: release.build }
  }

  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }

  console.log(`${device} is ${instanceId} (${deviceId}), runs ${before.build} from ${before.slot}; installing via the designer from ${source}`)

  // A project bound to this board's kind, or the dialog lists no device.
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json").async("string"))
  project.settings.deviceId = deviceId
  zip.file("project.json", JSON.stringify(project, null, 2))
  const projectPath = path.join(os.tmpdir(), `firmware-designer-${deviceId}.zip`)
  fs.writeFileSync(projectPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    await page.goto(DESIGNER, { waitUntil: "domcontentloaded" })
    // Waited for on its own first, with room: a dev server compiles the page
    // on its first request, which took longer than a minute on this machine.
    // And clicked until it answers: the server-rendered button is visible
    // before React has hydrated it, and a click on it then does nothing.
    const choose = page.getByRole("button", { name: "Choose File..." })
    await choose.waitFor({ timeout: 180000 })
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {})
    let chooser = null
    for (let attempt = 0; attempt < 12 && !chooser; attempt++) {
      chooser = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), choose.click()])
        .then(([c]) => c)
        .catch(() => null)
    }
    if (!chooser) throw new Error("the designer's Choose File... never opened a file chooser")
    await chooser.setFiles(projectPath)
    await page.locator("canvas").first().waitFor({ timeout: 60000 })
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()

    const row = page.getByRole("button").filter({ hasText: instanceId })
    await row.waitFor({ timeout: 30000 })
    await row.click()
    const section = page.getByTestId("firmware-section")
    await section.waitFor()

    if (source === "file") {
      await section.getByTestId("firmware-file-input").setInputFiles(expected.file)
    } else {
      await section.getByRole("button", { name: /Update firmware|Install release/ }).click()
    }
    await section.getByRole("button", { name: "Install firmware" }).click()

    const done = page.getByText(/Firmware update - Rebooting/)
    const failed = page.getByText(/Firmware update - Failed/)
    const outcome = await Promise.race([
      done.waitFor({ timeout: 180000 }).then(() => "rebooting"),
      failed.waitFor({ timeout: 180000 }).then(async () => `failed: ${await page.locator("p.text-destructive").allTextContents()}`),
    ]).catch((e) => `no outcome: ${e.message.split("\n")[0]}`)
    if (outcome !== "rebooting") {
      // What the dialog showed instead is the first thing anyone will ask.
      const shot = path.join(os.tmpdir(), `firmware-designer-${deviceId}-${Date.now()}.png`)
      await page.screenshot({ path: shot }).catch(() => {})
      console.log(`  dialog at the time: ${shot}`)
    }
    check(outcome === "rebooting", `1. the dialog followed the update to "Rebooting" (${outcome})`)
  } finally {
    await browser.close()
    fs.rmSync(projectPath, { force: true })
  }

  const after = await waitForBoot(base)
  check(after !== null, "2. the board came back")
  if (after) {
    check(after.slot !== before.slot, `3. it booted the update: ${before.slot} -> ${after.slot}`)
    check(after.md5 === expected.md5, `4. running the image the designer served (MD5 ${after.md5}, sent ${expected.md5})`)
    check(after.build === expected.build, `5. announcing build ${after.build} (expected ${expected.build})`)
    check(after.reset === "software", `6. restarted by software (was ${after.reset})`)
  }

  if (failures.length > 0) {
    console.error(`\nFAIL - ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log(`\nPASS - the designer updated ${device}'s firmware from ${source}`)
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
