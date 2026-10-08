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
}

/** The screens with an entry: main screens that are not hidden, in list order (decisions 2, 3). */
export function navigatorScreens<S extends ListedScreen>(screens: readonly S[]): S[] {
  return screens.filter((s) => !s.isMaster && s.screenType !== "popup" && !s.hidden)
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
