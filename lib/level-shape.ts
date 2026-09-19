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
 * How far the track sits inside the bar's box, across it. The rest of that
 * space is where the handle overhangs into, so a settable bar never draws
 * outside its own rectangle - which matters for more than tidiness: the 4.3B
 * repaints by region (markerTopicBounds), and an object that paints past its
 * bounds leaves crumbs behind when only its region is redrawn.
 *
 * Material's own proportion, kept as a proportion: its track is 16 dp inside a
 * 44 dp row, so the margin is 7/22 of the row. On a 44 px bar this lands on 16
 * exactly, which is the picture the user approved on glass.
 *
 * It was a fifth of the object clamped to 4..10 until 2026-09-19. That clamp
 * made a tall bar a fat lozenge - at 72 px the track came out 52 px thick and
 * the handle was lost in it - because it kept the *margin* constant instead of
 * the ratio.
 */
export function levelPadding(across: number): number {
  const pad = Math.trunc((across * 7) / 22)
  return pad < 2 ? 2 : pad
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

/** The slot between the header's parts, and between the bar and its number. */
export const LEVEL_GAP = 6

/**
 * The size the object's own text is drawn at. Every measurement on the header
 * line is a multiple of it, so the whole layout follows from one number the
 * author already sets.
 */
export function levelFontSize(obj: ScreenObject): number {
  const size = Math.trunc(Number(obj.properties.fontSize))
  return Number.isFinite(size) && size > 0 ? size : 14
}

/** The name shown on the header line, or "" when the object has none. */
export function levelName(obj: ScreenObject): string {
  const label = obj.properties.label
  return typeof label === "string" ? label.trim() : ""
}

/** Whether an icon sits at the head of the line. */
export function levelHasIcon(obj: ScreenObject): boolean {
  const id = obj.properties.iconAssetId
  return typeof id === "string" && id.trim() !== ""
}

/** Whether a number is shown at all. */
export function levelShowsNumber(obj: ScreenObject): boolean {
  return ((obj.properties.displayValue as string) || "value") !== "none"
}

/**
 * Whether the object can ever show a *second*, measured number beside the
 * commanded one - which is to say, whether it has a commanded value at all.
 *
 * Asked of the object rather than of the moment: the room is reserved whether
 * or not the two currently differ, so the header does not re-flow and the name
 * does not jump every time a command goes out.
 */
export function levelShowsSub(obj: ScreenObject): boolean {
  if (!levelShowsNumber(obj)) return false
  const write = obj.properties.writeTopic
  const setpoint = obj.properties.setpointTopic
  return (
    (typeof write === "string" && write.trim() !== "") || (typeof setpoint === "string" && setpoint.trim() !== "")
  )
}

/**
 * One digit, as all four renderers agree to guess it: 0.62 of the font size.
 *
 * Deliberately a guess rather than a measurement. The reserve has to be known
 * where no font is at hand - `levelPercentFromPoint` turns a finger into a
 * value and would otherwise have to load a BDF to know where the bar ends -
 * and it has to be the same integer in TypeScript, C++ and Kotlin. Text is
 * clipped to its box, so a font wider than the guess is cut off rather than
 * running into the bar.
 */
export function levelDigitWidth(fontSize: number): number {
  const w = Math.trunc((fontSize * 62) / 100)
  return w < 1 ? 1 : w
}

/** One line of text, with the room above and below it. */
export function levelLineHeight(fontSize: number): number {
  return Math.trunc((fontSize * 3) / 2)
}

/** The smaller size the measured value is written in. */
export function levelSubFontSize(obj: ScreenObject): number {
  const small = Math.trunc((levelFontSize(obj) * 2) / 3)
  return small < 6 ? 6 : small
}

/**
 * How tall the header line is - 0 when there is neither a name nor an icon.
 *
 * It takes its room from the top of the object's own rectangle and the bar
 * gets the rest. The object does not grow by itself: the rectangle is what the
 * author drags, and one that silently changes size breaks the layout around it
 * (docs/2026-09-19-slider-look.md, decision 9). Half the object is the limit,
 * so a bar stays a bar even when the rectangle is far too short for both.
 */
export function levelHeaderHeight(obj: ScreenObject): number {
  if (!levelName(obj) && !levelHasIcon(obj)) return 0
  const wanted = levelLineHeight(levelFontSize(obj))
  const half = Math.trunc(Math.trunc(obj.height) / 2)
  return Math.max(0, Math.min(wanted, half))
}

/** The room the big number gets, across the object. Five digits, capped at 40 %. */
export function levelValueWidth(obj: ScreenObject): number {
  if (!levelShowsNumber(obj)) return 0
  const wanted = levelDigitWidth(levelFontSize(obj)) * 5
  const cap = Math.trunc((Math.trunc(obj.width) * 2) / 5)
  return Math.max(0, Math.min(wanted, cap))
}

/** The room the small measured number gets. Eight of its own digits ("ist 18,5"). */
export function levelSubWidth(obj: ScreenObject): number {
  if (!levelShowsSub(obj)) return 0
  const wanted = levelDigitWidth(levelSubFontSize(obj)) * 8
  const cap = Math.trunc((Math.trunc(obj.width) * 3) / 10)
  return Math.max(0, Math.min(wanted, cap))
}

/**
 * Everything the object's rectangle is divided into: a header line carrying the
 * icon, the name and the numbers, and underneath it the bar.
 *
 * All of it follows from the object alone - no font has to be loaded and no
 * text measured - which is what lets `levelPercentFromPoint` know where the bar
 * ends and what lets the firmware arrive at the same integers.
 *
 * A bar with no name, no icon and no number is the same shape it always was;
 * that case must not move, because moving it would change where every existing
 * calibration's percentage lands.
 */
export interface LevelLayout {
  /** The whole header line, or null when there is none. */
  header: LevelRect | null
  icon: LevelRect | null
  /** Left-aligned box for the name. */
  name: LevelRect | null
  /** Right-aligned box for the commanded number. */
  value: LevelRect | null
  /** Right-aligned box for the measured number, to the left of `value`. */
  sub: LevelRect | null
  /** What is left over for the bar, before the track is inset inside it. */
  bar: LevelRect
  /** The track itself. */
  track: LevelRect
}

export function levelLayout(obj: ScreenObject): LevelLayout {
  const x = Math.trunc(obj.x)
  const y = Math.trunc(obj.y)
  const w = Math.trunc(obj.width)
  const h = Math.trunc(obj.height)
  const vertical = levelIsVertical(obj)
  const headerH = levelHeaderHeight(obj)

  let header: LevelRect | null = null
  let icon: LevelRect | null = null
  let name: LevelRect | null = null
  let value: LevelRect | null = null
  let sub: LevelRect | null = null
  let barX = x
  let barY = y
  let barW = w
  let barH = h

  if (headerH > 0) {
    header = { x, y, w, h: headerH, r: 0 }
    let left = x
    if (levelHasIcon(obj)) {
      // Square, and never more than a quarter of the line: an icon is a mark
      // beside the name, not a picture.
      const size = Math.max(1, Math.min(headerH, Math.trunc(w / 4)))
      icon = { x: left, y: y + Math.trunc((headerH - size) / 2), w: size, h: size, r: 0 }
      left = icon.x + size + LEVEL_GAP
    }
    let right = x + w
    const valueW = levelValueWidth(obj)
    if (valueW > 0) {
      value = { x: right - valueW, y, w: valueW, h: headerH, r: 0 }
      right = value.x
      const subW = levelSubWidth(obj)
      if (subW > 0) {
        sub = { x: right - LEVEL_GAP - subW, y, w: subW, h: headerH, r: 0 }
        right = sub.x
      }
    }
    const nameW = right - LEVEL_GAP - left
    if (levelName(obj) && nameW > 0) name = { x: left, y, w: nameW, h: headerH, r: 0 }
    barY = y + headerH
    barH = h - headerH
  } else if (levelShowsNumber(obj)) {
    // No header: the number goes at the far end of the bar's own axis. Right
    // for a horizontal bar whichever way it fills, so that a column of bars
    // lines up regardless of their directions.
    if (vertical) {
      const lineH = Math.min(levelLineHeight(levelFontSize(obj)), Math.trunc((h * 2) / 5))
      value = { x, y: y + h - lineH, w, h: lineH, r: 0 }
      barH = h - lineH - LEVEL_GAP
    } else {
      const valueW = levelValueWidth(obj)
      value = { x: x + w - valueW, y, w: valueW, h, r: 0 }
      barW = w - valueW - LEVEL_GAP
    }
  }

  const bar: LevelRect = { x: barX, y: barY, w: Math.max(0, barW), h: Math.max(0, barH), r: 0 }
  return { header, icon, name, value, sub, bar, track: trackInside(bar, vertical) }
}

/** The track's own box: inset by 4 along the bar, and by the padding across it. */
export function levelTrackRect(obj: ScreenObject): LevelRect {
  return levelLayout(obj).track
}

function trackInside(bar: LevelRect, vertical: boolean): LevelRect {
  const across = vertical ? bar.w : bar.h
  const padAcross = levelPadding(across)
  const padAlong = LEVEL_PADDING_ALONG
  const x = bar.x + (vertical ? padAcross : padAlong)
  const y = bar.y + (vertical ? padAlong : padAcross)
  const w = bar.w - 2 * (vertical ? padAcross : padAlong)
  const h = bar.h - 2 * (vertical ? padAlong : padAcross)
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
  // 4 dp on a 44 dp row.
  const w = Math.trunc(across / 11)
  return w < 3 ? 3 : w
}

/** The slot of background left free on each side of the handle. */
export function levelHandleGap(across: number): number {
  // 6 dp on a 44 dp row.
  const gap = Math.trunc((across * 3) / 22)
  return gap < 2 ? 2 : gap
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
  // The bar's own box, not the object's: with a header line above, the handle
  // overhangs the track but stops short of the name.
  const { bar, track } = levelLayout(obj)
  const across = vertical ? bar.w : bar.h
  // Never more than a third of the run it slides along. Without that, a bar
  // far wider than it is long - a 200x40 object declared bottom-to-top - gets a
  // handle longer than its own track, and the clamp below has no room to work
  // in (found by the vertical case on 2026-09-19).
  const span = vertical ? track.h : track.w
  const thickness = Math.max(2, Math.min(levelHandleWidth(across), Math.trunc(span / 3)))
  const edge = levelEdgeFor(track, vertical, levelFillsFromEnd(obj), percent)
  const r = Math.trunc(thickness / 2)

  if (vertical) {
    const y = clamp(edge - Math.trunc(thickness / 2), track.y, track.y + track.h - thickness)
    return { x: bar.x, y, w: bar.w, h: thickness, r }
  }
  const x = clamp(edge - Math.trunc(thickness / 2), track.x, track.x + track.w - thickness)
  return { x, y: bar.y, w: thickness, h: bar.h, r }
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
  const { bar, track } = levelLayout(obj)
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

  const across = vertical ? bar.w : bar.h
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
