"use client"

/**
 * The repeated part of an object: states, panels, rules, calibration points,
 * the points of a line.
 *
 * Five lists, four separate implementations, each with its own look - one
 * had move-up and move-down buttons, one a bordered card, one a bare grid of
 * inputs. They are one list now: an entry is a line with a summary, opens
 * when you want it, carries a grip to reorder and a cross to remove, and the
 * dashed button underneath adds another.
 *
 * Closed is the normal state. An entry says what it is on one line - "Aus ·
 * off", "== auto", "100 → 100 %" - so a list of eight is eight lines rather
 * than eight open forms.
 */

import { useState, type ReactNode } from "react"
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
}

export function ListItem({ title, summary, onRemove, children, defaultOpen = false }: ListItemProps) {
  const [open, setOpen] = useState(defaultOpen)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="rounded-[7px] border border-transparent bg-muted/60 transition-colors hover:border-border">
      <div className="flex h-[30px] items-center gap-[7px] pl-1 pr-1.5">
        <GripVertical className="size-3 shrink-0 cursor-grab text-muted-foreground/50" aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
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
