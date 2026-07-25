"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ScreenmanObject } from "../screenman-editor"

const OPERATORS = ["==", "!=", ">", ">=", "<", "<="] as const

interface PanelPropertiesProps {
  selectedObject: ScreenmanObject
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  parentTabControl: ScreenmanObject | null
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
}

// A panel has no x/y/width/height of its own - it always fills its parent
// tab-control's box exactly - so the only thing to edit here is the
// condition that decides whether this panel is the active one.
export function PanelProperties({ selectedObject, onUpdateObject, parentTabControl, onSelectObject }: PanelPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  return (
    <div className="space-y-3">
      {parentTabControl && (
        <div className="text-xs text-muted-foreground">
          Belongs to{" "}
          <button
            className="underline hover:text-foreground"
            onClick={() => onSelectObject(parentTabControl.id)}
          >
            {parentTabControl.id}
          </button>
          {parentTabControl.properties.topic && (
            <>
              {" "}
              (topic <span className="font-mono">{parentTabControl.properties.topic}</span>)
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        <div className="flex-1">
          <Label className="text-xs">Shown when value</Label>
          <div className="flex items-center gap-1 mt-1">
            <Select
              value={selectedObject.properties.comparisonOperator || "=="}
              onValueChange={(value) => updateProperty("comparisonOperator", value)}
            >
              <SelectTrigger className="h-8 w-16 text-xs">
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
              className="h-8"
              placeholder="Value (e.g. TEMP, 42)"
              value={selectedObject.properties.comparisonValue ?? ""}
              onChange={(e) => updateProperty("comparisonValue", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Only the first panel whose condition matches the current value is shown. Use the tab strip above the
        tab-control on the canvas, or the "Edit" button on its property panel, to open this panel for editing its
        contents.
      </div>
    </div>
  )
}
