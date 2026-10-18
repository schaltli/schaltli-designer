import { test, expect } from "@playwright/test"
import vectors from "../lib/navigator/vectors.json"
import {
  cornerInset,
  entryAt,
  entryRect,
  markerGlides,
  markerOffset,
  markerRect,
  markerSettle,
  maxScroll,
  navigatorLayout,
  navigatorScreens,
  pageScroll,
  scrollToShow,
  type Edge,
  type Shows,
} from "../lib/navigator"

// lib/navigator.ts against lib/navigator/vectors.json - the cases the
// firmware and the app will run too (docs/2026-10-08-navigator.md,
// tasks/navigator-todo.md Task 3). Pure; the suite runs in a browser only
// because every suite does.

type LayoutCase = { edge: string; shows: string; screenWidth: number; screenHeight: number; count: number }
const layoutOf = (l: LayoutCase) => navigatorLayout(l.edge as Edge, l.shows as Shows, l.screenWidth, l.screenHeight, l.count)

test.describe("navigator geometry (shared vectors)", () => {
  test("enough cases that a truncated copy cannot pass", () => {
    expect(vectors.layout.length).toBeGreaterThanOrEqual(7)
    expect(vectors.entryRect.length + vectors.scrollToShow.length + vectors.entryAt.length + vectors.pageScroll.length).toBeGreaterThanOrEqual(20)
  })

  for (const c of vectors.screens) {
    test(`screens: ${c.name}`, () => {
      expect(navigatorScreens(c.screens as any[]).map((s) => s.id)).toEqual(c.expected)
    })
  }
  for (const c of vectors.layout) {
    test(`layout: ${c.name}`, () => {
      const layout = layoutOf(c.layout)
      expect({ strip: layout.strip, entryLength: layout.entryLength, maxScroll: maxScroll(layout) }).toEqual(c.expected)
    })
  }
  for (const c of vectors.entryRect) {
    test(`entryRect: ${c.name}`, () => {
      expect(entryRect(layoutOf(c.layout), c.index, c.scroll)).toEqual(c.expected)
    })
  }
  for (const c of vectors.scrollToShow) {
    test(`scrollToShow: ${c.name}`, () => {
      expect(scrollToShow(layoutOf(c.layout), c.index, c.scroll)).toBe(c.expected)
    })
  }
  for (const c of vectors.entryAt) {
    test(`entryAt: ${c.name}`, () => {
      expect(entryAt(layoutOf(c.layout), c.x, c.y, c.scroll)).toBe(c.expected)
    })
  }
  for (const c of vectors.pageScroll) {
    test(`pageScroll: ${c.name}`, () => {
      expect(pageScroll(layoutOf(c.layout), c.scroll, c.direction as 1 | -1)).toBe(c.expected)
    })
  }
  // The marker gliding with a swipe (#59).
  for (const c of vectors.markerGlides) {
    test(`markerGlides: ${c.name}`, () => {
      expect(markerGlides(c.from, c.to, c.scrollFrom, c.scrollTo)).toBe(c.expected)
    })
  }
  for (const c of vectors.markerOffset) {
    test(`markerOffset: ${c.name}`, () => {
      expect(markerOffset(layoutOf(c.layout), c.from, c.to, c.travel, c.span)).toBe(c.expected)
    })
  }
  for (const c of vectors.markerSettle) {
    test(`markerSettle: ${c.name}`, () => {
      expect(markerSettle(c.start, c.end, c.elapsed)).toBe(c.expected)
    })
  }
  for (const c of vectors.markerRect) {
    test(`markerRect: ${c.name}`, () => {
      expect(markerRect(layoutOf(c.layout), c.from, c.offset, c.scroll, c.box)).toEqual(c.expected)
    })
  }
  for (const c of vectors.cornerInset) {
    test(`cornerInset: ${c.name}`, () => {
      expect(cornerInset(c.radius, c.width, c.height, c.row)).toBe(c.expected)
    })
  }
  test("the marker's settle never moves backwards before it overshoots, and stays within a tenth past", () => {
    let last = 0
    let most = 0
    for (let ms = 0; ms <= 400; ms += 5) {
      const at = markerSettle(0, 1000, ms)
      most = Math.max(most, at)
      if (most < 1000) expect(at).toBeGreaterThanOrEqual(last)
      last = at
    }
    expect(most).toBeGreaterThan(1050)
    expect(most).toBeLessThanOrEqual(1100)
  })
})
