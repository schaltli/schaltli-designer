"use client"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { extractJsonField } from "@/lib/json-path"
import type { Topic } from "./project-editor"

interface TopicValuesPanelProps {
  topics: Topic[]
  // Simulated "message just arrived" overrides, keyed by raw topic name
  // (never by the "<topic>#<path>" composite - subtopics always resolve
  // from their parent topic's raw payload). Empty/missing means "use the
  // topic's own first example value", matching getPreviewValueFromTopic's
  // fallback everywhere else in the app.
  previewTopicValues: Record<string, string>
  onSetTopicValue: (topic: string, value: string) => void
  // Where the values come from (project-editor.tsx's live preview). Live,
  // each field shows what the broker last delivered - empty where nothing
  // has - and cannot be edited: a typed value would be one the broker never
  // sent, which is the one thing live mode promises not to show.
  source?: "live" | "simulation"
  liveStatus?: "idle" | "connecting" | "live" | "unavailable" | "lost"
  liveValues?: Record<string, string>
  brokerUrl?: string
  brokerError?: string | null
}

function sourceStatus(
  source: "live" | "simulation",
  liveStatus: TopicValuesPanelProps["liveStatus"],
  brokerUrl: string,
  brokerError: string | null | undefined,
): string {
  if (source === "live") {
    if (liveStatus === "connecting") return `Connecting to ${brokerUrl} ...`
    if (liveStatus === "lost") return `Live - the connection to ${brokerUrl} was lost. Showing the last values; press Live to reconnect.`
    return `Live from ${brokerUrl}. Values as the broker delivers them, nothing where it has none; buttons and switches publish for real.`
  }
  if (liveStatus === "unavailable") {
    return `No broker at ${brokerUrl}${brokerError ? ` (${brokerError})` : ""}. Simulating: examples and Mock Responses, nothing is published.`
  }
  return "Simulation: examples and Mock Responses, nothing is published."
}

// Right-hand panel shown in place of PropertyPanel while preview mode is
// active. Lists every topic in the project (not just ones used on the
// current preview screen - see project memory on why "all topics" was
// chosen: it keeps the list stable while navigating between preview
// screens). In the simulation, editing a value here is the same mechanism a
// "send-mqtt" button action uses and never touches a broker; live, the
// fields only show what the broker delivered.
export function TopicValuesPanel({
  topics,
  previewTopicValues,
  onSetTopicValue,
  source = "simulation",
  liveStatus = "idle",
  liveValues = {},
  brokerUrl = "",
  brokerError,
}: TopicValuesPanelProps) {
  const live = source === "live"
  const status = (
    <div data-testid="preview-source-status" className="px-3 pt-3 text-xs text-muted-foreground">
      {sourceStatus(source, liveStatus, brokerUrl, brokerError)}
    </div>
  )

  if (topics.length === 0) {
    return (
      <>
        {status}
        <div className="p-4 text-sm text-muted-foreground">
          This project has no topics yet. Add topics in Project Settings to simulate values here.
        </div>
      </>
    )
  }

  return (
    <>
    {status}
    <div className="p-3 space-y-4">
      {!live && (
        <div className="text-xs text-muted-foreground">
          Edit a value to simulate a message arriving on that topic. Changes only affect this preview session.
        </div>
      )}

      {topics.map((topic) => {
        const currentValue = live
          ? (liveValues[topic.topic] ?? "")
          : (previewTopicValues[topic.topic] ?? topic.examples[0] ?? "")
        return (
          // Keyed by the topic string, not topic.id - project.topics can
          // contain duplicate ids from older/imported data, but topic names
          // are what actually identify a topic everywhere else in the app.
          <div key={topic.topic} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium truncate" title={topic.topic}>
                {topic.topic}
              </Label>
              <Badge variant="outline" className="shrink-0">
                {topic.type}
              </Badge>
            </div>

            {topic.type === "json" ? (
              <>
                <Textarea
                  value={currentValue}
                  onChange={(e) => onSetTopicValue(topic.topic, e.target.value)}
                  readOnly={live}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder={live ? "no value yet" : '{"field": "value"}'}
                />
                {topic.subtopics && topic.subtopics.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1">
                    {topic.subtopics.map((subtopic) => {
                      const resolved = extractJsonField(currentValue, subtopic.path)
                      return (
                        <div key={subtopic.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground truncate">{subtopic.label || subtopic.path}</span>
                          <span className={resolved === undefined ? "text-destructive" : "font-mono"}>
                            {resolved === undefined ? "unresolved" : resolved}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <Input
                value={currentValue}
                onChange={(e) => onSetTopicValue(topic.topic, e.target.value)}
                readOnly={live}
                type={topic.type === "numeric" ? "text" : "text"}
                inputMode={topic.type === "numeric" ? "decimal" : "text"}
                placeholder={live ? "no value yet" : topic.type === "numeric" ? "0" : "text value"}
              />
            )}

            <Separator className="mt-3" />
          </div>
        )
      })}
    </div>
    </>
  )
}
