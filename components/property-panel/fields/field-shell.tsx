"use client"

/**
 * The shell every property in the panel sits in, and the geometry it obeys.
 * Written for the rebuild agreed 2026-09-20 (docs/2026-09-20-property-panel.md).
 *
 * Two edges, and everything lines up on them. The name stands in a fixed
 * 124 px column on the left; the control fills what is left, up to 360 px,
 * and inside it the text starts at one inset while the unit, the chevron and
 * the type badge sit at the other. Before this, the value's text began at six
 * different places depending on the row - a number was right-aligned in a
 * 66 px box and fluttered against itself as digits were added - and the panel
 * read as untidy for a reason nobody could name.
 *
 * The control has no border at rest, only a quiet fill; the border and a
 * white ground arrive under the pointer, and the accent on focus. Twenty
 * rows stop being twenty rectangles without a field stopping being a field.
 *
 * The panel is resizable between 280 and 900 px (project-editor.tsx), so the
 * column is a container query, not a media query: below 380 px of *panel*
 * the name folds back above its control.
 */

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Marks the panel as the container the rows measure themselves against. */
export const PANEL_CONTAINER = "@container/panel"

/** The control itself: quiet fill, border on hover, accent on focus. */
export const FIELD =
  "flex h-7 w-full items-center rounded-md border border-transparent bg-muted px-2 " +
  "text-[12.5px] font-medium text-foreground transition-colors " +
  "placeholder:font-normal placeholder:text-muted-foreground " +
  "hover:border-border hover:bg-background " +
  "focus:border-[var(--sb-accent)] focus:bg-background focus:outline-none " +
  "focus-visible:border-[var(--sb-accent)] focus-visible:outline-none"

/** An icon-only button that only shows its edges when you reach for it. */
export const GHOST_BUTTON =
  "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] " +
  "border border-transparent bg-transparent p-0 opacity-60 transition " +
  "hover:border-border hover:bg-background hover:opacity-100"

/** What sits at the control's right edge: a unit, a chevron, a badge. */
export function Ornament({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-[7px]",
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * What sits at the control's left edge, before the text: a colour swatch, an
 * icon's thumbnail. Only for the two that *are* the value rather than an
 * ornament of it - a colour is what the row is about, and the fill's own box
 * edge is what lines the column up, so leading with them costs nothing.
 */
export function Leading({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-2 top-1/2 flex -translate-y-1/2 items-center">
      {children}
    </span>
  )
}

/** Wraps a control that carries a Leading or an Ornament. */
export function FieldBox({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("relative block w-full", className)}>{children}</span>
}

export interface PropertyRowProps {
  /** Short. What the field wants goes in its placeholder, not in here. */
  label: string
  /** The one sentence that would not fit: shown on a small question mark. */
  hint?: string
  /** Links the name to the control, so clicking it focuses the field. */
  htmlFor?: string
  children: ReactNode
  /** A number field makes its own name a drag handle; see NumberField. */
  labelProps?: React.HTMLAttributes<HTMLElement>
  className?: string
}

/**
 * One property: its name on the left, its control on the right.
 *
 * Below 380 px of panel the two stack instead, because a 124 px column out
 * of 280 leaves the control too little to be worth anything.
 */
export function PropertyRow({ label, hint, htmlFor, children, labelProps, className }: PropertyRowProps) {
  const Tag = htmlFor ? "label" : "span"
  return (
    <div className={cn("flex flex-col gap-1 @[380px]/panel:flex-row @[380px]/panel:gap-1", className)}>
      <Tag
        {...(htmlFor ? { htmlFor } : {})}
        {...labelProps}
        className={cn(
          "flex shrink-0 items-center gap-1 text-xs font-medium leading-tight text-muted-foreground",
          "@[380px]/panel:w-[124px] @[380px]/panel:pt-[7px]",
          labelProps?.className,
        )}
      >
        {label}
        {hint ? <FieldHint text={hint} /> : null}
      </Tag>
      <div className="min-w-0 flex-1 @[380px]/panel:max-w-[360px]">{children}</div>
    </div>
  )
}

/**
 * The question mark that carries a sentence the label has no room for.
 *
 * The explanations used to live in the label itself - "Step (when set by a
 * finger)", "Topic (setpoint marker, optional)" - which is why the names
 * were long enough to need two lines. A permanent grey line under the row
 * would have spent the height the rebuild just saved, so the sentence waits
 * here instead. `title` rather than a tooltip component: it must work for a
 * keyboard and a screen reader without opening anything.
 */
export function FieldHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="note"
      tabIndex={0}
      className={
        "inline-flex h-[13px] w-[13px] shrink-0 cursor-help items-center justify-center rounded-full " +
        "border border-border text-[9px] font-semibold leading-none text-muted-foreground " +
        "hover:border-[var(--sb-accent)] hover:text-[var(--sb-accent)] " +
        "focus-visible:border-[var(--sb-accent)] focus-visible:outline-none"
      }
    >
      ?
    </span>
  )
}

/** A line of prose under a row, for what a hint cannot carry in one breath. */
export function FieldNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-snug text-muted-foreground @[380px]/panel:ml-[128px]">{children}</p>
  )
}
