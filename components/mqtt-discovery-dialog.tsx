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
import { Wifi, WifiOff, Play, Square, Check, MqttIcon } from "@/components/icons"

interface DiscoveredTopic {
  topic: string
  type: "numeric" | "text" | "json"
  examples: string[]
  lastValue: string
  messageCount: number
  selected: boolean
}

interface MqttDiscoveryDialogProps {
  isOpen: boolean
  onClose: () => void
  onTopicsSelected: (topics: DiscoveredTopic[]) => void
}

let globalDiscoveryStopFlag = false
let messageProcessingQueue: Array<{ topic: string; message: string }> = []
let isProcessingQueue = false
let messageCount = 0
const MAX_MESSAGES_BEFORE_AUTO_STOP = 1000
const PROCESSING_BATCH_SIZE = 10
const PROCESSING_DELAY = 100

export function MqttDiscoveryDialog({ isOpen, onClose, onTopicsSelected }: MqttDiscoveryDialogProps) {
  const [step, setStep] = useState<"connection" | "discovery">("connection")
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredTopics, setDiscoveredTopics] = useState<DiscoveredTopic[]>([])

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
      setConnectionError(null)
      topicMapRef.current.clear()
    }
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

    batch.forEach(({ topic, message }) => {
      if (globalDiscoveryStopFlag) return

      setDiscoveredTopics((prev) => {
        const existing = prev.find((t) => t.topic === topic)
        const valueType = detectValueType(message)

        if (existing) {
          const updatedTopic = {
            ...existing,
            lastValue: message,
            messageCount: existing.messageCount + 1,
            examples: existing.examples.includes(message)
              ? existing.examples
              : [...existing.examples.slice(-4), message],
            // "json" wins over numeric/text once seen even once (a topic
            // that's ever emitted structured JSON should stay classified
            // that way rather than flip-flopping on a stray plain message);
            // otherwise the existing numeric->text upgrade-only rule.
            type:
              existing.type === valueType
                ? existing.type
                : existing.type === "json" || valueType === "json"
                  ? "json"
                  : existing.type === "numeric" && valueType === "text"
                    ? "text"
                    : existing.type,
          }
          return prev.map((t) => (t.topic === topic ? updatedTopic : t))
        } else {
          const newTopic: DiscoveredTopic = {
            topic,
            type: valueType,
            examples: [message],
            lastValue: message,
            messageCount: 1,
            selected: true,
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

      client.on("message", (topic, message) => {
        if (globalDiscoveryStopFlag || !isDiscoveringRef.current) return
        if (checkCircuitBreaker()) return

        messageProcessingQueue.push({ topic, message: message.toString() })
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

  const handleAddSelectedTopics = () => {
    const selectedTopics = discoveredTopics.filter((t) => t.selected)
    if (selectedTopics.length > 0) {
      onTopicsSelected(selectedTopics)
      onClose()
    }
  }

  const selectedCount = discoveredTopics.filter((t) => t.selected).length

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[80vh] p-0 overflow-hidden">
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
                    placeholder="wss://test.mosquitto.org:8081"
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
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
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
                  <div className="space-y-4 h-full overflow-hidden w-full max-w-full">
                    <p className="text-sm text-muted-foreground">
                      Found {discoveredTopics.length} topic{discoveredTopics.length !== 1 ? "s" : ""}
                    </p>

                    <ScrollArea className="h-[calc(80vh-300px)] w-full max-w-full">
                      <div className="space-y-0 pr-12 pl-2 w-full max-w-full">
                        {discoveredTopics.map((topic, index) => (
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

                              <span className="text-sm truncate min-w-0" title={topic.topic}>
                                {topic.topic}
                              </span>

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
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              {discoveredTopics.length > 0 && (
                <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {selectedCount} of {discoveredTopics.length} topics selected
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setDiscoveredTopics((prev) => prev.map((t) => ({ ...t, selected: false })))}
                      size="sm"
                      variant="outline"
                    >
                      Deselect All
                    </Button>
                    <Button
                      onClick={() => setDiscoveredTopics((prev) => prev.map((t) => ({ ...t, selected: true })))}
                      size="sm"
                      variant="outline"
                    >
                      Select All
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
