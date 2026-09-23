// Holds the handbook to the one source brand/README.md insists on: the mark,
// the wordmark and the device splash images are copied from brand/ before every
// dev or build run, into public/brand/, which is ignored by git. Nothing here
// is edited by hand, so nothing here can drift from what the devices show.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const brand = path.join(here, "..", "..", "brand")
const out = path.join(here, "..", "public", "brand")

const files = [
  "mark.svg",
  "icon.svg",
  "wordmark.svg",
  "wordmark-dark.svg",
  "favicon-32.png",
  "apple-touch-icon-180.png",
  "device/splash-knob-360x360.png",
  "device/splash-4v3b-800x480.png",
  "device/splash-papers3-960x540.png",
  "device/splash-epaper-400x300-1bit.png",
]

fs.rmSync(out, { recursive: true, force: true })
for (const file of files) {
  const target = path.join(out, path.basename(file))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(brand, file), target)
}
console.log(`[handbuch] ${files.length} brand file(s) copied from brand/`)
