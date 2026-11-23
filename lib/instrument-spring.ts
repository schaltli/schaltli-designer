/**
 * A styled needle's motion (docs/2026-11-23-instrument-styles.md,
 * «Motion»): a damped spring from where the needle stands to where the
 * value puts it, with the style's frequency and damping ratio, stopped at
 * the scale's two pins as a real needle is.
 *
 * Only the transient is drawn this way, and it need not match a device's
 * frame for frame; the resting position is exactly the value's, so the
 * picture at rest is the static one (plan decision 6).
 */

export interface Spring {
  frequency: number
  damping: number
}

export interface SpringState {
  /** Where the needle stands, 0..1 (a little past either end against a pin). */
  at: number
  velocity: number
  target: number
  /** The time of the last step, ms. */
  last: number
}

/** How far past either end the pins let a needle swing. */
export const PIN = 0.025

export function restingAt(at: number): SpringState {
  return { at, velocity: 0, target: at, last: Number.NaN }
}

/**
 * Advances `s` to `now` (ms) towards `target`. Returns whether the needle
 * is still moving. Four sub-steps per call keep a slow frame from
 * overshooting the spring itself; a frame longer than 50 ms is taken as
 * 50 ms (a tab in the background must not fling the needle).
 */
export function stepSpring(s: SpringState, target: number, now: number, spring: Spring): boolean {
  s.target = target
  const dt = Number.isNaN(s.last) ? 0 : Math.min(0.05, Math.max(0, (now - s.last) / 1000))
  s.last = now
  const w = 2 * Math.PI * spring.frequency
  for (let k = 0; k < 4; k++) {
    const h = dt / 4
    s.velocity += (w * w * (target - s.at) - 2 * spring.damping * w * s.velocity) * h
    s.at += s.velocity * h
    if (s.at < -PIN) {
      s.at = -PIN
      s.velocity = -s.velocity * 0.3
    }
    if (s.at > 1 + PIN) {
      s.at = 1 + PIN
      s.velocity = -s.velocity * 0.3
    }
  }
  if (Math.abs(target - s.at) < 2e-4 && Math.abs(s.velocity) < 2e-3) {
    s.at = target
    s.velocity = 0
    return false
  }
  return true
}
