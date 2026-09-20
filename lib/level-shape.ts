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

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"

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
 * How thick the track is, across the bar, in pixels: the author's
 * `barThickness`, and Material's 16 when there is none.
 *
 * A number the author sets, since 2026-09-19. Until then it followed the
 * object - 8/22 of its size across - on the argument that a number the author
 * has to pick is wrong on the next screen size. That argument does not hold (a
 * project is bound to one device), and the rule it bought was worse: a vertical
 * tank made wide enough for "Wassertank" to be read above it came out with a
 * 70 px track. The user: "wenn wir ... ihn so breit machen, dass man das wort
 * wassertank lesen kann, dann wird der balken brutal breit".
 */
export const LEVEL_DEFAULT_THICKNESS = 16

export function levelThickness(obj: ScreenObject): number {
  const t = Math.trunc(Number(obj.properties.barThickness))
  return Number.isFinite(t) && t > 0 ? t : LEVEL_DEFAULT_THICKNESS
}

/**
 * Whether the object can ever draw a handle: a finger can set it, or it reports
 * a target. The same two things the renderer draws one for.
 */
export function levelHasHandle(obj: ScreenObject): boolean {
  const write = obj.properties.writeTopic
  const setpoint = obj.properties.setpointTopic
  return (
    (typeof write === "string" && write.trim() !== "") || (typeof setpoint === "string" && setpoint.trim() !== "")
  )
}

/** How long the handle is, across the bar: Material's 44 on its 16, kept as that ratio. */
export function levelHandleLength(thickness: number): number {
  return Math.trunc((thickness * 11) / 4)
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
 * The empty row between the header line and the bar. The handle overhangs the
 * track right up to the bar's top edge, and with the header ending where the bar
 * began, a letter with a descender stood on the handle - the user: "der marker
 * berührt den buchstaben. es soll 1px abstand haben" (2026-09-19).
 */
export const LEVEL_HEADER_GAP = 1

/**
 * The object's `fontSize`, for an object that has no project font to take its
 * measure from. Only a fallback: with a font chosen, every measurement comes
 * from that font (levelFontMetrics). The font picker does not touch `fontSize`,
 * so a project switched to helvR24 still says 12 here - which is how a header
 * came to be 18 px tall for a 35 px line and cut every letter off top and
 * bottom (2026-09-19).
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
 * Only on the header line; a bar without one has a single number column.
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
 * The vertical measure of the object's font: everything the header line is
 * built from.
 *
 * Taken from the font itself - the project font `fontId` names - and not from
 * the object's `fontSize`, which nothing keeps in step with the font. For a BDF
 * font that is the three numbers the font file states: FONT_ASCENT and
 * FONT_DESCENT (also in the project's own font list as `ascent`/`descent`), and
 * CAP_HEIGHT, which in every font shipped is exactly the height of the capital
 * H's bitmap (helvR08..24: 8, 12, 19, 25), so a firmware reading glyph boxes
 * rather than properties arrives at the same number.
 */
export interface LevelFontMetrics {
  /** Baseline to the top of the line. */
  ascent: number
  /** Baseline to the bottom of the line - where descenders and brackets end. */
  descent: number
  /** How tall a capital stands on the baseline. The icon is this tall. */
  capHeight: number
}

export function levelFontMetrics(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): LevelFontMetrics {
  const font = fonts?.find((f) => f.id === obj.properties.fontId)
  return fontMetricsOf(font, levelFontSize(obj))
}

/** The same, for a font already in hand; `fallbackSize` when there is none. */
export function fontMetricsOf(font: ProjectFont | undefined, fallbackSize: number): LevelFontMetrics {
  if (!font) {
    // No project font: the canvas draws in a browser font at `fontSize`, whose
    // line is about the size and whose capitals are about 0.7 of it.
    const ascent = Math.trunc((fallbackSize * 4) / 5)
    return { ascent, descent: Math.max(1, fallbackSize - ascent), capHeight: Math.trunc((fallbackSize * 7) / 10) }
  }
  if (font.format === "ttf") {
    // A TTF records how far its capitals reach above the baseline, measured when
    // it was added (add-ttf-font-dialog.tsx) - the same figure a label uses to
    // place its baseline, so the two agree on where a TTF's text stands.
    const size = Math.max(1, Math.trunc(font.size))
    const ascent = Math.max(1, Math.round(font.baselineOffset ?? (size * 4) / 5))
    return { ascent, descent: Math.max(1, size - ascent), capHeight: ascent }
  }
  const size = Math.max(1, Math.trunc(font.size))
  const ascent = font.ascent ?? bdfProperty(font, "FONT_ASCENT") ?? Math.trunc((size * 4) / 5)
  const descent = font.descent ?? bdfProperty(font, "FONT_DESCENT") ?? Math.max(1, size - ascent)
  const capHeight = bdfProperty(font, "CAP_HEIGHT") ?? ascent
  return { ascent, descent, capHeight: Math.min(capHeight, ascent) }
}

const bdfPropertyCache = new Map<string, number | null>()

/** One integer property from a BDF font's header, or null when it has none. */
function bdfProperty(font: ProjectFont, name: string): number | null {
  if (!font.data) return null
  const key = `${font.id}:${font.data.length}:${name}`
  const cached = bdfPropertyCache.get(key)
  if (cached !== undefined) return cached
  // Properties come before the first glyph, so the search stops there rather
  // than running through a hundred kilobytes of bitmaps.
  const end = font.data.indexOf("STARTCHAR")
  const head = end > 0 ? font.data.slice(0, end) : font.data
  const match = new RegExp(`^${name}\\s+(-?\\d+)`, "m").exec(head)
  const value = match ? Number.parseInt(match[1], 10) : null
  bdfPropertyCache.set(key, value)
  return value
}

/** One line of the font: ascent plus descent. */
export function levelLineHeight(metrics: LevelFontMetrics): number {
  return metrics.ascent + metrics.descent
}

/**
 * One digit, as all four renderers agree to guess it: 0.62 of the line height.
 *
 * A guess rather than a measurement, and only where it decides where the bar
 * ends - the number column beside a bar with no header, which
 * `levelPercentFromPoint` has to know about to turn a finger into a value. On
 * the header line nothing is guessed: the numbers are measured there, because
 * nothing below the line depends on how wide they are.
 *
 * Taken from the line height, which errs on the side of room: 21 against
 * helvR24's real 18, 7 against helvR08's 6.
 */
export function levelDigitWidth(lineHeight: number): number {
  const w = Math.trunc((lineHeight * 62) / 100)
  return w < 1 ? 1 : w
}

/**
 * How tall the header line is - 0 when there is neither a name nor an icon.
 *
 * Exactly one line of the font, ascent plus descent, so a letter is never cut
 * off at either end. It takes its room from the top of the object's own
 * rectangle and the bar gets the rest, one empty row below it. The object does
 * not grow by itself: the rectangle is what the author drags, and one that
 * silently changes size breaks the layout around it
 * (docs/2026-09-19-slider-look.md, decision 9). An object too short for the
 * font leaves a thin bar - which is the honest picture of an object too short.
 */
export function levelHeaderHeight(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): number {
  if (!levelName(obj) && !levelHasIcon(obj)) return 0
  const wanted = levelLineHeight(levelFontMetrics(obj, fonts))
  return Math.max(0, Math.min(wanted, Math.trunc(obj.height)))
}

/** The number column beside a bar with no header. Five digits, capped at 40 %. */
export function levelValueWidth(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): number {
  if (!levelShowsNumber(obj)) return 0
  const wanted = levelDigitWidth(levelLineHeight(levelFontMetrics(obj, fonts))) * 5
  const cap = Math.trunc((Math.trunc(obj.width) * 2) / 5)
  return Math.max(0, Math.min(wanted, cap))
}

/**
 * Everything the object's rectangle is divided into: a header line carrying the
 * icon, the name and the numbers, and underneath it the bar.
 *
 * The bar's part follows from the object and its font's vertical measure alone
 * - no text is measured - which is what lets `levelPercentFromPoint` know where
 * the bar ends and what lets the firmware arrive at the same integers. The
 * header's text is placed by measured width when it is drawn: the numbers
 * against the right edge, the name from the left edge into what is left.
 *
 * A bar with no name, no icon and no number is the same shape it always was;
 * that case must not move, because moving it would change where every existing
 * calibration's percentage lands.
 */
export interface LevelLayout {
  /** The whole header line, or null when there is none. */
  header: LevelRect | null
  /**
   * The row every piece of text stands on - name and numbers alike, whatever
   * size they are in - and the icon's foot. In the header, or in the number's
   * column when there is no header.
   */
  baseline: number
  /** Square, a capital's height, standing on the baseline. */
  icon: LevelRect | null
  /**
   * The header's text run: from after the icon to the object's right edge. The
   * numbers take its right end at their measured width and the name the rest.
   */
  text: LevelRect | null
  /** The number's own column beside a bar that has no header. */
  value: LevelRect | null
  /** What is left over for the bar once the header or the number has its room. */
  bar: LevelRect
  /**
   * The band of `bar` the bar actually takes, across it: the handle's length
   * where there can be a handle, the track's thickness where there cannot.
   * Centred across a vertical bar; under a header a horizontal one sits at the
   * top, one row below the text, and without one it is centred. Whatever `bar`
   * has beyond it stays empty - the object is as big as the author made it, the
   * bar as thick as the author said.
   */
  slot: LevelRect
  /** The track itself. */
  track: LevelRect
}

export function levelLayout(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): LevelLayout {
  const x = Math.trunc(obj.x)
  const y = Math.trunc(obj.y)
  const w = Math.trunc(obj.width)
  const h = Math.trunc(obj.height)
  const vertical = levelIsVertical(obj)
  const metrics = levelFontMetrics(obj, fonts)
  const lineH = levelLineHeight(metrics)
  const headerH = levelHeaderHeight(obj, fonts)

  let header: LevelRect | null = null
  let baseline = y + metrics.ascent
  let icon: LevelRect | null = null
  let text: LevelRect | null = null
  let value: LevelRect | null = null
  let barX = x
  let barY = y
  let barW = w
  let barH = h

  if (headerH > 0) {
    header = { x, y, w, h: headerH, r: 0 }
    let left = x
    if (levelHasIcon(obj)) {
      // As tall as a capital and standing on the same baseline, so it reads as
      // a letter of the name rather than a picture beside it. A quarter of the
      // width is only a guard for an object far too narrow for its font.
      const size = Math.max(1, Math.min(metrics.capHeight, Math.trunc(w / 4)))
      icon = { x: left, y: baseline - size, w: size, h: size, r: 0 }
      left = icon.x + size + LEVEL_GAP
    }
    if (x + w - left > 0) text = { x: left, y, w: x + w - left, h: headerH, r: 0 }
    barY = y + headerH + LEVEL_HEADER_GAP
    barH = h - headerH - LEVEL_HEADER_GAP
  } else if (levelShowsNumber(obj)) {
    // No header: the number goes at the far end of the bar's own axis. Right
    // for a horizontal bar whichever way it fills, so that a column of bars
    // lines up regardless of their directions.
    if (vertical) {
      const rowH = Math.min(lineH, Math.trunc((h * 2) / 5))
      value = { x, y: y + h - rowH, w, h: rowH, r: 0 }
      barH = h - rowH - LEVEL_GAP
    } else {
      const valueW = levelValueWidth(obj, fonts)
      value = { x: x + w - valueW, y, w: valueW, h, r: 0 }
      barW = w - valueW - LEVEL_GAP
    }
    // The line centred in its column.
    baseline = value.y + Math.trunc((value.h - lineH) / 2) + metrics.ascent
  }

  const bar: LevelRect = { x: barX, y: barY, w: Math.max(0, barW), h: Math.max(0, barH), r: 0 }
  const thickness = levelThickness(obj)
  const across = vertical ? bar.w : bar.h
  const wanted = levelHasHandle(obj) ? levelHandleLength(thickness) : thickness
  const size = Math.max(0, Math.min(wanted, across))
  const offset = !vertical && header ? 0 : Math.trunc((across - size) / 2)
  const slot: LevelRect = vertical
    ? { x: bar.x + offset, y: bar.y, w: size, h: bar.h, r: 0 }
    : { x: bar.x, y: bar.y + offset, w: bar.w, h: size, r: 0 }
  return { header, baseline, icon, text, value, bar, slot, track: trackInside(slot, vertical, thickness) }
}

/** The track's own box: inset by 4 along the bar, and centred in the slot across it. */
export function levelTrackRect(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): LevelRect {
  return levelLayout(obj, fonts).track
}

function trackInside(slot: LevelRect, vertical: boolean, thickness: number): LevelRect {
  const across = vertical ? slot.w : slot.h
  const t = Math.min(thickness, across)
  const padAcross = Math.trunc((across - t) / 2)
  const padAlong = LEVEL_PADDING_ALONG
  const x = slot.x + (vertical ? padAcross : padAlong)
  const y = slot.y + (vertical ? padAlong : padAcross)
  const w = vertical ? t : slot.w - 2 * padAlong
  const h = vertical ? slot.h - 2 * padAlong : t
  // A pill: the radius is half the short side. fillRoundRect clamps it again
  // for a run shorter than it is thick, which is what makes a nearly empty
  // track end in a half-circle rather than a wedge.
  const r = Math.trunc(Math.min(w, h) / 2)
  return { x, y, w, h, r }
}

/**
 * How wide the handle is, and how much room is left around it - both from the
 * handle's length across the bar, which follows from the track's thickness
 * (levelHandleLength): Material's 4 and 6 on its 44.
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
 * The handle: a pill across the slot, standing out of the track on both
 * sides. The overhang is what says "a thing lying on top" - and on a
 * 1-bit panel it is the only thing that can, since there is no third colour
 * to tell a marker from a fill (lib/control-palette.ts).
 *
 * Clamped to stay inside the track's run rather than the track being inset to
 * make room: insetting would move every value's position and change what every
 * existing calibration means. The cost is that at 0 % and 100 % the handle's
 * centre is off by half its width.
 */
export function levelHandleRect(
  obj: ScreenObject,
  percent: number,
  fonts?: readonly ProjectFont[] | null,
): LevelRect {
  const vertical = levelIsVertical(obj)
  // Across the slot, not the object: the handle is as long as the thickness
  // says, whatever room the object has around it.
  const { slot, track } = levelLayout(obj, fonts)
  const across = vertical ? slot.w : slot.h
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
    return { x: slot.x, y, w: slot.w, h: thickness, r }
  }
  const x = clamp(edge - Math.trunc(thickness / 2), track.x, track.x + track.w - thickness)
  return { x, y: slot.y, w: thickness, h: slot.h, r }
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
export function levelSegments(
  obj: ScreenObject,
  fillPercent: number,
  handle: LevelRect | null,
  fonts?: readonly ProjectFont[] | null,
): LevelSegment[] {
  const vertical = levelIsVertical(obj)
  const { slot, track } = levelLayout(obj, fonts)
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

  const across = vertical ? slot.w : slot.h
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

/** One colour as three whole channels, or null for anything that is not a hex colour. */
function levelChannels(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)]
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(c)) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  }
  return null
}

function levelHex(channels: [number, number, number]): string {
  return "#" + channels.map((v) => v.toString(16).padStart(2, "0")).join("")
}

/**
 * What the unfilled part of the track looks like, worked out from the two
 * colours the author already has: the bar's colour and the screen's background.
 *
 * The track is halfway between them, one channel at a time:
 *
 *     track = background + trunc((fill - background) / 2)
 *
 * `trunc` rather than `round` because C++'s integer division truncates toward
 * zero and that is the side that cannot be changed - and toward zero of the
 * *difference* is toward the background, which is the direction the author
 * asked for ("bei Rundungen immer Richtung Hintergrund"). The depth's own
 * quantiser runs on the result, so on a 1-bit panel black on white comes out
 * at #808080, whose red nibble is 8 and which therefore lands on white; white
 * on black comes out at #7f7f7f and lands on black. Either way it is the
 * background, as asked. Both inputs are quantised first, so what is averaged is
 * what the panel can actually show.
 *
 * `framed` says the track came out the same as the background - which is the
 * whole 1-bit case, and any pair of colours too close to tell apart. A track
 * you cannot see is not a track, so it gets an outline in the bar's colour
 * (`levelFrameInner`) instead of a body.
 *
 * Nothing about the bar's own box is set any more: no background, no border,
 * no track colour. Docs: docs/2026-09-19-slider-look.md, decision 12.
 */
export function levelTrackLook(
  fillColor: string,
  backgroundColor: string,
  colorDepth: string | undefined,
): { track: string; framed: boolean } {
  const fill = applyColorDepth(fillColor, colorDepth)
  const background = applyColorDepth(backgroundColor, colorDepth)
  const f = levelChannels(fill)
  const b = levelChannels(background)
  // A colour that cannot be read is not guessed at: the track becomes the
  // background, which puts up the outline and leaves the bar visible.
  if (!f || !b) return { track: background, framed: true }
  const mixed: [number, number, number] = [
    b[0] + Math.trunc((f[0] - b[0]) / 2),
    b[1] + Math.trunc((f[1] - b[1]) / 2),
    b[2] + Math.trunc((f[2] - b[2]) / 2),
  ]
  const track = applyColorDepth(levelHex(mixed), colorDepth)
  const t = levelChannels(track)
  return { track, framed: !!t && t[0] === b[0] && t[1] === b[1] && t[2] === b[2] }
}

/**
 * The inside of a framed run of track: the run itself, taken in by one pixel.
 *
 * Across the bar on both sides, and along it only at an end that is the track's
 * own (a round one). At an end that was cut - by the handle's gap, or where the
 * fill takes over - the frame is left open, so it is one path that stops
 * straight where the handle begins rather than a string of small pills that
 * each close themselves with a rounded cap. That is what looked wrong: the
 * frame was drawn per run and behind it, and every run ended in a cap.
 *
 * The frame is the run's own outer pixel, not a ring drawn around it, so the
 * fill and the frame have the same outer edge and do not step where they meet.
 * Null when the run is too short or too thin to have an inside.
 */
export function levelFrameInner(seg: LevelSegment, vertical: boolean): LevelSegment | null {
  const a0 = seg.roundStart ? 1 : 0
  const a1 = seg.roundEnd ? 1 : 0
  const inner: LevelSegment = vertical
    ? { ...seg, x: seg.x + 1, y: seg.y + a0, w: seg.w - 2, h: seg.h - a0 - a1, r: Math.max(0, seg.r - 1) }
    : { ...seg, x: seg.x + a0, y: seg.y + 1, w: seg.w - a0 - a1, h: seg.h - 2, r: Math.max(0, seg.r - 1) }
  return inner.w > 0 && inner.h > 0 ? inner : null
}

/** The whole track as one run, for a bar that has heard no value yet. */
export function levelEmptyTrack(obj: ScreenObject, fonts?: readonly ProjectFont[] | null): LevelSegment {
  const { track } = levelLayout(obj, fonts)
  return { ...track, role: "track", roundStart: true, roundEnd: true }
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}
