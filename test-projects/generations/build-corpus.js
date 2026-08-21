// Regenerates the frozen system-generation corpus in this directory.
//
// The corpus is a set of checked-in artifacts, one per generation case, that
// e2e/system-generation.spec.ts opens with today's reader. Its whole point is
// that the files are *frozen*: they are what an artifact of that generation
// actually looked like, not what today's writer happens to produce, so the
// rule ("same or older major opens, newer major is refused cleanly") stays
// enforceable as the code that writes these fields keeps changing. That is
// also why they are committed rather than generated inside the spec.
//
// Run: node test-projects/generations/build-corpus.js
//
// **When SYSTEM_GENERATION.major is bumped**, do NOT regenerate the existing
// files - add new ones for the new generation and leave the old artifacts
// exactly as they are. Rewriting them would delete the only evidence that the
// new reader still opens the old files, which is the one thing the corpus
// exists to prove. That is also when the corpus finally covers the
// "older major" case, which cannot exist while the current major is 1.
//
// The cases, and why each is here:
//
//   none   - no systemGeneration field at all: every artifact written before
//            the field existed. Must open (implicit 1.0).
//   1.0    - the current generation, written explicitly. Must open.
//   1.999  - a newer *minor* of the current major. Must open: minors are
//            additive by definition, and "reject anything newer" is the
//            plausible-looking bug this case exists to catch.
//   2.0    - a newer major. Must be refused, with a message naming the
//            generation - a clean refusal is the correct whole answer here,
//            not half of one.

const fs = require("fs")
const path = require("path")
const JSZip = require("jszip")

const OUT_DIR = __dirname
const REPO_ROOT = path.join(__dirname, "..", "..")
const PROJECT_SOURCE = path.join(REPO_ROOT, "test-projects", "switch-test-project.zip")
const DDF_SOURCE = path.join(REPO_ROOT, "public", "ddf", "mqtt-epaper-display.ddf.zip")

// Written into every generated project. The source project targets the M5
// Dial, whose DDF lives only in its firmware repo - pointing the copies at a
// curated device instead lets the corpus spec run on a checkout of this repo
// alone, which matters for a spec whose subject is "can this reader open this
// file" rather than "which device is it for".
const CURATED_DEVICE_ID = "mqtt-epaper-display-2"

// One font instead of the source DDF's four: the .bdf files are ~85% of that
// zip, and a generation fixture needs a DDF that parses, not a complete type
// palette. Everything declared must still exist in the zip, so the manifest
// entries go with it.
const KEPT_FONT_ID = "font-helvR08"

// Fixed timestamps keep regeneration byte-stable, so re-running this script
// without changing anything produces no diff to commit.
const FIXED_DATE = new Date("2026-01-01T00:00:00Z")

const CASES = [
  { name: "none", generation: undefined },
  { name: "1.0", generation: "1.0" },
  { name: "1.999", generation: "1.999" },
  { name: "2.0", generation: "2.0" },
]

async function readZip(file) {
  return JSZip.loadAsync(fs.readFileSync(file))
}

async function writeZip(zip, file) {
  // DEFLATE, not JSZip's uncompressed default: the fonts are ~85% of a DDF
  // and store-mode made each fixture 99KB instead of 15KB. It also matches
  // what every other zip in this system is (docs/device-contract.md 2.2).
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  fs.writeFileSync(file, buf)
  console.log(`${path.relative(REPO_ROOT, file)}  ${(buf.length / 1024).toFixed(1)} KB`)
}

async function buildProject(source, { name, generation }) {
  const zip = new JSZip()
  for (const entry of Object.values(source.files)) {
    if (entry.dir) continue
    if (entry.name === "project.json") continue
    zip.file(entry.name, await entry.async("nodebuffer"), { date: FIXED_DATE })
  }

  const project = JSON.parse(await source.file("project.json").async("string"))
  project.name = `Generation ${name}`
  project.settings = { ...project.settings, deviceId: CURATED_DEVICE_ID }
  delete project.settings.deviceName
  if (generation === undefined) {
    delete project.systemGeneration
  } else {
    project.systemGeneration = generation
  }
  zip.file("project.json", JSON.stringify(project, null, 2), { date: FIXED_DATE })

  await writeZip(zip, path.join(OUT_DIR, `project-${name}.zip`))
}

async function buildDdf(source, { name, generation }) {
  const manifest = JSON.parse(await source.file("device.json").async("string"))
  manifest.fonts = manifest.fonts.filter((font) => font.id === KEPT_FONT_ID)
  const keptFiles = new Set(["device.json", "adornment.svg", ...manifest.fonts.map((f) => f.file)])

  // Its own device id per case, so importing several of them leaves distinct
  // entries rather than overwriting one another - and an "e2e-" prefix, the
  // convention the other seeding specs use to mark .data/ddf leftovers.
  manifest.device = {
    ...manifest.device,
    id: `e2e-generation-${name.replace(/\./g, "v")}`,
    name: `Generation ${name} Device`,
  }
  if (generation === undefined) {
    delete manifest.systemGeneration
  } else {
    manifest.systemGeneration = generation
  }

  const zip = new JSZip()
  for (const entry of Object.values(source.files)) {
    if (entry.dir || !keptFiles.has(entry.name) || entry.name === "device.json") continue
    zip.file(entry.name, await entry.async("nodebuffer"), { date: FIXED_DATE })
  }
  zip.file("device.json", JSON.stringify(manifest, null, 2), { date: FIXED_DATE })

  await writeZip(zip, path.join(OUT_DIR, `ddf-${name}.ddf.zip`))
}

async function main() {
  const projectSource = await readZip(PROJECT_SOURCE)
  const ddfSource = await readZip(DDF_SOURCE)
  for (const testCase of CASES) {
    await buildProject(projectSource, testCase)
    await buildDdf(ddfSource, testCase)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
