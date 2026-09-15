// What the designer knows about a firmware build: whether a release is newer
// than what a device runs, and which device an image was built for
// (docs/2026-09-15-firmware-ota.md, decisions 5, 6 and 7). No I/O - the
// browser and the server both use it.

// A device announces its build in hello as firmwareBuild, generated from git
// by the firmware's tools/pre_build_firmware_build.py:
//
//   fw-2026.09.15.1                  a release, exactly
//   fw-2026.09.15.1-3-g1a2b3c4d5e    three commits after that release
//   fw-2026.09.15.1-dirty            ...with uncommitted changes
//   1a2b3c4d5e / 0.1.0 / nothing     a build from before any release existed
const RELEASE_BUILD = /^fw-(\d{4})\.(\d{2})\.(\d{2})\.(\d+)(?:-(\d+)-g[0-9a-f]+)?(-dirty)?$/

export interface ParsedFirmwareBuild {
  // The release the build is based on, as numbers that sort: year, month,
  // day, number of that day.
  release: [number, number, number, number]
  // Commits after that release; 0 on the release itself.
  distance: number
  dirty: boolean
}

export function parseFirmwareBuild(build: string | null | undefined): ParsedFirmwareBuild | null {
  const m = build ? RELEASE_BUILD.exec(build) : null
  if (!m) return null
  return {
    release: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
    distance: m[5] ? Number(m[5]) : 0,
    dirty: Boolean(m[6]),
  }
}

export type FirmwareStanding =
  // No release for this device ships with the designer.
  | "no-release"
  // The device runs exactly the release.
  | "up-to-date"
  // The release is newer than what the device runs - or the device runs a
  // build nobody can place, which predates releases altogether.
  | "update-available"
  // The device runs something built after the release: a development build.
  | "device-ahead"

export function firmwareStanding(deviceBuild: string | null | undefined, releaseBuild: string | null | undefined): FirmwareStanding {
  if (!releaseBuild) return "no-release"
  if (deviceBuild === releaseBuild) return "up-to-date"
  const release = parseFirmwareBuild(releaseBuild)
  const device = parseFirmwareBuild(deviceBuild)
  if (!release) return "no-release"
  if (!device) return "update-available"
  for (let i = 0; i < 4; i++) {
    if (device.release[i] < release.release[i]) return "update-available"
    if (device.release[i] > release.release[i]) return "device-ahead"
  }
  // Same release underneath: anything on top of it is newer than it.
  return device.distance > 0 || device.dirty ? "device-ahead" : "up-to-date"
}

// The DEVICE_ID an image was built for. Every image carries
// "<<screenbee-image device=DEVICE_ID>>" (the firmware's FirmwareImage.h), and
// a device refuses an image without its own - this lets the designer say so
// before sending one.
const MARKER_PREFIX = "<<screenbee-image device="

export function imageDeviceId(bytes: Uint8Array): string | null {
  const prefix = new TextEncoder().encode(MARKER_PREFIX)
  const found = new Set<string>()
  outer: for (let i = 0; i + prefix.length < bytes.length; i++) {
    for (let j = 0; j < prefix.length; j++) {
      if (bytes[i + j] !== prefix[j]) continue outer
    }
    let id = ""
    for (let k = i + prefix.length; k < bytes.length && k < i + prefix.length + 64; k++) {
      const c = bytes[k]
      if (c === 0x3e) {
        if (bytes[k + 1] === 0x3e && id) found.add(id)
        break
      }
      const ch = String.fromCharCode(c)
      if (!/[a-z0-9-]/.test(ch)) break
      id += ch
    }
  }
  // An image names exactly one device. None, or several, is not one to send.
  return found.size === 1 ? Array.from(found)[0] : null
}
