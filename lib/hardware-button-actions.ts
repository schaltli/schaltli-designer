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
import { adjustTargetOf } from "@/lib/adjust-level"
import { neighboursOf, SWIPE_TO_SIDE, type ScreenEdge } from "@/lib/screen-graph"
// Re-exported for existing importers (project-editor.tsx,
// hardware-button-action-fields.tsx, lib/project-zip.ts) - the real definition
// moved to lib/master-screen.ts once background-color/image inheritance
// needed the exact same lookup, so it's no longer specific to buttons.
export { resolveMasterScreen } from "@/lib/master-screen"

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

/**
 * What an export writes for a button: the resolved action, without one that
 * cannot work - an adjust-level whose target is gone or no longer a slider,
 * dial or switcher. An absent key already means «do nothing» everywhere.
 */
export function exportedButtonAction(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
  buttonId: string,
  screens?: readonly ProjectScreen[],
): HardwareButtonAction | undefined {
  const action = screens
    ? resolveSwipeAction(screen, masterScreen, buttonId, screens)
    : resolveButtonAction(screen, masterScreen, buttonId).action
  if (action?.type === "goto-neighbour") return exportedNeighbourAction(screen, action, screens ?? [])
  if (action?.type === "adjust-level") {
    if (!adjustTargetOf(action, screen, masterScreen)) return undefined
    return { type: action.type, targetObjectId: action.targetObjectId, direction: action.direction ?? "up" }
  }
  return action
}

/**
 * A neighbour as the device is told it (tasks/graph-model-plan.md decision 6):
 * one in the main row beside a row screen as «Next screen» or «Previous
 * screen», which every board knows, so a single row exports nothing new; one
 * off the row as `goto-neighbour`; with none on that side, nothing.
 */
function exportedNeighbourAction(
  screen: ProjectScreen,
  action: HardwareButtonAction,
  screens: readonly ProjectScreen[],
): HardwareButtonAction | undefined {
  const targetId = action.side ? neighboursOf(screens, screen.id)[action.side] : undefined
  if (!targetId) return undefined
  const target = screens.find((s) => s.id === targetId)
  if (!screen.dock && !target?.dock) return { type: action.side === "left" ? "previous-screen" : "next-screen" }
  return { type: "goto-neighbour", side: action.side }
}

/**
 * What a swipe does on a screen, in the order of the screen graph
 * (docs/2026-10-17-screen-graph.md decision 4): the screen's own action - an
 * explicit «Nothing» among them, which is how a screen says a swipe does
 * nothing here - else the neighbour it pulls in, else the master's action.
 * Any other button is resolved as before.
 */
export function resolveSwipeAction(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
  buttonId: string,
  screens: readonly ProjectScreen[],
): HardwareButtonAction | undefined {
  const resolved = resolveButtonAction(screen, masterScreen, buttonId)
  const side = SWIPE_TO_SIDE[buttonId]
  if (!side || resolved.source === "local" || screen.buttonActions?.[buttonId]?.type === "none") return resolved.action
  if (neighboursOf(screens, screen.id)[side]) return { type: "goto-neighbour", side }
  return resolved.action
}

/**
 * The neighbours a screen's own swipes cut off (docs/2026-10-17-screen-graph.md
 * decision 9): each side where a screen lies whose swipe does something else -
 * the screen's own action, «Nothing» among them, comes first (decision 4).
 * An own action that goes there all the same cuts nothing off: «Go to a
 * screen» naming the neighbour, or «Next screen» and «Previous screen»
 * between two screens of the main row.
 */
export function cutOffSides(
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
  screens: readonly ProjectScreen[],
): { swipeId: string; side: ScreenEdge; neighbourId: string }[] {
  const neighbours = neighboursOf(screens, screen.id)
  return Object.entries(SWIPE_TO_SIDE).flatMap(([swipeId, side]) => {
    const neighbourId = neighbours[side]
    if (!neighbourId) return []
    const action = resolveSwipeAction(screen, masterScreen, swipeId, screens)
    const neighbour = screens.find((s) => s.id === neighbourId)
    const inRow = !screen.dock && !neighbour?.dock
    const reaches =
      (action?.type === "goto-neighbour" && action.side === side) ||
      (action?.type === "goto-screen" && action.targetScreenId === neighbourId) ||
      (inRow && action?.type === (side === "right" ? "next-screen" : side === "left" ? "previous-screen" : undefined))
    return reaches ? [] : [{ swipeId, side, neighbourId }]
  })
}

const SWIPE_NAME: Record<string, string> = {
  "swipe-up": "Swipe up",
  "swipe-down": "Swipe down",
  "swipe-left": "Swipe left",
  "swipe-right": "Swipe right",
}
const SIDE_WORDS: Record<ScreenEdge, string> = { up: "above it", down: "below it", left: "to its left", right: "to its right" }

/** A cut-off neighbour as the designer warns about it, in screen properties and in «Manage Screens». */
export function cutOffNote(screen: ProjectScreen, cut: { swipeId: string; side: ScreenEdge; neighbourId: string }, screens: readonly ProjectScreen[]): string {
  const neighbour = screens.find((s) => s.id === cut.neighbourId)
  return `${SWIPE_NAME[cut.swipeId]} on "${screen.name}" does not lead to "${neighbour?.name ?? cut.neighbourId}" ${SIDE_WORDS[cut.side]}: its own action comes first.`
}

// gray/yellow/red - unbelegt/vererbt/lokal definiert. Read live off the
// canvas (project-editor.tsx's Canvas), not just shown in a settings dialog -
// see canvas.tsx's draw().
export const BUTTON_STATUS_COLOR: Record<ButtonActionSource, string> = {
  none: "#9ca3af", // gray-400
  inherited: "#eab308", // yellow-500
  local: "#dc2626", // red-600
}
