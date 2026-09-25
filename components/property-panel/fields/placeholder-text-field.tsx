"use client"

/**
 * A text field that takes placeholders: typing `{` opens a list of what can
 * go there, `:` after a topic the formats (docs/2026-09-25-placeholder-
 * picker.md). What the list offers and what a pick writes is decided in
 * lib/placeholder-completion.ts; this only wires it to keys and a list.
 *
 * Focus never leaves the input. ↑/↓/Enter/Tab/Esc are handled on the input
 * while the list is open, so typing keeps filtering, and leaving the field
 * still means what it did before - the moment its topics are declared.
 *
 * The list is a plain listbox, not cmdk's Command: cmdk selects and filters
 * on its own, and here both are already decided before anything renders.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Topic } from "@/components/project-editor"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  applyCompletion,
  completionContext,
  formatEntries,
  referenceEntries,
  placeholderProblems,
  topicExample,
  type CompletionContext,
} from "@/lib/placeholder-completion"
import { DEFAULT_SEPARATORS, type Separators } from "@/lib/placeholders"
import { cn } from "@/lib/utils"
import { FIELD, FieldBox, PropertyRow } from "./field-shell"

export interface PlaceholderTextFieldProps {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  /** When the field is left - where the topics its placeholders name are declared. */
  onBlur?: (value: string) => void
  topics: Topic[]
  /** The project's number format, for the format previews. */
  separators?: Separators
  placeholder?: string
  hint?: string
  id?: string
}

interface Option {
  /** What a pick writes. */
  value: string
  /** What the row shows first. */
  text: string
  detail?: string
  example?: string
}

interface Group {
  heading: string
  options: Option[]
}

// Under the field when nothing is wrong: the two things the list does not
// show - that there is a list, and `??`, which is typed.
export const PLACEHOLDER_HINT = "Type { for a value, e.g. {topic:…:F1}. ?? gives a fallback."

const HEADINGS ={ topic: "Topic", device: "Device", project: "Project" } as const

function groupsFor(context: CompletionContext, topics: Topic[], separators: Separators): Group[] {
  if (context.stage === "format") {
    const example = topicExample(context.topicPath ?? "", topics)
    const options = formatEntries(context.query, example, separators).map((entry) => ({
      value: entry.format,
      text: entry.format,
      example: entry.preview,
    }))
    return options.length ? [{ heading: "Format", options }] : []
  }
  const groups: Group[] = []
  for (const entry of referenceEntries(context.query, topics)) {
    const heading = HEADINGS[entry.section]
    let group = groups.find((g) => g.heading === heading)
    if (!group) groups.push((group = { heading, options: [] }))
    group.options.push({
      value: entry.reference,
      // The section heading already says the namespace.
      text: entry.reference.slice(entry.section.length + 1),
      detail: entry.detail,
      example: entry.example,
    })
  }
  return groups
}

let measureCanvas: HTMLCanvasElement | undefined

// Where the caret is, in px from the input's left edge, measured in the
// input's own font - so the list starts under the text it will write.
function caretX(input: HTMLInputElement, caret: number): number {
  const style = getComputedStyle(input)
  measureCanvas ??= document.createElement("canvas")
  const ctx = measureCanvas.getContext("2d")
  if (!ctx) return 0
  ctx.font = style.font
  const width = ctx.measureText(input.value.slice(0, caret)).width
  const x = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) + width - input.scrollLeft
  return Math.max(0, Math.min(x, input.clientWidth))
}

export function PlaceholderTextField({
  label,
  value,
  onChange,
  onBlur,
  topics,
  separators = DEFAULT_SEPARATORS,
  placeholder,
  hint,
  id,
}: PlaceholderTextFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const listId = `${fieldId}-placeholders`
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const text = value ?? ""

  const [caret, setCaret] = useState(0)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [anchorX, setAnchorX] = useState(0)
  // Where to put the caret once a pick's text has rendered. Counted, not
  // keyed on the text: picking the `F0` just typed leaves the text as it was.
  const pendingCaret = useRef<number | null>(null)
  const [picks, setPicks] = useState(0)

  const context = useMemo(() => completionContext(text, caret), [text, caret])
  const groups = useMemo(
    () => (context ? groupsFor(context, topics, separators) : []),
    [context, topics, separators],
  )
  const options = useMemo(() => groups.flatMap((g) => g.options), [groups])
  const shown = open && !!context && options.length > 0

  // The lines under the field. The `{…` being typed has no `}` yet, which
  // is not worth a red line while the author is still writing it.
  const [focused, setFocused] = useState(false)
  const linesId = `${fieldId}-lines`
  const problems = useMemo(() => {
    const typing = focused && context ? text.slice(context.start) : undefined
    return placeholderProblems(text, topics).filter((p) => !(p.severity === "error" && p.source === typing))
  }, [text, topics, focused, context])

  // A new query starts at the top of what it finds.
  useEffect(() => setHighlight(0), [context?.stage, context?.query])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (pendingCaret.current === null || !input) return
    input.setSelectionRange(pendingCaret.current, pendingCaret.current)
    setCaret(pendingCaret.current)
    pendingCaret.current = null
  }, [text, picks])

  useLayoutEffect(() => {
    if (shown && inputRef.current && context) setAnchorX(caretX(inputRef.current, context.start))
  }, [shown, context])

  useEffect(() => {
    if (!shown) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [shown, highlight])

  const pick = (option: Option) => {
    if (!context) return
    const result = applyCompletion(text, context, option.value)
    pendingCaret.current = result.caret
    // A reference waits for `:` before offering formats; a format is done.
    setOpen(false)
    setPicks((n) => n + 1)
    if (result.text !== text) onChange(result.text)
  }

  // `inserted` is what the keystroke typed - read from the input event, not
  // from the length, since a `{` typed over a selection makes the text shorter.
  const typed = (next: string, nextCaret: number, inserted: string | null) => {
    setCaret(nextCaret)
    const ctx = completionContext(next, nextCaret)
    if (!ctx) {
      setOpen(false)
      return
    }
    if (inserted === "{" || (inserted === ":" && ctx.stage === "format")) setOpen(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+Space: pick again inside a `{…` edited by hand.
    if (e.key === " " && e.ctrlKey && !e.altKey && !e.metaKey) {
      const input = e.currentTarget
      const at = input.selectionStart ?? input.value.length
      if (completionContext(input.value, at)) {
        setCaret(at)
        setOpen(true)
      }
      e.preventDefault()
      return
    }
    if (!shown) return
    const count = options.length
    if (e.key === "ArrowDown") setHighlight((h) => (h + 1) % count)
    else if (e.key === "ArrowUp") setHighlight((h) => (h - 1 + count) % count)
    else if (e.key === "Enter" || e.key === "Tab") pick(options[Math.min(highlight, count - 1)])
    else if (e.key === "Escape") setOpen(false)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  let index = 0
  return (
    <PropertyRow label={label} hint={hint} htmlFor={fieldId}>
      <Popover open={shown} onOpenChange={(next) => !next && setOpen(false)}>
        <FieldBox>
          <input
            ref={inputRef}
            id={fieldId}
            type="text"
            className={FIELD}
            value={text}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={shown}
            aria-controls={shown ? listId : undefined}
            aria-activedescendant={shown ? `${listId}-${highlight}` : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              const native = e.nativeEvent as InputEvent
              typed(
                e.target.value,
                e.target.selectionStart ?? e.target.value.length,
                native.inputType === "insertText" ? native.data : null,
              )
              onChange(e.target.value)
            }}
            onSelect={(e) => {
              const input = e.currentTarget
              const at = input.selectionStart ?? input.value.length
              if (at === caret) return
              setCaret(at)
              if (!completionContext(input.value, at)) setOpen(false)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              setFocused(false)
              setOpen(false)
              onBlur?.(e.target.value)
            }}
            aria-describedby={linesId}
          />
          <PopoverAnchor asChild>
            <span aria-hidden className="pointer-events-none absolute bottom-0 h-0 w-0" style={{ left: anchorX }} />
          </PopoverAnchor>
        </FieldBox>
        <div id={linesId} data-testid="placeholder-lines" className="mt-1 space-y-0.5 px-1 text-[11px] leading-snug">
          {problems.length ? (
            problems.map((problem, i) => (
              <p
                key={i}
                data-severity={problem.severity}
                className={cn(
                  "break-words",
                  problem.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400",
                )}
              >
                {problem.text}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground">{PLACEHOLDER_HINT}</p>
          )}
        </div>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={2}
          className="w-auto min-w-56 max-w-[min(420px,90vw)] p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault()
          }}
          // Anywhere in the list - its scrollbar, a heading, the padding -
          // a press must not take focus from the input: that is a blur, and
          // a blur closes the list (and declares topics half-way).
          onMouseDown={(e) => e.preventDefault()}
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Placeholders"
            data-testid="placeholder-picker"
            className="max-h-64 overflow-y-auto"
          >
            {groups.map((group) => (
              <div key={group.heading} role="group" aria-label={group.heading}>
                <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{group.heading}</div>
                {group.options.map((option) => {
                  const i = index++
                  return (
                    <div
                      key={option.value}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === highlight}
                      data-index={i}
                      data-value={option.value}
                      data-selected={i === highlight}
                      className={cn(
                        "flex cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm select-none",
                        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                      )}
                      onMouseMove={() => i !== highlight && setHighlight(i)}
                      onClick={() => pick(option)}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{option.text}</span>
                      {option.detail ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{option.detail}</span>
                      ) : null}
                      {option.example !== undefined ? (
                        <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
                          {option.example}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </PropertyRow>
  )
}
