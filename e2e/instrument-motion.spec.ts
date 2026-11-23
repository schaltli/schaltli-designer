import { test, expect } from "@playwright/test"
import { PIN, restingAt, stepSpring } from "../lib/instrument-spring"
import { STYLE_META } from "../lib/instrument"

// A styled needle's swing (docs/2026-11-23-instrument-styles.md «Motion»,
// tasks/instrument-styles-todo.md I6): the style's spring, the pins at both
// ends, and a rest that is exactly the value - so the picture at rest is
// the static one, which render-instrument.ts draws from the same position.
// Pure; frames of 16 ms as a browser gives them.

function swing(style: keyof typeof STYLE_META, from: number, to: number, seconds: number) {
  const s = restingAt(from)
  const trace: number[] = []
  let moving = true
  let t = 0
  stepSpring(s, to, t, STYLE_META[style].spring)
  while (t < seconds * 1000) {
    t += 16
    moving = stepSpring(s, to, t, STYLE_META[style].spring)
    trace.push(s.at)
    if (!moving) break
  }
  return { s, trace, moving, ms: t }
}

test("the fuel gauge creeps up without overshooting and rests exactly on the value", () => {
  const { s, trace, moving, ms } = swing("fuel", 0, 1, 10)
  expect(Math.max(...trace)).toBeLessThanOrEqual(1)
  expect(moving).toBe(false)
  expect(s.at).toBe(1)
  // Slow on purpose (0.45 Hz, critically damped): sloshing must not show.
  expect(ms).toBeGreaterThan(1500)
})

test("the pressure gauge overshoots, stops at its pin, swings back and comes to rest", () => {
  const { s, trace, moving } = swing("pressure", 0, 0.9, 15)
  expect(Math.max(...trace), "an overshoot past the value").toBeGreaterThan(0.95)
  expect(Math.max(...trace), "but never past the pin").toBeLessThanOrEqual(1 + PIN)
  const below = trace.findIndex((a, i) => i > 10 && a < 0.9)
  expect(below, "and back below it").toBeGreaterThan(0)
  expect(moving).toBe(false)
  expect(s.at).toBe(0.9)
})

test("a swing to full scale with little damping is held by the pin", () => {
  const { trace } = swing("pressure", 0, 1, 15)
  expect(Math.max(...trace)).toBe(1 + PIN)
})

test("a frame that took a second moves the needle no further than 50 ms would", () => {
  const spring = STYLE_META.rally.spring
  const a = restingAt(0)
  stepSpring(a, 1, 0, spring)
  stepSpring(a, 1, 1000, spring)
  const b = restingAt(0)
  stepSpring(b, 1, 0, spring)
  stepSpring(b, 1, 50, spring)
  expect(a.at).toBe(b.at)
})

test("every style comes to rest from a full swing within ten seconds", () => {
  for (const style of Object.keys(STYLE_META) as (keyof typeof STYLE_META)[]) {
    const { s, moving } = swing(style, 0, 0.7, 10)
    expect(moving, style).toBe(false)
    expect(s.at, style).toBe(0.7)
  }
})
