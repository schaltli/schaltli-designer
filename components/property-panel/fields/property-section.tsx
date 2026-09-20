"use client"

/**
 * A section of the property panel, and the memory of whether it is open.
 *
 * Seven positions in one order for every object - Content, Data or Action,
 * Shape, the list, Text, Colour, Frame - and a section an object does not
 * need is simply left out; none ever swaps place
 * (docs/2026-09-20-property-panel.md, decisions 1 and 2). The heading's
 * *name* fits the object, though: position 4 is "States" on a switch and
 * "Calibration" on a bar, because a heading that said "List" over the
 * switch's states would be true and useless.
 *
 * Every section keeps its heading, even holding a single row. About fifteen
 * of them do, and a heading costs 20 px plus a gap to show 28 px of content -
 * but the promise is "the same sections in the same order everywhere", and a
 * font row that sometimes sits under "Text" and sometimes floats free is
 * exactly the arbitrariness the rebuild removes. Every heading is also the
 * handle that collapses it.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "screenbee.panelSections"

/**
 * Which sections are collapsed, by heading, across every object.
 *
 * Not in the project file: that would make opening a twisty a change to the
 * project, and leave the recovery copy stale. Per *name* rather than per
 * object type, because the names are shared vocabulary - somebody who never
 * calibrates anything loses that section once, everywhere - and because
 * "Calibration" closed has nothing to say about "States".
 */
function readCollapsed(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {}
  } catch {
    // A private window, blocked site data, or something else in that key:
    // the panel opens with its defaults, which is no worse than a first run.
    return {}
  }
}

function writeCollapsed(state: Record<string, boolean>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Nothing to do and nothing to say: the section still opens and closes,
    // it just will not be remembered.
  }
}

export interface PropertySectionProps {
  /** The heading, which is also the key the collapsed state is kept under. */
  title: string
  /**
   * What the heading says on its right while closed - "20, 120 · 240 × 56",
   * "2 points", "Helvetica Bold 12px". Closed sections are the normal state
   * for anything already settled, so this is what the panel reads like most
   * of the time.
   */
  summary?: string
  /**
   * Something inside wants attention - an unregistered topic, say. The
   * summary turns amber and says so, because a closed section would
   * otherwise hide it completely. The section does not open itself: that
   * would overrule the author and make the panel jump.
   */
  warning?: boolean
  /** "Frame" starts closed: those values are dragged on the canvas. */
  defaultCollapsed?: boolean
  children: ReactNode
}

export function PropertySection({
  title,
  summary,
  warning,
  defaultCollapsed = false,
  children,
}: PropertySectionProps) {
  // Starts from the default on the server and on the first paint, then takes
  // what was remembered - reading localStorage during render would differ
  // between server and client and React would complain about the mismatch.
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    const stored = readCollapsed()[title]
    if (typeof stored === "boolean") setCollapsed(stored)
  }, [title])

  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const now = !was
      const state = readCollapsed()
      state[title] = now
      writeCollapsed(state)
      return now
    })
  }, [title])

  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex h-5 w-full items-center gap-1.5 text-left"
      >
        <Chevron className="size-3 shrink-0 text-muted-foreground" strokeWidth={2.5} />
        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-foreground/70">
          {title}
        </span>
        {summary ? (
          <>
            <span className="flex-1" />
            <span
              className={cn(
                "min-w-0 truncate text-[11px] font-normal",
                warning
                  ? "rounded-full bg-amber-100 px-[7px] py-[3px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100"
                  : "text-muted-foreground",
              )}
            >
              {summary}
            </span>
          </>
        ) : null}
      </button>
      {collapsed ? null : <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </section>
  )
}

/**
 * The stack a rebuilt panel returns: its sections, 16 px apart.
 *
 * Only the spacing. The padding and the `@container/panel` that the rows
 * measure against belong to the panel frame itself (property-panel.tsx), so
 * that the fold happens at 380 px of *panel* rather than of whatever is
 * left inside it.
 */
export function PropertySections({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}
