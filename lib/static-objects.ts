// What a phone needs to show a project's box, line or fixed icon since the
// Android bundle carries no baked background picture (2026-10-13,
// tasks/android-draws-all-plan.md): the app drawing them itself, which its
// description says with the feature "static-objects". An older app still
// fills the screen colour, so a project without any of them is fine on it.
//
// Boards are never asked: their export never carried the picture - they
// have drawn every object themselves since 2026-09-25 (device contract §2,
// «Static content»).

import type { ScreenObject } from "@/components/project-editor"
import { isLiveIcon } from "./object-text"

export const STATIC_OBJECTS_FEATURE = "static-objects"

const flat = (objects: readonly ScreenObject[] | undefined): ScreenObject[] =>
  (objects ?? []).flatMap((o) => [o, ...flat(o.children)])

/** Whether an object is one the app used to get only as part of the picture. */
export function isStaticObject(obj: ScreenObject): boolean {
  return obj.type === "box" || obj.type === "line" || (obj.type === "icon" && !isLiveIcon(obj))
}

/** The feature a project with boxes, lines or fixed icons asks of a phone - or null. */
export function staticObjectsFeature(project: { screens?: readonly { objects?: ScreenObject[] }[] }): { feature: string; label: string } | null {
  const used = new Set((project.screens ?? []).flatMap((s) => flat(s.objects)).filter(isStaticObject).map((o) => o.type))
  if (used.size === 0) return null
  const names = [used.has("box") && "boxes", used.has("line") && "lines", used.has("icon") && "icons"].filter(Boolean)
  return { feature: STATIC_OBJECTS_FEATURE, label: names.join(", ").replace(/, ([^,]*)$/, " and $1") }
}
