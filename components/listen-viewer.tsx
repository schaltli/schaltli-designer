"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useDemoMode } from "@/hooks/use-demo-mode"
import { discoveryPrefixOf, keepBrokerLogin, useMqttConnection } from "@/hooks/use-mqtt-connection"
import { DEFAULT_DISCOVERY_PREFIX, expandConfig } from "@/lib/ha-discovery"
import { restartListening, useHeardTopics, useListening, type HeardSnapshot } from "@/lib/broker-store"
import type { HeardTopic } from "@/lib/heard-topic"
import { topicTree, searchTopicTree, sortedChildren, type TopicTreeNode } from "@/lib/topic-tree"
import { MqttIcon } from "@/components/icons"
import { ChevronDown, ChevronRight, CornerDownRight, Mail, Search, X } from "lucide-react"
import type { Topic } from "./project-editor"

// «Listen to Broker»: a window for looking at what the broker carries
// (docs/2026-10-14-topic-discovery.md, decisions 7-8). It shows what the
// background listener heard since the page opened (lib/broker-store,
// components/broker-listener.tsx) as the one tree of every topic list, the
// topic in focus beside it. Topics come into the project where they are
// used (the Topic Picker); here a project topic's examples can be replaced
// by what was heard. Until 2026-10-14 this was a flat list to tick, in a
// narrow dialog that cut long names off at the end, where discovery topics
// differ (#71).

/** How long a row stays lit after a message below it. */
export const LIT_MS = 1500

/** The window event that opens the toolbar's Block menu (the pointer below). */
export const OPEN_BLOCK_MENU_EVENT = "schaltli:open-block-menu"

interface ListenViewerProps {
  isOpen: boolean
  onClose: () => void
  /** The project's topics: «in project», and «Use as examples» on them. */
  projectTopics: readonly Topic[]
  /** Replaces a project topic's examples (one undo step). */
  onUseAsExamples: (topic: string, examples: string[]) => void
}

const TYPE_BADGE: Record<HeardTopic["type"], string> = {
  numeric: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  json: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  text: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
}

function Badge({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={cn("text-xs px-1.5 rounded flex-shrink-0 leading-5", className)} title={title}>
      {children}
    </span>
  )
}

function RetainedBadge({ retained }: { retained: boolean }) {
  return retained ? (
    <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" title="The broker's retained value, delivered on subscribe">
      retained
    </Badge>
  ) : (
    <Badge className="bg-muted text-muted-foreground" title="Only heard as it was published, not retained on the broker">
      live
    </Badge>
  )
}

const two = (n: number) => String(n).padStart(2, "0")
function timeOf(at: number): string {
  const d = new Date(at)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`
}

function pretty(payload: string): string {
  try {
    const parsed = JSON.parse(payload)
    if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON: as it came.
  }
  return payload
}

/** The devices announced under `prefix`: a device by its identifiers, else each config alone. */
function announcedDevices(topics: ReadonlyMap<string, HeardTopic>, prefix: string): number {
  const devices = new Set<string>()
  for (const [topic, heard] of topics) {
    if (!topic.startsWith(`${prefix}/`) || !topic.endsWith("/config")) continue
    for (const c of expandConfig(topic, heard.messages[0]?.payload ?? "", prefix)) {
      const device = c.config.device as { identifiers?: unknown; name?: unknown } | undefined
      const ids = device?.identifiers
      const key = Array.isArray(ids) ? String(ids[0]) : typeof ids === "string" ? ids : typeof device?.name === "string" ? `name:${device.name}` : `config:${c.discoveryId}`
      devices.add(key)
    }
  }
  return devices.size
}

/** The newest arrival at or below each path, for the rows that light up. */
function newestBelow(topics: ReadonlyMap<string, HeardTopic>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [topic, heard] of topics) {
    const at = heard.messages[0]?.at ?? 0
    const parts = topic.split("/")
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/")
      if ((out.get(path) ?? 0) < at) out.set(path, at)
    }
  }
  return out
}

export function ListenViewer({ isOpen, onClose, projectTopics, onUseAsExamples }: ListenViewerProps) {
  const demo = useDemoMode()
  const heard = useHeardTopics()
  const [listening, setListening] = useListening()
  const [filter, setFilter] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<string | null>(null)
  const [viewed, setViewed] = useState(0)
  const [settings, setSettings] = useState(false)
  const connection = useMqttConnection("schaltli-listen-settings")

  // Fresh on every open: folded, nothing in focus (spec: every branch folded).
  useEffect(() => {
    if (!isOpen) return
    setFilter("")
    setExpanded(new Set())
    setFocus(null)
    setSettings(false)
  }, [isOpen])

  // Drawn once more when the last light has gone out, so a row is not
  // marked lit after its fade with nothing new arriving.
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => redraw((n) => n + 1), LIT_MS + 50)
    return () => clearTimeout(t)
  }, [heard, isOpen])

  const inProject = useMemo(() => new Map(projectTopics.map((t) => [t.topic, t])), [projectTopics])
  const local = useMemo(() => new Set(projectTopics.filter((t) => t.local).map((t) => t.topic)), [projectTopics])
  const prefix = discoveryPrefixOf(connection.config.discoveryPrefix)
  const devices = useMemo(() => announcedDevices(heard.topics, prefix), [heard.topics, prefix])
  const newest = useMemo(() => newestBelow(heard.topics), [heard.topics])

  const q = filter.trim().toLowerCase()
  const fullTree = useMemo(
    () => topicTree([...heard.topics.values()].map((h) => ({ topic: h.topic, item: h, messages: h.count }))),
    [heard.topics],
  )
  const searched = useMemo(
    () =>
      q
        ? searchTopicTree(fullTree, (path, item) => path.toLowerCase().includes(q) || (item.messages[0]?.payload ?? "").toLowerCase().includes(q))
        : null,
    [fullTree, q],
  )
  const tree = searched?.tree ?? fullTree
  const isExpanded = (path: string) => expanded.has(path) || !!searched?.open.has(path)
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // No broker and nothing heard: the fields to set one, with what the broker
  // said (a refused login, #67) - not in the demo, whose broker is its own.
  const showSettings = !demo && (settings || (heard.state === "no broker" && heard.topics.size === 0 && !!heard.error))
  const collisions = [...heard.topics.keys()].filter((t) => local.has(t))
  const focused = focus ? heard.topics.get(focus) : undefined
  const now = Date.now()

  const renderRows = (node: TopicTreeNode<HeardTopic>, depth: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = []
    for (const child of sortedChildren(node)) {
      const branch = child.children.size > 0
      const open = branch && isExpanded(child.path)
      const item = child.item
      const at = newest.get(child.path) ?? 0
      const lit = now - at < LIT_MS
      const project = item ? inProject.get(item.topic) : undefined
      rows.push(
        <div
          key={child.path}
          data-path={child.path}
          data-lit={lit || undefined}
          role={item ? "button" : undefined}
          aria-pressed={item ? focus === item.topic : undefined}
          onClick={() => {
            if (item) {
              setFocus(item.topic)
              setViewed(0)
            } else if (branch) toggle(child.path)
          }}
          className={cn(
            "relative flex items-center gap-1.5 h-7 pr-3 text-sm whitespace-nowrap cursor-pointer hover:bg-muted/40",
            item && focus === item.topic && "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]",
          )}
          style={{ paddingLeft: 8 + depth * 18 }}
        >
          {/* Lit by the newest message at or below this row, fading; a new
              one remounts it, which starts the fade again. */}
          {lit && <span key={at} aria-hidden className="listen-lit absolute inset-0 pointer-events-none" style={{ animationDuration: `${LIT_MS}ms` }} />}
          <span
            className="relative w-4 flex-shrink-0 text-muted-foreground"
            onClick={(e) => {
              if (!branch) return
              e.stopPropagation()
              toggle(child.path)
            }}
            aria-label={branch ? `${open ? "Fold" : "Open"} ${child.path}` : undefined}
            role={branch ? "button" : undefined}
          >
            {branch ? open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : null}
          </span>
          <span className={cn("relative min-w-0 truncate", branch ? "font-semibold" : "font-medium")}>{child.name}</span>
          {branch && (
            // Topics and messages below - drawn as icons, not ↳ and ✉, which the
            // UI font lacks.
            <span className="relative flex items-center gap-0.5 text-xs text-muted-foreground" data-testid="branch-counts" aria-label={`${child.topics} topics, ${child.messages} messages`}>
              <CornerDownRight className="h-3 w-3" />
              {child.topics}
              <Mail className="h-3 w-3 ml-1.5" />
              {child.messages}
            </span>
          )}
          <span className="flex-1" />
          {item && (
            <>
              <span className="relative max-w-[12rem] truncate font-mono text-xs text-muted-foreground">{item.messages[0]?.payload}</span>
              <RetainedBadge retained={item.retained} />
              <Badge className={TYPE_BADGE[item.type]}>{item.type}</Badge>
              {local.has(item.topic) ? (
                <Badge className="border border-destructive text-destructive">local topic</Badge>
              ) : (
                project && (
                  <span className="relative text-xs font-semibold text-primary" data-testid="in-project">
                    ✓ in project
                  </span>
                )
              )}
            </>
          )}
        </div>,
      )
      if (open) rows.push(...renderRows(child, depth + 1))
    }
    return rows
  }

  const connectWith = async () => {
    const login = { username: connection.config.username.trim(), password: connection.config.password }
    try {
      const client = await connection.connect(login)
      client.end(true)
      await keepBrokerLogin(login)
      setSettings(false)
      restartListening()
    } catch {
      // The error is shown under the fields.
    }
  }

  const project = focused ? inProject.get(focused.topic) : undefined
  const shownMessage = focused?.messages[Math.min(viewed, focused.messages.length - 1)]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[min(72rem,95vw)] w-full h-[min(46rem,90vh)] p-0 overflow-hidden flex flex-col gap-0">
        <style>{`@keyframes listen-lit { from { background: rgb(253 224 71 / 0.55) } to { background: transparent } } .listen-lit { animation-name: listen-lit; animation-timing-function: ease-out; animation-fill-mode: forwards }`}</style>
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MqttIcon />
            Listen to Broker
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 px-6 py-2.5 border-b bg-muted/30">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={listening}
              onClick={() => setListening(!listening)}
              className={cn(
                "relative inline-flex h-[18px] w-[30px] items-center rounded-full border-2 transition-colors",
                listening ? "border-[var(--sb-accent)] bg-[var(--sb-accent)]" : "border-muted-foreground/60 bg-muted",
              )}
            >
              <span className={cn("absolute rounded-full transition-all", listening ? "left-[13px] h-[12px] w-[12px] bg-white" : "left-[3px] h-[8px] w-[8px] bg-muted-foreground/70")} />
            </button>
            Listening
          </label>
          <span className="font-mono text-xs text-muted-foreground border rounded px-1.5 py-0.5 bg-background truncate max-w-[18rem]" title={connection.config.websocketUrl}>
            {connection.config.websocketUrl}
          </span>
          <span className="text-sm text-muted-foreground" data-testid="listen-totals">
            {heard.state === "no broker" ? "No broker" : `${heard.topics.size} topic${heard.topics.size === 1 ? "" : "s"} · ${heard.messages} message${heard.messages === 1 ? "" : "s"}`}
          </span>
          <span className="flex-1" />
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter topic or payload" className="h-8 pl-8 pr-8 text-sm" />
            {q && (
              <button onClick={() => setFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear filter">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
          {!demo && (
            <Button size="sm" variant="outline" onClick={() => setSettings(!settings)}>
              Connection settings
            </Button>
          )}
        </div>

        {showSettings ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-xl">
            {heard.state === "no broker" && heard.error && <p className="text-sm text-destructive">{heard.error}</p>}
            <div>
              <Label htmlFor="websocketUrl">WebSocket URL</Label>
              <Input id="websocketUrl" value={connection.config.websocketUrl} onChange={(e) => connection.setConfig({ ...connection.config, websocketUrl: e.target.value })} placeholder="ws://localhost:9001" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">WebSocket URL of your MQTT broker (must start with ws:// or wss://)</p>
            </div>
            <div>
              <Label htmlFor="discoveryPrefix">Discovery prefix</Label>
              <Input id="discoveryPrefix" value={connection.config.discoveryPrefix} onChange={(e) => connection.setConfig({ ...connection.config, discoveryPrefix: e.target.value })} placeholder={DEFAULT_DISCOVERY_PREFIX} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Where devices announce themselves for Home Assistant. Leave empty for {DEFAULT_DISCOVERY_PREFIX}.</p>
            </div>
            <div>
              <Label htmlFor="username">Username (Optional)</Label>
              <Input id="username" value={connection.config.username} onChange={(e) => connection.setConfig({ ...connection.config, username: e.target.value })} placeholder="Enter username" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Password (Optional)</Label>
              <Input id="password" type="password" value={connection.config.password} onChange={(e) => connection.setConfig({ ...connection.config, password: e.target.value })} placeholder="Enter password" className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Kept by the designer once it connects, for every browser and everything that talks to the broker. Empty forgets it.</p>
            </div>
            {connection.error && connection.error !== heard.error && <p className="text-sm text-destructive">{connection.error}</p>}
            <Button onClick={connectWith} disabled={connection.isConnecting || !connection.config.websocketUrl}>
              {connection.isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        ) : (
          <>
            {devices > 0 && (
              <div className="mx-6 mt-3 flex items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--sb-accent)_12%,transparent)] px-3 py-2 text-sm" data-testid="announced-pointer">
                <span>
                  <b>{devices} device{devices === 1 ? "" : "s"}</b> {devices === 1 ? "is" : "are"} announced via Home Assistant discovery. Their entities are placed as blocks.
                </span>
                <button
                  className="ml-auto font-semibold text-[var(--sb-accent)] whitespace-nowrap"
                  onClick={() => {
                    onClose()
                    window.dispatchEvent(new Event(OPEN_BLOCK_MENU_EVENT))
                  }}
                >
                  Open the Block menu ›
                </button>
              </div>
            )}
            {collisions.length > 0 && (
              <p className="mx-6 mt-3 text-sm text-destructive" data-testid="local-collision">
                {`The broker carries ${collisions.map((t) => `«${t}»`).join(", ")}, the name of a local topic here. Its messages do not reach the display: a local topic is never subscribed.`}
              </p>
            )}
            {heard.overflow > 0 && (
              <p className="mx-6 mt-3 text-sm text-muted-foreground">{`${heard.overflow} more topic(s) heard and not kept: the designer keeps ${heard.topics.size}.`}</p>
            )}
            <div className="flex flex-1 min-h-0 mt-2">
              <div className="flex-[1.25] min-w-0 overflow-y-auto border-r py-1" role="tree" aria-label="Topics heard">
                {heard.topics.size === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{emptyText(heard, listening, connection.config.websocketUrl)}</p>
                ) : q && tree.children.size === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{`No topic or payload matches «${filter.trim()}».`}</p>
                ) : (
                  renderRows(tree, 0)
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4" data-testid="listen-pane">
                {focused && shownMessage ? (
                  <>
                    <div className="font-mono text-sm break-all text-muted-foreground">
                      {focused.topic.split("/").slice(0, -1).map((p) => `${p}/`).join("")}
                      <b className="text-foreground">{focused.topic.split("/").at(-1)}</b>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <RetainedBadge retained={focused.retained} />
                      <Badge className={TYPE_BADGE[focused.type]}>{focused.type}</Badge>
                      {project && <span className="text-xs font-semibold text-primary">✓ in project</span>}
                    </div>
                    {focused.type === "json" ? (
                      <pre className="mt-3 rounded-md border bg-muted/30 p-3 text-xs font-mono whitespace-pre-wrap break-all" data-testid="listen-value">
                        {pretty(shownMessage.payload)}
                      </pre>
                    ) : (
                      <div className="mt-3 text-2xl font-semibold font-mono break-all" data-testid="listen-value">
                        {shownMessage.payload}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground mt-1" data-testid="listen-time">
                      {timeOf(shownMessage.at)}
                    </div>

                    <div className="flex items-center mt-5 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Messages
                      <span className="ml-1.5 normal-case font-normal">{`last ${focused.messages.length} of ${focused.count}`}</span>
                      <span className="flex-1" />
                      <Button size="sm" variant="outline" className="h-6 px-2" aria-label="Newer message" disabled={viewed === 0} onClick={() => setViewed((v) => Math.max(0, v - 1))}>
                        ‹
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 ml-1" aria-label="Older message" disabled={viewed >= focused.messages.length - 1} onClick={() => setViewed((v) => Math.min(focused.messages.length - 1, v + 1))}>
                        ›
                      </Button>
                    </div>
                    <div className="rounded-md border overflow-hidden" role="list" aria-label="Messages">
                      {focused.messages.map((m, i) => (
                        <div
                          key={`${m.at}-${i}`}
                          role="listitem"
                          aria-current={i === viewed || undefined}
                          onClick={() => setViewed(i)}
                          className={cn("flex gap-3 px-2.5 py-1 font-mono text-xs border-t first:border-t-0 cursor-pointer", i === viewed && "bg-primary/10")}
                        >
                          <span className="text-muted-foreground w-20 flex-shrink-0">{timeOf(m.at)}</span>
                          <span className="truncate">{m.payload}</span>
                        </div>
                      ))}
                    </div>

                    {project && !project.local && (
                      <>
                        <div className="mt-5 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples in the project</div>
                        <p className="font-mono text-xs text-muted-foreground break-all" data-testid="listen-examples">
                          {project.examples.length ? project.examples.join(", ") : "none"}
                        </p>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => onUseAsExamples(focused.topic, [...new Set(focused.messages.map((m) => m.payload))])}
                        >
                          Use as examples
                        </Button>
                        <span className="ml-2 text-xs text-muted-foreground">replaces them with the messages above</span>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Click a topic to see what it carries.</p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function emptyText(heard: HeardSnapshot, listening: boolean, url: string): string {
  if (!listening) return "Listening is off. Switch it on to see what the broker carries."
  if (heard.state === "no broker") return heard.error ?? `No broker answers at ${url}. Connection settings sets another.`
  return "Listening… nothing heard yet."
}
