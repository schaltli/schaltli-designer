import { existsSync, statSync } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"

// The firmware release that ships with this designer (docs/2026-09-15-
// firmware-ota.md, decision 3): firmware/manifest.json, committed, written by
// the firmware repo's tools/release-firmware.js - and the images it names in
// firmware/bin/, fetched and verified by scripts/fetch-firmware.js. Server
// only.

export interface FirmwareManifestEntry {
  build: string
  file: string
  size: number
  sha256: string
  systemGeneration: string
  url: string
}

export interface FirmwareReleaseDevice extends Omit<FirmwareManifestEntry, "url"> {
  // Whether the image is in firmware/bin/ with the size the manifest says -
  // false until an install has fetched it. The dialog does not offer an
  // update it cannot serve.
  available: boolean
}

export interface FirmwareRelease {
  release: string | null
  // The firmware repository commit this release was built from, as the release
  // tool wrote it into the manifest. Null for a manifest that predates it.
  // Read by /api/version: the tag says which release, this says which code.
  commit: string | null
  devices: Record<string, FirmwareReleaseDevice>
}

// Overridable for tests, which must not touch the checkout's own firmware/.
export function firmwareDir(): string {
  return process.env.SCHALTLI_FIRMWARE_DIR || join(process.cwd(), "firmware")
}

const VALID_FILE = /^[A-Za-z0-9._-]+\.bin$/

export async function readFirmwareRelease(dir: string = firmwareDir()): Promise<FirmwareRelease> {
  let manifest: { release?: string; commit?: string; devices?: Record<string, FirmwareManifestEntry> }
  try {
    manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))
  } catch {
    return { release: null, commit: null, devices: {} }
  }

  const devices: Record<string, FirmwareReleaseDevice> = {}
  for (const [deviceId, entry] of Object.entries(manifest.devices || {})) {
    if (!entry || typeof entry.file !== "string" || !VALID_FILE.test(entry.file) || !/^[0-9a-f]{64}$/.test(entry.sha256)) continue
    const path = join(dir, "bin", entry.file)
    const available = existsSync(path) && statSync(path).size === entry.size
    devices[deviceId] = {
      build: entry.build,
      file: entry.file,
      size: entry.size,
      sha256: entry.sha256,
      systemGeneration: entry.systemGeneration,
      available,
    }
  }
  const commit = typeof manifest.commit === "string" && /^[0-9a-f]{7,40}$/.test(manifest.commit) ? manifest.commit : null
  return { release: manifest.release || null, commit, devices }
}

// The path of a release image, or null if the manifest does not name it -
// only files the release names are ever served.
export async function releaseImagePath(file: string, dir: string = firmwareDir()): Promise<string | null> {
  if (!VALID_FILE.test(file)) return null
  const release = await readFirmwareRelease(dir)
  const entry = Object.values(release.devices).find((d) => d.file === file)
  return entry && entry.available ? join(dir, "bin", file) : null
}
