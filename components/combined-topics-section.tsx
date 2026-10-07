"use client"

/**
 * Combined topics in Project Settings › Topics (docs/2026-10-07-live-values.md,
 * decisions 10-15): a topic the project computes - yes when all, or any, of
 * its conditions apply. A condition reads a topic or another combined topic;
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
  combinedUsage,
  evaluationOrder,
  renameCombined,
  type CombinedCondition,
  type CombinedTopic,
} from "@/lib/combined-topics"
import { referenceEntries } from "@/lib/placeholder-completion"
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
              <span>Is yes when</span>
              <select aria-label="All or any" className={SELECT} value={ct.mode} onChange={(e) => update(ct.id, { mode: e.target.value as CombinedTopic["mode"] })}>
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              <span>of these apply:</span>
            </div>
            {ct.conditions.map((condition, index) => {
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
          </div>
        )
      })}
    </section>
  )
}
