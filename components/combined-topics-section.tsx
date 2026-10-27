"use client"

/**
 * Combined topics in Project Settings › Topics (docs/2026-10-07-live-values.md,
 * decisions 10-15): a topic the project computes - yes when all, or any, of
 * its conditions apply, or a number scaled from one source
 * (tasks/ha-templates-stage2-plan.md, decision 2). A condition reads a topic
 * or another combined topic;
 * what would close a circular reference is not offered, and one written by
 * hand is shown in red. One still read is not deleted, and the refusal says
 * where; a rename carries every reference.
 */

import { useState } from "react"
import { ChevronDown, X } from "lucide-react"
import type { Project } from "@/components/project-editor"
import { Button } from "@/components/ui/button"
import { RULE_OPERATORS, type RuleOperator } from "@/lib/comparison-operators"
import {
  MAX_COMBINED_DEPTH,
  combinedReadableFrom,
  computeCombined,
  combinedUsage,
  evaluationOrder,
  renameCombined,
  type CombinedCondition,
  type CombinedTopic,
} from "@/lib/combined-topics"
import { referenceEntries } from "@/lib/placeholder-completion"
import type { Source } from "@/lib/live-value"
import { cn } from "@/lib/utils"

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

const SELECT = "h-8 rounded-md border bg-background px-2 text-sm"

/** A name a live value can read as `combined:<name>`: no spaces, no braces, nothing empty. */
export function combinedNameProblem(name: string, others: readonly string[]): string | undefined {
  if (name.trim() === "") return "A combined topic needs a name."
  if (/[\s{}]/.test(name)) return "A name has no spaces and no braces."
  if (others.includes(name)) return `There is a combined topic «${name}» already.`
  return undefined
}

function NameField({ ct, others, onRename }: { ct: CombinedTopic; others: string[]; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(ct.name)
  const problem = draft === ct.name ? undefined : combinedNameProblem(draft, others)
  return (
    <div className="min-w-0 flex-1">
      <input
        aria-label="Combined topic name"
        className={cn(SELECT, "w-full font-mono")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== ct.name && !problem) onRename(draft)
          else setDraft(ct.name)
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {problem ? <p className="mt-1 text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}

export function CombinedTopicsSection({ project, onProjectUpdate }: { project: Project; onProjectUpdate: (project: Project) => void }) {
  const cts = project.combinedTopics ?? []
  const [refusal, setRefusal] = useState<{ name: string; users: string[] } | null>(null)
  const { circular, tooDeep } = evaluationOrder(cts)
  const topicEntries = referenceEntries("", project.topics ?? []).filter((e) => e.section === "topic")

  const setTopics = (next: CombinedTopic[]) => onProjectUpdate({ ...project, combinedTopics: next })
  const update = (id: string, patch: Partial<CombinedTopic>) => setTopics(cts.map((ct) => (ct.id === id ? { ...ct, ...patch } : ct)))
  const updateCondition = (ct: CombinedTopic, index: number, patch: Partial<CombinedCondition>) =>
    update(ct.id, { conditions: ct.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  // A scaled topic's own value from its source's example, for the form to show.
  const exampleOf = new Map(topicEntries.map((e) => [e.reference.slice("topic:".length), e.example]))
  const fromExamples = computeCombined(cts, (path) => exampleOf.get(path))
  const sourceValue = (source: Source) => (source.namespace === "topic" ? exampleOf.get(source.path) : fromExamples.get(source.path))

  // The kind changed: a scaled topic reads one source, the first topic; back
  // to yes/no it has conditions again.
  const setMode = (ct: CombinedTopic, mode: CombinedTopic["mode"]) => {
    if (mode === "scale") {
      const first = topicEntries[0]?.reference.slice("topic:".length) ?? ""
      update(ct.id, { mode, conditions: [], scale: ct.scale ?? { source: { namespace: "topic", path: first }, numerator: 1, denominator: 1, decimals: 1 } })
    } else {
      const { scale: _scale, ...rest } = ct
      setTopics(cts.map((c) => (c.id === ct.id ? { ...rest, mode } : c)))
    }
  }
  const setScale = (ct: CombinedTopic, patch: Partial<NonNullable<CombinedTopic["scale"]>>) => update(ct.id, { scale: { ...ct.scale!, ...patch } })

  const add = () => {
    let n = cts.length + 1
    while (cts.some((ct) => ct.name === `combined${n}`)) n++
    setTopics([...cts, { id: `ct_${Date.now()}`, name: `combined${n}`, mode: "all", conditions: [] }])
  }

  const remove = (ct: CombinedTopic) => {
    const users = combinedUsage(project, ct.name)
    if (users.length > 0) {
      setRefusal({ name: ct.name, users })
      return
    }
    setRefusal(null)
    setTopics(cts.filter((c) => c.id !== ct.id))
  }

  return (
    <section className="mt-6 space-y-3" data-testid="combined-topics">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-medium">Combined topics</h3>
          <p className="text-sm text-muted-foreground">Yes when all, or any, of their conditions apply. The device works them out itself.</p>
        </div>
        <Button size="sm" onClick={add}>
          Add combined topic
        </Button>
      </div>

      {circular ? (
        <p className="text-sm text-destructive" data-testid="combined-circular">{`Circular reference: ${circular.join(" → ")}. Nothing can be exported until it is broken.`}</p>
      ) : null}
      {tooDeep ? (
        <p className="text-sm text-destructive">{`${tooDeep} is more than ${MAX_COMBINED_DEPTH} levels deep.`}</p>
      ) : null}
      {refusal ? (
        <p className="text-sm text-destructive" data-testid="combined-refusal">{`«${refusal.name}» is still read by ${refusal.users.join(", ")}.`}</p>
      ) : null}

      {cts.map((ct) => {
        const readable = combinedReadableFrom(cts, ct.name)
        const others = cts.filter((c) => c.id !== ct.id).map((c) => c.name)
        return (
          <div key={ct.id} className={cn("space-y-2 rounded-lg border bg-card p-4", circular?.includes(ct.name) && "border-destructive")} data-testid="combined-topic">
            <div className="flex items-start gap-2">
              <NameField key={ct.name} ct={ct} others={others} onRename={(name) => onProjectUpdate(renameCombined(project, ct.name, name))} />
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(ct)}>
                Delete
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>{ct.mode === "scale" ? "Is" : "Is yes when"}</span>
              <select aria-label="All or any" className={SELECT} value={ct.mode} onChange={(e) => setMode(ct, e.target.value as CombinedTopic["mode"])}>
                <option value="all">all</option>
                <option value="any">any</option>
                <option value="scale">a scaled number</option>
              </select>
              <span>{ct.mode === "scale" ? "of:" : "of these apply:"}</span>
            </div>
            {ct.mode === "scale" && ct.scale ? (
              <ScaleForm
                scale={ct.scale}
                choices={[...topicEntries.map((e) => e.reference), ...readable.map((n) => `combined:${n}`)]}
                example={sourceValue(ct.scale.source)}
                value={fromExamples.get(ct.name)}
                onChange={(patch) => setScale(ct, patch)}
              />
            ) : null}
            {ct.mode === "scale" ? null : ct.conditions.map((condition, index) => {
              const reference = `${condition.source.namespace}:${condition.source.path}`
              return (
                <div key={index} className="flex items-center gap-2" data-testid="combined-condition">
                  <select
                    aria-label={`Condition ${index + 1} reads`}
                    className={cn(SELECT, "min-w-0 flex-1 font-mono text-xs")}
                    value={reference}
                    onChange={(e) => {
                      const colon = e.target.value.indexOf(":")
                      updateCondition(ct, index, {
                        source: { namespace: e.target.value.slice(0, colon) as "topic" | "combined", path: e.target.value.slice(colon + 1) },
                      })
                    }}
                  >
                    {[...topicEntries.map((e) => e.reference), ...readable.map((n) => `combined:${n}`)].includes(reference) ? null : (
                      <option value={reference}>{reference}</option>
                    )}
                    <optgroup label="Topics">
                      {topicEntries.map((entry) => (
                        <option key={entry.reference} value={entry.reference}>
                          {entry.reference.slice("topic:".length)}
                        </option>
                      ))}
                    </optgroup>
                    {readable.length ? (
                      <optgroup label="Combined">
                        {readable.map((name) => (
                          <option key={name} value={`combined:${name}`}>
                            {`combined:${name}`}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <span className="relative">
                    <select
                      aria-label={`Condition ${index + 1} comparison`}
                      className={cn(SELECT, "w-20 appearance-none pr-5")}
                      value={condition.op}
                      onChange={(e) => {
                        const op = e.target.value as RuleOperator
                        updateCondition(ct, index, op === "yes" || op === "no" ? { op, operand: undefined } : { op, operand: condition.operand ?? "" })
                      }}
                    >
                      {RULE_OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-2.5 size-3 text-muted-foreground" />
                  </span>
                  {condition.op === "yes" || condition.op === "no" ? null : (
                    <input
                      aria-label={`Condition ${index + 1} value`}
                      className={cn(SELECT, "w-20")}
                      value={condition.operand ?? ""}
                      onChange={(e) => updateCondition(ct, index, { operand: e.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Remove condition ${index + 1}`}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => update(ct.id, { conditions: ct.conditions.filter((_, i) => i !== index) })}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
            {ct.mode === "scale" ? null : (
            <button
              type="button"
              className="rounded border border-dashed px-2 py-1 text-sm hover:bg-muted"
              onClick={() => {
                const first = topicEntries[0]?.reference ?? "topic:"
                update(ct.id, {
                  conditions: [...ct.conditions, { source: { namespace: "topic", path: first.slice("topic:".length) }, op: "yes" }],
                })
              }}
            >
              + Add condition
            </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

/**
 * A scaled topic's source and its scale (lib/scaled-value.ts): times,
 * divided by, plus, rounded to decimals - and what its source's example
 * comes out as.
 */
function ScaleForm({
  scale,
  choices,
  example,
  value,
  onChange,
}: {
  scale: NonNullable<CombinedTopic["scale"]>
  choices: string[]
  example: string | undefined
  value: string | undefined
  onChange: (patch: Partial<NonNullable<CombinedTopic["scale"]>>) => void
}) {
  const reference = `${scale.source.namespace}:${scale.source.path}`
  const number = (raw: string, fallback: number) => (raw.trim() === "" ? fallback : Number(raw))
  return (
    <div className="space-y-2" data-testid="combined-scale">
      <select
        aria-label="Scaled topic reads"
        className={cn(SELECT, "w-full font-mono text-xs")}
        value={reference}
        onChange={(e) => {
          const colon = e.target.value.indexOf(":")
          onChange({ source: { namespace: e.target.value.slice(0, colon) as "topic" | "combined", path: e.target.value.slice(colon + 1) } })
        }}
      >
        {choices.includes(reference) ? null : <option value={reference}>{reference}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice.startsWith("topic:") ? choice.slice("topic:".length) : choice}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>×</span>
        <input aria-label="Times" className={cn(SELECT, "w-20")} inputMode="numeric" defaultValue={scale.numerator} onBlur={(e) => onChange({ numerator: number(e.target.value, 1) })} />
        <span>÷</span>
        <input aria-label="Divided by" className={cn(SELECT, "w-20")} inputMode="numeric" defaultValue={scale.denominator} onBlur={(e) => onChange({ denominator: number(e.target.value, 1) })} />
        <span>+</span>
        <input aria-label="Plus" className={cn(SELECT, "w-20")} inputMode="decimal" defaultValue={scale.offset ?? "0"} onBlur={(e) => onChange({ offset: e.target.value.trim() || "0" })} />
        <span>Decimals</span>
        <input aria-label="Decimals" className={cn(SELECT, "w-14")} inputMode="numeric" defaultValue={scale.decimals} onBlur={(e) => onChange({ decimals: number(e.target.value, 0) })} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="combined-scale-preview">
        {example === undefined ? "Its source has no example to scale." : value === undefined ? `${example} gives no value: not a number this scale takes.` : `${example} gives ${value}`}
      </p>
    </div>
  )
}
