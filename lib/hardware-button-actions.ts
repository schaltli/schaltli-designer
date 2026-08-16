// Resolves what a hardware button actually does on a given screen (2026-08-16
// master-screen inheritance redesign - see docs/device-contract.md §5 and
// project-editor.tsx's ProjectScreen.buttonActions/isMaster/masterScreenId).
//
// A button's effective action comes from exactly one of three places, in
// priority order: (1) a local override on the screen itself
// (screen.buttonActions[id]), (2) the screen's assigned master screen's own
// buttonActions[id] - only when the screen hasn't opted out via
// showMaster:false, same gate mergeMasterAndScreenObjects' caller already
// applies to visible objects, so "hide the master" means the same thing for
// buttons as it does for artwork - or (3) nothing. There is no third,
// project-wide default level anymore (HardwareButton.defaultAction was
// removed the same day this file was added).
//
// A screen can also set a button to the explicit `{ type: "none" }` action -
// distinct from leaving it unset - to say "this button does nothing here",
// which matters most on a master screen itself (it has no parent to fall
// back to, so this is the only way to represent "deliberately unassigned"
// there) and to let a normal screen opt out of an inherited action without
// picking a real replacement. "none" never leaves this module: it's resolved
// away to `undefined` before reaching a caller, and lib/project-zip.ts's
// export never writes a "none" action into project.json - an absent key
// already means "do nothing" to every consumer (firmware and preview alike),
// so there's nothing for them to represent.

import type { HardwareButtonAction, ProjectScreen } from "@/components/project-editor"

export type ButtonActionSource = "local" | "inherited" | "none"

export interface ResolvedButtonAction {
  source: ButtonActionSource
  // The action to actually run - undefined when source is "none".
  action?: HardwareButtonAction
  // What the assigned master defines for this button, if anything concrete -
  // present even when a local override shadows it, so a caller can still
  // offer "Inherit from Master: <this>" as a way back.
  masterAction?: HardwareButtonAction
}

// The single-master lookup every caller needs before resolveButtonAction can
// run - factored out so project-editor.tsx (deciding what to draw),
// hardware-button-side-panel.tsx (deciding what to offer in its dropdown)
// and lib/project-zip.ts (deciding what to export) all apply the exact same
// "assigned, is actually a master, and not opted out" rule instead of each
// re-deriving it.
export function resolveMasterScreen(
  screen: ProjectScreen,
  allScreens: ProjectScreen[],
): ProjectScreen | undefined {
  if (!screen.masterScreenId || screen.showMaster === false) return undefined
  return allScreens.find((s) => s.id === screen.masterScreenId && s.isMaster)
}

export function resolveButtonAction(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
  buttonId: string,
): ResolvedButtonAction {
  const masterRaw = masterScreen?.buttonActions?.[buttonId]
  const masterAction = masterRaw && masterRaw.type !== "none" ? masterRaw : undefined

  const local = screen.buttonActions?.[buttonId]
  if (local) {
    if (local.type === "none") return { source: "none", masterAction }
    return { source: "local", action: local, masterAction }
  }

  if (masterAction) return { source: "inherited", action: masterAction, masterAction }
  return { source: "none", masterAction }
}

// gray/yellow/red - unbelegt/vererbt/lokal definiert. Read live off the
// canvas (project-editor.tsx's Canvas), not just shown in a settings dialog -
// see canvas.tsx's draw().
export const BUTTON_STATUS_COLOR: Record<ButtonActionSource, string> = {
  none: "#9ca3af", // gray-400
  inherited: "#eab308", // yellow-500
  local: "#dc2626", // red-600
}
