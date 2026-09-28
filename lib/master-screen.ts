// Master-screen resolution shared by every kind of inheritance a screen can
// pick up from its assigned master (ProjectScreen.masterScreenId) - objects
// (already merged directly at each draw site via
// lib/object-order.ts's mergeMasterAndScreenObjects), hardware-button
// actions (lib/hardware-button-actions.ts), and background color.
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
// sentinel needed.
export function resolveBackgroundColor(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
): ResolvedBackgroundColor {
  if (screen.backgroundColor) return { source: "local", color: screen.backgroundColor }
  if (masterScreen?.backgroundColor) return { source: "inherited", color: masterScreen.backgroundColor }
  // The theme's surface: a screen nobody coloured is the theme's ground,
  // light or dark. Before themes this was "#ffffff", which is what the
  // default theme's surface still is in light.
  return { source: "default", color: "surface" }
}
