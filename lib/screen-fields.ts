// What an object on a master shows of the screen it is drawn on (asked
// 2026-10-28: a header on the master, the same on every screen, with each
// screen's own name and icon): a text's `{screen:name}` chip, and an icon set
// to the screen's icon.
//
// Written in per screen, where a master's objects are merged into it
// (mergeMasterAndScreenObjects): the canvas, the thumbnails and every export
// draw from that merge, and every export bakes a master's objects once per
// screen already. So no device has to know the screen namespace - it gets a
// plain text and a plain (or live) icon, as if it were written there.

import type { ScreenObject } from "@/components/project-editor"
import { evaluate, resolveLiveText, type LiveValue } from "@/lib/live-value"
import { DEFAULT_SEPARATORS } from "@/lib/placeholders"

export interface ScreenFields {
  name: string
  iconAssetId?: string
  iconLive?: LiveValue
}

/** A screen field's value: the name is the only one. */
export function screenField(screen: ScreenFields, path: string): string | undefined {
  return path === "name" ? screen.name : undefined
}

const isScreenValue = (lv: LiveValue) => lv.source.namespace === "screen"

// A text with its screen chips written in as text, braces doubled as a
// stored text has them; the other chips stay.
function bakeText(text: string, liveValues: LiveValue[], screen: ScreenFields): { text: string; liveValues: LiveValue[] } {
  let out = text
  for (const lv of liveValues.filter(isScreenValue)) {
    const value = resolveLiveText(`{live:${lv.id}}`, [lv], (source) => screenField(screen, source.path), DEFAULT_SEPARATORS)
    out = out.split(`{live:${lv.id}}`).join(value.replace(/[{}]/g, (brace) => brace + brace))
  }
  return { text: out, liveValues: liveValues.filter((lv) => !isScreenValue(lv)) }
}

function withoutLive(properties: Record<string, any>): Record<string, any> {
  const { liveIconId: _id, liveValues: _values, ...rest } = properties
  return rest
}

/** One object as it shows on `screen`; the object itself where nothing changes. */
export function withScreenField(obj: ScreenObject, screen: ScreenFields): ScreenObject {
  let properties = obj.properties ?? {}
  let changed = false

  // An icon set to the screen's: the screen's icon, fixed or live; its own
  // where the screen has none - on the master itself, and on a screen
  // without an icon.
  if (obj.type === "icon" && properties.screenIcon) {
    const { screenIcon: _flag, ...rest } = properties
    properties = screen.iconLive
      ? { ...rest, assetId: screen.iconAssetId, liveIconId: screen.iconLive.id, liveValues: [screen.iconLive] }
      : screen.iconAssetId
        ? { ...withoutLive(rest), assetId: screen.iconAssetId }
        : rest
    changed = true
  }

  const liveValues: LiveValue[] = Array.isArray(properties.liveValues) ? properties.liveValues : []
  if (liveValues.some(isScreenValue)) {
    if (typeof properties.liveIconId === "string") {
      // A live icon that reads the screen: decided here, so it is fixed.
      const lv = liveValues.find((v) => v.id === properties.liveIconId)
      if (lv && isScreenValue(lv)) {
        const { result } = evaluate(lv, screenField(screen, lv.source.path))
        properties = { ...withoutLive(properties), assetId: result?.kind === "icon" ? result.icon : undefined }
      }
    } else if (typeof properties.text === "string") {
      const baked = bakeText(properties.text, liveValues, screen)
      properties = { ...properties, text: baked.text, liveValues: baked.liveValues }
    }
    changed = true
  }

  // An energy diagram's lines are live texts too (device contract 2.8).
  if (obj.type === "energy-diagram" && Array.isArray(properties.nodes)) {
    const nodes = properties.nodes.map((node: any) => {
      if (!Array.isArray(node?.lines) || !node.lines.some((line: any) => (line.liveValues ?? []).some(isScreenValue))) return node
      return { ...node, lines: node.lines.map((line: any) => ({ ...line, ...bakeText(line.text ?? "", line.liveValues ?? [], screen) })) }
    })
    if (nodes.some((node: any, i: number) => node !== properties.nodes[i])) {
      properties = { ...properties, nodes }
      changed = true
    }
  }

  return changed ? { ...obj, properties } : obj
}

/** The objects, nested ones included, as they show on `screen`. */
export function withScreenFields(objects: ScreenObject[], screen: ScreenFields): ScreenObject[] {
  let changed = false
  const out = (objects ?? []).map((obj) => {
    let mapped = withScreenField(obj, screen)
    if (obj.children?.length) {
      const children = withScreenFields(obj.children, screen)
      if (children !== obj.children) mapped = { ...mapped, children }
    }
    if (mapped !== obj) changed = true
    return mapped
  })
  return changed ? out : objects
}
