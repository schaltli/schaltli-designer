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
 * (app/api/device-address). SCHALTLI_DEVICE_ADDRESS, when set, comes first
 * and the dialog cannot change it (#82): in a Docker container without the
 * host's network the address found is the container's own, and the file is
 * gone with the container unless `.data` is a volume - the environment is
 * what a container keeps. Until 2026-11-19 the file came first. `host` or
 * `host:port`; empty means found.
 */
function file(): string {
  return join(process.cwd(), ".data", "device-address.json")
}

/** The address SCHALTLI_DEVICE_ADDRESS names, or empty. */
export function environmentDeviceAddress(): string {
  return (process.env.SCHALTLI_DEVICE_ADDRESS ?? "").trim()
}

export function configuredDeviceAddress(): string {
  const fromEnvironment = environmentDeviceAddress()
  if (fromEnvironment) return fromEnvironment
  try {
    const stored = JSON.parse(readFileSync(file(), "utf8"))
    return typeof stored.address === "string" ? stored.address.trim() : ""
  } catch {
    return ""
  }
}

/** A host or host:port a device could be sent to - no scheme, no path. */
export function isDeviceAddress(value: string): boolean {
  return value === "" || /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(value)
}

export function writeDeviceAddress(address: string): void {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true })
  const incoming = `${file()}.incoming`
  writeFileSync(incoming, JSON.stringify({ address: address.trim() }))
  renameSync(incoming, file())
}
