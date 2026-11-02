// The font cache under a tight budget, on a 4" or 4.3B (firmware
// DdfFontStore::trim, docs/2026-11-01-4bit-fonts.md T9).
//
// A 4-bit face takes 50-370 KB of PSRAM, and a project mixing typographies
// over its screens once used up all of the 4.3B's: no font more loaded, the
// next install failed (2026-11-02). The firmware now loads fonts ahead only
// while PSRAM stays above a reserve and, on a screen change, lets go of the
// fonts the new screen does not name while it is below. With the project the
// text-styles fixture installed (hil/size-scale/text-styles.js, 26 fonts over
// eleven screens), this sets the reserve beyond the PSRAM there is
// (?set=fontreserve), so every screen change lets go of everything else, and
// compares every screen once more through the orchestrator: each font loaded
// again when its screen comes, every screen still 0 px. Then it puts the
// reserve back.
//
// Run: node hil/font-budget.js --device <ip> --project <zip> --report <dir>
// Exit 0 pass, 1 fail, 2 device unreachable or without the font report.
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

function parseArgs(argv) {
  const args = { device: null, project: null, report: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--project") args.project = argv[++i]
    else if (argv[i] === "--report") args.report = argv[++i]
  }
  if (!args.device || !args.project || !args.report) {
    console.error("usage: node hil/font-budget.js --device <ip> --project <zip> --report <dir>")
    process.exit(1)
  }
  return args
}

// "fonts: 26 parsed, 0 let go since boot, 1687 KB PSRAM free, reserve 1024 KB"
async function fontsOf(base, set) {
  const res = await fetch(`${base}/api/debug${set ? `?set=${set}` : ""}`, { signal: AbortSignal.timeout(8000) })
  const m = (await res.text()).match(/fonts: (\d+) parsed, (\d+) let go since boot, (\d+) KB PSRAM free, reserve (\d+) KB/)
  return m ? { parsed: +m[1], letGo: +m[2], free: +m[3], reserve: +m[4] } : null
}

async function main() {
  const { device, project, report } = parseArgs(process.argv)
  const base = `http://${device}`
  let before
  try {
    before = await fontsOf(base)
  } catch (e) {
    console.warn(`SKIPPED - ${device} not reachable (${e.message})`)
    process.exit(2)
  }
  if (!before) {
    console.warn(`SKIPPED - ${device} reports no font cache in /api/debug (firmware before 2026-11-02)`)
    process.exit(2)
  }
  console.log(`  before: ${before.parsed} parsed, ${before.letGo} let go, ${before.free} KB free, reserve ${before.reserve} KB`)
  const fails = []
  try {
    await fontsOf(base, "fontreserve=16384")
    fs.rmSync(report, { recursive: true, force: true })
    const run = spawnSync(process.execPath, ["-r", "./hil/device-auth.js", "hil/waveshare4v3b/orchestrator.js", "--device", device, "--project", project, "--report", report], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    })
    const resultsFile = path.join(report, "results.json")
    const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, "utf8")) : null
    if (!results || results.length === 0) fails.push(`the comparison gave no results (exit ${run.status})`)
    else {
      const passed = results.filter((r) => r.pass).length
      console.log(`  ${passed === results.length ? "PASS" : "FAIL"} ${passed}/${results.length} screens drawn exactly with the fonts let go and loaded again`)
      if (passed !== results.length) fails.push(`${results.length - passed} screen(s) differ under the tight budget`)
    }
    const after = await fontsOf(base)
    const letGo = after ? after.letGo - before.letGo : 0
    console.log(`  ${letGo > 0 ? "PASS" : "FAIL"} fonts were let go on the screen changes: ${letGo}, ${after?.parsed} parsed now`)
    if (letGo <= 0) fails.push("no font was let go with the reserve beyond the PSRAM")
  } finally {
    await fontsOf(base, `fontreserve=${before.reserve}`).catch(() => {})
  }
  if (fails.length) {
    console.log(`FAIL - ${device}: ${fails.join("; ")}`)
    process.exit(1)
  }
  console.log(`PASS - ${device}: every screen exact with fonts let go and loaded again on each change`)
}

main().catch((e) => {
  console.log(`FAIL - ${e.message}`)
  process.exit(1)
})
