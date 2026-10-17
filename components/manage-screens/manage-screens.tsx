"use client"

/**
 * «Manage Screens»: the screens arranged as the device lays them out
 * (docs/2026-10-17-screen-graph.md decision 12, tasks/graph-surface-plan.md).
 * The main row runs left to right, each page's screen above and below it,
 * and apart from them the hidden screens, the popups and the masters. A click
 * selects a screen and shows its fields at the right - all the project
 * settings' «Screens» tab offered, which this view replaces; a double-click
 * opens it for editing. A screen is dragged into the row, onto a free place
 * above or below a page, or onto «Hidden»; while it is dragged only the
 * places it may go are lit, and a drop where it may not says why. Each drop
 * is one undo step.
 */

import { Fragment, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Project, ProjectScreen } from "../project-editor"
import { ScreenThumbnail } from "../screens-panel/screen-thumbnail"
import { ScreenEditorFields } from "../screen-editor-fields"
import { readOffscreenColor, useAdornmentImage } from "@/hooks/use-adornment-image"
import { resolveMasterScreen } from "@/lib/master-screen"
import { projectSeparators } from "@/lib/placeholders"
import { themeFor, type Variant } from "@/lib/themes"
import { withScreenType } from "@/lib/popup"
import { graphLayout, mainRow, withScreenApart, withScreenDocked, withScreenInRow, type ScreenEdge } from "@/lib/screen-graph"
import { isMainScreen } from "@/lib/popup"
import { withScreenDeleted, withScreenDuplicated } from "@/lib/screen-actions"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface ManageScreensProps {
  project: Project
  variant?: Variant
  currentScreenId: string
  onProjectUpdate: (project: Project) => void
  onScreenChange: (screenId: string) => void
  // A double-click: the screen opened for editing, the view closed.
  onOpenScreen: (screenId: string) => void
  onOpenScreenIconSelector: (screenId: string) => void
  onClose: () => void
}

// A thumbnail's width; its height follows the screen's own ratio.
const CARD_WIDTH = 168

export function ManageScreens({
  project,
  variant = "light",
  currentScreenId,
  onProjectUpdate,
  onScreenChange,
  onOpenScreen,
  onOpenScreenIconSelector,
  onClose,
}: ManageScreensProps) {
  const { offscreenMaskImage } = useAdornmentImage(project.adornment, readOffscreenColor())
  const { toast } = useToast()
  const [selectedId, setSelectedId] = useState<string>(currentScreenId)
  const layout = graphLayout(project.screens)
  const cardHeight = Math.round((CARD_WIDTH * project.screenHeight) / project.screenWidth)
  // A card: the thumbnail in its 4 px frame, a 4 px gap and the name's line.
  const cardTotal = cardHeight + 8 + 4 + 16
  const selected = project.screens.find((s) => s.id === selectedId)
  // The screen being dragged, and the drop target under the pointer.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const update = (screenId: string, change: (screen: ProjectScreen) => ProjectScreen) =>
    onProjectUpdate({ ...project, screens: project.screens.map((s) => (s.id === screenId ? change(s) : s)) })

  const row = mainRow(project.screens)

  // --- Dragging -------------------------------------------------------------
  // Popups and masters stay where they are: they have no place in the graph.
  const dragged = dragId ? project.screens.find((s) => s.id === dragId) : undefined
  const rowMoveOf = (id: string, beforeId: string | null) => {
    const at = row.findIndex((s) => s.id === id)
    // Dropped just before or after itself, a row screen stays put.
    if (at >= 0 && (beforeId === id || beforeId === (row[at + 1]?.id ?? null))) return undefined
    return withScreenInRow(project.screens, id, beforeId)
  }
  const dockOf = (id: string, place: string) => {
    const [pageId, edge] = place.split(":") as [string, ScreenEdge]
    return withScreenDocked(project.screens, id, pageId, edge)
  }
  const apartCheck = (id: string): { ok: true } | { ok: false; reason: string } => {
    const screen = project.screens.find((s) => s.id === id)!
    if (layout.hidden.some((s) => s.id === id)) return { ok: false, reason: `"${screen.name}" is hidden already.` }
    if (row.length === 1 && row[0].id === id)
      return { ok: false, reason: `"${screen.name}" is the last screen of the main row: it stays there.` }
    return { ok: true }
  }
  const lit = (key: string): boolean => {
    if (!dragged) return false
    if (key.startsWith("row:")) return !!rowMoveOf(dragged.id, key === "row:end" ? null : key.slice(4))
    if (key === "hidden") return apartCheck(dragged.id).ok
    return dockOf(dragged.id, key).ok
  }
  const dropOn = (key: string) => {
    const id = dragId
    setDragId(null)
    setOverKey(null)
    if (!id) return
    const refuse = (reason: string) => toast({ title: "The screen cannot go there", description: reason, variant: "destructive" })
    let screens: ProjectScreen[] | undefined
    if (key.startsWith("row:")) screens = rowMoveOf(id, key === "row:end" ? null : key.slice(4))
    else if (key === "hidden") {
      const check = apartCheck(id)
      if (!check.ok) return refuse(check.reason)
      screens = withScreenApart(project.screens, id)
    } else {
      const docked = dockOf(id, key)
      if (!docked.ok) return refuse(docked.reason)
      screens = docked.screens
    }
    if (!screens) return
    onProjectUpdate({ ...project, screens })
    setSelectedId(id)
  }
  // A drop target: it takes every drop of a screen, and lit tells where one fits.
  const dropTarget = (key: string) =>
    dragged
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            if (overKey !== key) setOverKey(key)
          },
          onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault()
            dropOn(key)
          },
        }
      : {}
  const litClass = (key: string) =>
    dragged && lit(key) ? (overKey === key ? "border-primary bg-primary/25" : "border-primary/70 bg-primary/10") : ""

  const card = (screen: ProjectScreen) => {
    const masterScreen = screen.isMaster ? undefined : resolveMasterScreen(screen, project.screens)
    const isSelected = screen.id === selectedId
    const draggable = isMainScreen(screen)
    return (
      <button
        type="button"
        data-screen-card={screen.id}
        onClick={() => setSelectedId(screen.id)}
        onDoubleClick={() => onOpenScreen(screen.id)}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", screen.id)
          setDragId(screen.id)
          setSelectedId(screen.id)
        }}
        onDragEnd={() => {
          setDragId(null)
          setOverKey(null)
        }}
        className={cn("flex flex-col gap-1 text-left", draggable && "cursor-grab", dragId === screen.id && "opacity-40")}
        style={{ width: CARD_WIDTH }}
        title={screen.name}
      >
        <div className={cn("border-4 rounded overflow-hidden bg-white", isSelected ? "border-primary" : "border-border")}>
          <ScreenThumbnail
            screen={screen}
            projectScreens={project.screens}
            masterObjects={screen.isMaster ? [] : (masterScreen?.objects ?? [])}
            masterScreen={masterScreen}
            screenWidth={project.screenWidth}
            screenHeight={project.screenHeight}
            projectName={project.name}
            numberSeparators={projectSeparators(project.settings)}
            deviceModel={project.settings.deviceName}
            fonts={project.fonts}
            projectAssets={project.assets}
            topics={project.topics}
            combinedTopics={project.combinedTopics}
            colorDepth={project.settings.colorDepth}
            theme={themeFor(screen, project.screens)}
            variant={variant}
            offscreenMaskImage={offscreenMaskImage}
            adornmentDrawingArea={project.adornmentDrawingArea}
            adornmentRotation={project.settings.rotation ?? 0}
          />
        </div>
        <span className={cn("truncate text-xs", isSelected ? "font-medium text-foreground" : "text-muted-foreground")}>
          {screen.name}
        </span>
      </button>
    )
  }

  // A place with nothing on it: where a screen could lie.
  const place = (key: string) => (
    <div
      key={key}
      data-empty-place={key}
      data-lit={lit(key) || undefined}
      {...dropTarget(key)}
      className={cn("rounded border border-dashed border-border/60", litClass(key))}
      style={{ width: CARD_WIDTH, height: cardTotal }}
    />
  )

  // A gap in the main row: where a dragged screen goes in, before `beforeId`
  // or at the end. Between two pages it carries their join.
  const rowGap = (beforeId: string | null, joined: boolean) => {
    const key = beforeId === null ? "row:end" : `row:${beforeId}`
    return (
      <div
        data-row-gap={beforeId ?? "end"}
        data-lit={lit(key) || undefined}
        {...dropTarget(key)}
        className={cn("relative w-6 shrink-0 self-stretch rounded border border-transparent", litClass(key))}
      >
        {joined && <div className="absolute inset-x-0 h-0.5 bg-border" style={{ top: cardTotal + 16 + (cardHeight + 8) / 2 - 1 }} />}
      </div>
    )
  }

  // The join between a page and a screen docked on it.
  const along = (key: string, shown: boolean) => (
    <div key={key} className={cn("mx-auto h-4 w-0.5", shown ? "bg-border" : "bg-transparent")} />
  )

  const rowIndex = row.findIndex((s) => s.id === selectedId)
  const moveInRow = (delta: -1 | 1) => {
    if (rowIndex < 0) return
    const beforeId = delta === -1 ? row[rowIndex - 1]?.id : (row[rowIndex + 2]?.id ?? null)
    if (beforeId === undefined) return
    onProjectUpdate({ ...project, screens: withScreenInRow(project.screens, selectedId, beforeId) })
  }

  const apartGroup = (title: string, testId: string, screens: ProjectScreen[], dropKey?: string) => (
    <div
      data-testid={testId}
      data-lit={(dropKey && lit(dropKey)) || undefined}
      {...(dropKey ? dropTarget(dropKey) : {})}
      className={cn("-m-2 flex flex-col gap-2 rounded border border-transparent p-2", dropKey && litClass(dropKey))}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-4">
        {screens.length > 0 ? screens.map((s) => <Fragment key={s.id}>{card(s)}</Fragment>) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </div>
    </div>
  )

  return (
    <div data-testid="manage-screens" className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="shrink-0 flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <div>
          <h2 className="text-sm font-medium">Manage Screens</h2>
          <p className="text-xs text-muted-foreground">
            The main row from left to right, with the screens above and below a page. Drag a screen to move it; double-click
            it to edit it.
          </p>
        </div>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto p-6 space-y-8">
          {/* The comb: one column per page of the main row. */}
          <div data-testid="screen-comb" className="flex items-start">
            {layout.columns.map((column, i) => (
              <Fragment key={column.page.id}>
                {rowGap(column.page.id, i > 0)}
                <div data-column={column.page.id} className="flex flex-col">
                  {column.up ? card(column.up) : place(`${column.page.id}:up`)}
                  {along(`${column.page.id}:up-join`, !!column.up)}
                  {card(column.page)}
                  {along(`${column.page.id}:down-join`, !!column.down)}
                  {column.down ? card(column.down) : place(`${column.page.id}:down`)}
                </div>
              </Fragment>
            ))}
            {rowGap(null, false)}
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <div className="text-xs font-medium text-muted-foreground">Apart</div>
            {apartGroup("Hidden", "apart-hidden", layout.hidden, "hidden")}
            {apartGroup("Popups", "apart-popups", layout.popups)}
            {apartGroup("Masters", "apart-masters", layout.masters)}
          </div>
        </div>

        {/* The selected screen: what the project settings' «Screens» tab
            showed for each row. */}
        <div className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto p-4 space-y-4">
          {selected ? (
            <>
              <ScreenEditorFields
                key={selected.id}
                screen={selected}
                allScreens={project.screens}
                projectAssets={project.assets}
                onRename={(name) => update(selected.id, (s) => ({ ...s, name }))}
                onSetMaster={(masterScreenId) => update(selected.id, (s) => ({ ...s, masterScreenId }))}
                onSetShowMaster={(showMaster) => update(selected.id, (s) => ({ ...s, showMaster }))}
                onPatch={(patch) => update(selected.id, (s) => ({ ...s, ...patch }))}
                onSetScreenType={(type) => update(selected.id, (s) => withScreenType(s, type))}
                onOpenIconSelector={() => onOpenScreenIconSelector(selected.id)}
                onClearIcon={() => update(selected.id, (s) => ({ ...s, iconAssetId: undefined }))}
              />
              <div className="text-xs text-muted-foreground">
                {selected.objects.length} {selected.objects.length === 1 ? "object" : "objects"}
              </div>
              <div className="flex flex-wrap gap-2">
                {rowIndex >= 0 && (
                  <>
                    <Button size="sm" variant="outline" disabled={rowIndex === 0} onClick={() => moveInRow(-1)}>
                      <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                      Move left
                    </Button>
                    <Button size="sm" variant="outline" disabled={rowIndex === row.length - 1} onClick={() => moveInRow(1)}>
                      <ArrowRight className="mr-1 h-3.5 w-3.5" />
                      Move right
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const duplicated = withScreenDuplicated(project, selected.id)
                    if (!duplicated) return
                    onProjectUpdate(duplicated.project)
                    setSelectedId(duplicated.newId)
                  }}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={project.screens.length <= 1}
                  onClick={() => {
                    const deleted = withScreenDeleted(project, selected.id)
                    if (!deleted.ok) {
                      toast({ title: deleted.title, description: deleted.description, variant: "destructive" })
                      return
                    }
                    onProjectUpdate(deleted.project)
                    if (currentScreenId === selected.id) onScreenChange(deleted.project.screens[0].id)
                    setSelectedId(mainRow(deleted.project.screens)[0]?.id ?? deleted.project.screens[0].id)
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Click a screen to see its settings.</p>
          )}
        </div>
      </div>
    </div>
  )
}
