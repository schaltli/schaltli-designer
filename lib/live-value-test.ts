// The test value an open live value editor sets (docs/2026-10-07-live-values.md,
// «The rule form»; tasks/live-values-todo.md, Task 10): while it is set, the
// canvas reads that value for that source instead of the example, so moving
// the slider shows what the device would show. One at a time, cleared when
// the editor closes. A store rather than props: the editor sits in the
// property panel, the canvas beside it, and nothing between them needs it.

import { useSyncExternalStore } from "react"
import type { Source } from "@/lib/live-value"

export interface LiveValueTest {
  source: Source
  /** undefined: nothing has arrived. */
  value: string | undefined
}

let current: LiveValueTest | null = null
const listeners = new Set<() => void>()

export function setLiveValueTest(test: LiveValueTest | null): void {
  current = test
  listeners.forEach((listener) => listener())
}

export function useLiveValueTest(): LiveValueTest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => null,
  )
}

/** Whether a reference is the source under test. */
export function isTested(test: LiveValueTest | null, reference: { namespace: string; path: string }): boolean {
  return !!test && test.source.namespace === reference.namespace && test.source.path === reference.path
}
