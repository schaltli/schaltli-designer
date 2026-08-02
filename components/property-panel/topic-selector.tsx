"use client"
import type { Topic } from "../project-editor"
import type React from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { splitTopicPath } from "@/lib/json-path"
import { ChevronRight, ChevronDown } from "lucide-react"
import { useState } from "react"

interface TopicSelectorProps {
  selectedTopicId?: string
  topics: Topic[]
  onTopicChange: (topic: string | undefined) => void
  onManageTopics: () => void
  label?: string
  className?: string
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


export function TopicSelector({
  selectedTopicId,
  topics,
  onTopicChange,
  onManageTopics,
  label = "Topic",
  className,
}: TopicSelectorProps) {
  const { topic: selectedRealTopic, path: selectedPath } = splitTopicPath(selectedTopicId || "")
  const selectedTopic = topics.find((t) => t.topic === selectedRealTopic)
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
      if (child.isLeaf && child.topic && child.topic.type === "json" && (child.topic.subtopics?.length ?? 0) > 0) {
        // JSON topic: the raw payload isn't directly selectable, only its
        // subtopics are - render like an abstract expandable node instead
        // of a SelectItem, with each subtopic as a selectable leaf beneath
        // it (composite "topic#path" value - see lib/json-path.ts).
        const topic = child.topic
        const isExpanded = expandedNodes.has(child.fullPath)

        nodes.push(
          <div
            key={`json-header-${child.fullPath}`}
            className="flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
            style={{ paddingLeft: `${child.level * 12}px` }}
            onClick={() => handleToggleExpand(child.fullPath)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="truncate flex-1 min-w-0" title={child.name}>
              {child.name}
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              json
            </span>
          </div>,
        )

        if (isExpanded) {
          topic.subtopics!.forEach((sub) => {
            const compositeValue = `${topic.topic}#${sub.path}`
            nodes.push(
              <SelectItem key={compositeValue} value={compositeValue}>
                <div className="flex items-center min-w-0 w-full" style={{ paddingLeft: `${(child.level + 1) * 12}px` }}>
                  <span className="truncate flex-1 min-w-0" title={sub.label || sub.path}>
                    {sub.label || sub.path}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2",
                      sub.type === "numeric"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                    )}
                  >
                    {sub.type}
                  </span>
                </div>
              </SelectItem>,
            )
          })
        }
      } else if (child.isLeaf && child.topic) {
        // Render selectable topic (leaf node)
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
      } else if (child.children.size > 0) {
        // Render abstract node header (non-selectable)
        const isExpanded = expandedNodes.has(child.fullPath)

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

        // Render children if expanded
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
      <Select
        value={selectedTopicId || "none"}
        onValueChange={(value) => {
          if (value === "manage") {
            onManageTopics()
          } else if (value === "none") {
            onTopicChange(undefined)
          } else {
            onTopicChange(value)
          }
        }}
      >
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Select a topic">
            {selectedSubtopic && selectedTopic ? (
              <div className="flex items-center min-w-0 w-full">
                <span
                  className="truncate flex-1 min-w-0"
                  title={`${selectedTopic.topic} → ${selectedSubtopic.label || selectedSubtopic.path}`}
                >
                  {selectedTopic.topic} → {selectedSubtopic.label || selectedSubtopic.path}
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2",
                    selectedSubtopic.type === "numeric"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                  )}
                >
                  {selectedSubtopic.type}
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
  )
}

const MqttIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 2h-5.054a26 26 0 0 1 3.413 2.792A27 27 0 0 1 22 7.917V3a1 1 0 0 0-1-1M9.316 2H3a1 1 0 0 0-1 1v.981A18.22 18.22 0 0 1 20.15 22H21a1 1 0 0 0 .993-1.007v-6.806A21.58 21.58 0 0 0 9.316 2M2 7.034v3.256A11.883 11.883 0 0 1 13.8 22h3.38A15.15 15.15 0 0 0 2 7.034m0 6.31V21a1 1 0 0 0 1 1h7.82A8.81 8.81 0 0 0 2 13.344" />
  </svg>
)
