"use client"

/**
 * A text with chips (docs/2026-10-07-live-values.md, «Chips in a text»): what
 * is typed is text, each live value a chip that is stepped over, deleted and
 * copied as one. `{` or «+ Value» opens a search over what a chip can read;
 * a click on a chip (or Enter on it) asks for its editor.
 *
 * The stored string - `{live:<id>}` where a chip stands - is the one source of
 * truth. The editable DOM is built from it and read back into it on every
 * input; it is rebuilt only when the string changed from outside (undo, an
 * edit elsewhere), so the caret is left alone while typing. Text runs are
 * shown as stored, `{{` included: a `{` typed into the text is a brace, a
 * placeholder typed or pasted in full becomes a chip when the field is left.
 *
 * A deleted chip's live value stays on the object until the field is left,
 * so the browser's own undo, which brings the chip back, finds it there.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Topic } from "@/components/project-editor"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { referenceEntries, placeholderProblems } from "@/lib/placeholder-completion"
import {
  liveTextSegments,
  lowerLiveText,
  nextLiveValueId,
  placeholdersToLiveValues,
  type LiveValue,
  type Source,
} from "@/lib/live-value"
import { DEFAULT_SEPARATORS, type Separators } from "@/lib/placeholders"
import { cn } from "@/lib/utils"
import { FIELD, FieldBox, PropertyRow } from "./field-shell"
import { finishField, finishesField } from "./finish-field"

/** What a chip shows: its source's short name, and what it reads at the example. */
export interface ChipLabel {
  name: string
  reads: string
}

export interface LiveTextFieldProps {
  label: string
  text: string | undefined
  liveValues: LiveValue[]
  /** Every edit: the text and the object's live values. */
  onChange: (text: string, liveValues: LiveValue[]) => void
  /** The field is left: where typed placeholders become chips and topics are declared. */
  onBlur?: (text: string, liveValues: LiveValue[]) => void
  /** A chip was clicked, or Enter pressed on it, or one was just inserted. */
  onOpenLiveValue?: (id: string) => void
  /** The live value whose editor is open: its chip is marked. */
  openLiveValueId?: string | null
  chipLabel: (liveValue: LiveValue) => ChipLabel
  topics: Topic[]
  /** The project's combined topics, offered after its topics. */
  combinedTopics?: readonly { name: string }[]
  separators?: Separators
  hint?: string
  id?: string
}

/**
 * After every chip a text node holding a zero-width space: Chrome will not
 * put the caret in no text after an uneditable island and moves it into the
 * text before, so what is typed after a chip lands before it. Never stored -
 * serialize() drops it - and stepped over with the chip.
 */
const ZWSP = "​"

/** The MIME type a copied chip travels in, with its live value. */
const CLIPBOARD_TYPE = "web application/x-schaltli-live-text"

export const LIVE_TEXT_HINT = "Type { to insert a value. Click a value to set how it shows."

const HEADINGS = { topic: "Topics", combined: "Combined", device: "Device", project: "Project" } as const

/** The stored string the field's DOM stands for. */
function serialize(root: Node): string {
  let out = ""
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += (node.textContent ?? "").split(ZWSP).join("")
    else if (node instanceof HTMLElement) {
      const id = node.dataset.liveId
      if (id) out += `{live:${id}}`
      else if (node.tagName !== "BR") out += serialize(node)
    }
  })
  return out
}

/**
 * How a chip looks, here and in the head of its editor (live-value-editor.tsx):
 * one line whatever it holds - a long name or value is cut with «…», the
 * title has it whole - never wrapped inside the chip.
 */
export const CHIP_CLASS =
  "group mx-px inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-blue-300 bg-blue-50 px-2 py-px align-middle text-[12px] leading-5 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100 " +
  // The chip whose editor is open is filled, as a selection is (2026-10-08).
  "data-[open=true]:border-blue-600 data-[open=true]:bg-blue-600 data-[open=true]:text-white " +
  // Selected with the text it is copied with, but never shown as selected
  // text: that looked as if it could be typed into (2026-10-08).
  "selection:bg-transparent selection:text-inherit"
export const CHIP_NAME_CLASS =
  "min-w-0 max-w-[9rem] overflow-hidden text-ellipsis text-blue-600 dark:text-blue-300 group-data-[open=true]:text-blue-100"
export const CHIP_READS_CLASS = "min-w-0 max-w-[9rem] overflow-hidden text-ellipsis whitespace-pre font-medium"

/** What a chip shows for what it reads: an empty result still shows something to click. */
export function chipReads(label: ChipLabel | undefined): string {
  return label?.reads ? label.reads : "–"
}

function chipElement(id: string, label: ChipLabel | undefined): HTMLElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.dataset.liveId = id
  chip.setAttribute("role", "button")
  chip.setAttribute("data-testid", "live-chip")
  chip.className = `${CHIP_CLASS} cursor-pointer select-all`
  const name = document.createElement("span")
  name.className = CHIP_NAME_CLASS
  name.dataset.part = "name"
  const reads = document.createElement("span")
  reads.className = CHIP_READS_CLASS
  reads.dataset.part = "reads"
  chip.append(name, reads)
  fillChip(chip, label)
  return chip
}

function fillChip(chip: HTMLElement, label: ChipLabel | undefined) {
  const name = chip.querySelector<HTMLElement>('[data-part="name"]')
  const reads = chip.querySelector<HTMLElement>('[data-part="reads"]')
  if (name && name.textContent !== (label?.name ?? "")) name.textContent = label?.name ?? ""
  const shown = chipReads(label)
  if (reads && reads.textContent !== shown) reads.textContent = shown
  chip.setAttribute("aria-label", `${label?.name ?? "value"}: ${label?.reads ?? ""}`)
  chip.title = `${label?.name ?? ""} · ${shown}`
}

/** Text and chips as DOM nodes. */
function fragmentFor(text: string, liveValues: LiveValue[], chipLabel: (lv: LiveValue) => ChipLabel): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const segment of liveTextSegments(text, liveValues)) {
    if (segment.kind === "text") fragment.append(document.createTextNode(segment.text))
    else {
      const lv = liveValues.find((l) => l.id === segment.id)
      fragment.append(chipElement(segment.id, lv ? chipLabel(lv) : undefined), document.createTextNode(ZWSP))
    }
  }
  return fragment
}

/** A text's live values as another object's: each with an id free there, the text pointing at it. */
function adopt(text: string, from: LiveValue[], into: LiveValue[]): { text: string; liveValues: LiveValue[] } {
  const all = [...into]
  let out = text
  for (const segment of liveTextSegments(text, from)) {
    if (segment.kind !== "live") continue
    const lv = from.find((l) => l.id === segment.id)!
    if (all.some((l) => l.id === lv.id && l !== lv)) {
      const id = nextLiveValueId(all)
      all.push({ ...structuredClone(lv), id })
      out = out.replace(`{live:${lv.id}}`, `{live:${id}}`)
    } else all.push(structuredClone(lv))
  }
  return { text: out, liveValues: all }
}

export function LiveTextField({
  label,
  text,
  liveValues,
  onChange,
  onBlur,
  onOpenLiveValue,
  openLiveValueId,
  chipLabel,
  topics,
  combinedTopics = [],
  separators = DEFAULT_SEPARATORS,
  hint,
  id,
}: LiveTextFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const listId = `${fieldId}-sources`
  const labelId = `${fieldId}-label`
  const linesId = `${fieldId}-lines`
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const value = text ?? ""
  // The string the DOM was last built from or read back as.
  const shownRef = useRef<string | null>(null)
  // Where a chip goes: the caret when `{` was pressed or «+ Value» clicked.
  const insertAtRef = useRef<Range | null>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)

  // Rebuilt only when the string changed from outside.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || shownRef.current === value) return
    const focused = document.activeElement === root
    root.replaceChildren(fragmentFor(value, liveValues, chipLabel))
    shownRef.current = value
    if (focused) {
      const range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  })

  // What a chip reads follows its live value and the examples on every render.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>("[data-live-id]").forEach((chip) => {
      const lv = liveValues.find((l) => l.id === chip.dataset.liveId)
      fillChip(chip, lv ? chipLabel(lv) : undefined)
      chip.dataset.open = String(chip.dataset.liveId === openLiveValueId)
    })
  })

  const emit = (next: string, nextLiveValues: LiveValue[] = liveValues) => {
    shownRef.current = next
    onChange(next, nextLiveValues)
  }

  const read = () => emit(serialize(rootRef.current!))

  // The lines under the field: braces that are no placeholder and no chip.
  const problems = useMemo(
    () => placeholderProblems(value, topics).filter((p) => p.severity === "error"),
    [value, topics],
  )

  const entries = useMemo(() => referenceEntries(query, topics, combinedTopics), [query, topics, combinedTopics])
  useEffect(() => setHighlight(0), [query])
  useEffect(() => {
    if (!searching) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" })
  }, [searching, highlight])

  const caretRange = (): Range | null => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null
  }

  const openSearch = () => {
    const root = rootRef.current
    let range = caretRange()
    if (!range && root) {
      range = document.createRange()
      range.selectNodeContents(root)
      range.collapse(false)
    }
    insertAtRef.current = range
    setQuery("")
    setSearching(true)
  }

  const closeSearch = (backToText: boolean) => {
    setSearching(false)
    if (!backToText) return
    const root = rootRef.current
    const range = insertAtRef.current
    root?.focus()
    if (range) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  // Inserts a chip reading `reference` (`topic:a/b`, `device:model`) where the
  // caret was, and opens its live value.
  const insert = (reference: string) => {
    const root = rootRef.current
    if (!root) return
    const colon = reference.indexOf(":")
    const source: Source = { namespace: reference.slice(0, colon) as Source["namespace"], path: reference.slice(colon + 1) }
    const topic = source.namespace === "topic" ? topics.find((t) => t.topic === source.path.split("#")[0]) : undefined
    const lv: LiveValue = { id: nextLiveValueId(liveValues), source, rules: [] }
    // A number reads with one decimal unless set otherwise in its editor.
    // An older project writes the type "number".
    const numeric = topic?.type === "numeric" || (topic?.type as string | undefined) === "number"
    if (numeric && !source.path.includes("#")) lv.format = { kind: "number", decimals: 1, grouped: false }
    const next = [...liveValues, lv]
    const chip = chipElement(lv.id, chipLabel(lv))
    const range = insertAtRef.current ?? document.createRange()
    if (!insertAtRef.current) {
      range.selectNodeContents(root)
      range.collapse(false)
    }
    range.deleteContents()
    const space = document.createTextNode(ZWSP)
    range.insertNode(space)
    range.insertNode(chip)
    setSearching(false)
    root.focus()
    const after = document.createRange()
    after.setStart(space, 1)
    after.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(after)
    emit(serialize(root), next)
    onOpenLiveValue?.(lv.id)
  }

  // The chip right before or after a collapsed caret, the zero-width space
  // behind it counted with it.
  // A sibling, past the empty text nodes inserting and deleting leave behind.
  const sibling = (node: Node | null, side: "before" | "after"): Node | null => {
    let next = node && (side === "before" ? node.previousSibling : node.nextSibling)
    while (next && next.nodeType === Node.TEXT_NODE && next.textContent === "") next = side === "before" ? next.previousSibling : next.nextSibling
    return next
  }

  const chipBeside = (side: "before" | "after"): HTMLElement | undefined => {
    const range = caretRange()
    if (!range || !range.collapsed) return undefined
    let node: Node | null = range.startContainer
    let offset = range.startOffset
    const isChip = (n: Node | null | undefined): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.liveId
    if (side === "before") {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (offset > 1 || (offset === 1 && text[0] !== ZWSP)) return undefined
        const before = sibling(node, "before")
        return isChip(before) ? before : undefined
      }
      let before: Node | null = node.childNodes[offset - 1] ?? null
      while (before && before.nodeType === Node.TEXT_NODE && before.textContent === "") before = before.previousSibling
      if (isChip(before)) return before
      const chip = sibling(before, "before")
      if (before?.nodeType === Node.TEXT_NODE && before.textContent === ZWSP && isChip(chip)) return chip
      return undefined
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      if (offset < text.length && !(text.slice(offset) === ZWSP)) return undefined
      node = sibling(node, "after")
    } else {
      node = node.childNodes[offset] ?? null
      while (node && node.nodeType === Node.TEXT_NODE && node.textContent === "") node = node.nextSibling
    }
    return isChip(node) ? node : undefined
  }

  const caretAt = (node: Node, offset: number) => {
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  // A chip's zero-width space, created when missing.
  const spaceAfter = (chip: HTMLElement): Text => {
    const next = sibling(chip, "after")
    if (next?.nodeType === Node.TEXT_NODE && (next.textContent ?? "").startsWith(ZWSP)) return next as Text
    const space = document.createTextNode(ZWSP)
    chip.after(space)
    return space
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "Backspace" || e.key === "Delete") {
        const chip = chipBeside(e.key === "Backspace" ? "before" : "after")
        if (chip) {
          e.preventDefault()
          const space = spaceAfter(chip)
          const previous = sibling(chip, "before")
          chip.remove()
          space.textContent = (space.textContent ?? "").slice(1)
          if (previous?.nodeType === Node.TEXT_NODE) caretAt(previous, previous.textContent?.length ?? 0)
          else caretAt(space, 0)
          read()
          return
        }
      }
      // Chrome stops Home and End at a chip; the field is one line.
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault()
        const root = rootRef.current!
        const range = document.createRange()
        range.selectNodeContents(root)
        range.collapse(e.key === "Home")
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return
      }
      if (e.key === "ArrowLeft") {
        const chip = chipBeside("before")
        if (chip) {
          e.preventDefault()
          const previous = sibling(chip, "before")
          if (previous?.nodeType === Node.TEXT_NODE) caretAt(previous, previous.textContent?.length ?? 0)
          else caretAt(chip.parentNode!, Array.prototype.indexOf.call(chip.parentNode!.childNodes, chip))
          return
        }
      }
      if (e.key === "ArrowRight") {
        const chip = chipBeside("after")
        if (chip) {
          e.preventDefault()
          caretAt(spaceAfter(chip), 1)
          return
        }
      }
    }
    if (e.key === "{" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      openSearch()
      return
    }
    // A chip just before the caret, with Enter: its editor.
    if (e.key === "Enter") {
      e.preventDefault()
      const chip = chipBeside("before")
      if (chip?.dataset.liveId && onOpenLiveValue) {
        onOpenLiveValue(chip.dataset.liveId)
        return
      }
    }
    // No bold or italic in a text a device draws in one font.
    if ((e.ctrlKey || e.metaKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault()
      return
    }
    if (finishesField(e.key)) finishField(e)
  }

  // `{{` is a brace, as it always was: a second `{` into the empty search
  // writes it into the text instead.
  const typeBrace = () => {
    const root = rootRef.current
    const range = insertAtRef.current
    setSearching(false)
    if (!root || !range) return
    root.focus()
    range.deleteContents()
    const brace = document.createTextNode("{{")
    range.insertNode(brace)
    caretAt(brace, 2)
    read()
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "{" && query === "") {
      e.preventDefault()
      typeBrace()
      return
    }
    const count = entries.length
    if (e.key === "ArrowDown" && count) setHighlight((h) => (h + 1) % count)
    else if (e.key === "ArrowUp" && count) setHighlight((h) => (h - 1 + count) % count)
    else if ((e.key === "Enter" || e.key === "Tab") && count) insert(entries[Math.min(highlight, count - 1)].reference)
    else if (e.key === "Escape") closeSearch(true)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  const onCopy = (e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const range = caretRange()
    if (!range || range.collapsed) return
    const holder = document.createElement("div")
    holder.append(range.cloneContents())
    const copied = serialize(holder)
    const used = liveValues.filter((lv) => copied.includes(`{live:${lv.id}}`))
    e.preventDefault()
    e.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify({ text: copied, liveValues: used }))
    // Outside the designer it is the placeholders that say the same.
    e.clipboardData.setData("text/plain", lowerLiveText(copied, used).text)
    if (cut) {
      range.deleteContents()
      read()
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const root = rootRef.current
    const range = caretRange()
    if (!root || !range) return
    let incoming: { text: string; liveValues: LiveValue[] }
    const own = e.clipboardData.getData(CLIPBOARD_TYPE)
    if (own) {
      const parsed = JSON.parse(own) as { text: string; liveValues: LiveValue[] }
      incoming = adopt(parsed.text, parsed.liveValues, liveValues)
    } else {
      // A placeholder pasted becomes a chip (decided 2026-10-07).
      incoming = placeholdersToLiveValues(e.clipboardData.getData("text/plain").replace(/[\r\n]+/g, " "), liveValues, separators)
    }
    range.deleteContents()
    const fragment = fragmentFor(incoming.text, incoming.liveValues, chipLabel)
    const last = fragment.lastChild
    range.insertNode(fragment)
    if (last) {
      const after = document.createRange()
      after.setStartAfter(last)
      after.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(after)
    }
    emit(serialize(root), incoming.liveValues)
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-live-id]")
    if (chip?.dataset.liveId) onOpenLiveValue?.(chip.dataset.liveId)
  }

  let index = 0
  const groups: { heading: string; entries: { reference: string; text: string; detail?: string; example?: string; index: number }[] }[] = []
  for (const entry of entries) {
    const heading = HEADINGS[entry.section]
    let group = groups.find((g) => g.heading === heading)
    if (!group) groups.push((group = { heading, entries: [] }))
    group.entries.push({
      reference: entry.reference,
      text: entry.reference.slice(entry.section.length + 1),
      detail: entry.detail,
      example: entry.example,
      index: index++,
    })
  }

  return (
    <PropertyRow label={label} hint={hint} htmlFor={fieldId} labelProps={{ id: labelId }}>
      <Popover open={searching} onOpenChange={(next) => !next && closeSearch(false)}>
        <FieldBox>
          <div
            ref={rootRef}
            id={fieldId}
            role="textbox"
            aria-labelledby={labelId}
            aria-describedby={linesId}
            aria-multiline="false"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-testid="live-text-field"
            // A block that grows with its text, line by line, and scrolls past
            // about eight lines - not the one-line flex box FIELD is.
            className={cn(FIELD, "block h-auto max-h-48 min-h-7 cursor-text overflow-y-auto whitespace-pre-wrap break-words py-0.5 leading-6")}
            onInput={read}
            onKeyDown={onKeyDown}
            onCopy={(e) => onCopy(e, false)}
            onCut={(e) => onCopy(e, true)}
            onPaste={onPaste}
            onClick={onClick}
            onBlur={(e) => {
              if (searching) return
              onBlur?.(serialize(e.currentTarget), liveValues)
            }}
          />
          <PopoverAnchor asChild>
            <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-0 w-0" />
          </PopoverAnchor>
        </FieldBox>
        <div className="mt-1 flex items-start justify-between gap-2 px-1">
          <div id={linesId} data-testid="placeholder-lines" className="space-y-0.5 text-[11px] leading-snug">
            {problems.length ? (
              problems.map((problem, i) => (
                <p key={i} data-severity={problem.severity} className="break-words text-destructive">
                  {problem.text}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">{LIVE_TEXT_HINT}</p>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted"
            onMouseDown={(e) => {
              // Keeps the caret where it is in the text.
              e.preventDefault()
              openSearch()
            }}
          >
            + Value
          </button>
        </div>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="w-[min(420px,90vw)] p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            searchRef.current?.focus()
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            closeSearch(true)
          }}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">{"{"}</span>
            <input
              ref={searchRef}
              aria-label="Find a value"
              data-testid="live-value-search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={entries.length ? `${listId}-${highlight}` : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Values" data-testid="placeholder-picker" className="max-h-64 overflow-y-auto p-1">
            {groups.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{`Nothing matches «${query}».`}</p> : null}
            {groups.map((group) => (
              <div key={group.heading} role="group" aria-label={group.heading}>
                <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{group.heading}</div>
                {group.entries.map((entry) => (
                  <div
                    key={entry.reference}
                    id={`${listId}-${entry.index}`}
                    role="option"
                    aria-selected={entry.index === highlight}
                    data-index={entry.index}
                    data-value={entry.reference}
                    data-selected={entry.index === highlight}
                    className={cn(
                      "flex cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm select-none",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                    )}
                    onMouseMove={() => entry.index !== highlight && setHighlight(entry.index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(entry.reference)}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{entry.text}</span>
                    {entry.detail ? <span className="shrink-0 text-xs text-muted-foreground">{entry.detail}</span> : null}
                    {entry.example !== undefined ? (
                      <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">{entry.example}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">Enter inserts the value and opens how it shows.</p>
        </PopoverContent>
      </Popover>
    </PropertyRow>
  )
}
