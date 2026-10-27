"use client"

/**
 * What a tap on a time field opens in the preview: the browser's own time
 * input over the foot of the screen, where a device puts its picker
 * (tasks/ha-time-plan.md). OK rounds what was set onto the field's step and
 * sends it as Home Assistant writes a time, `HH:MM:00` - as a device does.
 */

import { useEffect, useRef, useState } from "react"
import type { ScreenObject } from "@/components/project-editor"
import { formatTime, onStep, parseTime, timeFieldStep, timePayload } from "@/lib/time-field"

export interface TimeFieldEntryProps {
  obj: ScreenObject
  /** What the field shows when it is tapped; the picker opens on it, on the step. */
  initial: string
  onSend: (payload: string) => void
  onCancel: () => void
}

export function TimeFieldEntry({ obj, initial, onSend, onCancel }: TimeFieldEntryProps) {
  const step = timeFieldStep(obj.properties)
  const start = parseTime(initial)
  const [value, setValue] = useState(() => formatTime(onStep(start ?? { hour: 0, minute: 0 }, step)))
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = parseTime(value)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = () => {
    if (parsed) onSend(timePayload(onStep(parsed, step)))
  }

  return (
    <div
      data-testid="time-field-entry"
      className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-border bg-popover p-3 shadow-lg"
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        aria-label="Time"
        type="time"
        step={step * 60}
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send()
          else if (e.key === "Escape") onCancel()
        }}
      />
      <span className="shrink-0 text-xs text-muted-foreground">every {step} min</span>
      <button type="button" className="h-8 shrink-0 rounded-md px-3 text-sm hover:bg-muted" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="h-8 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-40"
        disabled={!parsed}
        onClick={send}
      >
        OK
      </button>
    </div>
  )
}
