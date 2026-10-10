"use client"

import { clampScroll, entryAt, layoutInStrip, navigatorScreens, navigatorStrip, scrollToShow, staysPut, type NavigatorLayout } from "@/lib/navigator"
import { renderNavigator } from "@/lib/render-screen"
import type { CombinedTopic } from "@/lib/combined-topics"
import { iconAsDrawn } from "@/lib/object-text"
import { useLiveValueTest } from "@/lib/live-value-test"
import { ROLE_PALETTE } from "@/lib/control-palette"
import type React from "react"
import { useEffect, useRef, useCallback, useMemo, useState } from "react"
import type {
  ProjectScreen,
  ScreenObject,
  SnapGuide,
  ProjectAsset,
  ColorRecoloration,
  Topic,
  ProjectFont,
  HardwareButton,
  HardwareButtonAction,
} from "../project-editor"
import { DEFAULT_SEPARATORS, type PlaceholderScope, type Separators } from "@/lib/placeholders"
import { applyAdornmentTransform, rectCenter, rotatePointCW, rotateRectCW, toQuarterTurns } from "@/lib/adornment-rotation"
import { parseSvgTransform } from "@/lib/svg-transform"
import { readOffscreenColor, useAdornmentImage } from "@/hooks/use-adornment-image"
import { resolveButtonAction, BUTTON_STATUS_COLOR } from "@/lib/hardware-button-actions"
import { resolveBackgroundColor } from "@/lib/master-screen"
import { getBaselineY, calculateTextObjectHeight, setupBDFCanvas, getFontHeight } from "@/lib/font-utils"
import { nearestStep, snapDiameter, stepKindOf, stepPx, stepUpdates, styledFont, type TextScale, type TextStyle } from "@/lib/size-scale"
// Renderer imports
import { renderLabel } from "./renderers/render-label"
import { renderMqttField } from "./renderers/render-mqtt-field"
import { renderArcLevel, arcValueFromPoint } from "./renderers/render-arc-level"
import {
  renderLevelIndicator,
  isSettableLevel,
  levelValueFromPoint,
} from "./renderers/render-level-indicator"
import { LEVEL_DEFAULT_THICKNESS, levelIsVertical, levelThickness } from "@/lib/level-shape"
import { renderIcon } from "./renderers/render-icon"
import { renderBox } from "./renderers/render-box"
import { renderLine, getLinePoints, type LinePoint } from "./renderers/render-line"
import { renderMqttDataLine } from "./renderers/render-mqtt-data-line"
import { renderSoftwareButton } from "./renderers/render-software-button"
import {
  renderSwitch,
  minSwitchWidth,
  SWITCH_MIN_HEIGHT,
  getActiveSwitchStateIndex,
  switchStateIndexForTap,
} from "./renderers/render-switch"
import {
  getPreviewValueFromTopic as getSharedPreviewValueFromTopic,
  getLiveValueFromTopic,
  placeholderScope,
  getActivePanel,
} from "@/lib/render-screen"
import { sortChildrenByZIndex, mergeMasterAndScreenObjects } from "@/lib/object-order"
import {
  insideFence,
  isPopup,
  onCloseBadge,
  popupCloseBadge,
  popupFence,
  POPUP_CLOSE_CROSS,
  POPUP_CLOSE_DISC,
} from "@/lib/popup"
import { applyTheme, resolveColor, themeById, type Theme, type Variant } from "@/lib/themes"
import { findObjectById, findParentOf } from "@/lib/object-tree"
import { childOrigin, containerOf, dissolveGroups, freeBackground, isGroup, translateObject } from "@/lib/object-groups"

// Interaction imports
import {
  findObjectAtPoint,
  findPreviewObjectAt,
  getCanvasCoordinates,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleKeyDown,
  type DragState,
  type MouseHandlerContext,
  type KeyboardHandlerContext,
  type SnapResult,
} from "./interactions"
import { isLevelType, isArcType, isSwitchType, type ObjectType } from "@/lib/object-types"
import { FALLBACK_SCALE, isContainerType, isLayoutOnlyType } from "@/lib/layout"
import { DEFAULT_TABLE_COLUMNS, TABLE_TYPE, isOldTable, addRowPlus, cellAt, columnsOf, dragColumnLine, emptyCells, nestedTablesNear, rowsBottom, tableDropAt, tablePlusAt, tableGeometry, type TableColumn, type TableDrop } from "@/lib/table"
import { TABLE_COMMANDS, type TableCommand } from "@/components/toolbar/table-group"
import { DEFAULT_TABLE_SHAPE, shapeColumns, type TableShapeId } from "@/lib/layout-templates"
import { drawSizeLines, drawSnapChip, drawSnapDrop, drawSnapTableCells, drawSpanHandles, snapChipText } from "./snap-table-overlay"
import { heldAt, placedSize } from "@/lib/placing"
import { dimensions, isSnapTable, liftOut, resizeSpan, setLineSize, snapCellOf, snapColumnsOf, snapDropAt, snapRowsOf, snapTableGeometry, spanIndexAt, type SnapDrop, type SnapRect, type SnapSide } from "@/lib/snap-table"

// How near a table or a free object a dragged object snaps
// (docs/2026-10-09-snap-tables.md, open question 5: proposed).
const SNAP_ZONE_MM = 5
// The id a new object has while it is being drawn, before the editor gives it one.
const NEW_OBJECT = "__new-object__"
// How near a span handle a press takes it, in screen pixels.
const SPAN_HANDLE_HIT = 9
// How near a table's column or row line a press takes it, in screen pixels.
const SIZE_LINE_HIT = 4

// A column's or row's line of a table put together by snapping (Task 8).
type SizeLine = { kind: "column" | "row"; index: number; x1: number; y1: number; x2: number; y2: number; byHand: boolean }
const nearSizeLine = (l: SizeLine, p: { x: number; y: number }, tolerance: number) =>
  l.kind === "column"
    ? Math.abs(p.x - l.x1) <= tolerance && p.y >= l.y1 - tolerance && p.y <= l.y2 + tolerance
    : Math.abs(p.y - l.y1) <= tolerance && p.x >= l.x1 - tolerance && p.x <= l.x2 + tolerance
// The line a press takes: the nearest - where a column line crosses a row
// line, the one the point lies closer to across.
const sizeLineAt = (lines: SizeLine[], p: { x: number; y: number }, tolerance: number): SizeLine | undefined => {
  const across = (l: SizeLine) => (l.kind === "column" ? Math.abs(p.x - l.x1) : Math.abs(p.y - l.y1))
  return lines.filter((l) => nearSizeLine(l, p, tolerance)).sort((a, b) => across(a) - across(b))[0]
}
import { PLUS, columnStripAt, drawColumnStrip, drawInsertPluses, drawShareLabel, drawTableHandles, drawTableLines, drawTableMoveHandle, nearTableHandles, onTableMoveHandle, tableHandleAt, type TableLines } from "./table-overlay"
import { deleteObjectById, type MoveAnchor } from "@/lib/object-tree"
import {
  ARC_HANDLE_STEP_DEGREES,
  ARC_MIN_SPAN_DEGREES,
  arcAngleAtPoint,
  arcAnglesForSpan,
  arcHandleAtPoint,
  arcHandleGeometry,
  arcShortestDelta,
  arcSpanDegrees,
  arcSpanDelta,
} from "./renderers/render-arc-level"

// The rectangle an object placed by a click into a table is made in
// (lib/table.ts): only a start - the table sets its place and width at
// once, the size step its height.
const CLICK_PLACED_SIZE = { width: 120, height: 40 }

// Maps a point from the adornment SVG's own (global, 0..viewBox) coordinate
// space into a given element's *local* space - i.e. undoes every
// transform="..." between the SVG root and that element, not just one on
// the element itself. Needed because adornmentSvgDoc is a detached
// DOMParser result (see detectSvgButtonAtPoint's own comment for why that
// rules out the browser's native getCTM()/getScreenCTM(), which only work
// on elements actually laid out in the live document) - so hit-testing has
// to compose the transform chain by hand instead of asking the browser for
// the already-resolved one.
//
// Each transform attribute is read by parseSvgTransform (lib/svg-transform.ts)
// rather than DOMMatrix's string constructor, which speaks CSS and threw on
// the rotate(-60.8) Inkscape writes onto a rotated shape - see that file's
// header. Ancestor transforms matter too: Inkscape group operations bake a
// transform="matrix(...)" onto the wrapping <g>, not the shape itself
// (found live 2026-08-16 on the M5 Dial's redrawn rotate-arrow buttons,
// which broke every click on them). A transform it cannot read still
// counts as identity rather than being guessed at.
// The forward composition localPointForElement inverts to hit-test - broken
// out on its own so fillButtonElement (drawing, not hit-testing) can reuse
// the exact same ancestor-chain composition instead of a second hand-rolled
// walk that could drift from it.
function composedTransformForElement(element: Element): DOMMatrix {
  const chain: Element[] = []
  let node: Element | null = element
  while (node && node.tagName.toLowerCase() !== "svg") {
    chain.unshift(node)
    node = node.parentElement
  }

  let matrix = new DOMMatrix()
  for (const el of chain) {
    const transform = el.getAttribute("transform")
    if (!transform) continue
    // Unreadable transform syntax leaves this ancestor's contribution as
    // identity rather than aborting the whole chain.
    const parsed = parseSvgTransform(transform)
    if (parsed) matrix = matrix.multiply(new DOMMatrix(parsed))
  }
  return matrix
}

function localPointForElement(element: Element, globalX: number, globalY: number): { x: number; y: number } {
  try {
    const local = composedTransformForElement(element).inverse().transformPoint({ x: globalX, y: globalY })
    return { x: local.x, y: local.y }
  } catch {
    return { x: globalX, y: globalY }
  }
}

// Fills a hardware button's own shape (<rect> or <path>, whatever the
// adornment artwork actually used) in the button's local coordinate space,
// under whatever ancestor transform Inkscape baked onto a wrapping <g> -
// same composedTransformForElement() the hit-test above uses, so a filled
// button always lines up with the region that's actually clickable. Used
// both for the persistent belegt/vererbt/unbelegt status fill and the
// hover highlight (see draw()) - unlike the old hover-only overlay, this
// isn't <rect>-only, since several real buttons (the M5 Dial's rotate
// arrows) are <path>s.
function fillButtonElement(ctx: CanvasRenderingContext2D, element: Element, color: string) {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== "rect" && tagName !== "path") return

  const matrix = composedTransformForElement(element)
  ctx.save()
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
  ctx.fillStyle = color

  if (tagName === "rect") {
    const x = Number.parseFloat(element.getAttribute("x") || "0")
    const y = Number.parseFloat(element.getAttribute("y") || "0")
    const width = Number.parseFloat(element.getAttribute("width") || "0")
    const height = Number.parseFloat(element.getAttribute("height") || "0")
    ctx.fillRect(x, y, width, height)
  } else {
    const d = element.getAttribute("d")
    if (d) {
      try {
        ctx.fill(new Path2D(d))
      } catch {
        // Unparseable path data - nothing sensible to fill.
      }
    }
  }
  ctx.restore()
}

// Diagonal lines over a rectangle, inside it: where a master's navigator
// lies on a screen (docs/2026-10-08-navigator.md decision 11).
function drawHatch(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  ctx.fillStyle = "rgba(127, 127, 127, 0.25)"
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = "rgba(127, 127, 127, 0.7)"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let d = -rect.height; d < rect.width; d += 8) {
    ctx.moveTo(rect.x + d, rect.y + rect.height)
    ctx.lineTo(rect.x + d + rect.height, rect.y)
  }
  ctx.stroke()
  ctx.restore()
}

export interface CanvasProps {
  screen: ProjectScreen
  // Resolved objects of `screen`'s assigned master screen (already filtered
  // by the "Show master" toggle by the caller), or undefined/empty when
  // none applies. Drawn merged with screen.objects (see
  // mergeMasterAndScreenObjects) but deliberately excluded from every
  // hit-testing/selection path below - visible, not editable, from here.
  masterObjects?: ScreenObject[]
  // `screen`'s own assigned master screen (already resolved by the caller
  // respecting isMaster/showMaster - see project-editor.tsx's
  // displayedScreenMaster), or undefined when none applies. Needed
  // separately from masterObjects above because button-action inheritance
  // (lib/hardware-button-actions.ts's resolveButtonAction) reads the
  // master's buttonActions, not its objects.
  masterScreen?: ProjectScreen
  // Every screen of the project, for what a navigator lists.
  projectScreens?: ProjectScreen[]
  selectedObjectIds: string[]
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  onSelectObjects: (ids: string[]) => void
  onUpdateObject: (objectId: string, updates: Partial<ScreenObject>) => void
  onDeleteObject: (objectId: string) => void
  snapGuides: SnapGuide[]
  zoom: number
  offset: { x: number; y: number }
  onZoomChange: (zoom: number) => void
  onOffsetChange: (offset: { x: number; y: number }) => void
  activeTool: "select" | ObjectType | "background" | "baustein"
  // parentId: when set, the new object becomes a child of that object
  // (e.g. the panel currently open for editing) instead of a top-level
  // screen object.
  onAddObject: (
    object: Omit<ScreenObject, "id" | "zIndex">,
    parentId?: string,
    // A table's cell or new row (lib/table.ts TableDrop), or where a table
    // put together by snapping takes it (lib/snap-table.ts SnapDrop).
    at?: { table: TableDrop } | { snap: SnapDrop },
  ) => void
  /** A table's column chosen by the strip above it (null: the screen's root table). */
  onSelectTableColumn?: (tableId: string, index: number) => void
  /** The column chosen, to show it filled in the strip. */
  chosenTableColumn?: { tableId: string; index: number } | null
  /**
   * The empty cell picked by a click (docs/2026-10-03-table-editing.md),
   * outlined; null when an object is selected or nothing in a table is.
   */
  chosenCell?: { tableId: string; row: number; column: number } | null
  /** A click picked an empty cell (null: none any more). */
  onSelectCell?: (cell: { tableId: string; row: number; column: number } | null) => void
  /** Which table commands can act on the cell in context; null outside a table. */
  tableCommandsEnabled?: Record<TableCommand, boolean> | null
  /** The shape the Table tool draws (lib/layout-templates.ts); «Name and control» without one. */
  tableShape?: TableShapeId
  /** A table command from the context menu (components/toolbar/table-group.tsx). */
  onTableCommand?: (command: TableCommand) => void
  /** A row or a column inserted at a line, by the «+» at its end. */
  onInsertTableLine?: (tableId: string, kind: "row" | "column", index: number) => void
  /** A table's own properties changed - its columns, its rows (null: the screen's root table). */
  onSetTableProperties?: (tableId: string, updates: Record<string, unknown>) => void
  /** Objects moved to a table's cell or a new row (lib/table.ts moveIntoTable). */
  onMoveToTable?: (objectIds: readonly string[], drop: TableDrop) => void
  /** A dragged object let go where it snaps (lib/snap-table.ts snapDropAt). */
  onSnapDrop?: (movingId: string, drop: SnapDrop) => void
  /** An object dragged out of a table put together by snapping, let go at `to` (the table's space) and snapped or free. */
  onSnapMoveOut?: (tableId: string, objectId: string, to: { x: number; y: number }, drop: SnapDrop | null) => void
  /** An object moved into a container, at a place (the object tree's move). */
  onMoveObject?: (objectIds: string | readonly string[], newParentId: string | null, anchor: MoveAnchor) => void
  onToolChange: (
    tool: "select" | ObjectType | "background" | "baustein",
  ) => void
  selectedIconAssetId?: string
  onIconToolClick: (position: { x: number; y: number }) => void
  projectAssets: ProjectAsset[]
  topics: Topic[]
  /** The project's combined topics, computed from the same values (lib/combined-topics.ts). */
  combinedTopics?: CombinedTopic[]
  fonts: ProjectFont[]
  /** The device's scale, when it gives one: new objects then start in a style. */
  textScale?: TextScale
  hardwareButtons: HardwareButton[]
  onHardwareButtonClick?: (button: HardwareButton) => void
  onManageTopics: () => void
  onMqttDiscovery: () => void
  onCopy: () => void
  /** Copy and delete the selection, one undo step. */
  onCut?: () => void
  onPaste: () => void
  onSelectAll: () => void
  hasClipboard: boolean
  screenWidth: number
  screenHeight: number
  // For {project:name} in texts (lib/placeholders.ts), which the export bakes
  // in with the same name.
  projectName: string
  // What placeholders in texts resolve against
  // (docs/2026-09-25-text-placeholders.md): the project's number format, and
  // the device the project is for - its model, and the instance it was last
  // deployed to.
  numberSeparators?: Separators
  deviceModel?: string
  deviceId?: string
  // How the adornment (mockup image + hardware button hit-rects) is rotated
  // relative to adornmentDrawingArea/hardwareButtons' stored native (0deg)
  // positions - see project-editor.tsx's ProjectSettings.rotation and
  // lib/adornment-rotation.ts. screenWidth/screenHeight above are already
  // the *post-rotation* (possibly swapped) values; this prop only affects
  // how the adornment picture and button hit-testing align with them.
  adornmentRotation?: 0 | 90 | 180 | 270
  // The display's shape (ProjectSettings.screenShape): a popup's fence is a
  // circle on a round one (lib/popup.ts popupFence).
  screenShape?: "rect" | "round"
  // The close button the device draws on an open popup
  // (ProjectSettings.popupCloseRadius, lib/popup.ts popupCloseBadge).
  popupCloseRadius?: number
  adornment?: string
  // Bottom-bar toggle (project-editor.tsx). Off draws the bare framebuffer,
  // including the corners a round device physically can't show - which the
  // adornment's own id^="offscreen" covers otherwise hide.
  showAdornment?: boolean
  adornmentDrawingArea?: {
    x: number
    y: number
    width: number
    height: number
  }
  // Object types the loaded device's firmware actually renders (from a Device
  // Description File). Objects of other types still render in the designer
  // but get a warning marker, since they won't appear on the real device.
  // undefined = no device loaded, no restriction.
  supportedObjectTypes?: string[]
  // Project's declared colorDepth (e.g. "1bit"). When "1bit", colors are
  // quantized to pure black/white before drawing so the canvas preview
  // matches what a 1-bit e-paper device will actually show, instead of
  // rendering literal grays/mid-tones the hardware can't display.
  colorDepth?: string
  // The theme this screen is drawn in (lib/themes.ts themeFor) and the
  // variant shown. Objects hold roles; they are resolved to hex just before
  // each is drawn, so hit-testing and every update still see the real
  // objects. A master's objects take this screen's theme.
  theme?: Theme
  variant?: Variant
  // The panel or group whose children this canvas is working on (a tab in
  // a switcher's strip opens a panel, a double click enters a group - see
  // project-editor.tsx's editingContainerId). null = the screen's own
  // objects, and every tab-control falls back to evaluating its own
  // condition against the topic's preview value, same as the read-only
  // render paths.
  editingContainerId: string | null
  onSetEditingContainer: (containerId: string | null) => void
  onAddPanel: (tabControlId: string) => void
  // Ctrl+G / Ctrl+U, offered in the context menu as well
  // (lib/object-groups.ts).
  onGroup?: () => void
  onUngroup?: () => void
  canGroup?: boolean
  canUngroup?: boolean
  // When true, the canvas behaves as it would at runtime: selection, drag,
  // resize, creation tools and all editing-only overlays (hover outlines,
  // selection handles, tab-strip editing UI) are disabled, and clicking a
  // SoftwareButton or hardware-button SVG overlay dispatches its action via
  // onPreviewButtonAction instead of opening the property/config panel.
  previewMode?: boolean
  onPreviewButtonAction?: (action: HardwareButtonAction) => void
  // Preview mode with a popup open (lib/popup.ts): `screen` is the popup, and
  // this is the screen it was opened over - drawn first, dimmed outside the
  // popup's fence. A click outside the fence calls onClosePopup.
  popupUnderlay?: { screen: ProjectScreen; masterObjects: ScreenObject[]; masterScreen?: ProjectScreen }
  onClosePopup?: () => void
  // Preview mode: something on screen published to a topic. A Switch tap
  // goes through here rather than setting a value directly, because a tap
  // does not set state - it sends a command, and what that command does is
  // the mock engine's business (lib/mock-engine.js). Routing it any other
  // way would make a Switch look like it works in preview while doing
  // nothing at all on a device, which is what preview did until 2026-08-25:
  // a Switch tap was not wired up anywhere.
  onPreviewPublish?: (topic: string, payload: string) => void
  /** Remembers what a tap asked for, until the topic answers. */
  onPreviewAsk?: (topic: string, expected: string) => void
  // Preview mode: a finger (here, the mouse) is setting a level that has a
  // write topic (docs/2026-09-17-settable-level.md). Called on press, while
  // dragging, and once more on release with `final` - the editor decides what
  // to publish and when (decision 3) and holds the dragged value until the
  // read topic answers (decision 6).
  onPreviewSetLevel?: (obj: ScreenObject, value: number, final: boolean) => void
  // Live preview: what the broker last delivered, per bare topic. When set,
  // every value is read from here and a topic nothing has arrived on has no
  // value - drawn the way a device draws it - instead of its first example
  // (docs/2026-09-15-live-data.md, decisions 5 and 6). Unset in the editor
  // and in the simulation.
  liveValues?: Record<string, string> | null
  // What a finger asked a settable level to become and nothing has answered
  // yet, per topic (the setpoint topic where there is one, else the read
  // topic). Deliberately NOT merged into liveValues: a request is drawn as a
  // marker, a measurement as the fill, and mixing the two is the bug this
  // separation exists to prevent (docs/2026-09-17-settable-level.md, 6c).
  askedValues?: Record<string, string> | null
  // The building-block tool (lib/bausteine.ts) drags a rectangle like every
  // other tool, but places nothing itself: which instance the block is for is
  // a question, and the editor asks it (components/baustein-dialog.tsx) before
  // any object exists. The rectangle arrives here in the coordinates the
  // objects will use, with the panel they belong to when one is open for
  // editing.
  onInsertBaustein?: (
    rect: { x: number; y: number; width: number; height: number },
    parentId?: string,
    at?: { table: TableDrop },
  ) => void
}

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "baseline-left" | "baseline-right"
// A point index into the line's own points array (see render-line.ts's
// getLinePoints) - was a fixed "start"|"end" union back when a line could
// only ever have two points.
type LineHandle = number

// Helper function removed - now in render-box.ts

// DragState is now imported from interactions module

interface PendingFieldCreation {
  type: ObjectType | "background" | "baustein"
  x: number
  y: number
  width: number
  height: number
}

const TAB_STRIP_HEIGHT = 18
const TAB_WIDTH = 56
const TAB_GAP = 2
const TAB_ADD_WIDTH = 20

interface TabStripTab {
  kind: "panel" | "add"
  panelId: string | null
  x: number
  y: number
  width: number
  height: number
  label: string
}

// Shared by drawTabStrip() and hitTestTabStrip() so the clickable area can
// never drift from what's actually drawn - a tab strip one pixel-tolerance
// wrong is the kind of bug that's invisible in a screenshot review but
// annoying in daily use. Coordinates are in the same (pre-zoom-scale)
// object space as obj.x/obj.y - callers already draw/hit-test within a
// ctx that has zoom applied via ctx.scale(), so sizes here are divided by
// zoom to keep the strip a constant screen size regardless of zoom level,
// matching the convention used for selection handles/line widths
// elsewhere in this file.
function getTabStripLayout(obj: ScreenObject, zoom: number): TabStripTab[] {
  const panels = obj.children ?? []
  const h = TAB_STRIP_HEIGHT / zoom
  const w = TAB_WIDTH / zoom
  const gap = TAB_GAP / zoom
  const addW = TAB_ADD_WIDTH / zoom
  const y = obj.y - h

  const tabs: TabStripTab[] = panels.map((panel, i) => ({
    kind: "panel",
    panelId: panel.id,
    x: obj.x + i * (w + gap),
    y,
    width: w,
    height: h,
    label: panel.properties?.comparisonValue?.trim() || `Panel ${i + 1}`,
  }))

  tabs.push({
    kind: "add",
    panelId: null,
    x: obj.x + panels.length * (w + gap),
    y,
    width: addW,
    height: h,
    label: "+",
  })

  return tabs
}

function hitTestTabStrip(obj: ScreenObject, x: number, y: number, zoom: number): TabStripTab | null {
  if (obj.type !== "switcher") return null
  for (const tab of getTabStripLayout(obj, zoom)) {
    if (x >= tab.x && x <= tab.x + tab.width && y >= tab.y && y <= tab.y + tab.height) return tab
  }
  return null
}

// EDITING_COLOR marks "you're working inside this panel right now" (pinned
// via editingContainerId) - deliberately a different hue from the blue used
// for "this is the panel the condition would currently resolve to", since
// those are two different facts that used to look identical (see the
// tab-control property panel's "Edit"/"Editing" button for the other half
// of this same distinction).
const EDITING_COLOR = "#7c3aed"
const MATCHED_COLOR = "#3b82f6"

function drawTabStrip(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  activePanelId: string | null,
  isEditing: boolean,
  zoom: number,
): void {
  const tabs = getTabStripLayout(obj, zoom)
  const fontSize = 9 / zoom

  ctx.save()
  ctx.font = `${fontSize}px -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  for (const tab of tabs) {
    const isActive = tab.kind === "panel" && tab.panelId === activePanelId
    const activeColor = isEditing ? EDITING_COLOR : MATCHED_COLOR
    ctx.fillStyle = tab.kind === "add" ? "#e5e7eb" : isActive ? activeColor : "#cbd5e1"
    ctx.beginPath()
    const r = 3 / zoom
    ctx.moveTo(tab.x, tab.y + tab.height)
    ctx.lineTo(tab.x, tab.y + r)
    ctx.arcTo(tab.x, tab.y, tab.x + r, tab.y, r)
    ctx.lineTo(tab.x + tab.width - r, tab.y)
    ctx.arcTo(tab.x + tab.width, tab.y, tab.x + tab.width, tab.y + r, r)
    ctx.lineTo(tab.x + tab.width, tab.y + tab.height)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = tab.kind === "add" ? "#374151" : isActive ? "#ffffff" : "#1f2937"
    const label = tab.kind === "panel" && tab.label.length > 8 ? tab.label.slice(0, 7) + "…" : tab.label
    ctx.fillText(label, tab.x + tab.width / 2, tab.y + tab.height / 2 + 0.5 / zoom)
  }
  ctx.restore()
}

// Single shared visual language for "this region isn't a real object yet" -
// used both for the marquee selection-rectangle drag and for every object
// type's creation-drag preview. One function so the look can be changed in
// one place later, instead of the dozen bespoke per-type previews this
// replaced: some types (box, label, MqttDataField) drew a solid fill in
// their real default colors, square-constrained types (icon, MQTTIconField)
// drew a blue dashed outline only, SoftwareButton faked a full 3D button
// render with a drop shadow and preview text, and so on - no shared
// language at all, so every new object type had to invent its own
// (2026-07-26 finding). Deliberately no per-type content preview (no
// placeholder text, no fake final colors) - during the raw drag, nothing
// about the object's eventual properties/defaults is meaningful yet; only
// its bounds are.
const CREATION_PREVIEW_COLOR = "#3b82f6"
// A layout container at work (docs/2026-10-02-layout.md): its outline and
// the places it gave what it holds - shown only while it is active, so a
// screen full of containers does not look like a construction drawing.
const LAYOUT_HINT_COLOR = "#0d9488"
const CREATION_PREVIEW_FILL = "rgba(59, 130, 246, 0.1)"

function drawCreationPreviewRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, zoom: number): void {
  ctx.save()
  ctx.fillStyle = CREATION_PREVIEW_FILL
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = CREATION_PREVIEW_COLOR
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.strokeRect(x, y, width, height)
  ctx.restore()
}

function drawCreationPreviewLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, zoom: number): void {
  ctx.save()
  ctx.strokeStyle = CREATION_PREVIEW_COLOR
  // A diagonal stroke at the same nominal lineWidth as an axis-aligned
  // strokeRect() edge reliably looks thinner - canvas anti-aliases a
  // diagonal's coverage into a crisp, near-full-opacity thin band, while
  // an axis-aligned edge often straddles a pixel boundary and blurs across
  // two half-opacity rows, which reads as visually heavier even at equal
  // nominal width (confirmed by sampling both with getImageData, not just
  // eyeballed). sqrt(2) is the width this line would need to keep the same
  // *perpendicular* footprint as an axis-aligned line if you rotated one
  // into the other - not a rigorous colorimetric match, but close enough
  // by eye and a principled number rather than an arbitrary one.
  ctx.lineWidth = Math.SQRT2 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()
}

const calculateOptimalGridColor = (backgroundColor: string): string => {
  // Convert hex to RGB
  const hex = backgroundColor.replace("#", "")
  const r = Number.parseInt(hex.substr(0, 2), 16)
  const g = Number.parseInt(hex.substr(2, 2), 16)
  const b = Number.parseInt(hex.substr(4, 2), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // For light backgrounds, use a darker grid color
  // For dark backgrounds, use a lighter grid color
  if (luminance > 0.5) {
    // Light background - use darker grid with moderate contrast
    const gridValue = Math.max(0, Math.floor(luminance * 255 - 80))
    const hexValue = gridValue.toString(16).padStart(2, '0')
    return `#${hexValue}${hexValue}${hexValue}`
  } else {
    // Dark background - use lighter grid with moderate contrast
    const gridValue = Math.min(255, Math.floor(luminance * 255 + 120))
    const hexValue = gridValue.toString(16).padStart(2, '0')
    return `#${hexValue}${hexValue}${hexValue}`
  }
}

// MqttDataLine shares every geometric behavior a plain line has (points
// array, fillet, hit-testing, endpoint dragging, resize handles) - only
// what properties it carries and how it renders differ. Centralizes the
// "is this object line-shaped" check used throughout hit-testing/dragging
// below instead of repeating `type === "line" || type === "live-line"`
// at each call site.
function isLineType(type: string): boolean {
  return type === "line" || type === "live-line"
}

// Types whose width and height are held equal - an icon and an MQTT icon
// field because their artwork is square, an arc-level because it is a ring
// inscribed in its box and an oval one is not a thing anybody wants.
//
// Written once rather than repeated at the three places that need it
// (creation preview, creation, resize), which is how it was before: adding a
// fourth square type meant finding all three, and missing one produced an
// object that could be dragged out square and then resized oval.
function isSquareType(type: string | undefined): boolean {
  return type === "icon" || type === "live-icon" || isArcType(type)
}

// Default properties for a freshly-drawn plain line - shared between the
// single-drag creation path and the click-to-place polyline path
// (finishPolyline) so both produce an identical starting object.
function defaultLineProperties(points: LinePoint[]) {
  return {
    color: ROLE_PALETTE.stroke,
    strokeWidth: 2,
    strokeStyle: "solid",
    filletRadius: 0,
    points,
  }
}

// Default properties for a freshly-drawn MqttDataLine. `calibrationPoints`
// (value -> strokeWidth-in-px, unbound topic) intentionally reuses the
// level-indicator's exact {value, barSizePercent} shape and interpolation
// mechanism (calculateLevelIndicatorFill/interpolateCalibration, already
// proven identical across designer/firmware/Android) rather than
// introducing a parallel, differently-named struct just for this - the
// field is literally named "barSizePercent" but reinterpreted here as a
// pixel stroke width, a deliberate reuse-over-clarity tradeoff (2026-07-31
// grill-me session). arrowStart/arrowEndOperator+Value default to "<"/">"
// 0 - a signed topic value's sign alone decides which end's arrow shows,
// matching the "one signed value drives both magnitude and direction"
// design.
function defaultMqttDataLineProperties(points: LinePoint[]) {
  return {
    topic: "",
    color: ROLE_PALETTE.stroke,
    filletRadius: 0,
    points,
    calibrationPoints: [
      { value: 0, barSizePercent: 1 },
      { value: 100, barSizePercent: 6 },
    ],
    arrowStartOperator: "<",
    arrowStartValue: "0",
    arrowEndOperator: ">",
    arrowEndValue: "0",
  }
}


// How a resize treats an object on a size step: along its length only (bar,
// slider), on its track's grid (gauge, dial), or snapped to a step
// (switch, button, icon). null when there is no scale or no step kind.
function resizedOnStep(
  object: ScreenObject,
  pixelsPerMm: number | undefined,
):
  | { kind: "length" }
  | { kind: "diameter"; thickness: number }
  | { kind: "control" | "icon"; pixelsPerMm: number }
  | null {
  if (!pixelsPerMm) return null
  const kind = stepKindOf(object.type)
  if (kind === "track") {
    return object.type === "gauge" || object.type === "dial"
      ? { kind: "diameter", thickness: levelThickness(object) }
      : { kind: "length" }
  }
  if (kind === "control" || kind === "icon") return { kind, pixelsPerMm }
  return null
}

export function Canvas({
  screen,
  masterObjects = [],
  masterScreen,
  selectedObjectIds,
  onSelectObject,
  onSelectObjects,
  onUpdateObject,
  onDeleteObject,
  snapGuides,
  zoom,
  offset,
  onZoomChange,
  onOffsetChange,
  activeTool,
  onAddObject,
  onMoveObject,
  onMoveToTable,
  onSnapDrop,
  onSnapMoveOut,
  onSetTableProperties,
  onSelectTableColumn,
  chosenTableColumn,
  chosenCell,
  onSelectCell,
  tableCommandsEnabled,
  onTableCommand,
  tableShape,
  onInsertTableLine,
  onToolChange,
  selectedIconAssetId,
  onIconToolClick,
  projectAssets = [],
  topics,
  combinedTopics,
  fonts, // Added fonts to destructuring
  textScale,
  hardwareButtons = [], // Added hardware buttons to destructuring
  onHardwareButtonClick,
  onManageTopics,
  onMqttDiscovery,
  onCopy,
  onCut,
  onPaste,
  onSelectAll,
  hasClipboard = false,
  screenWidth,
  screenHeight,
  projectName,
  numberSeparators = DEFAULT_SEPARATORS,
  deviceModel,
  deviceId,
  adornmentRotation = 0,
  screenShape,
  popupCloseRadius,
  adornment,
  showAdornment = true,
  adornmentDrawingArea,
  supportedObjectTypes,
  colorDepth,
  theme: themeProp,
  variant = "light",
  editingContainerId: editingContainerIdProp,
  onSetEditingContainer,
  onAddPanel,
  onGroup,
  onUngroup,
  canGroup = false,
  canUngroup = false,
  previewMode = false,
  projectScreens,
  onPreviewButtonAction,
  popupUnderlay,
  onClosePopup,
  onPreviewPublish,
  onPreviewAsk,
  onPreviewSetLevel,
  liveValues = null,
  askedValues = null,
  onInsertBaustein,
}: CanvasProps) {
  // A screen with no local backgroundColor of its
  // own inherits its assigned master's, same shape as button-action
  // inheritance above - see lib/master-screen.ts. Resolved once here and
  // used everywhere below instead of the raw screen fields.
  const theme = themeProp ?? themeById(undefined)
  const resolvedBackgroundColor = resolveColor(resolveBackgroundColor(screen, masterScreen).color, theme, variant, colorDepth)
  // One object with its roles resolved for drawing; children come with it.
  const themed = (obj: ScreenObject): ScreenObject => applyTheme([obj], theme, variant, colorDepth)[0]

  // Preview mode: the settable level the mouse is currently setting, and the
  // last value it stood for. A ref rather than state because nothing here
  // renders from it - and because handleMouseUp gets no coordinates, so the
  // release has to publish the value the last move computed
  // (docs/2026-09-17-settable-level.md, decision 3).
  // The level a finger holds in the preview, at its place on the screen - it
  // may sit in a switcher's panel, where its own x/y are the panel's.
  const levelDragRef = useRef<{ id: string; value: number; object: ScreenObject } | null>(null)

  // The navigator in the preview (docs/2026-10-08-navigator.md): how far it
  // is scrolled, and a press on it - a drag along it scrolls, a press that
  // does not move opens the entry's screen.
  const [navigatorScroll, setNavigatorScroll] = useState<number | undefined>(undefined)
  const navigatorDragRef = useRef<{
    layout: NavigatorLayout
    start: { x: number; y: number }
    startScroll: number
    scroll: number
    moved: boolean
  } | null>(null)

  // The navigator shown in the preview - the master's, on a screen showing
  // its master - laid out on its strip, or undefined.
  // What the mouse handlers read of it, current at every render - they are
  // callbacks with fixed dependencies.
  const navigatorLatest = useRef({
    scroll: undefined as number | undefined,
    screens: [] as ProjectScreen[],
    screenId: "",
    goTo: (_id: string) => {},
    layout: (): NavigatorLayout | undefined => undefined,
  })
  const previewNavigatorLayout = (): NavigatorLayout | undefined => {
    if (!previewMode) return undefined
    const navigator = [...(masterObjects ?? []), ...screen.objects].find((o) => o.type === "navigator")
    if (!navigator) return undefined
    const strip = { x: navigator.x, y: navigator.y, width: navigator.width, height: navigator.height }
    return layoutInStrip(navigator.properties.edge ?? "left", navigator.properties.shows ?? "iconsAndText", strip, navigatorScreens(projectScreens ?? []).length)
  }
  navigatorLatest.current = {
    scroll: navigatorScroll,
    screens: projectScreens ?? [],
    screenId: screen.id,
    goTo: (id) => onPreviewButtonAction?.({ type: "goto-screen", targetScreenId: id }),
    layout: previewNavigatorLayout,
  }
  const insideStrip = (layout: NavigatorLayout, p: { x: number; y: number }) =>
    p.x >= layout.strip.x && p.y >= layout.strip.y && p.x < layout.strip.x + layout.strip.width && p.y < layout.strip.y + layout.strip.height

  // After every screen change in the preview, as far as shows the open
  // screen's entry (decision 12); out of the preview it starts over.
  useEffect(() => {
    const layout = previewNavigatorLayout()
    if (!layout) {
      setNavigatorScroll(undefined)
      return
    }
    const index = navigatorScreens(projectScreens ?? []).findIndex((s) => s.id === screen.id)
    setNavigatorScroll((previous) => (index < 0 ? previous : scrollToShow(layout, index, previous ?? 0)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, screen.id])

  // Preview mode: the software button the mouse is holding down, drawn pressed
  // until the button is let go - wherever that happens, so a release outside
  // the canvas does not leave it stuck. What the 4.3B does with its pathActive
  // bitmap while a finger is on it (docs/2026-09-19-button-look.md). Until
  // 2026-09-19 the preview never showed a pressed button at all.
  const [pressedButtonId, setPressedButtonId] = useState<string | null>(null)
  // The same for a Switch, which needs the state under the finger as well as
  // the object - a group marks that one segment (docs/2026-09-20-switch-look.md).
  const [pressedSwitch, setPressedSwitch] = useState<{ id: string; index: number } | null>(null)
  useEffect(() => {
    if (!pressedButtonId && !pressedSwitch) return
    const release = () => {
      setPressedButtonId(null)
      setPressedSwitch(null)
    }
    window.addEventListener("mouseup", release)
    return () => window.removeEventListener("mouseup", release)
  }, [pressedButtonId, pressedSwitch])

  // A finger's position, as the value that object would publish: a rectangle
  // for the bar, a sector for the ring, one answer for both
  // (docs/2026-09-17-settable-level.md).
  const settableValueAt = (obj: ScreenObject, x: number, y: number): number =>
    isArcType(obj.type) ? arcValueFromPoint(obj, x, y) : levelValueFromPoint(obj, x, y, fonts)

  // In preview mode there is no "pinned panel" override - tab-controls
  // always resolve via getActivePanel exactly like the real device, and no
  // tab-strip editing UI (violet outline, clickable tab labels) is drawn.
  // Shadowing the prop under its original name means every existing usage
  // below (interactionObjects, drawObject's tab-control case, the tab-strip
  // hit-test in handleMouseDown) gets this for free.
  const editingContainerId = previewMode ? null : editingContainerIdProp
  // What a new object's text starts in on a device with a scale
  // (docs/2026-09-30-size-scale.md): a style, and the font it resolves to.
  // undefined elsewhere, where each object keeps the font it always got.
  const startStyled = (style: TextStyle) => (textScale ? styledFont(style, false, textScale, fonts) : undefined)

  // Helper function to find the smallest available font
  const findSmallestFont = () => {
    if (!fonts || fonts.length === 0) return null
    return fonts.reduce((smallest, font) => {
      const smallestSize = smallest?.size || Infinity
      const currentSize = font.size || 0
      return currentSize < smallestSize ? font : smallest
    }, fonts[0])
  }

  // The panel or group currently open for editing (editingContainerId), if
  // any, plus the absolute-coordinate origin its children are relative to
  // (childOrigin: a panel adds nothing to its switcher's). When null/not
  // found, interaction operates on the screen's own top-level objects
  // exactly as it always has - none of the existing flat drag/resize/snap
  // logic needed to change, only WHICH object list and coordinate origin
  // it's given (see interactionObjects below).
  const editingContainer = editingContainerId ? findObjectById(screen.objects, editingContainerId) : null
  const editingOrigin = childOrigin(screen.objects, editingContainer?.id ?? null)
  // The open panel's switcher, for "a click beside the panel's objects but
  // inside its switcher selects the switcher"; the open group, for dimming
  // everything else and for leaving it again.
  const editingTabControl =
    editingContainer?.type === "panel" ? (findParentOf(screen.objects, editingContainer.id)?.parent ?? null) : null
  // A layout container is opened and left as a group is (docs/2026-10-02-layout.md).
  const editingGroup = isGroup(editingContainer) || isContainerType(editingContainer?.type) ? editingContainer : null
  // The open container and everything around it: a switcher on the way
  // shows the panel on the way, whatever its condition says.
  const editingChain = new Set<string>()
  for (let node = editingContainer; node; node = findParentOf(screen.objects, node.id)?.parent ?? null) {
    editingChain.add(node.id)
  }

  // The flat object list every interaction helper (findObjectAtPoint,
  // calculateSnap, selection-rectangle, resize) already expects, with
  // ABSOLUTE coordinates - either the screen's real top-level objects, or
  // (while editing a panel or a group) its children shifted by
  // editingOrigin, a line's points with them. This is what lets the
  // existing, extensively-tested flat interaction code work unchanged for
  // nested objects: it never needs to know an object came from a container
  // instead of the screen, only that its x/y are in the same coordinate
  // space as the mouse coordinates it's compared against.
  const interactionObjects: ScreenObject[] = editingContainer
    ? (editingContainer.children ?? []).map((child) => translateObject(child, editingOrigin.x, editingOrigin.y))
    : screen.objects

  // Where a new object drawn now goes, and what it can snap to there: the
  // open panel, group or free area, or the screen. A table put together by
  // snapping takes nothing but through a cell, so while one is open a new
  // object goes where the table stands - and snaps into it or beside it
  // (reported 2026-10-10: it went into the table's first cell instead,
  // however far away it was drawn).
  const drawSpace = useMemo(() => {
    if (!isSnapTable(editingContainer)) return { id: editingContainer?.id ?? null, origin: editingOrigin, objects: interactionObjects }
    const parent = findParentOf(screen.objects, editingContainer!.id)?.parent ?? null
    const origin = parent ? childOrigin(screen.objects, parent.id) : { x: 0, y: 0 }
    const list = parent ? (parent.children ?? []) : screen.objects
    return { id: parent?.id ?? null, origin, objects: list.map((child) => translateObject(child, origin.x, origin.y)) }
  }, [editingContainer, editingOrigin, interactionObjects, screen.objects])

  // What a finger can reach in preview: every group dissolved, so a button
  // inside one is pressed like any other (lib/object-groups.ts) - the
  // device never sees the group either.
  const previewObjects = useMemo(
    () => (previewMode ? dissolveGroups(screen.objects) : screen.objects),
    [previewMode, screen.objects],
  )

  // Wraps onUpdateObject so position/size updates computed by the drag/
  // resize code (which works in the same absolute space as
  // interactionObjects) land back on the real, relative-to-parent x/y a
  // nested object actually stores - onUpdateObject itself already finds
  // the object anywhere in the tree by id, so the only thing this adds is
  // converting x/y back out of the shim's absolute space before writing.
  const updateInteractionObject = useCallback(
    (objectId: string, updates: Partial<ScreenObject>) => {
      if (editingContainer) {
        const adjusted = { ...updates }
        if (adjusted.x !== undefined) adjusted.x = adjusted.x - editingOrigin.x
        if (adjusted.y !== undefined) adjusted.y = adjusted.y - editingOrigin.y
        // A line's points come out of the shim absolute too.
        const points = adjusted.properties?.points
        if (Array.isArray(points)) {
          adjusted.properties = {
            ...adjusted.properties,
            points: points.map((p: LinePoint) => ({ ...p, x: p.x - editingOrigin.x, y: p.y - editingOrigin.y })),
          }
        }
        onUpdateObject(objectId, adjusted)
      } else {
        onUpdateObject(objectId, updates)
      }
    },
    [editingContainer, editingOrigin.x, editingOrigin.y, onUpdateObject],
  )

  // Wraps onAddObject the same way for newly-created objects: convert the
  // drawn rectangle's absolute x/y (and a line's points) back to
  // relative-to-parent, and target the open panel or group as the parent
  // instead of the top-level screen.
  const addInteractionObject = useCallback(
    (drawn: Omit<ScreenObject, "id" | "zIndex">) => {
      // A new object with a size step starts at M where the device gives a
      // scale: what was dragged decides only the free dimension - a bar's
      // length, a switch's width - and a ring's diameter on its track's grid
      // (docs/2026-09-30-size-scale.md).
      const atM =
        textScale && stepKindOf(drawn.type)
          ? stepUpdates(drawn as ScreenObject, "m", textScale.pixelsPerMm, fonts ?? [])
          : undefined
      const sized = atM ? { ...drawn, ...atM } : drawn
      // Carried at its middle (placing by dragging): the creation code may
      // give it another size than it was carried at - a slider its track's
      // height, a text its font's - so its middle is put back where it was
      // let go.
      const middle = placedMiddleRef.current
      placedMiddleRef.current = null
      const object = middle
        ? translateObject(sized as ScreenObject, Math.round(middle.x - (sized.x + sized.width / 2)), Math.round(middle.y - (sized.y + sized.height / 2)))
        : sized
      // Drawn where it snaps (handleMouseMove): into that table, or a table
      // with its neighbour.
      const snapTo = createSnapRef.current
      createSnapRef.current = null
      // In the space it is drawn in (drawSpace): out of an open table into
      // the space the table stands in, which is open from now on.
      const leavesTable = isSnapTable(editingContainer)
      if (snapTo || leavesTable) {
        const placed = drawSpace.id !== null ? translateObject(object as ScreenObject, -drawSpace.origin.x, -drawSpace.origin.y) : object
        if (leavesTable) onSetEditingContainer(drawSpace.id)
        onAddObject(placed, drawSpace.id ?? undefined, snapTo ? { snap: snapTo } : undefined)
        return
      }
      const inTable = tablePlacementRef.current
      if (inTable) {
        tablePlacementRef.current = null
        onAddObject(object, undefined, { table: inTable })
        return
      }
      if (editingContainer) {
        const placed = translateObject(object as ScreenObject, -editingOrigin.x, -editingOrigin.y)
        onAddObject(placed, editingContainer.id)
      } else {
        onAddObject(object)
      }
    },
    [editingContainer, editingOrigin.x, editingOrigin.y, onAddObject, textScale, fonts, drawSpace, onSetEditingContainer],
  )

  // Commits an in-progress segmented line (see polylineDraft) as a real
  // line object - fewer than 2 points means there's nothing to draw (a
  // single placed point with no second one, e.g. Escape/Enter pressed
  // immediately), so it's discarded rather than creating a degenerate
  // zero-length line.
  const finishPolyline = useCallback(
    (points: LinePoint[]) => {
      if (points.length >= 2) {
        const xs = points.map((p) => p.x)
        const ys = points.map((p) => p.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const roundedPoints = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
        addInteractionObject({
          type: activeTool === "live-line" ? "live-line" : "line",
          x: Math.round(minX),
          y: Math.round(minY),
          width: Math.round(Math.max(...xs) - minX),
          height: Math.round(Math.max(...ys) - minY),
          properties:
            activeTool === "live-line" ? defaultMqttDataLineProperties(roundedPoints) : defaultLineProperties(roundedPoints),
        })
        onToolChange("select")
      }
      setPolylineDraft(null)
      setPolylineCursor(null)
    },
    [addInteractionObject, onToolChange, activeTool],
  )

  const cancelPolylineDraft = useCallback(() => {
    setPolylineDraft(null)
    setPolylineCursor(null)
  }, [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  // Points placed so far while interactively drawing a segmented line - a
  // real drag (see the "line" case of handleMouseUp's create-validity
  // check) still makes a plain two-point line in one gesture same as
  // always; a click that's too short to count as a drag instead starts this
  // click-to-place-each-vertex flow, finished with a double-click or Enter,
  // cancelled with Escape, with Backspace removing the most recent point.
  const [polylineDraft, setPolylineDraft] = useState<LinePoint[] | null>(null)
  const [polylineCursor, setPolylineCursor] = useState<LinePoint | null>(null)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  // With a tool over a table (docs/2026-10-02-layout-tables.md): the empty
  // cell that lights up or the row line drawn thick - where a click puts the
  // object, sized by the table, instead of a rectangle being drawn;
  // tablePlacementRef carries it from the press to the object's making.
  const [tableDrop, setTableDrop] = useState<TableDrop | null>(null)
  // Where the object being dragged snaps when let go (lib/snap-table.ts).
  const [snapDrop, setSnapDrop] = useState<SnapDrop | null>(null)
  // The same for an object being drawn, handed to addInteractionObject on release.
  const createSnapRef = useRef<SnapDrop | null>(null)
  // Where a carried new object was let go, its middle (placing by dragging).
  const placedMiddleRef = useRef<{ x: number; y: number } | null>(null)
  // A span handle being dragged (Task 7).
  const spanDragRef = useRef<{ tableId: string; id: string; side: SnapSide } | null>(null)
  // A column or row line being dragged (Task 8), and what it shows meanwhile.
  const lineDragRef = useRef<{ tableId: string; kind: "column" | "row"; index: number } | null>(null)
  const [lineLabel, setLineLabel] = useState<{ x: number; y: number; text: string } | null>(null)
  // An object being dragged out of a table put together by snapping: where
  // it is carried, and the space it would land in with it already out of
  // the table - what the snap target is worked out and drawn against.
  const [outDrag, setOutDrag] = useState<{ tableId: string; id: string; rect: SnapRect; space: ScreenObject[] } | null>(null)
  // The nested tables near the pointer while something is placed: theirs
  // is the «+» below that shows (lib/table.ts nestedTablesNear).
  const [nearTables, setNearTables] = useState<string[]>([])
  // The nested tables near the pointer with the select tool: theirs are the
  // strip, the «+» and the handles that show, the others' would lie over
  // the table holding them (table-overlay.ts nearTableHandles).
  const [nearHandles, setNearHandles] = useState<string[]>([])
  // Whose handles show only near the pointer: a nested table's - they lie
  // over the table holding it.
  const handlesOnlyNear = (table: { id: string; nested: boolean }) => table.nested
  // The table whose handle shows, as in Word: the innermost under the
  // pointer with the select tool - never the screen's own, which does not
  // move (docs/2026-10-03-table-editing.md).
  const [handleTable, setHandleTable] = useState<string | null>(null)
  const tablePlacementRef = useRef<TableDrop | null>(null)
  // A column line being dragged on the active table (Task 6): which, from
  // where, and the columns as they were; the draft is what the drag makes,
  // shown while it moves and kept when it is let go.
  const columnDragRef = useRef<{ tableId: string; index: number; startX: number; columns: TableColumn[]; widths: number[] } | null>(null)
  const [columnDraft, setColumnDraft] = useState<{ x: number; y: number; bottom: number; label: string; columns: TableColumn[] } | null>(null)
  useEffect(() => {
    setTableDrop(null)
    setNearTables([])
  }, [activeTool])
  // Whether a table places this object.
  const placedByLayout = useCallback(
    (id: string): boolean => {
      const type = findParentOf(screen.objects, id)?.parent?.type
      return !!type && isContainerType(type) && type !== "free"
    },
    [screen.objects],
  )

  // The tables that show they are being worked on (LAYOUT_HINT_COLOR): one
  // that is selected or open, the one holding a selected object, and the one
  // a placement points into.
  const activeContainerIds = useMemo(() => {
    if (previewMode) return [] as string[]
    const ids = new Set<string>()
    const add = (id: string | null | undefined) => {
      const obj = id ? findObjectById(screen.objects, id) : null
      if (obj && isContainerType(obj.type)) ids.add(obj.id)
    }
    for (const id of selectedObjectIds) {
      add(id)
      add(findParentOf(screen.objects, id)?.parent?.id)
    }
    add(editingContainerId)
    // The empty cell picked: its table is the one worked on.
    if (chosenCell && selectedObjectIds.length === 0) add(chosenCell.tableId)
    if (tableDrop) add(tableDrop.tableId)
    return [...ids]
  }, [previewMode, selectedObjectIds, editingContainerId, tableDrop, chosenCell, screen.objects])

  const layoutScale = useMemo(() => ({ pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts }), [textScale, fonts])

  // What a table put together by snapping sizes: the table itself (as large
  // as its content) and each object in it (its cell decides). No resize
  // handle on them - one would promise a resize the layout undoes
  // (docs/2026-10-09-snap-tables.md: never a handle that does nothing).
  const sizedBySnapTable = useMemo(() => {
    const ids = new Set<string>()
    const walk = (list: ScreenObject[]) => {
      for (const obj of list) {
        if (isSnapTable(obj)) {
          ids.add(obj.id)
          for (const child of obj.children ?? []) ids.add(child.id)
        }
        if (obj.children) walk(obj.children)
      }
    }
    walk(screen.objects)
    return ids
  }, [screen.objects])

  // The chip naming the one selected thing when it is a table put together
  // by snapping or stands in one: «Table · 3×4», «Switch · M · 2×1»
  // (docs/2026-10-09-snap-tables.md). Also on the canvas element for tests.
  const snapChip = useMemo(() => {
    if (previewMode || selectedObjectIds.length !== 1) return null
    const id = selectedObjectIds[0]
    const obj = findObjectById(screen.objects, id)
    if (!obj) return null
    const parent = findParentOf(screen.objects, id)?.parent ?? null
    if (!isSnapTable(obj) && !isSnapTable(parent)) return null
    const base = parent ? childOrigin(screen.objects, parent.id) : { x: 0, y: 0 }
    const text = isSnapTable(obj) ? snapChipText(obj, null, dimensions(obj)) : snapChipText(obj, parent)
    return { text, at: { x: base.x + obj.x, y: base.y + obj.y } }
  }, [previewMode, selectedObjectIds, screen.objects])

  // The four span handles of the one object chosen in a table put together
  // by snapping, at the middle of its span's edges (Task 7), in the canvas's
  // coordinates; and the table, at its place there.
  const spanHandles = useMemo(() => {
    if (previewMode || selectedObjectIds.length !== 1) return null
    const id = selectedObjectIds[0]
    const obj = findObjectById(screen.objects, id)
    const parent = findParentOf(screen.objects, id)?.parent ?? null
    if (!obj || !parent || !isSnapTable(parent)) return null
    const origin = childOrigin(screen.objects, parent.id)
    const g = snapTableGeometry(parent, layoutScale)
    const c = snapCellOf(obj)
    const lastColumn = c.column + c.columnSpan! - 1
    const lastRow = c.row + c.rowSpan! - 1
    if (lastRow >= g.heights.length || lastColumn >= g.widths.length) return null
    const x = origin.x + g.lefts[c.column]
    const y = origin.y + g.tops[c.row]
    const w = g.lefts[lastColumn] + g.widths[lastColumn] - g.lefts[c.column]
    const h = g.tops[lastRow] + g.heights[lastRow] - g.tops[c.row]
    const handles: Array<{ side: SnapSide; x: number; y: number }> = [
      { side: "left", x, y: y + h / 2 },
      { side: "right", x: x + w, y: y + h / 2 },
      { side: "top", x: x + w / 2, y },
      { side: "bottom", x: x + w / 2, y: y + h },
    ]
    return { tableId: parent.id, id, handles }
  }, [previewMode, selectedObjectIds, screen.objects, layoutScale])

  // The lines of a selected table put together by snapping (Task 8): one
  // right of each column, one below each row, in the canvas's coordinates.
  // Dragged, they set that column's width or row's height.
  const sizeLines = useMemo(() => {
    if (previewMode || selectedObjectIds.length !== 1) return null
    const table = findObjectById(screen.objects, selectedObjectIds[0])
    if (!table || !isSnapTable(table)) return null
    const origin = childOrigin(screen.objects, table.id)
    const g = snapTableGeometry(table, layoutScale)
    const columns = snapColumnsOf(table)
    const rows = snapRowsOf(table)
    const lines: SizeLine[] = [
      ...g.widths.map((w, i) => {
        const x = origin.x + g.lefts[i] + w + (i < g.widths.length - 1 ? g.gap / 2 : 0)
        return { kind: "column" as const, index: i, x1: x, y1: origin.y, x2: x, y2: origin.y + table.height, byHand: typeof columns[i]?.mm === "number" }
      }),
      ...g.heights.map((h, i) => {
        const y = origin.y + g.tops[i] + h + (i < g.heights.length - 1 ? g.gap / 2 : 0)
        return { kind: "row" as const, index: i, x1: origin.x, y1: y, x2: origin.x + table.width, y2: y, byHand: typeof rows[i]?.mm === "number" }
      }),
    ]
    return { tableId: table.id, lines }
  }, [previewMode, selectedObjectIds, screen.objects, layoutScale])

  // The tables on the screen with where their lines go (lib/table.ts
  // tableGeometry), for the overlay.
  const tableLines = useMemo(() => {
    const scale = { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts }
    // `nested`: inside another table - its «+» below shows only near it
    // (lib/table.ts nestedTablesNear).
    const out: Array<{ id: string; lines: TableLines; nested: boolean }> = []
    const walk = (list: ScreenObject[], ox: number, oy: number, inTable: boolean) => {
      for (const obj of list) {
        const x = obj.type === "panel" ? ox : ox + obj.x
        const y = obj.type === "panel" ? oy : oy + obj.y
        // A table put together by snapping draws itself (snap-table-overlay.ts).
        if (isOldTable(obj)) {
          const geometry = tableGeometry(obj, scale)
          out.push({ id: obj.id, nested: inTable, lines: { origin: { x, y }, width: obj.width, height: obj.height, geometry, empty: emptyCells(obj, geometry) } })
        }
        if (obj.children) walk(obj.children, x, y, inTable || isOldTable(obj))
      }
    }
    walk(screen.objects, 0, 0, false)
    return out
  }, [screen.objects, textScale, fonts])

  const tablePluses = useMemo(
    () =>
      JSON.stringify(
        tableLines.map((table) => {
          const place = addRowPlus(table.lines.origin, table.lines.geometry, PLUS / zoom)
          return { table: table.id, x: place.x, y: place.y }
        }),
      ),
    [tableLines, zoom],
  )


  // An object in a table resized by its right or bottom edge: the cells it
  // spans follow the pointer across the column and row lines (the spec:
  // cells merged as in Word). True when it handled the move.
  const spanInTable = useCallback(
    (id: string, handle: string, point: { x: number; y: number }): boolean => {
      const parent = findParentOf(screen.objects, id)?.parent
      if (!isOldTable(parent)) return false
      const lines = tableLines.find((t) => t.id === parent.id)?.lines
      const object = findObjectById(screen.objects, id)
      const cell = object?.properties?.cell as { row: number; column: number; rowSpan?: number; columnSpan?: number } | undefined
      if (!lines || !object || !cell) return true
      const g = lines.geometry
      const columnAt = Math.max(0, g.lefts.filter((left) => lines.origin.x + left <= point.x).length - 1)
      const rowAt = Math.max(0, g.tops.filter((top) => lines.origin.y + top <= point.y).length - 1)
      const right = handle === "ne" || handle === "se" || handle === "baseline-right" || handle === "e"
      const down = handle === "sw" || handle === "se" || handle === "s"
      const next = { ...cell }
      if (right) next.columnSpan = Math.max(1, columnAt - cell.column + 1)
      if (down) next.rowSpan = Math.max(1, rowAt - cell.row + 1)
      if (next.columnSpan === 1) delete next.columnSpan
      if (next.rowSpan === 1) delete next.rowSpan
      if (JSON.stringify(next) !== JSON.stringify(cell)) onUpdateObject(id, { properties: { ...object.properties, cell: next } })
      return true
    },
    [screen.objects, tableLines, onUpdateObject],
  )

  // What a click with a tool means for a table under the pointer: a cell, a
  // new row, or nothing (an occupied cell) - an armed block's too (Task 8).
  const tableDropFor = useCallback(
    (point: { x: number; y: number }): TableDrop | { blocked: true } | undefined => {
      if (previewMode || activeTool === "select" || activeTool === "background") return undefined
      if (isLineType(activeTool)) return undefined
      // A free area open for editing takes what is drawn into it where it is
      // drawn - even in a table's cell, which would otherwise count as taken.
      if (editingContainer?.type === "free") return undefined
      return tableDropAt(
        screen.objects,
        point,
        { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts },
        4 / zoom,
        PLUS / zoom,
      )
    },
    [previewMode, activeTool, screen.objects, textScale, fonts, zoom, editingContainer?.type],
  )

  const [hoveredSvgButtonId, setHoveredSvgButtonId] = useState<string | null>(null)
  const [activeSnapLines, setActiveSnapLines] = useState<{ type: "vertical" | "horizontal"; position: number }[]>([])
  // Rasterized once in a shared hook rather than here, because the screen
  // thumbnails draw the same artwork and must not each rebuild it. The color
  // is read from the same CSS token the container below paints itself with,
  // so the adornment's off-screen covers vanish into that backdrop exactly.
  const offscreenColor = readOffscreenColor()
  const { image: adornmentImage, svgDoc: adornmentSvgDoc } = useAdornmentImage(adornment, offscreenColor)
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const bdfFontCacheRef = useRef<Map<string, any>>(new Map())

  const [pendingFieldCreation, setPendingFieldCreation] = useState<PendingFieldCreation | null>(null)
  const [showTopicSelectionDialog, setShowTopicSelectionDialog] = useState(false)

  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const SNAP_TOLERANCE = 4

  // Function to detect which SVG button is under the mouse cursor
  const detectSvgButtonAtPoint = useCallback(
    (mouseX: number, mouseY: number): string | null => {
      if (!adornmentSvgDoc || !adornmentDrawingArea) {
        return null
      }

      // adornmentDrawingArea/button rects are always stored native (0deg) -
      // rotate the drawingArea's bounding box around its own center to get
      // the box that actually maps to screenWidth/screenHeight (which are
      // already the post-rotation, possibly swapped values) - same
      // composition draw() uses below for the image itself.
      const quarterTurns = toQuarterTurns(adornmentRotation)
      const nativeCenter = rectCenter(adornmentDrawingArea)
      const rotatedDrawingArea = rotateRectCW(adornmentDrawingArea, nativeCenter, quarterTurns)

      const scaleX = screenWidth / rotatedDrawingArea.width
      const scaleY = screenHeight / rotatedDrawingArea.height
      const offsetX = -rotatedDrawingArea.x * scaleX
      const offsetY = -rotatedDrawingArea.y * scaleY

      // Convert canvas coordinates to SVG coordinates, then undo the
      // rotation to land back in the same native space the button rects
      // themselves (read from the SVG DOM below) are still defined in.
      const rotatedSvgX = (mouseX - offsetX) / scaleX
      const rotatedSvgY = (mouseY - offsetY) / scaleY
      const { x: svgX, y: svgY } = rotatePointCW({ x: rotatedSvgX, y: rotatedSvgY }, nativeCenter, -quarterTurns)

      // Check all button elements to see if the point is inside. Handles
      // <rect> (original) and <path> (added 2026-08-11 - the M5 Dial's
      // Rotate Left/Right buttons are curved-arrow paths, not rects, and
      // querySelectorAll('rect[id^="button"]') silently skipped them
      // entirely: clicking them on the canvas did nothing, even though the
      // exact same ids worked fine in the (since-deleted, 2026-08-16)
      // Project Settings > Hardware Buttons page, which rendered the real
      // SVG DOM and got native browser hit-testing for free regardless of
      // shape - only this hand-rolled canvas hit-test needed fixing).
      // <circle>/<ellipse>/<polygon> etc. still silently no-op, same as
      // before this fix, if a future DDF ever uses one - not needed by any
      // shipped device today.
      const buttonElements = adornmentSvgDoc.querySelectorAll('[id^="button"]')
      const ctx = canvasRef.current?.getContext("2d")

      for (const element of buttonElements) {
        const id = element.getAttribute("id")
        if (!id || !id.startsWith("button")) continue

        const tagName = element.tagName.toLowerCase()
        if (tagName !== "rect" && tagName !== "path") continue

        // testX/testY need to end up in this element's own *local*
        // coordinate space (what its x/y/width/height or d actually
        // describes), which is only the same as svgX/svgY when nothing
        // between it and the SVG root carries a transform. That's true for
        // a lone <rect> hand-authored at the top level, but not once an
        // author groups/moves/scales in Inkscape - which bakes a
        // transform="matrix(...)" onto the wrapping <g>, not the shape
        // itself (found live 2026-08-16: the M5 Dial's redrawn rotate-arrow
        // buttons sit inside exactly such a group, silently breaking every
        // click - see localPointForElement's own comment for the fix).
        const { x: testX, y: testY } = localPointForElement(element, svgX, svgY)

        let isInside = false

        if (tagName === "rect") {
          const x = Number.parseFloat(element.getAttribute("x") || "0")
          const y = Number.parseFloat(element.getAttribute("y") || "0")
          const width = Number.parseFloat(element.getAttribute("width") || "0")
          const height = Number.parseFloat(element.getAttribute("height") || "0")
          isInside = testX >= x && testX <= x + width && testY >= y && testY <= y + height
        } else if (ctx) {
          // Path2D + isPointInPath() is a pure geometry query (doesn't
          // require the element to be drawn, or even attached to the live
          // document - adornmentSvgDoc is a detached DOMParser result) -
          // far more robust than hand-rolling point-in-arbitrary-path math
          // for the concentric-arc arrow shapes these buttons actually
          // use. testX/testY are already in the path's own local
          // (untransformed) coordinate space, matching what `d` describes,
          // same as the rect branch above.
          const d = element.getAttribute("d")
          if (d) {
            try {
              isInside = ctx.isPointInPath(new Path2D(d), testX, testY)
            } catch {
              isInside = false
            }
          }
        }

        if (isInside) {
          return id
        }
      }

      return null
    },
    [adornmentSvgDoc, adornmentDrawingArea, screenWidth, screenHeight, adornmentRotation],
  )

  const liveValueTest = useLiveValueTest()
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transformation matrix
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Set up pixel-perfect rendering for the entire canvas
    setupBDFCanvas(ctx)

    // The container already provides the background color

    ctx.save()
    ctx.scale(zoom, zoom)

    const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
    const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
    ctx.translate(screenX, screenY)

    // The screen's own area, once. It used to be filled twice - the second
    // time with a drop shadow under it, from a much older look - so every
    // pixel of the design was painted over a second time for the sake of an
    // effect that has not been wanted for a long time.
    const fence = popupFence({ screenWidth, screenHeight, screenShape })
    const fencePath = () => {
      ctx.beginPath()
      if (fence.shape === "circle") {
        ctx.arc(fence.x + fence.width / 2, fence.y + fence.height / 2, fence.width / 2, 0, Math.PI * 2)
      } else {
        ctx.rect(fence.x, fence.y, fence.width, fence.height)
      }
    }
    const underlay = previewMode ? popupUnderlay : undefined
    if (underlay) {
      // The screen the popup was opened over, as it is, then dimmed outside
      // the fence as an RGB device does; the popup's own ground only inside.
      // Drawn in the popup's theme - one theme per canvas.
      ctx.fillStyle = resolveColor(resolveBackgroundColor(underlay.screen, underlay.masterScreen).color, theme, variant, colorDepth)
      ctx.fillRect(0, 0, screenWidth, screenHeight)
      const underlayPlaceholders = placeholderScope({
        topics,
        liveValues,
        projectName,
        device: { model: deviceModel, id: deviceId },
        separators: numberSeparators,
        combinedTopics,
      })
      sortChildrenByZIndex(mergeMasterAndScreenObjects(underlay.masterObjects, dissolveGroups(underlay.screen.objects))).forEach((obj) => {
        drawObject(ctx, themed(obj), false, false, zoom, underlayPlaceholders)
      })
      ctx.save()
      fencePath()
      ctx.rect(0, 0, screenWidth, screenHeight)
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
      ctx.fill("evenodd")
      fencePath()
      ctx.fillStyle = resolvedBackgroundColor
      ctx.fill()
      ctx.restore()
    } else {
      ctx.fillStyle = resolvedBackgroundColor
      ctx.fillRect(0, 0, screenWidth, screenHeight)
    }

    ctx.strokeStyle = "#999999"
    ctx.lineWidth = 1 / zoom
    ctx.strokeRect(0, 0, screenWidth, screenHeight)

    // Grid color stays purely local/auto - it doesn't inherit (2026-08-16
    // grilling decision) - but its auto-derivation now follows whichever
    // background color is actually in effect, inherited or not, so it still
    // looks sensible against an inherited background.
    const gridColor = screen.gridColor || calculateOptimalGridColor(resolvedBackgroundColor)

    // Grid lines are a design-time alignment aid, not something the real
    // device ever draws - hidden in preview mode so it shows exactly what
    // would appear at runtime.
    if (!previewMode) snapGuides.forEach((guide) => {
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1 / zoom // Ensure line width is exactly 1px regardless of zoom
      ctx.beginPath()

      // Drawn centered exactly ON the raw snap coordinate, NOT offset to a
      // pixel-boundary crisp position - an object border's true outer edge
      // (render-text-box.ts / render-level-indicator.ts, tuned to match the
      // real device pixel-for-pixel) lands exactly at that same raw
      // coordinate. Offsetting the line by +0.5 for crispness (as this used
      // to do) is invisible at 100% zoom but drifts the line up to a full
      // device pixel away from a snapped object's edge at high zoom -
      // reported 2026-07-26 as the object overflowing the grid on top/left
      // and leaving a gap on bottom/right. Matching the border's anchor
      // exactly matters more here than the line's own crispness, which is
      // a minor cosmetic loss for what's purely a reference overlay.
      if (guide.type === "vertical") {
        const x = guide.position
        ctx.moveTo(x, 0)
        ctx.lineTo(x, screenHeight)
      } else {
        const y = guide.position
        ctx.moveTo(0, y)
        ctx.lineTo(screenWidth, y)
      }

      ctx.stroke()
    })

    activeSnapLines.forEach((line) => {
      ctx.strokeStyle = "rgb(var(--canvas-snap-guide))"
      ctx.lineWidth = 1 / zoom // Ensure active snap line width is exactly 1px regardless of zoom
      ctx.beginPath()

      // Same anchor as the persistent grid lines above (no crisp-line
      // offset) - see that block for why.
      if (line.type === "vertical") {
        const x = line.position
        ctx.moveTo(x, 0)
        ctx.lineTo(x, screenHeight)
      } else {
        const y = line.position
        ctx.moveTo(0, y)
        ctx.lineTo(screenWidth, y)
      }

      ctx.stroke()
    })

    // An open live value editor's test value goes in for its source
    // (lib/live-value-test.ts), and the combined topics are computed from it.
    const placeholders = placeholderScope({
      topics,
      liveValues,
      projectName,
      device: { model: deviceModel, id: deviceId },
      separators: numberSeparators,
      combinedTopics,
      test: liveValueTest,
    })

    // Draw in zIndex order (frontmost last) - matches firmware's
    // ScreenRenderer, which sorts top-level objects by zIndex the same way
    // it already sorts every nested children[] list, and matches
    // findObjectAtPoint's hit-testing, which was already zIndex-aware.
    // Array position in screen.objects is otherwise insignificant now.
    sortChildrenByZIndex(mergeMasterAndScreenObjects(masterObjects, screen.objects)).forEach((obj) => {
      const isSelected = !previewMode && selectedObjectIds.includes(obj.id)
      const isHovered = !previewMode && obj.id === hoveredObjectId && !isSelected
      drawObject(ctx, themed(obj), isSelected, isHovered, zoom, placeholders)
    })

    // Under a master's navigator nothing should be put by accident: its strip
    // is hatched on every screen using that master, while editing
    // (docs/2026-10-08-navigator.md decision 11).
    if (!previewMode && !screen.isMaster) {
      const navigator = (masterObjects ?? []).find((o) => o.type === "navigator")
      if (navigator) drawHatch(ctx, navigator)
    }

    // Inside a group, the rest of the screen steps back: a veil in the
    // screen's own colour over everything, the group drawn again on top of
    // it, and a dashed violet frame - the same colour a switcher's open
    // panel is framed in. What is behind the veil does not take clicks
    // either (interactionObjects holds the group's objects only). Not for a
    // table: it shows itself by its strong lines, and the frame around a
    // block's table read as a second, larger selection (reported 2026-10-03).
    if (editingGroup && editingGroup.type !== TABLE_TYPE) {
      ctx.save()
      ctx.globalAlpha = 0.65
      ctx.fillStyle = resolvedBackgroundColor
      ctx.fillRect(0, 0, screenWidth, screenHeight)
      ctx.restore()
      ctx.save()
      ctx.translate(editingOrigin.x - editingGroup.x, editingOrigin.y - editingGroup.y)
      drawObject(ctx, themed(editingGroup), false, false, zoom, placeholders)
      ctx.restore()
      ctx.save()
      ctx.strokeStyle = EDITING_COLOR
      ctx.lineWidth = 1.5 / zoom
      ctx.setLineDash([5 / zoom, 3 / zoom])
      ctx.strokeRect(editingOrigin.x - 2 / zoom, editingOrigin.y - 2 / zoom, editingGroup.width + 4 / zoom, editingGroup.height + 4 / zoom)
      ctx.setLineDash([])
      ctx.restore()
    }

    // A popup is designed inside its fence (lib/popup.ts): what lies outside
    // steps back under a veil in the screen's own colour, as around a group
    // being edited, and the fence is outlined in the same violet. Objects out
    // there stay drawn and editable - keeping inside is the designer's care.
    // Not in the preview, which shows what the device does.
    if (!previewMode && isPopup(screen)) {
      ctx.save()
      fencePath()
      ctx.rect(0, 0, screenWidth, screenHeight)
      ctx.globalAlpha = 0.65
      ctx.fillStyle = resolvedBackgroundColor
      ctx.fill("evenodd")
      ctx.restore()
      ctx.save()
      fencePath()
      ctx.strokeStyle = EDITING_COLOR
      ctx.lineWidth = 1.5 / zoom
      ctx.stroke()
      ctx.restore()
    }

    // The close button the device draws over the popup's objects, where it
    // draws it: while editing, so nothing is put under it, and in the preview.
    const closeBadge = isPopup(screen) && (!previewMode || underlay) ? popupCloseBadge(fence, popupCloseRadius) : undefined
    if (closeBadge) {
      const { cx, cy, radius } = closeBadge
      const arm = Math.floor((radius * 2) / 5)
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = POPUP_CLOSE_DISC
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy - arm)
      ctx.lineTo(cx + arm, cy + arm)
      ctx.moveTo(cx - arm, cy + arm)
      ctx.lineTo(cx + arm, cy - arm)
      ctx.strokeStyle = POPUP_CLOSE_CROSS
      ctx.lineWidth = 2 * Math.max(1, Math.floor(radius / 10)) + 1
      ctx.lineCap = "round"
      ctx.stroke()
      ctx.restore()
    }

    // Hardware buttons are now drawn as part of the adornment SVG

    // Draw adornment if present (after the drawing area) - this is also what
    // hides the off-screen corners a round device never shows, since the
    // artwork's own id^="offscreen" covers ride along with it. Hiding the
    // adornment therefore honestly exposes the raw framebuffer again,
    // corners and all.
    if (showAdornment && adornmentImage && adornmentDrawingArea) {
      ctx.save()
      try {
        // Leaves the transform applied on purpose - the hover-highlight rect
        // below uses native button coordinates and only lines up while it's
        // still in effect. See applyAdornmentTransform's own comment.
        applyAdornmentTransform(ctx, adornmentDrawingArea, adornmentRotation, screenWidth, screenHeight)

        // Draw the entire SVG (it will be scaled and positioned so that screen element aligns with project bounds)
        ctx.drawImage(adornmentImage, 0, 0)

        // Belegt-status fill (gray/yellow/red - unbelegt/vererbt/lokal
        // definiert, see lib/hardware-button-actions.ts) for every hardware
        // button on the currently edited screen - a design-time aid, so
        // hidden in preview mode same as the grid lines above, which show
        // exactly what the real device would (2026-08-16, replaces the old
        // Project Settings > Hardware Buttons diagram, deleted the same
        // day).
        if (!previewMode && adornmentSvgDoc) {
          adornmentSvgDoc.querySelectorAll('[id^="button"]').forEach((element) => {
            const id = element.getAttribute("id")
            if (!id) return
            const { source } = resolveButtonAction(screen, masterScreen, id)
            fillButtonElement(ctx, element, BUTTON_STATUS_COLOR[source])
          })
        }

        if (!previewMode && hoveredSvgButtonId && adornmentSvgDoc) {
          const buttonElement = adornmentSvgDoc.getElementById(hoveredSvgButtonId)
          if (buttonElement) {
            ctx.save()
            ctx.globalAlpha = 0.35
            fillButtonElement(ctx, buttonElement, "#87CEEB") // Light blue
            ctx.restore()
          }
        }
      } catch (error) {
        console.error("Error rendering adornment:", error)
      }
      ctx.restore()
    }

    if (dragState?.mode === "selection-rectangle" && dragState.selectionRect) {
      const { x, y, width, height } = dragState.selectionRect
      drawCreationPreviewRect(ctx, x, y, width, height, zoom)
    }

    // Every table's lines (components/canvas/table-overlay.ts); the active
    // one's strong. While something is being placed - a tool or a block
    // armed, objects dragged - every table shows its «+»: in each empty
    // cell, and below it for a new row (Checkpoint C).
    if (!previewMode) {
      const inserting =
        dragState?.mode === "drag" || (!dragState && activeTool !== "select" && activeTool !== "background" && !isLineType(activeTool))
      for (const table of tableLines) {
        const active = activeContainerIds.includes(table.id)
        drawTableLines(ctx, table.lines, active, LAYOUT_HINT_COLOR, zoom)
        if (inserting) drawInsertPluses(ctx, table.lines, LAYOUT_HINT_COLOR, zoom, !table.nested || nearTables.includes(table.id))
        else if (active && !dragState && (!handlesOnlyNear(table) || nearHandles.includes(table.id))) {
          drawTableHandles(ctx, table.lines, LAYOUT_HINT_COLOR, zoom)
          const chosen = chosenTableColumn && chosenTableColumn.tableId === table.id ? chosenTableColumn.index : null
          drawColumnStrip(ctx, table.lines, chosen, LAYOUT_HINT_COLOR, zoom)
        }
      }
      // The empty cell picked, outlined (docs/2026-10-03-table-editing.md).
      if (chosenCell && selectedObjectIds.length === 0) {
        const table = tableLines.find((t) => t.id === chosenCell.tableId)
        const g = table?.lines.geometry
        const { row, column } = chosenCell
        if (table && g && row < g.heights.length && column < g.widths.length) {
          ctx.save()
          ctx.strokeStyle = LAYOUT_HINT_COLOR
          ctx.lineWidth = 2 / zoom
          ctx.strokeRect(table.lines.origin.x + g.lefts[column], table.lines.origin.y + g.tops[row], g.widths[column], g.heights[row])
          ctx.restore()
        }
      }
      // The table's handle, on the innermost table under the pointer.
      if (handleTable && activeTool === "select" && !dragState) {
        const table = tableLines.find((t) => t.id === handleTable)
        if (table) drawTableMoveHandle(ctx, table.lines, LAYOUT_HINT_COLOR, zoom)
      }
      if (columnDraft) {
        ctx.save()
        ctx.strokeStyle = LAYOUT_HINT_COLOR
        ctx.lineWidth = 2 / zoom
        ctx.beginPath()
        // Down every row (a 40 px stub at the top before Checkpoint C).
        ctx.moveTo(columnDraft.x, columnDraft.y)
        ctx.lineTo(columnDraft.x, columnDraft.bottom)
        ctx.stroke()
        ctx.restore()
        drawShareLabel(ctx, columnDraft.x, columnDraft.y, columnDraft.label, LAYOUT_HINT_COLOR, zoom)
      }
    }

    for (const id of activeContainerIds) {
      // A table shows itself by its lines, above.
      if (tableLines.some((t) => t.id === id)) continue
      const container = findObjectById(screen.objects, id)
      if (!container) continue
      const origin = childOrigin(screen.objects, id)
      // A table put together by snapping: its cells, dashed, while it is
      // selected or open (docs/2026-10-09-snap-tables.md).
      if (isSnapTable(container)) {
        if (!previewMode) drawSnapTableCells(ctx, origin, container, snapTableGeometry(container, layoutScale), LAYOUT_HINT_COLOR, zoom)
        continue
      }
      const edge = { x: origin.x, y: origin.y, width: container.width, height: container.height }
      ctx.save()
      ctx.strokeStyle = LAYOUT_HINT_COLOR
      ctx.fillStyle = LAYOUT_HINT_COLOR
      // The places it gave its objects, faintly, so its columns, rows and
      // gaps show; then its own edge.
      ctx.globalAlpha = 0.12
      for (const child of container.children ?? []) {
        ctx.fillRect(origin.x + child.x, origin.y + child.y, child.width, child.height)
      }
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([3 / zoom, 3 / zoom])
      ctx.strokeRect(edge.x, edge.y, edge.width, edge.height)
      ctx.setLineDash([])
      ctx.restore()
    }

    if (snapChip && dragState?.mode !== "drag") drawSnapChip(ctx, snapChip.at, snapChip.text, LAYOUT_HINT_COLOR, zoom)
    if (spanHandles && !dragState) drawSpanHandles(ctx, spanHandles.handles, LAYOUT_HINT_COLOR, zoom)
    if (sizeLines && !dragState) drawSizeLines(ctx, sizeLines.lines, LAYOUT_HINT_COLOR, zoom)
    if (lineLabel) drawSnapChip(ctx, { x: lineLabel.x + 10 / zoom, y: lineLabel.y - 4 / zoom }, lineLabel.text, LAYOUT_HINT_COLOR, zoom)
    // An object carried out of a table: its outline at the pointer.
    if (outDrag && dragState?.mode === "drag") drawCreationPreviewRect(ctx, outDrag.rect.x, outDrag.rect.y, outDrag.rect.width, outDrag.rect.height, zoom)
    if (snapDrop && (dragState?.mode === "drag" || dragState?.mode === "create"))
      drawSnapDrop(ctx, snapDrop, outDrag && dragState?.mode === "drag" ? outDrag.space : drawSpace.objects, layoutScale, LAYOUT_HINT_COLOR, zoom)

    // A table's drop: the empty cell lit up, or the row line drawn thick.
    if (tableDrop && (!dragState || dragState.mode === "drag")) {
      ctx.save()
      ctx.strokeStyle = LAYOUT_HINT_COLOR
      ctx.fillStyle = LAYOUT_HINT_COLOR
      if (tableDrop.rect) {
        const { x, y, width, height } = tableDrop.rect
        ctx.globalAlpha = 0.18
        ctx.fillRect(x, y, width, height)
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.5 / zoom
        ctx.strokeRect(x, y, width, height)
      } else if (tableDrop.line) {
        ctx.lineWidth = 3 / zoom
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(tableDrop.line.x1, tableDrop.line.y1)
        ctx.lineTo(tableDrop.line.x2, tableDrop.line.y2)
        ctx.stroke()
      }
      ctx.restore()
    }

    if (dragState?.mode === "create" && dragState.creatingType && !tablePlacementRef.current) {
      const { x, y, width, height } = dragState.startObjectPos
      if (width !== 0 || height !== 0) {
        if (dragState.creatingType && isLineType(dragState.creatingType)) {
          drawCreationPreviewLine(ctx, dragState.startPos.x, dragState.startPos.y, dragState.startPos.x + width, dragState.startPos.y + height, zoom)
        } else if (Math.abs(width) > 0 && Math.abs(height) > 0) {
          if (isSquareType(dragState.creatingType)) {
            // Square-constrained - preview the actual square
            // that will be created (still meaningfully different
            // information from the raw drag rectangle), not just the drag
            // bounds themselves.
            const size = Math.max(Math.abs(width), Math.abs(height))
            const squareX = width < 0 ? x - size + Math.abs(width) : x
            const squareY = height < 0 ? y - size + Math.abs(height) : y
            drawCreationPreviewRect(ctx, squareX, squareY, size, size, zoom)
          } else {
            drawCreationPreviewRect(ctx, x, y, width, height, zoom)
          }
        }
      }
    }

    if (polylineDraft !== null) {
      for (let i = 0; i < polylineDraft.length - 1; i++) {
        drawCreationPreviewLine(ctx, polylineDraft[i].x, polylineDraft[i].y, polylineDraft[i + 1].x, polylineDraft[i + 1].y, zoom)
      }
      const last = polylineDraft[polylineDraft.length - 1]
      if (polylineCursor) {
        drawCreationPreviewLine(ctx, last.x, last.y, polylineCursor.x, polylineCursor.y, zoom)
      }
      const markerRadius = 3 / zoom
      ctx.fillStyle = CREATION_PREVIEW_COLOR
      polylineDraft.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, markerRadius, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    ctx.restore()
  }, [
    screen,
    masterObjects,
    masterScreen,
    navigatorScroll,
    resolvedBackgroundColor,
    selectedObjectIds,
    hoveredObjectId,
    tableDrop,
    nearTables,
    nearHandles,
    handleTable,
    activeTool,
    columnDraft,
    chosenTableColumn,
    chosenCell,
    activeContainerIds,
    tableLines,
    snapChip,
    spanHandles,
    sizeLines,
    lineLabel,
    snapDrop,
    outDrag,
    interactionObjects,
    drawSpace,
    layoutScale,
    snapGuides,
    activeSnapLines,
    zoom,
    offset,
    dragState,
    fonts,
    hardwareButtons,
    screenWidth,
    screenHeight,
    adornmentImage,
    adornmentSvgDoc,
    showAdornment,
    adornmentDrawingArea,
    adornmentRotation,
    screenShape,
    popupCloseRadius,
    popupUnderlay,
    hoveredSvgButtonId, // Hover state for redraw
    colorDepth,
    theme,
    variant,
    previewMode,
    pressedButtonId,
    pressedSwitch,
    polylineDraft,
    polylineCursor,
    // What the values come from - listed so a changed value redraws on its
    // own account, not because some other entry here changes identity on
    // every render of the editor (which is what redraws it today too).
    topics,
    liveValues,
    askedValues,
    editingContainerId,
    liveValueTest,
    combinedTopics,
  ])

  // The canvas follows its container's size, and only a change of size sets
  // it: setting canvas.width allocates the buffer anew and clears it. Until
  // 2026-10-09 this hung on `draw`, which changes on every render of the
  // editor, so every render resized the canvas and drew it a second time -
  // half of what the live preview spent per value (#58).
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      if (canvas.width === Math.trunc(rect.width) && canvas.height === Math.trunc(rect.height)) return
      canvas.width = rect.width
      canvas.height = rect.height
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      drawRef.current()
    }
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)
    resizeCanvas()
    return () => observer.disconnect()
  }, [])

  // Whatever draw() reads is in its dependencies, so a new draw is a picture
  // to paint - once. A hovered hardware button is among them; it used to
  // have an effect of its own besides, which drew every hover twice.
  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    // Clear the entire icon cache when assets change
    // This ensures that when asset colors are modified, icons will reload with the new colors
    iconImageCacheRef.current.clear()
    // </CHANGE> Removed debug log
    requestAnimationFrame(() => {
      draw()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectAssets])
  // </CHANGE>

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Prevent default browser zoom
      e.preventDefault()

      // Only allow integer zoom levels: 1x, 2x, 3x, 4x, 5x for pixel-perfect rendering
      const allowedZoomLevels = [1, 2, 3, 4, 5]
      const currentZoomIndex = allowedZoomLevels.findIndex(level => Math.abs(level - zoom) < 0.01)
      
      // Determine zoom direction
      const zoomIn = e.deltaY < 0
      let newZoom = zoom
      
      if (zoomIn && currentZoomIndex < allowedZoomLevels.length - 1) {
        newZoom = allowedZoomLevels[currentZoomIndex + 1]
      } else if (!zoomIn && currentZoomIndex > 0) {
        newZoom = allowedZoomLevels[currentZoomIndex - 1]
      } else if (currentZoomIndex === -1) {
        // If current zoom is not in the list, snap to nearest
        newZoom = allowedZoomLevels.reduce((prev, curr) => 
          Math.abs(curr - zoom) < Math.abs(prev - zoom) ? curr : prev
        )
      }

      if (newZoom === zoom) return

      // Only change zoom, same as the zoom slider - offset stays exactly as
      // it is. The screen's on-screen position is already recomputed from
      // (zoom, offset, container size) on every render (see screenX/screenY
      // below and in the draw loop), so leaving offset untouched keeps the
      // artboard centered (plus whatever pan the user already applied) at
      // the new zoom level automatically. This used to also try to keep the
      // point under the cursor fixed by solving for a new offset, but that
      // computation had a real bug and made the artboard jump around the
      // viewport on every wheel tick - reported directly against the
      // slider's (correct) behavior as the reference.
      onZoomChange(newZoom)
    }

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [zoom, onZoomChange])

  const calculateSnap = useCallback(
    (
      obj: { x: number; y: number; width: number; height: number },
      otherObjects: ScreenObject[],
      isResize = false,
    ): SnapResult => {
      let snapX = obj.x
      let snapY = obj.y
      const snapWidth = obj.width
      const snapHeight = obj.height
      const snapLines: { type: "vertical" | "horizontal"; position: number }[] = []

      snapGuides.forEach((guide) => {
        if (guide.type === "vertical") {
          // Snap to vertical guide lines
          if (Math.abs(obj.x - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position)
            snapLines.push({ type: "vertical", position: guide.position })
          }
          // Snap right edge to vertical guide
          else if (Math.abs(obj.x + obj.width - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position - obj.width)
            snapLines.push({ type: "vertical", position: guide.position })
          }
          // Snap center to vertical guide
          else if (Math.abs(obj.x + obj.width / 2 - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position - obj.width / 2)
            snapLines.push({ type: "vertical", position: guide.position })
          }
        } else {
          // Snap to horizontal guide lines
          if (Math.abs(obj.y - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
          // Snap bottom edge to horizontal guide
          else if (Math.abs(obj.y + obj.height - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position - obj.height)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
          // Snap center to horizontal guide
          else if (Math.abs(obj.y + obj.height / 2 - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position - obj.height / 2)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
        }
      })

      return {
        x: snapX,
        y: snapY,
        snapLines,
      }
    },
    [SNAP_TOLERANCE, snapGuides],
  )

  const getPreviewValueFromTopic = (topicName: string | undefined): string =>
    liveValues ? getLiveValueFromTopic(topicName, liveValues) : getSharedPreviewValueFromTopic(topicName, topics)
  // The same, for a handler that outlives a render: which panel a switcher
  // shows must follow the values as they are now.
  const previewValueRef = useRef(getPreviewValueFromTopic)
  previewValueRef.current = getPreviewValueFromTopic

  // What a finger asked for here and nobody has answered yet, keyed by the
  // topic the request was about. Kept apart from the reported values on
  // purpose: a request must never be drawn as a measurement
  // (docs/2026-09-17-settable-level.md, decision 6c - the finger moves the
  // marker, not the fill).
  const getAskedValueFromTopic = (topicName: string | undefined): string =>
    (topicName && askedValues ? askedValues[topicName] : undefined) ?? ""

  const calculateLevelIndicatorFill = (value: number, calibrationPoints: any[]): number => {
    if (!calibrationPoints || calibrationPoints.length === 0) {
      return 0
    }

    // Sort calibration points by value
    const sortedPoints = [...calibrationPoints].sort((a, b) => a.value - b.value)

    // If value is below the lowest point, return 0
    if (value <= sortedPoints[0].value) {
      return sortedPoints[0].barSizePercent
    }

    // If value is above the highest point, return 100
    if (value >= sortedPoints[sortedPoints.length - 1].value) {
      return sortedPoints[sortedPoints.length - 1].barSizePercent
    }

    // Find the two points to interpolate between
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const point1 = sortedPoints[i]
      const point2 = sortedPoints[i + 1]

      if (value >= point1.value && value <= point2.value) {
        // Linear interpolation
        const ratio = (value - point1.value) / (point2.value - point1.value)
        return point1.barSizePercent + ratio * (point2.barSizePercent - point1.barSizePercent)
      }
    }

    return 0
  }

  const drawObject = (
    ctx: CanvasRenderingContext2D,
    obj: ScreenObject,
    isSelected: boolean,
    isHovered: boolean,
    zoom: number,
    placeholders?: PlaceholderScope,
  ) => {
    // Use extracted renderers for each object type
    switch (obj.type) {
      case "box":
        renderBox({ ctx, obj, zoom, colorDepth })
        break

      // On the master the first listed screen's entry is highlighted, on a
      // screen its own (docs/2026-10-08-navigator.md).
      case "navigator":
        renderNavigator(ctx, obj, {
          fonts,
          projectAssets,
          topics,
          colorDepth,
          bdfFontCache: bdfFontCacheRef.current,
          iconImageCache: iconImageCacheRef.current,
          getPreviewValueFromTopic,
          placeholders,
          requestRedraw: draw,
          navigator: {
            screens: projectScreens ?? [screen],
            activeScreenId: screen.isMaster ? navigatorScreens(projectScreens ?? [])[0]?.id : screen.id,
            scroll: previewMode ? navigatorScroll : undefined,
          },
        })
        break

      case "text":
        // Its baseline handles are its own renderer's; a text in a table put
        // together by snapping has none - its cell decides its size.
        renderLabel(ctx, obj, fonts, isSelected && !sizedBySnapTable.has(obj.id), zoom, bdfFontCacheRef.current, placeholders, colorDepth, draw)
        break

      case "live-icon":
        renderMqttField({
          ctx,
          obj,
          fonts,
          projectAssets,
          topics,
          isSelected,
          zoom,
          bdfFontCache: bdfFontCacheRef.current,
          iconImageCache: iconImageCacheRef.current,
          getPreviewValueFromTopic,
          requestRedraw: draw,
          colorDepth,
        })
        break

      case "line":
        renderLine({ ctx, obj, zoom, colorDepth })
        break

      case "live-line":
        renderMqttDataLine({ ctx, obj, zoom, colorDepth, topics, getPreviewValueFromTopic })
        break

      case "icon":
        renderIcon({
          ctx,
          // A live icon shows the icon its live value gives (lib/object-text.ts).
          obj: iconAsDrawn(obj, placeholders),
          projectAssets,
          iconImageCache: iconImageCacheRef.current,
          requestRedraw: draw,
        })
        break

      case "gauge":

      case "dial":
        renderArcLevel({
          ctx,
          obj,
          fonts,
          topics,
          zoom,
          bdfFontCache: bdfFontCacheRef.current,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          colorDepth,
          screenBackgroundColor: resolvedBackgroundColor,
          requestRedraw: draw,
        })
        break

      case "bar":

      case "slider":
        renderLevelIndicator({
          ctx,
          obj,
          fonts,
          topics,
          zoom,
          bdfFontCache: bdfFontCacheRef.current,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          colorDepth,
          screenBackgroundColor: resolvedBackgroundColor,
          requestRedraw: draw,
        })
        break

      case "button":
        renderSoftwareButton({
          ctx,
          obj,
          fonts,
          projectAssets,
          isSelected,
          zoom,
          iconImageCache: iconImageCacheRef.current,
          bdfFontCache: bdfFontCacheRef.current,
          requestRedraw: draw,
          colorDepth,
          // What it stands on: the tonal tint is mixed with it, as the
          // slider's track is.
          screenBackgroundColor: resolvedBackgroundColor,
          pressed: previewMode && pressedButtonId === obj.id,
        })
        break

      case "switch":

      case "button-group":
        renderSwitch({
          ctx,
          obj,
          fonts,
          projectAssets,
          isSelected,
          zoom,
          iconImageCache: iconImageCacheRef.current,
          bdfFontCache: bdfFontCacheRef.current,
          getPreviewValueFromTopic,
          getAskedValueFromTopic,
          requestRedraw: draw,
          colorDepth,
          screenBackgroundColor: resolvedBackgroundColor,
          pressedStateIndex: previewMode && pressedSwitch?.id === obj.id ? pressedSwitch.index : -1,
        })
        break

      case "switcher": {
        // While this specific tab-control has a panel open for editing
        // (editingContainerId, set by clicking a tab in its tab strip - or a
        // group inside one of its panels), render exactly that panel
        // regardless of the condition - matches the earlier design: you pin
        // a tab to edit it, overriding the normal preview-driven selection.
        // Otherwise fall back to the same condition-based selection the
        // read-only paths (thumbnails, HIL) already use: evaluate the
        // tab-control's condition against the current preview value, render
        // only the first matching panel.
        const pinnedPanel = obj.children?.find((p) => editingChain.has(p.id)) ?? null
        const isEditingThisTabControl = pinnedPanel !== null
        const activePanel = pinnedPanel ?? getActivePanel(obj, getPreviewValueFromTopic)

        // Tab strip: one clickable label per panel, drawn above the box,
        // visible only once this tab-control (or something inside its
        // open panel) is part of the current selection - see
        // drawTabStrip() and hit-testing in handleMouseDown.
        const showTabStrip = isSelected || isEditingThisTabControl
        if (showTabStrip) {
          drawTabStrip(ctx, obj, activePanel?.id ?? null, isEditingThisTabControl, zoom)
        }

        // A dashed violet outline around the whole box while a panel is
        // pinned for editing - the visual answer to "which level am I
        // working on right now": no outline (or the normal blue selection
        // handles) means you'd move/resize the tab-control itself; this
        // outline means clicks land on the open panel's children instead.
        if (isEditingThisTabControl) {
          ctx.save()
          ctx.strokeStyle = EDITING_COLOR
          ctx.lineWidth = 1.5 / zoom
          ctx.setLineDash([5 / zoom, 3 / zoom])
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
          ctx.setLineDash([])
          ctx.restore()
        }

        if (!activePanel) break
        const children = sortChildrenByZIndex(activePanel.children ?? [])
        ctx.save()
        ctx.translate(obj.x, obj.y)
        for (const child of children) {
          const childSelected = selectedObjectIds.includes(child.id)
          const childHovered = child.id === hoveredObjectId && !childSelected
          drawObject(ctx, child, childSelected, childHovered, zoom, placeholders)
        }
        ctx.restore()
        break
      }

      case "panel":
        // Only ever meaningful as a tab-control's own child, handled
        // above - a stray top-level "panel" draws nothing, matching
        // every other render path's identical no-op.
        break

      case "group":
      // Layout containers (lib/layout.ts) draw as a group does.
      case "table":
      case "free": {
        // Nothing of its own (lib/object-groups.ts) but a free area's
        // background: its children, relative to it. Selected or hovered one
        // by one only while the group is open - otherwise their ids are
        // never in the selection anyway.
        const background = obj.type === "free" ? freeBackground(obj) : undefined
        if (background) drawObject(ctx, background, false, false, zoom, placeholders)
        ctx.save()
        ctx.translate(obj.x, obj.y)
        for (const child of sortChildrenByZIndex(obj.children ?? [])) {
          const childSelected = !previewMode && selectedObjectIds.includes(child.id)
          const childHovered = !previewMode && child.id === hoveredObjectId && !childSelected
          drawObject(ctx, child, childSelected, childHovered, zoom, placeholders)
        }
        ctx.restore()
        break
      }
    }

    // Warn when this object's type isn't rendered by the loaded device's
    // firmware (see supportedObjectTypes) - it will be invisible on the real
    // device. This is an editing-time affordance, not something the real
    // device shows, so it's suppressed in preview mode.
    // Not on a group or a layout container: no device draws one, and none
    // has to - the export hands over the objects inside it
    // (lib/object-groups.ts, lib/layout.ts).
    if (
      !previewMode &&
      supportedObjectTypes !== undefined &&
      obj.type !== "group" &&
      !isLayoutOnlyType(obj.type) &&
      !supportedObjectTypes.includes(obj.type)
    ) {
      ctx.save()
      ctx.strokeStyle = "#f59e0b"
      ctx.lineWidth = 1.5 / zoom
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.strokeRect(Math.round(obj.x) - 1, Math.round(obj.y) - 1, Math.round(obj.width) + 2, Math.round(obj.height) + 2)
      ctx.setLineDash([])

      const badgeSize = 14 / zoom
      const badgeX = obj.x + obj.width - badgeSize / 2
      const badgeY = obj.y - badgeSize / 2
      ctx.fillStyle = "#f59e0b"
      ctx.beginPath()
      ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = `bold ${badgeSize * 0.9}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("!", badgeX, badgeY + badgeSize * 0.05)
      ctx.restore()
    }

    // Draw hover state (moved outside of renderers for consistency)
    if (isHovered) {
      if (isLineType(obj.type)) {
        ctx.strokeStyle = "rgba(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = Math.max(3 / zoom, (obj.properties.strokeWidth || 1) / zoom + 2 / zoom)

        if (obj.properties.strokeStyle === "dashed") {
          ctx.setLineDash([8 / zoom, 4 / zoom])
        } else if (obj.properties.strokeStyle === "dotted") {
          ctx.setLineDash([2 / zoom, 4 / zoom])
        } else {
          ctx.setLineDash([])
        }

        ctx.beginPath()
        ctx.moveTo(obj.x, obj.y)
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = "rgb(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = 1 / zoom
        
        // For text objects, use the calculated bounding box height instead of obj.height
        let boundingBoxHeight = obj.height
          if (obj.type === "text") {
            const fontId = obj.properties.fontId
            if (fontId) {
              const font = fonts.find((f) => f.id === fontId)
              if (font) {
                // Use font object's size property (ascent + descent)
                boundingBoxHeight = getFontHeight(font)
              }
            }
          }
        
        ctx.strokeRect(obj.x - 1 / zoom, obj.y - 1 / zoom, obj.width + 2 / zoom, boundingBoxHeight + 2 / zoom)
      }
    }

    // A selected group: a dashed box around what it holds, and no handles -
    // a group is moved, never resized (its size is its objects').
    if (isSelected && obj.type === "group") {
      ctx.save()
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.strokeRect(obj.x - 1 / zoom, obj.y - 1 / zoom, obj.width + 2 / zoom, obj.height + 2 / zoom)
      ctx.setLineDash([])
      ctx.restore()
    }

    // Draw selection handles (moved outside of renderers for consistency).
    // Not on a locked object: the outline says it is selected, and a handle
    // would promise a resize the canvas refuses.
    if (isSelected && !staysPut(obj) && obj.type !== "group" && !sizedBySnapTable.has(obj.id)) {
      if (isLineType(obj.type)) {
        const handleSize = 8 / zoom
        const handles = getLineHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6"
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })
      } else if (obj.type !== "text") {
        // Text objects handle their own baseline handles in their renderers
        const handleSize = 8 / zoom
        const handles = getResizeHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6"
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })

        // The two ends of an arc's scale, on top of the box's own four
        // corners: square for the box, a piece of arc for the angles
        // (docs/2026-09-21-arc-handles.md). Same blue, so only the shape
        // says which is which.
        if (isArcType(obj.type) && selectedObjectIds.length === 1) {
          drawArcHandles(ctx, obj)
        }
      }
    }
  }

  // Old drawObject implementation removed - all rendering logic moved to separate renderer files

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) => {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  // getBaselineY moved to lib/font-utils.ts

  /**
   * A scale end: a dashed line standing radially where the end is, and a
   * small ring segment on it to take hold of
   * (docs/2026-09-21-arc-handles.md).
   *
   * The line is the mark - it says exactly which angle this is, and it is
   * what makes the thing read as a handle at all; a piece of the ring on its
   * own just looked like part of the drawing. The segment is the size of the
   * box's own corner handles, so it is recognisably the same kind of thing,
   * and it sits on the side of the line the ring is closed - which is what
   * keeps the two apart on a full ring.
   *
   * Both end on the circle through the box's corners plus a margin, so the
   * line is the same length at every angle and can never reach a corner
   * handle (ARC_HANDLE_PAST_CORNERS).
   */
  const drawArcHandles = (ctx: CanvasRenderingContext2D, obj: ScreenObject) => {
    const handleSize = 8 / zoom
    const geo = arcHandleGeometry(obj, handleSize)
    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180
    const at = (deg: number, r: number) => ({
      x: geo.cx + Math.cos(rad(deg)) * r,
      y: geo.cy + Math.sin(rad(deg)) * r,
    })

    for (const run of [geo.min, geo.max]) {
      const edge = geo.handleEdge
      const from = at(run.angle, geo.innerEdge)
      const to = at(run.angle, edge)

      ctx.save()
      ctx.setLineDash([3 / zoom, 3 / zoom])
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 1 / zoom
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
      ctx.restore()

      // White underneath, blue on top, in the same order as every other
      // handle on this canvas.
      const sweep = ((((run.to - run.from) % 360) + 360) % 360)
      const drawSegment = (colour: string, width: number) => {
        ctx.strokeStyle = colour
        ctx.lineWidth = width
        ctx.lineCap = "butt"
        ctx.beginPath()
        ctx.arc(geo.cx, geo.cy, edge, rad(run.from), rad(run.from + sweep))
        ctx.stroke()
      }
      drawSegment("#ffffff", handleSize + 2 / zoom)
      drawSegment("#3b82f6", handleSize)
    }
  }

  const getResizeHandles = (obj: ScreenObject, handleSize: number) => {
    const half = handleSize / 2
    const handles = []
    
    // Text objects only get baseline handles, no corner handles
    if (obj.type === "text") {
      const baselineY = getBaselineY(obj, fonts)
      handles.push(
        { x: obj.x - half, y: baselineY - half, handle: "baseline-left" as ResizeHandle },
        { x: obj.x + obj.width - half, y: baselineY - half, handle: "baseline-right" as ResizeHandle }
      )
    } else {
      // All other objects get corner handles
      handles.push(
      { x: obj.x - half, y: obj.y - half, handle: "nw" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y - half, handle: "ne" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y + obj.height - half, handle: "se" as ResizeHandle },
        { x: obj.x - half, y: obj.y + obj.height - half, handle: "sw" as ResizeHandle }
      )
    }
    
    return handles
  }

  const getLineHandles = (obj: ScreenObject, handleSize: number) => {
    const half = handleSize / 2
    return getLinePoints(obj).map((point, index) => ({
      x: point.x - half,
      y: point.y - half,
      handle: index as LineHandle,
    }))
  }

  // Hardware button detection is now done via SVG button elements

  // Distance from (x,y) to the single segment (x1,y1)-(x2,y2) - the same
  // closest-point-on-segment projection the old single-segment isPointOnLine
  // did inline, now shared across every segment of a multi-point line.
  const distanceToSegment = (x: number, y: number, x1: number, y1: number, x2: number, y2: number): number => {
    const A = x - x1
    const B = y - y1
    const C = x2 - x1
    const D = y2 - y1

    const dot = A * C + B * D
    const lenSq = C * C + D * D

    let xx, yy
    if (lenSq === 0) {
      xx = x1
      yy = y1
    } else {
      const param = dot / lenSq
      if (param < 0) {
        xx = x1
        yy = y1
      } else if (param > 1) {
        xx = x2
        yy = y2
      } else {
        xx = x1 + param * C
        yy = y1 + param * D
      }
    }

    const dx = x - xx
    const dy = y - yy
    return Math.sqrt(dx * dx + dy * dy)
  }

  const isPointOnLine = useCallback(
    (lineObj: ScreenObject, x: number, y: number, tolerance = 5): boolean => {
      if (!isLineType(lineObj.type)) return false

      const points = getLinePoints(lineObj)
      const tol = tolerance / zoom
      for (let i = 0; i < points.length - 1; i++) {
        if (distanceToSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y) <= tol) {
          return true
        }
      }
      return false
    },
    [zoom],
  )

  // `skipLocked` for editing: a locked object (the object tree's padlock,
  // ScreenObject.locked) lets a click through to what lies under it. The
  // preview asks without it - locking is about editing, and a locked button
  // is still a button.
  //
  // A group is hit where one of its objects is, not anywhere in its box: a
  // label above a slider leaves room beside the label, and a click there is
  // meant for whatever lies under it. A locked object inside a group lets
  // the click through as it would outside one.
  const hitsObject = useCallback(
    (obj: ScreenObject, x: number, y: number, skipLocked: boolean): boolean => {
      if (skipLocked && obj.locked) return false
      if (obj.type === "group") {
        return (obj.children ?? []).some((child) => hitsObject(child, x - obj.x, y - obj.y, skipLocked))
      }
      if (isLineType(obj.type)) return isPointOnLine(obj, x, y)
      return x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
    },
    [isPointOnLine],
  )

  const findObjectAtPoint = useCallback(
    (x: number, y: number, objects: ScreenObject[], skipLocked = false) => {
      return [...objects].sort((a, b) => b.zIndex - a.zIndex).find((obj) => hitsObject(obj, x, y, skipLocked))
    },
    [hitsObject],
  )

  const findResizeHandle = useCallback(
    (obj: ScreenObject, x: number, y: number): ResizeHandle | null => {
      // A group is as big as what it holds, so it has no handles to take.
      if (obj.type === "group") return null
      const handleSize = 8 / zoom
      const handles = getResizeHandles(obj, handleSize)

      for (const handle of handles) {
        if (x >= handle.x && x <= handle.x + handleSize && y >= handle.y && y <= handle.y + handleSize) {
          return handle.handle
        }
      }

      return null
    },
    [zoom],
  )

  const findLineHandle = useCallback(
    (obj: ScreenObject, x: number, y: number): LineHandle | null => {
      if (!isLineType(obj.type)) return null

      const handleSize = 8 / zoom
      const handles = getLineHandles(obj, handleSize)

      for (const handle of handles) {
        const centerX = handle.x + handleSize / 2
        const centerY = handle.y + handleSize / 2
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
        if (distance <= handleSize / 2) {
          return handle.handle
        }
      }

      return null
    },
    [zoom],
  )

  const getCanvasCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
      const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
      const x = Math.round((clientX - rect.left) / zoom - screenX)
      const y = Math.round((clientY - rect.top) / zoom - screenY)

      return { x, y }
    },
    [zoom, offset, screenWidth, screenHeight, canvasRef],
  )

  // A click beside the open group's objects: out of the group, one level,
  // and the click is taken there - on another object it selects that one,
  // on nothing it selects nothing. As in a drawing program: no second click
  // needed to get out first.
  const leaveGroupAt = useCallback(
    (point: { x: number; y: number }) => {
      if (!editingGroup) return
      const outer = containerOf(screen.objects, editingGroup.id)
      const outerOrigin = childOrigin(screen.objects, outer)
      const outerList = outer
        ? (findObjectById(screen.objects, outer)?.children ?? []).map((c) => translateObject(c, outerOrigin.x, outerOrigin.y))
        : screen.objects
      const hit = findObjectAtPoint(point.x, point.y, outerList, true)
      onSetEditingContainer(outer)
      if (hit) onSelectObject(hit.id)
      else if (outer) onSelectObjects([])
      else onSelectObject(null)
    },
    [editingGroup, screen.objects, findObjectAtPoint, onSetEditingContainer, onSelectObject, onSelectObjects],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only the left button drives selection/tool/drag behavior here -
      // the browser's native contextmenu event (handleContextMenu) is what
      // opens the right-click menu, entirely independently of this
      // handler, so a right-click has no business changing selection at
      // all. Without this check, right-clicking empty space inside a
      // tab-control panel that's open for editing hit the same "empty
      // space inside the panel -> select the container, exit editing"
      // path a left-click uses (see the mode-switch work), so opening the
      // context menu to paste something into that panel first silently
      // kicked you out of it (2026-07-26 finding).
      if (e.button !== 0) {
        return
      }

      const coords = getCanvasCoordinates(e.clientX, e.clientY)

      // Preview mode: the only thing a click can do is trigger a button
      // action, exactly as it would at runtime - no selection, drag,
      // resize, or creation-tool behavior. Checked first and returns
      // unconditionally so nothing below this block ever runs.
      if (previewMode) {
        const clickedSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
        if (clickedSvgButton) {
          const hardwareButton = hardwareButtons.find((button) => button.id === clickedSvgButton)
          const action = hardwareButton ? resolveButtonAction(screen, masterScreen, hardwareButton.id).action : undefined
          if (action) onPreviewButtonAction?.(action)
          return
        }

        // A popup is open: a click on its close button or outside its fence
        // closes it and does nothing else, as a tap does on the device.
        const openFence = popupFence({ screenWidth, screenHeight, screenShape })
        if (
          popupUnderlay &&
          (onCloseBadge(popupCloseBadge(openFence, popupCloseRadius), coords) || !insideFence(openFence, coords))
        ) {
          onClosePopup?.()
          return
        }

        // On the navigator: the press is its own, whatever follows.
        const layout = navigatorLatest.current.layout()
        if (layout && insideStrip(layout, coords)) {
          const scroll = navigatorLatest.current.scroll ?? 0
          navigatorDragRef.current = { layout, start: coords, startScroll: scroll, scroll, moved: false }
          return
        }

        const clickedObject = findPreviewObjectAt(coords.x, coords.y, previewObjects, (switcher) =>
          getActivePanel(switcher, previewValueRef.current),
        )
        if (clickedObject?.type === "button") {
          setPressedButtonId(clickedObject.id)
          const action = clickedObject.properties.action as HardwareButtonAction | undefined
          if (action) onPreviewButtonAction?.(action)
        } else if (isSwitchType(clickedObject?.type)) {
          // Same two steps the firmware takes: work out which state the
          // finger picked, then publish that state's writeValue to the write
          // topic. Nothing is set directly - whether anything comes back is
          // the engine's answer, exactly as a real round trip.
          const activeIndex = getActiveSwitchStateIndex(clickedObject, getPreviewValueFromTopic)
          const index = switchStateIndexForTap(clickedObject, coords.x, activeIndex)
          const state = (clickedObject.properties.states || [])[index]
          const writeTopic = clickedObject.properties.writeTopic
          setPressedSwitch({ id: clickedObject.id, index })
          if (state?.writeValue && writeTopic) {
            onPreviewPublish?.(writeTopic, state.writeValue)
            // What this tap asked the switch to become, so the picture can show
            // it before the installation has answered - the same bookkeeping a
            // dragged level's marker uses.
            if (clickedObject.properties.topic && state.readValue !== undefined) {
              onPreviewAsk?.(clickedObject.properties.topic, state.readValue)
            }
          }
        } else if (clickedObject && isSettableLevel(clickedObject)) {
          // The press already sets the value under the finger - a tap on a
          // bar at three quarters means three quarters - and the drag that
          // may follow keeps setting it. The object owns the gesture from
          // here (decision 8), which in preview only means the canvas does
          // not treat the movement as anything else.
          const value = settableValueAt(clickedObject, coords.x, coords.y)
          levelDragRef.current = { id: clickedObject.id, value, object: clickedObject }
          onPreviewSetLevel?.(clickedObject, value, false)
        }
        return
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey

      // Check for SVG button click first
      const clickedSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
      if (clickedSvgButton) {
        // Find the corresponding hardware button
        const hardwareButton = hardwareButtons.find((button) => button.id === clickedSvgButton)
        if (hardwareButton && onHardwareButtonClick) {
          onHardwareButtonClick(hardwareButton)
          return
        }
      }

      if (activeTool === "icon") {
        if (onIconToolClick) {
          onIconToolClick(coords)
        }
        return
      }

      // Hardware button clicks are now handled via SVG button elements above

      // Tab-strip clicks take priority over normal hit-testing. Only
      // tab-controls that currently show a strip (selected, or already open
      // for editing - see the showTabStrip condition in drawObject) are
      // checked, so this can never intercept a click meant for something else.
      for (const obj of screen.objects) {
        if (obj.type !== "switcher") continue
        if (!(selectedObjectIds.includes(obj.id) || obj.children?.some((p) => editingChain.has(p.id)))) continue
        const tab = hitTestTabStrip(obj, coords.x, coords.y, zoom)
        if (!tab) continue
        if (tab.kind === "add") {
          onAddPanel(obj.id)
        } else if (tab.panelId) {
          onSetEditingContainer(tab.panelId)
          onSelectObject(tab.panelId)
        }
        return
      }

      // The table's handle, as in Word: a click selects the table, a drag
      // moves it - to an empty cell, a row line, a «+» - like any object
      // (docs/2026-10-03-table-editing.md).
      if (activeTool === "select" && !previewMode && handleTable) {
        const table = tableLines.find((t) => t.id === handleTable)
        const object = table ? findObjectById(screen.objects, handleTable) : null
        if (table && object && onTableMoveHandle(table.lines, coords, zoom)) {
          onSelectObject(object.id)
          // The table holding it opened, so the drag finds the table among
          // the objects it works on - as a click into a cell does.
          onSetEditingContainer?.(findParentOf(screen.objects, object.id)?.parent?.id ?? null)
          onSelectCell?.(null)
          setDragState({
            mode: "select",
            objectId: object.id,
            startPos: coords,
            startObjectPos: { x: table.lines.origin.x, y: table.lines.origin.y, width: object.width, height: object.height },
          })
          return
        }
      }

      // A span handle of the object chosen in a table put together by
      // snapping (Task 7): dragged, its span grows or shrinks.
      if (activeTool === "select" && spanHandles) {
        const hit = spanHandles.handles.find((h) => Math.hypot(coords.x - h.x, coords.y - h.y) <= SPAN_HANDLE_HIT / zoom)
        if (hit) {
          spanDragRef.current = { tableId: spanHandles.tableId, id: spanHandles.id, side: hit.side }
          return
        }
      }
      // A column or row line of the selected table (Task 8): dragged, it
      // sets that column's width or row's height.
      if (activeTool === "select" && sizeLines) {
        const line = sizeLineAt(sizeLines.lines, coords, SIZE_LINE_HIT / zoom)
        if (line) {
          lineDragRef.current = { tableId: sizeLines.tableId, kind: line.kind, index: line.index }
          return
        }
      }

      // An active table's handles: a column line to drag, «+» for a row or
      // a column (docs/2026-10-02-layout-tables.md).
      if (activeTool === "select" && !previewMode && onSetTableProperties) {
        for (const table of tableLines) {
          if (!activeContainerIds.includes(table.id)) continue
          if (handlesOnlyNear(table) && !nearTableHandles(table.lines, coords, zoom)) continue
          // The strip above a column: that column's properties.
          const stripColumn = columnStripAt(table.lines, coords, zoom)
          if (stripColumn !== null && onSelectTableColumn) {
            onSelectTableColumn(table.id, stripColumn)
            return
          }
          const handle = tableHandleAt(table.lines, coords, zoom)
          if (!handle) continue
          const tableId = table.id
          const object = findObjectById(screen.objects, tableId)
          const columns = object ? columnsOf(object) : DEFAULT_TABLE_COLUMNS
          const rows = object?.properties?.rows as number | undefined
          if (handle.kind === "insert-row" || handle.kind === "insert-column") {
            onInsertTableLine?.(tableId, handle.kind === "insert-row" ? "row" : "column", handle.index)
          } else if (handle.kind === "add-row") {
            onSetTableProperties(tableId, { rows: Math.max(rows ?? 0, table.lines.geometry.heights.length) + 1 })
          } else if (handle.kind === "add-column") {
            onSetTableProperties(tableId, { columns: [...columns, { width: "auto" }] })
          } else {
            columnDragRef.current = { tableId: table.id, index: handle.index, startX: coords.x, columns, widths: table.lines.geometry.widths }
          }
          return
        }
      }

      if ((activeTool === "line" || activeTool === "live-line") && polylineDraft !== null) {
        // Continuing an already-started segmented line - every click after
        // the first adds a vertex here instead of starting a new drag; a
        // real single-drag line (below, still the first click of a fresh
        // line) never reaches this branch since polylineDraft starts null.
        const last = polylineDraft[polylineDraft.length - 1]
        if (Math.hypot(coords.x - last.x, coords.y - last.y) > 2 / zoom) {
          setPolylineDraft([...polylineDraft, coords])
        }
        return
      }

      if (activeTool !== "select") {
        // Over a table: a click into an empty cell or on a row line places it
        // there; an occupied cell takes nothing.
        const drop = tableDropFor(coords)
        if (drop && "blocked" in drop) return
        tablePlacementRef.current = drop ?? null
        setTableDrop(null)
        // Placing by dragging (lib/placing.ts): the object at its default
        // size, its middle under the pointer, carried until let go - as one
        // moved is. A line is still drawn, the old table's tool and a block
        // still place as before.
        const size = drop ? null : placedSize(activeTool, layoutScale.pixelsPerMm)
        if (size) {
          setDragState({ mode: "create", objectId: null, startPos: coords, startObjectPos: heldAt(coords, size), creatingType: activeTool, placing: true })
          return
        }
        // Start creating the object with drag state
        setDragState({
          mode: "create",
          objectId: null,
          startPos: coords,
          startObjectPos: drop
            ? { x: coords.x, y: coords.y, width: CLICK_PLACED_SIZE.width, height: CLICK_PLACED_SIZE.height }
            : { x: coords.x, y: coords.y, width: 0, height: 0 },
          creatingType: activeTool,
        })
        return
      }

      // A scale end of the selected arc, before anything is hit-tested. Its
      // handle sits just *outside* the object's box (ARC_HANDLE_LINE_OUTSIDE),
      // so asking "what object is under the pointer" first would answer
      // "nothing" and clear the selection instead of grabbing the handle.
      //
      // The box's own corner handles still win where the two meet: the line
      // runs out through the corner on its way past the box, and the corner
      // is the smaller, older target (docs/2026-09-21-arc-handles.md).
      if (activeTool === "select" && selectedObjectIds.length === 1) {
        const only = findObjectById(interactionObjects, selectedObjectIds[0])
        if (only && !only.locked && isArcType(only.type) && !findResizeHandle(only, coords.x, coords.y)) {
          const end = arcHandleAtPoint(only, coords.x, coords.y, 8 / zoom, 4 / zoom)
          if (end) {
            setDragState({
              mode: "arc-angle",
              objectId: only.id,
              startPos: coords,
              startObjectPos: { x: only.x, y: only.y, width: only.width, height: only.height },
              arcEnd: end,
              arcSpan: arcSpanDegrees(only),
              arcLastAngle: arcAngleAtPoint(only, coords.x, coords.y),
            })
            return
          }
        }
      }

      // In a table a click takes what stands in the cell under the pointer,
      // however deep, or the empty cell itself - as the cursor in Word
      // (docs/2026-10-03-table-editing.md). What is already selected keeps
      // the press, so a table picked in the path is moved by dragging it.
      if (activeTool === "select" && !isCtrlOrCmd && !isShift && onSelectCell) {
        const atPoint = findObjectAtPoint(coords.x, coords.y, interactionObjects, true)
        if (!(atPoint && selectedObjectIds.includes(atPoint.id))) {
          const inCell = cellAt(screen.objects, coords, {
            pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm,
            fonts,
          })
          if (inCell) {
            onSetEditingContainer?.(inCell.tableId)
            if (inCell.objectId) {
              onSelectObjects([inCell.objectId])
              onSelectCell(null)
            } else {
              onSelectObjects([])
              onSelectCell({ tableId: inCell.tableId, row: inCell.row, column: inCell.column })
            }
            return
          }
        }
      }

      const clickedObject = findObjectAtPoint(coords.x, coords.y, interactionObjects, true)

      if (clickedObject) {
        const isAlreadySelected = selectedObjectIds.includes(clickedObject.id)

        if (isCtrlOrCmd || isShift) {
          // Modifier key pressed - add/remove from selection
          onSelectObject(clickedObject.id, true)
        } else if (!isAlreadySelected) {
          // No modifier key and object not selected - single select it
          onSelectObject(clickedObject.id, false)
        }
        // If no modifier key but object is already selected, preserve the current selection for dragging

        // Only allow dragging/resizing if this object is selected (either already or just selected)
        const willBeSelected = isAlreadySelected || !(isCtrlOrCmd || isShift)
        if (willBeSelected) {
          if (isLineType(clickedObject.type)) {
            const lineHandle = findLineHandle(clickedObject, coords.x, coords.y)
            if (lineHandle !== null) {
              setDragState({
                mode: "line-endpoint",
                objectId: clickedObject.id,
                startPos: coords,
                startObjectPos: {
                  x: clickedObject.x,
                  y: clickedObject.y,
                  width: clickedObject.width,
                  height: clickedObject.height,
                },
                startPoints: getLinePoints(clickedObject),
                lineHandle,
              })
              return
            }
          } else {
            const resizeHandle = staysPut(clickedObject) || sizedBySnapTable.has(clickedObject.id) ? null : findResizeHandle(clickedObject, coords.x, coords.y)
            if (resizeHandle) {
              setDragState({
                mode: "resize",
                objectId: clickedObject.id,
                startPos: coords,
                startObjectPos: {
                  x: clickedObject.x,
                  y: clickedObject.y,
                  width: clickedObject.width,
                  height: clickedObject.height,
                },
                resizeHandle,
              })
              return
            }

          }

          setDragState({
            mode: "select",
            objectId: clickedObject.id,
            startPos: coords,
            startObjectPos: {
              x: clickedObject.x,
              y: clickedObject.y,
              width: clickedObject.width,
              height: clickedObject.height,
            },
          })
        }
      } else {
        if (isCtrlOrCmd || isShift) {
          // Don't clear selection when using modifier keys on empty space
          return
        } else {
          // Empty space inside the tab-control currently open for editing,
          // but still within its own box, means "work on the container
          // now" (move/resize the whole tab-control) rather than "deselect
          // everything" - one click instead of the old click-to-deselect,
          // click-again-to-grab-the-container two-step. Selecting the
          // tab-control's own id exits panel-editing - see
          // clearEditingTabContextUnlessRelated.
          if (
            editingTabControl &&
            coords.x >= editingOrigin.x &&
            coords.x <= editingOrigin.x + editingTabControl.width &&
            coords.y >= editingOrigin.y &&
            coords.y <= editingOrigin.y + editingTabControl.height
          ) {
            onSelectObject(editingTabControl.id)
            return
          }

          // Beside the open group's objects a drag draws a rectangle over
          // the group's own objects, and a plain click leaves the group -
          // which of the two it was is only known on mouse-up
          // (leaveGroupAt, called from handleMouseUp).
          if (!editingGroup) onSelectObject(null)
          setDragState({
            mode: "selection-rectangle",
            objectId: null,
            startPos: coords,
            startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
            selectionRect: { x: coords.x, y: coords.y, width: 0, height: 0 },
            leavesGroupOnClick: !!editingGroup,
          })
        }
      }
    },
    [
      tableDropFor,
      sizedBySnapTable,
      layoutScale,
      spanHandles,
      sizeLines,
      activeTool,
      detectSvgButtonAtPoint,
      hardwareButtons,
      masterScreen,
      onHardwareButtonClick,
      getCanvasCoordinates,
      findObjectAtPoint,
      findLineHandle,
      findResizeHandle,
      editingTabControl,
      editingOrigin,
      onSelectObject,
      screen.objects,
      interactionObjects,
      selectedObjectIds,
      setDragState,
      onIconToolClick,
      editingContainerId,
      editingGroup,
      onAddPanel,
      onSetEditingContainer,
      previewObjects,
      zoom,
      previewMode,
      onPreviewButtonAction,
      popupUnderlay,
      onClosePopup,
      screenShape,
      popupCloseRadius,
      polylineDraft,
      tableLines,
      activeContainerIds,
      onSetTableProperties,
      onSelectTableColumn,
      onSelectCell,
      onSetEditingContainer,
      onInsertTableLine,
      handleTable,
      textScale,
      fonts,
    ],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom

      const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
      const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y

      const coords = {
        x: x - screenX,
        y: y - screenY,
      }

      if (previewMode) {
        const drag = navigatorDragRef.current
        if (drag) {
          const delta = drag.layout.horizontal ? coords.x - drag.start.x : coords.y - drag.start.y
          if (Math.abs(delta) > 4) drag.moved = true
          if (drag.moved) {
            drag.scroll = clampScroll(drag.layout, drag.startScroll - delta)
            setNavigatorScroll(drag.scroll)
          }
          return
        }
        if (levelDragRef.current) {
          const dragged = levelDragRef.current.object
          if (dragged) {
            canvas.style.cursor = "grabbing"
            const value = settableValueAt(dragged, coords.x, coords.y)
            levelDragRef.current = { id: dragged.id, value, object: dragged }
            onPreviewSetLevel?.(dragged, value, false)
            return
          }
          levelDragRef.current = null
        }
        const hoveredSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
        if (hoveredSvgButton) {
          canvas.style.cursor = "pointer"
          return
        }
        const hoveredObject = findObjectAtPoint(coords.x, coords.y, previewObjects)
        canvas.style.cursor =
          hoveredObject?.type === "button"
            ? "pointer"
            : hoveredObject && isSettableLevel(hoveredObject)
              ? "grab"
              : "default"
        return
      }

      if (polylineDraft !== null) {
        setPolylineCursor(coords)
      }

      // A span handle dragged (Task 7): the span's edge follows the pointer
      // across the lines, over empty cells only (lib/snap-table.ts
      // resizeSpan); every step one more update of the same gesture.
      const span = spanDragRef.current
      if (span) {
        const parent = findObjectById(screen.objects, span.tableId)
        if (parent && isSnapTable(parent)) {
          const origin = childOrigin(screen.objects, parent.id)
          const table = { ...parent, x: origin.x, y: origin.y }
          const next = resizeSpan(table, span.id, span.side, spanIndexAt(table, span.side, coords, layoutScale))
          const before = (parent.children ?? []).find((c) => c.id === span.id)
          const after = next?.children?.find((c) => c.id === span.id)
          if (before && after && JSON.stringify(before.properties?.cell) !== JSON.stringify(after.properties?.cell)) {
            onUpdateObject(span.id, { properties: after.properties })
          }
        }
        return
      }

      // A column or row line dragged (Task 8): wider or taller than what it
      // holds needs, the size is set by hand in millimetres; below that it
      // is automatic again. The size shows beside the pointer.
      const sizing = lineDragRef.current
      if (sizing) {
        const table = findObjectById(screen.objects, sizing.tableId)
        if (table && isSnapTable(table)) {
          const origin = childOrigin(screen.objects, table.id)
          const g = snapTableGeometry(table, layoutScale)
          const column = sizing.kind === "column"
          const start = column ? origin.x + g.lefts[sizing.index] : origin.y + g.tops[sizing.index]
          const natural = column ? g.naturalWidths[sizing.index] : g.naturalHeights[sizing.index]
          const wanted = Math.round((column ? coords.x : coords.y) - start)
          const ppm = layoutScale.pixelsPerMm
          const mm = wanted > natural + 1 ? Math.round((wanted / ppm) * 10) / 10 : undefined
          const lines = column ? snapColumnsOf(table) : snapRowsOf(table)
          if (lines[sizing.index]?.mm !== mm) {
            const next = setLineSize(table, sizing.kind, sizing.index, mm)
            onUpdateObject(table.id, { properties: next.properties })
          }
          const shown = mm ?? Math.round((natural / ppm) * 10) / 10
          setLineLabel({ x: coords.x, y: coords.y, text: `${shown.toFixed(1)} mm${mm === undefined ? " · auto" : ""}` })
        }
        return
      }

      const columnDrag = columnDragRef.current
      if (columnDrag) {
        const table = tableLines.find((t) => t.id === columnDrag.tableId)
        if (table) {
          const columns = dragColumnLine(columnDrag.columns, columnDrag.widths, columnDrag.index, coords.x - columnDrag.startX)
          const share = (c: TableColumn) => (typeof c.width === "object" && "share" in c.width ? c.width.share : undefined)
          const pair = [columns[columnDrag.index - 1], columns[columnDrag.index]].map(share)
          const g = table.lines.geometry
          const lineX = table.lines.origin.x + g.lefts[columnDrag.index] - g.gap / 2 + (coords.x - columnDrag.startX)
          setColumnDraft({ x: lineX, y: table.lines.origin.y + g.padding, bottom: table.lines.origin.y + rowsBottom(g), label: `${pair[0]}% | ${pair[1]}%`, columns })
        }
        return
      }

      if (!dragState) {
        // Over a table, its cell or row line.
        const drop = tableDropFor(coords)
        const nextDrop = drop && !("blocked" in drop) ? drop : null
        setTableDrop((current) => (JSON.stringify(current) === JSON.stringify(nextDrop) ? current : nextDrop))
        const handlesNear = activeTool === "select" ? tableLines.filter((t) => handlesOnlyNear(t) && nearTableHandles(t.lines, coords, zoom)).map((t) => t.id) : []
        const handleOf =
          activeTool === "select" && !previewMode
            ? ([...tableLines].reverse().find((t) => nearTableHandles(t.lines, coords, zoom))?.id ?? null)
            : null
        setHandleTable((current) => (current === handleOf ? current : handleOf))
        setNearHandles((current) => (current.join() === handlesNear.join() ? current : handlesNear))
        const near = activeTool !== "select" ? nestedTablesNear(screen.objects, coords, { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts }, PLUS / zoom, 4 / zoom) : []
        setNearTables((current) => (current.join() === near.join() ? current : near))
        // Outside the box but on a selected arc's scale handle: the same
        // check the press makes, so the cursor agrees with what a click
        // would do out there.
        if (activeTool === "select" && selectedObjectIds.length === 1) {
          const only = findObjectById(interactionObjects, selectedObjectIds[0])
          if (
            only &&
            !only.locked &&
            isArcType(only.type) &&
            !findResizeHandle(only, coords.x, coords.y) &&
            arcHandleAtPoint(only, coords.x, coords.y, 8 / zoom, 4 / zoom)
          ) {
            canvas.style.cursor = "grab"
            setHoveredObjectId(only.id)
            return
          }
        }

        const hoveredObject = findObjectAtPoint(coords.x, coords.y, interactionObjects, true)
        setHoveredObjectId(hoveredObject?.id || null)

        const hoveredSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
        setHoveredSvgButtonId(hoveredSvgButton || null)
        // </CHANGE>

        if (activeTool !== "select" && activeTool !== "background") {
          canvas.style.cursor = "crosshair"
        } else if (spanHandles && spanHandles.handles.some((h) => Math.hypot(coords.x - h.x, coords.y - h.y) <= SPAN_HANDLE_HIT / zoom)) {
          // Over a span handle: the way it grows.
          const h = spanHandles.handles.find((h) => Math.hypot(coords.x - h.x, coords.y - h.y) <= SPAN_HANDLE_HIT / zoom)!
          canvas.style.cursor = h.side === "left" || h.side === "right" ? "ew-resize" : "ns-resize"
        } else if (sizeLines && sizeLines.lines.some((l) => nearSizeLine(l, coords, SIZE_LINE_HIT / zoom))) {
          // Over a column or row line of the selected table.
          const l = sizeLineAt(sizeLines.lines, coords, SIZE_LINE_HIT / zoom)!
          canvas.style.cursor = l.kind === "column" ? "col-resize" : "row-resize"
        } else if (hoveredObject && selectedObjectIds.includes(hoveredObject.id)) {
          if (isLineType(hoveredObject.type)) {
            const lineHandle = findLineHandle(hoveredObject, coords.x, coords.y)
            if (lineHandle !== null) {
              canvas.style.cursor = "grab"
            } else {
              canvas.style.cursor = "move"
            }
          } else {
            const resizeHandle = sizedBySnapTable.has(hoveredObject.id) ? null : findResizeHandle(hoveredObject, coords.x, coords.y)
            if (
              !resizeHandle &&
              isArcType(hoveredObject.type) &&
              arcHandleAtPoint(hoveredObject, coords.x, coords.y, 8 / zoom, 4 / zoom)
            ) {
              canvas.style.cursor = "grab"
            } else if (resizeHandle) {
              const cursors: Record<ResizeHandle, string> = {
                nw: "nw-resize",
                ne: "ne-resize",
                sw: "sw-resize",
                se: "se-resize",
                "baseline-left": "ew-resize",
                "baseline-right": "ew-resize",
              }
              canvas.style.cursor = cursors[resizeHandle]
            } else {
              canvas.style.cursor = "move"
            }
          }
        } else if (hoveredObject) {
          canvas.style.cursor = "pointer"
        } else {
          canvas.style.cursor = "default"
        }
        return
      }

      const deltaX = coords.x - dragState.startPos.x
      const deltaY = coords.y - dragState.startPos.y

      const dragThreshold = 3 / zoom // 3 pixels at current zoom level
      const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      if (dragState.mode === "selection-rectangle") {
        const width = deltaX
        const height = deltaY
        const x = Math.min(dragState.startPos.x, coords.x)
        const y = Math.min(dragState.startPos.y, coords.y)

        setDragState({
          ...dragState,
          selectionRect: {
            x,
            y,
            width: Math.abs(width),
            height: Math.abs(height),
          },
        })
        return
      }

      if (dragState.mode === "create" && dragState.creatingType && tablePlacementRef.current) {
        // A click placement: the container sizes it, not the drag.
      } else if (dragState.mode === "create" && dragState.creatingType) {
        if (isLineType(dragState.creatingType)) {
          setDragState({
            ...dragState,
            startObjectPos: {
              x: dragState.startPos.x,
              y: dragState.startPos.y,
              width: deltaX,
              height: deltaY,
            },
          })
        } else if (dragState.placing) {
          // Carried at its middle (lib/placing.ts), its size its own.
          const held = heldAt(coords, dragState.startObjectPos)
          setDragState({ ...dragState, startObjectPos: held })
          // Near a table put together by snapping or a free object it snaps
          // there when let go, as one moved does; where, it shows meanwhile
          // (docs/2026-10-09-snap-tables.md). Among what stands where it is
          // placed - beside an open table too. A navigator goes onto its edge.
          const type = dragState.creatingType
          const snaps = onSnapDrop && !previewMode && !(e.ctrlKey || e.metaKey) && type !== "navigator"
          const carried = { id: NEW_OBJECT, type, ...held, zIndex: 0 } as ScreenObject
          const snapping = snaps ? snapDropAt([...drawSpace.objects, carried], NEW_OBJECT, held, SNAP_ZONE_MM * layoutScale.pixelsPerMm, layoutScale) : null
          setSnapDrop((current) => (JSON.stringify(current) === JSON.stringify(snapping) ? current : snapping))
        } else {
          // Still drawn as a rectangle: the old table's tool, a block.
          const width = Math.abs(deltaX)
          const height = Math.abs(deltaY)
          const x = Math.min(dragState.startPos.x, coords.x)
          const y = Math.min(dragState.startPos.y, coords.y)
          setDragState({
            ...dragState,
            startObjectPos: { x, y, width, height },
          })
        }
      } else if (dragState.mode === "select" && dragState.objectId && dragDistance > dragThreshold) {
        setDragState({
          ...dragState,
          mode: "drag",
        })
      } else if (dragState.mode === "drag" && dragState.objectId) {
        // A locked object stays where it is, even selected in the tree
        // alongside the ones being dragged.
        const selectedObjects = interactionObjects.filter((obj) => selectedObjectIds.includes(obj.id) && !staysPut(obj))
        const draggedObject = selectedObjects.find((obj) => obj.id === dragState.objectId)

        // Over a table: the empty cell or the row line where letting go
        // puts them, worked out without them, so their own cells are free.
        const without = selectedObjects.reduce((list, obj) => deleteObjectById(list, obj.id), screen.objects)
        // The «+» below a table where it is drawn - with them still in it -
        // the cells and row lines without them.
        const dropScale = { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts }
        const overTable =
          draggedObject && !previewMode
            ? (tablePlusAt(screen.objects, coords, dropScale, PLUS / zoom, 4 / zoom, selectedObjects.map((obj) => obj.id)) ??
              tableDropAt(without, coords, dropScale, 4 / zoom))
            : undefined
        const toCell = overTable && !("blocked" in overTable) ? overTable : null
        setTableDrop((current) => (JSON.stringify(current) === JSON.stringify(toCell) ? current : toCell))
        // Near a table put together by snapping or a free object: where it
        // snaps, about 5 mm around (docs/2026-10-09-snap-tables.md). One
        // free object at a time, never from inside such a table (taking an
        // object out is its own gesture).
        // Ctrl/⌘ held while dragging: placed freely, nothing snaps (decided
        // 2026-10-10 - snapping is on by default, as in Figma).
        const snapping =
          draggedObject && !previewMode && onSnapDrop && !(e.ctrlKey || e.metaKey) && selectedObjects.length === 1 && !isSnapTable(editingContainer) && !toCell
            ? snapDropAt(
                interactionObjects,
                draggedObject.id,
                // Where the object stands now, by its edges (asked 2026-10-10).
                { x: dragState.startObjectPos.x + deltaX, y: dragState.startObjectPos.y + deltaY, width: draggedObject.width, height: draggedObject.height },
                SNAP_ZONE_MM * layoutScale.pixelsPerMm,
                layoutScale,
              )
            : null
        setSnapDrop((current) => (JSON.stringify(current) === JSON.stringify(snapping) ? current : snapping))
        const near = draggedObject && !previewMode ? nestedTablesNear(screen.objects, coords, { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts }, PLUS / zoom, 4 / zoom) : []
        setNearTables((current) => (current.join() === near.join() ? current : near))
        // Out of a table put together by snapping (Task 6): the object is
        // carried as an outline, and where it would snap is worked out
        // against the space the table stands in with the object already out
        // of it - so its own row or column does not count. It stays in the
        // table, drawn as before, until it is let go.
        if (draggedObject && onSnapMoveOut && isSnapTable(editingContainer) && selectedObjects.length === 1) {
          const rect = { x: dragState.startObjectPos.x + deltaX, y: dragState.startObjectPos.y + deltaY, width: draggedObject.width, height: draggedObject.height }
          const lifted = liftOut(drawSpace.objects, editingContainer!.id, draggedObject.id, layoutScale)
          const space = lifted.objects.map((o) => (o.id === draggedObject.id ? translateObject(o, Math.round(rect.x - o.x), Math.round(rect.y - o.y)) : o))
          setOutDrag({ tableId: editingContainer!.id, id: draggedObject.id, rect, space })
          const snapping = e.ctrlKey || e.metaKey ? null : snapDropAt(space, draggedObject.id, rect, SNAP_ZONE_MM * layoutScale.pixelsPerMm, layoutScale)
          setSnapDrop((current) => (JSON.stringify(current) === JSON.stringify(snapping) ? current : snapping))
          return
        }
        // In a table an object stays put while it is dragged - the table
        // places it - and moves when it is let go.
        if (draggedObject && selectedObjects.every((obj) => placedByLayout(obj.id))) return

        if (draggedObject) {
          const rawX = dragState.startObjectPos.x + deltaX
          const rawY = dragState.startObjectPos.y + deltaY

          // For text objects, calculate snapping based on baseline position
          let snapObject = { x: rawX, y: rawY, width: dragState.startObjectPos.width, height: dragState.startObjectPos.height }
          
          if (draggedObject.type === "text") {
            const baselineY = getBaselineY(draggedObject, fonts)
            const baselineOffset = baselineY - draggedObject.y
            // Adjust the snap object to use baseline position for snapping
            snapObject = { 
              x: rawX, 
              y: rawY + baselineOffset, // Use baseline position for snapping
              width: dragState.startObjectPos.width, 
              height: dragState.startObjectPos.height 
            }
          }

          const otherObjects = interactionObjects.filter((obj) => !selectedObjectIds.includes(obj.id))
          const snapResult = calculateSnap(snapObject, otherObjects)

          // Adjust the snap result back to object position if we used baseline snapping
          let finalX = snapResult.x
          let finalY = snapResult.y
          
          if (draggedObject.type === "text") {
            const baselineY = getBaselineY(draggedObject, fonts)
            const baselineOffset = baselineY - draggedObject.y
            finalY = snapResult.y - baselineOffset // Convert back from baseline position to object position
          }

          const newX = Math.round(finalX)
          const newY = Math.round(finalY)

          // Calculate the offset for this specific object
          const offsetX = newX - draggedObject.x
          const offsetY = newY - draggedObject.y

          setActiveSnapLines(snapResult.snapLines)

          // Update all selected objects with the same offset
          selectedObjects.forEach((obj) => {
            const constrainedX = obj.x + offsetX
            const constrainedY = obj.y + offsetY
            if (isLineType(obj.type) && Array.isArray(obj.properties.points)) {
              // A line's own points array is the source of truth its
              // renderer/hit-testing actually reads - translating x/y alone
              // (fine for every other object type, whose x/y IS the shape's
              // position) would leave a multi-point line's real vertices
              // behind while only its bounding box moved.
              const translatedPoints = (obj.properties.points as LinePoint[]).map((p) => ({
                x: p.x + offsetX,
                y: p.y + offsetY,
              }))
              updateInteractionObject(obj.id, {
                x: constrainedX,
                y: constrainedY,
                properties: { ...obj.properties, points: translatedPoints },
              })
            } else {
              updateInteractionObject(obj.id, { x: constrainedX, y: constrainedY })
            }
          })
        }
      } else if (
        dragState.mode === "arc-angle" &&
        dragState.objectId &&
        dragState.arcEnd &&
        dragState.arcSpan !== undefined &&
        dragState.arcLastAngle !== undefined
      ) {
        // One end of the scale, along the ring. The span is carried forward
        // from step to step rather than measured against the drag's start,
        // so going right round keeps counting - and so the one rule this
        // has ("an end never comes past the other") is a clamp on a single
        // number (docs/2026-09-21-arc-handles.md).
        const end = dragState.arcEnd
        const obj = findObjectById(interactionObjects, dragState.objectId)
        if (obj) {
          const angle = arcAngleAtPoint(obj, coords.x, coords.y)
          const moved = arcShortestDelta(dragState.arcLastAngle, angle)
          const span = Math.max(
            ARC_MIN_SPAN_DEGREES,
            Math.min(360, dragState.arcSpan + arcSpanDelta(obj, end, moved)),
          )
          setDragState({ ...dragState, arcSpan: span, arcLastAngle: angle })

          // Snapped for what gets written, carried on unsnapped, so the ends
          // land on half hours without the pointer having to.
          const snapped = Math.max(
            ARC_MIN_SPAN_DEGREES,
            Math.min(360, Math.round(span / ARC_HANDLE_STEP_DEGREES) * ARC_HANDLE_STEP_DEGREES),
          )
          const angles = arcAnglesForSpan(obj, end, snapped)
          if (angles.minAngle !== obj.properties.minAngle || angles.maxAngle !== obj.properties.maxAngle) {
            updateInteractionObject(obj.id, { properties: { ...obj.properties, ...angles } })
          }
        }
      } else if (
        dragState.mode === "line-endpoint" &&
        dragState.objectId &&
        dragState.lineHandle !== undefined &&
        dragState.startPoints
      ) {
        // Reshaping one vertex of a (possibly multi-point) line - every
        // other vertex stays exactly where startPoints recorded it, only
        // the dragged index moves, snapped as a point (zero-size box)
        // against every other object the same way a corner resize handle
        // snaps a whole object's edges.
        const pointIndex = dragState.lineHandle
        const otherObjects = interactionObjects.filter((obj) => obj.id !== dragState.objectId)
        const snapResult = calculateSnap({ x: coords.x, y: coords.y, width: 0, height: 0 }, otherObjects, false)

        const newPoints = dragState.startPoints.map((p, i) =>
          i === pointIndex ? { x: Math.round(snapResult.x), y: Math.round(snapResult.y) } : p,
        )
        const xs = newPoints.map((p) => p.x)
        const ys = newPoints.map((p) => p.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)

        const lineObject = interactionObjects.find((obj) => obj.id === dragState.objectId)

        setActiveSnapLines(snapResult.snapLines)
        updateInteractionObject(dragState.objectId, {
          x: minX,
          y: minY,
          width: Math.max(...xs) - minX,
          height: Math.max(...ys) - minY,
          properties: { ...(lineObject?.properties ?? {}), points: newPoints },
        })
      } else if (dragState.mode === "resize" && dragState.objectId && dragState.resizeHandle && spanInTable(dragState.objectId, dragState.resizeHandle, coords)) {
        // In a table, the right or bottom edge sets how many cells it spans.
      } else if (dragState.mode === "resize" && dragState.objectId && dragState.resizeHandle) {
        const { x, y, width, height } = dragState.startObjectPos
        const handle = dragState.resizeHandle
        let newX = x,
          newY = y,
          newWidth = width,
          newHeight = height

        const resizingObject = interactionObjects.find((obj) => obj.id === dragState.objectId)
        const isSquare = isSquareType(resizingObject?.type)

        switch (handle) {
          case "nw":
            newX = Math.round(Math.min(x + width - 10, x + deltaX))
            newY = Math.round(Math.min(y + height - 10, y + deltaY))
            newWidth = Math.round(width - (newX - x))
            newHeight = Math.round(height - (newY - y))

            if (isSquare) {
              const size = Math.max(newWidth, newHeight)
              newWidth = size
              newHeight = size
              newX = x + width - size
              newY = y + height - size
            }
            break
          case "ne":
            newY = Math.round(Math.min(y + height - 10, y + deltaY))
            newWidth = Math.round(Math.max(10, width + deltaX))
            newHeight = Math.round(height - (newY - y))

            if (isSquare) {
              const size = Math.max(newWidth, newHeight)
              newWidth = size
              newHeight = size
              newY = y + height - size
            }
            break
          case "sw":
            newX = Math.round(Math.min(x + width - 10, x + deltaX))
            newWidth = Math.round(width - (newX - x))
            newHeight = Math.round(Math.max(10, height + deltaY))

            if (isSquare) {
              const size = Math.max(newWidth, newHeight)
              newWidth = size
              newHeight = size
              newX = x + width - size
            }
            break
          case "se":
            newWidth = Math.round(Math.max(10, width + deltaX))
            newHeight = Math.round(Math.max(10, height + deltaY))

            if (isSquare) {
              const size = Math.max(newWidth, newHeight)
              newWidth = size
              newHeight = size
            }
            break
          case "baseline-left":
            // Only resize width, keep height fixed for text objects
            newX = Math.round(Math.min(x + width - 10, x + deltaX))
            newWidth = Math.round(width - (newX - x))
            newHeight = height // Keep height unchanged
            break
          case "baseline-right":
            // Only resize width, keep height fixed for text objects
            newWidth = Math.round(Math.max(10, width + deltaX))
            newHeight = height // Keep height unchanged
            break
        }

        const snapLines: { type: "vertical" | "horizontal"; position: number }[] = []

        switch (handle) {
          case "nw":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
                const snapDelta = guide.position - x // Use original x, not newX - see baseline-left below
                newX = Math.round(guide.position)
                newWidth = Math.round(width - snapDelta)
                snapLines.push({ type: "vertical", position: guide.position })
              }
              if (guide.type === "horizontal" && Math.abs(newY - guide.position) <= SNAP_TOLERANCE) {
                const bottomEdge = y + height
                newY = Math.round(guide.position)
                newHeight = Math.round(bottomEdge - newY)
                snapLines.push({ type: "horizontal", position: guide.position })
              }
            })
            break
          case "ne":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
                newWidth = Math.round(guide.position - newX)
                snapLines.push({ type: "vertical", position: guide.position })
              }
              if (guide.type === "horizontal" && Math.abs(newY - guide.position) <= SNAP_TOLERANCE) {
                const bottomEdge = y + height
                newY = Math.round(guide.position)
                newHeight = Math.round(bottomEdge - newY)
                snapLines.push({ type: "horizontal", position: guide.position })
              }
            })
            break
          case "sw":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
                const snapDelta = guide.position - x // Use original x, not newX - see baseline-left below
                newX = Math.round(guide.position)
                newWidth = Math.round(width - snapDelta)
                snapLines.push({ type: "vertical", position: guide.position })
              }
              if (guide.type === "horizontal" && Math.abs(newY + newHeight - guide.position) <= SNAP_TOLERANCE) {
                newHeight = Math.round(guide.position - newY)
                snapLines.push({ type: "horizontal", position: guide.position })
              }
            })
            break
          case "se":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
                newWidth = Math.round(guide.position - newX)
                snapLines.push({ type: "vertical", position: guide.position })
              }
              if (guide.type === "horizontal" && Math.abs(newY + newHeight - guide.position) <= SNAP_TOLERANCE) {
                newHeight = Math.round(guide.position - newY)
                snapLines.push({ type: "horizontal", position: guide.position })
              }
            })
            break
          case "baseline-left":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
                const snapDelta = guide.position - x // Use original x, not newX
                newX = Math.round(guide.position)
                newWidth = Math.round(width - snapDelta)
                snapLines.push({ type: "vertical", position: guide.position })
              }
            })
            break
          case "baseline-right":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
                newWidth = Math.round(guide.position - newX)
                snapLines.push({ type: "vertical", position: guide.position })
              }
            })
            break
        }

        const hasVerticalSnap = snapLines.some((line) => line.type === "vertical")
        const hasHorizontalSnap = snapLines.some((line) => line.type === "horizontal")

        if (!hasVerticalSnap) {
          newX = Math.round(newX)
        }
        if (!hasHorizontalSnap) {
          newY = Math.round(newY)
        }

        newWidth = Math.round(Math.max(10, newWidth))
        newHeight = Math.round(Math.max(10, newHeight))

        // A Switch reserves a fixed 14px band at the top for its marker bar
        // and needs each segment wide enough for a bar you can still see.
        // Below either size the bar collides with the label or disappears
        // entirely, which would be a control that says nothing about its own
        // state. Clamped here rather than warned about: a Switch that small
        // simply cannot be built. Objects saved before this existed are left
        // exactly as they are - nothing rewrites geometry on load - and
        // drawBar's own width clamp keeps those drawing a visible marker.
        if (isSwitchType(resizingObject?.type)) {
          const stateCount = (resizingObject.properties?.states ?? []).length
          newWidth = Math.max(newWidth, minSwitchWidth(stateCount))
          newHeight = Math.max(newHeight, SWITCH_MIN_HEIGHT)
        }

        // An object on a size step keeps to it (docs/2026-09-30-size-scale.md,
        // user 2026-09-30): a bar or slider changes only its length - the
        // step is its track, set in the panel; a gauge's or dial's diameter
        // moves on the grid its track makes, so rings nest; a switch's or
        // button's height and an icon's edge land on S, M or L, whichever is
        // nearest. The edge being dragged moves, the opposite one stays.
        const stepped = resizingObject?.properties?.sizeStep ? resizedOnStep(resizingObject, textScale?.pixelsPerMm) : null
        let stepProperties: Record<string, any> | undefined
        if (stepped) {
          const movesLeft = handle.includes("w")
          const movesTop = handle.includes("n")
          if (stepped.kind === "length") {
            if (levelIsVertical(resizingObject!)) {
              newX = x
              newWidth = width
            } else {
              newY = y
              newHeight = height
            }
          } else if (stepped.kind === "diameter") {
            const d = snapDiameter(Math.max(newWidth, newHeight), stepped.thickness)
            if (movesLeft) newX = x + width - d
            if (movesTop) newY = y + height - d
            newWidth = d
            newHeight = d
          } else {
            const step = nearestStep(stepped.kind, stepped.kind === "icon" ? Math.max(newWidth, newHeight) : newHeight, stepped.pixelsPerMm)
            const px = stepPx(stepped.kind, step, stepped.pixelsPerMm)
            if (movesTop) newY = y + height - px
            newHeight = px
            if (stepped.kind === "icon") {
              if (movesLeft) newX = x + width - px
              newWidth = px
            }
            if (step !== resizingObject!.properties.sizeStep) stepProperties = { ...resizingObject!.properties, sizeStep: step }
          }
        }

        setActiveSnapLines(snapLines)
        updateInteractionObject(dragState.objectId, {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
          ...(stepProperties ? { properties: stepProperties } : {}),
        })
      }
    },
    [
      tableDropFor,
      sizedBySnapTable,
      drawSpace,
      onSnapMoveOut,
      spanHandles,
      sizeLines,
      layoutScale,
      onUpdateObject,
      placedByLayout,
      textScale,
      previewMode,
      dragState,
      selectedObjectIds,
      screen,
      interactionObjects,
      updateInteractionObject,
      zoom,
      SNAP_TOLERANCE,
      onUpdateObject,
      snapGuides,
      calculateSnap,
      setActiveSnapLines,
      activeTool,
      onSelectObject,
      setDragState,
      hoveredObjectId,
      detectSvgButtonAtPoint,
      findObjectAtPoint,
      findLineHandle,
      findResizeHandle,
      canvasRef,
      screenWidth,
      screenHeight,
      getCanvasCoordinates,
      offset,
      previewMode,
      polylineDraft,
      previewObjects,
      textScale,
      tableLines,
      spanInTable,
    ],
  )

  // The object a tool makes from a rectangle, with every default its type
  // starts with - shared by drawing, placing by dragging and the row
  // templates (docs/2026-10-09-snap-tables.md). Null for a tool that makes
  // nothing this way (a block, the navigator: handleMouseUp).
  const objectFor = (
    type: string,
    rect: { x: number; y: number; width: number; height: number },
    startPos: { x: number; y: number },
  ): Omit<ScreenObject, "id" | "zIndex"> | null => {
    const { x, y, width, height } = rect
    if (type === "live-icon") {
      // MQTT Icon Fields must be square
      const size = Math.max(Math.abs(width), Math.abs(height))
      
      const mqttIconFieldObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: "live-icon",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(size),
        height: Math.round(size),
        properties: {
          topic: "", // Empty topic - user can set later in properties panel
          valueIconPairs: [],
          backgroundColor: "transparent",
        },
      }

      return mqttIconFieldObject
    }
    if (isArcType(type)) {
      // Square, like an icon: the ring is inscribed in its box.
      const size = Math.max(Math.abs(width), Math.abs(height))
      const smallestFont = findSmallestFont()
      const arcLevelObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(size),
        height: Math.round(size),
        properties: {
          topic: undefined,
          setpointTopic: undefined,
          calibrationPoints: [
            { value: 0, barSizePercent: 0 },
            { value: 100, barSizePercent: 100 },
          ],
          // Half past seven round to half past four - the thermostat
          // shape, 270 degrees with a symmetric gap at the bottom. The
          // longest scale that still reads as a dial rather than a ring.
          minAngle: 225,
          maxAngle: 135,
          direction: "cw",
          thickness: LEVEL_DEFAULT_THICKNESS,
          displayValue: "value",
          // One colour, like the bar's: the track is this mixed halfway
          // into what the ring stands on, the handle is this itself, and
          // the ring has no background of its own
          // (docs/2026-09-22-arc-look.md).
          // Roles of the screen's theme (lib/control-palette.ts
          // ROLE_PALETTE). The value sits on the ground inside the ring,
          // not on the fill, so it takes the text colour.
          fillColor: ROLE_PALETTE.fill,
          textColor: ROLE_PALETTE.text,
          // Display: the value stands alone in the ring.
          ...(startStyled("display") ?? { fontSize: smallestFont?.size || 12, fontId: smallestFont?.id }),
        },
      }

      return arcLevelObject
    }
    if (isLevelType(type)) {
      const smallestFont = findSmallestFont()
      const levelIndicatorObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: Math.round(Math.abs(height)),
        properties: {
          topic: "", // Empty topic - user can set later in properties panel
          direction: "left-to-right",
          calibrationPoints: [
            { value: 0, barSizePercent: 0 },
            { value: 100, barSizePercent: 100 },
          ],
          displayValue: "value",
          fillColor: ROLE_PALETTE.fill,
          thickness: LEVEL_DEFAULT_THICKNESS,
          textColor: ROLE_PALETTE.text,
          ...(startStyled("label") ?? { fontSize: smallestFont?.size || 12, fontId: smallestFont?.id }),
        },
      }

      return levelIndicatorObject
    }
    if (type === "button") {
      const softwareButtonObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: "button",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: Math.round(Math.abs(height)),
        properties: {
          text: "Button",
          iconAssetId: null,
          // Material's tonal button in the palette's colour; everything
          // else about its look follows from those two
          // (docs/2026-09-19-button-look.md).
          buttonStyle: "tonal",
          buttonColor: ROLE_PALETTE.fill,
          ...(startStyled("label") ?? { fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined }),
          action: { type: "next-screen" },
        },
      }

      return softwareButtonObject
    }
    if (isSwitchType(type)) {
      // Same creation palette as every other control - this one is built
      // here rather than in project-editor.tsx's switch.
      const palette = ROLE_PALETTE
      const switchObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        // Same floor the resize handles clamp to. Dragging out a tiny
        // rectangle would otherwise create a Switch that the very next
        // resize is forbidden to make. It starts with no states, so the
        // width floor is the one-segment case.
        width: Math.max(Math.round(Math.abs(width)), minSwitchWidth(0)),
        height: Math.max(Math.round(Math.abs(height)), SWITCH_MIN_HEIGHT),
        properties: {
          topic: undefined,
          writeTopic: "",
          states: [],
          // One colour; the container, the chosen state's pill and every
          // label follow from it (docs/2026-09-20-switch-look.md).
          switchStyle: "filled",
          switchColor: palette.fill,
          ...(startStyled("label") ?? { fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined }),
        },
      }

      return switchObject
    }
    if (type === "live-line") {
      // A quick drag still creates a straight 2-point MqttDataLine in
      // one gesture, same as the plain "line" case below - the too-
      // short-drag branch (this function's very end) starts the same
      // click-to-place polyline flow for both types instead.
      const mqttDataLineObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: "live-line",
        x: Math.round(startPos.x),
        y: Math.round(startPos.y),
        width: Math.round(width),
        height: Math.round(height),
        properties: defaultMqttDataLineProperties([
          { x: Math.round(startPos.x), y: Math.round(startPos.y) },
          { x: Math.round(startPos.x + width), y: Math.round(startPos.y + height) },
        ]),
      }

      return mqttDataLineObject
    }
    if (type === "switcher") {
      // Starts with a single "Panel 1" child (comparisonValue "") so a
      // freshly-drawn tab-control is immediately editable instead of
      // rendering nothing until the user manually adds a panel.
      const tabControlObject: Omit<ScreenObject, "id" | "zIndex"> = {
        type: "switcher",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: Math.round(Math.abs(height)),
        properties: {
          topic: "",
          comparisonOperator: "==",
          comparisonValue: "",
        },
        children: [
          {
            id: `panel-${Date.now()}`,
            type: "panel",
            x: 0,
            y: 0,
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            zIndex: 0,
            properties: {
              comparisonOperator: "==",
              comparisonValue: "",
            },
            children: [],
          },
        ],
      }

      return tabControlObject
    }
    const textStyled = startStyled("label")
    // Keyed by the tool, which is the type it makes.
    // A layout container drawn as a rectangle: empty, its own defaults
    // (lib/layout.ts) until its properties say otherwise.
    const container = (type: ScreenObject["type"]): Omit<ScreenObject, "id" | "zIndex"> => ({
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(Math.abs(width)),
      height: Math.round(Math.abs(height)),
      properties: {},
      children: [],
    })
    const defaultObjects: Record<
      "text" | "icon" | "line" | "box" | "table" | "free",
      Omit<ScreenObject, "id" | "zIndex">
    > = {
      // The shape chosen in the Table tool's menu, one row; «Name and
      // control» without a choice (docs/2026-10-03-free-screens.md).
      table: { ...container("table"), properties: { columns: shapeColumns(tableShape ?? DEFAULT_TABLE_SHAPE), rows: 1 } },
      free: container("free"),
      text: {
        type: "text",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: (() => {
          const f = fonts && fonts[0]
          const fontSize = textStyled?.fontSize || f?.size || 16
          return calculateTextObjectHeight(fontSize)
        })(),
        properties: {
          text: "Label",
          ...(textStyled ?? { fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined, fontSize: 14 }),
          // Roles of the screen's theme (lib/themes.ts), never a hex. A
          // label is text on the screen, not a box: no background and
          // no border until someone asks for one (user, 2026-09-25).
          color: ROLE_PALETTE.text,
          textAlign: "left",
          fontWeight: "normal",
          backgroundColor: "transparent",
          borderColor: "transparent",
        },
      },
      icon: {
        type: "icon",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: Math.round(Math.abs(height)),
        properties: {
          assetId: selectedIconAssetId || null,
          iconName: "default",
          recolorations: [] as ColorRecoloration[],
          backgroundColor: "transparent",
        },
      },
      line: {
        type: "line",
        x: Math.round(startPos.x),
        y: Math.round(startPos.y),
        width: Math.round(width),
        height: Math.round(height),
        properties: {
          color: ROLE_PALETTE.stroke,
          strokeWidth: 2,
          strokeStyle: "solid",
          filletRadius: 0,
          // Explicit points even for this plain single-drag line, not
          // just the segmented-tool path below - keeps every line
          // object's shape in one uniform place (getLinePoints() in
          // render-line.ts) rather than two representations that
          // happen to agree only for a fresh two-point line.
          points: [
            { x: Math.round(startPos.x), y: Math.round(startPos.y) },
            { x: Math.round(startPos.x + width), y: Math.round(startPos.y + height) },
          ],
        },
      },
      box: {
        type: "box",
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.abs(width)),
        height: Math.round(Math.abs(height)),
        properties: {
          fillColor: ROLE_PALETTE.track,
          strokeColor: ROLE_PALETTE.stroke,
          strokeWidth: 1,
          cornerRadius: 0,
        },
      },
    }

    const objectType = type as keyof typeof defaultObjects
    return objectType in defaultObjects ? defaultObjects[objectType] : null
  }

  const handleMouseUp = useCallback(() => {
    // Off the navigator: a press that did not move opens its entry's screen.
    const navigatorDrag = navigatorDragRef.current
    if (navigatorDrag) {
      navigatorDragRef.current = null
      if (!navigatorDrag.moved) {
        const index = entryAt(navigatorDrag.layout, navigatorDrag.start.x, navigatorDrag.start.y, navigatorDrag.scroll)
        const latest = navigatorLatest.current
        const target = navigatorScreens(latest.screens)[index]
        if (target && target.id !== latest.screenId) latest.goTo(target.id)
      }
      return
    }

    // The finger is off a settable level: publish what it settled on, whether
    // or not the coalescer already sent that value (decision 3).
    if (levelDragRef.current) {
      const dragged = levelDragRef.current.object
      const value = levelDragRef.current.value
      levelDragRef.current = null
      if (dragged) onPreviewSetLevel?.(dragged, value, true)
      return
    }

    if (spanDragRef.current) {
      spanDragRef.current = null
      return
    }
    if (lineDragRef.current) {
      lineDragRef.current = null
      setLineLabel(null)
      return
    }

    if (columnDragRef.current) {
      const { tableId } = columnDragRef.current
      columnDragRef.current = null
      if (columnDraft && onSetTableProperties) {
        onSetTableProperties(tableId, { columns: columnDraft.columns })
      }
      setColumnDraft(null)
      return
    }

    if (dragState?.mode === "selection-rectangle" && dragState.selectionRect) {
      const { x, y, width, height } = dragState.selectionRect

      // Inside an open group, a click that never became a drag leaves it.
      if (dragState.leavesGroupOnClick && width < 3 / zoom && height < 3 / zoom) {
        leaveGroupAt(dragState.startPos)
      } else {
        // Find all objects that intersect with the selection rectangle
        const intersectingObjects = interactionObjects.filter((obj) => {
          // A locked one is not caught by the rectangle either: it covers the
          // screen, so every rectangle would.
          if (obj.locked) return false
          // Check if object intersects with selection rectangle
          return !(obj.x + obj.width < x || obj.x > x + width || obj.y + obj.height < y || obj.y > y + height)
        })

        if (intersectingObjects.length > 0 || dragState.leavesGroupOnClick) {
          onSelectObjects(intersectingObjects.map((obj) => obj.id))
        }
      }
    }

    // A drag let go over a table's empty cell or row line: the selection
    // moves there, keeping its cells relative to each other.
    if (dragState?.mode === "drag" && dragState.objectId && tableDrop && onMoveToTable) {
      const moving = selectedObjectIds.filter((id) => id === dragState.objectId || !findObjectById(screen.objects, id)?.locked)
      onMoveToTable(moving, tableDrop)
    }
    // Let go out of a table put together by snapping: out, and free or snapped.
    if (dragState?.mode === "drag" && outDrag && onSnapMoveOut) {
      onSnapMoveOut(outDrag.tableId, outDrag.id, { x: outDrag.rect.x - drawSpace.origin.x, y: outDrag.rect.y - drawSpace.origin.y }, snapDrop)
    }
    // Let go where it snaps: into the table, or a table with its neighbour.
    else if (dragState?.mode === "drag" && dragState.objectId && snapDrop && onSnapDrop) onSnapDrop(dragState.objectId, snapDrop)
    if (dragState?.mode === "drag") {
      setTableDrop(null)
      setSnapDrop(null)
      setOutDrag(null)
    }

    if (dragState?.mode === "create" && dragState.creatingType) {
      createSnapRef.current = snapDrop
      setSnapDrop(null)
      // A navigator goes onto its edge, wherever it was let go.
      if (dragState.placing && dragState.creatingType !== "navigator") {
        const r = dragState.startObjectPos
        placedMiddleRef.current = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      let { x, y, width, height } = dragState.startObjectPos

      const minSize = 5
      let isValidSize = false
      // A click with the Table tool, no rectangle: the table from there to
      // the screen's right edge, its rows giving its height (asked
      // 2026-10-04 - that a rectangle had to follow was not clear).
      if (dragState.creatingType === "table" && Math.abs(width) <= minSize && Math.abs(height) <= minSize) {
        width = Math.max(4 * minSize, screenWidth - x)
        height = 40
      }
      // The navigator goes on its edge whatever was drawn (lib/navigator.ts).
      if (dragState.creatingType === "navigator") {
        ;({ x, y, width, height } = navigatorStrip("left", "iconsAndText", screenWidth, screenHeight))
      }

      if (isLineType(dragState.creatingType)) {
        const distance = Math.sqrt(width * width + height * height)
        isValidSize = distance > minSize
      } else {
        isValidSize = Math.abs(width) > minSize && Math.abs(height) > minSize
      }

      if (isValidSize) {
        if (dragState.creatingType === "baustein") {
          const rect = {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
          }
          const inTable = tablePlacementRef.current
          if (inTable) {
            // Into a table: merged at a row line, nested in an empty cell.
            tablePlacementRef.current = null
            onInsertBaustein?.(rect, undefined, { table: inTable })
          } else if (editingContainer) {
            onInsertBaustein?.(
              { ...rect, x: rect.x - editingOrigin.x, y: rect.y - editingOrigin.y },
              editingContainer.id,
            )
          } else {
            onInsertBaustein?.(rect)
          }
          onToolChange("select")
        } else if (dragState.creatingType === "navigator") {
          addInteractionObject({
            type: "navigator",
            x,
            y,
            width,
            height,
            properties: { edge: "left", shows: "iconsAndText", fontId: findSmallestFont()?.id },
          })
          onToolChange("select")
        } else {
          const made = objectFor(dragState.creatingType, { x, y, width, height }, dragState.startPos)
          if (made) {
            addInteractionObject(made)
            onToolChange("select")
          }
        }
      } else if (dragState.creatingType === "line" || dragState.creatingType === "live-line") {
        // Too short a drag to count as one (a click, essentially) - rather
        // than silently discarding it like every other tool does, this
        // starts the click-to-place-each-vertex segmented-line flow (see
        // polylineDraft) at that point. activeTool stays "line"/"live-line"
        // (no onToolChange call here) so the next click can add a second
        // point - finishPolyline reads activeTool to decide which type to
        // create.
        setPolylineDraft([dragState.startPos])
      }
    }

    setDragState(null)
    // A click placement not made (the press went elsewhere) is not carried on.
    tablePlacementRef.current = null
    placedMiddleRef.current = null
    setActiveSnapLines([])
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = activeTool !== "select" ? "crosshair" : "default"
    }
  }, [
    onMoveObject,
    tableShape,
    onMoveToTable,
    onSnapDrop,
    snapDrop,
    onSnapMoveOut,
    outDrag,
    drawSpace,
    onSetTableProperties,
    columnDraft,
    tableDrop,
    selectedObjectIds,
    dragState,
    zoom,
    leaveGroupAt,
    screen.objects,
    previewObjects,
    editingContainer,
    editingOrigin.x,
    editingOrigin.y,
    interactionObjects,
    addInteractionObject,
    onInsertBaustein,
    onPreviewSetLevel,
    onSelectObjects,
    onAddObject,
    onToolChange,
    activeTool,
    fonts,
    selectedIconAssetId,
    setDragState,
    setActiveSnapLines,
    detectSvgButtonAtPoint,
    hardwareButtons,
    onHardwareButtonClick,
    getCanvasCoordinates,
    findObjectAtPoint,
    findLineHandle,
    findResizeHandle,
    screenWidth,
    screenHeight,
    screen.buttonActions,
    onSelectObject,
    zoom,
    offset,
    SNAP_TOLERANCE,
    onUpdateObject,
    snapGuides,
    calculateSnap,
    onIconToolClick,
    onDeleteObject,
    canvasRef,
    setPolylineDraft,
  ])


  // Delete or Backspace removes the selection; an arrow key nudges it one pixel, ten
  // with Shift - the selection as it is, a group as a whole. A locked object
  // stays where it is, as it does under a drag. True when the key was taken.
  const handleSelectionKey = useCallback(
    (e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "preventDefault">) => {
      if (selectedObjectIds.length === 0) return false
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        selectedObjectIds.forEach((id) => onDeleteObject(id))
        return true
      }
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      if (!nudge[e.key] || e.ctrlKey || e.metaKey || e.altKey) return false
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const [dx, dy] = nudge[e.key]
      for (const obj of interactionObjects) {
        if (!selectedObjectIds.includes(obj.id) || staysPut(obj)) continue
        const moved = translateObject(obj, dx * step, dy * step)
        updateInteractionObject(obj.id, moved.properties === obj.properties ? { x: moved.x, y: moved.y } : { x: moved.x, y: moved.y, properties: moved.properties })
      }
      return true
    },
    [selectedObjectIds, onDeleteObject, interactionObjects, updateInteractionObject],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (previewMode) return

      if (polylineDraft !== null) {
        if (e.key === "Escape") {
          cancelPolylineDraft()
        } else if (e.key === "Enter") {
          finishPolyline(polylineDraft)
        } else if (e.key === "Backspace" || e.key === "Delete") {
          // Undo the most recent point rather than the (nonexistent, still
          // being drawn) object's Delete behavior below - removing the
          // draft's last point down to zero cancels it outright rather than
          // leaving an empty draft around.
          e.preventDefault()
          if (polylineDraft.length <= 1) {
            cancelPolylineDraft()
          } else {
            setPolylineDraft(polylineDraft.slice(0, -1))
          }
        }
        return
      }

      if (handleSelectionKey(e)) return

      // Esc while an object is dragged puts it back and snaps nothing
      // (docs/2026-10-09-snap-tables.md); the editor's own Esc is not for this
      // press.
      // Ctrl/⌘ pressed mid-drag: nothing snaps from now on, the target shown goes at once.
      if ((e.key === "Control" || e.key === "Meta") && (dragState?.mode === "drag" || dragState?.mode === "create")) {
        setSnapDrop(null)
        return
      }
      // Esc while a new object is carried: it is taken away, nothing made;
      // the tool stays in hand for another try.
      if (e.key === "Escape" && dragState?.mode === "create" && dragState.placing) {
        e.preventDefault()
        e.stopPropagation()
        setDragState(null)
        setSnapDrop(null)
        return
      }
      if (e.key === "Escape" && dragState?.mode === "drag" && dragState.objectId) {
        e.preventDefault()
        e.stopPropagation()
        // Out of a table it never moved: nothing to put back.
        if (!outDrag) updateInteractionObject(dragState.objectId, { x: dragState.startObjectPos.x, y: dragState.startObjectPos.y })
        setDragState(null)
        setSnapDrop(null)
        setTableDrop(null)
        setOutDrag(null)
        return
      }
      if (e.key === "Escape") {
        // Inside a group, Escape leaves it and selects it - the editor does
        // that for the whole window (project-editor.tsx), since a group is
        // entered from the object list too, where the canvas has no keys.
        // In a table it clears the selection and the cell picked, as it did
        // when the screen was the table (docs/2026-10-03-free-screens.md).
        // A table put together by snapping is left as a group is.
        if (!editingGroup || isOldTable(editingGroup)) onSelectObject(null)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault()
        onSelectAll()
      }
    },
    [
      previewMode,
      onSelectObject,
      onSelectAll,
      polylineDraft,
      cancelPolylineDraft,
      finishPolyline,
      editingGroup,
      handleSelectionKey,
      dragState,
      updateInteractionObject,
      outDrag,
    ],
  )

  // Delete, Backspace and the arrow keys act on the selection wherever it was made:
  // after a pick in the object list, or a click on a button in the property
  // panel, the keys are not the canvas's, and they used to do nothing then
  // (#26). So they are listened for on the whole window as well - but not
  // where the key has a job of its own: in a text field, a select, a slider
  // or tab strip, or behind an open dialog or menu. A key that reaches the
  // canvas is handled by its own onKeyDown, not a second time here.
  useEffect(() => {
    if (previewMode) return
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const active = document.activeElement as HTMLElement | null
      if (active && containerRef.current?.contains(active)) return
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active?.isContentEditable ||
        active?.closest('[role="slider"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="combobox"], [role="spinbutton"], [role="menu"]')
      ) {
        return
      }
      if (document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) return
      if (polylineDraft !== null) return
      handleSelectionKey(e)
    }
    window.addEventListener("keydown", onWindowKeyDown)
    return () => window.removeEventListener("keydown", onWindowKeyDown)
  }, [previewMode, polylineDraft, handleSelectionKey])

  // A double click on a group enters it: its objects take clicks from here
  // on, the rest of the screen is veiled, and the object under the pointer
  // is selected at once (as in Inkscape, Illustrator and Figma). Escape or
  // a click beside the group leaves again. Also into a group inside the
  // open one.
  const enterGroupAt = useCallback(
    (clientX: number, clientY: number) => {
      const coords = getCanvasCoordinates(clientX, clientY)
      const hit = findObjectAtPoint(coords.x, coords.y, interactionObjects, true)
      // A group, or a layout container: a double click opens it and takes
      // what is under the pointer inside it.
      if (!hit || !(hit.type === "group" || isContainerType(hit.type))) return
      onSetEditingContainer(hit.id)
      const inside = (hit.children ?? []).map((c) => translateObject(c, hit.x, hit.y))
      const child = findObjectAtPoint(coords.x, coords.y, inside, true)
      onSelectObjects(child ? [child.id] : [])
    },
    [getCanvasCoordinates, findObjectAtPoint, interactionObjects, onSetEditingContainer, onSelectObjects],
  )

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (previewMode) return
    if (polylineDraft === null) {
      if (activeTool === "select") enterGroupAt(e.clientX, e.clientY)
      return
    }
    // The second click of this double-click already added a point via the
    // ordinary mousedown handler (dblclick fires after both full click
    // cycles) - if it landed within a couple pixels of the point before it,
    // that's a redundant near-duplicate vertex purely from the act of
    // double-clicking to finish, not an intentional tiny final segment, so
    // drop it before committing.
    let points = polylineDraft
    if (points.length >= 2) {
      const lastPoint = points[points.length - 1]
      const secondLast = points[points.length - 2]
      if (Math.hypot(lastPoint.x - secondLast.x, lastPoint.y - secondLast.y) <= 2 / zoom) {
        points = points.slice(0, -1)
      }
    }
    finishPolyline(points)
  }, [previewMode, polylineDraft, zoom, finishPolyline, activeTool, enterGroupAt])

  // In a table, a right-click takes the cell under the pointer first - its
  // object, or the empty cell - and the menu offers the table's commands
  // for it on top (docs/2026-10-03-table-editing.md).
  const [contextMenuInTable, setContextMenuInTable] = useState(false)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (previewMode) return
      const coords = getCanvasCoordinates(e.clientX, e.clientY)
      const inCell =
        activeTool === "select" && onSelectCell && onTableCommand
          ? cellAt(screen.objects, coords, { pixelsPerMm: textScale?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts })
          : undefined
      if (inCell) {
        onSetEditingContainer?.(inCell.tableId)
        if (inCell.objectId) {
          onSelectObjects([inCell.objectId])
          onSelectCell?.(null)
        } else {
          onSelectObjects([])
          onSelectCell?.({ tableId: inCell.tableId, row: inCell.row, column: inCell.column })
        }
      }
      setContextMenuInTable(!!inCell)
      setContextMenuPosition({ x: e.clientX, y: e.clientY })
    },
    [previewMode, getCanvasCoordinates, activeTool, onSelectCell, onTableCommand, screen.objects, textScale, fonts, onSetEditingContainer, onSelectObjects],
  )

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPosition(null)
  }, [])

  const handleCopyFromMenu = useCallback(() => {
    if (onCopy) {
      onCopy()
    }
    handleCloseContextMenu()
  }, [onCopy, handleCloseContextMenu])

  const handleCutFromMenu = useCallback(() => {
    onCut?.()
    handleCloseContextMenu()
  }, [onCut, handleCloseContextMenu])

  const handlePasteFromMenu = useCallback(() => {
    if (onPaste) {
      onPaste()
    }
    handleCloseContextMenu()
  }, [onPaste, handleCloseContextMenu])

  const handleSelectAllFromMenu = useCallback(() => {
    onSelectAll()
    handleCloseContextMenu()
  }, [onSelectAll, handleCloseContextMenu])

  const handleGroupFromMenu = useCallback(() => {
    onGroup?.()
    handleCloseContextMenu()
  }, [onGroup, handleCloseContextMenu])

  // What to do with the tool waiting to be used: a table placed by a click
  // or a rectangle, a block by a rectangle or into a table, a line point by
  // point, anything else by a rectangle (asked 2026-10-04).
  const toolHint =
    previewMode || dragState || activeTool === "select" || activeTool === "background"
      ? null
      : activeTool === "table"
        ? "Click or drag a rectangle to place the table. Esc cancels."
        : activeTool === "baustein"
          ? "Drag a rectangle to place the block, or click a cell, a line or a + of a table. Esc cancels."
          : isLineType(activeTool)
            ? "Click point by point, double-click to finish the line. Esc cancels."
            : "Drag a rectangle to place it, or click a cell, a line or a + of a table. Esc cancels."

  const handleUngroupFromMenu = useCallback(() => {
    onUngroup?.()
    handleCloseContextMenu()
  }, [onUngroup, handleCloseContextMenu])

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: "rgb(var(--canvas-container-bg))" }}
      tabIndex={0}
      // Where a finished text field hands the keyboard back to
      // (property-panel/fields/finish-field.ts).
      data-canvas-keys
      onKeyDown={handleKeyDown}
    >
      {/* What to do with the tool waiting to be used (asked 2026-10-04). */}
      {toolHint ? (
        <div
          data-testid="tool-hint"
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-foreground/80 px-3 py-1.5 text-xs text-background shadow"
        >
          {toolHint}
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        // Where each table's «+» below it stands on the screen - it is drawn,
        // not an element - so a test can click it on any device's scale.
        data-table-pluses={tablePluses}
        // The empty cell picked, for the same reason.
        data-table-cell={chosenCell && selectedObjectIds.length === 0 ? JSON.stringify(chosenCell) : undefined}
        data-snap-chip={snapChip?.text}
        data-pixels-per-mm={layoutScale.pixelsPerMm}
        data-span-handles={spanHandles ? JSON.stringify(spanHandles.handles) : undefined}
        data-size-lines={sizeLines ? JSON.stringify(sizeLines.lines) : undefined}
        data-editing-container={editingContainerId ?? undefined}
        style={{
          imageRendering: "pixelated",
          WebkitFontSmoothing: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {contextMenuPosition && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              handleCloseContextMenu()
            }}
          />
          <div
            className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]"
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
          >
            {contextMenuInTable && tableCommandsEnabled && onTableCommand ? (
              <div role="group" aria-label="Table" data-testid="table-context-menu">
                {TABLE_COMMANDS.map(({ group, commands }, i) => (
                  <div key={group}>
                    {i > 0 && <div className="my-1 h-px bg-border" />}
                    {commands.map(({ command, label }) => (
                      <button
                        key={command}
                        className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!tableCommandsEnabled[command]}
                        onClick={() => {
                          onTableCommand(command)
                          handleCloseContextMenu()
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="my-1 h-px bg-border" />
              </div>
            ) : null}
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleCopyFromMenu}
              disabled={selectedObjectIds.length === 0}
            >
              Copy
            </button>
            {onCut ? (
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleCutFromMenu}
                disabled={selectedObjectIds.length === 0}
              >
                Cut
              </button>
            ) : null}
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handlePasteFromMenu}
              disabled={!hasClipboard}
            >
              Paste
            </button>
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground"
              onClick={handleSelectAllFromMenu}
            >
              Select All
            </button>
            {onGroup || onUngroup ? <div className="my-1 h-px bg-border" /> : null}
            {onGroup ? (
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-4"
                onClick={handleGroupFromMenu}
                disabled={!canGroup}
              >
                Group
                <span className="text-xs text-muted-foreground">Ctrl+G</span>
              </button>
            ) : null}
            {onUngroup ? (
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-4"
                onClick={handleUngroupFromMenu}
                disabled={!canUngroup}
              >
                Ungroup
                <span className="text-xs text-muted-foreground">Ctrl+U</span>
              </button>
            ) : null}
          </div>
        </>
      )}

    </div>
  )
}

