// Master-screen resolution shared by every kind of inheritance a screen can
// pick up from its assigned master (ProjectScreen.masterScreenId) - objects
// (already merged directly at each draw site via
// lib/object-order.ts's mergeMasterAndScreenObjects), hardware-button
// actions (lib/hardware-button-actions.ts), and now background color/image.
// One resolveMasterScreen() so every consumer applies the exact same
// "assigned, is actually a master, and not opted out via showMaster" rule.

import type { ProjectScreen } from "@/components/project-editor"

export function resolveMasterScreen(screen: ProjectScreen, allScreens: ProjectScreen[]): ProjectScreen | undefined {
  if (!screen.masterScreenId || screen.showMaster === false) return undefined
  return allScreens.find((s) => s.id === screen.masterScreenId && s.isMaster)
}

export type BackgroundColorSource = "local" | "inherited" | "default"

export interface ResolvedBackgroundColor {
  source: BackgroundColorSource
  color: string
}

// A screen's own backgroundColor is undefined until someone actually picks
// one (screens-panel.tsx's addScreen never sets it) - that absence is
// already exactly the "inherit, or fall back to white" signal, no extra
// sentinel needed (unlike backgroundImageAssetId below, where "no image" and
// "not decided" have to be distinguishable).
export function resolveBackgroundColor(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
): ResolvedBackgroundColor {
  if (screen.backgroundColor) return { source: "local", color: screen.backgroundColor }
  if (masterScreen?.backgroundColor) return { source: "inherited", color: masterScreen.backgroundColor }
  return { source: "default", color: "#ffffff" }
}

export type BackgroundImageSource = "local" | "inherited" | "none"

export interface ResolvedBackgroundImage {
  source: BackgroundImageSource
  assetId?: string
}

// Unlike color, "no image" is a real, meaningful outcome distinct from
// "just inherit whatever the master has" - a screen needs to be able to say
// "no image here" even when its master has one, without that reading as
// "not decided yet". screen.backgroundImageOverrideNone carries that,
// mirroring HardwareButtonAction's "none" type for the exact same shape of
// problem (screen.buttonActions).
export function resolveBackgroundImage(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
): ResolvedBackgroundImage {
  if (screen.backgroundImageAssetId) return { source: "local", assetId: screen.backgroundImageAssetId }
  if (screen.backgroundImageOverrideNone) return { source: "none" }
  if (masterScreen?.backgroundImageAssetId) return { source: "inherited", assetId: masterScreen.backgroundImageAssetId }
  return { source: "none" }
}
