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

/**
 * The slider or dial a press moves: the target itself, or for a switcher the
 * first slider or dial, in object order, of the panel it shows now - none
 * when that panel has none or no panel shows. `activePanel` is the canvas's
 * own rule (lib/render-screen.ts getActivePanel), passed in so this file
 * stays free of how values are looked up.
 */
export function adjustedLevel(
  target: ScreenObject,
  activePanel: (switcher: ScreenObject) => ScreenObject | undefined,
): ScreenObject | undefined {
  if (target.type === "slider" || target.type === "dial") return target
  if (target.type !== "switcher") return undefined
  const panel = activePanel(target)
  const find = (objects: ScreenObject[]): ScreenObject | undefined => {
    for (const obj of objects) {
      if (obj.type === "slider" || obj.type === "dial") return obj
      const inner = obj.children?.length ? find(obj.children) : undefined
      if (inner) return inner
    }
    return undefined
  }
  return panel ? find(panel.children ?? []) : undefined
}

/**
 * The value one press writes, or null when it writes nothing: at the end of
 * the range, and while no value is known yet - stepping a value from a
 * guessed minimum would surprise more than a ring that waits (decided
 * 2026-10-04). From the value shown - `current`, the asked value while one is
 * held, else the reported one - one `step` up or down onto the step grid the
 * firmware snaps a finger to (roundf(value / step) * step), clamped to the
 * calibration's outer points (default 0-100).
 */
export function adjustedValue(level: ScreenObject, current: string | undefined, direction: "up" | "down"): number | null {
  const points: { value: number }[] = Array.isArray(level.properties?.calibrationPoints) && level.properties.calibrationPoints.length >= 2
    ? level.properties.calibrationPoints
    : [{ value: 0 }, { value: 100 }]
  const values = points.map((p) => Number(p.value)).filter((v) => Number.isFinite(v))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rawStep = Number(level.properties?.step)
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1
  const from = current === undefined || current.trim() === "" ? NaN : Number.parseFloat(current)
  if (!Number.isFinite(from)) return null
  const snapped = Math.round((from + (direction === "up" ? step : -step)) / step) * step
  // A step that does not divide the range tops out below max, as a finger does.
  const highest = min + Math.floor((max - min) / step + 1e-9) * step
  const next = Number(Math.min(highest, Math.max(min, snapped)).toFixed(6))
  return Math.abs(next - from) < 1e-9 ? null : next
}
