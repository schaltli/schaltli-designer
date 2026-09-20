"use client"

/**
 * The three pickers that already did their job, in the new row.
 *
 * `ColorDepthAwarePicker`, `FontSelect` and `TopicSelector` were the parts
 * of the old panel that were already shared and already right - the colour
 * picker knows what a 1-bit panel can show, the font picker was unified on
 * 2026-09-19 out of five different ones, the topic picker knows about JSON
 * paths and unregistered topics. None of that is worth rewriting for a
 * rebuild that is about order and quiet.
 *
 * So they are wrapped, not replaced: this file gives each one the name
 * column and the two edges every other row obeys, and leaves what they do
 * alone. Each of them draws its own label today, so the wrapper turns that
 * off and supplies the label itself - otherwise a row would have two.
 */

import type { ReactNode } from "react"
import type { ProjectFont, Topic } from "../../project-editor"
import { ColorDepthAwarePicker } from "../color-depth-aware-picker"
import { FontSelect } from "../font-select"
import { TopicSelector } from "../topic-selector"
import { PropertyRow } from "./field-shell"

/**
 * Strips the label the wrapped component draws for itself, so the row's own
 * name column is the only one. `[&>label]:hidden` rather than a prop, so
 * nothing about those three components has to change for this rebuild.
 */
function Bare({ children }: { children: ReactNode }) {
  return <div className="[&>div>label]:hidden [&>label]:hidden">{children}</div>
}

export interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allowTransparent?: boolean
  transparentLabel?: string
  screens?: ColorDepthAwarePickerScreens
  masterColor?: string
  isInherited?: boolean
  onInherit?: () => void
  hint?: string
}

type ColorDepthAwarePickerScreens = Array<{
  objects: Array<{ properties: Record<string, any> }>
  backgroundColor?: string
  gridColor?: string
}>

/**
 * A colour. The swatch leads on the left, where it belongs: it is what the
 * row is about, not an ornament of it, and the field's own fill is what
 * lines the column up - so leading with it costs nothing. (It spent a while
 * on the right while the alignment was being chased, and did not need to.)
 */
export function ColorField({ label, hint, ...picker }: ColorFieldProps) {
  return (
    <PropertyRow label={label} hint={hint}>
      <Bare>
        <ColorDepthAwarePicker label={label} {...picker} />
      </Bare>
    </PropertyRow>
  )
}

export interface FontFieldProps {
  label?: string
  value: string | undefined
  fonts: ProjectFont[]
  onChange: (fontId: string) => void
  onManageFonts?: () => void
  hint?: string
}

/** The font. Always in the Text section, and always before what it sets. */
export function FontField({ label = "Font", value, fonts, onChange, onManageFonts, hint }: FontFieldProps) {
  return (
    <PropertyRow label={label} hint={hint} htmlFor="fontId">
      <Bare>
        <FontSelect value={value} fonts={fonts} onChange={onChange} onManageFonts={onManageFonts} />
      </Bare>
    </PropertyRow>
  )
}

export interface TopicFieldProps {
  label: string
  selectedTopicId?: string
  topics: Topic[]
  onTopicChange: (topic: string | undefined) => void
  onManageTopics: () => void
  /**
   * A publish destination is a whole topic, never one field of a JSON
   * payload - so a write topic passes false here.
   */
  allowSubtopics?: boolean
  hint?: string
}

/**
 * A topic. Read and write are the same control; only the name differs -
 * which is the whole point, and was already true before the rebuild. The
 * five different names it went by ("Topic", "Topic (fill)", "Read Topic
 * (retained)", "Write Topic (command)", "Write Topic (command, optional)")
 * are down to two.
 */
export function TopicField({ label, hint, ...selector }: TopicFieldProps) {
  return (
    <PropertyRow label={label} hint={hint}>
      <Bare>
        <TopicSelector {...selector} className="w-full" />
      </Bare>
    </PropertyRow>
  )
}
