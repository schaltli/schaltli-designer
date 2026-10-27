"use client"

/**
 * What a tap on a text field opens in the preview: the computer's own
 * keyboard into an input line, over the lower part of the screen where a
 * device puts its keyboard (tasks/ha-text-plan.md, decision 4). The rules
 * are the device's - the length counted in characters, the keys stopping at
 * max, OK grey below min - so what the preview sends a device would too.
 */

import { useEffect, useRef, useState } from "react"
import type { ScreenObject } from "@/components/project-editor"
import { canSendText, clampText, textFieldBounds, textLength } from "@/lib/text-field"

export interface TextFieldEntryProps {
  obj: ScreenObject
  /** What the field shows when it is tapped: typing goes on from there. */
  initial: string
  onSend: (text: string) => void
  onCancel: () => void
}

export function TextFieldEntry({ obj, initial, onSend, onCancel }: TextFieldEntryProps) {
  const bounds = textFieldBounds(obj.properties)
  const [text, setText] = useState(() => clampText(initial, bounds.maxLength))
  const inputRef = useRef<HTMLInputElement>(null)
  const sendable = canSendText(text, bounds)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      data-testid="text-field-entry"
      className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-border bg-popover p-3 shadow-lg"
      // The canvas's own keys (Delete, arrows, undo) are not this line's.
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        aria-label="Text"
        type={obj.properties.hidden === true ? "password" : "text"}
        inputMode={obj.properties.keyboard === "digits" ? "numeric" : undefined}
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
        value={text}
        onChange={(e) => setText(clampText(e.target.value, bounds.maxLength))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && sendable) onSend(text)
          else if (e.key === "Escape") onCancel()
        }}
      />
      <span data-testid="text-field-count" className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {textLength(text)}/{bounds.maxLength}
      </span>
      <button type="button" className="h-8 shrink-0 rounded-md px-3 text-sm hover:bg-muted" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="h-8 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-40"
        disabled={!sendable}
        onClick={() => onSend(text)}
      >
        OK
      </button>
    </div>
  )
}
