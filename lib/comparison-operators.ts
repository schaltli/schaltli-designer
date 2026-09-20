/**
 * The operators a condition can use, in one place.
 *
 * This list was written out four times: byte-identical in
 * panel-properties.tsx, tab-control-properties.tsx and
 * mqtt-data-line-properties.tsx, and a fourth time in
 * mqtt-icon-field-properties.tsx that quietly disagreed - it offered `=`
 * where the others offer `==`, and left out `!=` entirely. An icon rule
 * written there and a panel condition written next to it were comparing
 * with different words for the same thing, and only one of them was what
 * `evaluateCondition` in lib/render-screen.ts actually answers to.
 *
 * These six are exactly what that function implements: `==` and `!=`
 * compare trimmed strings, the other four compare numbers.
 */

export const COMPARISON_OPERATORS = ["==", "!=", ">", ">=", "<", "<="] as const

export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number]

export const DEFAULT_COMPARISON_OPERATOR: ComparisonOperator = "=="

/**
 * What a stored operator means now. `=` is the odd one the icon-rule panel
 * used to write; it meant the same as `==` and is read as such, so no
 * project has to be migrated for it.
 */
export function normalizeOperator(operator: string | undefined): ComparisonOperator {
  if (operator === "=") return "=="
  return (COMPARISON_OPERATORS as readonly string[]).includes(operator ?? "")
    ? (operator as ComparisonOperator)
    : DEFAULT_COMPARISON_OPERATOR
}
