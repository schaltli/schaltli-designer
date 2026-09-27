// What a hand asked a control to become in the preview, and when an answer
// from the installation ends that request (docs/2026-09-17-settable-level.md,
// decision 6c, and the changes of 2026-09-27). The devices keep the same
// bookkeeping - the 4.3B and the knob in their main loops, the app in
// MainActivity - so the preview and the panels in the van show one thing.
// No I/O: the editor holds the state, this says what it means.

export interface AskedValue {
  /** The value asked for, as it was published. */
  value: string
  /** What the topic said when the request began; a repeat of it is no answer. */
  seen: string | undefined
  /** A level still under the hand: no answer ends the request yet. */
  holding?: boolean
  /** A released level: until when only the answer to `value` ends it. */
  awaitUntil?: number
}

/** How long a released level waits for the answer to the value it was released on. */
export const LEVEL_AWAIT_MS = 2500

/** At most one level command per this many ms while dragging; the release always goes. */
export const LEVEL_PUBLISH_MIN_MS = 100

/** Two level payloads that mean the same number ("40" and "40.0"). */
export function sameLevel(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false
  const x = Number.parseFloat(a)
  const y = Number.parseFloat(b)
  if (Number.isNaN(x) || Number.isNaN(y)) return a.trim() === b.trim()
  return Math.abs(x - y) <= 0.001
}

/**
 * Whether a message on the request's topic ends it.
 *
 * A level under the hand: never - the hand is still asking. A released
 * level: when it answers the value it was released on, or once the wait has
 * run out (then the installation's word wins, whatever it says). Anything
 * else - a Switch's request - on any answer that is not a repeat of what the
 * topic already said.
 */
export function askedValueAnswered(held: AskedValue, message: string, now: number): boolean {
  if (held.holding) return false
  if (held.awaitUntil !== undefined) return sameLevel(message, held.value) || now >= held.awaitUntil
  return message !== held.seen
}
