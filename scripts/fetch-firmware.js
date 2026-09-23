#!/usr/bin/env node
// Downloads the firmware images firmware/manifest.json names into
// firmware/bin/, and checks every one against its SHA-256 and size
// (docs/2026-09-15-firmware-ota.md, decision 3 and step 5).
//
// Firmware ships with the designer, but not in git: the manifest is committed,
// the images are assets of a GitHub release in this repo, and this script
// fetches them. deploy/pekaway-install.sh runs it on every install and update,
// so updating the designer is what brings the firmware tested with it.
//
// Idempotent. An image already present with the right hash is not downloaded
// again; one with the wrong hash is replaced; images the manifest no longer
// names are removed, so firmware/bin/ always holds exactly one release. A
// download is written to a temporary file and only renamed into place once its
// hash is right, so a broken or interrupted download never leaves a file the
// designer would offer to a device.
//
// Exits 1 if any image could not be fetched or verified, 0 otherwise - also
// when there is no manifest at all, which simply means no release has been
// shipped with this checkout yet.
//
// Run: node scripts/fetch-firmware.js [--manifest <path>] [--out <dir>]

const fs = require("fs")
const path = require("path")
const http = require("http")
const https = require("https")
const crypto = require("crypto")

const ROOT = path.join(__dirname, "..")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const manifestPath = path.resolve(arg("--manifest", path.join(ROOT, "firmware", "manifest.json")))
const outDir = path.resolve(arg("--out", path.join(ROOT, "firmware", "bin")))

const log = (message) => console.log(`[firmware] ${message}`)

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

// Follows redirects: a GitHub release asset answers with a 302 to its storage.
function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http
    const req = client.get(url, { headers: { "User-Agent": "schaltli-designer" }, timeout: 60000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        if (redirectsLeft === 0) return reject(new Error(`too many redirects for ${url}`))
        const next = new URL(res.headers.location, url).toString()
        return resolve(download(next, dest, redirectsLeft - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on("finish", () => file.close(resolve))
      file.on("error", reject)
      res.on("error", reject)
    })
    req.on("timeout", () => req.destroy(new Error(`timed out fetching ${url}`)))
    req.on("error", reject)
  })
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    log(`no manifest at ${path.relative(ROOT, manifestPath)} - no firmware release ships with this checkout yet`)
    return 0
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const devices = Object.entries(manifest.devices || {})
  fs.mkdirSync(outDir, { recursive: true })

  let failed = 0
  const wanted = new Set()
  for (const [deviceId, entry] of devices) {
    if (!entry.file || entry.file.includes("/") || entry.file.includes("\\") || !/^[0-9a-f]{64}$/.test(entry.sha256 || "")) {
      log(`ERROR: manifest entry for ${deviceId} is malformed`)
      failed++
      continue
    }
    wanted.add(entry.file)
    const dest = path.join(outDir, entry.file)
    if (fs.existsSync(dest) && fs.statSync(dest).size === entry.size && sha256File(dest) === entry.sha256) {
      log(`${entry.file}: present and verified`)
      continue
    }
    const temp = `${dest}.download`
    try {
      log(`${entry.file}: downloading ${entry.url}`)
      await download(entry.url, temp)
      const size = fs.statSync(temp).size
      const hash = sha256File(temp)
      if (size !== entry.size || hash !== entry.sha256) {
        throw new Error(`got ${size} bytes with sha256 ${hash}, the manifest says ${entry.size} bytes, ${entry.sha256}`)
      }
      fs.renameSync(temp, dest)
      log(`${entry.file}: verified`)
    } catch (e) {
      fs.rmSync(temp, { force: true })
      fs.rmSync(dest, { force: true })
      log(`ERROR: ${entry.file}: ${e.message}`)
      failed++
    }
  }

  for (const name of fs.readdirSync(outDir)) {
    if (!wanted.has(name)) {
      fs.rmSync(path.join(outDir, name), { force: true, recursive: true })
      log(`${name}: removed, not in this release`)
    }
  }

  if (failed > 0) {
    log(`${failed} image(s) could not be fetched - firmware updates for those devices are unavailable until this succeeds`)
    return 1
  }
  log(`release ${manifest.release}: ${devices.length} image(s) ready`)
  return 0
}

main().then((code) => process.exit(code), (e) => {
  log(`ERROR: ${e.message}`)
  process.exit(1)
})
