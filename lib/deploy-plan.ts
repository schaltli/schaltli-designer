import { firmwareStanding } from "@/lib/firmware-build"
import { formatGeneration, generationBelow, type Generation } from "@/lib/system-generation"

// What Deploy does with the chosen device (docs/2026-10-10-deploy-simple.md,
// #66): at once, complete, or not at all. Pure - the dialog feeds it the
// device's announcement, the release this designer ships and what the
// project needs, and shows what comes back.

/** A part of the project that needs a device of at least `generation`. */
export interface ProjectNeed {
  generation: Generation
  /** What needs it, for the message: "popups", "the navigator on Master 1". */
  parts: string[]
}

export interface PlanDevice {
  name: string
  platform?: "firmware" | "android"
  online: boolean
  systemGeneration?: string
  firmwareBuild?: string
  /** The app's version, on a phone. */
  firmwareVersion?: string
}

export interface PlanRelease {
  build: string
  systemGeneration: string
  /** Downloaded to this designer, so it can be installed. */
  available: boolean
}

export type DeployPlan =
  | { kind: "offline" }
  | { kind: "blocked"; reason: string; link?: { label: string; url: string } }
  | { kind: "deploy"; line: string }
  | { kind: "update-and-deploy"; line: string }

export const FLASHER = "https://schaltli.com/flasher/"
export const APP_RELEASES = "https://github.com/schaltli/schaltli-android/releases/latest"

/** The highest generation the project needs, with everything that needs more than `have`. */
function short(needs: readonly ProjectNeed[], have: unknown): { need: Generation; parts: string[] } | null {
  const missing = needs.filter((n) => generationBelow(have, n.generation))
  if (missing.length === 0) return null
  const need = missing.reduce((a, b) => (generationBelow(formatGeneration(a.generation), b.generation) ? b : a)).generation
  return { need, parts: missing.flatMap((n) => n.parts) }
}

export function planDeploy(input: {
  device: PlanDevice
  release?: PlanRelease
  needs: readonly ProjectNeed[]
  /** Object types the project places that the device's description does not declare. */
  unsupportedTypes?: readonly string[]
}): DeployPlan {
  const { device, release, needs } = input
  if (!device.online) return { kind: "offline" }

  const unsupported = input.unsupportedTypes ?? []
  if (unsupported.length > 0) {
    return {
      kind: "blocked",
      reason:
        `"${device.name}" cannot show ${unsupported.join(", ")}. ` +
        `Remove ${unsupported.length === 1 ? "it" : "them"} from the project, or choose another device.`,
    }
  }

  if (device.platform === "android") {
    const line = `App ${device.firmwareVersion || "unknown"}`
    const gap = short(needs, device.systemGeneration)
    if (gap) {
      return {
        kind: "blocked",
        reason:
          `${line} cannot show all of this project: ${gap.parts.join(", ")}. ` +
          `Update the app on "${device.name}" to one for generation ${formatGeneration(gap.need)} or newer, then deploy.`,
        link: { label: "Get the app", url: APP_RELEASES },
      }
    }
    return { kind: "deploy", line }
  }

  const running = device.firmwareBuild || "unknown"
  const standing = firmwareStanding(device.firmwareBuild, release?.build)

  // The designer brings this board up to its release before the project.
  if (standing === "update-available" && release?.available) {
    const gap = short(needs, release.systemGeneration)
    if (gap) {
      return {
        kind: "blocked",
        reason:
          `Even this designer's firmware ${release.build} cannot show ${gap.parts.join(", ")}: ` +
          `that needs generation ${formatGeneration(gap.need)}. Flash a newer firmware first.`,
        link: { label: "Open the flasher", url: FLASHER },
      }
    }
    return { kind: "update-and-deploy", line: `Firmware ${running} · Deploy installs ${release.build} first` }
  }

  const line =
    standing === "device-ahead"
      ? `Firmware ${running} (newer than this designer's)`
      : standing === "update-available"
        ? `Firmware ${running} · a newer one is not downloaded to this designer`
        : `Firmware ${running}`
  const gap = short(needs, device.systemGeneration)
  if (gap) {
    return {
      kind: "blocked",
      reason:
        `${line}: it cannot show ${gap.parts.join(", ")}, which need${gap.parts.length === 1 ? "s" : ""} generation ` +
        `${formatGeneration(gap.need)}. Flash a newer firmware first.`,
      link: { label: "Open the flasher", url: FLASHER },
    }
  }
  return { kind: "deploy", line }
}
