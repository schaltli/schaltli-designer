"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic } from "../project-editor"

const Plus = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5v14" />
  </svg>
)

const Trash2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

interface TabControlPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  editingTabContext: { tabControlId: string; panelId: string } | null
  onSetEditingTabContext: (context: { tabControlId: string; panelId: string } | null) => void
  onAddPanel: (tabControlId: string) => void
}

// Matches the operators evaluateVisibilityCondition (firmware) / evaluateCondition
// (lib/render-screen.ts) actually understand: "==" / "!=" compare as trimmed
// strings (an enum mode like "TEMP" isn't numeric), the rest compare as floats.
const OPERATORS = ["==", "!=", ">", ">=", "<", "<="] as const

export function TabControlProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  onSelectObject,
  editingTabContext,
  onSetEditingTabContext,
  onAddPanel,
}: TabControlPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const panels = selectedObject.children ?? []

  const updatePanel = (panelId: string, updates: Partial<ScreenObject>) => {
    onUpdateObject(selectedObject.id, {
      children: panels.map((panel) => (panel.id === panelId ? { ...panel, ...updates } : panel)),
    })
  }

  const updatePanelProperty = (panelId: string, key: string, value: any) => {
    const panel = panels.find((p) => p.id === panelId)
    if (!panel) return
    updatePanel(panelId, { properties: { ...panel.properties, [key]: value } })
  }

  const deletePanel = (panelId: string) => {
    onUpdateObject(selectedObject.id, { children: panels.filter((panel) => panel.id !== panelId) })
    if (editingTabContext?.panelId === panelId) {
      onSetEditingTabContext(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Topic Selector - drives which panel is shown */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Topic"
      />

      {/* Position Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="x" className="text-xs">
            X
          </Label>
          <Input
            id="x"
            type="number"
            value={selectedObject.x}
            onChange={(e) => updatePosition("x", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="y" className="text-xs">
            Y
          </Label>
          <Input
            id="y"
            type="number"
            value={selectedObject.y}
            onChange={(e) => updatePosition("y", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="width" className="text-xs">
            Width
          </Label>
          <Input
            id="width"
            type="number"
            value={selectedObject.width}
            onChange={(e) => updatePosition("width", Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="height" className="text-xs">
            Height
          </Label>
          <Input
            id="height"
            type="number"
            value={selectedObject.height}
            onChange={(e) => updatePosition("height", Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
      </div>

      <Separator />

      {/* Panels - the first one whose condition matches the topic's value is
          shown; "Edit" pins that panel open in the canvas regardless of the
          condition, so its children can be arranged (see editingTabContext). */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Panels</Label>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => onAddPanel(selectedObject.id)}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {panels.length === 0 && (
        <div className="text-xs text-muted-foreground italic">
          No panels yet - nothing will render until at least one is added.
        </div>
      )}

      <div className="space-y-2">
        {panels.map((panel, i) => {
          const isEditing = editingTabContext?.tabControlId === selectedObject.id && editingTabContext.panelId === panel.id
          return (
            <div
              key={panel.id}
              className={`rounded-md border p-2 space-y-2 ${isEditing ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Panel {i + 1}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant={isEditing ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      onSetEditingTabContext({ tabControlId: selectedObject.id, panelId: panel.id })
                      onSelectObject(panel.id)
                    }}
                  >
                    {isEditing ? "Editing" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => deletePanel(panel.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Select
                  value={panel.properties?.comparisonOperator || "=="}
                  onValueChange={(value) => updatePanelProperty(panel.id, "comparisonOperator", value)}
                >
                  <SelectTrigger className="h-7 w-16 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 text-xs"
                  placeholder="Value (e.g. TEMP or 42)"
                  value={panel.properties?.comparisonValue ?? ""}
                  onChange={(e) => updatePanelProperty(panel.id, "comparisonValue", e.target.value)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
