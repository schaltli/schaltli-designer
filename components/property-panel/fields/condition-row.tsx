"use client"

/**
 * A condition: an operator and a value, on one line.
 *
 * Four panels asked this same question - when is a panel shown, when does a
 * line grow an arrow, which icon a value picks - and each had written out
 * its own operator list. They are one list now
 * (lib/comparison-operators.ts).
 *
 * The operator keeps a fixed 66 px so the value fields line up down the
 * panel whatever operator is chosen.
 */

import { useId } from "react"
import { ChevronDown } from "lucide-react"
import { COMPARISON_OPERATORS, normalizeOperator, type ComparisonOperator } from "@/lib/comparison-operators"
import { FieldBox, FIELD, Ornament, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface ConditionRowProps {
  label: string
  operator: string | undefined
  value: string | undefined
  onOperatorChange: (operator: ComparisonOperator) => void
  onValueChange: (value: string) => void
  hint?: string
  placeholder?: string
}

export function ConditionRow({
  label,
  operator,
  value,
  onOperatorChange,
  onValueChange,
  hint,
  placeholder = "Value",
}: ConditionRowProps) {
  const opId = useId()
  return (
    <PropertyRow label={label} hint={hint} htmlFor={opId}>
      <div className="flex gap-2">
        <FieldBox className="w-[66px] shrink-0">
          <select
            id={opId}
            className={cn(FIELD, "cursor-pointer appearance-none pr-5")}
            value={normalizeOperator(operator)}
            onChange={(e) => onOperatorChange(e.target.value as ComparisonOperator)}
          >
            {COMPARISON_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <Ornament className="right-1.5">
            <ChevronDown className="size-3 text-muted-foreground" strokeWidth={2.5} />
          </Ornament>
        </FieldBox>
        <input
          type="text"
          className={FIELD}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
        />
      </div>
    </PropertyRow>
  )
}
