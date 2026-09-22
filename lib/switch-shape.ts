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

/**
 * The inset between the container and the buttons in it.
 *
 * Its comment used to read "Material's 2 dp between the buttons of a
 * connected group", which is a different measurement that this was not being
 * used for - the buttons tiled edge to edge until 2026-09-21. That one is
 * [SWITCH_BUTTON_GAP] below.
 */
export const SWITCH_PAD = 2

/**
 * Material 3's connected button group: 2 between the buttons, and 8 at the
 * corners where two of them face each other. Both are the spec's own numbers
 * (m3.material.io/components/button-groups/specs) rather than anything chosen
 * here.
 */
export const SWITCH_BUTTON_GAP = 2
export const SWITCH_INNER_CORNER = 8
/** Icon to label, and track to label. */
export const SWITCH_GAP = 8
/**
 * The knob's three sizes, as sixteenths of the track's height.
 *
 * Material's own, read off a 32 dp track: 16 while the state it stands for
 * does not mean "on", 24 while it does, 28 under a finger. Kept as ratios
 * rather than as those numbers, because our track follows the object
 * (switchTrack) and is not always 32.
 *
 * The small one is the whole point of the pair: a switch says what it is by
 * the SIZE of its knob as much as by where the knob sits, and until
 * 2026-09-22 ours said it only by colour (docs/2026-09-22-switch-look.md).
 */
export const SWITCH_KNOB_QUIET_16THS = 8
export const SWITCH_KNOB_ON_16THS = 12
export const SWITCH_KNOB_PRESSED_16THS = 14

/** The outline around a track that is not filled: Material's 2 dp, flat. */
export const SWITCH_TRACK_OUTLINE = 2

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
  /**
   * The radius of the right-hand end, where it differs from [r] - a button in
   * a connected group is round on the outside and barely rounded where it
   * faces its neighbour. Absent means both ends are [r].
   */
  rRight?: number
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

/**
 * What a ring on one button of a group encloses.
 *
 * A ring is its outer pill with the inside taken back, so whatever the ring
 * stands on has to be named: every sub-sample belongs to exactly one run, and a
 * run nobody claims shows the screen itself (paint-pills.ts). Three answers:
 *
 *   - the chosen button keeps its OWN colour inside the ring. It is still the
 *     reported state; the ring only says a different one has been asked for.
 *     Corrected on 2026-09-22 - it had been painting the container's surface
 *     inside a chosen button, which read as the selection having already moved.
 *   - any other button shows the container it sits in.
 *   - null where the container is only an outline (a 1-bit panel): there is
 *     nothing behind it, so the ring encloses the screen.
 *
 * Here rather than in the renderer because all three renderers need the same
 * answer - the designer's render-switch.ts, SwitchView.kt and
 * ColorScreenRenderer.cpp - and because it is the one thing about a ring the
 * golden recording can carry.
 */
export function switchRingFill(look: SwitchLook, chosen: boolean): string | null {
  if (chosen) return look.chosen
  return look.surfaceOutline ? null : look.surface
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
  const quiet = tint.framed ? ground : tint.track
  if (on) return { track: look.chosen, trackOutline: null, knob: look.onChosen, onKnob: look.chosen }
  // Not on: the track at half strength - the same mixture the bar's own
  // track takes - with the outline and the small knob in the colour itself.
  // Both in full, because the pair has to be told apart from the track they
  // sit on, and because the author set one colour and expects to see it
  // (2026-09-22; before that the track was a quarter strength and knob and
  // outline shared the half, which made the knob vanish the moment the two
  // were brought together).
  //
  // On a panel that cannot show the mixture, the track falls back to the
  // background and the outline carries the whole shape - which is what the
  // outline is for.
  return { track: quiet, trackOutline: color, knob: color, onKnob: onColorFor(color, colorDepth) }
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
  // Material 3's connected button group, which is what this is
  // (docs/2026-09-20-switch-look.md): the buttons stand 2 apart, the ends of
  // the group are fully round, and where two buttons face each other the
  // corner is small. Selecting one changes nothing about its neighbours.
  //
  // Each button deciding its own radius from its own box was the fault
  // reported on 2026-09-21: a container 92 wide and 48 tall is a pill
  // (radius 24) while each of its two buttons is about 43 by 43 and so, by
  // the same rule, a rounded square (radius 14) - a rectangle sitting inside
  // a pill, visibly squashed. Handing the button the container's radius
  // instead would be worse: at 43 by 43 it clamps to a circle. It is the
  // small inner corner that makes the round outer one safe.
  const outer = Math.max(0, box.r - SWITCH_PAD)
  const out: SwitchRect[] = []
  for (let i = 0; i < n; i++) {
    const from = innerX + Math.trunc((innerW * i) / n) + (i === 0 ? 0 : SWITCH_BUTTON_GAP)
    const to = innerX + Math.trunc((innerW * (i + 1)) / n)
    const w = Math.max(0, to - from)
    const inner = Math.min(SWITCH_INNER_CORNER, Math.trunc(innerH / 2))
    out.push({
      x: from,
      y: innerY,
      w,
      h: innerH,
      r: i === 0 ? outer : inner,
      rRight: i === n - 1 ? outer : inner,
    })
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

/**
 * The knob's circle, at slot `index`.
 *
 * Where it sits never changes: the slots are spaced by the ON size, so the
 * knob does not jump sideways when a state changes - only its diameter does.
 *
 * `on` is whether the state being shown counts as "on" (switchStateIsOn),
 * not whether the switch is at its last slot: a three-position switch can
 * have two states that mean on, or none, and each one says so for itself.
 */
export function switchKnob(
  obj: ScreenObject,
  count: number,
  index: number,
  state: { on?: boolean; pressed?: boolean } = {},
): { cx: number; cy: number; r: number } {
  const track = switchTrack(obj, count)
  const pad = Math.max(1, Math.trunc(track.h / 8))
  const step = Math.max(2, track.h - 2 * pad)
  const slot = Math.max(0, Math.min(Math.max(1, count) - 1, index))
  const sixteenths = state.pressed
    ? SWITCH_KNOB_PRESSED_16THS
    : state.on
      ? SWITCH_KNOB_ON_16THS
      : SWITCH_KNOB_QUIET_16THS
  const diameter = Math.max(2, Math.trunc((track.h * sixteenths) / 16))
  return {
    cx: track.x + pad + slot * step + Math.trunc(step / 2),
    cy: track.y + Math.trunc(track.h / 2),
    r: Math.trunc(diameter / 2),
  }
}

/**
 * Where a knob's state icon goes, given that knob's circle.
 *
 * Three fifths of the diameter, centred. Not the font's cap height, which is
 * what every other icon in this control is sized by (`switchContent`): a knob
 * is round and its own size already says how big the picture inside it can
 * be, and it grows when the state turns on while the font does not.
 *
 * It has a name here because the same three fifths are written out in four
 * places - this renderer, ColorScreenRenderer.cpp, SwitchView.kt and the two
 * bakes - and on 2026-09-22 one of them was not: `exportSwitchStateIcon` baked
 * the firmware's bitmap at the cap height for both forms, so a 19x19 picture
 * was blitted into the 28x28 box the board reserved from the knob. It showed
 * up as 522 differing pixels in a conformance run, confined to exactly that
 * square, and nothing in the designer could see it - both sides were right
 * about their own rule.
 */
export function switchKnobIcon(knob: { cx: number; cy: number; r: number }): SwitchRect {
  const size = Math.max(1, Math.trunc((knob.r * 2 * 3) / 5))
  return { x: knob.cx - Math.trunc(size / 2), y: knob.cy - Math.trunc(size / 2), w: size, h: size, r: 0 }
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
