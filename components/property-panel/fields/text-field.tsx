"use client"

/** A string. The plainest row there is, and the shape every other follows. */

import { useId } from "react"
import { FIELD, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface TextFieldProps {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  /**
   * What the field wants, shown while it is empty. This is where an
   * explanation belongs when it is short enough - the labels used to carry
   * it and grew two lines long.
   */
  placeholder?: string
  hint?: string
  id?: string
}

export function TextField({ label, value, onChange, placeholder, hint, id }: TextFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <PropertyRow label={label} hint={hint} htmlFor={fieldId}>
      <input
        id={fieldId}
        type="text"
        className={FIELD}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </PropertyRow>
  )
}

export interface TextPairProps {
  label: string
  values: [string | undefined, string | undefined]
  onChange: (index: 0 | 1, value: string) => void
  /** What each box is: a switch state's "Read value" and "Write value". */
  names: readonly [string, string]
  placeholders?: readonly [string, string]
  hint?: string
}

/**
 * Two strings that are one property, side by side - the pair layout
 * `NumberPair` already has, for text.
 *
 * Not a fifteenth kind of field: it is `TextField` twice in the width of
 * one, for the case where the two only mean anything together. A switch
 * state's read value and write value are that case - "off" going out is the
 * answer to "off" coming in - and giving them a row each costs a line per
 * state for no gain.
 */
export function TextPair({ label, values, onChange, names, placeholders, hint }: TextPairProps) {
  const auto = useId()
  const box = (i: 0 | 1) => (
    <input
      key={i}
      id={i === 0 ? auto : undefined}
      aria-label={names[i]}
      type="text"
      className={cn(FIELD, "min-w-0 flex-1")}
      value={values[i] ?? ""}
      placeholder={placeholders?.[i]}
      onChange={(e) => onChange(i, e.target.value)}
    />
  )
  return (
    <PropertyRow label={label} hint={hint} htmlFor={auto}>
      <div className="flex gap-2">
        {box(0)}
        {box(1)}
      </div>
    </PropertyRow>
  )
}
