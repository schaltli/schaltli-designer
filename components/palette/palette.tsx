"use client"

/**
 * The palette (docs/2026-11-06-palette.md): what goes onto a screen, in one
 * window like Visio's Shapes - the tabs «Parts» and «Prebuilt», a search
 * field, and below it the open tab's entries as rows in groups. It floats
 * over the canvas (moved by its title bar, resized at its edges, kept inside
 * the window), is docked as a column beside Screens, or is minimized to a
 * rail of the two tabs' icons. It never closes altogether, so it is always
 * found in the same place. Ctrl+K opens it and puts the focus in its search.
 *
 * Everything but the search text is remembered per browser, in one key.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Minus, PanelLeft, PictureInPicture2, Search, ToyBrick } from "lucide-react"
import { cn } from "@/lib/utils"

export type PaletteTab = "parts" | "prebuilt"
type Mode = "float" | "dock"

export interface PaletteState {
  mode: Mode
  minimized: boolean
  tab: PaletteTab
  // Floating: its top left corner and size, in the window's pixels; null
  // until it is first placed, then beside the canvas's top left corner.
  x: number | null
  y: number | null
  width: number
  height: number
  // The groups open on each tab; undefined until the tab was first shown,
  // which opens its first group (decision 8). "all": every group - nothing
  // in the palette sets it; the e2e suite starts with it.
  open: Partial<Record<PaletteTab, string[] | "all">>
}

export const PALETTE_KEY = "schaltli.palette"
// The ribbon's tab before the palette: its first tab the first time.
const RIBBON_TAB_KEY = "schaltli.ribbonTab"
export const DOCKED_WIDTH = 264
const MIN_WIDTH = 220
const MIN_HEIGHT = 240
// What of a floating palette stays inside the window at least: its title bar.
const TITLE_BAR = 36

function initialState(): PaletteState {
  const fallback: PaletteState = { mode: "float", minimized: false, tab: "parts", x: null, y: null, width: 280, height: 560, open: {} }
  try {
    const saved = window.localStorage.getItem(PALETTE_KEY)
    if (saved) return { ...fallback, ...JSON.parse(saved) }
    if (window.localStorage.getItem(RIBBON_TAB_KEY) === "prebuilt") return { ...fallback, tab: "prebuilt" }
  } catch {
    // Not remembered: as the first time.
  }
  return fallback
}

/** Within the window: as large as it allows, its title bar inside it. */
function keptInside(s: PaletteState, view: { width: number; height: number }): PaletteState {
  if (s.x === null || s.y === null) return s
  const width = Math.max(MIN_WIDTH, Math.min(s.width, view.width))
  const height = Math.max(MIN_HEIGHT, Math.min(s.height, view.height))
  const x = Math.max(0, Math.min(s.x, view.width - width))
  const y = Math.max(0, Math.min(s.y, view.height - TITLE_BAR))
  return x === s.x && y === s.y && width === s.width && height === s.height ? s : { ...s, x, y, width, height }
}

/** What a tab's list is given: the search, and which of its groups are open. */
export interface PaletteListProps {
  query: string
  isOpen: (group: string, index: number) => boolean
  // `groups`: the list's groups in order - the first open until anything
  // was toggled, all of them where every group is open.
  toggle: (group: string, open: boolean, groups: string[]) => void
}

export interface PaletteProps {
  parts: (list: PaletteListProps) => ReactNode
  prebuilt: (list: PaletteListProps) => ReactNode
  // Where the palette shows the tab asked for from outside («Listen to
  // Broker» pointing to the devices): a new value opens that tab.
  request?: { tab: PaletteTab; at: number } | null
  // Nothing to draw on («Manage Screens»): shown, not usable.
  disabled?: boolean
}

/** The Prebuilt tab's icon: two toy bricks on each other (the ribbon's, 2026-11-05). */
export function ToyBricks({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="14" width="13" height="7" rx="1" />
      <path d="M4 14v-2h3v2" />
      <rect x="9" y="5" width="13" height="7" rx="1" />
      <path d="M11 5V3h3v2" />
      <path d="M17 5V3h3v2" />
    </svg>
  )
}

const TAB_ICON: Record<PaletteTab, (p: { className?: string }) => ReactNode> = {
  parts: ({ className }) => <ToyBrick className={className} aria-hidden />,
  prebuilt: ToyBricks,
}
const TAB_LABEL: Record<PaletteTab, string> = { parts: "Parts", prebuilt: "Prebuilt" }

export function Palette({ parts, prebuilt, request, disabled }: PaletteProps) {
  const [state, setState] = useState<PaletteState>(() => ({ mode: "float", minimized: false, tab: "parts", x: null, y: null, width: 280, height: 560, open: {} }))
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState("")
  const slotRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [focusAsked, setFocusAsked] = useState(0)

  // Read once in the browser (not during the server's render).
  useLayoutEffect(() => {
    setState(initialState())
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(PALETTE_KEY, JSON.stringify(state))
    } catch {
      // Not remembered, still shown.
    }
  }, [state, loaded])

  // Floating for the first time: beside the canvas's top left corner, where
  // the slot stands.
  useLayoutEffect(() => {
    if (!loaded || state.mode !== "float" || state.minimized || state.x !== null) return
    const at = slotRef.current?.getBoundingClientRect()
    const x = Math.round((at?.left ?? 0) + 12)
    const y = Math.round((at?.top ?? 0) + 12)
    setState((s) => keptInside({ ...s, x, y, height: Math.min(s.height, window.innerHeight - y - 24) }, { width: window.innerWidth, height: window.innerHeight }))
  }, [loaded, state.mode, state.minimized, state.x])

  // Kept inside the window when it shrinks.
  useEffect(() => {
    const onResize = () => setState((s) => keptInside(s, { width: window.innerWidth, height: window.innerHeight }))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const openPalette = useCallback((tab?: PaletteTab) => {
    setState((s) => ({ ...s, minimized: false, tab: tab ?? s.tab }))
    setFocusAsked((n) => n + 1)
  }, [])

  // Ctrl+K: open, and the focus in the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPalette])
  useEffect(() => {
    if (focusAsked) searchRef.current?.focus()
  }, [focusAsked])
  useEffect(() => {
    if (request) openPalette(request.tab)
  }, [request, openPalette])

  // Moved by its title bar, resized at its edges: pointer captured until let go.
  const drag = (e: React.PointerEvent, edges: { move?: boolean; e?: boolean; s?: boolean; w?: boolean }) => {
    if (e.button !== 0 || state.x === null || state.y === null) return
    e.preventDefault()
    const start = { px: e.clientX, py: e.clientY, x: state.x, y: state.y, width: state.width, height: state.height }
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px
      const dy = ev.clientY - start.py
      setState((s) => {
        let { x, width, height } = start
        let y = start.y
        if (edges.move) {
          x += dx
          y += dy
        }
        if (edges.e) width = Math.max(MIN_WIDTH, start.width + dx)
        if (edges.s) height = Math.max(MIN_HEIGHT, start.height + dy)
        if (edges.w) {
          width = Math.max(MIN_WIDTH, start.width - dx)
          x = start.x + start.width - width
        }
        return keptInside({ ...s, x, y, width, height }, { width: window.innerWidth, height: window.innerHeight })
      })
    }
    const up = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", up)
      target.removeEventListener("pointercancel", up)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", up)
    target.addEventListener("pointercancel", up)
  }

  const list: PaletteListProps = {
    query,
    isOpen: (group, index) => {
      const open = state.open[state.tab]
      return open === undefined ? index === 0 : open === "all" || open.includes(group)
    },
    toggle: (group, open, groups) =>
      setState((s) => {
        const was = s.open[s.tab]
        // The first time, what the list shows open is its first group.
        const now = new Set(was === "all" ? groups : (was ?? groups.slice(0, 1)))
        if (open) now.add(group)
        else now.delete(group)
        return { ...s, open: { ...s.open, [s.tab]: [...now] } }
      }),
  }

  const mode = state.minimized ? "minimized" : state.mode

  if (state.minimized) {
    return (
      <div ref={slotRef} className={cn("shrink-0", disabled && "pointer-events-none opacity-40")}>
        <nav
          aria-label="Palette"
          data-testid="palette-rail"
          data-palette-mode={mode}
          aria-disabled={disabled || undefined}
          className="flex h-full w-11 flex-col items-center gap-1.5 border-r border-border bg-card pt-2.5"
        >
          {(["parts", "prebuilt"] as const).map((tab) => {
            const Icon = TAB_ICON[tab]
            return (
              <button
                key={tab}
                type="button"
                data-testid={`palette-rail-${tab}`}
                aria-label={TAB_LABEL[tab]}
                title={`${TAB_LABEL[tab]} (Ctrl+K)`}
                onClick={() => openPalette(tab)}
                className="inline-flex size-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent"
              >
                <Icon className="size-5" />
              </button>
            )
          })}
        </nav>
      </div>
    )
  }

  const floating = state.mode === "float"
  const window_ = (
    <section
      aria-label="Palette"
      data-testid="palette"
      data-palette-mode={mode}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex flex-col overflow-hidden bg-card text-sm",
        floating ? "fixed z-40 rounded-lg border border-border shadow-xl" : "h-full border-r border-border",
        disabled && "pointer-events-none opacity-40",
      )}
      style={floating ? { left: state.x ?? 0, top: state.y ?? 0, width: state.width, height: state.height, visibility: state.x === null ? "hidden" : undefined } : { width: DOCKED_WIDTH }}
    >
      <div
        data-testid="palette-titlebar"
        onPointerDown={floating ? (e) => (e.target as HTMLElement).closest("button") || drag(e, { move: true }) : undefined}
        className={cn("flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 pl-2.5 pr-1.5 select-none", floating && "cursor-move")}
      >
        {floating && (
          <svg viewBox="0 0 24 24" className="size-3.5 fill-muted-foreground/70" aria-hidden>
            {[6, 12, 18].flatMap((cy) => [9, 15].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" />))}
          </svg>
        )}
        <span className="flex-1 text-[13px] font-semibold">Palette</span>
        <button
          type="button"
          data-testid="palette-dock"
          aria-label={floating ? "Dock left" : "Float"}
          title={floating ? "Dock left" : "Float"}
          onClick={() => setState((s) => ({ ...s, mode: s.mode === "float" ? "dock" : "float" }))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {floating ? <PanelLeft className="size-4" /> : <PictureInPicture2 className="size-4" />}
        </button>
        <button
          type="button"
          data-testid="palette-minimize"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => setState((s) => ({ ...s, minimized: true }))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Minus className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 items-end gap-0.5 border-b border-border px-2.5 pt-2" aria-label="Palette tabs">
        {(["parts", "prebuilt"] as const).map((tab) => {
          const Icon = TAB_ICON[tab]
          const shown = state.tab === tab
          return (
            <button
              key={tab}
              type="button"
              data-testid={`palette-tab-${tab}`}
              aria-pressed={shown}
              onClick={() => setState((s) => ({ ...s, tab }))}
              className={cn(
                "relative -mb-px inline-flex items-center gap-1.5 rounded-t-md border border-transparent px-3 py-1 text-[13px] font-semibold",
                shown
                  ? "border-border border-b-transparent bg-card text-[var(--sb-accent)] before:absolute before:-inset-x-px before:-top-px before:h-[3px] before:rounded-t-md before:bg-[var(--sb-accent)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {TAB_LABEL[tab]}
            </button>
          )
        })}
      </div>

      <div className="shrink-0 p-2.5">
        <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 focus-within:ring-1 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search</span>
          <input
            ref={searchRef}
            type="search"
            data-testid="palette-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc clears the text; with none, it goes on to give up what is in hand.
              if (e.key === "Escape" && query) {
                e.stopPropagation()
                e.preventDefault()
                setQuery("")
              }
            }}
            placeholder={state.tab === "parts" ? "Search parts" : "Search prebuilts"}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:cursor-pointer"
          />
        </label>
      </div>

      {/* The tab's own: its groups in a PaletteScroll, a PaletteFooter under it. */}
      <div className="flex min-h-0 flex-1 flex-col" data-testid={`palette-list-${state.tab}`}>
        {state.tab === "parts" ? parts(list) : prebuilt(list)}
      </div>

      {floating && (
        <>
          <div data-testid="palette-resize-e" onPointerDown={(e) => drag(e, { e: true })} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
          <div data-testid="palette-resize-w" onPointerDown={(e) => drag(e, { w: true })} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
          <div data-testid="palette-resize-s" onPointerDown={(e) => drag(e, { s: true })} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
          <div data-testid="palette-resize-se" onPointerDown={(e) => drag(e, { e: true, s: true })} className="absolute bottom-0 right-0 size-3 cursor-nwse-resize" />
        </>
      )}
    </section>
  )

  // Docked it takes its column; floating, the slot stays empty and marks
  // where the canvas begins.
  return (
    <div ref={slotRef} className="shrink-0">
      {window_}
    </div>
  )
}

/** A group of rows: its name, its count, opening and closing. */
export function PaletteGroup({
  name,
  count,
  open,
  onToggle,
  children,
  testId,
  device,
}: {
  // A device's group: its name as the catalog has it ("" for none), for tests.
  device?: string
  name: string
  count: number
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
  testId?: string
}) {
  return (
    <div data-testid={testId} data-group={name} data-device={device}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(!open)}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold text-foreground/80 hover:bg-accent"
      >
        <svg viewBox="0 0 24 24" className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="flex-1 truncate">{name}</span>
        <span className="font-medium text-muted-foreground">{count}</span>
      </button>
      {open && <div className="flex flex-col gap-px pb-1.5 pl-3">{children}</div>}
    </div>
  )
}

/** A tab's groups, scrolling under the search. */
export function PaletteScroll({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">{children}</div>
}

/** Under a tab's groups: Prebuilt's count and Refresh. */
export function PaletteFooter({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">{children}</div>
}

/** One entry: its icon and its name; pressed, it is taken in hand. */
export function PaletteRow({
  label,
  icon,
  armed,
  disabled,
  tip,
  onPress,
  onClick,
  data,
}: {
  label: string
  icon: ReactNode
  armed?: boolean
  // Why it cannot be placed: greyed, told in its tooltip.
  disabled?: string
  tip?: string
  onPress?: () => void
  // After the press, when the button is let go on the row itself.
  onClick?: () => void
  data?: Record<string, string | undefined>
}) {
  return (
    <button
      type="button"
      {...data}
      data-armed={armed || undefined}
      aria-pressed={armed || undefined}
      aria-disabled={disabled ? true : undefined}
      title={disabled ?? tip}
      onMouseDown={(e) => {
        if (e.button !== 0 || disabled) return
        // No text selection or native drag while the row is carried away.
        e.preventDefault()
        onPress?.()
      }}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md border px-2 py-1 text-left text-[13px]",
        armed ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-accent",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {disabled && <span className="sr-only">{disabled}</span>}
    </button>
  )
}

/** Whether `text` holds what was typed, case and accents aside. */
export function matches(text: string, query: string): boolean {
  const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  return fold(text).includes(fold(query.trim()))
}
