import type { Project, ProjectFont, ScreenObject } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { lineHeight } from "@/lib/size-scale"

/**
 * Moving a project off fonts its device no longer sets text in
 * (docs/2026-11-01-4bit-fonts.md, decision 2 and «Designer»). A DDF font may
 * name, in `replaces`, the fonts it stands in for - the colour boards' 4-bit
 * faces replace the 1-bit ones (2026-11-02). Every font field of every object
 * that names one of those is rewritten to its successor.
 *
 * Styled text needs none of this: resolveScale gives it its style's font on
 * the device as it is. This is for the rest - text set in a font by hand
 * ("Custom"), an energy diagram's value font, a chart's date font.
 */

/** Old font id → the font that replaces it, from the fonts' own `replaces`. */
export function fontReplacements(fonts: readonly ProjectFont[]): Map<string, ProjectFont> {
  const by = new Map<string, ProjectFont>()
  for (const font of fonts) for (const id of font.replaces ?? []) if (!by.has(id)) by.set(id, font)
  return by
}

// A font field: `fontId`, or any key ending in it (valueFontId, dateFontId).
const isFontKey = (key: string) => key === "fontId" || key.endsWith("FontId")

function eachObject(objects: readonly ScreenObject[], visit: (o: ScreenObject) => void) {
  for (const o of objects) {
    visit(o)
    if (o.children) eachObject(o.children, visit)
  }
}

// Font ids anywhere in an object's properties, nested lists included.
function fontIdsIn(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) for (const v of value) fontIdsIn(v, into)
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (isFontKey(k) && typeof v === "string") into.add(v)
      else fontIdsIn(v, into)
    }
}

/** The font ids the project's objects name that one of `fonts` replaces. */
export function replacedFontIdsUsed(project: Project, fonts: readonly ProjectFont[]): string[] {
  const replaced = fontReplacements(fonts)
  const used = new Set<string>()
  for (const screen of project.screens) eachObject(screen.objects, (o) => fontIdsIn(o.properties, used))
  return [...used].filter((id) => replaced.has(id))
}

function rewrite(value: unknown, replaced: Map<string, ProjectFont>): unknown {
  if (Array.isArray(value)) {
    const next = value.map((v) => rewrite(v, replaced))
    return next.some((v, i) => v !== value[i]) ? next : value
  }
  if (value && typeof value === "object") {
    let next: Record<string, unknown> | undefined
    for (const [k, v] of Object.entries(value)) {
      const to = isFontKey(k) && typeof v === "string" ? replaced.get(v)?.id ?? v : rewrite(v, replaced)
      if (to !== v) (next ??= { ...(value as Record<string, unknown>) })[k] = to
    }
    return next ?? value
  }
  return value
}

/**
 * Every font field naming a replaced font, rewritten to the font that
 * replaces it, from the project's own fonts. An object whose `fontId`
 * changed takes the new font's line as its `fontSize`, and a text box its
 * height, as a style change does. Returns the project unchanged (the same
 * object) when nothing names a replaced font.
 */
export function withReplacedFonts(project: Project): { project: Project; moved: number } {
  const replaced = fontReplacements(project.fonts ?? [])
  if (replaced.size === 0) return { project, moved: 0 }
  let moved = 0
  const fix = (o: ScreenObject): ScreenObject => {
    let next = o
    const properties = rewrite(o.properties, replaced) as Record<string, any>
    if (properties !== o.properties) {
      moved++
      const font = replaced.get(o.properties?.fontId)
      if (font && typeof o.properties.fontSize === "number") {
        properties.fontSize = lineHeight(font)
        next = { ...o, properties, ...(o.type === "text" ? { height: calculateTextObjectHeight(properties.fontSize) } : {}) }
      } else next = { ...o, properties }
    }
    if (o.children?.length) {
      const children = o.children.map(fix)
      if (children.some((c, i) => c !== o.children![i])) next = { ...next, children }
    }
    return next
  }
  const screens = project.screens.map((screen) => {
    const objects = screen.objects.map(fix)
    return objects.some((o, i) => o !== screen.objects[i]) ? { ...screen, objects } : screen
  })
  return moved === 0 ? { project, moved } : { project: { ...project, screens }, moved }
}

// How wide a text is in a font, or undefined where it cannot be told: no
// bitmap to measure, or a placeholder whose value is not known yet.
function textWidth(text: unknown, font: ProjectFont | undefined, cache: Map<string, BDFFont>): number | undefined {
  if (typeof text !== "string" || text === "" || text.includes("{") || !font?.data || font.format === "ttf") return undefined
  let bdf = cache.get(font.id)
  if (!bdf) {
    bdf = new BDFFont(font.data)
    cache.set(font.id, bdf)
  }
  return Math.max(...text.split("\n").map((line) => bdf!.measureText(line).width))
}

/**
 * The texts that fitted their box in `before` and no longer do in `after`
 * (same objects, other fonts), as «screen: text». Only plain Text objects
 * with a text of their own: a placeholder's width depends on its value.
 */
export function textsNoLongerFitting(before: Project, after: Project): string[] {
  const cache = new Map<string, BDFFont>()
  const oldObjects = new Map<string, ScreenObject>()
  for (const screen of before.screens) eachObject(screen.objects, (o) => oldObjects.set(`${screen.id}/${o.id}`, o))
  const fontOf = (fonts: ProjectFont[] | undefined, id: unknown) => (fonts ?? []).find((f) => f.id === id)
  const out: string[] = []
  for (const screen of after.screens) {
    eachObject(screen.objects, (o) => {
      if (o.type !== "text") return
      const was = oldObjects.get(`${screen.id}/${o.id}`)
      if (!was || was.properties?.fontId === o.properties?.fontId) return
      const now = textWidth(o.properties?.text, fontOf(after.fonts, o.properties?.fontId), cache)
      const then = textWidth(was.properties?.text, fontOf(before.fonts, was.properties?.fontId), cache)
      if (now !== undefined && now > o.width && (then === undefined || then <= was.width))
        out.push(`${screen.name}: «${o.properties.text}»`)
    })
  }
  return out
}
