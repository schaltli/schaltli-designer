"use client"

/**
 * A text with live values in it (docs/2026-10-07-live-values.md): the field
 * with its chips, and under it the editor of the chip that is open. A Text's
 * «Text» and each line of an energy diagram's node are this.
 *
 * Taken out of label-properties.tsx on 2026-10-12, when the energy diagram's
 * node lines needed the same thing.
 */

import { computeCombined, type CombinedTopic } from "@/lib/combined-topics"
import { useEffect, useState } from "react"
import { DEFAULT_SEPARATORS, parse, type Separators } from "@/lib/placeholders"
import { liveTextSegments, placeholdersToLiveValues, sourceShortName, textOf, type LiveValue } from "@/lib/live-value"
import { topicExample } from "@/lib/placeholder-completion"
import { LiveValueEditor } from "./live-value-editor"
import { LiveTextField } from "./fields/live-text-field"
import type { Topic } from "../project-editor"

export interface LiveTextEditorProps {
  /** The field's id; the open chip's editor finds the chip under it. Unique on the panel. */
  id: string
  label: string
  text: string | undefined
  liveValues: LiveValue[]
  /** Text and live values together; none left is undefined. */
  onChange: (text: string, liveValues: LiveValue[] | undefined) => void
  /** Declares the topics the live values read, when the field is left. */
  onDeclareTopics?: (topics: string[]) => void
  topics: Topic[]
  combinedTopics?: CombinedTopic[]
  numberSeparators?: Separators
  hint?: string
  /** A change of it closes the open chip: another object, another node. */
  resetKey?: string
}

export function LiveTextEditor({ id, label, text, liveValues, onChange, onDeclareTopics, topics, combinedTopics = [], numberSeparators, hint, resetKey }: LiveTextEditorProps) {
  // The live value whose editor is open under the field, and the chips in
  // the order the text has them, for ‹ and ›.
  const [openLiveValueId, setOpenLiveValueId] = useState<string | null>(null)
  useEffect(() => setOpenLiveValueId(null), [resetKey])
  const chipOrder = [...new Set(liveTextSegments(String(text ?? ""), liveValues).flatMap((segment) => (segment.kind === "live" ? [segment.id] : [])))]
  const openLiveValue = openLiveValueId && chipOrder.includes(openLiveValueId) ? liveValues.find((lv) => lv.id === openLiveValueId) : undefined
  const chipIndex = openLiveValue ? chipOrder.indexOf(openLiveValue.id) : -1

  // What a chip shows - its source's short name and what it reads at the
  // examples - in the field and in the head of its editor alike.
  const chipLabelOf = (lv: LiveValue) => ({
    name: sourceShortName(lv.source),
    reads: textOf(
      lv,
      lv.source.namespace === "topic"
        ? topicExample(lv.source.path, topics)
        : lv.source.namespace === "combined"
          ? computeCombined(combinedTopics, (path) => topicExample(path, topics)).get(lv.source.path)
          : undefined,
      numberSeparators ?? DEFAULT_SEPARATORS,
    ),
  })

  return (
    <>
      <LiveTextField
        id={id}
        label={label}
        text={text}
        liveValues={liveValues}
        hint={hint}
        onChange={(next, values) => onChange(next, values.length > 0 ? values : undefined)}
        onBlur={(next, current) => {
          // A placeholder typed in full becomes a chip; a live value whose
          // chip is gone goes with it (docs/2026-10-07-live-values.md).
          const typed = parse(next).some((segment) => segment.kind === "placeholder")
          const live = typed ? placeholdersToLiveValues(next, current, numberSeparators ?? DEFAULT_SEPARATORS) : { text: next, liveValues: current }
          const kept = live.liveValues.filter((lv) => live.text.includes(`{live:${lv.id}}`))
          onDeclareTopics?.(kept.filter((lv) => lv.source.namespace === "topic").map((lv) => lv.source.path))
          if (live.text !== next || kept.length !== current.length) onChange(live.text, kept.length > 0 ? kept : undefined)
        }}
        onOpenLiveValue={setOpenLiveValueId}
        openLiveValueId={openLiveValueId}
        chipLabel={chipLabelOf}
        topics={topics}
        combinedTopics={combinedTopics}
        separators={numberSeparators}
      />
      {openLiveValue ? (
        <LiveValueEditor
          liveValue={openLiveValue}
          combinedTopics={combinedTopics}
          chip={chipLabelOf(openLiveValue)}
          chipSelector={`#${id} [data-live-id="${openLiveValue.id}"]`}
          position={chipOrder.indexOf(openLiveValue.id) + 1}
          count={chipOrder.length}
          topics={topics}
          onChange={(changed) => onChange(String(text ?? ""), liveValues.map((lv) => (lv.id === changed.id ? changed : lv)))}
          onPrevious={chipIndex > 0 ? () => setOpenLiveValueId(chipOrder[chipIndex - 1]) : undefined}
          onNext={chipIndex < chipOrder.length - 1 ? () => setOpenLiveValueId(chipOrder[chipIndex + 1]) : undefined}
          onClose={(backToText) => {
            setOpenLiveValueId(null)
            if (backToText) document.getElementById(id)?.focus()
          }}
        />
      ) : null}
    </>
  )
}
