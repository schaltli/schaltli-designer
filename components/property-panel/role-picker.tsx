"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ROLES, ROLE_LABELS, isRole, nearestRole, resolveRole, type Role } from "@/lib/themes"
import { useThemeView } from "./theme-context"

const INHERIT_VALUE = "__inherit__"

// The checkerboard a transparent swatch has always shown.
const CHECKERBOARD = {
  backgroundImage: `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `,
  backgroundSize: "4px 4px",
  backgroundPosition: "0 0, 0 2px, 2px -2px, -2px 0px",
}

export interface RolePickerProps {
  label: string
  /** A role, "transparent", or undefined for "not set". */
  value: string | undefined
  onChange: (value: string) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  allowTransparent?: boolean
  /**
   * What the "no colour of its own" entry is called: "Transparent" for a
   * background, "Icon's own color" for an icon's tint.
   */
  transparentLabel?: string
  /**
   * Master-screen inheritance of the screen background. `masterRole` is the
   * master's own role, `isInherited` says the value comes from it, and
   * `onInherit` clears the local one - never a sentinel in the stored value.
   */
  masterRole?: string
  isInherited?: boolean
  onInherit?: () => void
}

/**
 * A colour, chosen as a role of the screen's theme (lib/themes.ts) - never a
 * hex. Each entry shows the role's colour on this screen, in the variant the
 * editor shows and at the device's colour depth.
 *
 * Replaces the palette picker of before themes, which offered 140 named
 * colours and left it to the user to make a screen look coherent
 * (docs/2026-09-24-themes-model.md).
 */
export function RolePicker({
  label,
  value,
  onChange,
  colorDepth,
  allowTransparent = false,
  transparentLabel = "Transparent",
  masterRole,
  isInherited = false,
  onInherit,
}: RolePickerProps) {
  const { theme, variant } = useThemeView()
  const swatch = (role: string | undefined) =>
    role && isRole(role) ? resolveRole(theme, role, variant, colorDepth) : undefined

  // What is shown selected. A panel hands in a role, "transparent", or the
  // role an unset colour is drawn with (lib/themes.ts DEFAULT_ROLES). A hex
  // should not arrive any more; if one does (a device-format fixture opened
  // raw), it is shown as the nearest role of this theme rather than as
  // nothing.
  const isTransparent = value === "transparent"
  const shownRole: Role | undefined =
    value && isRole(value) ? value : value && value.startsWith("#") ? nearestRole(value, theme, colorDepth) : undefined
  const selected = isInherited ? INHERIT_VALUE : isTransparent ? "transparent" : (shownRole ?? "")

  const handleChange = (next: string) => {
    if (next === INHERIT_VALUE) onInherit?.()
    else onChange(next)
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Choose a role">
            <div className="flex items-center gap-2">
              {isTransparent ? (
                <div className="w-4 h-4 rounded border border-gray-300" style={CHECKERBOARD} />
              ) : (
                <div
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: swatch(isInherited ? masterRole : shownRole) }}
                />
              )}
              <span className="text-sm">
                {isInherited
                  ? "Inherited from Master"
                  : isTransparent
                    ? transparentLabel
                    : shownRole
                      ? ROLE_LABELS[shownRole]
                      : "Choose a role"}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {onInherit && masterRole && (
            <>
              <SelectItem value={INHERIT_VALUE}>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: swatch(masterRole) }} />
                  <span>Inherit from Master</span>
                </div>
              </SelectItem>
              <div className="border-t my-1" />
            </>
          )}
          {allowTransparent && (
            <>
              <SelectItem value="transparent">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-gray-300" style={CHECKERBOARD} />
                  <span>{transparentLabel}</span>
                </div>
              </SelectItem>
              <div className="border-t my-1" />
            </>
          )}
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: swatch(role) }} />
                <span>{ROLE_LABELS[role]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
