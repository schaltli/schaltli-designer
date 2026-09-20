"use client"

/** A string. The plainest row there is, and the shape every other follows. */

import { useId } from "react"
import { FIELD, PropertyRow } from "./field-shell"

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
