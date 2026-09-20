"use client"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { FontIcon } from "@/components/icons/font-icon"
import type { ProjectFont } from "../project-editor"

const MANAGE_FONTS = "manage-fonts"

/**
 * What a font is called in the picker: its display name, which the device's
 * DDF writes with the size in it ("Helvetica Bold 12px"). Nothing is appended.
 * The pickers used to add `size` as well - "Helvetica 8px — 12px" - and `size`
 * is the font's line height (ascent plus descent), not the size in its name, so
 * the two numbers disagreed on every font.
 */
export function fontLabel(font: ProjectFont): string {
  return font.displayName || font.name
}

interface FontSelectProps {
  value: string | undefined
  fonts: ProjectFont[]
  onChange: (fontId: string) => void
  /** Offers "Manage Fonts..." at the end of the list when given. */
  onManageFonts?: () => void
}

/**
 * The one font picker every object's property panel uses (2026-09-19). There
 * were five: three shadcn Selects that labelled fonts differently and a native
 * <select> in the Button and Switch panels with a "System Default" entry and a
 * separate "Manage Fonts" link. What an object does with a new font - a label
 * resizes itself to it - stays with the panel, in `onChange`.
 */
export function FontSelect({ value, fonts, onChange, onManageFonts }: FontSelectProps) {
  return (
    <div>
      <Label htmlFor="fontId" className="text-xs">
        Font
      </Label>
      <Select
        value={value || ""}
        onValueChange={(next) => {
          if (next === MANAGE_FONTS) {
            onManageFonts?.()
            return
          }
          onChange(next)
        }}
      >
        <SelectTrigger id="fontId" className="h-8">
          <SelectValue placeholder="Select a font" />
        </SelectTrigger>
        <SelectContent>
          {fonts.map((font) => (
            <SelectItem key={font.id} value={font.id}>
              {fontLabel(font)}
            </SelectItem>
          ))}
          {onManageFonts && (
            <>
              {fonts.length > 0 && <Separator className="my-1" />}
              <SelectItem value={MANAGE_FONTS} className="text-primary">
                <div className="flex items-center gap-2">
                  <FontIcon className="h-4 w-4" />
                  Manage Fonts...
                </div>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
