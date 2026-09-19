/**
 * The geometry of a level indicator, as whole pixels.
 *
 * One place, because four renderers have to agree on it to the pixel - the
 * designer, the firmware (ColorScreenRenderer.cpp), the Android app and the
 * reference page - and because the shape is now more than a rectangle:
 * pill-ended track, a tinted unfilled part, a handle with a gap around it.
 * See docs/2026-09-19-slider-look.md for why it looks like this.
 *
 * Integer arithmetic only, and `Math.trunc` rather than `Math.round` wherever
 * a fraction appears, because C++ integer division truncates toward zero and
 * that is the side that cannot be changed.
 */

import type { ScreenObject } from "@/components/project-editor"

/** A rectangle to fill, with the corner radius it is drawn with. */
export interface LevelRect {
  x: number
  y: number
  w: number
  h: number
  /** Corner radius; `fillRoundRect` clamps it to half the shorter side itself. */
  r: number
}

/**
 * One run of track, which colour it takes, and which of its two ends is the
 * track's own outer end.
 *
 * Only the outer ends are rounded. An inner end - where the fill meets the
 * tinted part, or where the handle's gap cuts the run - is square, which is
 * Material's 2 dp inner corner taken to its limit. Rounding both ends made two
 * runs curve away from each other and left a notch in the middle of a tank
 * gauge that looked like a handle nobody could grab (seen 2026-09-19 in the
 * first render).
 */
export interface LevelSegment extends LevelRect {
  role: "fill" | "track"
  /** The low-coordinate end (left, or top) is the track's own end. */
  roundStart: boolean
  /** The high-coordinate end (right, or bottom) is the track's own end. */
  roundEnd: boolean
}

/**
 * How far the track sits inside the object, across the bar. The rest of that
 * space is where the handle overhangs into, so a settable bar never draws
 * outside its own rectangle - which matters for more than tidiness: the 4.3B
 * repaints by region (markerTopicBounds), and an object that paints past its
 * bounds leaves crumbs behind when only its region is redrawn.
 *
 * A fifth of the object, never less than 4 (the padding this bar has always
 * had) and never more than 10, so a tall bar does not turn into a thin line
 * inside a wide margin.
 */
export function levelPadding(across: number): number {
  const fifth = Math.trunc(across / 5)
  if (fifth < 4) return 4
  if (fifth > 10) return 10
  return fifth
}

/** True for a bar whose long axis runs up and down. */
export function levelIsVertical(obj: ScreenObject): boolean {
  const direction = (obj.properties.barDirection as string) || "left-to-right"
  return direction === "bottom-to-top" || direction === "top-to-bottom"
}

/** True when the fill grows from the right or from the bottom. */
export function levelFillsFromEnd(obj: ScreenObject): boolean {
  const direction = (obj.properties.barDirection as string) || "left-to-right"
  return direction === "right-to-left" || direction === "bottom-to-top"
}

/**
 * The padding along the bar's own direction. Deliberately still the 4 this bar
 * has always had: it is what `levelPercentFromPoint` inverts, so widening it
 * would move every value's position and silently change what every existing
 * calibration means. Only the cross direction grows, to make room for the
 * handle's overhang.
 */
export const LEVEL_PADDING_ALONG = 4

/** The track's own box: inset by 4 along the bar, and by the padding across it. */
export function levelTrackRect(obj: ScreenObject): LevelRect {
  const vertical = levelIsVertical(obj)
  const across = Math.trunc(vertical ? obj.width : obj.height)
  const padAcross = levelPadding(across)
  const padAlong = LEVEL_PADDING_ALONG
  const x = Math.trunc(obj.x) + (vertical ? padAcross : padAlong)
  const y = Math.trunc(obj.y) + (vertical ? padAlong : padAcross)
  const w = Math.trunc(obj.width) - 2 * (vertical ? padAcross : padAlong)
  const h = Math.trunc(obj.height) - 2 * (vertical ? padAlong : padAcross)
  // A pill: the radius is half the short side. fillRoundRect clamps it again
  // for a run shorter than it is thick, which is what makes a nearly empty
  // track end in a half-circle rather than a wedge.
  const r = Math.trunc(Math.min(w, h) / 2)
  return { x, y, w, h, r }
}

/**
 * How wide the handle is, and how much room is left around it.
 *
 * Both follow from the object rather than from a property. A number the author
 * has to pick is a number that will be wrong on the next screen size, and
 * Material's own ratio (a 4dp handle on a 16dp track) is a ratio, not a
 * measurement.
 */
export function levelHandleWidth(across: number): number {
  const seventh = Math.trunc(across / 7)
  if (seventh < 4) return 4
  if (seventh > 10) return 10
  return seventh
}

/** The slot of background left free on each side of the handle. */
export function levelHandleGap(across: number): number {
  const gap = Math.trunc(across / 7)
  if (gap < 3) return 3
  if (gap > 8) return 8
  return gap
}

/**
 * Where along the track a percentage falls, in pixels from the track's start -
 * the one place the value-to-position mapping lives. `levelPercentFromPoint`
 * inverts exactly this, so a finger and the picture cannot disagree.
 */
export function levelEdgeFor(track: LevelRect, vertical: boolean, fromEnd: boolean, percent: number): number {
  const span = vertical ? track.h : track.w
  const along = Math.trunc((span * percent) / 100)
  if (vertical) return fromEnd ? track.y + track.h - along : track.y + along
  return fromEnd ? track.x + track.w - along : track.x + along
}

/**
 * The handle: a pill across the whole object, standing out of the track on
 * both sides. The overhang is what says "a thing lying on top" - and on a
 * 1-bit panel it is the only thing that can, since there is no third colour
 * to tell a marker from a fill (lib/control-palette.ts).
 *
 * Clamped to stay inside the track's run rather than the track being inset to
 * make room: insetting would move every value's position and change what every
 * existing calibration means. The cost is that at 0 % and 100 % the handle's
 * centre is off by half its width.
 */
export function levelHandleRect(obj: ScreenObject, percent: number): LevelRect {
  const vertical = levelIsVertical(obj)
  const across = Math.trunc(vertical ? obj.width : obj.height)
  const track = levelTrackRect(obj)
  const thickness = levelHandleWidth(across)
  const edge = levelEdgeFor(track, vertical, levelFillsFromEnd(obj), percent)
  const r = Math.trunc(thickness / 2)

  if (vertical) {
    const y = clamp(edge - Math.trunc(thickness / 2), track.y, track.y + track.h - thickness)
    return { x: Math.trunc(obj.x), y, w: Math.trunc(obj.width), h: thickness, r }
  }
  const x = clamp(edge - Math.trunc(thickness / 2), track.x, track.x + track.w - thickness)
  return { x, y: Math.trunc(obj.y), w: thickness, h: Math.trunc(obj.height), r }
}

/**
 * The track, cut into the runs that actually get painted: filled up to the
 * value, tinted beyond it, and nothing at all where the handle and its gap
 * sit. Every run is drawn as a pill, including the ends that face the gap -
 * which is what makes the handle read as separate rather than as a notch.
 *
 * Runs of zero or negative length are dropped, so a bar at 0 % simply has no
 * filled run and a handle at the very end leaves no tail behind it.
 */
export function levelSegments(obj: ScreenObject, fillPercent: number, handle: LevelRect | null): LevelSegment[] {
  const vertical = levelIsVertical(obj)
  const track = levelTrackRect(obj)
  const fromEnd = levelFillsFromEnd(obj)
  const edge = levelEdgeFor(track, vertical, fromEnd, fillPercent)

  const start = vertical ? track.y : track.x
  const end = start + (vertical ? track.h : track.w)
  // Which side of `edge` is filled depends on which end the bar grows from.
  const runs: { a: number; b: number; role: "fill" | "track" }[] = fromEnd
    ? [
        { a: start, b: edge, role: "track" },
        { a: edge, b: end, role: "fill" },
      ]
    : [
        { a: start, b: edge, role: "fill" },
        { a: edge, b: end, role: "track" },
      ]

  const across = Math.trunc(vertical ? obj.width : obj.height)
  const gap = levelHandleGap(across)
  const cutA = handle ? (vertical ? handle.y : handle.x) - gap : 0
  const cutB = handle ? (vertical ? handle.y + handle.h : handle.x + handle.w) + gap : 0

  const out: LevelSegment[] = []
  const push = (a: number, b: number, role: "fill" | "track") => {
    if (b - a <= 0) return
    const ends = { roundStart: a === start, roundEnd: b === end }
    out.push(
      vertical
        ? { x: track.x, y: a, w: track.w, h: b - a, r: track.r, role, ...ends }
        : { x: a, y: track.y, w: b - a, h: track.h, r: track.r, role, ...ends },
    )
  }

  for (const run of runs) {
    if (!handle || cutB <= run.a || cutA >= run.b) {
      push(run.a, run.b, run.role)
      continue
    }
    push(run.a, Math.min(run.b, cutA), run.role)
    push(Math.max(run.a, cutB), run.b, run.role)
  }
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}
