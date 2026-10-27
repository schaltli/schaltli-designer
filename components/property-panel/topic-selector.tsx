"use client"
import type { Topic } from "../project-editor"
import type React from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { splitTopicPath } from "@/lib/json-path"
import { SubtopicPicker } from "./subtopic-picker"
import { ChevronRight, ChevronDown, ChevronsUpDown, Check, Search, Plus } from "lucide-react"
import { useContext, useId, useMemo, useState } from "react"
import { topicTree, searchTopicTree, sortedChildren, ancestorPaths, type TopicTreeNode } from "@/lib/topic-tree"
import { useHeardTopics } from "@/lib/broker-store"
import type { HeardTopic } from "@/lib/heard-topic"
import { TopicAdderContext, type NewTopic } from "../topic-adder-context"

interface TopicSelectorProps {
  selectedTopicId?: string
  topics: Topic[]
  onTopicChange: (topic: string | undefined) => void
  onManageTopics: () => void
  label?: string
  className?: string
  // A JSON topic's field ("topic#path") is only a valid destination when
  // the caller binds to a single value to *read* - you can never publish
  // to a virtual "topic#path" destination, only the whole topic (the full
  // JSON payload has to be sent together). Callers picking a publish/
  // command destination (e.g. Switch's Write Topic) must pass false, which
  // hides the Subtopics Picker entirely (see below) - the Topic Picker's
  // own tree never offers subtopics either way, see its own comment.
  // Defaults to true (every existing read-value binding).
  allowSubtopics?: boolean
  // Scaled combined topics the field may read, bound as `combined:<name>`
  // (device contract 2.11) - a bar's or a dial's value, never a destination.
  combined?: string[]
  // The picker's id, for a row's label to point at (fields/wrapped-fields.tsx).
  id?: string
}

const COMBINED = "combined:"

// The picker shows the one tree of every topic list (lib/topic-tree.ts) over
// the project's topics and what the designer heard on the broker
// (docs/2026-10-14-topic-discovery.md, decisions 4-6): a heard topic chosen
// is added to the project, a name nobody sent is added where it is typed.
// A popover, not a Select: a Select cannot hold the search field.

interface PickerItem {
  topic: string
  project?: Topic
  heard?: HeardTopic
}

const TYPE_BADGE: Record<Topic["type"], string> = {
  numeric: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  json: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  text: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
}

function TypeBadge({ type }: { type: Topic["type"] }) {
  return <span className={cn("px-2 py-0.5 text-xs rounded-full flex-shrink-0", TYPE_BADGE[type] ?? TYPE_BADGE.text)}>{type}</span>
}

/** A topic one can publish to: not empty, no wildcard, no spaces. */
export function isPlainTopicName(name: string): boolean {
  return name.length > 0 && !/[+#\s]/.test(name)
}

/**
 * A heard topic as the project keeps it (decision 4): its guessed type, a
 * JSON topic's fields, and - for something read - what was heard as its
 * examples, newest first without repeats. A write topic takes none: what
 * others sent there is not a command of this display's.
 */
export function topicFromHeard(heard: HeardTopic, forWriting: boolean): NewTopic {
  const examples = forWriting ? [] : [...new Set(heard.messages.map((m) => m.payload))]
  return {
    topic: heard.topic,
    type: heard.type,
    examples,
    ...(heard.type === "json" ? { subtopics: heard.fields.map((f) => ({ path: f.path, type: f.type })) } : {}),
  }
}

const depth = (n: TopicTreeNode<PickerItem>) => n.path.split("/").length

export function TopicSelector({
  selectedTopicId,
  topics,
  onTopicChange,
  onManageTopics,
  label = "Topic",
  className,
  allowSubtopics = true,
  combined = [],
  id,
}: TopicSelectorProps) {
  const selectedCombined = selectedTopicId?.startsWith(COMBINED) ? selectedTopicId.slice(COMBINED.length) : undefined
  const { topic: selectedRealTopic, path: selectedPath } = splitTopicPath(selectedCombined === undefined ? selectedTopicId || "" : "")
  const selectedTopic = topics.find((t) => t.topic === selectedRealTopic)
  // Something IS bound, it is just not one of this project's registered
  // topics. Until 2026-08-25 that rendered as "No topic selected", which is
  // the interface lying about its own data: the value is stored, exported
  // and working on the device, and the panel showed an empty field.
  //
  // It is not a rare corner. Until 2026-08-14 a publish destination (a
  // Switch's Write Topic, a hardware button's send-mqtt action) was a
  // free-text field; every one of those still holds a topic that was never
  // registered as such. A real project recovered on 2026-08-25 had SIX of
  // them - every command destination it owned - all invisible.
  //
  // The damage is not only confusion: an empty-looking field invites being
  // filled in, and picking anything from the list silently replaces a value
  // the user was never shown. Or the field reads as "this button is not
  // wired up" and the search for the fault moves to the firmware.
  const boundButUnregistered = !!selectedRealTopic && !selectedTopic
  // The tree never offers a subtopic (that is the Subtopics Picker beside
  // it), but the stored value can be composite, so the closed trigger shows
  // "topic → field" when one is attached.
  const selectedSubtopic = selectedPath ? selectedTopic?.subtopics?.find((s) => s.path === selectedPath) : undefined

  const ownId = useId()
  const triggerId = id ?? ownId
  const addTopic = useContext(TopicAdderContext)
  const heard = useHeardTopics()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [projectOnly, setProjectOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // One item per name: the project's topic, what was heard, or both. Heard
  // topics only where a topic can be added (inside the editor).
  const items = useMemo(() => {
    const byName = new Map<string, PickerItem>()
    for (const t of topics) byName.set(t.topic, { topic: t.topic, project: t })
    if (addTopic) {
      for (const h of heard.topics.values()) {
        const at = byName.get(h.topic)
        if (at) at.heard = h
        else byName.set(h.topic, { topic: h.topic, heard: h })
      }
    }
    return [...byName.values()]
  }, [topics, heard.topics, addTopic])
  const shown = useMemo(() => (projectOnly ? items.filter((i) => i.project) : items), [items, projectOnly])

  const typed = query.trim()
  const q = typed.toLowerCase()
  const fullTree = useMemo(() => topicTree(shown.map((i) => ({ topic: i.topic, item: i, messages: i.heard?.count ?? 0 }))), [shown])
  const searched = useMemo(() => (q ? searchTopicTree(fullTree, (path) => path.toLowerCase().includes(q)) : null), [fullTree, q])
  const tree = searched?.tree ?? fullTree
  const isOpen = (path: string) => expanded.has(path) || !!searched?.open.has(path)
  const offerAdd = !!addTopic && isPlainTopicName(typed) && !items.some((i) => i.topic === typed)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    // Fresh on every open: «All», no search, folded - except the way to
    // whatever is bound, so the current choice is in view.
    setQuery("")
    setProjectOnly(false)
    setExpanded(selectedRealTopic ? new Set(ancestorPaths(selectedRealTopic)) : new Set())
  }

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // A heard topic the project lacks is added in the same click as it is
  // bound: one change, one undo step.
  const choose = (item: PickerItem) => {
    if (!item.project && item.heard && addTopic) addTopic(topicFromHeard(item.heard, !allowSubtopics))
    onTopicChange(item.topic)
    setOpen(false)
  }

  const addByHand = (type: Topic["type"]) => {
    if (!addTopic) return
    addTopic({ topic: typed, type, examples: [] })
    onTopicChange(typed)
    setOpen(false)
  }

  const renderLeaf = (n: TopicTreeNode<PickerItem>) => {
    const item = n.item!
    // An older project can hold a topic without a type (or "number"):
    // shown as text rather than taken for a heard one.
    const type = item.project?.type ?? item.heard?.type ?? "text"
    const latest = item.heard?.messages[0]?.payload
    const selected = selectedRealTopic === item.topic
    return (
      <div
        key={`topic-${n.path}`}
        role="option"
        aria-selected={selected}
        title={n.path}
        onClick={() => choose(item)}
        className={cn(
          "flex items-center gap-2 min-w-0 w-full pr-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent",
          selected && "bg-accent/60",
        )}
        style={{ paddingLeft: `${depth(n) * 12}px` }}
      >
        <span className={cn("truncate min-w-0 flex-1", !item.heard && addTopic && !item.project?.local && "text-muted-foreground")}>{n.name}</span>
        {latest !== undefined ? (
          <span className="truncate max-w-[7rem] font-mono text-xs text-muted-foreground">{latest}</span>
        ) : (
          addTopic && item.project && !item.project.local && <span className="text-xs text-muted-foreground font-mono">not heard</span>
        )}
        <TypeBadge type={type} />
        <span className="w-4 flex-shrink-0 text-primary text-xs" title={item.project ? "in project" : undefined}>
          {selected ? <Check className="h-3.5 w-3.5" /> : item.project && addTopic ? "✓" : ""}
        </span>
      </div>
    )
  }

  const renderNodes = (node: TopicTreeNode<PickerItem>): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    // Branches first, then topics, each by name.
    const children = sortedChildren(node).sort((a, b) => Number(a.children.size === 0) - Number(b.children.size === 0))
    for (const child of children) {
      if (child.item) out.push(renderLeaf(child))
      if (child.children.size === 0) continue
      const opened = isOpen(child.path)
      // A topic that is also a branch: its row above, a bare chevron row
      // under it for what lies below.
      out.push(
        <div
          key={`branch-${child.path}`}
          role="button"
          aria-expanded={opened}
          aria-label={child.item ? `${opened ? "Hide" : "Show"} topics nested under ${child.path}` : undefined}
          onClick={() => toggle(child.path)}
          className="flex items-center gap-1 pr-2 py-1.5 text-sm text-muted-foreground cursor-pointer rounded-sm hover:bg-accent"
          style={{ paddingLeft: `${depth(child) * 12 - 4}px` }}
        >
          {opened ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {!child.item && <span className="font-medium">{child.name}</span>}
          <span className="text-xs">({child.item ? child.topics - 1 : child.topics})</span>
        </div>,
      )
      if (opened) out.push(...renderNodes(child))
    }
    return out
  }

  const combinedShown = combined.filter((name) => !q || name.toLowerCase().includes(q))
  const triggerText =
    selectedCombined !== undefined
      ? selectedCombined
      : selectedTopic && selectedPath
      ? `${selectedTopic.topic} → ${selectedSubtopic?.label || selectedPath}`
      : (selectedTopic?.topic ?? (boundButUnregistered ? selectedTopicId : undefined))

  return (
    <div className={className}>
      {/* Named by its label - or by the row's, given an id: a screen reader
          says which topic it is, and a test finds it by that. */}
      <Label htmlFor={id ? undefined : triggerId} className="text-xs">
        {label}
      </Label>
      <div className="flex gap-1">
        <div className="flex-1 min-w-0">
          <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
              <button
                id={triggerId}
                type="button"
                role="combobox"
                aria-expanded={open}
                // The row's look comes by this slot, as a Select's trigger
                // (fields/wrapped-fields.tsx, e2e/property-fields.spec.ts).
                data-slot="select-trigger"
                className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {triggerText ? (
                  <>
                    <span className="truncate flex-1 min-w-0 text-left" title={triggerText}>
                      {triggerText}
                    </span>
                    {selectedCombined !== undefined ? (
                      <span className="px-2 py-0.5 text-xs rounded-full flex-shrink-0 bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">combined</span>
                    ) : selectedTopic && selectedPath ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full flex-shrink-0",
                          selectedSubtopic ? TYPE_BADGE[selectedSubtopic.type] : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
                        )}
                      >
                        {selectedSubtopic?.type || "field"}
                      </span>
                    ) : selectedTopic ? (
                      <TypeBadge type={selectedTopic.type} />
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full flex-shrink-0 bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        unregistered
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex-1 text-left text-muted-foreground">No topic selected</span>
                )}
                <ChevronsUpDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(26rem,90vw)] p-0">
              <div className="p-2 border-b space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search topics..."
                    aria-label="Search topics"
                    className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
                {addTopic && (
                  <div className="flex rounded-md border text-xs overflow-hidden" role="radiogroup" aria-label="Which topics">
                    {(
                      [
                        [false, `All · ${items.length}`],
                        [true, `Project only · ${topics.length}`],
                      ] as const
                    ).map(([only, text]) => (
                      <button
                        key={String(only)}
                        type="button"
                        role="radio"
                        aria-checked={projectOnly === only}
                        onClick={() => setProjectOnly(only)}
                        className={cn("flex-1 py-1", projectOnly === only ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground")}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div role="listbox" aria-label={label} className="max-h-80 overflow-y-auto p-1">
                <div
                  role="option"
                  aria-selected={!selectedTopicId}
                  onClick={() => {
                    onTopicChange(undefined)
                    setOpen(false)
                  }}
                  className="px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent"
                >
                  No topic
                </div>
                {renderNodes(tree)}
                {combinedShown.length > 0 && (
                  <div role="group" aria-label="Combined topics" className="mt-1 border-t pt-1">
                    <p className="px-2 py-1 text-xs text-muted-foreground">Combined topics</p>
                    {combinedShown.map((name) => (
                      <div
                        key={`combined-${name}`}
                        role="option"
                        aria-selected={selectedCombined === name}
                        onClick={() => {
                          onTopicChange(`${COMBINED}${name}`)
                          setOpen(false)
                        }}
                        className={cn("flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent", selectedCombined === name && "bg-accent/60")}
                      >
                        <span className="truncate min-w-0 flex-1 font-mono">{name}</span>
                        <span className="w-4 flex-shrink-0 text-primary text-xs">{selectedCombined === name ? <Check className="h-3.5 w-3.5" /> : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {q && tree.children.size === 0 && combinedShown.length === 0 && (
                  <p className="px-2 py-2 text-sm text-muted-foreground">
                    {projectOnly || !addTopic ? `No topic of the project matches «${typed}».` : `No topic heard or in the project matches «${typed}».`}
                  </p>
                )}
                <div
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setOpen(false)
                    onManageTopics()
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 mt-1 border-t text-sm text-primary rounded-sm cursor-pointer hover:bg-accent"
                >
                  <MqttIcon className="h-4 w-4" />
                  <span>Manage Topics...</span>
                </div>
              </div>
              {offerAdd && (
                <div className="flex items-center gap-2 border-t px-2 py-1.5 text-sm">
                  <Plus className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="truncate min-w-0 flex-1 text-primary font-medium" title={typed}>
                    Add topic «{typed}»
                  </span>
                  {(["numeric", "text", "json"] as const).map((type) => (
                    <button key={type} type="button" onClick={() => addByHand(type)} aria-label={`Add as ${type}`} className="rounded-full">
                      <TypeBadge type={type} />
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {allowSubtopics && selectedTopic?.type === "json" && (
          <SubtopicPicker
            subtopics={selectedTopic.subtopics ?? []}
            value={selectedPath}
            onChange={(path) => onTopicChange(path ? `${selectedTopic.topic}#${path}` : selectedTopic.topic)}
          />
        )}
      </div>

      {boundButUnregistered && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          This topic is bound but not registered in the project, so it cannot be picked from the list. It still works -
          it is exported and published as-is. Add it under &ldquo;Manage Topics&hellip;&rdquo; to make it selectable.
          Choosing anything from the list replaces it.
        </p>
      )}
    </div>
  )
}

const MqttIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 2h-5.054a26 26 0 0 1 3.413 2.792A27 27 0 0 1 22 7.917V3a1 1 0 0 0-1-1M9.316 2H3a1 1 0 0 0-1 1v.981A18.22 18.22 0 0 1 20.15 22H21a1 1 0 0 0 .993-1.007v-6.806A21.58 21.58 0 0 0 9.316 2M2 7.034v3.256A11.883 11.883 0 0 1 13.8 22h3.38A15.15 15.15 0 0 0 2 7.034m0 6.31V21a1 1 0 0 0 1 1h7.82A8.81 8.81 0 0 0 2 13.344" />
  </svg>
)
