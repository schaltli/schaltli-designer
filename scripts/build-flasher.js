#!/usr/bin/env node
// Assembles the flasher page into one directory: the page itself, the factory
// layout it shares with the release tool, the factory images of the releases it
// offers, and esptool-js bundled. That directory is what GitHub Pages serves
// (.github/workflows/flasher.yml) and what the e2e test serves locally.
// See docs/2026-09-18-factory-image.md.
//
//   node scripts/build-flasher.js --out .flasher-dist
//   node scripts/build-flasher.js --out dist --releases staging --require-bundle
//
// --releases <dir> expects one subdirectory per release, each holding that
// release's manifest.json and its *-factory-*.bin assets - which is what
// `gh release download` leaves behind. Without it the page is built with no
// images at all: that is the state a fresh checkout is in, and the page says so
// rather than pretending.
//
// Options: --out <dir> (required), --releases <dir>, --require-bundle (fail
// instead of warn when esptool-js cannot be bundled), --no-bundle,
// --install-deps (fetch esptool-js and esbuild at the versions pinned below -
// what the workflow uses, so those versions live in one place), --deps <dir>
// (where they are, default .flasher-deps).

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

// Pinned, so the page a workflow publishes is the page that was tested.
const ESPTOOL_VERSION = "0.6.1"
const ESBUILD_VERSION = "0.24.0"

const ROOT = path.join(__dirname, "..")
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const out = arg("--out")
if (!out) {
  console.error("[flasher] --out <dir> is required")
  process.exit(1)
}
const outDir = path.resolve(ROOT, out)
const releasesDir = arg("--releases") ? path.resolve(ROOT, arg("--releases")) : null
const requireBundle = process.argv.includes("--require-bundle")
const noBundle = process.argv.includes("--no-bundle")

function fail(message) {
  console.error(`[flasher] ERROR: ${message}`)
  process.exit(1)
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, "images"), { recursive: true })

// --- the page -------------------------------------------------------------
for (const file of ["index.html", "app.mjs", "boards.mjs"]) {
  fs.copyFileSync(path.join(ROOT, "flasher", file), path.join(outDir, file))
}
// The byte layout, shared with the release tool that merged these images.
fs.copyFileSync(path.join(ROOT, "lib", "factory-image.mjs"), path.join(outDir, "factory-image.mjs"))

// --- the images -----------------------------------------------------------
// A release directory is taken as it comes from `gh release download`: the
// manifest says which file belongs to which device and what it should hash to,
// and only files that are actually there are offered.
const releases = []
if (releasesDir) {
  if (!fs.existsSync(releasesDir)) fail(`--releases ${releasesDir} does not exist`)
  for (const name of fs.readdirSync(releasesDir)) {
    const dir = path.join(releasesDir, name)
    const manifestPath = path.join(dir, "manifest.json")
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(manifestPath)) {
      console.warn(`[flasher] ${name}: no manifest.json, skipped`)
      continue
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    const meta = fs.existsSync(path.join(dir, "release.json"))
      ? JSON.parse(fs.readFileSync(path.join(dir, "release.json"), "utf8"))
      : {}
    const devices = {}
    for (const [deviceId, device] of Object.entries(manifest.devices || {})) {
      if (!device.factory) {
        console.warn(`[flasher] ${manifest.release}: ${deviceId} has no factory image, skipped`)
        continue
      }
      const source = path.join(dir, device.factory.file)
      if (!fs.existsSync(source)) {
        console.warn(`[flasher] ${manifest.release}: ${device.factory.file} is not in ${dir}, skipped`)
        continue
      }
      const size = fs.statSync(source).size
      if (size !== device.factory.size) {
        fail(`${device.factory.file} is ${size} bytes, the manifest says ${device.factory.size}`)
      }
      fs.copyFileSync(source, path.join(outDir, "images", device.factory.file))
      devices[deviceId] = {
        file: `images/${device.factory.file}`,
        size: device.factory.size,
        sha256: device.factory.sha256,
        systemGeneration: device.systemGeneration,
        build: device.build,
      }
    }
    if (!Object.keys(devices).length) continue
    releases.push({
      tag: manifest.release,
      published: meta.publishedAt || meta.createdAt || null,
      commit: manifest.commit,
      devices,
    })
  }
}

// Newest first: by publication when the workflow recorded it, otherwise by the
// tag read as numbers, so fw-2026.09.18.10 sorts above fw-2026.09.18.2.
const numbers = (tag) => (tag.match(/\d+/g) || []).map(Number)
releases.sort((a, b) => {
  if (a.published && b.published) return b.published.localeCompare(a.published)
  const x = numbers(a.tag)
  const y = numbers(b.tag)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0)
  }
  return 0
})

fs.writeFileSync(
  path.join(outDir, "images.json"),
  `${JSON.stringify({ generated: new Date().toISOString(), releases }, null, 2)}\n`,
)

// --- esptool-js -----------------------------------------------------------
// Bundled rather than loaded from a CDN: a page that writes someone's flash
// should not depend on a third party being up. It is a separate file the page
// imports only when the button is pressed.
let bundled = false
if (!noBundle) {
  // esptool-js and esbuild are installed beside the build rather than being
  // project dependencies: nothing in the designer itself needs them, and a Pi
  // running `npm ci` should not carry a flasher's toolchain. One command puts
  // both where this looks for them:
  //
  //   npm install --prefix .flasher-deps --no-save esptool-js@0.6.1 esbuild@0.24.0
  //
  // esbuild is used through its Node API rather than its command line, because
  // its `bin/esbuild` is a JS shim on Windows and a native ELF binary on Linux:
  // running it with node worked here and failed in the workflow on the first
  // real run (2026-09-18). The API is the same on both.
  const depsDir = path.resolve(ROOT, arg("--deps", ".flasher-deps"))
  const lookIn = [path.join(depsDir, "node_modules"), path.join(ROOT, "node_modules")]
  const find = (rel) => lookIn.map((dir) => path.join(dir, rel)).find((p) => fs.existsSync(p))
  const hint =
    `npm install --prefix ${path.relative(ROOT, depsDir) || "."} --no-save esptool-js@${ESPTOOL_VERSION} esbuild@${ESBUILD_VERSION}`

  // --install-deps fetches them, so the versions are pinned here and nowhere
  // else - the workflow asks for this rather than repeating them.
  if (process.argv.includes("--install-deps") && !(find("esptool-js") && find("esbuild"))) {
    fs.mkdirSync(depsDir, { recursive: true })
    const pkg = path.join(depsDir, "package.json")
    if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{ "name": "flasher-deps", "private": true }\n')
    console.log(`[flasher] installing esptool-js@${ESPTOOL_VERSION} and esbuild@${ESBUILD_VERSION} into ${depsDir}`)
    const install = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--prefix", depsDir, "--no-save", `esptool-js@${ESPTOOL_VERSION}`, `esbuild@${ESBUILD_VERSION}`],
      { cwd: ROOT, encoding: "utf8", stdio: "inherit", shell: process.platform === "win32" },
    )
    if (install.status !== 0) fail(`could not install them - run: ${hint}`)
  }

  const esptoolPkg = find(path.join("esptool-js", "package.json"))
  const esbuildPkg = find(path.join("esbuild", "package.json"))
  let why = [
    esptoolPkg ? null : `esptool-js not found in ${lookIn.join(" or ")}`,
    esbuildPkg ? null : `esbuild not found in ${lookIn.join(" or ")}`,
  ].filter(Boolean).join("; ")

  if (esptoolPkg && esbuildPkg) {
    // Bundled from esptool-js's own entry file by absolute path, so its three
    // dependencies resolve next to it wherever it was installed.
    const pkg = JSON.parse(fs.readFileSync(esptoolPkg, "utf8"))
    const target = path.join(path.dirname(esptoolPkg), pkg.module || pkg.main || "lib/index.js")
    const entry = path.join(outDir, ".esptool-entry.mjs")
    fs.writeFileSync(entry, `export { ESPLoader, Transport } from ${JSON.stringify(target.replace(/\\/g, "/"))}\n`)
    try {
      require(path.dirname(esbuildPkg)).buildSync({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        target: "es2020",
        outfile: path.join(outDir, "esptool.bundle.js"),
        logLevel: "warning",
      })
      bundled = fs.existsSync(path.join(outDir, "esptool.bundle.js"))
      if (bundled) {
        console.log(`[flasher] esptool-js ${pkg.version} bundled (${(fs.statSync(path.join(outDir, "esptool.bundle.js")).size / 1024).toFixed(0)} KB)`)
      }
    } catch (error) {
      why = `${error && error.message ? error.message : error}`.trim()
    }
    fs.rmSync(entry, { force: true })
  }
  if (!bundled) {
    if (requireBundle) fail(`esptool-js could not be bundled - ${why}\nrun: ${hint}`)
    console.warn(`[flasher] WARNING: no esptool.bundle.js - the page will render but cannot flash.\n  ${why}\n  run: ${hint}`)
  }
}

const images = releases.reduce((n, r) => n + Object.keys(r.devices).length, 0)
const esptoolState = noBundle ? "not asked for" : bundled ? "bundled" : "MISSING"
console.log(`[flasher] ${outDir}: ${releases.length} release(s), ${images} image(s), esptool ${esptoolState}`)
