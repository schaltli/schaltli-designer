"use client"

/**
 * A text's size and Bold, where the device gives a scale
 * (docs/2026-09-30-size-scale.md; seven sizes since 2026-11-04,
 * docs/2026-11-04-text-sizes-and-colours.md): the sizes instead of a font
 * list, each with its pixels on this device, the font following from the
 * device's typography. Text set in a font by hand shows as Custom, with the
 * font it has, and Snap moves it to the nearest size.
 */

import type { ProjectFont } from "@/components/project-editor"
import {
  TEXT_STYLES,
  lineHeight,
  nearestStyle,
  styledFont,
  stylePx,
  type TextScale,
  type TextStyle,
} from "@/lib/size-scale"
import { ButtonGroupRow } from "./button-group-row"
import { SelectField } from "./select-field"
import { ToggleRow } from "./toggle-row"

// Written out rather than capitalised from the ids: the handbook quotes
// these names, and e2e/handbook-labels.spec.ts looks for them in the source.
const STYLE_LABELS: Record<TextStyle, string> = {
  micro: "Micro",
  mini: "Mini",
  standard: "Standard",
  large: "Large",
  xl: "XL",
  xxl: "XXL",
  huge: "Huge",
}
// Each with its line on this device, as the handbook's table gives it.
const optionsAt = (pixelsPerMm: number) =>
  TEXT_STYLES.map((style) => ({ value: style, label: `${STYLE_LABELS[style]} · ${Math.round(stylePx(style, pixelsPerMm))} px` }))

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
  const STYLE_OPTIONS = optionsAt(scale.pixelsPerMm)
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
          label="Text size"
          value={undefined}
          placeholder={`Custom (${current?.displayName ?? `${fontSize ?? 16} px`})`}
          options={STYLE_OPTIONS}
          onChange={(value) => choose(value as TextStyle, current?.weight === "bold")}
        />
        <ButtonGroupRow
          label=""
          buttons={[
            {
              label: `Snap to ${STYLE_LABELS[snapTo]}`,
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
        label="Text size"
        value={textStyle}
        options={STYLE_OPTIONS}
        onChange={(value) => choose(value as TextStyle, textBold)}
      />
      <ToggleRow label="Bold" text="Bold" checked={textBold} onChange={(bold) => choose(textStyle, bold)} />
    </>
  )
}
