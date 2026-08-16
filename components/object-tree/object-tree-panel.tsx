"use client"

import type React from "react"
import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  GripVertical,
  Image as ImageIcon,
  LayoutPanelTop,
  Monitor,
  MousePointerClick,
  Minus,
  PanelTop,
  Radio,
  Square,
  ToggleLeft,
  Type,
} from "lucide-react"
import type { ProjectScreen, ScreenObject } from "../project-editor"
import { sortChildrenByZIndex } from "@/lib/object-order"
import { canDropAsChildOf, type MoveAnchor } from "@/lib/object-tree"

interface ObjectTreePanelProps {
  // The tree's own root row, above every object - clicking it clears
  // object selection (onSelectObject(null)), landing on the property
  // panel's screen-level editor (rename/icon/master + Screen Colors - see
  // property-panel/screen-properties.tsx) the same way clicking empty
  // canvas already does. Purely a navigational affordance: it carries no
  // selection state of its own, "selected" here just means no object is
  // (see isScreenSelected below) - 2026-08-16.
  screen: ProjectScreen
  objects: ScreenObject[]
  selectedObjectIds: string[]
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  onMoveObject: (objectId: string, newParentId: string | null, anchor: MoveAnchor) => void
  onSetEditingTabContext: (context: { tabControlId: string; panelId: string } | null) => void
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  label: Type,
  icon: ImageIcon,
  line: Minus,
  MqttDataLine: ArrowRight,
  box: Square,
  MQTTIconField: Radio,
  MqttDataField: Database,
  field: Database,
  "level-indicator": Gauge,
  SoftwareButton: MousePointerClick,
  Switch: ToggleLeft,
  "tab-control": LayoutPanelTop,
  panel: PanelTop,
}

function getObjectLabel(obj: ScreenObject): string {
  if (obj.type === "panel") {
    const value = (obj.properties?.comparisonValue ?? "").toString().trim()
    return value ? `Panel: ${value}` : "Panel"
  }
  if ((obj.type === "label" || obj.type === "SoftwareButton") && obj.properties?.text) {
    return String(obj.properties.text)
  }
  return obj.type
}

type DropZone = "before" | "after" | "into"

interface DropTarget {
  hoveredId: string
  zone: DropZone
  parentId: string | null
  anchor: MoveAnchor
  valid: boolean
}

// A layers-panel-style tree: frontmost object at the top (matches zIndex
// convention - see lib/object-order.ts's sortChildrenByZIndex, ascending =
// back-to-front, so the display order is that list reversed). Rows are
// native-HTML5-draggable; hovering the top/bottom third of a row previews a
// reorder (drop above/below, same parent as the hovered row), hovering the
// middle of a "panel" row previews reparenting into it (the only container
// type a drop can target - see lib/object-tree.ts's canDropAsChildOf for the
// full structural rules, which this component only visualizes, never
// re-derives).
export function ObjectTreePanel({
  screen,
  objects,
  selectedObjectIds,
  onSelectObject,
  onMoveObject,
  onSetEditingTabContext,
}: ObjectTreePanelProps) {
  const isScreenSelected = selectedObjectIds.length === 0
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, obj: ScreenObject, parentId: string | null) => {
      if (!draggedId || draggedId === obj.id) return
      e.preventDefault()
      e.stopPropagation()

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const relY = (e.clientY - rect.top) / rect.height
      const canGoInto = obj.type === "panel" && canDropAsChildOf(objects, draggedId, obj.id)

      let zone: DropZone
      if (canGoInto && relY > 0.25 && relY < 0.75) {
        zone = "into"
      } else if (relY < 0.5) {
        zone = "before"
      } else {
        zone = "after"
      }

      // Visual "before" (drop above this row, in the front-first display)
      // means more frontmost than this row - i.e. "after" it in
      // moveObjectToParent's back-to-front ascending order. Visual "after"
      // (below this row) is the mirror: "before" it in ascending order.
      // Anchoring to this row's own id (rather than a pre-computed numeric
      // index) is what makes this correct regardless of where the dragged
      // row currently sits - see MoveAnchor's doc comment.
      const targetParentId = zone === "into" ? obj.id : parentId
      const anchor: MoveAnchor =
        zone === "into" ? { type: "end" } : zone === "before" ? { type: "after", siblingId: obj.id } : { type: "before", siblingId: obj.id }
      const valid = canDropAsChildOf(objects, draggedId, targetParentId)

      setDropTarget({ hoveredId: obj.id, zone, parentId: targetParentId, anchor, valid })
      e.dataTransfer.dropEffect = valid ? "move" : "none"
    },
    [draggedId, objects],
  )

  const commitDrop = useCallback(() => {
    if (draggedId && dropTarget?.valid) {
      onMoveObject(draggedId, dropTarget.parentId, dropTarget.anchor)
    }
    setDraggedId(null)
    setDropTarget(null)
  }, [draggedId, dropTarget, onMoveObject])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropTarget(null)
  }, [])

  const renderChildren = (children: ScreenObject[], depth: number, parentId: string | null) => {
    const displayed = [...sortChildrenByZIndex(children)].reverse()
    return displayed.map((child) => renderRow(child, depth, parentId))
  }

  const renderRow = (obj: ScreenObject, depth: number, parentId: string | null) => {
    const Icon = TYPE_ICONS[obj.type] ?? Square
    const hasChildren = (obj.children?.length ?? 0) > 0
    const isCollapsed = collapsedIds.has(obj.id)
    const isSelected = selectedObjectIds.includes(obj.id)
    const isDragging = draggedId === obj.id
    const isDropHovered = dropTarget?.hoveredId === obj.id

    return (
      <div key={obj.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            setDraggedId(obj.id)
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", obj.id)
          }}
          onDragOver={(e) => handleRowDragOver(e, obj, parentId)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            commitDrop()
          }}
          onDragEnd={handleDragEnd}
          onClick={(e) => {
            const modifierKey = e.ctrlKey || e.metaKey || e.shiftKey
            onSelectObject(obj.id, modifierKey)
            // Selecting a panel here is the tree's equivalent of clicking its
            // tab in the canvas strip - it should open that panel for
            // editing too (dashed-outline + its own contents visible on
            // canvas), not just show its condition in the property panel.
            // parentId is always that panel's tab-control - see
            // canDropAsChildOf's structural rules (a panel only ever lives
            // directly under a tab-control).
            if (obj.type === "panel" && parentId && !modifierKey) {
              onSetEditingTabContext({ tabControlId: parentId, panelId: obj.id })
            }
          }}
          data-object-id={obj.id}
          title={`${obj.type} · ${obj.id}`}
          className={cn(
            "flex items-center gap-1 px-1 py-1 text-xs rounded cursor-pointer select-none relative",
            isSelected ? "bg-primary/15 text-foreground" : "hover:bg-muted",
            isDragging && "opacity-40",
            isDropHovered && dropTarget.zone !== "into" && !dropTarget.valid && "bg-destructive/10",
          )}
          style={{ paddingLeft: 4 + depth * 16 }}
        >
          {isDropHovered && dropTarget.zone === "before" && (
            <div className={cn("absolute left-0 right-0 top-0 h-[3px] z-10", dropTarget.valid ? "bg-primary" : "bg-destructive")} />
          )}
          {isDropHovered && dropTarget.zone === "after" && (
            <div className={cn("absolute left-0 right-0 bottom-0 h-[3px] z-10", dropTarget.valid ? "bg-primary" : "bg-destructive")} />
          )}
          {isDropHovered && dropTarget.zone === "into" && (
            <div
              className={cn(
                "absolute inset-0.5 rounded border-2 border-dashed pointer-events-none",
                dropTarget.valid ? "border-primary" : "border-destructive",
              )}
            />
          )}

          <button
            type="button"
            className={cn("w-4 h-4 flex items-center justify-center shrink-0", !hasChildren && "invisible")}
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(obj.id)
            }}
          >
            {hasChildren && (isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </button>

          <GripVertical className="w-3 h-3 shrink-0 text-muted-foreground/40" />
          <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">{getObjectLabel(obj)}</span>
        </div>

        {hasChildren && !isCollapsed && <div>{renderChildren(obj.children!, depth + 1, obj.id)}</div>}
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto p-1"
      onDragOver={(e) => {
        if (draggedId) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        // Dropped on empty space below every row (not on any row's own
        // onDrop, which stops propagation) - treat as "send to top level,
        // frontmost", if that's actually legal for the dragged object.
        if (draggedId && !dropTarget && canDropAsChildOf(objects, draggedId, null)) {
          onMoveObject(draggedId, null, { type: "end" })
        }
        setDraggedId(null)
        setDropTarget(null)
      }}
    >
      <div
        onClick={() => onSelectObject(null)}
        data-screen-root={screen.id}
        title={`Screen · ${screen.id}`}
        className={cn(
          "flex items-center gap-1 px-1 py-1 text-xs rounded cursor-pointer select-none",
          isScreenSelected ? "bg-primary/15 text-foreground" : "hover:bg-muted",
        )}
      >
        <Monitor className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 font-medium">{screen.name}</span>
      </div>

      {objects.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-2 py-4 pl-5 text-center">No objects on this screen</div>
      ) : (
        <div className="pl-4">{renderChildren(objects, 0, null)}</div>
      )}
    </div>
  )
}
