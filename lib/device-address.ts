import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"
import { join } from "path"

/**
 * The address a device downloads projects and firmware from, set by hand
 * (#70, 2026-10-14). The designer finds its own address on its network
 * interfaces (lib/server-lan-address.ts), and in a VM behind NAT that is an
 * address inside the VM that no device reaches: a deploy then stops at
 * «Downloading». With this set - the host's address, and the port forwarded
 * to the VM - it works without a bridged adapter.
 *
 * `.data/device-address.json`, written from the Deploy dialog
 * (app/api/device-address). SCHALTLI_DEVICE_ADDRESS is the default before
 * anything is written there. `host` or `host:port`; empty means found.
 */
const FILE = join(process.cwd(), ".data", "device-address.json")

export function configuredDeviceAddress(): string {
  try {
    const stored = JSON.parse(readFileSync(FILE, "utf8"))
    return typeof stored.address === "string" ? stored.address.trim() : ""
  } catch {
    return (process.env.SCHALTLI_DEVICE_ADDRESS ?? "").trim()
  }
}

/** A host or host:port a device could be sent to - no scheme, no path. */
export function isDeviceAddress(value: string): boolean {
  return value === "" || /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(value)
}

export function writeDeviceAddress(address: string): void {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true })
  const incoming = `${FILE}.incoming`
  writeFileSync(incoming, JSON.stringify({ address: address.trim() }))
  renameSync(incoming, FILE)
}
