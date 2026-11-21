/**
 * A newer description of the project's own device: what the editor offers
 * in the bar above the canvas until the project takes it (2026-11-21).
 *
 * A project keeps the description it was made with (embeddedDdfZipBase64),
 * so after an update of the designer, the firmware or the app an old project
 * did not know what its device could do now - and the offer that said so sat
 * in Settings › Device, where nobody went looking (#64, the user
 * 2026-11-21: "wenn man das handbuch nicht liest, übersieht man das leicht").
 *
 * "Newer" is told by what a description offers, not by its hash, which has
 * no order: one is offered only when it draws every object type and has
 * every feature the project's has, and at least one more. A device still on
 * an older firmware announces fewer, and is never offered as a step back;
 * two descriptions that each have something the other lacks are never
 * offered in turn.
 */

import type { DeviceDescriptionListEntry } from "@/lib/device-description"

export interface DeviceUpgrade {
  path: string
  deviceName: string
  ddfHash: string
  newTypes: string[]
  newFeatures: string[]
}

interface Offers {
  supportedObjectTypes?: readonly string[] | null
  supportedFeatures?: readonly string[] | null
}

/**
 * What `offer` has that `have` has not, or null unless it has all `have` has
 * and something more.
 */
export function deviceGain(have: Offers, offer: Offers): { newTypes: string[]; newFeatures: string[] } | null {
  const haveTypes = have.supportedObjectTypes ?? []
  const haveFeatures = have.supportedFeatures ?? []
  const offerTypes = offer.supportedObjectTypes ?? []
  const offerFeatures = offer.supportedFeatures ?? []
  if (haveTypes.some((t) => !offerTypes.includes(t))) return null
  if (haveFeatures.some((f) => !offerFeatures.includes(f))) return null
  const newTypes = offerTypes.filter((t) => !haveTypes.includes(t))
  const newFeatures = offerFeatures.filter((f) => !haveFeatures.includes(f))
  if (newTypes.length === 0 && newFeatures.length === 0) return null
  return { newTypes, newFeatures }
}

/**
 * The description to offer the project, among those this designer has: its
 * own device's, a gain over the project's, the designer's curated copy before
 * one a device announced. null when there is none - and for a project that
 * names no object types at all (undefined: no restriction), which has
 * nothing to gain.
 */
export function findDeviceUpgrade(
  settings: { deviceId?: string; ddfHash?: string; supportedObjectTypes?: readonly string[]; supportedFeatures?: readonly string[] },
  entries: readonly DeviceDescriptionListEntry[],
): DeviceUpgrade | null {
  const { deviceId } = settings
  if (!deviceId || !settings.supportedObjectTypes) return null
  const candidates = entries
    .filter((e) => e.deviceId === deviceId && e.ddfHash && e.ddfHash !== settings.ddfHash && e.supportedObjectTypes)
    .sort((a, b) => (a.source === b.source ? 0 : a.source === "curated" ? -1 : 1))
  for (const entry of candidates) {
    const gain = deviceGain(settings, entry)
    if (gain) return { path: entry.path, deviceName: entry.deviceName, ddfHash: entry.ddfHash as string, ...gain }
  }
  return null
}
