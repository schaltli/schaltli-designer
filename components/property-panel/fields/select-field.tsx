"use client"

/**
 * A choice. One list widget for the whole panel.
 *
 * There were two: the shadcn `<Select>` in ten panels and a native
 * `<select>` with its own class string in the Software Button and the
 * Switch - different heights, different chevrons, the same job. A native
 * element wins here because the panel has no need for rich option rows and
 * a native list is the one that behaves on a touch panel.
 */

import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { FieldBox, FIELD, Leading, Ornament, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps {
  label: string
  value: string | undefined
  options: readonly SelectOption[]
  onChange: (value: string) => void
  hint?: string
  /** Shown as a greyed first entry while nothing is chosen. */
  placeholder?: string
  /** Sits at the right edge, before the chevron: a topic's type, say. */
  badge?: ReactNode
  /** Sits at the left edge, before the text: a colour swatch. */
  leading?: ReactNode
  id?: string
  className?: string
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder,
  badge,
  leading,
  id,
  className,
}: SelectFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const empty = value === undefined || value === ""
  return (
    <PropertyRow label={label} hint={hint} htmlFor={fieldId}>
      <FieldBox className={className}>
        <select
          id={fieldId}
          className={cn(
            FIELD,
            "cursor-pointer appearance-none pr-7",
            badge && "pr-[48px]",
            leading && "pl-7",
            empty && placeholder && "font-normal text-muted-foreground",
          )}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {placeholder ? (
            <option value="" disabled={false}>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {leading ? <Leading>{leading}</Leading> : null}
        <Ornament>
          {badge}
          <ChevronDown className="size-3 text-muted-foreground" strokeWidth={2.5} />
        </Ornament>
      </FieldBox>
    </PropertyRow>
  )
}

/** The little pill that says what a topic carries: `number`, `text`. */
export function TypeBadge({ kind }: { kind: "number" | "text" | "json" }) {
  const tone =
    kind === "number"
      ? "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
      : kind === "json"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
        : "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
  return <span className={cn("rounded-full px-1.5 py-[3px] text-[10px] font-semibold leading-none", tone)}>{kind}</span>
}
