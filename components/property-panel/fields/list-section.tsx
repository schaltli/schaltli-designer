"use client"

/**
 * The repeated part of an object: states, panels, rules, calibration points,
 * the points of a line.
 *
 * Five lists, four separate implementations, each with its own look - one
 * had move-up and move-down buttons, one a bordered card, one a bare grid of
 * inputs. They are one list now: an entry is a line with a summary, opens
 * when you want it, carries a grip to drag it up or down and a cross to
 * remove it, and the dashed button underneath adds another.
 *
 * The grip is drawn only where it works. It was decoration for the first
 * four rounds - `cursor-grab` over nothing - until round 9 needed real
 * reordering for a Live Icon's rules, which are read top to bottom.
 *
 * Closed is the normal state. An entry says what it is on one line - "Aus ·
 * off", "== auto", "100 → 100 %" - so a list of eight is eight lines rather
 * than eight open forms.
 */

import { useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react"
import { GHOST_BUTTON } from "./field-shell"
import { cn } from "@/lib/utils"

export interface ListItemProps {
  /** Short: the entry's own number or name. */
  title: string
  /** The rest of the line: what this entry does, in a few words. */
  summary?: string
  onRemove?: () => void
  /** Held back until the entry is opened - a list of eight stays readable. */
  children?: ReactNode
  /** The first entry of a fresh list opens, so its fields are not hidden. */
  defaultOpen?: boolean
  /**
   * Where this entry sits, and what to do when it is dragged somewhere else.
   * Both or neither: without them the grip is not drawn at all, because a
   * handle that cannot move anything is worse than no handle.
   *
   * Order is the meaning in three of the five lists - a Live Icon's rules are
   * read top to bottom and the first match wins, a group's states are its
   * segments left to right, a switcher's panels are tried in turn - so this
   * is not a convenience.
   */
  index?: number
  onReorder?: (from: number, to: number) => void
}

export function ListItem({
  title,
  summary,
  onRemove,
  children,
  defaultOpen = false,
  index,
  onReorder,
}: ListItemProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [dragging, setDragging] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const Chevron = open ? ChevronDown : ChevronRight
  const movable = typeof index === "number" && typeof onReorder === "function"

  /**
   * Which entry the pointer is over, by asking the rows themselves rather
   * than counting DOM children: a section holds the entries, the "add"
   * button and sometimes a note, so position in the parent is not position
   * in the list.
   */
  const rowUnder = (clientY: number): number | null => {
    const parent = row.current?.parentElement
    if (!parent) return null
    const rows = Array.from(parent.querySelectorAll<HTMLElement>("[data-list-row]"))
    for (const el of rows) {
      const box = el.getBoundingClientRect()
      if (clientY >= box.top && clientY <= box.bottom) {
        const at = Number(el.dataset.listRow)
        return Number.isFinite(at) ? at : null
      }
    }
    return null
  }

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging) return
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const to = rowUnder(e.clientY)
    if (to !== null && to !== index) onReorder!(index!, to)
  }

  return (
    <div
      ref={row}
      data-list-row={index}
      className={cn(
        "rounded-[7px] border border-transparent bg-muted/60 transition-colors hover:border-border",
        dragging && "border-[var(--sb-accent)] opacity-70",
      )}
    >
      <div className="flex h-[30px] items-center gap-[7px] pl-1 pr-1.5">
        {movable ? (
          <span
            role="button"
            aria-label={`Move ${title}`}
            title="Drag to reorder"
            className="shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              setDragging(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical className="size-3" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-twisty=""
          className="flex min-w-0 flex-1 items-center gap-[7px] text-left"
        >
          <Chevron className="size-3 shrink-0 text-muted-foreground" strokeWidth={2.5} />
          <span className="shrink-0 text-xs font-semibold">{title}</span>
          {summary ? <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">{summary}</span> : null}
        </button>
        {onRemove ? (
          <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className={GHOST_BUTTON}>
            <X className="size-3 text-muted-foreground" />
          </button>
        ) : null}
      </div>
      {open && children ? (
        <div className="flex flex-col gap-[7px] border-t border-border/60 py-2 pl-1 pr-1.5">{children}</div>
      ) : null}
    </div>
  )
}

export function AddListItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[26px] w-full items-center justify-center gap-1.5 rounded-[7px]",
        "border border-transparent bg-transparent text-[11.5px] font-semibold text-[var(--sb-accent)]",
        "transition-colors hover:border-border hover:bg-background",
      )}
    >
      <Plus className="size-3" />
      {label}
    </button>
  )
}

/** What a list's collapsed heading says: "3 states", "2 points". */
export function listSummary(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
