import { mkdir, readFile, writeFile } from "fs/promises"
import { join } from "path"
import { parseDeviceDescriptionFile } from "@/lib/device-description"
import { isValidDeviceId } from "@/lib/deploy-utils"

/**
 * Checks a device description's bytes and keeps them in `.data/ddf`, however
 * they arrived: fetched from a URL (app/api/ddf/fetch) or handed over by the
 * browser from the broker (app/api/ddf/upload, the way every device of the
 * contract since 2026-10-14 sends it - docs/device-contract.md §4, #70).
 *
 * `deviceId` given means the bytes answer an announcement, and the zip's own
 * device.json must claim that id - the main defence against a hello naming
 * one device and delivering another. `announcedHash`, when given, must be
 * the hash of exactly these bytes: refusing rather than caching anyway is
 * what makes the announcement worth anything. Without a `deviceId` (a URL a
 * human pasted) the zip's own id is trusted on first use.
 */
export type StoredDdf = { deviceId: string; ddfHash: string }

export class DdfRefused extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const DATA_DDF_DIR = join(process.cwd(), ".data", "ddf")

export async function storeDdf(bytes: Buffer, deviceId: string | undefined, announcedHash: string | undefined, origin: string): Promise<StoredDdf> {
  let manifestDeviceId: string
  let ddfHash: string
  try {
    const parsed = await parseDeviceDescriptionFile(bytes)
    manifestDeviceId = parsed.manifest.device.id
    ddfHash = parsed.ddfHash
  } catch (error) {
    throw new DdfRefused(`${origin} isn't a valid device description: ${error instanceof Error ? error.message : "parse failed"}`, 422)
  }
  if (deviceId !== undefined) {
    if (manifestDeviceId !== deviceId) {
      throw new DdfRefused(`The description's own deviceId ("${manifestDeviceId}") doesn't match the announced deviceId ("${deviceId}")`, 422)
    }
    if (announcedHash !== undefined && announcedHash.toLowerCase() !== ddfHash) {
      throw new DdfRefused(`${origin} hashes to ${ddfHash}, but the device announced ${announcedHash.toLowerCase()}`, 422)
    }
  } else if (!isValidDeviceId(manifestDeviceId)) {
    throw new DdfRefused(`The description's own deviceId ("${manifestDeviceId}") is invalid`, 422)
  }
  const finalDeviceId = deviceId ?? manifestDeviceId

  // Keyed by deviceId, not by hash: a device has exactly one description, so
  // the cache holds that one and overwrites it when the device's changes.
  // Hash-named files would instead accumulate one entry per revision a
  // device ever announced, and the Startup Gate would list the same device
  // several times with no way to tell which is current.
  // Written only when it changed: on the Pekaway every write is one to its
  // SD card (2026-09-28).
  await mkdir(DATA_DDF_DIR, { recursive: true })
  const target = join(DATA_DDF_DIR, `${finalDeviceId}.ddf.zip`)
  const cached = await readFile(target).catch(() => null)
  if (!cached || !cached.equals(bytes)) await writeFile(target, bytes)
  return { deviceId: finalDeviceId, ddfHash }
}
