/**
 * Guard: a control that needs a deliberate gesture before it changes
 * (docs/2026-11-15-guard.md).
 *
 * At rest a guarded control looks as it does without a Guard, plus a lock.
 * A finger down on it shows a striped yellow cover over the whole control;
 * pushed up past 45 % of the control's height (never less than 20 px at the
 * 4"'s density) it locks in above the control, half transparent, and the
 * control works for 5 s - every change tops what is left up to 2 s. Then the
 * cover falls back in 0.2 s and is gone.
 *
 * What a device draws is defined here, pixel for pixel where it is drawn at
 * rest: the lock is built from `roundRectSpans` (lib/clip.ts), which every
 * device already has for `clip`; the double arrow and the stripes from the
 * integer rules below. `lib/fixtures/guard-spans.json` holds the reference
 * every renderer is held to. The gesture itself is `guardStep` and friends,
 * pure functions of time and finger, so the preview and the tests share
 * them and a device mirrors them.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { roundRectSpans } from "@/lib/clip"
import { buttonCornerRadius } from "@/lib/button-shape"
import { fontMetricsOf } from "@/lib/level-shape"
import { switchContainer, switchKnob } from "@/lib/switch-shape"
import { TOGGLE_RADIUS } from "@/lib/toggle-button-shape"

/** The device feature (DDF `supportedFeatures`) that draws and honours `guard`. */
export const GUARD_FEATURE = "guard"

/** The types a Guard can be put on (decision 1). */
export const GUARD_TYPES = ["switch", "button-group", "toggle-button", "button"] as const

export function canGuard(type: string | undefined): boolean {
  return (GUARD_TYPES as readonly string[]).includes(type ?? "")
}

export function isGuarded(obj: { type?: string; properties?: Record<string, any> } | null | undefined): boolean {
  return !!obj && canGuard(obj.type) && obj.properties?.guard === true
}

// --- Times and thresholds: the same on every device (decisions 9-13, E1, E5)

/** The share of the control's height the cover must travel to lock in. */
export const GUARD_UNLOCK_FRACTION = 0.45
/** ...but never less than this, in pixels at the 4"'s density (E1). */
export const GUARD_MIN_PUSH_PX = 20
/** The 4"'s density, pixels per mm: 480 px over 71.28 mm. */
export const GUARD_REFERENCE_PPM = 480 / 71.28
/** Locking in, and falling back: both 0.2 s. */
export const GUARD_ANIM_MS = 200
/** How long the cover waits above the control after locking in. */
export const GUARD_RELOCK_MS = 5000
/** Every change while it waits tops what is left up to at least this. */
export const GUARD_TOPUP_MS = 2000
/** The hint after a plain tap (E5). */
export const GUARD_HINT_MS = 1500
export const GUARD_HINT = "Slide up to unlock"
/** A finger that moved less than this is a plain tap (E5). */
export const GUARD_TAP_SLOP_PX = 8
/** The waiting cover's opacity (decision 11). */
export const GUARD_WAIT_ALPHA = 0.55
/** The arrows' bob: how far up, and one cycle (decision 7). */
export const GUARD_BOB_PX = 5
export const GUARD_BOB_MS = 1000
/** The overshoot of locking in, as a share of the travel (decision 9). */
export const GUARD_OVERSHOOT = 0.12

// --- The look (decisions 4, 6, 14)

/** Two close yellows for the stripes, and the dark ink; never themed. */
export const GUARD_YELLOW = "#f5c542"
export const GUARD_YELLOW_2 = "#ebb526"
export const GUARD_INK = "#3a2d00"
/** The width of one stripe, measured along a row. */
export const GUARD_STRIPE_PX = 8
/** The smallest lock anyone can still see at arm's length (E9). */
export const GUARD_LOCK_MIN = 8

/** The yellow at a pixel of the cover, `x`, `y` from its top left. */
export function guardStripeIsSecond(x: number, y: number): boolean {
  return Math.floor((x + y) / GUARD_STRIPE_PX) % 2 === 1
}

/** One row's runs [start, end), relative to the shape's left edge. */
export type Runs = Array<[number, number]>

function rowsOf(w: number, h: number, inside: (x: number, y: number) => boolean): Runs[] {
  const rows: Runs[] = []
  for (let y = 0; y < h; y++) {
    const runs: Runs = []
    let start = -1
    for (let x = 0; x <= w; x++) {
      const on = x < w && inside(x, y)
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        runs.push([start, x])
        start = -1
      }
    }
    rows.push(runs)
  }
  return rows
}

function inSpan(spans: Array<[number, number]>, x: number, y: number): boolean {
  const s = spans[y]
  return !!s && x >= s[0] && x < s[1]
}

/**
 * The lock, `size` × `size`: a body with round corners in the lower part,
 * a shackle above it - the outer round rectangle minus the inner one, cut
 * where the body begins. All of it from roundRectSpans.
 */
export function guardLockRuns(size: number): Runs[] {
  const s = Math.max(1, Math.trunc(size))
  const bodyTop = Math.trunc((s * 9) / 20)
  const bodyR = Math.max(1, Math.trunc(s / 8))
  const body = roundRectSpans(s, s - bodyTop, bodyR)
  const a = Math.trunc(s / 5)
  const t = Math.max(1, Math.trunc(s / 7))
  const ow = s - 2 * a
  const outer = roundRectSpans(ow, 2 * bodyTop, Math.trunc(ow / 2))
  const iw = ow - 2 * t
  const inner = iw > 0 ? roundRectSpans(iw, Math.max(0, 2 * bodyTop - 2 * t), Math.trunc(iw / 2)) : []
  return rowsOf(s, s, (x, y) => {
    if (y >= bodyTop) return inSpan(body, x, y - bodyTop)
    if (!inSpan(outer, x - a, y)) return false
    return !(y >= t && inSpan(inner, x - a - t, y - t))
  })
}

/**
 * The double arrow pointing up, `size` × `size`: two chevrons, each row
 * `y` from a chevron's tip covering the columns whose distance `d` from the
 * middle lies in [2y - 2t + 2, 2y + 1], within half the width.
 */
export function guardArrowRuns(size: number): Runs[] {
  const s = Math.max(1, Math.trunc(size))
  const half = Math.trunc((s - 1) / 2)
  const c = half
  const t = Math.max(1, Math.trunc(s / 7))
  const chevronRows = Math.trunc((half - 2 + 2 * t) / 2) + 1
  const gap = chevronRows + 1
  const top = Math.max(0, Math.trunc((s - (gap + chevronRows)) / 2))
  const chevron = (x: number, y: number) => {
    if (y < 0 || y >= chevronRows) return false
    const d = Math.abs(x - c)
    return d <= half && d >= Math.max(0, 2 * y - 2 * t + 2) && d <= 2 * y + 1
  }
  return rowsOf(s, s, (x, y) => chevron(x, y - top) || chevron(x, y - top - gap))
}

/** Runs drawn into a canvas in one colour, their top left at `x`, `y`. */
export function fillRuns(ctx: CanvasRenderingContext2D, runs: Runs[], x: number, y: number, colour: string): void {
  ctx.fillStyle = colour
  runs.forEach((row, dy) => {
    for (const [a, b] of row) ctx.fillRect(x + a, y + dy, b - a, 1)
  })
}

// --- Where things go

export interface GuardRect {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

export interface GuardLock {
  x: number
  y: number
  size: number
}

/** A group's badge: a disc on its top-right corner, inside, with the lock. */
export interface GuardBadge {
  cx: number
  cy: number
  r: number
  lock: GuardLock
}

function box(obj: ScreenObject) {
  return {
    x: Math.trunc(obj.x),
    y: Math.trunc(obj.y),
    w: Math.max(1, Math.trunc(obj.width)),
    h: Math.max(1, Math.trunc(obj.height)),
  }
}

/** The control's outline, which the cover fills (decision 6). */
export function guardCover(obj: ScreenObject): GuardRect {
  const { x, y, w, h } = box(obj)
  if (obj.type === "switch" || obj.type === "button-group") {
    const c = switchContainer(obj)
    return { x: c.x, y: c.y, width: c.w, height: c.h, radius: c.r }
  }
  const own = obj.properties?.buttonRadius
  const r = typeof own === "number" && Number.isFinite(own) ? own : undefined
  if (obj.type === "toggle-button") {
    return { x, y, width: w, height: h, radius: Math.min(Math.trunc(Math.min(w, h) / 2), Math.trunc(r ?? TOGGLE_RADIUS)) }
  }
  return { x, y, width: w, height: h, radius: buttonCornerRadius(w, h, false, r) }
}

/** The lock in a Button's or Toggle Button's top-right corner, inside (decision 4, E9). */
export function guardCornerLock(obj: ScreenObject, fonts: readonly ProjectFont[] | null | undefined): GuardLock {
  const cover = guardCover(obj)
  const fontMeta = fonts?.find((f) => f.id === obj.properties?.fontId)
  const m = fontMetricsOf(fontMeta, 14)
  const wanted = Math.trunc(((m.ascent + m.descent) * 3) / 5)
  const size = Math.max(GUARD_LOCK_MIN, Math.min(wanted, Math.trunc(cover.height / 2)))
  const inset = 3 + Math.trunc((cover.radius * 3) / 10)
  return { x: cover.x + cover.width - inset - size, y: cover.y + inset, size }
}

/** The lock on a Switch's knob, about two fifths of it, moving with it (decision 4, E9). */
export function guardKnobLock(knob: { cx: number; cy: number; r: number }): GuardLock {
  const size = Math.max(GUARD_LOCK_MIN, Math.trunc((knob.r * 2 * 2) / 5))
  return { x: knob.cx - Math.trunc(size / 2), y: knob.cy - Math.trunc(size / 2), size }
}

/** The badge on a Button Group's top-right corner (decision 4, E9). */
export function guardBadge(obj: ScreenObject): GuardBadge {
  const c = switchContainer(obj)
  const d = Math.max(14, Math.min(28, Math.trunc((c.h * 2) / 5)))
  const r = Math.trunc(d / 2)
  const cx = c.x + c.w - 1 - r
  const cy = c.y + r
  const size = Math.max(GUARD_LOCK_MIN - 2, Math.trunc((d * 3) / 5))
  return { cx, cy, r, lock: { x: cx - Math.trunc(size / 2), y: cy - Math.trunc(size / 2), size } }
}

/** Re-exported so a renderer finds the knob where the switch draws it. */
export { switchKnob }

/** The cover's lock-and-arrows: their size, and where each stands in the cover. */
export function guardCoverMarks(cover: GuardRect): { size: number; lock: { x: number; y: number }; arrows: { x: number; y: number } } {
  const size = Math.max(GUARD_LOCK_MIN, Math.min(28, Math.trunc((cover.height * 9) / 20)))
  const gap = Math.max(3, Math.trunc(size / 4))
  const total = 2 * size + gap
  const x = cover.x + Math.trunc((cover.width - total) / 2)
  const y = cover.y + Math.trunc((cover.height - size) / 2)
  return { size, lock: { x, y }, arrows: { x: x + size + gap, y } }
}

/** How far the cover must travel to lock in, in device pixels (decision 9, E1). */
export function guardUnlockTravel(height: number, pixelsPerMm?: number): number {
  const minimum = Math.round((GUARD_MIN_PUSH_PX * (pixelsPerMm && pixelsPerMm > 0 ? pixelsPerMm : GUARD_REFERENCE_PPM)) / GUARD_REFERENCE_PPM)
  return Math.max(minimum, Math.ceil(height * GUARD_UNLOCK_FRACTION))
}

/** Where the waiting cover sits: its bottom just above the control (decision 11). */
export function guardWaitOffset(height: number): number {
  return height + 2
}

// --- The gesture

/**
 * One guarded control's cover. `pushing`: a finger is down, the cover
 * follows it up. `opening`: locked in, sliding to its waiting place.
 * `open`: waiting, the control works. `dropping`: falling back, fading.
 * `rest` is not a phase - a control at rest has no cover.
 */
export type GuardPhase = "pushing" | "opening" | "open" | "dropping"

export interface GuardCover {
  phase: GuardPhase
  /** When this phase began. */
  since: number
  /** pushing: how far up the finger has taken it, px. */
  offset: number
  /** open: when it falls back. */
  until: number
  /** Where the finger went down. */
  startX: number
  startY: number
  /** pushing: the furthest the finger moved from where it went down. */
  moved: number
}

/** A finger down on a guarded control at rest: the cover shows, nothing is switched (decision 5). */
export function guardDown(now: number, x: number, y: number): GuardCover {
  return { phase: "pushing", since: now, offset: 0, until: 0, startX: x, startY: y, moved: 0 }
}

/**
 * The finger moved: the cover follows it straight up, never down
 * (decision 8). Past the travel it locks in at once (decision 9).
 */
export function guardMove(cover: GuardCover, now: number, x: number, y: number, travel: number): GuardCover {
  if (cover.phase !== "pushing") return cover
  const moved = Math.max(cover.moved, Math.hypot(x - cover.startX, y - cover.startY))
  const offset = Math.max(0, cover.startY - y)
  if (offset > travel) return { ...cover, phase: "opening", since: now, offset, moved, until: now + GUARD_RELOCK_MS }
  return { ...cover, offset, moved }
}

/**
 * The finger lifted. Before locking in the cover is gone (decision 10);
 * `hint` says whether it was a plain tap (E5). After, nothing happens.
 */
export function guardUp(cover: GuardCover, now: number): { cover: GuardCover | null; hint: boolean } {
  if (cover.phase !== "pushing") return { cover, hint: false }
  return {
    cover: { ...cover, phase: "dropping", since: now },
    hint: cover.moved < GUARD_TAP_SLOP_PX,
  }
}

/** Time passing: opening becomes open, open falls, dropping ends (null). */
export function guardTick(cover: GuardCover, now: number): GuardCover | null {
  if (cover.phase === "opening" && now - cover.since >= GUARD_ANIM_MS) return { ...cover, phase: "open", since: cover.since + GUARD_ANIM_MS }
  if ((cover.phase === "open" || cover.phase === "opening") && now >= cover.until) return { ...cover, phase: "dropping", since: now }
  if (cover.phase === "dropping" && now - cover.since >= GUARD_ANIM_MS) return null
  return cover
}

/** Whether a tap on the control switches it now (decision 11). */
export function guardUnlocked(cover: GuardCover | null | undefined): boolean {
  return !!cover && (cover.phase === "opening" || cover.phase === "open")
}

/** A change while it waits: what is left is topped up to at least 2 s (decision 13). */
export function guardChanged(cover: GuardCover, now: number): GuardCover {
  if (!guardUnlocked(cover)) return cover
  return { ...cover, until: Math.max(cover.until, now + GUARD_TOPUP_MS) }
}

/** What to draw: how far up the cover stands, its opacity, the arrows' bob. */
export interface GuardDrawn {
  /** Upwards, px from where it lies on the control. */
  lift: number
  alpha: number
  /** Upwards, px; 0 once locked in (decision 7). */
  bob: number
}

function easeOutBack(t: number): number {
  // Overshoots by about GUARD_OVERSHOOT of the way, then settles.
  const s = 1.2
  const u = t - 1
  return 1 + (s + 1) * u * u * u + s * u * u
}

export function guardDrawn(cover: GuardCover, now: number, height: number, motion = true): GuardDrawn {
  const wait = guardWaitOffset(height)
  const bob = motion ? Math.round((GUARD_BOB_PX * (1 - Math.cos((2 * Math.PI * (now - cover.since)) / GUARD_BOB_MS))) / 2) : 0
  switch (cover.phase) {
    case "pushing":
      // Where the device moves nothing (the PaperS3, E7) the cover stays put
      // under the finger, and the arrows stand still.
      return { lift: motion ? Math.min(cover.offset, wait) : 0, alpha: 1, bob }
    case "opening": {
      const t = Math.min(1, (now - cover.since) / GUARD_ANIM_MS)
      const from = Math.min(cover.offset, wait)
      const k = motion ? easeOutBack(t) : 1
      return { lift: Math.round(from + (wait - from) * k), alpha: 1 - (1 - GUARD_WAIT_ALPHA) * t, bob: 0 }
    }
    case "open":
      return { lift: wait, alpha: GUARD_WAIT_ALPHA, bob: 0 }
    case "dropping": {
      // E7: gone in one refresh, no fall, no fade.
      if (!motion) return { lift: 0, alpha: 0, bob: 0 }
      const t = Math.min(1, (now - cover.since) / GUARD_ANIM_MS)
      const from = cover.until > 0 && cover.until <= cover.since ? wait : Math.min(cover.offset, wait)
      const start = cover.until > 0 && cover.until <= cover.since ? GUARD_WAIT_ALPHA : 1
      return { lift: Math.round(from * (1 - t)), alpha: start * (1 - t), bob: 0 }
    }
  }
}

/**
 * Draw a cover into a canvas: the control's outline in stripes, the lock
 * and the double arrow side by side in dark ink, lifted and faded as
 * `drawn` says.
 */
export function drawGuardCover(ctx: CanvasRenderingContext2D, cover: GuardRect, drawn: GuardDrawn): void {
  if (drawn.alpha <= 0) return
  const y0 = cover.y - drawn.lift
  const spans = roundRectSpans(cover.width, cover.height, cover.radius)
  ctx.save()
  ctx.globalAlpha = drawn.alpha
  spans.forEach(([a, b], row) => {
    if (b <= a) return
    // Runs of one yellow along the row, so a cover is a few hundred rects, not thousands.
    let x = a
    while (x < b) {
      const second = guardStripeIsSecond(x, row)
      let end = x + 1
      while (end < b && guardStripeIsSecond(end, row) === second) end++
      ctx.fillStyle = second ? GUARD_YELLOW_2 : GUARD_YELLOW
      ctx.fillRect(cover.x + x, y0 + row, end - x, 1)
      x = end
    }
  })
  const marks = guardCoverMarks(cover)
  fillRuns(ctx, guardLockRuns(marks.size), marks.lock.x, marks.lock.y - drawn.lift, GUARD_INK)
  fillRuns(ctx, guardArrowRuns(marks.size), marks.arrows.x, marks.arrows.y - drawn.lift - drawn.bob, GUARD_INK)
  ctx.restore()
}

/**
 * What a project needs of a device for its Guards: the feature, named by
 * how many controls are guarded - or null where none is.
 */
export function guardFeature(project: { screens?: Array<{ objects?: ScreenObject[] }> }): { feature: string; label: string } | null {
  let count = 0
  const walk = (objects: ScreenObject[] | undefined) => {
    for (const o of objects ?? []) {
      if (isGuarded(o)) count++
      walk(o.children)
    }
  }
  for (const screen of project.screens ?? []) walk(screen.objects)
  return count > 0 ? { feature: GUARD_FEATURE, label: `guarded controls (${count})` } : null
}

// --- Export (device contract §2.14)

/** What a device gets beside `properties.guard`: the geometry, worked out here. */
export interface ExportedGuard {
  cover: GuardRect
  travel: number
  lock?: GuardLock
  badge?: GuardBadge
}

export function exportedGuard(obj: ScreenObject, fonts: readonly ProjectFont[] | null | undefined, pixelsPerMm?: number): ExportedGuard {
  const cover = guardCover(obj)
  const travel = guardUnlockTravel(cover.height, pixelsPerMm)
  if (obj.type === "button" || obj.type === "toggle-button") return { cover, travel, lock: guardCornerLock(obj, fonts) }
  if (obj.type === "button-group") return { cover, travel, badge: guardBadge(obj) }
  return { cover, travel }
}

/**
 * An object as a device gets it: a guarded one carries `guard`, the
 * geometry; on a type that cannot be guarded (one converted to a slider,
 * say) `properties.guard` is dropped, so no device ever reads it there.
 */
export function withExportedGuard<T extends { type?: string; properties?: Record<string, any> }>(
  obj: T,
  fonts: readonly ProjectFont[] | null | undefined,
  pixelsPerMm?: number,
): T {
  if (!obj?.properties || obj.properties.guard === undefined) return obj
  if (isGuarded(obj)) return { ...obj, guard: exportedGuard(obj as unknown as ScreenObject, fonts, pixelsPerMm) }
  const { guard: _dropped, ...properties } = obj.properties
  return { ...obj, properties }
}
