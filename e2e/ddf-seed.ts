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
const DATA_DDF_DIR = path.join(__dirname, "..", ".data", "ddf")
export const M5DIAL_SEEDED_DEVICE_ID = "m5stack-m5dial-v1-1"

// Zips ddf-source/ and writes it to .data/ddf/, the exact shape
// app/api/ddf/fetch/route.ts itself produces - indistinguishable to
// app/api/ddf/list's scanDdfDir from a real auto-discovered copy. Returns
// false (callers should test.skip()) rather than throwing when the firmware
// repo isn't checked out alongside this one - a fresh clone or a CI machine
// with only this repo won't have it, and that's not a failure of anything
// under test here.
export async function seedM5DialDdf(): Promise<boolean> {
  if (!fs.existsSync(path.join(FIRMWARE_DDF_SOURCE, "device.json"))) {
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
  addDir(FIRMWARE_DDF_SOURCE, "")

  const buf = await zip.generateAsync({ type: "nodebuffer" })
  await mkdir(DATA_DDF_DIR, { recursive: true })
  await writeFile(path.join(DATA_DDF_DIR, `${M5DIAL_SEEDED_DEVICE_ID}.ddf.zip`), buf)
  return true
}
