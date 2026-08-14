"use client"
import type { Topic } from "../project-editor"
import type React from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { splitTopicPath } from "@/lib/json-path"
import { SubtopicPicker } from "./subtopic-picker"
import { ChevronRight, ChevronDown } from "lucide-react"
import { useState } from "react"

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
}

interface TopicTreeNode {
  name: string
  fullPath: string
  isLeaf: boolean
  topic?: Topic // Only present for leaf nodes (actual topics)
  children: Map<string, TopicTreeNode>
  level: number
}

function buildTopicTree(topics: Topic[]): TopicTreeNode {
  const root: TopicTreeNode = {
    name: "",
    fullPath: "",
    isLeaf: false,
    children: new Map(),
    level: 0,
  }

  topics.forEach((topic) => {
    const parts = topic.topic.split("/")
    let currentNode = root

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1
      const fullPath = parts.slice(0, index + 1).join("/")

      if (!currentNode.children.has(part)) {
        currentNode.children.set(part, {
          name: part,
          fullPath,
          isLeaf: isLastPart,
          topic: isLastPart ? topic : undefined,
          children: new Map(),
          level: index + 1,
        })
      }

      currentNode = currentNode.children.get(part)!

      // If this is the last part, mark it as a leaf and attach the topic
      if (isLastPart) {
        currentNode.isLeaf = true
        currentNode.topic = topic
      }
    })
  })

  return root
}

// Every ancestor path segment of `topicPath` (NOT including the topic
// itself) - e.g. "A/B/C" -> ["A", "A/B"]. Used to auto-expand exactly the
// tree branches that need to be open for the current selection to be
// visible, without expanding anything else.
function ancestorPaths(topicPath: string): string[] {
  const parts = topicPath.split("/")
  const ancestors: string[] = []
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"))
  }
  return ancestors
}

export function TopicSelector({
  selectedTopicId,
  topics,
  onTopicChange,
  onManageTopics,
  label = "Topic",
  className,
  allowSubtopics = true,
}: TopicSelectorProps) {
  const { topic: selectedRealTopic, path: selectedPath } = splitTopicPath(selectedTopicId || "")
  const selectedTopic = topics.find((t) => t.topic === selectedRealTopic)
  // The tree itself never offers picking a subtopic (see its own comment),
  // but the stored value can still be composite - set via the Subtopics
  // Picker beside it - so the closed trigger's own display still needs to
  // reflect "topic → field" when one's attached, same as before the
  // redesign moved the picking mechanism out of the tree.
  const selectedSubtopic = selectedPath ? selectedTopic?.subtopics?.find((s) => s.path === selectedPath) : undefined
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const topicTree = buildTopicTree(topics)

  const handleToggleExpand = (path: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedNodes(newExpanded)
  }

  // The tree starts fully collapsed on every open - except every ancestor
  // branch of whatever's currently selected auto-expands, so an existing
  // selection is visible without manual drilling. A fresh/unset picker
  // opens fully collapsed, requiring the user to drill down themselves.
  const handleOpenChange = (open: boolean) => {
    if (!open) return
    setExpandedNodes(selectedTopic ? new Set(ancestorPaths(selectedTopic.topic)) : new Set())
  }

  const renderTreeNodes = (node: TopicTreeNode): React.ReactNode[] => {
    const nodes: React.ReactNode[] = []

    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      // Sort: abstract nodes first, then leaf nodes, alphabetically within each group
      if (a.isLeaf !== b.isLeaf) {
        return a.isLeaf ? 1 : -1
      }
      return a.name.localeCompare(b.name)
    })

    sortedChildren.forEach((child) => {
      const isExpanded = expandedNodes.has(child.fullPath)
      const hasNestedChildren = child.children.size > 0

      if (child.isLeaf && child.topic) {
        // Render selectable topic (leaf node) - every registered topic is
        // a plain, directly-selectable pick here regardless of type,
        // including "json" ones. A JSON topic's fields are never offered
        // in this tree at all - that's the separate Subtopics Picker
        // beside it (see the component's own return below), since a field
        // path only ever makes sense once you already know which topic
        // it's relative to, and it can never be a publish destination on
        // its own either way (see allowSubtopics's own doc comment).
        nodes.push(
          <SelectItem key={child.topic.topic} value={child.topic.topic}>
            <div className="flex items-center min-w-0 w-full" style={{ paddingLeft: `${child.level * 12}px` }}>
              <span className="truncate flex-1 min-w-0" title={child.name}>
                {child.name}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2",
                  child.topic.type === "numeric"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    : child.topic.type === "json"
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                )}
              >
                {child.topic.type}
              </span>
            </div>
          </SelectItem>,
        )

        // This topic's own MQTT path is also a prefix of other registered
        // topics - list those below, under the same auto-expand rule as
        // any other branching node (expanded when one of them is the
        // current selection, collapsed otherwise). Can't be embedded as a
        // toggle inside the SelectItem above (Radix would treat a click on
        // it as selecting this item and close the dropdown), so it's a
        // bare chevron row immediately underneath instead.
        if (hasNestedChildren) {
          nodes.push(
            <div
              key={`nested-toggle-${child.fullPath}`}
              className="flex items-center px-2 py-1 cursor-pointer hover:bg-accent"
              style={{ paddingLeft: `${child.level * 12 + 8}px` }}
              onClick={() => handleToggleExpand(child.fullPath)}
              role="button"
              aria-label={`${isExpanded ? "Hide" : "Show"} topics nested under ${child.topic.topic}`}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </div>,
          )

          if (isExpanded) {
            nodes.push(...renderTreeNodes(child))
          }
        }
      } else if (hasNestedChildren) {
        // Render abstract node header (non-selectable) - a path segment
        // with no topic of its own, purely structural.
        nodes.push(
          <div
            key={`header-${child.fullPath}`}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground cursor-pointer hover:bg-accent"
            style={{ paddingLeft: `${child.level * 12 + 8}px` }}
            onClick={() => handleToggleExpand(child.fullPath)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="font-medium">{child.name}</span>
            <span className="text-xs">({child.children.size})</span>
          </div>,
        )

        if (isExpanded) {
          nodes.push(...renderTreeNodes(child))
        }
      }
    })

    return nodes
  }

  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <div className="flex-1 min-w-0">
          <Select
            value={selectedTopic?.topic || "none"}
            onValueChange={(value) => {
              if (value === "manage") {
                onManageTopics()
              } else if (value === "none") {
                onTopicChange(undefined)
              } else {
                // Picking a topic always replaces the whole stored value,
                // discarding any previous subtopic - the Subtopics Picker
                // (if it's about to show again, for a JSON topic) starts
                // empty rather than trying to carry a field path over that
                // may not even exist on the newly picked topic.
                onTopicChange(value)
              }
            }}
            onOpenChange={handleOpenChange}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Select a topic">
                {selectedTopic && selectedPath ? (
                  <div className="flex items-center min-w-0 w-full">
                    {/* A subtopic path picked/typed in the Subtopics Picker
                        beside this one - may or may not match one of this
                        topic's registered subtopics (a freeform path is
                        valid too, see subtopic-picker.tsx), so fall back to
                        the raw path text and a generic badge when it's not
                        a registered one. */}
                    <span
                      className="truncate flex-1 min-w-0"
                      title={`${selectedTopic.topic} → ${selectedSubtopic?.label || selectedPath}`}
                    >
                      {selectedTopic.topic} → {selectedSubtopic?.label || selectedPath}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2",
                        selectedSubtopic?.type === "numeric"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : selectedSubtopic
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
                      )}
                    >
                      {selectedSubtopic?.type || "field"}
                    </span>
                  </div>
                ) : selectedTopic ? (
                  <div className="flex items-center min-w-0 w-full">
                    <span className="truncate flex-1 min-w-0" title={selectedTopic.topic}>
                      {selectedTopic.topic}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2",
                        selectedTopic.type === "numeric"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : selectedTopic.type === "json"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                      )}
                    >
                      {selectedTopic.type}
                    </span>
                  </div>
                ) : (
                  "No topic selected"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="none">No topic</SelectItem>
              {topics.length > 0 && (
                <>
                  {renderTreeNodes(topicTree)}
                  <div className="border-t my-1" />
                </>
              )}
              <SelectItem value="manage">
                <div className="flex items-center gap-2 text-primary">
                  <MqttIcon className="h-4 w-4" />
                  <span>Manage Topics...</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {allowSubtopics && selectedTopic?.type === "json" && (
          <SubtopicPicker
            subtopics={selectedTopic.subtopics ?? []}
            value={selectedPath}
            onChange={(path) => onTopicChange(path ? `${selectedTopic.topic}#${path}` : selectedTopic.topic)}
          />
        )}
      </div>
    </div>
  )
}

const MqttIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 2h-5.054a26 26 0 0 1 3.413 2.792A27 27 0 0 1 22 7.917V3a1 1 0 0 0-1-1M9.316 2H3a1 1 0 0 0-1 1v.981A18.22 18.22 0 0 1 20.15 22H21a1 1 0 0 0 .993-1.007v-6.806A21.58 21.58 0 0 0 9.316 2M2 7.034v3.256A11.883 11.883 0 0 1 13.8 22h3.38A15.15 15.15 0 0 0 2 7.034m0 6.31V21a1 1 0 0 0 1 1h7.82A8.81 8.81 0 0 0 2 13.344" />
  </svg>
)
