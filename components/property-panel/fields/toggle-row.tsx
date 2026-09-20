"use client"

/**
 * A yes/no, with the sentence that says what "on" means.
 *
 * The panel used to put bare `<input type="checkbox">` elements in with
 * whatever label happened to fit. A switch is easier to hit and, more
 * usefully, it leaves room for the sentence - "Ignore the icon's own
 * colours" says something the word "Flatten" never could.
 */

import { useId } from "react"
import { FieldBox, FIELD, Ornament, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface ToggleRowProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** What being on means, in a few words. */
  text: string
  hint?: string
}

export function ToggleRow({ label, checked, onChange, text, hint }: ToggleRowProps) {
  const id = useId()
  return (
    <PropertyRow label={label} hint={hint}>
      <FieldBox>
        <label htmlFor={id} className={cn(FIELD, "cursor-pointer pr-11")}>
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="absolute size-0 opacity-0"
          />
          <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">{text}</span>
        </label>
        <Ornament>
          <span
            aria-hidden
            className={cn(
              "relative inline-block h-[15px] w-7 rounded-full border transition-colors",
              checked ? "border-[var(--sb-accent)] bg-[var(--sb-accent)]" : "border-border bg-background",
            )}
          >
            <span
              className={cn(
                "absolute top-[2px] size-[11px] rounded-full bg-white shadow transition-all",
                checked ? "right-[2px]" : "left-[2px]",
              )}
            />
          </span>
        </Ornament>
      </FieldBox>
    </PropertyRow>
  )
}
