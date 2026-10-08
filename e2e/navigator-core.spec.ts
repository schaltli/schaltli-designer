import { test, expect } from "@playwright/test"
import vectors from "../lib/navigator/vectors.json"
import {
  entryAt,
  entryRect,
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
})
