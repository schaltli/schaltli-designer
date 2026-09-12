import fs from "fs"
import { mkdir, rename, writeFile } from "fs/promises"
import path from "path"
import JSZip from "jszip"

// A device's DDF is authored in its firmware repo (device.json +
// adornment.svg + fonts/*.bdf), and that source is what these specs build
// from - not public/ddf/, even though the knob's zip has been curated there
// since 2026-09-12. The point is to test the DDF a human edits, rather than
// whichever build happens to have been copied over.
//
// Specs that just need "a project on a round device exists" as test setup
// (not testing DDF discovery itself - that's e2e/ddf-auto-discovery.spec
// .ts's job, already fully synthetic and unaffected by this) seed one
// straight into .data/ddf/ here: same end state as a live device announcing
// itself, without the MQTT+HTTP simulation that would otherwise cost every
// single one of these specs.
//
// Seeding under a fixture id rather than the real one also keeps them clear
// of the curated copy, which the Startup Gate would otherwise offer
// alongside - see ROUND_FIXTURE_DEVICE_ID below.
const WAVESHARE_DDF_SOURCE = path.join(__dirname, "..", "..", "screenbee-waveshare-1v8", "ddf-source")
const DATA_DDF_DIR = path.join(__dirname, "..", ".data", "ddf")
export const WAVESHARE_SEEDED_DEVICE_ID = "waveshare-knob-1v8"

// The round-device fixture those setup-only specs share. It was the M5 Dial
// until 2026-09-10, which suited the job for a reason worth keeping in mind
// now that it is gone: no M5 Dial was ever on the broker here, so nothing
// could overwrite what a spec had just seeded.
//
// The knob is a live device, so seeding it under its *real* id would not be
// equivalent - the Startup Gate auto-fetches from a device republishing its
// retained hello and rewrites .data/ddf/waveshare-knob-1v8.ddf.zip mid-run
// (see adornment-screen-cutout-invisible.spec.ts, which hit exactly that).
// Under a fixture id it cannot be, so these specs test the DDF a human edits
// in the firmware repo rather than whichever build happens to be flashed.
//
// One shared id, not one per spec: seedDdfFrom is idempotent and skips the
// write when nothing changed, so parallel specs seeding it are safe, and
// /api/ddf/list parses every zip in that directory on each request - a
// fixture per spec would slow the gate down for the whole suite.
export const ROUND_FIXTURE_DEVICE_ID = "e2e-round-fixture"

// Every entry gets the same fixed timestamp so that seeding the same source
// twice produces byte-identical zips. JSZip stamps `new Date()` per entry
// otherwise, which made every re-seed a real content change and forced a
// write - see the skip-if-unchanged check in seedDdfFrom.
const FIXED_ENTRY_DATE = new Date("2026-01-01T00:00:00Z")

// Zips ddf-source/ and writes it to .data/ddf/, the exact shape
// app/api/ddf/fetch/route.ts itself produces - indistinguishable to
// app/api/ddf/list's scanDdfDir from a real auto-discovered copy. Returns
// false (callers should test.skip()) rather than throwing when the firmware
// repo isn't checked out alongside this one - a fresh clone or a CI machine
// with only this repo won't have it, and that's not a failure of anything
// under test here.
async function seedDdfFrom(
  sourceDir: string,
  seededDeviceId: string,
  // Lets a spec seed a variant of the real DDF (e.g. one declaring a
  // deviceAction id the designer's registry doesn't know) without checking a
  // second, hand-maintained copy of a whole device into this repo, where it
  // would silently drift from the firmware repo's real one.
  mutateDeviceJson?: (manifest: any) => void,
  // Same idea for the artwork. Needed because some designer behaviour is a
  // response to a *mistake* a DDF can make - an adornment that paints over
  // the screen cutout - and no shipping device makes it, so there is nothing
  // real to point a test at. Editing the SVG on the way in keeps that guard
  // alive without a checked-in fake device.
  mutateAdornmentSvg?: (svg: string) => string,
): Promise<boolean> {
  if (!fs.existsSync(path.join(sourceDir, "device.json"))) {
    return false
  }

  const zip = new JSZip()
  function addDir(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        addDir(full, prefix + entry.name + "/")
      } else {
        zip.file(prefix + entry.name, fs.readFileSync(full), { date: FIXED_ENTRY_DATE })
      }
    }
  }
  addDir(sourceDir, "")

  if (mutateAdornmentSvg) {
    const svgPath = path.join(sourceDir, "adornment.svg")
    zip.file("adornment.svg", mutateAdornmentSvg(fs.readFileSync(svgPath, "utf8")), { date: FIXED_ENTRY_DATE })
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "device.json"), "utf8"))
  const isVariant = seededDeviceId !== manifest.device.id
  if (isVariant) {
    manifest.device.id = seededDeviceId
    // Renamed, not just re-id'd. The Startup Gate shows a device by *name*,
    // so a variant seeded from a real device's source is otherwise a second
    // card captioned exactly like the real hardware, and picking the wrong
    // one binds the project to a deviceId no device will ever announce -
    // which then surfaces much later, in the Deploy dialog, as "no matching
    // devices". That is not hypothetical: it cost a live debugging session
    // on 2026-08-21, with three identically-captioned Waveshare cards in
    // the picker.
    manifest.device.name = `[e2e fixture] ${manifest.device.name} - ${seededDeviceId}`
  }
  mutateDeviceJson?.(manifest)
  if (isVariant || mutateDeviceJson) {
    zip.file("device.json", JSON.stringify(manifest, null, 2), { date: FIXED_ENTRY_DATE })
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" })
  await mkdir(DATA_DDF_DIR, { recursive: true })
  const finalPath = path.join(DATA_DDF_DIR, `${seededDeviceId}.ddf.zip`)

  // Specs run in parallel (playwright.config.ts's fullyParallel) and most of
  // them re-seed the same unchanged device, while other specs are loading the
  // Startup Gate, whose /api/ddf/list reads every zip in this directory. Not
  // rewriting an identical file is what keeps those two apart: with the fixed
  // entry dates above, "seed the round fixture" is a no-op after the first
  // one in a run, so there is no window in which a reader sees a half-written
  // zip.
  if (fs.existsSync(finalPath) && fs.readFileSync(finalPath).equals(buf)) {
    return true
  }

  // A real change still has to land atomically, for the same reason. The temp
  // name deliberately doesn't end in .zip, since that is what the scan picks
  // up. On Windows rename() fails with EPERM while another process holds the
  // target open - the dev server reading it for /api/ddf/list - so retry
  // briefly rather than failing the spec that happened to seed at that
  // instant.
  const tmpPath = path.join(DATA_DDF_DIR, `.${seededDeviceId}.${process.pid}.tmp`)
  await writeFile(tmpPath, buf)
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmpPath, finalPath)
      return true
    } catch (err) {
      if (attempt >= 20) throw err
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

export async function seedRoundFixtureDdf(): Promise<boolean> {
  return seedDdfFrom(WAVESHARE_DDF_SOURCE, ROUND_FIXTURE_DEVICE_ID)
}

// `deviceId` seeds the variant as a *separate* device rather than overwriting
// the real one's .data/ddf entry - specs in one file run in parallel
// (playwright.config.ts's fullyParallel), so two of them seeding the same
// filename is a race, and it read as "the mutated field never arrived".
export async function seedWaveshareDdf(options?: {
  deviceId?: string
  mutateDeviceJson?: (manifest: any) => void
  mutateAdornmentSvg?: (svg: string) => string
}): Promise<boolean> {
  const deviceId = options?.deviceId ?? WAVESHARE_SEEDED_DEVICE_ID
  if (deviceId === WAVESHARE_SEEDED_DEVICE_ID && !options?.mutateDeviceJson && !options?.mutateAdornmentSvg) {
    // The firmware repo's DDF verbatim, byte for byte - the default case
    // stays the real thing rather than a re-serialized copy of it.
    return seedDdfFrom(WAVESHARE_DDF_SOURCE, deviceId)
  }
  // device.id and the fixture naming are handled by seedDdfFrom itself now -
  // it knows it is seeding under a different id than the source declares.
  return seedDdfFrom(WAVESHARE_DDF_SOURCE, deviceId, options?.mutateDeviceJson, options?.mutateAdornmentSvg)
}
