/**
 * «Adjust a slider or dial»: a hardware button - on the Knob each detent of
 * the ring - moves a slider or dial one step and writes the absolute value
 * (tasks/ring-adjust-plan.md, docs/2026-10-04-ring-adjust.md).
 *
 * The target is a slider, a dial, or a switcher - then the slider or dial in
 * the panel it shows. It is an object the screen shows: on a normal screen
 * its own or its master's, on a master only the master's own, since those
 * are the ones every screen using it has.
 */

import type { HardwareButtonAction, ProjectScreen, ScreenObject } from "@/components/project-editor"
import { resolveMasterScreen } from "@/lib/master-screen"
import { objectTypeLabel } from "@/lib/object-types"

export type AdjustTargetType = "slider" | "dial" | "switcher"

export function isAdjustTarget(type: string | undefined): type is AdjustTargetType {
  return type === "slider" || type === "dial" || type === "switcher"
}

function collectTargets(objects: ScreenObject[], into: ScreenObject[]): ScreenObject[] {
  for (const obj of objects) {
    if (isAdjustTarget(obj.type)) into.push(obj)
    if (obj.children?.length) collectTargets(obj.children, into)
  }
  return into
}

/** The objects a button on this screen may adjust, at any depth. */
export function adjustTargets(screen: ProjectScreen, allScreens: ProjectScreen[]): ScreenObject[] {
  const master = screen.isMaster ? undefined : resolveMasterScreen(screen, allScreens)
  return collectTargets([...(master?.objects ?? []), ...(screen.objects ?? [])], [])
}

/** How the picker names a target: objects have no name, their topic says which one. */
export function adjustTargetLabel(obj: ScreenObject): string {
  const topic = typeof obj.properties?.topic === "string" ? obj.properties.topic.trim() : ""
  return `${objectTypeLabel(obj.type)} · ${topic || obj.id}`
}

/**
 * The object an adjust-level action moves on this screen, or undefined when
 * it is gone or no longer a slider, dial or switcher.
 */
export function adjustTargetOf(
  action: HardwareButtonAction,
  screen: ProjectScreen,
  masterScreen: ProjectScreen | undefined,
): ScreenObject | undefined {
  if (action.type !== "adjust-level" || !action.targetObjectId) return undefined
  return collectTargets([...(masterScreen?.objects ?? []), ...(screen.objects ?? [])], []).find(
    (obj) => obj.id === action.targetObjectId,
  )
}

/**
 * The direction a button's name suggests: the ring's «Rotate Left» turns
 * down, anything else up. Only a preset - the action carries it explicitly,
 * since the device knows its buttons by id, not by side.
 */
export function suggestedDirection(buttonName: string): "up" | "down" {
  return /left|down|minus|less|lower/i.test(buttonName) ? "down" : "up"
}
