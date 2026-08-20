import fs from "fs"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import JSZip from "jszip"

// The M5 Dial's DDF stopped being baked into this repo on 2026-08-16 (see
// docs/device-contract.md) - its real source (device.json + adornment.svg +
// fonts/*.bdf) now lives only in the firmware repo, hand-edited there. Specs
// that just need "an M5 Dial project exists" as test setup (not testing DDF
// discovery itself - that's e2e/ddf-auto-discovery.spec.ts's job, already
// fully synthetic and unaffected by this) seed it straight into .data/ddf/
// here: same end state as a live device announcing itself, without the
// MQTT+HTTP simulation that would otherwise cost every single one of these
// specs.
const FIRMWARE_DDF_SOURCE = path.join(__dirname, "..", "..", "screenbee-m5dial", "ddf-source")
// Same arrangement for the second firmware repo (2026-08-20) - the Waveshare
// Knob-1.8's DDF is likewise maintained only in its own repo, and it's the
// device that declares deviceActions, so specs covering those need it.
const WAVESHARE_DDF_SOURCE = path.join(__dirname, "..", "..", "screenbee-waveshare-1v8", "ddf-source")
const DATA_DDF_DIR = path.join(__dirname, "..", ".data", "ddf")
export const M5DIAL_SEEDED_DEVICE_ID = "m5stack-m5dial-v1-1"
export const WAVESHARE_SEEDED_DEVICE_ID = "waveshare-knob-1v8"

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
        zip.file(prefix + entry.name, fs.readFileSync(full))
      }
    }
  }
  addDir(sourceDir, "")

  if (mutateDeviceJson) {
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "device.json"), "utf8"))
    mutateDeviceJson(manifest)
    zip.file("device.json", JSON.stringify(manifest, null, 2))
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" })
  await mkdir(DATA_DDF_DIR, { recursive: true })
  await writeFile(path.join(DATA_DDF_DIR, `${seededDeviceId}.ddf.zip`), buf)
  return true
}

export async function seedM5DialDdf(): Promise<boolean> {
  return seedDdfFrom(FIRMWARE_DDF_SOURCE, M5DIAL_SEEDED_DEVICE_ID)
}

// `deviceId` seeds the variant as a *separate* device rather than overwriting
// the real one's .data/ddf entry - specs in one file run in parallel
// (playwright.config.ts's fullyParallel), so two of them seeding the same
// filename is a race, and it read as "the mutated field never arrived".
export async function seedWaveshareDdf(options?: {
  deviceId?: string
  mutateDeviceJson?: (manifest: any) => void
}): Promise<boolean> {
  const deviceId = options?.deviceId ?? WAVESHARE_SEEDED_DEVICE_ID
  if (deviceId === WAVESHARE_SEEDED_DEVICE_ID && !options?.mutateDeviceJson) {
    // The firmware repo's DDF verbatim, byte for byte - the default case
    // stays the real thing rather than a re-serialized copy of it.
    return seedDdfFrom(WAVESHARE_DDF_SOURCE, deviceId)
  }
  return seedDdfFrom(WAVESHARE_DDF_SOURCE, deviceId, (manifest) => {
    manifest.device.id = deviceId
    options?.mutateDeviceJson?.(manifest)
  })
}
