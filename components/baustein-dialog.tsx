"use client"

// The wizard between dragging a building block's rectangle and the objects
// appearing: which instance of it - which tank - the block is for, and then
// how it is to be placed (docs/2026-09-29-block-options.md): picking the tank
// no longer places it at once, it opens a second step with the options and
// Insert. Left alone, the options place what the one-step wizard placed.
//
// It asks the broker rather than the project: the bridge publishes every
// value the installation has, retained, so the answer is the real list with
// the installation's own names ("Frischwasser"), and nobody types a topic.
// Without a broker it offers the standard topics the same bridge would
// publish, so a screen built at the kitchen table still works in the van.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import type { Topic } from "@/components/project-editor"
import { PlaceholderTextField, PLACEHOLDER_HINT } from "@/components/property-panel/fields/placeholder-text-field"
import type { Separators } from "@/lib/placeholders"
import {
  STATE_PREFIX,
  defaultOptions,
  discoverInstances,
  fallbackInstances,
  lookSupported,
  type BausteinDef,
  type BausteinInstance,
  type BausteinOptions,
  type LabelPosition,
} from "@/lib/bausteine"
import { cn } from "@/lib/utils"

// Quiet after the last retained value before the list counts as complete,
// and the longest the dialog waits for a first one.
const SETTLE_QUIET_MS = 300
const SETTLE_MAX_MS = 5000

// The last choices per block, for this session: the second Tank placed
// opens looking like the first (2026-09-29). Not the label - that belongs to
// the instance. Kept in the module, so it lasts until the page reloads.
const lastChoices = new Map<string, Omit<BausteinOptions, "label">>()

interface BausteinDialogProps {
  def: BausteinDef | null
  /** The project's topics, for the label field's `{` list. */
  topics: Topic[]
  separators?: Separators
  /** What the device draws; a look needing anything else is greyed out. */
  supportedObjectTypes?: string[]
  onCancel: () => void
  onConfirm: (instance: BausteinInstance, options: BausteinOptions) => void
}

export function BausteinDialog({ def, topics, separators, supportedObjectTypes, onCancel, onConfirm }: BausteinDialogProps) {
  const { config, connect, disconnect } = useMqttConnection("schaltli-blocks")
  const [instances, setInstances] = useState<BausteinInstance[] | null>(null)
  // The second step: the instance picked, and the options as they are being
  // edited - prefilled from the instance when it is picked.
  const [chosen, setChosen] = useState<BausteinInstance | null>(null)
  const [options, setOptions] = useState<BausteinOptions | null>(null)
  // Three answers, not two: a broker that knows this installation, a broker
  // that has nothing to say about it, and no broker at all. They lead to the
  // same list of standard topics but mean different things to the person
  // reading them.
  const [source, setSource] = useState<"asking" | "broker" | "empty" | "offline">("asking")
  const generationRef = useRef(0)

  useEffect(() => {
    if (!def) {
      setInstances(null)
      return
    }
    const generation = ++generationRef.current
    setInstances(null)
    setChosen(null)
    setOptions(null)
    setSource("asking")

    let settle: ReturnType<typeof setTimeout> | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    const values: Record<string, string> = {}

    connect()
      .then((client) => {
        if (generation !== generationRef.current) {
          client.end(true)
          return
        }
        const finish = () => {
          if (settle) clearTimeout(settle)
          if (deadline) clearTimeout(deadline)
          if (generation !== generationRef.current) return
          const found = discoverInstances(def, values)
          setSource(found.length > 0 ? "broker" : "empty")
          setInstances(found.length > 0 ? found : fallbackInstances(def))
          disconnect()
        }
        // Retained values arrive in one burst, but when depends on the
        // broker and the machine: a fixed 1.2 s was sometimes too short under
        // load and the van's tanks were missing (2026-09-29). So the list is
        // settled once the burst has gone quiet, and a broker that holds
        // nothing for this block is given up on after 5 s.
        client.on("message", (topic, payload) => {
          values[topic] = payload.toString()
          if (settle) clearTimeout(settle)
          settle = setTimeout(finish, SETTLE_QUIET_MS)
        })
        client.subscribe(`${STATE_PREFIX}${def.group}/#`)
        deadline = setTimeout(finish, SETTLE_MAX_MS)
      })
      .catch(() => {
        if (generation !== generationRef.current) return
        setSource("offline")
        setInstances(fallbackInstances(def))
      })

    return () => {
      generationRef.current++
      if (settle) clearTimeout(settle)
      if (deadline) clearTimeout(deadline)
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def])

  if (!def) return null

  const choose = (instance: BausteinInstance) => {
    setChosen(instance)
    const defaults = defaultOptions(def, instance, supportedObjectTypes)
    const last = lastChoices.get(def.id)
    const lastLook = last && def.looks.find((look) => look.id === last.look)
    setOptions(
      last
        ? {
            ...defaults,
            ...last,
            // A look the device cannot draw is not taken over from another
            // project's device.
            look: lastLook && lookSupported(lastLook, supportedObjectTypes) ? last.look : defaults.look,
          }
        : defaults,
    )
  }
  const insert = (instance: BausteinInstance, chosenOptions: BausteinOptions) => {
    const { label: _label, ...rest } = chosenOptions
    lastChoices.set(def.id, rest)
    onConfirm(instance, chosenOptions)
  }
  const back = () => {
    setChosen(null)
    setOptions(null)
  }
  const title = chosen ? (def.keyed ? `${def.label} ${chosen.key} - ${chosen.label}` : chosen.label) : null

  if (chosen && options) {
    return (
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Insert {def.label}</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-border px-3 py-2" data-testid="baustein-chosen">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">{chosen.valueTopic}</div>
          </div>

          <PlaceholderTextField
            id="baustein-label"
            label="Label"
            value={options.label}
            onChange={(label) => setOptions({ ...options, label })}
            topics={topics}
            separators={separators}
            hint={chosen.nameTopic ? "Follows the name the van reports. Type over it for a fixed text." : PLACEHOLDER_HINT}
          />

          {def.looks.length > 1 && (
            <Choice label="Look">
              {def.looks.map((look) => {
                const supported = lookSupported(look, supportedObjectTypes)
                return (
                  <ChoiceButton
                    key={look.id}
                    testId={`baustein-look-${look.id}`}
                    selected={options.look === look.id}
                    disabled={!supported}
                    title={supported ? undefined : `This device does not draw a ${look.label}.`}
                    onClick={() => setOptions({ ...options, look: look.id })}
                  >
                    {look.label}
                  </ChoiceButton>
                )
              })}
            </Choice>
          )}

          {def.states && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">States</span>
              <div className="flex gap-2">
                {def.states.map((state) => (
                  <Input
                    key={state.id}
                    data-testid={`baustein-state-${state.id}`}
                    aria-label={`State ${state.id}`}
                    placeholder={state.label}
                    value={options.stateLabels[state.id] ?? ""}
                    onChange={(e) =>
                      setOptions({ ...options, stateLabels: { ...options.stateLabels, [state.id]: e.target.value } })
                    }
                    className="h-8"
                  />
                ))}
              </div>
            </div>
          )}

          {def.defaultStep !== undefined && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Step</span>
              <Input
                type="number"
                min={1}
                max={50}
                data-testid="baustein-step"
                value={options.step}
                onChange={(e) => setOptions({ ...options, step: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                className="h-8 w-24"
              />
            </label>
          )}

          <Choice label="Label position">
            {(["above", "left"] as LabelPosition[]).map((position) => (
              <ChoiceButton
                key={position}
                testId={`baustein-label-position-${position}`}
                selected={options.labelPosition === position}
                onClick={() => setOptions({ ...options, labelPosition: position })}
              >
                {position === "above" ? "Above" : "Left"}
              </ChoiceButton>
            ))}
          </Choice>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={back}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="sm" data-testid="baustein-insert" onClick={() => insert(chosen, options)}>
                Insert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert {def.label}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground" data-testid="baustein-source">
          {source === "asking"
            ? `Asking ${config.websocketUrl} what this installation has ...`
            : source === "broker"
              ? `Found on ${config.websocketUrl}.`
              : source === "empty"
                ? `No ${def.label.toLowerCase()} values on ${config.websocketUrl} - offering the standard topics.`
                : `No broker at ${config.websocketUrl} - offering the standard topics.`}
        </p>

        <div className="space-y-2">
          {(instances ?? []).map((instance) => (
            <button
              key={instance.key}
              type="button"
              data-testid={`baustein-instance-${instance.key}`}
              onClick={() => choose(instance)}
              className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
            >
              <div className="text-sm font-medium">
                {/* A numbered instance says which one it is; a group with a
                    single instance would otherwise read "Battery soc -
                    Battery". */}
                {def.keyed ? `${def.label} ${instance.key} - ${instance.label}` : instance.label}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{instance.valueTopic}</div>
            </button>
          ))}
          {instances !== null && instances.length === 0 && (
            <p className="text-sm text-muted-foreground">This installation reports no {def.label.toLowerCase()}.</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// A row of mutually exclusive buttons, the chosen one filled. A look the
// device cannot draw stays in the row, disabled, with the reason as its
// tooltip - as a block the device cannot draw stays in the Block menu.
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function ChoiceButton({
  testId,
  selected,
  disabled,
  title,
  onClick,
  children,
}: {
  testId: string
  selected: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1 text-sm",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  )
}
