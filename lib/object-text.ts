// What an object's text reads and which icon it shows
// (docs/2026-10-07-live-values.md): kept apart
// from lib/render-screen.ts so the text renderer, which render-screen itself
// draws with, can use it without importing render-screen back.

import type { ScreenObject } from "@/components/project-editor"
import { bakeProjectFields, resolveIn, type PlaceholderScope } from "@/lib/placeholders"
import { evaluate, lowerLiveText, resolveLiveText, type LiveValue } from "@/lib/live-value"

// An object's live values (docs/2026-10-07-live-values.md, decision 17).
export function liveValuesOf(obj: ScreenObject): LiveValue[] {
  const list = obj.properties?.liveValues
  return Array.isArray(list) ? (list as LiveValue[]) : []
}

// A text as drawn: through its live values where it has them, else through
// the placeholders it may still carry (until migrateProject turns them into
// live values). Without a scope a placeholder is drawn as written and a live
// value as before anything arrived.
export function objectText(obj: ScreenObject, text: string, scope?: PlaceholderScope): string {
  const liveValues = liveValuesOf(obj)
  if (liveValues.length === 0) return resolveIn(text, scope)
  return resolveLiveText(text, liveValues, lookupIn(scope), scope?.separators ?? { decimal: ".", thousands: "'" })
}

// A live value's one value in a scope; nothing without one.
function lookupIn(scope?: PlaceholderScope) {
  return (source: LiveValue["source"]) =>
    !scope
      ? undefined
      : source.namespace === "combined"
        ? scope.combined?.(source.path)
        : scope.lookup({ namespace: source.namespace, path: source.path })
}

// The live value a live icon shows (properties.liveIconId), if it is one.
export function liveIconValue(obj: ScreenObject): LiveValue | undefined {
  const id = obj.properties?.liveIconId
  return typeof id === "string" ? liveValuesOf(obj).find((lv) => lv.id === id) : undefined
}

// An icon as drawn: a live icon shows the icon of the result that applies -
// none where that result is not an icon (an Otherwise or No value yet left
// unset). A fixed icon is returned as it is.
export function iconAsDrawn(obj: ScreenObject, scope?: PlaceholderScope): ScreenObject {
  const liveValue = liveIconValue(obj)
  if (!liveValue) return obj
  const { result } = evaluate(liveValue, lookupIn(scope)(liveValue.source))
  return { ...obj, properties: { ...obj.properties, assetId: result?.kind === "icon" ? result.icon : undefined } }
}

// A text object's properties as they go to a device, in both readings
// (tasks/live-values-export-plan.md): `text` as a device of generation 1.3
// reads it - each live value written as the placeholder that says the same,
// or left out where none can, {project:name} written in - and, for 1.4,
// `liveText` with its `{live:<id>}` references and the `liveValues` they name.
export function exportedTextProperties(obj: ScreenObject, project: { name: string }): Record<string, any> {
  const properties: Record<string, any> = { ...obj.properties }
  const liveValues = liveValuesOf(obj)
  let text: unknown = properties.text
  if (liveValues.length > 0 && typeof text === "string") {
    properties.liveText = text
    text = lowerLiveText(text, liveValues).text
  } else delete properties.liveValues
  if (typeof text === "string" && text) properties.text = bakeProjectFields(text, project)
  return properties
}

// The texts a device cannot show whole yet, for the deploy dialog: those with
// a live value no placeholder can say (a rule, a duration, a combined topic),
// named as the popup warning names a button - its text, a chip as "…", and
// its screen.
export function liveValuesNotOnDevices(project: { screens?: { name: string; objects?: ScreenObject[] }[] }): string[] {
  const names: string[] = []
  for (const screen of project.screens ?? []) {
    const walk = (objects: ScreenObject[]) => {
      for (const obj of objects) {
        const liveValues = liveValuesOf(obj)
        const text = obj.properties?.text
        if (liveIconValue(obj)) names.push(`an icon on ${screen.name}`)
        else if (liveValues.length > 0 && typeof text === "string" && lowerLiveText(text, liveValues).left.length > 0) {
          const shown = text.replace(/\{live:[^}]*\}/g, "…").replace(/\{\{/g, "{").replace(/\}\}/g, "}")
          names.push(`"${shown}" on ${screen.name}`)
        }
        if (obj.children?.length) walk(obj.children)
      }
    }
    walk(screen.objects ?? [])
  }
  return names
}

// Whether an icon is live (properties.liveIconId names its live value).
export function isLiveIcon(obj: ScreenObject): boolean {
  return obj.type === "icon" && !!liveIconValue(obj)
}

// Every icon a live icon can show, by branch - a rule's index as r<n>,
// otherwise, noValueYet - for the export to bake each once.
export function liveIconBranches(liveValue: LiveValue): { branch: string; icon: string }[] {
  const branches: { branch: string; icon: string }[] = []
  liveValue.rules.forEach((rule, i) => {
    if (rule.result.kind === "icon" && rule.result.icon) branches.push({ branch: `r${i}`, icon: rule.result.icon })
  })
  if (liveValue.otherwise?.kind === "icon" && liveValue.otherwise.icon) branches.push({ branch: "otherwise", icon: liveValue.otherwise.icon })
  if (liveValue.noValueYet?.kind === "icon" && liveValue.noValueYet.icon) branches.push({ branch: "noValueYet", icon: liveValue.noValueYet.icon })
  return branches
}

// A project as it goes to a device: a live icon keeps its live value for a
// device of generation 1.4, and its asset is the Otherwise icon, what a 1.3
// device draws (none without one). A copy; the project is left as it is.
export function withLiveIconFallbacks<T extends { screens?: { objects?: ScreenObject[] }[] }>(project: T): T {
  const fix = (objects: ScreenObject[]): ScreenObject[] =>
    objects.map((obj) => {
      const children = obj.children?.length ? { children: fix(obj.children) } : {}
      const liveValue = liveIconValue(obj)
      if (!liveValue) return { ...obj, ...children }
      const otherwise = liveValue.otherwise?.kind === "icon" ? liveValue.otherwise.icon : undefined
      return { ...obj, ...children, properties: { ...obj.properties, assetId: otherwise } }
    })
  return { ...project, screens: (project.screens ?? []).map((screen) => ({ ...screen, objects: fix(screen.objects ?? []) })) }
}
