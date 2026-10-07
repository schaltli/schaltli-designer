"use client"

/**
 * One live value, opened from its chip (docs/2026-10-07-live-values.md,
 * «The rule form»; mockup R3): where it reads from, how the value is
 * written, the rules read top to bottom, Otherwise and No value yet. ‹ and ›
 * go to the chip before and after in the same text without closing.
 *
 * A text result is typed as text; `{value}` in it stands for the value in
 * its format. Nothing is a language here: the form writes the live value's
 * data and reads it back.
 */

import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import type { Topic } from "@/components/project-editor"
import { RULE_OPERATORS, type RuleOperator } from "@/lib/comparison-operators"
import { DURATION_PATTERNS, isNo, isYes, sourceShortName, type LiveValue, type Result, type Rule, type ValueFormat } from "@/lib/live-value"
import { referenceEntries } from "@/lib/placeholder-completion"
import { cn } from "@/lib/utils"
import { FIELD, FieldBox, Ornament } from "./fields"

export interface LiveValueEditorProps {
  liveValue: LiveValue
  /** Where it stands among the text's chips, from 1. */
  position: number
  count: number
  topics: Topic[]
  onChange: (liveValue: LiveValue) => void
  onPrevious?: () => void
  onNext?: () => void
  /** Closed with ✕ or Esc; Esc goes back into the text. */
  onClose: (backToText: boolean) => void
}

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  "==": "==",
  "!=": "!=",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  yes: "is yes",
  no: "is no",
}

/** The formats offered, as one list: a select's value for each. */
const FORMATS: { value: string; label: string; format: ValueFormat | undefined }[] = [
  { value: "asIs", label: "As it arrives", format: undefined },
  ...[0, 1, 2, 3].map((d) => ({ value: `n${d}`, label: `Number, ${d} decimal${d === 1 ? "" : "s"}`, format: { kind: "number", decimals: d, grouped: false } as ValueFormat })),
  ...[0, 2].map((d) => ({ value: `g${d}`, label: `Number, ${d} decimals, grouped`, format: { kind: "number", decimals: d, grouped: true } as ValueFormat })),
  ...DURATION_PATTERNS.map((p) => ({ value: `d${p}`, label: `Duration ${p}`, format: { kind: "duration", pattern: p } as ValueFormat })),
]

function formatValue(format: ValueFormat | undefined): string {
  if (!format || format.kind === "asIs") return "asIs"
  if (format.kind === "duration") return `d${format.pattern}`
  return `${format.grouped ? "g" : "n"}${format.decimals}`
}

const VALUE_TOKEN = "{value}"

/** A text result as typed: its parts, `{value}` where the value goes. */
function resultText(result: Result | undefined): string {
  if (!result || result.kind !== "text") return ""
  return result.parts.map((part) => (typeof part === "string" ? part : VALUE_TOKEN)).join("")
}

function textResult(typed: string): Result {
  const parts: Result & { kind: "text" } = { kind: "text", parts: [] }
  const pieces = typed.split(VALUE_TOKEN)
  pieces.forEach((piece, i) => {
    if (i > 0) parts.parts.push({ value: true })
    if (piece) parts.parts.push(piece)
  })
  return parts
}

/** Whether a topic's examples read as yes and no, so «is yes» / «is no» are proposed. */
function looksLikeYesNo(examples: string[] | undefined): boolean {
  const words = (examples ?? []).filter((e) => e.trim() !== "")
  return words.length > 0 && words.every((e) => (isYes(e) || isNo(e)) && Number.isNaN(Number(e.trim())))
}

const INPUT = cn(FIELD, "h-8")

export function LiveValueEditor({ liveValue, position, count, topics, onChange, onPrevious, onNext, onClose }: LiveValueEditorProps) {
  const reference = `${liveValue.source.namespace}:${liveValue.source.path}`
  const entries = referenceEntries("", topics)
  const known = entries.some((e) => e.reference === reference)
  const topic = liveValue.source.namespace === "topic" ? topics.find((t) => t.topic === liveValue.source.path.split("#")[0]) : undefined
  const update = (patch: Partial<LiveValue>) => onChange({ ...liveValue, ...patch })
  const updateRule = (index: number, patch: Partial<Rule>) =>
    update({ rules: liveValue.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) })

  // Otherwise left as it is reads the value; shown so, and cleared it is an
  // empty result (decision 7) - so it is stored only when it says something
  // else than the value.
  const otherwiseText = liveValue.otherwise ? resultText(liveValue.otherwise) : VALUE_TOKEN

  return (
    <div
      role="group"
      aria-label="Live value"
      data-testid="live-value-editor"
      className="mt-2 rounded-lg border bg-background shadow-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          onClose(true)
        }
      }}
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="flex-1 text-xs font-medium">{`Live value ${position} of ${count}`}</span>
        <button type="button" aria-label="Previous value" disabled={!onPrevious} onClick={onPrevious} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="size-3.5" />
        </button>
        <button type="button" aria-label="Next value" disabled={!onNext} onClick={onNext} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronRight className="size-3.5" />
        </button>
        <button type="button" aria-label="Close" onClick={() => onClose(false)} className="rounded p-1 hover:bg-muted">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-2 p-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Reads</span>
          <FieldBox>
            <select
              aria-label="Reads"
              className={cn(INPUT, "cursor-pointer appearance-none pr-6 font-mono text-[12px]")}
              value={reference}
              onChange={(e) => {
                const value = e.target.value
                const colon = value.indexOf(":")
                update({ source: { namespace: value.slice(0, colon) as LiveValue["source"]["namespace"], path: value.slice(colon + 1) } })
              }}
            >
              {!known ? <option value={reference}>{reference}</option> : null}
              {entries.map((entry) => (
                <option key={entry.reference} value={entry.reference}>
                  {entry.reference.slice(entry.section.length + 1)}
                  {entry.example !== undefined && entry.example !== "" ? `  · ${entry.example}` : ""}
                </option>
              ))}
            </select>
            <Ornament className="right-1.5">
              <ChevronDown className="size-3 text-muted-foreground" strokeWidth={2.5} />
            </Ornament>
          </FieldBox>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Value shown as</span>
          <FieldBox>
            <select
              aria-label="Value shown as"
              className={cn(INPUT, "cursor-pointer appearance-none pr-6")}
              value={formatValue(liveValue.format)}
              onChange={(e) => {
                const format = FORMATS.find((f) => f.value === e.target.value)?.format
                const next = { ...liveValue }
                if (format) next.format = format
                else delete next.format
                onChange(next)
              }}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <Ornament className="right-1.5">
              <ChevronDown className="size-3 text-muted-foreground" strokeWidth={2.5} />
            </Ornament>
          </FieldBox>
        </label>

        <div className="space-y-1.5" role="list" aria-label="Rules">
          {liveValue.rules.map((rule, index) => (
            <div key={index} role="listitem" className="flex items-center gap-1.5" data-testid="live-value-rule">
              <span className="w-10 shrink-0 text-muted-foreground">If value</span>
              <FieldBox className="w-[66px] shrink-0">
                <select
                  aria-label={`Rule ${index + 1} comparison`}
                  className={cn(INPUT, "cursor-pointer appearance-none pr-5")}
                  value={rule.op}
                  onChange={(e) => {
                    const op = e.target.value as RuleOperator
                    updateRule(index, op === "yes" || op === "no" ? { op, operand: undefined } : { op, operand: rule.operand ?? "" })
                  }}
                >
                  {RULE_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>
                <Ornament className="right-1">
                  <ChevronDown className="size-3 text-muted-foreground" strokeWidth={2.5} />
                </Ornament>
              </FieldBox>
              {rule.op === "yes" || rule.op === "no" ? null : (
                <input
                  aria-label={`Rule ${index + 1} value`}
                  className={cn(INPUT, "w-16 shrink-0")}
                  value={rule.operand ?? ""}
                  onChange={(e) => updateRule(index, { operand: e.target.value })}
                />
              )}
              <span className="text-muted-foreground">→</span>
              <input
                aria-label={`Rule ${index + 1} shows`}
                className={cn(INPUT, "min-w-0 flex-1")}
                placeholder="empty"
                value={resultText(rule.result)}
                onChange={(e) => updateRule(index, { result: textResult(e.target.value) })}
              />
              <button
                type="button"
                aria-label={`Remove rule ${index + 1}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                onClick={() => update({ rules: liveValue.rules.filter((_, i) => i !== index) })}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded border border-dashed px-2 py-1 hover:bg-muted"
            onClick={() => update({ rules: [...liveValue.rules, { op: "==", operand: "", result: textResult("") }] })}
          >
            + Add rule
          </button>
          {liveValue.rules.length === 0 && looksLikeYesNo(topic?.examples) ? (
            <button
              type="button"
              className="rounded border border-dashed px-2 py-1 hover:bg-muted"
              onClick={() =>
                update({
                  rules: [
                    { op: "yes", result: textResult("yes") },
                    { op: "no", result: textResult("no") },
                  ],
                })
              }
            >
              + is yes / is no
            </button>
          ) : null}
        </div>

        <label className="flex items-center gap-1.5">
          <span className="w-24 shrink-0 text-muted-foreground">Otherwise</span>
          <input
            aria-label="Otherwise"
            className={cn(INPUT, "min-w-0 flex-1")}
            placeholder="empty"
            value={otherwiseText}
            onChange={(e) => {
              const next = { ...liveValue }
              if (e.target.value === VALUE_TOKEN) delete next.otherwise
              else next.otherwise = textResult(e.target.value)
              onChange(next)
            }}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="w-24 shrink-0 text-muted-foreground">No value yet</span>
          <input
            aria-label="No value yet"
            className={cn(INPUT, "min-w-0 flex-1")}
            placeholder="empty"
            value={resultText(liveValue.noValueYet)}
            onChange={(e) => {
              const next = { ...liveValue }
              if (e.target.value === "") delete next.noValueYet
              else next.noValueYet = textResult(e.target.value)
              onChange(next)
            }}
          />
        </label>
        <p className="text-[11px] text-muted-foreground">{`Rules are read top to bottom; the first that applies wins. ${VALUE_TOKEN} writes the value in its format. ${sourceShortName(liveValue.source)} reads ${reference.replace(/^topic:/, "")}.`}</p>
      </div>
    </div>
  )
}
