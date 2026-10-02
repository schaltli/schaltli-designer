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
  CircleGauge,
  GripVertical,
  Image as ImageIcon,
  LayoutPanelTop,
  Lock,
  LockOpen,
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
import { canDropAsChildOf, findObjectById, type MoveAnchor } from "@/lib/object-tree"
import { isContainerType } from "@/lib/layout"
import { OBJECT_ICONS } from "@/components/icons/object-icons"

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
  onMoveObject: (objectIds: string | readonly string[], newParentId: string | null, anchor: MoveAnchor) => void
  // Opens a panel or a group for editing on the canvas (null: none) - see
  // project-editor.tsx's editingContainerId.
  onSetEditingContainer: (containerId: string | null) => void
  // Locks or unlocks an object for the canvas (ScreenObject.locked).
  onToggleLocked: (id: string, locked: boolean) => void
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = OBJECT_ICONS

function getObjectLabel(obj: ScreenObject): string {
  if (obj.type === "panel") {
    const value = (obj.properties?.comparisonValue ?? "").toString().trim()
    return value ? `Panel: ${value}` : "Panel"
  }
  if ((obj.type === "text" || obj.type === "button") && obj.properties?.text) {
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
// middle of a "panel" or "group" row previews reparenting into it (the only
// container types a drop can target - see lib/object-tree.ts's canDropAsChildOf for the
// full structural rules, which this component only visualizes, never
// re-derives).
export function ObjectTreePanel({
  screen,
  objects,
  selectedObjectIds,
  onSelectObject,
  onMoveObject,
  onSetEditingContainer,
  onToggleLocked,
}: ObjectTreePanelProps) {
  const isScreenSelected = selectedObjectIds.length === 0
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  // What a drag carries: the row taken, or - when it is selected along with
  // others - the whole selection, moved together in the order it stands in.
  const [draggedIds, setDraggedIds] = useState<string[]>([])
  const dragging = draggedIds.length > 0
  const canDropAll = useCallback(
    (parentId: string | null) => draggedIds.every((id) => canDropAsChildOf(objects, id, parentId)),
    [draggedIds, objects],
  )
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Whether `parentId` (null: the screen) places its children in order: a
  // stack, a row or a grid, or a screen whose root is one.
  const laysOut = useCallback(
    (parentId: string | null): boolean => {
      const type = parentId === null ? screen?.layout?.type : findObjectById(objects, parentId)?.type
      return !!type && isContainerType(type) && type !== "free"
    },
    [objects, screen],
  )

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, obj: ScreenObject, parentId: string | null) => {
      if (!dragging || draggedIds.includes(obj.id)) return
      e.preventDefault()
      e.stopPropagation()

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const relY = (e.clientY - rect.top) / rect.height
      const canGoInto = (obj.type === "panel" || obj.type === "group" || isContainerType(obj.type)) && canDropAll(obj.id)

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
      // In a layout container the rows are in the order it places them,
      // first at the top, so above is before and below is after.
      const placesInOrder = laysOut(parentId)
      const anchor: MoveAnchor =
        zone === "into"
          ? { type: "end" }
          : zone === "before"
            ? { type: placesInOrder ? "before" : "after", siblingId: obj.id }
            : { type: placesInOrder ? "after" : "before", siblingId: obj.id }
      const valid = canDropAll(targetParentId)

      setDropTarget({ hoveredId: obj.id, zone, parentId: targetParentId, anchor, valid })
      e.dataTransfer.dropEffect = valid ? "move" : "none"
    },
    [dragging, draggedIds, canDropAll, laysOut],
  )

  const commitDrop = useCallback(() => {
    if (dragging && dropTarget?.valid) {
      onMoveObject(draggedIds, dropTarget.parentId, dropTarget.anchor)
    }
    setDraggedIds([])
    setDropTarget(null)
  }, [dragging, draggedIds, dropTarget, onMoveObject])

  const handleDragEnd = useCallback(() => {
    setDraggedIds([])
    setDropTarget(null)
  }, [])

  // Each container's type by id, for what a click on one of its rows opens.
  const parentTypes = new Map<string, string>()
  const collectTypes = (list: ScreenObject[]) => {
    for (const obj of list) {
      if (obj.children?.length) {
        parentTypes.set(obj.id, obj.type)
        collectTypes(obj.children)
      }
    }
  }
  collectTypes(objects)

  const renderChildren = (children: ScreenObject[], depth: number, parentId: string | null) => {
    // A layout container's children in the order it places them, first at
    // the top as on the screen (lib/layout.ts layoutOrder); everything else
    // front first.
    const ascending = sortChildrenByZIndex(children)
    const displayed = laysOut(parentId) ? ascending : [...ascending].reverse()
    return displayed.map((child) => renderRow(child, depth, parentId))
  }

  const renderRow = (obj: ScreenObject, depth: number, parentId: string | null) => {
    const Icon = TYPE_ICONS[obj.type] ?? Square
    const hasChildren = (obj.children?.length ?? 0) > 0
    const isCollapsed = collapsedIds.has(obj.id)
    const isSelected = selectedObjectIds.includes(obj.id)
    const isDragging = draggedIds.includes(obj.id)
    const isDropHovered = dropTarget?.hoveredId === obj.id

    return (
      <div key={obj.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            setDraggedIds(selectedObjectIds.includes(obj.id) && selectedObjectIds.length > 1 ? selectedObjectIds : [obj.id])
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
            // Selecting what a panel or a group holds opens that container
            // the same way: the object is worked on where it lives, as
            // after a double click into a group on the canvas.
            if (!modifierKey) {
              if (obj.type === "panel") {
                onSetEditingContainer(obj.id)
              } else if (parentId) {
                const parentType = parentTypes.get(parentId)
                if (parentType === "panel" || parentType === "group" || isContainerType(parentType)) onSetEditingContainer(parentId)
              }
            }
          }}
          data-object-id={obj.id}
          title={`${obj.type} · ${obj.id}`}
          className={cn(
            "group flex items-center gap-1 px-1 py-1 text-xs rounded cursor-pointer select-none relative",
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
          {/* Shown while locked, and on hover to lock: a row that always
              carried an open padlock would say nothing on every other row. */}
          <button
            type="button"
            aria-label={obj.locked ? "Unlock" : "Lock"}
            aria-pressed={!!obj.locked}
            title={obj.locked ? "Locked on the canvas - click to unlock" : "Lock on the canvas"}
            data-lock-toggle={obj.id}
            className={cn(
              "w-4 h-4 flex items-center justify-center shrink-0 rounded hover:bg-muted-foreground/15",
              obj.locked ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100",
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggleLocked(obj.id, !obj.locked)
            }}
          >
            {obj.locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
          </button>
        </div>

        {hasChildren && !isCollapsed && <div>{renderChildren(obj.children!, depth + 1, obj.id)}</div>}
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-auto p-1"
      onDragOver={(e) => {
        if (dragging) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        // Dropped on empty space below every row (not on any row's own
        // onDrop, which stops propagation) - treat as "send to top level,
        // frontmost", if that's actually legal for the dragged object.
        if (dragging && !dropTarget && canDropAll(null)) {
          onMoveObject(draggedIds, null, { type: "end" })
        }
        setDraggedIds([])
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
