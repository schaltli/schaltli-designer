import { useSyncExternalStore } from "react"
import { heardMessage, type HeardTopic } from "@/lib/heard-topic"

// What the designer has heard on its broker, one store per tab
// (docs/2026-10-14-topic-discovery.md, decisions 1-2): fed by the
// background listener (components/broker-listener.tsx), read by the Topic
// Picker and «Listen to Broker». In memory only, gone with the tab.
//
// Readers are told at most every NOTIFY_MS, not per message: the user's van
// sends several messages a second on `pkw` alone, and a redraw per message
// would keep the editor busy. A topic's entry is a new object only when it
// changed, so a row that reads its own topic redraws only then.

export const NOTIFY_MS = 250
/**
 * A guard, not a limit anyone should meet: past it a new topic is counted in
 * `overflow` and not kept. The user's van carries a few hundred.
 */
export const MAX_TOPICS = 5000

type Listener = () => void

export type ListenState = "off" | "connecting" | "listening" | "no broker"

export interface HeardSnapshot {
  /** Whether the designer listens, and how far it got. */
  state: ListenState
  /** Why there is no broker: what the last attempt said. */
  error?: string
  topics: ReadonlyMap<string, HeardTopic>
  /** Messages heard, all topics together. */
  messages: number
  /** New topics not kept for MAX_TOPICS. */
  overflow: number
}

class BrokerStore {
  private topics = new Map<string, HeardTopic>()
  private messages = 0
  private overflow = 0
  private state: ListenState = "off"
  private error: string | undefined
  private snapshot: HeardSnapshot = { state: "off", topics: new Map(), messages: 0, overflow: 0 }
  private listeners = new Set<Listener>()
  private timer: ReturnType<typeof setTimeout> | null = null

  hear(topic: string, payload: string, retained: boolean, at = Date.now()): void {
    const prev = this.topics.get(topic)
    if (!prev && this.topics.size >= MAX_TOPICS) {
      this.overflow++
      this.schedule()
      return
    }
    this.topics.set(topic, heardMessage(topic, prev, payload, retained, at))
    this.messages++
    this.schedule()
  }

  get(topic: string): HeardTopic | undefined {
    return this.snapshot.topics.get(topic)
  }

  current(): HeardSnapshot {
    return this.snapshot
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setState(state: ListenState, error?: string): void {
    if (state === this.state && error === this.error) return
    this.state = state
    this.error = error
    this.flush()
  }

  /** Forgets everything heard - for a broker changed, and for tests. */
  clear(): void {
    this.topics.clear()
    this.messages = 0
    this.overflow = 0
    this.flush()
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), NOTIFY_MS)
  }

  private flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.snapshot = { state: this.state, error: this.error, topics: new Map(this.topics), messages: this.messages, overflow: this.overflow }
    for (const l of this.listeners) l()
  }
}

export const brokerStore = new BrokerStore()

const EMPTY: HeardSnapshot = { state: "off", topics: new Map(), messages: 0, overflow: 0 }

/** Everything heard, as of the last notification. */
export function useHeardTopics(): HeardSnapshot {
  return useSyncExternalStore(brokerStore.subscribe, () => brokerStore.current(), () => EMPTY)
}

/** One topic as heard, or undefined; redraws only when it changed. */
export function useHeardTopic(topic: string | undefined): HeardTopic | undefined {
  return useSyncExternalStore(
    brokerStore.subscribe,
    () => (topic ? brokerStore.get(topic) : undefined),
    () => undefined,
  )
}

// Whether the designer listens: the status bar's «Listening», kept per
// browser, on unless switched off (decided 2026-10-14).
const LISTENING_KEY = "schaltli.listening"

export function storedListening(): boolean {
  try {
    return window.localStorage.getItem(LISTENING_KEY) !== "false"
  } catch {
    return true
  }
}

const listeningListeners = new Set<Listener>()
let listening: boolean | null = null
let generation = 0

/**
 * Starts the listener over, on the broker as now stored, forgetting what was
 * heard - for «Connect» in «Listen to Broker»'s connection settings.
 */
export function restartListening(): void {
  generation++
  brokerStore.clear()
  for (const l of listeningListeners) l()
}

/** Which start of the listener this is; it changes on restartListening(). */
export function useListenGeneration(): number {
  return useSyncExternalStore(
    (l) => {
      listeningListeners.add(l)
      return () => listeningListeners.delete(l)
    },
    () => generation,
    () => 0,
  )
}

/** The switch, shared by everything that shows it. */
export function useListening(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      listeningListeners.add(l)
      return () => listeningListeners.delete(l)
    },
    () => (listening ??= storedListening()),
    () => false,
  )
  return [on, setListening]
}

export function setListening(on: boolean): void {
  listening = on
  try {
    window.localStorage.setItem(LISTENING_KEY, String(on))
  } catch {
    // No storage (private window): for this page only.
  }
  for (const l of listeningListeners) l()
}
