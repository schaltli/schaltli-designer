"use client"

/**
 * Local topics in Project Settings › Topics (docs/2026-10-13-local-topics.md,
 * decision 7): topics each display keeps itself - set by a switch or a
 * button, never published, never subscribed. A list of their own, as the
 * combined topics have; in the project they stay in `topics[]` with
 * `local: true`, so every topic picker offers them.
 */

import { useState } from "react"
import type { Project, Topic } from "@/components/project-editor"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FIELD = "h-8 rounded-md border bg-background px-2 text-sm"

/** What is wrong with a local topic's name, if anything: it is a topic name like any other. */
export function localNameProblem(name: string, others: readonly string[]): string | undefined {
  if (name.trim() === "") return "A local topic needs a name."
  if (/[\s#+]/.test(name)) return "A name has no spaces, no # and no +."
  if (others.some((o) => o.toLowerCase() === name.toLowerCase())) return `There is a topic «${name}» already.`
  return undefined
}

function NameField({ topic, others, onRename }: { topic: Topic; others: string[]; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(topic.topic)
  const problem = draft === topic.topic ? undefined : localNameProblem(draft, others)
  return (
    <div className="min-w-0 flex-1">
      <input
        aria-label="Local topic name"
        className={cn(FIELD, "w-full font-mono")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== topic.topic && !problem) onRename(draft)
          else setDraft(topic.topic)
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {problem ? <p className="mt-1 text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}

export function LocalTopicsSection({ project, onProjectUpdate }: { project: Project; onProjectUpdate: (project: Project) => void }) {
  const all = project.topics ?? []
  const locals = all.filter((t) => t.local)

  const setTopics = (next: Topic[]) => onProjectUpdate({ ...project, topics: next })
  const update = (id: string, patch: Partial<Topic>) => setTopics(all.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  // A name under local/ is only a convention, for the name to show it
  // (decision 7); any other name is taken as well.
  const add = () => {
    let n = locals.length + 1
    while (all.some((t) => t.topic === `local/topic${n}`)) n++
    setTopics([...all, { id: `topic_${Date.now()}`, topic: `local/topic${n}`, type: "text", examples: [], local: true }])
  }

  // The initial value is also the topic's example, so the editor's canvas
  // shows what a display starts with.
  const setInitial = (topic: Topic, value: string) =>
    update(topic.id, value === "" ? { initial: undefined, examples: [] } : { initial: value, examples: [value] })

  return (
    <section className="mt-6 space-y-3" data-testid="local-topics">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-medium">Local topics</h3>
          <p className="text-sm text-muted-foreground">
            Kept by each display itself: a switch or a button sets one, nothing is published or subscribed.
          </p>
        </div>
        <Button size="sm" onClick={add}>
          Add local topic
        </Button>
      </div>

      {locals.map((topic) => {
        const others = all.filter((t) => t.id !== topic.id).map((t) => t.topic)
        return (
          <div key={topic.id} className="space-y-2 rounded-lg border bg-card p-4" data-testid="local-topic">
            <div className="flex items-start gap-2">
              <NameField key={topic.topic} topic={topic} others={others} onRename={(name) => update(topic.id, { topic: name })} />
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setTopics(all.filter((t) => t.id !== topic.id))}>
                Delete
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <select
                aria-label="Local topic type"
                className={FIELD}
                value={topic.type}
                onChange={(e) => update(topic.id, { type: e.target.value as Topic["type"] })}
              >
                <option value="text">text</option>
                <option value="numeric">numeric</option>
              </select>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0">Initial value</span>
                <input
                  aria-label="Initial value"
                  className={cn(FIELD, "min-w-0 flex-1 font-mono")}
                  value={topic.initial ?? ""}
                  placeholder="none: no value until something sets it"
                  onChange={(e) => setInitial(topic, e.target.value)}
                />
              </label>
            </div>
          </div>
        )
      })}
    </section>
  )
}
