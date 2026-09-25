"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ThemePreview } from "@/components/theme-preview"
import { THEMES, themeById, resolveRole, type Theme, type Variant } from "@/lib/themes"
import { useThemeView } from "./theme-context"

const INHERIT_VALUE = "__inherit__"

export interface ThemePickerProps {
  label: string
  /** The screen's own theme id, or undefined when it inherits. */
  value: string | undefined
  onChange: (themeId: string | undefined) => void
  colorDepth: string
  /**
   * The theme a screen inherits from its master. Absent on a master, which
   * always has a theme of its own and so offers no inherit entry.
   */
  inherited?: Theme
}

// What the closed field shows: the accent as a blot, and the name (user,
// 2026-09-25) - the pictures are for choosing, not for looking at all day.
function Blot({ theme, variant, colorDepth }: { theme: Theme; variant: Variant; colorDepth: string }) {
  return (
    <div
      className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
      style={{ backgroundColor: resolveRole(theme, "accent", variant, colorDepth) }}
    />
  )
}

/**
 * A screen's theme. Open, each theme is shown as two small screens - light
 * and dark, with a dial, a slider and an icon drawn by the renderers - so it
 * is chosen by how it looks; closed, only its name and its accent remain.
 * Replaces the Themes tab the project settings had for a day, which could
 * not set anything any more once themes lived on masters and screens.
 */
export function ThemePicker({ label, value, onChange, colorDepth, inherited }: ThemePickerProps) {
  const { variant } = useThemeView()
  const oneVariant = colorDepth !== "24bit"
  const variants: Variant[] = oneVariant ? ["light"] : ["light", "dark"]
  const current = value ? themeById(value) : inherited
  const selected = value ?? INHERIT_VALUE

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select value={selected} onValueChange={(next) => onChange(next === INHERIT_VALUE ? undefined : next)}>
        <SelectTrigger className="h-8 w-full" data-testid="theme-picker">
          <SelectValue>
            {current && (
              <div className="flex items-center gap-2">
                <Blot theme={current} variant={variant} colorDepth={colorDepth} />
                <span className="text-sm truncate">
                  {value === undefined && inherited ? `Inherited from Master (${inherited.name})` : current.name}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          {inherited && (
            <>
              <SelectItem value={INHERIT_VALUE} data-theme-id="inherit">
                <div className="flex items-center gap-2">
                  <Blot theme={inherited} variant={variant} colorDepth={colorDepth} />
                  <span>Inherit from Master ({inherited.name})</span>
                </div>
              </SelectItem>
              <div className="border-t my-1" />
            </>
          )}
          {THEMES.map((theme) => (
            <SelectItem key={theme.id} value={theme.id} data-theme-id={theme.id} className="py-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{theme.name}</span>
                <div className="flex gap-2">
                  {variants.map((v) => (
                    <ThemePreview key={v} theme={theme} variant={v} colorDepth={colorDepth} className="w-[112px]" />
                  ))}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
