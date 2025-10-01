"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Topic } from "./screenman-editor"
import { cn } from "@/lib/utils"

interface FieldTopicSelectionDialogProps {
  open: boolean
  onClose: () => void
  onSelectTopic: (topicId: string | undefined) => void
  onManageTopics: () => void
  topics: Topic[]
  fieldType: "numeric" | "boolean" | "string"
}

export function FieldTopicSelectionDialog({
  open,
  onClose,
  onSelectTopic,
  onManageTopics,
  topics,
  fieldType,
}: FieldTopicSelectionDialogProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | undefined>(undefined)

  // Show all topics regardless of type
  const filteredTopics = topics

  const handleConfirm = () => {
    console.log("[v0] FieldTopicSelectionDialog confirming with topic:", selectedTopicId)
    onSelectTopic(selectedTopicId)
    onClose()
  }

  const handleCancel = () => {
    console.log("[v0] FieldTopicSelectionDialog cancelled")
    onSelectTopic(undefined)
    onClose()
  }

  const handleManageTopics = () => {
    console.log("[v0] FieldTopicSelectionDialog manage topics clicked")
    onManageTopics()
    onClose()
  }

  const selectedTopic = filteredTopics.find((t) => t.id === selectedTopicId)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg w-full max-w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Topic for new Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Select
              value={selectedTopicId || "none"}
              onValueChange={(value) => {
                console.log("[v0] FieldTopicSelectionDialog topic changed to:", value)
                if (value === "manage") {
                  handleManageTopics()
                } else if (value === "none") {
                  setSelectedTopicId(undefined)
                } else {
                  setSelectedTopicId(value)
                }
              }}
            >
              <SelectTrigger className="w-full max-w-full overflow-hidden">
                <SelectValue placeholder="Select a topic">
                  {selectedTopic ? (
                    <div className="flex items-center gap-2 w-full max-w-full overflow-hidden">
                      <span className="truncate break-all word-break-break-all flex-1 min-w-0">
                        {selectedTopic.topic}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full flex-shrink-0",
                          selectedTopic.type === "numeric"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
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
              <SelectContent className="w-full max-w-full">
                <SelectItem value="none">No topic</SelectItem>
                {filteredTopics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    <div className="flex items-center gap-2 w-full max-w-full overflow-hidden">
                      <span className="truncate break-all word-break-break-all flex-1 min-w-0">{topic.topic}</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full flex-shrink-0",
                          topic.type === "numeric"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                        )}
                      >
                        {topic.type}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {filteredTopics.length > 0 && <div className="border-t my-1" />}
                <SelectItem value="manage">
                  <div className="flex items-center gap-2 text-primary">
                    <MqttIcon className="h-4 w-4" />
                    <span>Manage Topics...</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Create without Topic
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedTopicId}>
              Create Field
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const MqttIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 2h-5.054a26 26 0 0 1 3.413 2.792A27 27 0 0 1 22 7.917V3a1 1 0 0 0-1-1M9.316 2H3a1 1 0 0 0-1 1v.981A18.22 18.22 0 0 1 20.15 22H21a1 1 0 0 0 .993-1.007v-6.806A21.58 21.58 0 0 0 9.316 2M2 7.034v3.256A11.883 11.883 0 0 1 13.8 22h3.38A15.15 15.15 0 0 0 2 7.034m0 6.31V21a1 1 0 0 0 1 1h7.82A8.81 8.81 0 0 0 2 13.344" />
  </svg>
)
