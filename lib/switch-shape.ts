/**
 * The shape and the colours of a Switch, as whole pixels.
 *
 * One place, because the designer, the bake and (once it is ported) the
 * firmware have to agree on it to the pixel - the same reason
 * lib/level-shape.ts exists. See docs/2026-09-20-switch-look.md for why it
 * looks like this.
 *
 * Two forms, from the object's existing `mode`:
 *
 *   "segmented" -> a **connected button group** (Material 3): one container
 *                  with the states side by side in it, the chosen one as its
 *                  own pill. Material has retired the segmented button in
 *                  favour of this.
 *   "single"    -> a **switch**: a track with a knob that stands at one of n
 *                  positions, the state's icon on the knob and its label
 *                  beside it. n is normally 2.
 *
 * Integer arithmetic only, and `Math.trunc` rather than `Math.round` wherever
 * a fraction appears, because C++ integer division truncates toward zero.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import { controlPalette } from "@/lib/control-palette"
import { blendColors, onColorFor } from "@/lib/material-colors"
import { fontMetricsOf, levelTrackLook, type LevelFontMetrics } from "@/lib/level-shape"

/** Material's 2 dp between the buttons of a connected group. */
export const SWITCH_PAD = 2
/** Icon to label, and track to label. */
export const SWITCH_GAP = 8
/** How much bigger the knob gets while a finger is on it (Material grows it too). */
export const SWITCH_KNOB_PRESS = 2

export type SwitchForm = "group" | "knob"

export function switchForm(obj: ScreenObject): SwitchForm {
  return obj.type === "switch" ? "knob" : "group"
}

/** How loud the chosen state is: the colour itself, or the colour halfway to the background. */
export type SwitchStyle = "filled" | "tonal"

export function switchStyleOf(obj: ScreenObject): SwitchStyle {
  return obj.properties.switchStyle === "tonal" ? "tonal" : "filled"
}

/** The one colour the author sets; the palette's own when there is none. */
export function switchColorOf(obj: ScreenObject, colorDepth: string | undefined): string {
  const color = obj.properties.switchColor
  return typeof color === "string" && color.trim() !== "" ? color : controlPalette(colorDepth).fill
}

/**
 * Whether this state counts as "switched on" - which is what makes the knob
 * form draw in colour rather than quietly.
 *
 * Renamed from `showMarker` on 2026-09-20: it used to decide whether the old
 * marker bar was drawn, and there is no bar any more. Old projects are read as
 * they are - the van's are full of them - so the old name still counts.
 */
export function switchStateIsOn(state: { showAsOn?: boolean; showMarker?: boolean }): boolean {
  return state.showAsOn ?? state.showMarker ?? false
}

/**
 * The corner radius of a container or a button in it: a pill when it is
 * clearly wider than tall, a rounded square otherwise - a segment as tall as it
 * is wide would come out an oval, or a circle (seen in the first render,
 * 2026-09-20).
 */
export function switchCorner(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 0
  if (w >= Math.trunc((h * 3) / 2)) return Math.trunc(h / 2)
  return Math.min(28, Math.trunc(Math.min(w, h) / 3))
}

export interface SwitchRect {
  x: number
  y: number
  w: number
  h: number
  /** Corner radius; a pill where it is half the short side. */
  r: number
}

/** What a Switch is painted with. Everything follows from its one colour. */
export interface SwitchLook {
  /** The container behind the group, and the track of a switch that is off. */
  surface: string
  /** An outline for that surface, where it would otherwise be invisible (1 bit). */
  surfaceOutline: string | null
  /** The chosen state's own pill, and the track of a switch that is on. */
  chosen: string
  /** Ink on the chosen one. */
  onChosen: string
  /** Ink on the surface. */
  onSurface: string
  /** The ring that says "asked for, not confirmed". */
  ring: string
}

export function switchLook(obj: ScreenObject, background: string, colorDepth: string | undefined): SwitchLook {
  const color = applyColorDepth(switchColorOf(obj, colorDepth), colorDepth)
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  // The same tint the slider's empty track and a tonal button take, so the
  // three read as one family.
  const tint = levelTrackLook(color, ground, colorDepth)
  const surface = applyColorDepth(blendColors(ground, color, 25), colorDepth)
  const framed = surface.toLowerCase() === ground.toLowerCase()
  const quiet = tint.framed ? color : tint.track
  return {
    surface,
    surfaceOutline: framed ? color : null,
    chosen: switchStyleOf(obj) === "tonal" ? quiet : color,
    onChosen: onColorFor(switchStyleOf(obj) === "tonal" ? quiet : color, colorDepth),
    onSurface: onColorFor(surface, colorDepth),
    ring: color,
  }
}

/** The track and the knob of the switch form, in the state it is currently in. */
export interface SwitchKnobLook {
  track: string
  trackOutline: string | null
  knob: string
  onKnob: string
}

export function switchKnobLook(
  obj: ScreenObject,
  background: string,
  colorDepth: string | undefined,
  on: boolean,
): SwitchKnobLook {
  const look = switchLook(obj, background, colorDepth)
  const color = applyColorDepth(switchColorOf(obj, colorDepth), colorDepth)
  const ground = applyColorDepth(!background || background === "transparent" ? "#ffffff" : background, colorDepth)
  const tint = levelTrackLook(color, ground, colorDepth)
  const quiet = tint.framed ? color : tint.track
  if (on) return { track: look.chosen, trackOutline: null, knob: look.onChosen, onKnob: look.chosen }
  // Off is the quiet pair: a pale track with an outline, and the knob in the
  // tint - "grau", without a grey that no palette here has.
  return { track: look.surface, trackOutline: quiet, knob: quiet, onKnob: onColorFor(quiet, colorDepth) }
}

/** The container of a connected button group: the object's own rectangle, as a pill. */
export function switchContainer(obj: ScreenObject): SwitchRect {
  const x = Math.trunc(obj.x)
  const y = Math.trunc(obj.y)
  const w = Math.max(0, Math.trunc(obj.width))
  const h = Math.max(0, Math.trunc(obj.height))
  return { x, y, w, h, r: switchCorner(w, h) }
}

/**
 * The buttons in the container, tiling it exactly: each starts where the last
 * one ended, so no seam appears and no segment is a pixel wider than its
 * neighbour by accident.
 */
export function switchSegments(obj: ScreenObject, count: number): SwitchRect[] {
  const box = switchContainer(obj)
  const innerX = box.x + SWITCH_PAD
  const innerY = box.y + SWITCH_PAD
  const innerW = Math.max(0, box.w - 2 * SWITCH_PAD)
  const innerH = Math.max(0, box.h - 2 * SWITCH_PAD)
  const n = Math.max(1, count)
  const out: SwitchRect[] = []
  for (let i = 0; i < n; i++) {
    const from = innerX + Math.trunc((innerW * i) / n)
    const to = innerX + Math.trunc((innerW * (i + 1)) / n)
    const w = Math.max(0, to - from)
    out.push({ x: from, y: innerY, w, h: innerH, r: switchCorner(w, innerH) })
  }
  return out
}

/** Which segment a finger at `x` is on. */
export function switchSegmentAt(obj: ScreenObject, count: number, x: number): number {
  const segments = switchSegments(obj, count)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (x < seg.x + seg.w || i === segments.length - 1) return i
  }
  return 0
}

/** The track of the switch form: two thirds of the object's height, at its left edge. */
export function switchTrack(obj: ScreenObject, count: number): SwitchRect {
  const x = Math.trunc(obj.x)
  const y = Math.trunc(obj.y)
  const h = Math.max(0, Math.trunc(obj.height))
  const trackH = Math.max(6, Math.trunc((h * 2) / 3))
  const pad = Math.max(1, Math.trunc(trackH / 8))
  const knob = Math.max(2, trackH - 2 * pad)
  const n = Math.max(1, count)
  const wanted = 2 * pad + knob + (n - 1) * knob
  const w = Math.min(wanted, Math.max(0, Math.trunc(obj.width)))
  return { x, y: y + Math.trunc((h - trackH) / 2), w, h: trackH, r: Math.trunc(trackH / 2) }
}

/** The knob's circle, at slot `index`. */
export function switchKnob(
  obj: ScreenObject,
  count: number,
  index: number,
  pressed = false,
): { cx: number; cy: number; r: number } {
  const track = switchTrack(obj, count)
  const pad = Math.max(1, Math.trunc(track.h / 8))
  const knob = Math.max(2, track.h - 2 * pad)
  const step = knob
  const slot = Math.max(0, Math.min(Math.max(1, count) - 1, index))
  return {
    cx: track.x + pad + slot * step + Math.trunc(knob / 2),
    cy: track.y + Math.trunc(track.h / 2),
    r: Math.trunc(knob / 2) + (pressed ? SWITCH_KNOB_PRESS : 0),
  }
}

/** Which slot a finger at `x` means; -1 where it is past the track, on the label. */
export function switchSlotAt(obj: ScreenObject, count: number, x: number): number {
  const track = switchTrack(obj, count)
  if (x < track.x || x > track.x + track.w) return -1
  const pad = Math.max(1, Math.trunc(track.h / 8))
  const knob = Math.max(2, track.h - 2 * pad)
  const first = track.x + pad + Math.trunc(knob / 2)
  const slot = Math.round((x - first) / knob)
  return Math.max(0, Math.min(Math.max(1, count) - 1, slot))
}

/** What is left of the object beside the track: where the state's label goes. */
export function switchLabelBox(obj: ScreenObject, count: number): SwitchRect {
  const track = switchTrack(obj, count)
  const x = track.x + track.w + SWITCH_GAP
  const right = Math.trunc(obj.x) + Math.trunc(obj.width)
  return { x, y: Math.trunc(obj.y), w: Math.max(0, right - x), h: Math.max(0, Math.trunc(obj.height)), r: 0 }
}

/**
 * Where a state's icon and label go inside a rectangle: side by side when it is
 * wider than tall (a strip), the icon above the label when it is not (a tile).
 * The rectangle decides, so nothing has to be set per object.
 */
export interface SwitchContent {
  icon: SwitchRect | null
  textX: number
  baseline: number
  beside: boolean
}

export function switchContent(
  rect: SwitchRect,
  metrics: LevelFontMetrics,
  hasIcon: boolean,
  textWidth: number,
): SwitchContent {
  const line = metrics.ascent + metrics.descent
  const iconSize = hasIcon ? Math.max(1, metrics.capHeight) : 0
  if (rect.w >= rect.h) {
    const group = (hasIcon ? iconSize + SWITCH_GAP : 0) + textWidth
    const left = rect.x + Math.max(0, Math.trunc((rect.w - group) / 2))
    const baseline = rect.y + Math.trunc((rect.h - line) / 2) + metrics.ascent
    return {
      icon: hasIcon ? { x: left, y: baseline - iconSize, w: iconSize, h: iconSize, r: 0 } : null,
      textX: hasIcon ? left + iconSize + SWITCH_GAP : left,
      baseline,
      beside: true,
    }
  }
  const block = (hasIcon ? iconSize + 6 : 0) + line
  const top = rect.y + Math.max(0, Math.trunc((rect.h - block) / 2))
  const baseline = top + (hasIcon ? iconSize + 6 : 0) + metrics.ascent
  return {
    icon: hasIcon ? { x: rect.x + Math.trunc((rect.w - iconSize) / 2), y: top, w: iconSize, h: iconSize, r: 0 } : null,
    textX: rect.x + Math.max(0, Math.trunc((rect.w - textWidth) / 2)),
    baseline,
    beside: false,
  }
}

/** The object's font, for whatever has to be laid out from it. */
export function switchFontMetrics(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): LevelFontMetrics {
  const font = fonts?.find((f) => f.id === obj.properties.fontId)
  return fontMetricsOf(font, 14)
}
