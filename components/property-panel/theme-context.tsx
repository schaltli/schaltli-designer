"use client"

import { createContext, useContext } from "react"
import { themeById, type Theme, type Variant } from "@/lib/themes"

/**
 * The theme and variant of the screen being edited, for the property panel's
 * role pickers: their swatches show what each role is on this screen, light
 * or dark as the editor shows it. Provided by project-editor.tsx around the
 * panel, so no panel has to thread it through.
 */
export const ThemeViewContext = createContext<{ theme: Theme; variant: Variant }>({
  theme: themeById(undefined),
  variant: "light",
})

export function useThemeView() {
  return useContext(ThemeViewContext)
}
