"use client"

/**
 * Settings › Cards (docs/2026-11-03-card.md): where every card's corner
 * radius, edge and padding come from. Its colours are the theme's - fill
 * Panel, edge Outline or Accent - shown here in the current screen's theme.
 */

import type { Project } from "./project-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cardSettingsOf, type CardSettings } from "@/lib/card"
import { resolveRole, themeFor } from "@/lib/themes"

const FIELDS: Array<{ key: Exclude<keyof CardSettings, "buttonRadiusMm">; id: string; label: string; unit: string; step: number; max: number }> = [
  { key: "radiusMm", id: "cardRadius", label: "Corner radius", unit: "mm", step: 0.5, max: 20 },
  { key: "edgePx", id: "cardEdge", label: "Edge", unit: "px", step: 1, max: 10 },
  { key: "accentEdgePx", id: "cardAccentEdge", label: "Accent edge", unit: "px", step: 1, max: 10 },
  { key: "paddingMm", id: "cardPadding", label: "Padding", unit: "mm", step: 0.5, max: 20 },
]

export function CardSettingsSection({
  project,
  currentScreenId,
  onProjectUpdate,
}: {
  project: Project
  currentScreenId: string
  onProjectUpdate: (project: Project) => void
}) {
  const cards = cardSettingsOf(project.settings)
  const set = (key: keyof CardSettings, value: number) => {
    if (!Number.isFinite(value) || value < 0) return
    onProjectUpdate({ ...project, settings: { ...project.settings, cards: { ...cards, [key]: value } } })
  }
  // A button's corners (docs/2026-11-04-native-buttons.md): empty is a pill.
  const setButtonRadius = (raw: string) => {
    const { buttonRadiusMm: _old, ...rest } = cards
    if (raw.trim() === "") {
      onProjectUpdate({ ...project, settings: { ...project.settings, cards: rest } })
      return
    }
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value) || value < 0) return
    onProjectUpdate({ ...project, settings: { ...project.settings, cards: { ...rest, buttonRadiusMm: value } } })
  }
  // A preview in the theme of the screen being edited, light.
  const screen = project.screens.find((s) => s.id === currentScreenId)
  const theme = themeFor(screen, project.screens)
  const colour = (role: "panel" | "outline" | "accent" | "surface" | "text") => resolveRole(theme, role, "light", project.settings.colorDepth)
  const ppm = project.settings.pixelsPerMm ?? 4
  const preview = (accent: boolean, testId: string) => (
    <div
      data-testid={testId}
      style={{
        width: 120,
        height: 72,
        background: colour("panel"),
        border: `${accent ? cards.accentEdgePx : cards.edgePx}px solid ${colour(accent ? "accent" : "outline")}`,
        borderRadius: Math.round(cards.radiusMm * ppm),
        padding: Math.round(cards.paddingMm * ppm),
        color: colour("text"),
        fontSize: 12,
      }}
    >
      {accent ? "Card, accent" : "Card"}
    </div>
  )
  return (
    <div className="p-6 overflow-y-auto">
      <div className="space-y-4 max-w-md">
        <p className="text-xs text-muted-foreground">
          Every card on every screen takes these. Its colours come from the theme: Panel, with an edge in Outline, or in Accent for an accent card.
        </p>
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <Label htmlFor={f.id} className="w-32 text-sm">
              {f.label}
            </Label>
            <Input
              id={f.id}
              type="number"
              min={0}
              max={f.max}
              step={f.step}
              value={cards[f.key]}
              onChange={(e) => set(f.key, Number.parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">{f.unit}</span>
          </div>
        ))}
        <div className="flex gap-4 rounded p-4" style={{ background: colour("surface") }}>
          {preview(false, "card-preview")}
          {preview(true, "card-preview-accent")}
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Label htmlFor="buttonRadius" className="w-32 text-sm">
            Button radius
          </Label>
          <Input
            id="buttonRadius"
            type="number"
            min={0}
            max={20}
            step={0.5}
            placeholder="Pill"
            value={cards.buttonRadiusMm ?? ""}
            onChange={(e) => setButtonRadius(e.target.value)}
            className="w-24"
          />
          <span className="text-xs text-muted-foreground">mm, empty for a pill</span>
        </div>
        <div className="flex gap-4 rounded p-4" style={{ background: colour("surface") }}>
          <div
            data-testid="button-preview"
            style={{
              width: 120,
              height: 40,
              background: colour("accent"),
              borderRadius: cards.buttonRadiusMm === undefined ? 20 : Math.min(20, Math.round(cards.buttonRadiusMm * ppm)),
              color: "#ffffff",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Button
          </div>
        </div>
      </div>
    </div>
  )
}
