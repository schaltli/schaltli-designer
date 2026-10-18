// The navigator's geometry (docs/2026-10-08-navigator.md): which screens it
// lists, where its strip lies, where each entry is at a scroll offset, how
// far to scroll to show the active entry, and which entry is under a point.
//
// Written to be ported line by line to the firmware and the Android app, as
// lib/live-value.ts is: whole pixels, integer arithmetic, no library. The
// cases all three must agree on are lib/navigator/vectors.json.

export type Edge = "top" | "bottom" | "left" | "right"

/**
 * An object nobody moves or sizes by hand: a locked one, and the navigator,
 * which «Edge» and «Shows» place (decision 4).
 */
export function staysPut(obj: { type: string; locked?: boolean }): boolean {
  return !!obj.locked || obj.type === "navigator"
}
export type Shows = "icons" | "iconsAndText"

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The line along the strip's inner edge, towards the screen, in px: drawn
 * over the strip's last pixels, in its «Outline» (`borderColor`).
 */
export const NAVIGATOR_DIVIDER = 2

/** The divider's rectangle: the strip's `NAVIGATOR_DIVIDER` pixels on the screen's side. */
export function dividerRect(edge: Edge, strip: Rect): Rect {
  const d = NAVIGATOR_DIVIDER
  if (edge === "left") return { x: strip.x + strip.width - d, y: strip.y, width: d, height: strip.height }
  if (edge === "right") return { x: strip.x, y: strip.y, width: d, height: strip.height }
  if (edge === "top") return { x: strip.x, y: strip.y + strip.height - d, width: strip.width, height: d }
  return { x: strip.x, y: strip.y, width: strip.width, height: d }
}

/**
 * Where the light/dark switch stands on the strip (2026-10-11): none, at its
 * start («Near» - the top of a left or right strip, the left of a top or
 * bottom one) or at its end («Far»). It does not scroll; the entries scroll
 * in what is left.
 */
export type ThemeSwitchAt = "none" | "near" | "far"

/**
 * How long the switch's place is along the strip, in px: on a left or right
 * strip the switch's height and a little, on a top or bottom one its track's
 * width and a little. 64 took the entries too much room (the user,
 * 2026-10-11).
 */
export function themeSwitchLength(edge: Edge): number {
  return edge === "top" || edge === "bottom" ? 56 : 40
}

/** A navigator's strip split: the whole bar, the entries' part laid out, and the switch's place. */
export interface NavigatorBar {
  bar: Rect
  layout: NavigatorLayout
  themeSwitch?: Rect
}

/** The bar laid out with `count` entries, the switch's place cut off where `at` says. */
export function barLayout(edge: Edge, shows: Shows, bar: Rect, count: number, at: ThemeSwitchAt = "none"): NavigatorBar {
  if (at !== "near" && at !== "far") return { bar, layout: layoutInStrip(edge, shows, bar, count) }
  const horizontal = edge === "top" || edge === "bottom"
  const l = Math.min(themeSwitchLength(edge), horizontal ? bar.width : bar.height)
  const near = at === "near"
  const themeSwitch = horizontal
    ? { x: near ? bar.x : bar.x + bar.width - l, y: bar.y, width: l, height: bar.height }
    : { x: bar.x, y: near ? bar.y : bar.y + bar.height - l, width: bar.width, height: l }
  const entries = horizontal
    ? { x: near ? bar.x + l : bar.x, y: bar.y, width: bar.width - l, height: bar.height }
    : { x: bar.x, y: near ? bar.y + l : bar.y, width: bar.width, height: bar.height - l }
  return { bar, layout: layoutInStrip(edge, shows, entries, count), themeSwitch }
}

/** How thick the strip is, and the shortest an entry may be, per «Shows». */
export const NAVIGATOR_SIZES: Record<Shows, { thickness: number; minEntry: number }> = {
  icons: { thickness: 64, minEntry: 64 },
  iconsAndText: { thickness: 80, minEntry: 88 },
}

export interface NavigatorLayout {
  edge: Edge
  /** The strip, in screen coordinates. */
  strip: Rect
  /** Entries run left to right (top, bottom) or top to bottom (left, right). */
  horizontal: boolean
  /** The strip's length along the entries. */
  length: number
  count: number
  /** Every entry's length along the strip. */
  entryLength: number
}

interface ListedScreen {
  id: string
  isMaster?: boolean
  screenType?: "popup"
  hidden?: boolean
  dock?: unknown
}

/**
 * The screens with an entry: main screens that are not hidden, in list order
 * (decisions 2, 3) - the main row of the screen graph, so not one docked off
 * it (docs/2026-10-17-screen-graph.md decision 7).
 */
export function navigatorScreens<S extends ListedScreen>(screens: readonly S[]): S[] {
  return screens.filter((s) => !s.isMaster && s.screenType !== "popup" && !s.hidden && !s.dock)
}

/** The strip along an edge of a screen of that size. */
export function navigatorStrip(edge: Edge, shows: Shows, screenWidth: number, screenHeight: number): Rect {
  const t = NAVIGATOR_SIZES[shows].thickness
  if (edge === "top") return { x: 0, y: 0, width: screenWidth, height: t }
  if (edge === "bottom") return { x: 0, y: screenHeight - t, width: screenWidth, height: t }
  if (edge === "left") return { x: 0, y: 0, width: t, height: screenHeight }
  return { x: screenWidth - t, y: 0, width: t, height: screenHeight }
}

/**
 * The layout for `count` entries. If they all fit at their shortest, they
 * share the strip evenly (the remainder stays empty at the end); if not,
 * each is as short as it may be and the navigator scrolls (decision 12).
 */
export function navigatorLayout(edge: Edge, shows: Shows, screenWidth: number, screenHeight: number, count: number): NavigatorLayout {
  return layoutInStrip(edge, shows, navigatorStrip(edge, shows, screenWidth, screenHeight), count)
}

/** The same, for a strip already placed (the navigator object's own rectangle). */
export function layoutInStrip(edge: Edge, shows: Shows, strip: Rect, count: number): NavigatorLayout {
  const horizontal = edge === "top" || edge === "bottom"
  const length = horizontal ? strip.width : strip.height
  const min = NAVIGATOR_SIZES[shows].minEntry
  const entryLength = count > 0 && count * min <= length ? Math.floor(length / count) : min
  return { edge, strip, horizontal, length, count, entryLength }
}

/** The furthest it scrolls: 0 when everything fits. */
export function maxScroll(layout: NavigatorLayout): number {
  return Math.max(0, layout.count * layout.entryLength - layout.length)
}

/** `scroll` kept within 0 and maxScroll. */
export function clampScroll(layout: NavigatorLayout, scroll: number): number {
  return Math.min(Math.max(0, scroll), maxScroll(layout))
}

/** Entry `index` at a scroll offset, in screen coordinates - partly or wholly outside the strip when scrolled away. */
export function entryRect(layout: NavigatorLayout, index: number, scroll: number): Rect {
  const along = index * layout.entryLength - scroll
  const { strip } = layout
  return layout.horizontal
    ? { x: strip.x + along, y: strip.y, width: layout.entryLength, height: strip.height }
    : { x: strip.x, y: strip.y + along, width: strip.width, height: layout.entryLength }
}

/** The scroll offset nearest to `scroll` at which entry `index` is wholly visible (decision 12). */
export function scrollToShow(layout: NavigatorLayout, index: number, scroll: number): number {
  const start = index * layout.entryLength
  const end = start + layout.entryLength
  let next = scroll
  if (start < next) next = start
  else if (end > next + layout.length) next = end - layout.length
  return clampScroll(layout, next)
}

/** The entry under a point, or -1: outside the strip, or past the last entry. */
export function entryAt(layout: NavigatorLayout, x: number, y: number, scroll: number): number {
  const { strip } = layout
  if (x < strip.x || y < strip.y || x >= strip.x + strip.width || y >= strip.y + strip.height) return -1
  const along = (layout.horizontal ? x - strip.x : y - strip.y) + scroll
  const index = Math.floor(along / layout.entryLength)
  return index < layout.count ? index : -1
}

/**
 * A page of entries further (`direction` 1) or back (-1): as many whole
 * entries as the strip shows - how the PaperS3 scrolls, on release
 * (decision 15).
 */
export function pageScroll(layout: NavigatorLayout, scroll: number, direction: 1 | -1): number {
  const page = Math.max(1, Math.floor(layout.length / layout.entryLength)) * layout.entryLength
  return clampScroll(layout, scroll + direction * page)
}

// ---------------------------------------------- the marker gliding with a swipe
//
// While a swipe leads from one entry's screen to another's, the marker - the
// box an entry's active look puts on it - moves along the strip with the
// finger, and when the finger lifts it settles on the screen it arrived at
// (or back), a little past it and back (#59; decision 14 since 2026-10-18).
// Where the box lies, the entries are drawn in their active look on its
// colour, elsewhere in their normal one - the change of colour may run
// through an entry.

/** How long the marker takes to come to rest once the finger has lifted, in ms. */
export const MARKER_SETTLE_MS = 320

/**
 * Whether the marker glides from entry `from` to entry `to`: two different
 * entries, and the strip at the same scroll on the screen it leaves as on
 * the one it comes to. Otherwise it jumps when the screen has changed, as
 * before - from or to a screen off the main row, or to an entry the strip
 * scrolls to.
 */
export function markerGlides(from: number, to: number, scrollFrom: number, scrollTo: number): boolean {
  return from >= 0 && to >= 0 && from !== to && scrollFrom === scrollTo
}

/**
 * How far the marker has moved from entry `from`'s place towards `to`'s, in
 * px along the strip, with a swipe `travel` px of the `span` a screen moves:
 * in proportion, whole pixels towards `from`.
 */
export function markerOffset(layout: NavigatorLayout, from: number, to: number, travel: number, span: number): number {
  if (span <= 0) return 0
  const t = Math.min(Math.abs(travel), span)
  return Math.trunc(((to - from) * layout.entryLength * t) / span)
}

/**
 * Where the marker is `elapsed` ms after the finger lifted at `start` px,
 * on its way to `end` px: an ease-out that runs past `end` by about a tenth
 * of the way and comes back (ease-out-back, s = 1.7), at rest on `end` from
 * MARKER_SETTLE_MS. Integer arithmetic, per mille, so every device lands on
 * the same pixel.
 */
export function markerSettle(start: number, end: number, elapsed: number): number {
  const t = Math.max(0, Math.min(1000, Math.trunc((elapsed * 1000) / MARKER_SETTLE_MS)))
  const u = t - 1000
  const f = 1000 + Math.trunc((27 * u * u * u) / 10_000_000) + Math.trunc((17 * u * u) / 10_000)
  return start + Math.trunc(((end - start) * f) / 1000)
}

/**
 * The marker `offset` px along the strip from entry `from`'s place, at
 * `scroll`: `box` (where the box lies within an entry) moved with it, in
 * screen coordinates.
 */
export function markerRect(layout: NavigatorLayout, from: number, offset: number, scroll: number, box: Rect): Rect {
  const entry = entryRect(layout, from, scroll - offset)
  return { x: entry.x + box.x, y: entry.y + box.y, width: box.width, height: box.height }
}

/**
 * How far row `row` of a box `width` by `height` with corners of `radius` is
 * cut in at each end: the arc through the pixels' centres, whole pixels. The
 * marker is cut so on every device while it glides; at rest the box is drawn
 * as a box.
 */
export function cornerInset(radius: number, width: number, height: number, row: number): number {
  const r = Math.max(0, Math.min(radius, Math.floor(width / 2), Math.floor(height / 2)))
  const d = Math.min(row, height - 1 - row)
  if (d < 0 || d >= r) return 0
  const k = 2 * r - 2 * d - 1
  return r - Math.trunc((Math.floor(Math.sqrt(4 * r * r - k * k)) + 1) / 2)
}
