"use client"

/**
 * A text's Style and Bold, where the device gives a scale
 * (docs/2026-09-30-size-scale.md): the four styles instead of a font list,
 * the font following from the device's typography. Text set in a font by
 * hand - every text made before the scale - shows as Custom, with the font
 * it has, and Snap moves it to the nearest style.
 */

import type { ProjectFont } from "@/components/project-editor"
import {
  TEXT_STYLES,
  lineHeight,
  nearestStyle,
  styledFont,
  type TextScale,
  type TextStyle,
} from "@/lib/size-scale"
import { ButtonGroupRow } from "./button-group-row"
import { SelectField } from "./select-field"
import { ToggleRow } from "./toggle-row"

// Written out rather than capitalised from the ids: the handbook quotes
// these names, and e2e/handbook-labels.spec.ts looks for them in the source.
const STYLE_LABELS: Record<TextStyle, string> = {
  caption: "Caption",
  label: "Label",
  title: "Title",
  display: "Display",
}
const STYLE_OPTIONS = TEXT_STYLES.map((style) => ({ value: style, label: STYLE_LABELS[style] }))

export type StyledFont = NonNullable<ReturnType<typeof styledFont>>

export interface TextStyleFieldProps {
  textStyle: TextStyle | undefined
  textBold: boolean
  /** The font the object is set in now, for Custom's name and for Snap. */
  fontId: string | undefined
  fontSize: number | undefined
  fonts: ProjectFont[]
  scale: TextScale
  onChange: (update: StyledFont) => void
}

export function TextStyleField({ textStyle, textBold, fontId, fontSize, fonts, scale, onChange }: TextStyleFieldProps) {
  const choose = (style: TextStyle, bold: boolean) => {
    const update = styledFont(style, bold, scale, fonts)
    if (update) onChange(update)
  }
  const current = fonts.find((f) => f.id === fontId)

  if (!textStyle) {
    const snapTo = nearestStyle(current ? lineHeight(current) : (fontSize ?? 16), scale.pixelsPerMm)
    return (
      <>
        <SelectField
          id="textStyle"
          label="Style"
          value={undefined}
          placeholder={`Custom (${current?.displayName ?? `${fontSize ?? 16} px`})`}
          options={STYLE_OPTIONS}
          onChange={(value) => choose(value as TextStyle, current?.weight === "bold")}
        />
        <ButtonGroupRow
          label=""
          buttons={[
            {
              label: `Snap to ${STYLE_OPTIONS.find((o) => o.value === snapTo)!.label}`,
              onClick: () => choose(snapTo, current?.weight === "bold"),
            },
          ]}
        />
      </>
    )
  }

  return (
    <>
      <SelectField
        id="textStyle"
        label="Style"
        value={textStyle}
        options={STYLE_OPTIONS}
        onChange={(value) => choose(value as TextStyle, textBold)}
      />
      <ToggleRow label="Bold" text="Bold" checked={textBold} onChange={(bold) => choose(textStyle, bold)} />
    </>
  )
}
