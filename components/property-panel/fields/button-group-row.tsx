"use client"

/**
 * Several commands of equal weight, side by side in the control column:
 * the alignment buttons, the placeholder tokens, "Open for editing".
 *
 * They only existed in the multi-selection panel before, stacked full width
 * down the panel. Here they wrap in the column like everything else, so a
 * row of three costs one row.
 */

import type { ReactNode } from "react"
import { PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface RowButton {
  label: string
  onClick: () => void
  icon?: ReactNode
  disabled?: boolean
  /** For an icon-only button. */
  title?: string
}

export interface ButtonGroupRowProps {
  /** May be empty: some groups are the whole row and need no name. */
  label: string
  buttons: readonly RowButton[]
  hint?: string
}

export function ButtonGroupRow({ label, buttons, hint }: ButtonGroupRowProps) {
  return (
    <PropertyRow label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.onClick}
            disabled={b.disabled}
            title={b.title ?? b.label}
            className={cn(
              "inline-flex h-[26px] items-center gap-1 rounded-md border border-border bg-background px-2",
              "text-[11.5px] font-medium transition-colors hover:bg-muted",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {b.icon}
            {b.label}
          </button>
        ))}
      </div>
    </PropertyRow>
  )
}
