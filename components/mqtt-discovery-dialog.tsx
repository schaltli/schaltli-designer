"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { flattenJsonFields, type FlattenedJsonField } from "@/lib/json-path"
import { Wifi, WifiOff, Play, Square, Check, MqttIcon } from "@/components/icons"
import { Search, X } from "lucide-react"

interface DiscoveredTopic {
  topic: string
  type: "numeric" | "text" | "json"
  examples: string[]
  lastValue: string
  messageCount: number
  selected: boolean
  // Only populated for type === "json": the union of every leaf field seen
  // across this topic's kept examples (see mergeJsonMessage).
  subtopics: FlattenedJsonField[]
  // True if this topic's first-seen message arrived with the MQTT retain
  // flag set - i.e. the broker delivered it immediately on subscribe as the
  // guaranteed current value, not because it happened to publish live
  // during this session. See handleStartDiscovery's comment for why this
  // matters.
  retained: boolean
}

interface MqttDiscoveryDialogProps {
  isOpen: boolean
  onClose: () => void
  onTopicsSelected: (topics: DiscoveredTopic[]) => void
}

let globalDiscoveryStopFlag = false
let messageProcessingQueue: Array<{ topic: string; message: string; retained: boolean }> = []
let isProcessingQueue = false
let messageCount = 0
// This broker sees ~15-20 msg/s across all of Pekaway's subsystems (fan,
// heater, BMS, doorman, ...), not just a quiet test broker - the original
// 1000 cap stopped discovery after under a minute. 10000 gives ~9+ minutes.
const MAX_MESSAGES_BEFORE_AUTO_STOP = 10000
const PROCESSING_BATCH_SIZE = 10
const PROCESSING_DELAY = 100
// A JSON topic's subtopics are merged across messages, because publishers
// legitimately vary their payload shape (optional fields, per-mode extra
// keys), and binding a field should not depend on which message happened
// to be sampled first. Unbounded merging is the risk on the other side -
// a topic keyed by e.g. a timestamp or device id would grow one subtopic
// per message forever - so only a message that actually contributes a
// previously-unseen field is kept as an example, and once a topic has this
// many kept examples it is considered fully characterized and its later
// messages aren't inspected at all.
const MAX_JSON_EXAMPLES = 10

export function MqttDiscoveryDialog({ isOpen, onClose, onTopicsSelected }: MqttDiscoveryDialogProps) {
  const [step, setStep] = useState<"connection" | "discovery">("connection")
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredTopics, setDiscoveredTopics] = useState<DiscoveredTopic[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  const {
    config: connectionConfig,
    setConfig: setConnectionConfig,
    isConnecting,
    isConnected,
    error: connectionError,
    setError: setConnectionError,
    connect: connectMqtt,
    disconnect: disconnectMqtt,
    clientRef: mqttClientRef,
  } = useMqttConnection("mqtt-discovery")

  const discoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const topicMapRef = useRef<Map<string, DiscoveredTopic>>(new Map())
  const isDiscoveringRef = useRef(false)

  useEffect(() => {
    isDiscoveringRef.current = isDiscovering
    globalDiscoveryStopFlag = !isDiscovering
  }, [isDiscovering])

  useEffect(() => {
    if (!isOpen) {
      globalDiscoveryStopFlag = false
      handleDisconnect()
      setStep("connection")
      setDiscoveredTopics([])
      setSearchQuery("")
      setConnectionError(null)
      topicMapRef.current.clear()
    }
  }, [isOpen])

  // Auto-connect the moment the dialog opens - the broker URL is derived
  // automatically now (useMqttConnection), so there's no real setup step
  // left for the common case. Deliberately keyed only on isOpen, not
  // isConnected/isConnecting, so this fires once per open rather than
  // re-triggering as those flip during the attempt; the manual fields +
  // Connect button below still work for editing/retrying.
  useEffect(() => {
    if (isOpen && !isConnected && !isConnecting) {
      handleConnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const detectValueType = (value: string): "numeric" | "text" | "json" => {
    const trimmed = value.trim()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed)
        // A bare number/string/bool technically parses too ("23" -> 23) -
        // only genuinely structured payloads (the { or [ prefix already
        // filters out most of that, but stay precise) count as "json".
        if (typeof parsed === "object" && parsed !== null) {
          return "json"
        }
      } catch {
        // Not valid JSON - fall through to the numeric/text check below.
      }
    }
    const num = Number(value)
    return !isNaN(num) && isFinite(num) ? "numeric" : "text"
  }

  // Merges one JSON message into a topic's accumulated (examples,
  // subtopics), returning null when nothing changed - i.e. the message
  // carried no field this topic hasn't already got, so it's dropped rather
  // than kept as a redundant example.
  const mergeJsonMessage = (
    message: string,
    examples: string[],
    subtopics: FlattenedJsonField[],
  ): { examples: string[]; subtopics: FlattenedJsonField[] } | null => {
    if (examples.length >= MAX_JSON_EXAMPLES) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return null
    }
    const known = new Set(subtopics.map((s) => s.path))
    const added = flattenJsonFields(parsed).filter((f) => !known.has(f.path))
    if (added.length === 0) return null
    return { examples: [...examples, message], subtopics: [...subtopics, ...added] }
  }

  const checkCircuitBreaker = () => {
    messageCount++
    if (messageCount > MAX_MESSAGES_BEFORE_AUTO_STOP) {
      handleStopDiscovery()
      return true
    }
    return false
  }

  const processMessageQueue = () => {
    if (isProcessingQueue || globalDiscoveryStopFlag || messageProcessingQueue.length === 0) return

    isProcessingQueue = true
    const batch = messageProcessingQueue.splice(0, PROCESSING_BATCH_SIZE)

    batch.forEach(({ topic, message, retained }) => {
      if (globalDiscoveryStopFlag) return

      setDiscoveredTopics((prev) => {
        const existing = prev.find((t) => t.topic === topic)
        const valueType = detectValueType(message)

        if (existing) {
          // "json" wins over numeric/text once seen even once (a topic
          // that's ever emitted structured JSON should stay classified
          // that way rather than flip-flopping on a stray plain message);
          // otherwise the existing numeric->text upgrade-only rule.
          const mergedType =
            existing.type === valueType
              ? existing.type
              : existing.type === "json" || valueType === "json"
                ? "json"
                : existing.type === "numeric" && valueType === "text"
                  ? "text"
                  : existing.type

          // A JSON topic keeps examples for their field coverage, not as a
          // rolling sample, so its examples[] is grown by mergeJsonMessage
          // instead of the last-5 window a plain topic uses.
          const merged = mergedType === "json" ? mergeJsonMessage(message, existing.examples, existing.subtopics) : null

          const updatedTopic: DiscoveredTopic = {
            ...existing,
            lastValue: message,
            messageCount: existing.messageCount + 1,
            // Once retained, always shown as retained - a topic can only
            // ever lose that guarantee if the broker's retained message is
            // cleared, which a plain discovery session has no way to know
            // about anyway, so keep showing the stronger guarantee.
            retained: existing.retained || retained,
            type: mergedType,
            examples:
              mergedType === "json"
                ? (merged?.examples ?? existing.examples)
                : existing.examples.includes(message)
                  ? existing.examples
                  : [...existing.examples.slice(-4), message],
            subtopics: merged?.subtopics ?? existing.subtopics,
          }
          return prev.map((t) => (t.topic === topic ? updatedTopic : t))
        } else {
          const merged = valueType === "json" ? mergeJsonMessage(message, [], []) : null
          const newTopic: DiscoveredTopic = {
            topic,
            type: valueType,
            examples: merged?.examples ?? [message],
            subtopics: merged?.subtopics ?? [],
            lastValue: message,
            messageCount: 1,
            selected: true,
            retained,
          }
          return [...prev, newTopic].sort((a, b) => a.topic.localeCompare(b.topic))
        }
      })
    })

    isProcessingQueue = false

    if (messageProcessingQueue.length > 0 && !globalDiscoveryStopFlag) {
      setTimeout(processMessageQueue, PROCESSING_DELAY)
    }
  }

  const handleConnect = async () => {
    try {
      const client = await connectMqtt()
      setStep("discovery")

      client.on("offline", () => {
        setConnectionError("Connection lost")
        handleDisconnect()
      })

      client.on("message", (topic, message, packet) => {
        if (globalDiscoveryStopFlag || !isDiscoveringRef.current) return
        if (checkCircuitBreaker()) return

        // packet.retain is true exactly when the broker delivered this
        // message because it's the retained value for a topic we just
        // subscribed to (not because it happened to publish live right
        // now) - mosquitto sends these immediately on subscribe, so this
        // fires for every currently-retained topic within the first
        // fraction of a second of clicking "Start Discovery", regardless
        // of whether that topic ever publishes again during the session.
        messageProcessingQueue.push({ topic, message: message.toString(), retained: packet.retain })
        if (!isProcessingQueue) setTimeout(processMessageQueue, 0)
      })
    } catch {
      // Error state already set by useMqttConnection.
    }
  }

  const handleDisconnect = () => {
    setIsDiscovering(false)
    if (discoveryTimeoutRef.current) {
      clearInterval(discoveryTimeoutRef.current)
      discoveryTimeoutRef.current = null
    }
    disconnectMqtt()
  }

  const handleStartDiscovery = () => {
    if (!isConnected || !mqttClientRef.current) {
      setConnectionError("Not connected to MQTT broker")
      return
    }
    globalDiscoveryStopFlag = false
    messageProcessingQueue = []
    isProcessingQueue = false
    messageCount = 0
    isDiscoveringRef.current = true
    setIsDiscovering(true)
    setDiscoveredTopics([])
    topicMapRef.current.clear()

    mqttClientRef.current.subscribe("#", (err) => {
      if (err) console.error("Failed to subscribe to #:", err)
    })
  }

  const handleStopDiscovery = () => {
    globalDiscoveryStopFlag = true
    isDiscoveringRef.current = false
    messageProcessingQueue = []
    isProcessingQueue = false
    setIsDiscovering(false)

    if (mqttClientRef.current) {
      mqttClientRef.current.unsubscribe("#", (err) => {
        if (err) console.error("Failed to unsubscribe:", err)
      })
    }
  }

  const toggleTopicSelection = (topicName: string) => {
    setDiscoveredTopics((prev) => prev.map((t) => (t.topic === topicName ? { ...t, selected: !t.selected } : t)))
  }

  const filteredTopics = searchQuery.trim()
    ? discoveredTopics.filter((t) => t.topic.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : discoveredTopics
  const isFiltered = searchQuery.trim().length > 0

  // Every topic starts out selected="true" the moment it's discovered (see
  // processMessageQueue), so with a filter active most topics carry a
  // stale "selected" flag from before the filter existed - scope to what's
  // actually visible, or "Add Selected Topics" would silently add
  // currently-hidden topics the user never consciously chose.
  const handleAddSelectedTopics = () => {
    const selectedTopics = (isFiltered ? filteredTopics : discoveredTopics).filter((t) => t.selected)
    if (selectedTopics.length > 0) {
      onTopicsSelected(selectedTopics)
      onClose()
    }
  }

  const selectedCount = (isFiltered ? filteredTopics : discoveredTopics).filter((t) => t.selected).length

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-full max-h-[80vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MqttIcon />
            Discover MQTT Topics
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {step === "connection" && (
            <div className="flex-1 p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="websocketUrl" className="text-sm font-medium">
                    WebSocket URL
                  </Label>
                  <Input
                    id="websocketUrl"
                    value={connectionConfig.websocketUrl}
                    onChange={(e) => setConnectionConfig({ ...connectionConfig, websocketUrl: e.target.value })}
                    placeholder="ws://localhost:9001"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    WebSocket URL of your MQTT broker (must start with ws:// or wss://)
                  </p>
                </div>

                <div>
                  <Label htmlFor="clientId" className="text-sm font-medium">
                    Client ID
                  </Label>
                  <Input
                    id="clientId"
                    value={connectionConfig.clientId}
                    onChange={(e) => setConnectionConfig({ ...connectionConfig, clientId: e.target.value })}
                    placeholder="mqtt-discovery-client"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Unique identifier for this MQTT client</p>
                </div>

                <div>
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username (Optional)
                  </Label>
                  <Input
                    id="username"
                    value={connectionConfig.username}
                    onChange={(e) => setConnectionConfig({ ...connectionConfig, username: e.target.value })}
                    placeholder="Enter username"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password (Optional)
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={connectionConfig.password}
                    onChange={(e) => setConnectionConfig({ ...connectionConfig, password: e.target.value })}
                    placeholder="Enter password"
                    className="mt-1"
                  />
                </div>

                {connectionError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive">{connectionError}</p>
                  </div>
                )}
              </div>

              <Button
                onClick={handleConnect}
                disabled={isConnecting || !connectionConfig.websocketUrl}
                className="w-full"
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          )}

          {step === "discovery" && (
            <div className="flex-1 flex flex-col overflow-hidden w-full max-w-full">
              <div className="px-6 py-4 border-b bg-muted/30">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected ? (
                        <Wifi className="h-4 w-4 text-green-600" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-600" />
                      )}
                      <span className="text-sm font-medium">{isConnected ? "Connected" : "Disconnected"}</span>
                    </div>
                    {isConnected && (
                      <Badge
                        variant="outline"
                        className="text-xs truncate max-w-[300px]"
                        title={connectionConfig.websocketUrl}
                      >
                        {connectionConfig.websocketUrl}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isConnected && (
                      <>
                        {!isDiscovering ? (
                          <Button onClick={handleStartDiscovery} size="sm" className="gap-2">
                            <Play className="h-3 w-3" />
                            Start Discovery
                          </Button>
                        ) : (
                          <Button onClick={handleStopDiscovery} size="sm" variant="destructive" className="gap-2">
                            <Square className="h-3 w-3" />
                            Stop Discovery
                          </Button>
                        )}
                        <Button onClick={handleDisconnect} size="sm" variant="outline">
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-hidden w-full max-w-full">
                {discoveredTopics.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground">
                      {isDiscovering ? "Listening for MQTT topics..." : "Click 'Start Discovery' to begin"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 h-full overflow-hidden w-full max-w-full flex flex-col">
                    <div className="flex items-center justify-between gap-4 shrink-0">
                      <p className="text-sm text-muted-foreground">
                        {isFiltered
                          ? `Showing ${filteredTopics.length} of ${discoveredTopics.length} topic${discoveredTopics.length !== 1 ? "s" : ""}`
                          : `Found ${discoveredTopics.length} topic${discoveredTopics.length !== 1 ? "s" : ""}`}
                      </p>
                      <div className="relative w-64 shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter topics..."
                          className="h-8 pl-8 pr-8 text-sm"
                        />
                        {isFiltered && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear filter"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <ScrollArea className="flex-1 min-h-0 w-full max-w-full">
                      <div className="space-y-0 pr-12 pl-2 w-full max-w-full">
                        {filteredTopics.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            No topics match "{searchQuery}"
                          </p>
                        )}
                        {filteredTopics.map((topic, index) => (
                          <div
                            key={topic.topic}
                            className={cn(
                              "py-2 px-3 cursor-pointer transition-colors w-full max-w-full overflow-hidden hover:bg-muted/30",
                              topic.selected ? "bg-primary/3" : "",
                              index > 0 ? "border-t border-border/30" : "",
                            )}
                            onClick={() => toggleTopicSelection(topic.topic)}
                          >
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 w-full overflow-hidden">
                              <div
                                className={cn(
                                  "w-3 h-3 rounded border flex items-center justify-center",
                                  topic.selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                                )}
                              >
                                {topic.selected && <div className="h-2 w-2 text-primary-foreground"></div>}
                              </div>

                              <div className="min-w-0">
                                <span className="text-sm truncate block min-w-0" title={topic.topic}>
                                  {topic.topic}
                                </span>
                                {topic.type === "json" && topic.subtopics.length > 0 && (
                                  <span
                                    className="text-muted-foreground block truncate font-mono text-xs"
                                    title={topic.subtopics.map((s) => s.path).join(", ")}
                                  >
                                    {topic.subtopics.map((s) => s.path).join(", ")}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs px-1.5 py-0 h-5 shrink-0 border-0",
                                    topic.retained
                                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                  title={
                                    topic.retained
                                      ? "Delivered immediately on subscribe - this is the broker's current retained value, not just something caught live during this session"
                                      : "Only ever seen as live traffic during this session - not (yet) retained on the broker"
                                  }
                                >
                                  {topic.retained ? "retained" : "live"}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs px-1.5 py-0 h-5 shrink-0 border-0",
                                    topic.type === "numeric"
                                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                                      : topic.type === "json"
                                        ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                                        : "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
                                  )}
                                >
                                  {topic.type}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              {discoveredTopics.length > 0 && (
                <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {isFiltered
                      ? `${selectedCount} of ${filteredTopics.length} shown selected`
                      : `${selectedCount} of ${discoveredTopics.length} topics selected`}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const visible = new Set(filteredTopics.map((t) => t.topic))
                        setDiscoveredTopics((prev) =>
                          prev.map((t) => (visible.has(t.topic) ? { ...t, selected: false } : t)),
                        )
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {isFiltered ? "Deselect Shown" : "Deselect All"}
                    </Button>
                    <Button
                      onClick={() => {
                        const visible = new Set(filteredTopics.map((t) => t.topic))
                        setDiscoveredTopics((prev) =>
                          prev.map((t) => (visible.has(t.topic) ? { ...t, selected: true } : t)),
                        )
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {isFiltered ? "Select Shown" : "Select All"}
                    </Button>
                    <Button onClick={handleAddSelectedTopics} disabled={selectedCount === 0} size="sm">
                      <Check className="h-3 w-3 mr-1" />
                      Add Selected Topics
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
