"use client"

/**
 * The pickers that already did their job, in the new row.
 *
 * `RolePicker`, `FontSelect`, `TopicSelector` and the icon colour
 * built on the first of them were the parts of the old panel that were
 * already shared and already right - the colour
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
import type { ProjectAsset, ProjectFont, Topic } from "../../project-editor"
import { RolePicker } from "../role-picker"
import { ThemePicker, type ThemePickerProps } from "../theme-picker"
import { FontSelect } from "../font-select"
import { TopicSelector } from "../topic-selector"
import { IconColorField as IconColorPicker } from "../icon-color-field"
import { PropertyRow } from "./field-shell"

/**
 * Strips the label the wrapped component draws for itself, so the row's own
 * name column is the only one, and puts its trigger in the same clothes as
 * every other field.
 *
 * The second half is not cosmetic. Every picker wrapped here opens from a
 * shadcn `SelectTrigger`: 32 px tall, white, bordered, padded by 12 - beside
 * a `FIELD` that is 28, quiet, borderless and padded by 8. Left alone, a
 * topic row and a number row start their values at different heights and
 * different x, which is precisely the flutter the C+ look was chosen to end.
 * So the trigger is re-dressed here by selector, and the components keep
 * their own markup. e2e/property-fields.spec.ts measures it.
 */
const WRAPPED_TRIGGER =
  // Everything that opens something: a Select's trigger and the subtopic
  // Popover's button beside it, which sit side by side inside the topic
  // picker and have to agree about their height (e2e/topic-selector.spec.ts
  // has measured that since 2026-08-14, when they were 4 px apart).
  "[&_[role=combobox]]:h-7 [&_[role=combobox]]:rounded-md [&_[role=combobox]]:border " +
  "[&_[role=combobox]]:border-transparent [&_[role=combobox]]:bg-muted " +
  "[&_[role=combobox]]:px-2 [&_[role=combobox]]:text-[12.5px] " +
  "[&_[role=combobox]]:font-medium [&_[role=combobox]]:shadow-none " +
  "[&_[role=combobox]]:transition-colors " +
  "hover:[&_[role=combobox]]:border-border hover:[&_[role=combobox]]:bg-background " +
  "[&_[role=combobox][data-state=open]]:border-[var(--sb-accent)] " +
  "[&_[role=combobox][data-state=open]]:bg-background " +
  "[&_[role=combobox]:focus-visible]:border-[var(--sb-accent)] " +
  "[&_[role=combobox]:focus-visible]:bg-background " +
  "[&_[role=combobox]:focus-visible]:ring-0 " +
  // Only the select fills the column; the subtopic picker keeps its own
  // width and sits beside it.
  "[&_[data-slot=select-trigger]]:w-full"

function Bare({ children }: { children: ReactNode }) {
  return <div className={`[&>div>label]:hidden [&>label]:hidden ${WRAPPED_TRIGGER}`}>{children}</div>
}

export interface ColorFieldProps {
  label: string
  /** A role of the screen's theme, "transparent", or unset. */
  value: string | undefined
  onChange: (value: string) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allowTransparent?: boolean
  transparentLabel?: string
  masterRole?: string
  isInherited?: boolean
  onInherit?: () => void
  hint?: string
}

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
        <RolePicker label={label} {...picker} />
      </Bare>
    </PropertyRow>
  )
}

/**
 * A screen's theme: open, each theme as two small screens; closed, its name
 * and its accent (theme-picker.tsx).
 */
export function ThemeField({ label = "Theme", ...picker }: Omit<ThemePickerProps, "label"> & { label?: string }) {
  return (
    <PropertyRow label={label}>
      <Bare>
        <ThemePicker label={label} {...picker} />
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
        {/* The row's name goes down as well as up: the picker's own label is
            only hidden, not removed, and it defaults to "Topic" - so a write
            topic would tell a screen reader it was the read one. */}
        <TopicSelector label={label} {...selector} className="w-full" />
      </Bare>
    </PropertyRow>
  )
}

export interface IconTintFieldProps {
  /** Every icon asset the object can draw - see IconColorPicker. */
  assetIds: Array<string | null | undefined>
  projectAssets: ProjectAsset[]
  iconColor?: string
  iconColorFlatten?: boolean
  onUpdate: (key: string, value: any) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  /** "Icon" in a Colour section; a panel with two icons can say which. */
  label?: string
}

/**
 * The colour a monochrome icon is drawn in - the fourth picker the old panels
 * shared, and the one the rebuild's table forgot. Three object types offer it
 * (Bar, Icon, Live Icon), and it belongs in Colour with the rest. Not the
 * Button: its icon takes the label's colour, which is worked out from the
 * button's own (docs/2026-09-19-button-look.md).
 *
 * Named for what it does rather than after the component it wraps: there is
 * already an `IconColorField`, and two of those would be one trap for every
 * panel still waiting its turn.
 *
 * It renders nothing at all when no icon is chosen, and grows an amber note
 * under itself when a chosen icon has colours of its own - so unlike the
 * three above it is not always one row, and the note deliberately sits inside
 * the control column, under the picker it is about.
 */
export function IconTintField({ label = "Icon", ...picker }: IconTintFieldProps) {
  if (!picker.assetIds.some(Boolean)) return null
  return (
    <PropertyRow label={label}>
      <Bare>
        {/* One deeper than the three above: this one wraps a picker that
            wraps the picker Bare knows about. */}
        <div className="[&>div>div>label]:hidden">
          <IconColorPicker {...picker} />
        </div>
      </Bare>
    </PropertyRow>
  )
}
