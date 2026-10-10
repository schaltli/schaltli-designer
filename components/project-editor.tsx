"use client"

import type { CombinedTopic } from "@/lib/combined-topics"
import type { LiveValue } from "@/lib/live-value"
import { ROLE_PALETTE } from "@/lib/control-palette"
import { LEVEL_DEFAULT_THICKNESS } from "@/lib/level-shape"
import { useState, useCallback, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { buildMockEngine } from "@/lib/mock-engine"
import { getActivePanel, getLiveValueFromTopic, getPreviewValueFromTopic, previewHeardTopics, projectSubscriptionTopics } from "@/lib/render-screen"
import { adjustedLevel, adjustedValue, adjustTargetOf } from "@/lib/adjust-level"
import { BausteinDialog } from "./baustein-dialog"
import { blockFont, blockTable, buildEntry, type BausteinOptions } from "@/lib/bausteine"
import type { CatalogEntry } from "@/lib/ha-discovery"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { Canvas } from "./canvas/canvas"
import { Toolbar } from "./toolbar/toolbar"
import { PropertyPanel } from "./property-panel/property-panel"
import { Slider } from "./ui/slider"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { IconSelectorModal } from "./icon-selector-modal"
import { ScreensPanel } from "./screens-panel/screens-panel"
import { ProjectSettingsDialog } from "./project-settings-dialog"
import { MqttDiscoveryDialog } from "./mqtt-discovery-dialog"
import { ExportDialog } from "./export-dialog"
import { DeployDialog } from "./deploy-dialog"
import { VersionHistoryDialog } from "./version-history-dialog"
import { StartupDeviceGate } from "./startup-device-gate"
import { ObjectTreePanel } from "./object-tree/object-tree-panel"
import { TopicValuesPanel } from "./topic-values-panel"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { insertObjectInOrder, sortObjectsByDrawingOrder } from "@/lib/object-order"
import { withIntegerProjectGeometry } from "@/lib/integer-geometry"
import { resolveMasterScreen } from "@/lib/hardware-button-actions"
import { firstScreenToOpen, isMainScreen, isPagedScreen, isPopup, withScreenType, type ScreenType } from "@/lib/popup"
import { describeDeviceAction } from "@/lib/device-actions"
import {
  findObjectById,
  findParentOf,
  updateObjectById,
  updateObjectsById,
  deleteObjectById,
  insertObjectIntoParent,
  canDropAsChildOf,
  movedTogether,
  moveObjectsToParent,
  type MoveAnchor,
} from "@/lib/object-tree"
import {
  childOrigin,
  containerOf,
  editingContainerAfterSelecting,
  groupObjects,
  groupRefusal,
  isGroup,
  normalizeProjectGroups,
  translateObject,
  ungroupObject,
  withFreshIds,
} from "@/lib/object-groups"
import { FALLBACK_SCALE, layoutProject } from "@/lib/layout"
import { applyRowDrop, applySnapDrop, firstInReadingOrder, isSnapTable, moveOutOf, type RowTemplate, type SnapDrop } from "@/lib/snap-table"
import { DEFAULT_TABLE_COLUMNS, TABLE_TYPE, isOldTable, cellOf, columnsOf, deleteRow, insertColumnAt, insertRowAt, mergeCell, mergedRows, moveIntoTable, removeColumn, rowsAfterInsert, splitCell, tablePath, usedRows, type TableColumn, type TableDrop } from "@/lib/table"
import { TableGroup, type TableCommand } from "@/components/toolbar/table-group"
import { DEFAULT_TABLE_SHAPE, type TableShapeId } from "@/lib/layout-templates"
import { cn } from "@/lib/utils"
import { FilePlus2, PackageCheck, Upload, Download, AlertTriangle, Play, X, Rocket, History, CircleHelp, Save, SaveAll, Undo2, Redo2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { HANDBOOK_URL } from "@/lib/handbook"
import { useToast } from "@/hooks/use-toast"
import { useProjectHistory, type HistoryEntry } from "@/hooks/use-project-history"
import { DEFAULT_SEPARATORS, projectSeparators, referencedTopics } from "@/lib/placeholders"
import { fontFor, resolveScale, screenTextScale, stepKindOf, stepUpdates, styledFont, withHonestSteps } from "@/lib/size-scale"
import { createProjectOnServer, useProjectSave, type SaveResult } from "@/hooks/use-project-save"
import { SaveProjectDialog } from "./save-project-dialog"
import { NewProjectDialog } from "./new-project-dialog"
import { LeaveProjectDialog, type LeaveChoice } from "./leave-project-dialog"
import { ProjectsPanel } from "./projects-panel"
import { ProjectList } from "./project-list"
import { deleteDraft, draftKeyForName, getDraft, newUntitledDraftKey, putDraft } from "@/lib/project-draft"
import { sameProjectName } from "@/lib/project-name"
import {
  loadDeviceDescriptionByPath,
  resolveDeviceForProject,
  resolveDeviceFromEmbeddedDdf,
  resolveRotatedScreenSize,
  type Typography,
} from "@/lib/device-description"
import { downloadEditableProject } from "@/lib/project-zip"
import { assertReadableGeneration } from "@/lib/system-generation"
import { declaresTouch, migrateProject } from "@/lib/object-types"
import { DEFAULT_THEME_ID, defaultThemeIdFor, themeFor, type Variant } from "@/lib/themes"
import { ThemeViewContext } from "@/components/property-panel/theme-context"
import { FooterSwitch } from "@/components/footer-switch"
import type { ObjectType } from "@/lib/object-types"
import { askedValueAnswered, LEVEL_AWAIT_MS, LEVEL_PUBLISH_MIN_MS, sameLevel, type AskedValue } from "@/lib/asked-value"

export interface ScreenObject {
  id: string
  type: ObjectType
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, any>
  zIndex: number
  // Only meaningful on "switcher" (whose children must all be "panel"),
  // "panel" (whose children are arbitrary regular objects) and "group"
  // (anything but a switcher or a panel; the designer's alone, see
  // lib/object-groups.ts) - every other type is always a leaf. Child coordinates are relative to this object's
  // own (x, y) origin, not absolute screen coordinates - this is what makes
  // moving/duplicating a tab-control (or, later, any container) a single
  // coherent operation instead of manually re-translating every descendant.
  // A "panel" has no x/y/width/height of its own beyond the defaults - it
  // always fills its parent tab-control's box exactly, since only one panel
  // is ever shown at a time in that same screen region.
  children?: ScreenObject[]
  // Locked in the object tree: the canvas neither selects, moves nor resizes
  // it, and clicks go through to what lies under it. It stays selectable in
  // the tree, for its properties. Made for a screen-sized icon at the bottom
  // - since 2026-09-28 the way a screen gets a picture behind it - which
  // would otherwise catch every click on the canvas (#24). The designer's
  // alone: no device reads it.
  locked?: boolean
}

export interface SnapGuide {
  id: string
  type: "vertical" | "horizontal"
  position: number
  visible: boolean
}

export interface Project {
  name: string
  screens: ProjectScreen[]
  assets: ProjectAsset[]
  fonts: ProjectFont[] // Added fonts to the project interface
  hardwareButtons: HardwareButton[] // Added hardware buttons to the project interface
  snapGuides: SnapGuide[]
  settings: ProjectSettings
  topics: Topic[]
  // Topics the project computes from others (lib/combined-topics.ts,
  // docs/2026-10-07-live-values.md decisions 10-15).
  combinedTopics?: CombinedTopic[]
  nextId: number // Added nextId for incremental ID generation
  screenWidth: number
  screenHeight: number
  adornment?: string // SVG data for project adornment
  adornmentDrawingArea?: {
    // Where the screen sits within the adornment SVG's own coordinate
    // space - read off adornment.svg's <rect id="screen"> at DDF-import
    // time (lib/device-description.ts's extractScreenRect), not hand-
    // authored.
    x: number
    y: number
    width: number
    height: number
  }
  // The loaded device's own DDF zip, raw bytes as base64 - embedded whole
  // (not the denormalized fields above, which stay for backward-compat
  // reading of older projects) so this project is self-contained: opening
  // it never needs to re-resolve a device from this instance's public/ddf/
  // again. Written to project.zip as _source/ddf.zip on download, read
  // back on upload. Undefined = project predates this field, or was
  // created before any device was chosen. See docs/nested-provenance.md's
  // "Version compatibility" > Fall 1.
  embeddedDdfZipBase64?: string
}

export interface ProjectScreen {
  id: string
  name: string
  objects: ScreenObject[]
  // Screen background color - inherited from the master when unset, and
  // needs no override-none flag: undefined
  // already unambiguously means "inherit, or fall back to white"
  // (screens-panel.tsx's addScreen never sets this at creation, so there's
  // no existing "explicit white" state to confuse it with - see
  // lib/master-screen.ts's resolveBackgroundColor).
  backgroundColor?: string
  gridColor?: string // Grid color (auto-calculated if not set)
  // This screen's theme; undefined = its master's (lib/themes.ts themeFor),
  // the same "undefined inherits" convention as backgroundColor above. A
  // master always has one.
  themeId?: string
  // This screen's typography, by name; undefined = its master's, else
  // "Standard" (lib/size-scale.ts typographyNameOf) - beside the theme,
  // since the two are the screen's look (user, 2026-09-30).
  typography?: string
  buttonActions?: Record<string, HardwareButtonAction> // Screen-specific button actions (buttonId -> action)
  // Master-screen mechanism: a screen with isMaster:true is a normal
  // ProjectScreen whose objects get merged onto every screen that
  // references it via masterScreenId - visible everywhere it's assigned,
  // but only ever editable on the master screen itself. Multiple masters
  // can exist; a normal screen picks at most one. Master screens never
  // appear as a "Go to Screen" target, in next/previous-screen navigation,
  // or in the flattened device export (lib/project-zip.ts inlines their
  // objects into each assigned screen instead).
  isMaster?: boolean
  // "popup": out of next/previous and every «Go to Screen» picker, opened
  // over the current screen by «Open Popup»; its master gives the theme
  // only, «Show master» is always off. Absent: a main screen. See
  // lib/popup.ts, docs/2026-10-06-popup-screens.md.
  screenType?: "popup"
  masterScreenId?: string
  // Per-screen opt-out for its assigned master (irrelevant when
  // masterScreenId is unset). Default true.
  showMaster?: boolean
  // Same asset library/picker as icon/SoftwareButton objects
  // (project.assets, IconSelectorModal) - not meaningful on a master
  // screen (never appears in navigation), so the picker for it is hidden
  // there (project-settings-dialog.tsx's Screens tab). Purely designer-side
  // for now (2026-08-11): not yet exported to the device or rendered by
  // any firmware - added ahead of an M5 Dial screen-switch navigator
  // overlay that doesn't exist yet, same as buttonActions/HardwareButton
  // fields were added ahead of their own firmware dispatch.
  iconAssetId?: string
  // The screen icon made live (docs/2026-10-08-navigator.md decision 6): a
  // live value whose Otherwise is iconAssetId. See lib/screen-icon.ts.
  iconLive?: LiveValue
  // «Hide screen» (docs/2026-10-08-navigator.md decision 3): out of
  // next/previous and the navigator, still a «Go to Screen» target. A main
  // screen only. Absent: shown.
  hidden?: boolean
}

export interface ProjectAsset {
  id: string
  name: string
  type: "svg" | "icon" | "image"
  data: string
  size?: number
}

// What an icon selection is *for* - which of the several places in the UI
// asked for an icon, so handleIconSelect knows where to put the answer.
//
// Named and exported rather than left inline on the useState, because
// property-panel.tsx forwards the setter and had been declaring `type:
// string` for it: wide enough to accept a typo at every call site it makes,
// and incompatible with the real setter, which is what the type checker was
// complaining about until 2026-08-22.
export interface IconSelectorContext {
  type: "canvas" | "value-icon-pair" | "icon-properties" | "software-button" | "screen-icon" | "switch-state" | "live-value-rule" | "screen-live-rule"
  pairIndex?: number
  screenId?: string
  stateIndex?: number
  // Which of a Switch state's two icon slots this selection targets - only
  // meaningful for type "switch-state". Defaults to "normal" (not required
  // at every call site, since it was added after "switch-state" itself -
  // see the Active Icon addition, 2026-08-14).
  slot?: "normal" | "active"
  // A live icon's result (docs/2026-10-07-live-values.md): which live value,
  // and a rule's index, Otherwise or No value yet.
  liveValueId?: string
  target?: number | "otherwise" | "noValueYet"
}

export interface ProjectFont {
  id: string
  name: string
  displayName: string
  path: string // Path within the project, e.g., "fonts/myfont.bdf"
  size: number // Font size in pixels
  data?: string // Font data (e.g., BDF content) - only loaded when project is active
  internalName?: string // Internal font name from fontmap.json (e.g., "u8g2_font_helvR08_tf")
  ascent?: number // Font ascent in pixels
  descent?: number // Font descent in pixels
  // "bdf" (default when unset) is a pixel font drawn manually via BDFFont.
  // "ttf" is a real font registered with the browser (lib/ttf-font-registry.ts)
  // and rendered through the canvas's normal ctx.font text path.
  format?: "bdf" | "ttf"
  // The family and weight the device's DDF gives it, for text styles
  // (docs/2026-09-30-size-scale.md). A font added by hand has neither.
  family?: string
  weight?: "regular" | "bold"
  // Distance from a TTF font's top to its baseline, measured once when the
  // font is added (add-ttf-font-dialog.tsx) from the browser's own text
  // metrics. Only meaningful for format "ttf" - a BDF carries its ascent
  // explicitly instead. It was already being written into saved projects
  // while undeclared here; declaring it is the honest half of that, since
  // the data is in users' files either way.
  baselineOffset?: number
}

export interface PropertyPanelProps {
  selectedObject: ScreenObject | null
  selectedObjects: ScreenObject[]
  onUpdateObject: (objectId: string, updates: Partial<ScreenObject>) => void
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenObject>) => void
  currentScreen: ProjectScreen
  onUpdateScreenColors: (backgroundColor?: string, gridColor?: string) => void
  projectAssets: ProjectAsset[]
  onAddAsset: (asset: ProjectAsset) => void
  topics: Topic[]
  fonts: ProjectFont[] // Added fonts prop to PropertyPanelProps
  colorDepth: "1bit" | "4bit" | "24bit" // Added color depth for color picker
  setProjectSettingsTab: (tab: string) => void
  setShowProjectSettings: (show: boolean) => void
  onOpenIconSelector: (pairIndex: number) => void
  onOpenIconPropertiesSelector?: () => void // Added handler for icon properties selector
  // Hardware button props
  focusedHardwareButton: { id: string; key: number } | null
  allScreens: ProjectScreen[]
  onSaveScreenButtonAction: (buttonId: string, action: HardwareButtonAction | null) => void
  // ID generation for sub-objects
  nextId: number
  onIncrementNextId: () => void
}

export interface ProjectSettings {
  exportFormat: "esp32" | "arduino" | "json"
  gridSize: number
  snapTolerance: number
  snapGrid: string // JSON string like {"horizontal":[4, 200], "vertical":[20,40,60]}
  selectedIconAssetId?: string // Temporary storage for selected icon
  colorDepth: "1bit" | "4bit" | "24bit" // Screen color depth
  supportsSoftwareButtons?: boolean // Hardware supports software buttons (touch screen)
  deviceId?: string // ID of the loaded Device Description File, if any
  deviceName?: string // Display name of the loaded device
  supportedObjectTypes?: string[] // Object types the device's firmware actually renders; undefined = no restriction
  // Device-specific action ids the loaded DDF declares (deviceActions[] in
  // device.json) - what the "Device Action" button-action type offers, in
  // exactly the order the device named them. Undefined/empty = this device
  // offers none and the option stays hidden. See lib/device-actions.ts.
  deviceActions?: string[]
  // How placeholders in texts write numbers (docs/2026-09-25-text-placeholders.md):
  // the two characters are all a device reads, so a new country never needs
  // firmware. Absent in a project saved before 2026-09-25, which then gets
  // Switzerland's (lib/placeholders.ts projectSeparators).
  decimalSeparator?: string
  thousandsSeparator?: string
  // Identity of the DDF this project was last built against - the hash of
  // that DDF's exact bytes, see lib/ddf-name.ts. Not a version and has no
  // ordering: it answers "same DDF or a different one", which is the only
  // question anyone ever actually asked the ddfVersion it replaced
  // (2026-08-21). The system's one *version* is settings-independent, see
  // lib/system-generation.ts. Undefined = project predates this field.
  ddfHash?: string
  // How the device is physically mounted relative to its native (0deg)
  // orientation - swaps screenWidth/screenHeight at 90/270 (see
  // lib/device-description.ts's resolveRotatedScreenSize). Only ever set via
  // Project Settings, never at project creation. Undefined (old projects,
  // or a device with no DDF screen.allowedRotations) means native/0.
  // Existing objects are NOT repositioned when this changes - they can end
  // up outside the new screen bounds, which is deliberate (see
  // project-settings-dialog.tsx's rotation picker): a real device mounted
  // rotated needs the same honest "here's what's now off-screen" signal a
  // designer redesigning for it would want, not an auto-layout guess.
  rotation?: 0 | 90 | 180 | 270
  // "android" routes ExportDialog to exportAndroidProject() (generic JSON +
  // PNG bundle, lib/android-export.ts) instead of the firmware BMP/PBM
  // exporter. Undefined/"firmware" = existing behavior, unchanged.
  devicePlatform?: "firmware" | "android"
  // The server-side key from 2026-08-02 to 2026-09-24, when a project's name
  // became its identity (docs/2026-09-23-explicit-save.md). No longer
  // written; files from before still carry it, and it is dropped on load.
  projectId?: string
  // Set/updated on every successful "Deploy to Device" (deploy-dialog.tsx)
  // to the target device's own MQTT instanceId. Which project is on which
  // device is also kept server-side, by name (app/api/by-instance/). Undefined
  // until the project has been deployed at least once.
  boundInstanceId?: string
  // See DeviceDescriptionFile.needsPageIconsInSize's own comment - a device
  // opts into per-screen icons being baked into the export (e.g. for an
  // on-device screen-switch navigator), and says at what square pixel size.
  // Undefined = device doesn't want them, export omits page icons entirely.
  needsPageIconsInSize?: number
  // The device's scale (docs/2026-09-30-size-scale.md): pixels per
  // millimetre, and the typographies its DDF offers. Both absent on a device
  // whose DDF does not say them - such a project has no scale.
  pixelsPerMm?: number
  typographies?: Typography[]
  // Round or rectangular, from the DDF's screen.shape. Absent: rectangular.
  screenShape?: "rect" | "round"
  // The close button the device draws on an open popup, from the DDF's
  // screen.popupCloseRadius (lib/popup.ts popupCloseBadge). Absent: none.
  popupCloseRadius?: number
}

export interface Topic {
  id: string // Unique identifier for the topic
  topic: string // Topic name/path
  type: "numeric" | "text" | "json"
  examples: string[] // for "json": each example is a full JSON payload string, e.g. '{"temp":23,"humid":56}'
  // Only meaningful when type === "json". Each subtopic is a field pulled
  // out of this topic's JSON payload, selectable everywhere a regular
  // topic can be (TopicSelector renders these as this topic's children).
  // An object binds to one via the composite string "<topic>#<path>" -
  // properties.topic stays a single string everywhere else in the app;
  // only the resolution layer (lib/json-path.ts + lib/render-screen.ts's
  // getPreviewValueFromTopic) needs to know "#" splits topic from path.
  // "#" can't appear in a real MQTT topic name (reserved wildcard char),
  // so it's a collision-free separator.
  subtopics?: JsonSubtopic[]
  // What a mock host should answer when this topic receives a command
  // (2026-08-25). Test-only data, like `examples` beside it: no firmware
  // reads it, and like `examples` it travels in the device export anyway
  // rather than being stripped, because the HIL tooling reads the exported
  // project and a second, divergent copy is worse than a few unread bytes.
  //
  // Declared on the COMMAND topic, not on the state topic it changes. That
  // is where a mock subscribes, so it is where it looks; and one command
  // can move several states at once - an "all off" button is exactly that -
  // which is one entry here and would be several scattered declarations of
  // the same event on the other side.
  //
  // Only for what cannot be derived. A Switch already declares both halves
  // of its own round trip (topic/writeTopic plus each state's readValue/
  // writeValue), and hil/simulate-project.js derives that mapping rather
  // than asking for it here - writing it out twice would be a fact with two
  // homes and one future disagreement. What needs declaring is everything
  // whose consequence lives only in the real automation: a SoftwareButton's
  // send-mqtt action, and a hardware knob publishing "up"/"down" at a
  // brightness that no object in the project describes.
  mock?: MockRule[]
}

// One command payload and what it does. `when` is matched against the
// received payload exactly (trimmed), the same comparison a Switch state's
// readValue uses - not a substring or a pattern, so "up" never accidentally
// matches "wakeup".
export interface MockRule {
  id: string
  when: string
  then: MockEffect[]
}

// One state topic changed by a rule. Two kinds, because a brightness needs
// both: "set" publishes a literal payload, "add" moves the topic's current
// value by a signed amount and clamps it - which is what a rotary encoder
// sending "up" actually means, and the reason a plain value table could
// never express it.
//
// Everything is a string, including the numbers: it is what MQTT carries,
// what a Switch's readValue/writeValue already are, and it keeps an empty
// input field distinguishable from a deliberate zero.
export interface MockEffect {
  id: string
  topic: string
  kind: "set" | "add"
  // "set": the payload to publish. "add": a signed number.
  value: string
  // "add" only, both optional. Without a lower bound an unknown topic
  // starts at 0; without an upper one it grows without limit.
  min?: string
  max?: string
}

export interface JsonSubtopic {
  id: string
  path: string // JSONPath shorthand member/index syntax into the JSON payload, e.g. "temp", "$.temp", "nested.temp", "readings[0].value" - see lib/json-path.ts
  label?: string // defaults to `path` when unset
  type: "numeric" | "text" // the type of the VALUE once extracted
}

export interface HardwareButton {
  // The adornment SVG's own element id (e.g. "button-10") - also exactly
  // what the device's firmware itself uses to key button actions in the
  // exported project.json, no separate mapping anywhere (2026-08-16, see
  // docs/device-contract.md §5). Every id^="button" element in the
  // adornment is a hardware button; there's no longer a device.json
  // hardwareButtons[] array declaring them separately.
  id: string
  name: string
}

export interface HardwareButtonAction {
  // "none" means "deliberately does nothing here" - distinct from a screen
  // having no entry for this button at all, which instead falls through to
  // its master (see lib/hardware-button-actions.ts's resolveButtonAction).
  // Never appears in an exported project.json - see that file's header
  // comment for why.
  type:
    | "next-screen"
    | "previous-screen"
    | "goto-screen"
    | "send-mqtt"
    | "goto-setup-mode"
    | "device-action"
    | "adjust-level"
    | "open-popup"
    | "close-popup"
    | "none"
  // For goto-screen, and for open-popup: the popup screen it opens
  // (lib/popup.ts). close-popup takes nothing - it closes whatever is open.
  targetScreenId?: string
  mqttTopic?: string // For send-mqtt
  mqttMessage?: string // For send-mqtt
  // For device-action: one of the ids the loaded device's DDF declares in
  // deviceActions[] (ProjectSettings.deviceActions). The designer never
  // interprets it - it only offers the ids the device named and writes the
  // chosen one straight through to the export, see lib/device-actions.ts.
  deviceActionId?: string
  // For adjust-level (lib/adjust-level.ts): the slider, dial or switcher one
  // press moves one step, and which way. The direction is explicit because a
  // device knows its buttons by id, not by side.
  targetObjectId?: string
  direction?: "up" | "down"
}

// Compact one-line summary of an action - used wherever a default/override
// action needs to be shown at a glance (hardware-button-action-fields.tsx's
// "overridden by" status, project-settings-dialog.tsx's adornment tooltip)
// without duplicating the same switch in both places.
export function describeHardwareButtonAction(action: HardwareButtonAction, screens: ProjectScreen[]): string {
  switch (action.type) {
    case "next-screen":
      return "Next screen"
    case "previous-screen":
      return "Previous screen"
    case "goto-screen":
      return `Go to "${screens.find((s) => s.id === action.targetScreenId)?.name ?? action.targetScreenId ?? "?"}"`
    case "send-mqtt":
      return `Send MQTT (${action.mqttTopic ?? ""})`
    case "goto-setup-mode":
      return "Enter setup mode"
    case "device-action":
      return action.deviceActionId ? describeDeviceAction(action.deviceActionId) : "Device action"
    case "adjust-level":
      return action.direction === "down" ? "Adjust a slider or dial (down)" : "Adjust a slider or dial (up)"
    case "open-popup":
      return `Open popup "${screens.find((s) => s.id === action.targetScreenId)?.name ?? "?"}"`
    case "close-popup":
      return "Close the popup"
    case "none":
      return "No action"
    default:
      return action.type
  }
}

// Utility functions for color extraction and recoloration
export interface ColorRecoloration {
  originalColor: string
  newColor: string
}

// How late a value only screens out of view read reaches liveValues - the
// list of topic values beside the preview, and those screens once shown,
// which take in everything at once anyway (#58).
const LIVE_QUIET_MS = 500

export const extractColorsFromSVG = (svgContent: string): string[] => {

  let actualSvgContent = svgContent

  if (svgContent.startsWith("data:image/svg+xml;base64,")) {
    try {
      const base64Content = svgContent.replace("data:image/svg+xml;base64,", "")
      actualSvgContent = atob(base64Content)
    } catch (error) {
      console.error("[v0] Failed to decode base64 SVG:", error)
      return []
    }
  } else if (svgContent.startsWith("data:image/svg+xml,")) {
    // Handle URL-encoded SVG data URLs
    try {
      actualSvgContent = decodeURIComponent(svgContent.replace("data:image/svg+xml,", ""))
    } catch (error) {
      console.error("[v0] Failed to decode URL-encoded SVG:", error)
      return []
    }
  }

  const foundColors = new Set<string>()

  // Remove comments and normalize whitespace
  const cleanSvg = actualSvgContent.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ")

  // 1. Find all hex colors (3 or 6 digits)
  const hexMatches = cleanSvg.match(/#[0-9a-fA-F]{3,6}/g)
  if (hexMatches) {
    hexMatches.forEach((color) => {
      // Normalize 3-digit hex to 6-digit
      let normalized = color.toLowerCase()
      if (normalized.length === 4) {
        normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      }
      foundColors.add(normalized)
    })
  }

  // 2. Find RGB/RGBA colors - Fixed regex pattern
  const rgbMatches = cleanSvg.match(/rgba?[^)]+/g)
  if (rgbMatches) {
    rgbMatches.forEach((color) => {
      foundColors.add(color.toLowerCase())
    })
  }

  // 3. Find named colors (common ones)
  const namedColorPattern =
    /\b(?:red|green|blue|yellow|orange|purple|pink|brown|gray|grey|white|black|cyan|magenta|lime|navy|teal|olive|maroon|silver|aqua|fuchsia|gold|coral|salmon|tan|beige|ivory|cream|khaki|crimson|indigo|violet|plum|orchid|rose|peach|apricot|amber|lemon|mint|jade|emerald|turquoise|azure|sky|steel|slate|charcoal|copper|bronze|brass|honey|caramel|vanilla|linen|snow)\b/gi
  const namedMatches = cleanSvg.match(namedColorPattern)
  if (namedMatches) {
    namedMatches.forEach((color) => foundColors.add(color.toLowerCase()))
  }

  // 4. Check fill and stroke attributes specifically
  const fillStrokePattern = /(?:fill|stroke)\s*[=:]\s*["']?([^"'\s;>]+)["']?/gi
  let match
  const fillStrokeMatches: string[] = []
  while ((match = fillStrokePattern.exec(cleanSvg)) !== null) {
    const color = match[1].toLowerCase().trim()
    fillStrokeMatches.push(color)
    // Skip transparent and none, but include currentColor as recolorable
    if (!color.match(/^(transparent|none)$/)) {
      foundColors.add(color)
    }
  }

  const colors = Array.from(foundColors).sort()
  return colors
}

export const applyColorRecolorations = (svgContent: string, recolorations: ColorRecoloration[]): string => {

  if (recolorations.length === 0) {
    return svgContent
  }

  let modifiedSvg = svgContent
  let totalReplacements = 0

  recolorations.forEach(({ originalColor, newColor }) => {
    if (originalColor === newColor) return // Skip if colors are the same

    const originalLower = originalColor.replace("#", "").toLowerCase()

    // Escape special regex characters
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    const replacements = [
      // Fill attributes with quotes
      {
        from: new RegExp(`fill\\s*=\\s*["']#${escapeRegex(originalLower)}["']`, "gi"),
        to: `fill="#${newColor}"`,
      },
      // Fill attributes without quotes
      {
        from: new RegExp(`fill\\s*=\\s*#${escapeRegex(originalLower)}(?=\\s|>|/)`, "gi"),
        to: `fill="#${newColor}"`,
      },
      // Stroke attributes with quotes
      {
        from: new RegExp(`stroke\\s*=\\s*["']#${escapeRegex(originalLower)}["']`, "gi"),
        to: `stroke="#${newColor}"`,
      },
      // Stroke attributes without quotes
      {
        from: new RegExp(`stroke\\s*=\\s*#${escapeRegex(originalLower)}(?=\\s|>|/)`, "gi"),
        to: `stroke="#${newColor}"`,
      },
      // CSS style attributes
      {
        from: new RegExp(`fill\\s*:\\s*#${escapeRegex(originalLower)}`, "gi"),
        to: `fill: #${newColor}`,
      },
      {
        from: new RegExp(`stroke\\s*:\\s*#${escapeRegex(originalLower)}`, "gi"),
        to: `stroke: #${newColor}`,
      },
    ]

    replacements.forEach(({ from, to }) => {
      const beforeLength = modifiedSvg.length
      const beforeMatches = modifiedSvg.match(from)
      modifiedSvg = modifiedSvg.replace(from, to)
      const afterMatches = modifiedSvg.match(from)

      if (beforeMatches && (!afterMatches || beforeMatches.length !== afterMatches.length)) {
        totalReplacements++
      }
    })
  })

  return modifiedSvg
}

// Which device a project is bound to is recorded by a deploy, not edited, so
// an undo keeps the current binding instead of restoring the one from the
// step (decided 2026-09-23, docs/2026-09-23-undo.md). Module-level so the
// history hook sees a stable function.
// What an undo step remembers besides the project: where the user was.
interface EditorView {
  screenId: string
  selection: string[]
}

// The project's name travels the same way since 2026-09-24: it is the name
// the project is saved under (docs/2026-09-23-explicit-save.md), a fact like
// the binding, so undoing past a save must not bring back an older name.
// A size step stays only while the object measures it (lib/size-scale.ts
// withHonestSteps); a project without a scale has no steps to keep.
function honest(objects: ScreenObject[], pixelsPerMm: number | undefined): ScreenObject[] {
  return pixelsPerMm ? withHonestSteps(objects, pixelsPerMm) : objects
}

function carryDeviceBinding(restored: Project, current: Project): Project {
  const sameBinding = restored.settings.boundInstanceId === current.settings.boundInstanceId
  if (sameBinding && restored.name === current.name) return restored
  return {
    ...restored,
    name: current.name,
    settings: sameBinding ? restored.settings : { ...restored.settings, boundInstanceId: current.settings.boundInstanceId },
  }
}

function createDefaultProject(): Project {
  return {
    name: "New Project",
    screenWidth: 400,
    screenHeight: 300,
    // Every project starts with a master screen, and its one regular screen
    // already linked to it - matches addScreen()'s own "new screens default
    // to the first existing master" convention (screens-panel.tsx), applied
    // from the very first screen a project ever has instead of leaving it
    // masterless until the user manually assigns one.
    screens: [
      {
        id: "master-1",
        name: "Master 1",
        objects: [],
        isMaster: true,
        // Every master has a theme, and its screens inherit it
        // (lib/themes.ts themeFor; user, 2026-09-24).
        themeId: DEFAULT_THEME_ID,
      },
      {
        id: "screen-1",
        name: "Screen 1",
        objects: [],
        masterScreenId: "master-1",
      },
    ],
    assets: [],
    fonts: [],
    hardwareButtons: [],
    snapGuides: [],
    settings: {
      exportFormat: "esp32",
      gridSize: 20,
      snapTolerance: 8,
      snapGrid: '{"horizontal":[], "vertical":[]}',
      colorDepth: "24bit",
      decimalSeparator: DEFAULT_SEPARATORS.decimal,
      thousandsSeparator: DEFAULT_SEPARATORS.thousands,
    },
    topics: [
      {
        id: "topic_1",
        topic: "Freshwater/Level",
        type: "numeric",
        examples: ["0", "25", "50", "75", "100"],
      },
    ],
    nextId: 3,
  }
}

// initialName: the project to open on mount - the page at /projects/<name>.
export function ProjectEditor({ initialName }: { initialName?: string } = {}) {
  // Limit zoom to integer multiples (1x, 2x, 3x, 4x, 5x) for pixel-perfect rendering
  // This ensures all coordinate calculations are integers, preventing anti-aliasing blur
  const zoomLevels = [100, 200, 300, 400, 500]

  useEffect(() => {
    // Component mounted
    return () => {
      // Component unmounting
    }
  }, [])

  const [project, setProjectState] = useState<Project>(createDefaultProject)
  // Every change goes through here, so a group's box is its children's
  // bounding box again after any of them moved, grew or left, and a group
  // left empty is gone (lib/object-groups.ts) - without a single call site
  // having to remember. Same reference when there was nothing to fix, so
  // it costs no render and no undo step.
  const setProject = useCallback<Dispatch<SetStateAction<Project>>>((action) => {
    // Then the layout (lib/layout.ts): every container's children placed
    // again, with the same promise - nothing moved, same reference.
    setProjectState((prev) => layoutProject(normalizeProjectGroups(typeof action === "function" ? action(prev) : action)))
  }, [])

  const [currentScreenId, setCurrentScreenId] = useState("screen-1")
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([])
  // The container whose children the canvas is working on - a switcher's
  // panel, opened from its tab strip, or a group, entered with a double
  // click (lib/object-groups.ts). null = the screen's own objects. Transient
  // UI state, not part of the project data: while set, the canvas hit-tests
  // and creates inside that container only, and a switcher on the way to it
  // shows the panel it is in regardless of its condition. Left again
  // whenever selection moves to something the container does not hold (see
  // clearEditingUnlessRelated below) - matches the earlier design
  // for panels: "sobald ich den tab deaktiviere, wird nur der aktivierte tab
  // (bestimmt durch den ersten Testwert) angezeigt".
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null)

  // Every setProject below is an edit and so an undo step, with three kinds
  // of exception, each named where it happens: a load, new project or
  // restore goes through history.replace() and clears history; the deploy's
  // device binding goes through history.amend() and is no step. The Project
  // Settings dialog and the screens panel get plain setProject - what they
  // write is the user's edit.
  //
  // Each step also remembers the screen and selection it was made with, and
  // undo brings them back (applyRestoredView).
  const historyView = useMemo<EditorView>(
    () => ({ screenId: currentScreenId, selection: selectedObjectIds }),
    [currentScreenId, selectedObjectIds],
  )
  const history = useProjectHistory(project, setProject, historyView, carryDeviceBinding)

  // Undo and redo land on the screen the step was made on, with its
  // selection. Ids that are not on that screen any more are dropped - a
  // guard, not the expected case. The screen falls back to the first one,
  // because currentScreen is looked up with a non-null assertion and a
  // restore can remove the screen being shown (undoing "Add screen").
  const applyRestoredView = useCallback((entry: HistoryEntry<Project, EditorView> | null) => {
    if (!entry) return
    const screen = entry.project.screens.find((s) => s.id === entry.view.screenId) ?? entry.project.screens[0]
    setCurrentScreenId(screen.id)
    setSelectedObjectIds(entry.view.selection.filter((id) => findObjectById(screen.objects, id)))
    setEditingContainerId((id) => (id && findObjectById(screen.objects, id) ? id : null))
  }, [])

  // "Ctrl+" or, on a Mac, "⌘" for the undo/redo tooltips. Set after mount:
  // the server render cannot know the platform, and guessing would make the
  // first client render disagree with it.
  const [shortcutPrefix, setShortcutPrefix] = useState("Ctrl+")
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcutPrefix("⌘")
  }, [])

  // The toolbar buttons; the keys call the same pair in handleKeyDown.
  const handleUndo = useCallback(() => applyRestoredView(history.undo()), [applyRestoredView, history.undo])
  const handleRedo = useCallback(() => applyRestoredView(history.redo()), [applyRestoredView, history.redo])

  // A Version History restore is another project as far as history goes -
  // cleared, not undone across. It stays on the current screen if the
  // version has it, and otherwise moves off it for the same reason as undo:
  // before this, a version without the screen being shown crashed the page.
  const restoreVersion = useCallback(
    (snapshot: Project) => {
      // A version saved before a migration (a type rename, colours becoming
      // roles) comes in through this door too, so it goes through the same
      // migration as a file import - it used to skip it.
      const restored = migrateProject(structuredClone(snapshot))
      history.replace(restored)
      applyRestoredView({ project: restored, view: { screenId: currentScreenId, selection: [] } })
    },
    [history.replace, applyRestoredView, currentScreenId],
  )

  const [canvasZoom, setCanvasZoom] = useState(1) // Start at 100% (1x)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  // Whether the device mockup is drawn over the screen content (bottom-bar
  // toggle). On by default, i.e. unchanged behavior. Turning it off exposes
  // the bare framebuffer - notably the corners a round device physically
  // can't show, which the adornment's own off-screen covers otherwise hide
  // (see hooks/use-adornment-image.ts). A view preference, not project data,
  // so it lives in localStorage rather than in the project.
  const [showAdornment, setShowAdornment] = useState(true)
  useEffect(() => {
    setShowAdornment(window.localStorage.getItem("schaltli.showAdornment") !== "false")
  }, [])
  // Right panel (Objects/Property/Topic-values) width, resizable by
  // dragging its left edge - see the handle rendered just before it below.
  // Default was previously a fixed w-80 (320px); 480 is that same value
  // 50% wider, per request (2026-08-14).
  const RIGHT_PANEL_MIN_WIDTH = 280
  const RIGHT_PANEL_MAX_WIDTH = 900
  const [rightPanelWidth, setRightPanelWidth] = useState(480)
  const [isResizingRightPanel, setIsResizingRightPanel] = useState(false)

  useEffect(() => {
    if (!isResizingRightPanel) return
    // Text-selection during the drag isn't limited to the panel itself -
    // the pointer crosses the canvas and everything else on the way there
    // too - so suppress it document-wide for the duration, not just on the
    // panel's own element.
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"
    const handleMouseMove = (e: MouseEvent) => {
      // Panel sits to the right of the pointer while dragging its left
      // edge, so width shrinks as the pointer moves right and vice versa -
      // distance from the viewport's right edge is exactly the new width.
      const newWidth = window.innerWidth - e.clientX
      setRightPanelWidth(Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, newWidth)))
    }
    const handleMouseUp = () => setIsResizingRightPanel(false)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizingRightPanel])
  const [activeTool, setActiveTool] = useState<"select" | ObjectType | "background" | "baustein" | "row">("select")
  // The shape the Table tool draws (docs/2026-10-03-free-screens.md).
  const [tableShape, setTableShape] = useState<TableShapeId>(DEFAULT_TABLE_SHAPE)
  const selectTableShape = useCallback((shape: TableShapeId) => {
    setTableShape(shape)
    setActiveTool("table")
  }, [])
  // The row the Row tool carries (docs/2026-10-09-snap-tables.md, module
  // snap-table-rows).
  const [rowTemplate, setRowTemplate] = useState<RowTemplate>("icon-label-switch")
  const selectRowTemplate = useCallback((template: RowTemplate) => {
    setRowTemplate(template)
    setActiveTool("row")
  }, [])
  // The building-block tool (lib/bausteine.ts): the catalog entry picked in
  // the Block menu while its options are being chosen; then, once Insert is
  // pressed, armed with them and the values its topics hold - the rectangle
  // dragged next places it. Both null: no block in flight.
  const [blockChoice, setBlockChoice] = useState<CatalogEntry | null>(null)
  const [armedBlock, setArmedBlock] = useState<{
    entry: CatalogEntry
    values: Record<string, string>
    options: BausteinOptions
  } | null>(null)
  const [showIconSelector, setShowIconSelector] = useState(false)
  const [iconClickPosition, setIconClickPosition] = useState<{ x: number; y: number } | null>(null)
  const [iconSelectorContext, setIconSelectorContext] = useState<IconSelectorContext | null>(null)
  const [projectSettingsTab, setProjectSettingsTab] = useState<string>("")
  const [showProjectSettings, setShowProjectSettings] = useState<boolean>(false)
  const [showMqttDiscovery, setShowMqttDiscovery] = useState(false)
  const [showToolsRibbon, setShowToolsRibbon] = useState(true)
  const [deviceGateError, setDeviceGateError] = useState<string | null>(null)
  // Set when a project's referenced device isn't available on this instance
  // but was opened anyway using the data embedded in the project file.
  const [deviceStaleWarning, setDeviceStaleWarning] = useState<string | null>(null)
  const { toast } = useToast()

  // Explicit saving (docs/2026-09-23-explicit-save.md). Taking the saved name
  // is no edit, so it goes in through history.amend like the deploy binding.
  // Every load below that brings in a project from outside calls
  // save.markUnnamed(), so a Ctrl+S never writes it into the project before.
  const projectOpen = !!project.settings.deviceId
  const save = useProjectSave(project, history.amend, projectOpen)

  // The draft in the browser (lib/project-draft.ts): the key it is kept
  // under - the saved name, or for a project without one a random key made
  // when it was loaded.
  const [untitledDraftKey, setUntitledDraftKey] = useState(newUntitledDraftKey)
  const draftKey = save.savedName !== null ? draftKeyForName(save.savedName) : untitledDraftKey
  // Which Save dialog is open: the first save of an unnamed project, or a
  // Save As (any time, under a new or an existing name).
  const [saveDialog, setSaveDialog] = useState<"save" | "saveAs" | null>(null)
  // Whoever waits for the Save dialog to end (requestSave): what it saved,
  // or null when it was cancelled.
  const saveDialogDoneRef = useRef<((saved: SaveResult<Project> | null) => void) | null>(null)
  const finishSaveDialog = useCallback((saved: SaveResult<Project> | null) => {
    saveDialogDoneRef.current?.(saved)
    saveDialogDoneRef.current = null
  }, [])
  const handleSaveAs = useCallback(() => setSaveDialog("saveAs"), [])

  // Saves the open project: a version under its name, or - never saved yet -
  // through the Save dialog. Resolves to what was saved, or null if nothing
  // was (cancelled, or failed - which says so in a toast).
  const requestSave = useCallback(async (): Promise<SaveResult<Project> | null> => {
    if (save.savedName === null) {
      return new Promise((resolve) => {
        saveDialogDoneRef.current = resolve
        setSaveDialog("save")
      })
    }
    try {
      return await save.saveVersion()
    } catch (error) {
      toast({
        title: "Could not save",
        description: error instanceof Error ? error.message : "Saving failed",
        variant: "destructive",
      })
      return null
    }
  }, [save.savedName, save.saveVersion, toast])
  const handleSave = useCallback(() => void requestSave(), [requestSave])

  // Deploy saves first (docs/2026-09-23-explicit-save.md): what is on a
  // device is always on the server. A saved, unchanged project is not saved
  // again - the deploy marks the version it already is.
  const saveBeforeDeploy = useCallback(async (): Promise<SaveResult<Project> | null> => {
    if (save.savedName !== null && save.savedVersionId !== null && !save.unsaved) {
      return { name: save.savedName, versionId: save.savedVersionId, project }
    }
    return requestSave()
  }, [save.savedName, save.savedVersionId, save.unsaved, project, requestSave])

  // Before the open project is left inside the designer (New Project,
  // Upload Project, opening another): nothing to ask when it is saved,
  // otherwise «Save changes to "…"?». Resolves to whether to carry on.
  const [leavePromptOpen, setLeavePromptOpen] = useState(false)
  const leaveChoiceRef = useRef<((choice: LeaveChoice) => void) | null>(null)
  const confirmLeave = useCallback(async (): Promise<boolean> => {
    if (!projectOpen || !save.unsaved) return true
    const choice = await new Promise<LeaveChoice>((resolve) => {
      leaveChoiceRef.current = resolve
      setLeavePromptOpen(true)
    })
    setLeavePromptOpen(false)
    if (choice === "cancel") return false
    if (choice === "discard") {
      await deleteDraft(draftKey)
      return true
    }
    return (await requestSave()) !== null
  }, [projectOpen, save.unsaved, requestSave, draftKey])

  // Kept while there are unsaved changes, at most once a second - also
  // while editing without a pause (a trailing debounce would never write
  // then). Gone once saved, or undone back to the saved state.
  const lastDraftWriteRef = useRef(0)
  useEffect(() => {
    if (!projectOpen) return
    if (!save.unsaved) {
      void deleteDraft(draftKey)
      return
    }
    const wait = Math.max(0, 1000 - (Date.now() - lastDraftWriteRef.current))
    const timer = setTimeout(() => {
      lastDraftWriteRef.current = Date.now()
      void putDraft({
        key: draftKey,
        name: save.savedName,
        deviceName: project.settings.deviceName ?? null,
        updatedAt: new Date().toISOString(),
        project,
      })
    }, wait)
    return () => clearTimeout(timer)
  }, [projectOpen, save.unsaved, save.savedName, draftKey, project])

  // A draft under a key the open project no longer has goes: after a first
  // save (untitled -> named), a rename, or leaving a project - which asked
  // first, so it was saved or discarded.
  const previousDraftKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectOpen) return
    const previous = previousDraftKeyRef.current
    if (previous !== null && previous !== draftKey) void deleteDraft(previous)
    previousDraftKeyRef.current = draftKey
  }, [projectOpen, draftKey])

  // No autosave (removed 2026-09-24, docs/2026-09-23-explicit-save.md):
  // nothing writes to the server while editing. Saving is explicit, see
  // useProjectSave below.
  const [clipboard, setClipboard] = useState<ScreenObject[]>([]) // Added clipboard state for copy/paste functionality
  // The hardware button last clicked in the device's frame, and a key that
  // changes with every click: the screen's panel brings that button's row
  // into view (screen-properties.tsx). It used to open a panel of its own.
  const [focusedHardwareButton, setFocusedHardwareButton] = useState<{ id: string; key: number } | null>(null)
  // The object just put on the screen, until its panel has put the focus on
  // the field it is filled in through - a Text's text, say, selected, so it is
  // typed over and Enter finishes it (the user, 2026-10-07).
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)

  // Preview mode: buttons become functional (next/previous/goto-screen,
  // send-mqtt) and the right panel switches from editing properties to
  // simulating incoming topic values - see handlePreviewButtonAction and
  // TopicValuesPanel. previewScreenId is a separate navigation cursor from
  // currentScreenId on purpose: pressing a "next screen" button while
  // previewing must not change which screen you're actually editing, the
  // same way the firmware's own currentScreenIndex_ is independent of
  // whatever the designer has open. previewTopicValues is a runtime-only
  // override (never written back into project.topics / never exported) -
  // it simulates "a message just arrived on this topic" when the preview is
  // not live (see the live preview below).
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  // Which variant of the themes the canvas and the thumbnails show. View
  // state, like the zoom: not saved in the project and not an undo step
  // (docs/2026-09-24-themes-model.md, criterion 4).
  const [themeVariant, setThemeVariant] = useState<Variant>("light")
  const [previewScreenId, setPreviewScreenId] = useState<string | null>(null)
  // The popup open in the preview, over previewScreenId (lib/popup.ts) - one
  // at a time, as on a device.
  const [previewPopupId, setPreviewPopupId] = useState<string | null>(null)
  const [previewTopicValues, setPreviewTopicValues] = useState<Record<string, string>>({})

  // Live preview (docs/2026-09-15-live-data.md, decision 5). Entering preview
  // connects to the broker the way the Deploy dialog does and, once it
  // answers, shows what arrives on the project's topics - nothing where
  // nothing has (decision 6) - and publishes a tap for real. No broker, or
  // Simulation chosen: examples and the mock engine, as before.
  //
  // While connecting it already counts as live and shows no values: showing
  // the examples first would flash a full bar that then empties.
  //
  // liveGenRef tells a connection's late events apart from the current one's:
  // a client ended by switching away still reports its close, and that must
  // not mark the next connection as lost.
  const previewMqtt = useMqttConnection("schaltli-preview")
  const [previewSource, setPreviewSource] = useState<"live" | "simulation">("simulation")
  const [liveStatus, setLiveStatus] = useState<"idle" | "connecting" | "live" | "unavailable" | "lost">("idle")
  const [liveValues, setLiveValues] = useState<Record<string, string>>({})
  const liveGenRef = useRef(0)
  // A level being set by the mouse: what it was dragged to, and what its read
  // topic said when the drag began (docs/2026-09-17-settable-level.md,
  // decision 6c). What a finger asked for is kept HERE, apart from the values
  // the broker delivered, and drawn as the marker - never as the fill. Keyed
  // by the topic the request was about (the setpoint topic where there is one,
  // else the read topic), exactly as the firmware keys its own, and dropped as
  // soon as a message arrives on that topic. No timeout: the bridge asks again
  // every two seconds, so a command that never landed corrects itself - and
  // until it does, the marker sits visibly away from the bar, which is the
  // honest picture rather than a bar that lies (2026-09-18: the preview still
  // moved the fill here long after the devices had stopped).
  //
  // A level's request ends differently since 2026-09-27, as on the devices:
  // while the mouse is held (holding) no answer ends it - the hand is still
  // asking - and after the release only the answer to the value it was
  // released on does, or LEVEL_AWAIT_MS without one. The answers to the values
  // a drag passed through are still on their way then, and each used to end
  // the request and be drawn: the marker went back and forth after the hand
  // had stopped. A Switch's request still ends on any new answer.
  const [askedValues, setAskedValues] = useState<Record<string, AskedValue>>({})
  // Last publish per command topic, for the coalescing (decision 3): 100 ms,
  // ten a second, as on the devices - 250 ms read as a lamp behind the hand.
  const lastLevelPublishRef = useRef<Map<string, number>>(new Map())
  const { connect: connectPreviewMqtt, disconnect: disconnectPreviewMqtt } = previewMqtt

  // Every value the broker has given, current to the message - liveValues is
  // what was last drawn from it (#58): values only screens out of view read
  // reach liveValues within LIVE_QUIET_MS, without a redraw of their own, and
  // all of them the moment the view changes. heardTopicsRef is what the view
  // reads (previewHeardTopics), set further down once the view is known.
  const liveAllRef = useRef<Record<string, string>>({})
  const heardTopicsRef = useRef<Set<string>>(new Set())
  const quietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopLive = useCallback(() => {
    liveGenRef.current++
    disconnectPreviewMqtt()
    if (quietTimerRef.current) clearTimeout(quietTimerRef.current)
    quietTimerRef.current = null
    liveAllRef.current = {}
    setLiveValues({})
    setAskedValues({})
    setLiveStatus("idle")
  }, [disconnectPreviewMqtt])

  const startLive = useCallback(() => {
    const gen = ++liveGenRef.current
    disconnectPreviewMqtt()
    liveAllRef.current = {}
    setLiveValues({})
    setPreviewSource("live")
    setLiveStatus("connecting")
    connectPreviewMqtt()
      .then((client) => {
        if (gen !== liveGenRef.current) {
          client.end(true)
          return
        }
        // What arrives is collected and taken in once per frame (#58): a
        // render per message was what stalled the preview of a large
        // project on a slow browser - thirty values a second, each redrawing
        // everything. Per topic the last value of the frame wins; an asked
        // value is checked against each one in order, as before.
        let pending: [string, string][] = []
        let frame = 0
        const takeIn = () => {
          frame = 0
          const arrived = pending
          pending = []
          if (gen !== liveGenRef.current || arrived.length === 0) return
          const all = liveAllRef.current
          let seen = false
          let quiet = false
          for (const [topic, value] of arrived) {
            if (all[topic] === value) continue
            all[topic] = value
            if (heardTopicsRef.current.has(topic)) seen = true
            else quiet = true
          }
          if (seen) {
            if (quietTimerRef.current) clearTimeout(quietTimerRef.current)
            quietTimerRef.current = null
            setLiveValues({ ...all })
          } else if (quiet && !quietTimerRef.current) {
            quietTimerRef.current = setTimeout(() => {
              quietTimerRef.current = null
              if (gen === liveGenRef.current) setLiveValues({ ...liveAllRef.current })
            }, LIVE_QUIET_MS)
          }
          // The installation has spoken about a topic a finger set: its word
          // wins from here, whether it confirms the value or disagrees with
          // it. A repeat of what was already there is not an answer.
          const now = Date.now()
          setAskedValues((prev) => {
            let next = prev
            for (const [topic, value] of arrived) {
              const held = next[topic]
              if (!held || !askedValueAnswered(held, value, now)) continue
              if (next === prev) next = { ...prev }
              delete next[topic]
            }
            return next
          })
        }
        client.on("message", (topic, payload) => {
          if (gen !== liveGenRef.current) return
          pending.push([topic, payload.toString()])
          if (!frame) frame = requestAnimationFrame(takeIn)
        })
        client.on("close", () => {
          if (gen === liveGenRef.current) setLiveStatus("lost")
        })
        const topics = projectSubscriptionTopics(project)
        if (topics.length > 0) client.subscribe(topics, { qos: 0 })
        setLiveStatus("live")
      })
      .catch(() => {
        if (gen !== liveGenRef.current) return
        setPreviewSource("simulation")
        setLiveStatus("unavailable")
      })
  }, [connectPreviewMqtt, disconnectPreviewMqtt, project])

  const choosePreviewSource = useCallback(
    (source: "live" | "simulation") => {
      if (source === "live") {
        startLive()
      } else {
        stopLive()
        setPreviewSource("simulation")
      }
    },
    [startLive, stopLive],
  )

  const enterPreviewMode = useCallback(() => {
    // A popup being edited is previewed open, over the first main screen.
    const editing = project.screens.find((s) => s.id === currentScreenId)
    if (isPopup(editing)) {
      setPreviewScreenId(firstScreenToOpen(project.screens)?.id ?? currentScreenId)
      setPreviewPopupId(currentScreenId)
    } else {
      setPreviewScreenId(currentScreenId)
      setPreviewPopupId(null)
    }
    setPreviewTopicValues({})
    startLive()
    // Clear every editing-only UI state that would otherwise be stranded
    // on screen once the property panel (which normally owns closing them)
    // is swapped out for the Topic Values panel.
    setFocusedHardwareButton(null)
    setSelectedObjectIds([])
    setEditingContainerId(null)
    setIsPreviewMode(true)
  }, [currentScreenId, startLive, project.screens])

  const exitPreviewMode = useCallback(() => {
    stopLive()
    setIsPreviewMode(false)
  }, [stopLive])

  // Runs a HardwareButtonAction the same way the firmware's own
  // Application::dispatchButtonAction does - a SoftwareButton click or a
  // hardware-button-overlay click in preview mode both funnel through this
  // (see Canvas's previewMode prop). In the simulation send-mqtt stays
  // local and applies the message to previewTopicValues as if it had just
  // arrived; in the live preview it is published for real (see
  // handlePreviewPublish). A toast surfaces what happened either way,
  // since a send-mqtt to a topic nothing on screen displays would
  // otherwise look like the button did nothing at all.
  // The mock engine for whatever project is currently open - including
  // unsaved edits, which is the whole point of running it here rather than
  // over an exported file: change a rule, tap, see it.
  const mockEngine = useMemo(() => buildMockEngine(project), [project])

  // Everything a preview publishes goes through here: a SoftwareButton's
  // send-mqtt action and a Switch tap alike.
  //
  // Until 2026-08-25 the button action wrote its payload straight into
  // previewTopicValues under the *command* topic, which no object on screen
  // reads - hence the toast, which existed because otherwise "the button did
  // nothing at all". A Switch tap did not exist. Both were the same missing
  // piece: the command-to-state loop, which on a device is Node-RED's job
  // and here is lib/mock-engine.js's.
  //
  // The command value is still recorded. On a real broker it would be
  // observable too, and an object bound to a command topic should see it.
  // What is new is the answer that follows.
  const handlePreviewPublish = useCallback(
    (topic: string, payload: string) => {
      // Live, a tap is what it is on a device: a publish, answered - or not -
      // by whatever listens on the broker. The mock engine stays out of it;
      // an answer it made up would look exactly like the van's.
      if (previewSource === "live") {
        const client = previewMqtt.clientRef.current
        if (liveStatus === "live" && client) {
          client.publish(topic, payload, { qos: 0, retain: false })
          toast({ title: "→ Published", description: `${topic} = ${payload}` })
        } else {
          toast({
            title: "Not published",
            description: `No connection to the broker - ${topic} = ${payload} went nowhere`,
            variant: "destructive",
          })
        }
        return
      }
      const answers = mockEngine.respond(topic, payload, previewTopicValues)
      setPreviewTopicValues((prev) => {
        const next = { ...prev, [topic]: payload }
        for (const answer of answers) next[answer.topic] = answer.value
        return next
      })
      if (answers.length > 0) {
        toast({
          title: "→ Published, and answered",
          description: `${topic} = ${payload} → ${answers.map((a) => `${a.topic} = ${a.value}`).join(", ")}`,
        })
      } else {
        // Nothing answers this, and saying so is the point: on a device the
        // consequence lives in the real automation, and here it has to be
        // declared as a Mock Response on the command topic. A silent tap
        // would read as a broken button.
        toast({
          title: "→ Published, nothing answered",
          description: `${topic} = ${payload} - add a Mock Response on this topic to give it an effect`,
        })
      }
    },
    [mockEngine, previewTopicValues, toast, previewSource, liveStatus, previewMqtt.clientRef],
  )

  // What the preview shows for each topic while live: what the broker last
  // delivered, except where a finger is setting a level - that wins until the
  // broker says something new (decision 6). One map for the canvas and the
  // Topic Values panel alike, so the picture and the list cannot disagree
  // about what is set.
  // Just the requests, for the canvas to draw as markers. The values the
  // broker delivered go their own way, untouched - see askedValues above for
  // why these two must not be merged.
  // A released level whose end value was never answered: the installation's
  // last word is shown after all (decision 6c) - just later.
  useEffect(() => {
    const waits = Object.values(askedValues)
      .map((a) => a.awaitUntil)
      .filter((t): t is number => t !== undefined)
    if (waits.length === 0) return
    const timer = setTimeout(() => {
      const now = Date.now()
      setAskedValues((prev) => {
        const next = { ...prev }
        let changed = false
        for (const [t, a] of Object.entries(prev)) {
          if (a.awaitUntil !== undefined && a.awaitUntil <= now) {
            delete next[t]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, Math.max(0, Math.min(...waits) - Date.now()))
    return () => clearTimeout(timer)
  }, [askedValues])

  const shownAskedValues = useMemo(() => {
    const shown: Record<string, string> = {}
    for (const [topic, asked] of Object.entries(askedValues)) shown[topic] = asked.value
    return shown
  }, [askedValues])

  // A finger setting a level: hold what it is set to so the canvas follows the
  // hand, and publish it - while dragging at most every 250 ms, and always on
  // release (docs/2026-09-17-settable-level.md, decisions 2, 3 and 6).
  const handlePreviewSetLevel = useCallback(
    (obj: ScreenObject, value: number, final: boolean) => {
      const topic = obj.properties.topic as string | undefined
      const setpointTopic = obj.properties.setpointTopic as string | undefined
      const writeTopic = obj.properties.writeTopic as string | undefined
      if (!writeTopic) return
      const payload = String(value)

      // The marker's topic: where an answer would arrive, and therefore what
      // the request is keyed by.
      const markerTopic = setpointTopic || topic
      const now = Date.now()
      if (markerTopic) {
        setAskedValues((prev) => {
          // Already answered while the hand rested: a bridge publishes only
          // changes, so no second answer comes - the request ends now.
          if (final && sameLevel(liveValues[markerTopic], payload)) {
            if (!prev[markerTopic]) return prev
            const next = { ...prev }
            delete next[markerTopic]
            return next
          }
          return {
            ...prev,
            [markerTopic]: {
              value: payload,
              seen: prev[markerTopic]?.seen ?? liveValues[markerTopic],
              holding: !final,
              awaitUntil: final ? now + LEVEL_AWAIT_MS : undefined,
            },
          }
        })
      }

      const last = lastLevelPublishRef.current.get(writeTopic) ?? 0
      if (!final && now - last < LEVEL_PUBLISH_MIN_MS) return
      lastLevelPublishRef.current.set(writeTopic, now)
      handlePreviewPublish(writeTopic, payload)
    },
    [handlePreviewPublish, liveValues, previewSource],
  )

  // A Switch tap, held the way a level's marker is held: keyed by the topic an
  // answer would arrive on, dropped the moment one does (see askedValues).
  const handlePreviewAsk = useCallback(
    (topic: string, expected: string) => {
      if (!topic) return
      setAskedValues((prev) => ({
        ...prev,
        [topic]: { value: expected, seen: prev[topic]?.seen ?? liveValues[topic] },
      }))
    },
    [liveValues],
  )

  const handlePreviewButtonAction = useCallback(
    (action: HardwareButtonAction) => {
      // Any screen change closes an open popup, as it does on the device.
      if (action.type === "next-screen" || action.type === "previous-screen" || action.type === "goto-screen") {
        setPreviewPopupId(null)
      }
      if (action.type === "next-screen" || action.type === "previous-screen") {
        // Masters, popups and hidden screens aren't part of the normal screen
        // sequence - see ProjectScreen.isMaster and lib/popup.ts.
        const screens = project.screens.filter(isPagedScreen)
        if (screens.length === 0) return
        const currentIndex = screens.findIndex((s) => s.id === previewScreenId)
        const delta = action.type === "next-screen" ? 1 : -1
        const newIndex = (((currentIndex === -1 ? 0 : currentIndex) + delta) % screens.length + screens.length) % screens.length
        setPreviewScreenId(screens[newIndex].id)
        toast({ title: action.type === "next-screen" ? "→ Next screen" : "→ Previous screen", description: screens[newIndex].name })
      } else if (action.type === "goto-screen") {
        const target = project.screens.find((s) => s.id === action.targetScreenId)
        if (!target) {
          toast({ title: "Button action failed", description: "No screen configured for this button", variant: "destructive" })
          return
        }
        setPreviewScreenId(target.id)
        toast({ title: "→ Go to screen", description: target.name })
      } else if (action.type === "open-popup") {
        const target = project.screens.find((s) => s.id === action.targetScreenId && isPopup(s))
        if (!target) {
          toast({ title: "Button action failed", description: "No popup configured for this button", variant: "destructive" })
          return
        }
        setPreviewPopupId(target.id)
        toast({ title: "→ Open popup", description: target.name })
      } else if (action.type === "close-popup") {
        setPreviewPopupId(null)
      } else if (action.type === "send-mqtt") {
        const { mqttTopic, mqttMessage } = action
        if (!mqttTopic) return
        handlePreviewPublish(mqttTopic, mqttMessage ?? "")
      } else if (action.type === "adjust-level") {
        // What a detent does on the Knob (tasks/ring-adjust-plan.md): one step
        // from the value shown - the asked one while held, else the reported
        // one - written as a finger's release is, through handlePreviewSetLevel.
        const screen =
          project.screens.find((s) => s.id === (previewPopupId ?? previewScreenId)) ??
          project.screens.find((s) => s.id === currentScreenId)
        if (!screen) return
        const target = adjustTargetOf(action, screen, resolveMasterScreen(screen, project.screens))
        if (!target) return
        const reported = (topic: string | undefined) =>
          previewSource === "live"
            ? getLiveValueFromTopic(topic, liveValues)
            : getPreviewValueFromTopic(
                topic,
                project.topics.map((t) =>
                  t.topic in previewTopicValues ? { ...t, examples: [previewTopicValues[t.topic], ...t.examples.slice(1)] } : t,
                ),
              )
        const level = adjustedLevel(target, (switcher) => getActivePanel(switcher, reported))
        if (!level) return
        const markerTopic = (level.properties.setpointTopic as string | undefined) || (level.properties.topic as string | undefined)
        const asked = markerTopic ? askedValues[markerTopic] : undefined
        // A finger holding it wins.
        if (asked?.holding) return
        const value = adjustedValue(level, asked?.value ?? reported(markerTopic), action.direction ?? "up")
        if (value === null) return
        handlePreviewSetLevel(level, value, true)
      } else if (action.type === "goto-setup-mode") {
        // Nothing to actually enter in a browser preview - setup mode is a
        // device-side WiFi AP state, not a screen. Just confirms the button
        // is wired correctly.
        toast({ title: "→ Would enter setup mode", description: "Only happens on a real device" })
      } else if (action.type === "device-action") {
        // Same "confirm the wiring, don't fake the behavior" stance as setup
        // mode above, and here it's not even possible to fake: the designer
        // deliberately doesn't know what a device action does (see
        // lib/device-actions.ts) - only the firmware does.
        toast({
          title: `→ Would run "${describeDeviceAction(action.deviceActionId ?? "")}"`,
          description: "Only happens on a real device",
        })
      }
    },
    [project.screens, previewScreenId, previewPopupId, toast, handlePreviewPublish, project.topics, currentScreenId, previewSource, liveValues, previewTopicValues, askedValues, handlePreviewSetLevel],
  )

  // Direct edits from the Topic Values panel (typing a new value) go
  // through the same previewTopicValues override map a simulated
  // send-mqtt button action does - both are "a message just arrived on
  // this topic", just triggered from a different place.
  const handleSetPreviewTopicValue = useCallback((topic: string, value: string) => {
    setPreviewTopicValues((prev) => ({ ...prev, [topic]: value }))
  }, [])

  // Switching screens invalidates any open tab-editing context - it refers
  // to an object on the screen being left.
  useEffect(() => {
    setEditingContainerId(null)
  }, [currentScreenId])

  // Log font metrics when project changes
  useEffect(() => {
    if (project.fonts && project.fonts.length > 0) {
      console.log(`[Font Metrics] Available fonts in project:`)
      project.fonts.forEach((font, index) => {
        console.log(`[Font Metrics] ${index + 1}. ${font.name} (ID: ${font.id}) - Size: ${font.size}px, baselineOffset: ${font.baselineOffset?.toFixed(2) || 'undefined'}px`)
      })
    }
  }, [project.fonts])

  // BDF font loading removed - now using TTF fonts only

  useEffect(() => {
  }, [currentScreenId])

  const currentScreen = project.screens.find((s) => s.id === currentScreenId)!

  // The screen actually shown on canvas while previewing - falls back to
  // currentScreen if previewScreenId hasn't been set yet (shouldn't happen
  // once isPreviewMode is true, since enterPreviewMode always sets it, but
  // keeps this safe to read unconditionally either way).
  const previewScreen = useMemo(() => {
    if (!isPreviewMode) return currentScreen
    return project.screens.find((s) => s.id === previewScreenId) ?? currentScreen
  }, [isPreviewMode, previewScreenId, project.screens, currentScreen])

  // The popup open over previewScreen, if any; the canvas then shows it, with
  // previewScreen underneath (popupUnderlay).
  const previewPopup = useMemo(
    () => (isPreviewMode && previewPopupId ? project.screens.find((s) => s.id === previewPopupId && isPopup(s)) : undefined),
    [isPreviewMode, previewPopupId, project.screens],
  )
  const popupUnderlay = useMemo(() => {
    if (!previewPopup) return undefined
    const master = resolveMasterScreen(previewScreen, project.screens)
    return { screen: previewScreen, masterObjects: master?.objects ?? [], masterScreen: master }
  }, [previewPopup, previewScreen, project.screens])

  // The screen actually shown on canvas (see `previewScreen` above) may
  // have a master assigned - resolve its objects here so Canvas can draw
  // them merged in without needing to know about the master mechanism or
  // the full screens array itself. Respects the per-screen "Show master"
  // toggle (default true) and resolves to nothing if the referenced master
  // was deleted (masterScreenId nulled out on delete, but defensive here
  // too).
  const displayedScreen = isPreviewMode ? (previewPopup ?? previewScreen) : currentScreen
  // Also what canvas.tsx resolves hardware-button-action inheritance
  // against (see lib/hardware-button-actions.ts) - the same showMaster gate
  // decides both, so one resolution serves both concerns.
  const displayedScreenMaster = useMemo(
    () => resolveMasterScreen(displayedScreen, project.screens),
    [displayedScreen.masterScreenId, displayedScreen.showMaster, project.screens],
  )
  const masterObjects = useMemo(() => displayedScreenMaster?.objects ?? [], [displayedScreenMaster])

  // What the view reads, for the live preview to redraw at once (#58); and
  // when the view changes, everything the broker has given so far.
  useEffect(() => {
    if (!isPreviewMode) return
    heardTopicsRef.current = previewHeardTopics(
      [displayedScreen, displayedScreenMaster, popupUnderlay?.screen, popupUnderlay?.masterScreen],
      project.screens,
      project.combinedTopics,
    )
    if (Object.keys(liveAllRef.current).length > 0) setLiveValues({ ...liveAllRef.current })
  }, [isPreviewMode, displayedScreen, displayedScreenMaster, popupUnderlay, project.screens, project.combinedTopics])

  // project.topics with previewTopicValues applied as each topic's current
  // "example" - every existing consumer (TopicSelector, getPreviewValueFromTopic,
  // canvas rendering) already just reads topic.examples[0], so overriding it
  // here is enough to make an edited value show up everywhere without any of
  // them needing to know preview mode exists.
  const previewTopics = useMemo(() => {
    if (!isPreviewMode || Object.keys(previewTopicValues).length === 0) return project.topics
    return project.topics.map((topic) =>
      topic.topic in previewTopicValues
        ? { ...topic, examples: [previewTopicValues[topic.topic], ...topic.examples.slice(1)] }
        : topic,
    )
  }, [isPreviewMode, previewTopicValues, project.topics])

  const selectedObject = useMemo(() => {
    if (!selectedObjectIds.length) return null
    return findObjectById(currentScreen.objects, selectedObjectIds[0])
  }, [selectedObjectIds, currentScreen.objects])

  // The switcher panel open for editing, in the shape the switcher's own
  // property panel reads: the open container itself, or the panel it sits
  // in when it is a group inside one.
  const editingTabContext = useMemo(() => {
    let node = editingContainerId ? findObjectById(currentScreen.objects, editingContainerId) : null
    while (node) {
      const parent: ScreenObject | null = findParentOf(currentScreen.objects, node.id)?.parent ?? null
      if (node.type === "panel" && parent) return { tabControlId: parent.id, panelId: node.id }
      node = parent
    }
    return null
  }, [editingContainerId, currentScreen.objects])

  const selectedObjects = useMemo(() => {
    return selectedObjectIds
      .map((id) => findObjectById(currentScreen.objects, id))
      .filter((obj): obj is ScreenObject => obj !== null)
  }, [selectedObjectIds, currentScreen.objects])

  // Leaves the container being edited unless the newly-selected id is in
  // it - or is the open panel itself (clicking its tab in the strip selects
  // the panel to show its condition in the property panel, and must not
  // immediately re-close what it just opened). Selecting the tab-control
  // itself deliberately DOES exit editing - see canvas.tsx's handleMouseDown,
  // where clicking empty space inside the container (but not on any child)
  // selects the tab-control precisely so you can move/resize the container
  // instead of continuing to work on the panel's contents. The same for a
  // group: selecting it is being outside it. With containers nested, only as
  // far out as needed - selecting a panel's object while inside a group in
  // that panel lands in the panel (editingContainerAfterSelecting).
  const clearEditingUnlessRelated = useCallback(
    (id: string | null) => {
      setEditingContainerId((prev) => editingContainerAfterSelecting(currentScreen.objects, prev, id))
    },
    [currentScreen.objects],
  )

  const onSelectObject = useCallback((id: string | null, modifierKey = false) => {
    clearEditingUnlessRelated(id)

    if (id === null) {
      setSelectedObjectIds([])
      setChosenCell(null)
      setFocusedHardwareButton(null)
      return
    }

    setFocusedHardwareButton(null)

    if (modifierKey) {
      setSelectedObjectIds((prev) => {
        if (prev.includes(id)) {
          // Remove from selection if already selected
          return prev.filter((objId) => objId !== id)
        } else {
          // Add to selection
          return [...prev, id]
        }
      })
    } else {
      // Single selection (replace current selection)
      setSelectedObjectIds([id])
    }
  }, [clearEditingUnlessRelated])

  const onSelectObjects = useCallback((ids: string[]) => {
    setSelectedObjectIds(ids)
  }, [])

  // The empty cell a click picked (docs/2026-10-03-table-editing.md): the
  // cell in context while nothing is selected. Selecting an object, Esc, a
  // click outside every table or another screen leave it.
  const [chosenCell, setChosenCell] = useState<{ tableId: string; row: number; column: number } | null>(null)
  useEffect(() => {
    if (selectedObjectIds.length > 0) setChosenCell(null)
  }, [selectedObjectIds])
  useEffect(() => setChosenCell(null), [currentScreenId])

  // A text or level label that names a topic the project does not declare
  // gets it declared - as a block does with its own - so the device, which
  // subscribes to the declared topics, hears it (docs/2026-09-25-text-
  // placeholders.md). Type text and no examples: nothing is known about it
  // yet, and a made-up example would be shown as if it were.
  const declareTopics = useCallback((names: string[]) => {
    // `van/data#temp` names the topic `van/data`; the rest is a path into it.
    const bare = names.map((name) => name.split("#")[0])
    setProject((prev) => {
      const missing = bare.filter((name, i) => name && bare.indexOf(name) === i && !prev.topics.some((t) => t.topic === name))
      if (missing.length === 0) return prev
      return {
        ...prev,
        topics: [...prev.topics, ...missing.map((topic, index) => ({ id: `topic_${Date.now() + index}`, topic, type: "text" as const, examples: [] }))],
      }
    })
  }, [])

  const updateObject = useCallback(
    (objectId: string, updates: Partial<ScreenObject>) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: honest(updateObjectById(screen.objects, objectId, updates), prev.settings.pixelsPerMm) }
            : screen,
        ),
      }))
    },
    [currentScreenId],
  )

  const updateObjects = useCallback(
    (objectIds: string[], updates: Partial<ScreenObject>) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: honest(updateObjectsById(screen.objects, objectIds, updates), prev.settings.pixelsPerMm) }
            : screen,
        ),
      }))
    },
    [currentScreenId],
  )

  // Backs the object tree's "Screen" root (clicking it just clears object
  // selection - see onSelectObject(null) below - landing on the now-
  // enriched ScreenProperties fallback panel, which renders
  // ScreenEditorFields the same way project-settings-dialog.tsx's Screens
  // tab does, 2026-08-16). currentScreenId-scoped, not screenId-parameterized
  // like project-settings-dialog.tsx's equivalents - this panel only ever
  // edits the screen currently being viewed.
  const renameCurrentScreen = useCallback(
    (name: string) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, name } : screen)),
      }))
    },
    [currentScreenId],
  )

  // A screen's theme; undefined inherits (its master's, else the project's).
  // One undo step, like every other edit here.
  const setCurrentScreenTheme = useCallback(
    (themeId: string | undefined) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, themeId } : screen)),
      }))
    },
    [currentScreenId],
  )

  // Another master can bring another typography: the screen's styled text
  // is resolved again.
  const setCurrentScreenMaster = useCallback(
    (masterScreenId: string | undefined) => {
      setProject((prev) =>
        resolveScale({
          ...prev,
          screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, masterScreenId } : screen)),
        }),
      )
    },
    [currentScreenId],
  )

  // A screen's typography; undefined inherits its master's. Its styled text,
  // and on a master that of every screen inheriting it, takes the new fonts.

  const setCurrentScreenTypography = useCallback(
    (typography: string | undefined) => {
      setProject((prev) =>
        resolveScale({
          ...prev,
          screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, typography } : screen)),
        }),
      )
    },
    [currentScreenId],
  )

  const setCurrentScreenType = useCallback(
    (type: ScreenType) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => (screen.id === currentScreenId ? withScreenType(screen, type) : screen)),
      }))
    },
    [currentScreenId],
  )

  const setCurrentScreenShowMaster = useCallback(
    (showMaster: boolean) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, showMaster } : screen)),
      }))
    },
    [currentScreenId],
  )

  // Any of the current screen's own fields («Hide screen», …).
  const patchCurrentScreen = useCallback(
    (patch: Partial<ProjectScreen>) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => (screen.id === currentScreenId ? { ...screen, ...patch } : screen)),
      }))
    },
    [currentScreenId],
  )

  const clearCurrentScreenIcon = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      screens: prev.screens.map((screen) =>
        screen.id === currentScreenId ? { ...screen, iconAssetId: undefined } : screen,
      ),
    }))
  }, [currentScreenId])

  // parentId: when set, the new object is appended to that object's
  // .children (e.g. the panel currently open for editing in a tab-control)
  // instead of the screen's own top-level objects. zIndex is still scoped
  // to siblings at whichever level the object actually lands in - a
  // top-level object's zIndex is only ever compared against other
  // top-level objects, a panel-child's only against its own siblings (see
  // lib/object-order.ts's sortChildrenByZIndex on the render side).
  const addObject = useCallback(
    // `at`: the cell or row line of a table the click was over
    // (lib/table.ts tableDropAt) - which table, or the screen's own (null),
    // and where in it.
    (
      object: Omit<ScreenObject, "id" | "zIndex">,
      parentId?: string,
      at?: { table: TableDrop } | { snap: SnapDrop },
    ) => {
      // Drawn where a table put together by snapping takes it: added, then
      // snapped there as if dragged (docs/2026-10-09-snap-tables.md).
      if (at && "snap" in at) {
        const id = `obj-${project.nextId}`
        const newTableId = `obj-${project.nextId + 1}`
        const drop = at.snap
        setProject((prev) => {
          const scale = { pixelsPerMm: prev.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts: prev.fonts }
          const add = (list: ScreenObject[]) =>
            applySnapDrop([...list, { ...object, id, zIndex: Math.max(0, ...list.map((o) => o.zIndex)) + 1 } as ScreenObject], id, drop, scale, newTableId)
          return {
            ...prev,
            nextId: prev.nextId + (drop.kind === "pair" ? 2 : 1),
            screens: prev.screens.map((screen) => {
              if (screen.id !== currentScreenId) return screen
              if (!parentId) return { ...screen, objects: add(screen.objects) }
              const space = findObjectById(screen.objects, parentId)
              return space ? { ...screen, objects: updateObjectById(screen.objects, parentId, { children: add(space.children ?? []) }) } : screen
            }),
          }
        })
        setEditingContainerId(drop.kind === "table" ? drop.tableId : newTableId)
        setSelectedObjectIds([id])
        setJustCreatedId(id)
        return
      }
      // Into a table's cell, a new row inserted first when it was a row line
      // (lib/table.ts, docs/2026-10-02-layout-tables.md).
      if (at && "table" in at) {
        const drop = at.table
        const id = `obj-${project.nextId}`
        setProject((prev) => ({
          ...prev,
          nextId: prev.nextId + 1,
          screens: prev.screens.map((screen) => {
            if (screen.id !== currentScreenId) return screen
            const into = (children: ScreenObject[]): ScreenObject[] => {
              const moved = drop.insertRow ? insertRowAt(children, drop.row) : children
              const placed = {
                ...object,
                id,
                zIndex: Math.max(0, ...moved.map((o) => o.zIndex)) + 1,
                properties: { ...object.properties, cell: { row: drop.row, column: drop.column } },
              } as ScreenObject
              return [...moved, placed]
            }
            const rows = (properties: Record<string, any> | undefined, before: ScreenObject[], after: ScreenObject[]) => ({
              ...properties,
              rows: rowsAfterInsert(properties?.rows, before, drop.row, drop.insertRow ? 1 : 0, after),
            })
            const table = findObjectById(screen.objects, drop.tableId)
            if (!table) return screen
            const after = into(table.children ?? [])
            return {
              ...screen,
              objects: updateObjectById(screen.objects, drop.tableId, { children: after, properties: rows(table.properties, table.children ?? [], after) }),
            }
          }),
        }))
        setSelectedObjectIds([id])
        setJustCreatedId(id)
        return
      }
      const siblings = parentId ? (findObjectById(currentScreen.objects, parentId)?.children ?? []) : currentScreen.objects

      const newObject: ScreenObject = {
        ...object,
        id: `obj-${project.nextId}`,
        zIndex: Math.max(...siblings.map((o) => o.zIndex), 0) + 1,
      }

      setProject((prev) => ({
        ...prev,
        nextId: prev.nextId + 1,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? {
                ...screen,
                objects: parentId
                  ? insertObjectIntoParent(screen.objects, parentId, newObject)
                  : insertObjectInOrder(screen.objects, newObject),
              }
            : screen,
        ),
      }))

      setSelectedObjectIds([newObject.id])
      setJustCreatedId(newObject.id)
    },
    [currentScreen.objects, currentScreenId, project.nextId],
  )

  // Several objects at once, which addObject cannot do: it reads nextId from
  // the render it was created in, so two calls in one tick both take the same
  // number and the second object arrives with the first one's id. A building
  // block is the first thing to place more than one object at a time, and it
  // did exactly that (2026-09-16: a label and a level indicator, both obj-29,
  // and the editor then treated them as one).
  const addObjects = useCallback(
    (objects: Omit<ScreenObject, "id" | "zIndex">[], parentId?: string) => {
      if (objects.length === 0) return
      const created: string[] = []
      setProject((prev) => {
        // Reset rather than append: React may run an updater twice, and the
        // ids of the discarded run must not end up in the selection.
        created.length = 0
        const screen = prev.screens.find((s) => s.id === currentScreenId)
        if (!screen) return prev
        const siblings = parentId ? (findObjectById(screen.objects, parentId)?.children ?? []) : screen.objects
        let zIndex = Math.max(...siblings.map((o) => o.zIndex), 0)
        let nextId = prev.nextId
        let objects_ = screen.objects
        for (const object of objects) {
          // Every descendant gets an id too: a block arrives as a group
          // (lib/bausteine.ts blockTable) with its pieces inside.
          const fresh = withFreshIds({ ...object, id: "", zIndex: ++zIndex } as ScreenObject, nextId)
          const newObject = fresh.object
          nextId = fresh.nextId
          created.push(newObject.id)
          objects_ = parentId
            ? insertObjectIntoParent(objects_, parentId, newObject)
            : insertObjectInOrder(objects_, newObject)
        }
        return {
          ...prev,
          nextId,
          screens: prev.screens.map((s) => (s.id === currentScreenId ? { ...s, objects: objects_ } : s)),
        }
      })
      setSelectedObjectIds(created)
    },
    [currentScreenId],
  )

  // A catalog entry picked in the Block menu: its options come first.
  const selectCatalogEntry = useCallback((entry: CatalogEntry) => {
    setBlockChoice(entry)
  }, [])

  // Insert: the Block tool is armed with the entry and its options.
  const armBlock = useCallback(
    (options: BausteinOptions, values: Record<string, string>) => {
      if (!blockChoice) return
      setArmedBlock({ entry: blockChoice, values, options })
      setBlockChoice(null)
      setActiveTool("baustein")
    },
    [blockChoice],
  )

  // The rectangle is dragged: build the block's objects, and register the
  // topics they bind to where the project does not have them yet - an object
  // bound to a topic the project never declares is one the device never
  // subscribes to - with what the broker holds as the first example.
  // A block's table put into a table: merged at a row line - its cells into
  // the target's columns (lib/table.ts mergedRows), as many rows inserted as
  // it needs - or nested in an empty cell. Fresh ids at every depth; what it
  // brought ends up selected.
  const placeBlockInTable = useCallback(
    (block: Omit<ScreenObject, "id" | "zIndex">, drop: TableDrop) => {
      const created: string[] = []
      setProject((prev) => {
        created.length = 0
        const screen = prev.screens.find((s) => s.id === currentScreenId)
        if (!screen) return prev
        let nextId = prev.nextId
        const fresh = (object: Omit<ScreenObject, "id" | "zIndex">, zIndex: number, cell: { row: number; column: number }) => {
          const made = withFreshIds({ ...object, id: "", zIndex, properties: { ...object.properties, cell } } as ScreenObject, nextId)
          nextId = made.nextId
          created.push(made.object.id)
          return made.object
        }
        const targetChildren = findObjectById(screen.objects, drop.tableId)?.children ?? []
        const targetColumns = columnsOf(findObjectById(screen.objects, drop.tableId)!).length
        let z = Math.max(0, ...targetChildren.map((o) => o.zIndex))
        let children = targetChildren
        let added = 0
        if (drop.insertRow) {
          const rows = mergedRows(block, targetColumns)
          added = Math.max(...rows.map((r) => r.row)) + 1
          for (let i = 0; i < added; i++) children = insertRowAt(children, drop.row)
          children = [...children, ...rows.map((r) => fresh(r.object, ++z, { row: drop.row + r.row, column: r.column }))]
        } else {
          children = [...children, fresh(block, ++z, { row: drop.row, column: drop.column })]
        }
        const grow = (properties: Record<string, any> | undefined) => ({
          ...properties,
          rows: rowsAfterInsert(properties?.rows, targetChildren, drop.row, added, children),
        })
        const screens = prev.screens.map((s) => {
          if (s.id !== currentScreenId) return s
          const table = findObjectById(s.objects, drop.tableId)!
          return { ...s, objects: updateObjectById(s.objects, drop.tableId, { children, properties: grow(table.properties) }) }
        })
        return { ...prev, nextId, screens }
      })
      setSelectedObjectIds(created)
    },
    [currentScreenId, setProject],
  )

  const startBaustein = useCallback(
    (
      rect: { x: number; y: number; width: number; height: number },
      parentId?: string,
      at?: { table: TableDrop },
    ) => {
      const armed = armedBlock
      setArmedBlock(null)
      if (!armed) return
      const { entry, values, options } = armed

      // The Label style's font, on a device with a scale.
      const scale = screenTextScale(project, currentScreen)
      const label = scale ? fontFor("label", false, scale.typography, project.fonts, scale.pixelsPerMm) : undefined
      const labelFont = label
        ? { id: label.id, size: label.size, internalName: label.internalName, name: label.name, format: label.format }
        : undefined

      // An icon the project already has - picked for a screen, say - is used
      // as it is rather than brought a second time under another id.
      const existingIcon = options.icon
        ? project.assets.find((asset) => asset.type === "icon" && asset.name === options.icon!.name)
        : undefined
      const built = buildEntry({
        entry,
        options: existingIcon && options.icon ? { ...options, icon: { ...options.icon, assetId: existingIcon.id } } : options,
        rect,
        palette: ROLE_PALETTE,
        // Label on a device with a scale (docs/2026-09-30-size-scale.md);
        // elsewhere sized against the panel - see blockFont().
        font: labelFont ?? blockFont(project.fonts, project.screenWidth, project.screenHeight),
        reported: values,
      })

      setProject((prev) => {
        const missing = built.topics.filter((topic) => !prev.topics.some((t) => t.topic === topic.topic))
        // Icons the block draws, once each, however often it is placed.
        const missingAssets = (built.assets ?? []).filter((asset) => !prev.assets.some((a) => a.id === asset.id))
        if (missing.length === 0 && missingAssets.length === 0) return prev
        return {
          ...prev,
          // Same id shape the Topics settings and MQTT discovery produce
          // (`topic_<ms>`); nextId belongs to objects.
          topics: [...prev.topics, ...missing.map((topic, index) => ({ ...topic, id: `topic_${Date.now() + index}` }))],
          assets: [...prev.assets, ...missingAssets],
        }
      })
      // Every text the block writes in the Label font is in the Label style,
      // so it shows as Label, not Custom, and follows a device change.
      // A part the description sets small is in the Caption style instead.
      const styled = (object: Omit<ScreenObject, "id" | "zIndex">): Omit<ScreenObject, "id" | "zIndex"> => {
        const { blockTextStyle, ...properties } = object.properties ?? {}
        if (blockTextStyle === "caption") {
          const caption = scale ? styledFont("caption", false, scale, project.fonts) : undefined
          return { ...object, properties: { ...properties, ...(caption ?? {}) } }
        }
        return labelFont && properties.fontId === labelFont.id ? { ...object, properties: { ...properties, textStyle: "label", textBold: false } } : object
      }
      const pieces = built.objects.map(styled)
      // Its controls at M where the device gives a scale, wherever it lands -
      // on a free area too: there it once kept the rectangle's size, and the
      // same block appended through a table's «+» came out larger
      // (reported 2026-10-03).
      // A part the description sizes otherwise - «Nullen» in XS - takes its own.
      const stepped = scale
        ? pieces.map((piece) => {
            const { blockSizeStep, ...properties } = piece.properties ?? {}
            const own = { ...piece, properties }
            return stepKindOf(piece.type) ? { ...own, ...stepUpdates(own as ScreenObject, blockSizeStep ?? "m", scale.pixelsPerMm, project.fonts) } : own
          })
        : pieces
      // Into a table (tables Task 8): on a row line merged into the table's
      // rows, into an empty cell nested there as a small table.
      if (at && "table" in at) {
        placeBlockInTable(blockTable({ ...built, objects: stepped }), at.table)
        return
      }
      // On a free screen or area: a small table of its own, what ends up
      // selected (docs/2026-10-02-layout-tables.md).
      addObjects([blockTable({ ...built, objects: stepped })], parentId)
    },
    [
      addObjects,
      armedBlock,
      project.settings,
      project.screens,
      currentScreen,
      project.assets,
      project.fonts,
      project.screenWidth,
      project.screenHeight,
    ],
  )

  // Adds a new panel to a tab-control and immediately opens it for editing
  // (sets editingContainerId + selects the new panel) - a plain addObject()
  // call can't do the "select what you just created" part here, since it
  // only returns void and the new id (obj-${nextId}) needs to be known
  // synchronously to set editingContainerId in the same interaction, not
  // just inserted into the project tree.
  const addPanelToTabControl = useCallback(
    (tabControlId: string) => {
      const tabControl = findObjectById(currentScreen.objects, tabControlId)
      if (!tabControl) return
      const panelCount = tabControl.children?.length ?? 0
      const newPanel: ScreenObject = {
        id: `obj-${project.nextId}`,
        type: "panel",
        x: 0,
        y: 0,
        width: tabControl.width,
        height: tabControl.height,
        zIndex: panelCount + 1,
        properties: { comparisonOperator: "==", comparisonValue: "" },
      }

      setProject((prev) => ({
        ...prev,
        nextId: prev.nextId + 1,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: insertObjectIntoParent(screen.objects, tabControlId, newPanel) }
            : screen,
        ),
      }))

      setEditingContainerId(newPanel.id)
      setSelectedObjectIds([newPanel.id])
    },
    [currentScreen.objects, currentScreenId, project.nextId],
  )

  const deleteObject = useCallback(
    (objectId: string) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId ? { ...screen, objects: deleteObjectById(screen.objects, objectId) } : screen,
        ),
      }))

      setSelectedObjectIds((prev) => prev.filter((id) => id !== objectId))
    },
    [currentScreenId],
  )

  // Backs the object tree's drag-and-drop (reparent + z-order). The tree
  // already validated the drop against canDropAsChildOf before calling this
  // - this just performs the move. Moving something out of the panel
  // currently open for editing (or moving the tab-control/panel being
  // edited itself) would leave editingContainerId pointing at a now-stale
  // relationship, so clear it defensively; the user can re-open editing via
  // the tab strip if they're still working on that panel.
  // A table's own properties - its columns, its rows. One undo step each.
  const setTableProperties = useCallback(
    (tableId: string, updates: Record<string, unknown>) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          const table = findObjectById(screen.objects, tableId)
          return table ? { ...screen, objects: updateObjectById(screen.objects, tableId, { properties: { ...table.properties, ...updates } }) } : screen
        }),
      }))
    },
    [currentScreenId, setProject],
  )

  // A table's column chosen by the strip above it on the canvas: the table
  // selected, the column shown in the property panel for as long as that
  // selection stands.
  const [tableColumnChoice, setTableColumnChoice] = useState<{ tableId: string; index: number; selection: string } | null>(null)
  const selectTableColumn = useCallback((tableId: string, index: number) => {
    const selection = [tableId]
    setSelectedObjectIds(selection)
    setTableColumnChoice({ tableId, index, selection: selection.join(",") })
  }, [])
  const tableColumn = useMemo(() => {
    if (!tableColumnChoice || tableColumnChoice.selection !== selectedObjectIds.join(",")) return null
    const table = findObjectById(currentScreen.objects, tableColumnChoice.tableId)
    const columns = table ? columnsOf(table) : []
    return tableColumnChoice.index < columns.length ? { columns, index: tableColumnChoice.index } : null
  }, [tableColumnChoice, selectedObjectIds, currentScreen])
  const setTableColumns = useCallback(
    (columns: TableColumn[]) => {
      if (tableColumnChoice) setTableProperties(tableColumnChoice.tableId, { columns })
    },
    [tableColumnChoice, setTableProperties],
  )
  // The chosen column removed; its objects go to the first empty cells.
  const removeTableColumn = useCallback(() => {
    if (!tableColumnChoice) return
    const { tableId, index } = tableColumnChoice
    setProject((prev) => ({
      ...prev,
      screens: prev.screens.map((screen) => {
        if (screen.id !== currentScreenId) return screen
        const table = findObjectById(screen.objects, tableId)
        if (!table) return screen
        const out = removeColumn(columnsOf(table), table.children ?? [], index)
        return { ...screen, objects: updateObjectById(screen.objects, tableId, { children: out.children, properties: { ...table.properties, columns: out.columns } }) }
      }),
    }))
    setTableColumnChoice(null)
  }, [tableColumnChoice, currentScreenId, setProject])

  // Where the Table group works (docs/2026-10-03-table-editing.md): the
  // table in context, the cell in it and the object standing there - an
  // empty cell picked, an object in a table selected, or a table selected.
  const tableContext = useMemo(() => {
    const objects = currentScreen.objects
    if (selectedObjectIds.length === 0 && chosenCell) {
      if (!findObjectById(objects, chosenCell.tableId)) return null
      const cell = { row: chosenCell.row, column: chosenCell.column }
      return { tableId: chosenCell.tableId, cell, objectId: null as string | null, path: tablePath(objects, chosenCell.tableId) }
    }
    if (selectedObjectIds.length !== 1) return null
    const id = selectedObjectIds[0]
    const obj = findObjectById(objects, id)
    if (!obj) return null
    // The ribbon's Table group serves the old table only; one put together
    // by snapping has none (docs/2026-10-09-snap-tables.md).
    if (isOldTable(obj)) return { tableId: id, cell: null, objectId: null as string | null, path: tablePath(objects, id) }
    const parent = findParentOf(objects, id)?.parent ?? null
    if (!isOldTable(parent)) return null
    const cell = cellOf(obj)
    return {
      tableId: parent.id,
      cell: cell ? { row: cell.row, column: cell.column } : null,
      objectId: id as string | null,
      path: tablePath(objects, id),
    }
  }, [currentScreen, selectedObjectIds, chosenCell])

  // A table's columns, rows and objects.
  const tableParts = useCallback((screen: ProjectScreen, tableId: string) => {
    const table = findObjectById(screen.objects, tableId)
    if (!table) return null
    const children = table.children ?? []
    return { columns: columnsOf(table), rows: Math.max((table.properties?.rows as number | undefined) ?? 1, usedRows(children)), children }
  }, [])

  // What a command makes of a table; null where it cannot do anything.
  const applyTableCommand = useCallback(
    (
      parts: { columns: TableColumn[]; rows: number; children: ScreenObject[] },
      command: TableCommand,
      context: { cell: { row: number; column: number } | null; objectId: string | null },
    ): { columns: TableColumn[]; rows: number; children: ScreenObject[] } | null => {
      const { columns, rows, children } = parts
      // Without a cell, the last row and the last column.
      const standing = context.objectId ? children.find((child) => child.id === context.objectId) : undefined
      const span = standing ? cellOf(standing) : undefined
      const row = context.cell?.row ?? rows - 1
      const column = context.cell?.column ?? columns.length - 1
      const rowsDown = span?.rowSpan ?? 1
      const columnsRight = span?.columnSpan ?? 1
      switch (command) {
        case "row-above":
          return { columns, rows: rows + 1, children: insertRowAt(children, row) }
        case "row-below":
          return { columns, rows: rows + 1, children: insertRowAt(children, row + rowsDown) }
        case "delete-row": {
          if (rows <= 1) return null
          const out = deleteRow(children, rows, row)
          return { columns, rows: out.rows, children: out.children }
        }
        case "column-left": {
          const out = insertColumnAt(columns, children, column)
          return { columns: out.columns, rows, children: out.children }
        }
        case "column-right": {
          const out = insertColumnAt(columns, children, column + columnsRight)
          return { columns: out.columns, rows, children: out.children }
        }
        case "delete-column": {
          if (columns.length <= 1) return null
          const out = removeColumn(columns, children, column)
          return { columns: out.columns, rows, children: out.children }
        }
        case "merge-right":
        case "merge-down": {
          if (!context.objectId) return null
          const out = mergeCell(children, context.objectId, command === "merge-right" ? "right" : "down", columns.length, rows)
          return out ? { columns, rows, children: out } : null
        }
        case "split":
          if (!context.objectId || !span || (rowsDown === 1 && columnsRight === 1)) return null
          return { columns, rows, children: splitCell(children, context.objectId) }
      }
    },
    [],
  )

  const tableCommandsEnabled = useMemo(() => {
    const all: TableCommand[] = ["row-above", "row-below", "delete-row", "column-left", "column-right", "delete-column", "merge-right", "merge-down", "split"]
    const parts = tableContext ? tableParts(currentScreen, tableContext.tableId) : null
    return Object.fromEntries(all.map((command) => [command, !!(parts && tableContext && applyTableCommand(parts, command, tableContext))])) as Record<TableCommand, boolean>
  }, [tableContext, currentScreen, tableParts, applyTableCommand])

  // One command, one undo step.
  const runTableCommand = useCallback(
    (command: TableCommand) => {
      if (!tableContext) return
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          const parts = tableParts(screen, tableContext.tableId)
          const out = parts && applyTableCommand(parts, command, tableContext)
          if (!out) return screen
          const table = findObjectById(screen.objects, tableContext.tableId)!
          return {
            ...screen,
            objects: updateObjectById(screen.objects, tableContext.tableId, { children: out.children, properties: { ...table.properties, columns: out.columns, rows: out.rows } }),
          }
        }),
      }))
    },
    [tableContext, currentScreenId, setProject, tableParts, applyTableCommand],
  )

  // A row or a column inserted at a line by the «+» at its end: one undo step.
  const insertTableLine = useCallback(
    (tableId: string, kind: "row" | "column", index: number) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          const parts = tableParts(screen, tableId)
          if (!parts) return screen
          const out =
            kind === "row"
              ? { columns: parts.columns, rows: parts.rows + 1, children: insertRowAt(parts.children, index) }
              : { rows: parts.rows, ...insertColumnAt(parts.columns, parts.children, index) }
          const table = findObjectById(screen.objects, tableId)!
          return { ...screen, objects: updateObjectById(screen.objects, tableId, { children: out.children, properties: { ...table.properties, columns: out.columns, rows: out.rows } }) }
        }),
      }))
    },
    [currentScreenId, setProject, tableParts],
  )

  // A level of the path picked: that table selected.
  const selectTableLevel = useCallback((tableId: string) => onSelectObject(tableId), [onSelectObject])

  // Objects to a table's cell or a new row (lib/table.ts moveIntoTable); a
  // cell someone else holds refuses them, and nothing moves.
  const moveToTable = useCallback(
    (objectIds: readonly string[], drop: TableDrop) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          const moved = moveIntoTable(screen.objects, objectIds, drop)
          return moved ? { ...screen, objects: moved.objects } : screen
        }),
      }))
    },
    [currentScreenId, setProject],
  )

  // A dragged object let go near a table put together by snapping or a free
  // object (docs/2026-10-09-snap-tables.md): into the table, or a new table
  // with it. In the space being worked in - the screen, or the panel, group
  // or free area open - and then that table is open with the object chosen.
  const snapDrop = useCallback(
    (movingId: string, drop: SnapDrop) => {
      const newTableId = `obj-${project.nextId}`
      const tableId = drop.kind === "table" ? drop.tableId : newTableId
      setProject((prev) => {
        const scale = { pixelsPerMm: prev.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts: prev.fonts }
        return {
          ...prev,
          nextId: drop.kind === "pair" ? prev.nextId + 1 : prev.nextId,
          screens: prev.screens.map((screen) => {
            if (screen.id !== currentScreenId) return screen
            if (!editingContainerId) return { ...screen, objects: applySnapDrop(screen.objects, movingId, drop, scale, newTableId) }
            const space = findObjectById(screen.objects, editingContainerId)
            if (!space) return screen
            return { ...screen, objects: updateObjectById(screen.objects, space.id, { children: applySnapDrop(space.children ?? [], movingId, drop, scale, newTableId) }) }
          }),
        }
      })
      setEditingContainerId(tableId)
      setSelectedObjectIds([movingId])
    },
    [currentScreenId, editingContainerId, project.nextId, setProject],
  )

  // A row the Row tool carried, let go (docs/2026-10-09-snap-tables.md,
  // module snap-table-rows): into the table at the row line `target` names,
  // each part into the column of its role, or a table of one row with its
  // top left corner at `at` - in the space `parentId` names, the screen
  // when none. That table is open afterwards, the row's first part chosen.
  const insertRow = useCallback(
    (parts: Omit<ScreenObject, "id" | "zIndex">[], target: { tableId: string; at: number } | null, at: { x: number; y: number }, parentId?: string) => {
      const ids = parts.map((_, i) => `obj-${project.nextId + i}`)
      const newTableId = `obj-${project.nextId + parts.length}`
      setProject((prev) => {
        const scale = { pixelsPerMm: prev.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts: prev.fonts }
        const add = (list: ScreenObject[]) => {
          const inside = target ? (list.find((o) => o.id === target.tableId)?.children ?? []) : []
          const base = Math.max(0, ...inside.map((o) => o.zIndex))
          const made = parts.map((part, i) => ({ ...part, id: ids[i], zIndex: base + i + 1 }) as ScreenObject)
          const zIndex = Math.max(0, ...list.map((o) => o.zIndex)) + 1
          return applyRowDrop(list, made, target, at, scale, newTableId).map((o) => (o.id === newTableId ? { ...o, zIndex } : o))
        }
        return {
          ...prev,
          nextId: prev.nextId + parts.length + 1,
          screens: prev.screens.map((screen) => {
            if (screen.id !== currentScreenId) return screen
            if (!parentId) return { ...screen, objects: add(screen.objects) }
            const space = findObjectById(screen.objects, parentId)
            return space ? { ...screen, objects: updateObjectById(screen.objects, parentId, { children: add(space.children ?? []) }) } : screen
          }),
        }
      })
      setEditingContainerId(target ? target.tableId : newTableId)
      setSelectedObjectIds(ids.slice(0, 1))
    },
    [currentScreenId, project.nextId, setProject],
  )

  // An object dragged out of a table put together by snapping and let go
  // (docs/2026-10-09-snap-tables.md, Task 6): out of the table, its top left
  // corner at `to` in the space the table stands in, then snapped where
  // `drop` says or left free. That space is open afterwards, or the table
  // it snapped into; the object stays chosen.
  const snapMoveOut = useCallback(
    (tableId: string, objectId: string, to: { x: number; y: number }, drop: SnapDrop | null) => {
      const newTableId = `obj-${project.nextId}`
      const parentId = findParentOf(currentScreen.objects, tableId)?.parent?.id ?? null
      setProject((prev) => {
        const scale = { pixelsPerMm: prev.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm, fonts: prev.fonts }
        const move = (list: ScreenObject[]) => moveOutOf(list, tableId, objectId, to, drop, scale, newTableId)
        return {
          ...prev,
          nextId: drop?.kind === "pair" ? prev.nextId + 1 : prev.nextId,
          screens: prev.screens.map((screen) => {
            if (screen.id !== currentScreenId) return screen
            if (!parentId) return { ...screen, objects: move(screen.objects) }
            const space = findObjectById(screen.objects, parentId)
            return space ? { ...screen, objects: updateObjectById(screen.objects, parentId, { children: move(space.children ?? []) }) } : screen
          }),
        }
      })
      setEditingContainerId(drop ? (drop.kind === "table" ? drop.tableId : newTableId) : parentId)
      setSelectedObjectIds([objectId])
    },
    [currentScreen.objects, currentScreenId, project.nextId, setProject],
  )

  const moveObject = useCallback(
    // One object or several - a selection dragged on the canvas or in the
    // object tree moves as a whole, in the order it stood in.
    (objectIds: string | readonly string[], newParentId: string | null, anchor: MoveAnchor) => {
      const ids = typeof objectIds === "string" ? [objectIds] : objectIds
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          // Into or out of a group or a panel, an object stays where it is
          // on the screen: its coordinates are rewritten for the new parent's
          // space. A panel only ever reorders within its own switcher.
          let objects = screen.objects
          const movable = movedTogether(objects, ids).filter((id) => canDropAsChildOf(screen.objects, id, newParentId))
          // Out of a table into something else, an object's cell means
          // nothing any more (lib/table.ts).
          const intoTable = newParentId !== null && findObjectById(objects, newParentId)?.type === TABLE_TYPE
          for (const objectId of movable) {
            const found = findObjectById(objects, objectId)
            if (found?.properties?.cell && !intoTable) {
              const { cell: _cell, ...properties } = found.properties
              objects = updateObjectById(objects, objectId, { properties })
            }
            const moved = findObjectById(objects, objectId)
            const oldParentId = findParentOf(objects, objectId)?.parent?.id ?? null
            if (moved && moved.type !== "panel" && oldParentId !== newParentId) {
              const from = childOrigin(objects, oldParentId)
              const to = childOrigin(objects, newParentId)
              objects = updateObjectById(objects, objectId, translateObject(moved, from.x - to.x, from.y - to.y))
            }
          }
          return { ...screen, objects: moveObjectsToParent(objects, movable, newParentId, anchor) }
        }),
      }))
      setEditingContainerId(null)
    },
    [currentScreenId],
  )

  const handleZoomChange = useCallback((sliderValue: number) => {
    const zoomLevel = zoomLevels[sliderValue]
    setCanvasZoom(zoomLevel / 100)
  }, [])

  const getCurrentZoomIndex = useCallback(() => {
    const currentZoomPercent = Math.round(canvasZoom * 100)
    const closestIndex = zoomLevels.findIndex((level) => level === currentZoomPercent)
    return closestIndex !== -1 ? closestIndex : 0 // Default to first zoom level (200%)
  }, [canvasZoom])

  const parseSnapGrid = useCallback((snapGridJson: string): SnapGuide[] => {
    try {
      const parsed = JSON.parse(snapGridJson)
      const guides: SnapGuide[] = []

      if (parsed.horizontal && Array.isArray(parsed.horizontal)) {
        parsed.horizontal.forEach((position: number, index: number) => {
          guides.push({
            id: `h-${index}`,
            type: "horizontal",
            position: position,
            visible: true,
          })
        })
      }

      if (parsed.vertical && Array.isArray(parsed.vertical)) {
        parsed.vertical.forEach((position: number, index: number) => {
          guides.push({
            id: `v-${index}`,
            type: "vertical",
            position: position,
            visible: true,
          })
        })
      }

      return guides
    } catch (error) {
      console.error("Invalid snap grid JSON:", error)
      return []
    }
  }, [])

  const currentSnapGuides = parseSnapGrid(project.settings.snapGrid)

  const addAsset = useCallback(
    (asset: ProjectAsset) => {
      console.log(
        "[v0] Current project assets before adding:",
        project.assets.map((a) => ({ id: a.id, name: a.name })),
      )

      setProject((prev) => {
        const updatedProject = {
          ...prev,
          assets: [...prev.assets, asset],
        }
        console.log(
          "[v0] Updated project assets after adding:",
          updatedProject.assets.map((a) => ({ id: a.id, name: a.name })),
        )
        return updatedProject
      })

      setTimeout(() => {
        console.log(
          "[v0] Asset addition completed, current project assets:",
          project.assets.map((a) => ({ id: a.id, name: a.name })),
        )
      }, 100)
    },
    [project.assets],
  )

  const handleCanvasIconClick = useCallback((position: { x: number; y: number }) => {
    setIconClickPosition(position)
    setIconSelectorContext({ type: "canvas" })
    setShowIconSelector(true)
  }, [])

  const handleValueIconPairIconSelect = useCallback((pairIndex: number) => {
    setIconSelectorContext({ type: "value-icon-pair", pairIndex })
    setShowIconSelector(true)
  }, [])

  const handleIconPropertiesIconSelect = useCallback(() => {
    setIconSelectorContext({ type: "icon-properties" })
    setShowIconSelector(true)
  }, [])

  const handleScreenIconSelect = useCallback((screenId: string) => {
    setIconSelectorContext({ type: "screen-icon", screenId })
    setShowIconSelector(true)
  }, [])

  const handleIconSelect = useCallback(
    (assetId: string, iconName: string) => {

      if (iconSelectorContext?.type === "canvas" && iconClickPosition) {
        const newIconObject: Omit<ScreenObject, "id" | "zIndex"> = {
          type: "icon",
          x: Math.round(iconClickPosition.x - 32),
          y: Math.round(iconClickPosition.y - 32),
          width: 64,
          height: 64,
          properties: {
            assetId: assetId,
            iconName: iconName,
            backgroundColor: "transparent",
          },
        }

        // At M where the device gives a scale, centred where it was clicked,
        // like every other new object with a size step (canvas.tsx
        // addInteractionObject).
        const scale = screenTextScale(project, currentScreen)
        const atM = scale ? stepUpdates(newIconObject as ScreenObject, "m", scale.pixelsPerMm, project.fonts) : undefined
        if (atM?.width) {
          newIconObject.x = Math.round(iconClickPosition.x - atM.width / 2)
          newIconObject.y = Math.round(iconClickPosition.y - atM.width / 2)
        }
        addObject(atM ? { ...newIconObject, ...atM } : newIconObject)
        setIconClickPosition(null)
        setActiveTool("select")
      } else if (
        iconSelectorContext?.type === "value-icon-pair" &&
        selectedObject &&
        iconSelectorContext.pairIndex !== undefined
      ) {
        const currentPairs = selectedObject.properties.valueIconPairs || []
        const newPairs = [...currentPairs]
        if (newPairs[iconSelectorContext.pairIndex]) {
          newPairs[iconSelectorContext.pairIndex] = {
            ...newPairs[iconSelectorContext.pairIndex],
            thenShowIcon: assetId,
          }
          updateObject(selectedObject.id, {
            properties: {
              ...selectedObject.properties,
              valueIconPairs: newPairs,
            },
          })
        }
      } else if (iconSelectorContext?.type === "live-value-rule" && selectedObject && iconSelectorContext.liveValueId) {
        const { liveValueId, target } = iconSelectorContext
        const icon = { kind: "icon" as const, icon: assetId }
        const liveValues = (selectedObject.properties.liveValues ?? []).map((lv: any) => {
          if (lv.id !== liveValueId) return lv
          if (typeof target === "number") return { ...lv, rules: lv.rules.map((rule: any, i: number) => (i === target ? { ...rule, result: icon } : rule)) }
          if (target === "otherwise") return { ...lv, otherwise: icon }
          if (target === "noValueYet") return { ...lv, noValueYet: icon }
          return lv
        })
        updateObject(selectedObject.id, { properties: { ...selectedObject.properties, liveValues } })
      } else if (iconSelectorContext?.type === "icon-properties" && selectedObject) {
        updateObject(selectedObject.id, {
          properties: {
            ...selectedObject.properties,
            assetId: assetId,
            iconName: iconName,
          },
        })
      } else if (iconSelectorContext?.type === "software-button" && selectedObject) {
        updateObject(selectedObject.id, {
          properties: {
            ...selectedObject.properties,
            iconAssetId: assetId,
          },
        })
      } else if (
        iconSelectorContext?.type === "switch-state" &&
        selectedObject &&
        iconSelectorContext.stateIndex !== undefined
      ) {
        const currentStates = selectedObject.properties.states || []
        const newStates = [...currentStates]
        if (newStates[iconSelectorContext.stateIndex]) {
          const key = iconSelectorContext.slot === "active" ? "activeIconAssetId" : "iconAssetId"
          newStates[iconSelectorContext.stateIndex] = {
            ...newStates[iconSelectorContext.stateIndex],
            [key]: assetId,
          }
          updateObject(selectedObject.id, {
            properties: {
              ...selectedObject.properties,
              states: newStates,
            },
          })
        }
      } else if (iconSelectorContext?.type === "screen-live-rule" && iconSelectorContext.screenId) {
        // A result of a live screen icon: a rule, Otherwise or No value yet.
        const { screenId, target } = iconSelectorContext
        const icon = { kind: "icon" as const, icon: assetId }
        setProject((prev) => ({
          ...prev,
          screens: prev.screens.map((screen) => {
            if (screen.id !== screenId || !screen.iconLive) return screen
            const lv = screen.iconLive
            const iconLive =
              typeof target === "number"
                ? { ...lv, rules: lv.rules.map((rule, i) => (i === target ? { ...rule, result: icon } : rule)) }
                : target === "otherwise"
                  ? { ...lv, otherwise: icon }
                  : target === "noValueYet"
                    ? { ...lv, noValueYet: icon }
                    : lv
            return { ...screen, iconLive }
          }),
        }))
      } else if (iconSelectorContext?.type === "screen-icon" && iconSelectorContext.screenId) {
        const screenId = iconSelectorContext.screenId
        setProject((prev) => ({
          ...prev,
          screens: prev.screens.map((screen) => (screen.id === screenId ? { ...screen, iconAssetId: assetId } : screen)),
        }))
      }

      setIconSelectorContext(null)
      setShowIconSelector(false)
    },
    [iconClickPosition, iconSelectorContext, selectedObject, addObject, updateObject, setProject, project, currentScreen],
  )

  const generateImageHash = useCallback((dataUrl: string): string => {
    let hash = 0
    for (let i = 0; i < dataUrl.length; i++) {
      const char = dataUrl.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }, [])

  const addOrFindAsset = useCallback(
    (file: File, dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        const hash = generateImageHash(dataUrl)

        const existingAsset = project.assets.find((asset) => asset.type === "image" && asset.data === dataUrl)

        if (existingAsset) {
          resolve(existingAsset.id)
          return
        }

        const newAsset: ProjectAsset = {
          id: `asset-${project.nextId}`,
          name: file.name,
          type: "image",
          data: dataUrl,
          size: file.size,
        }


        setProject((prev) => ({
          ...prev,
          nextId: prev.nextId + 1, // Increment nextId
          assets: [...prev.assets, newAsset],
        }))

        resolve(newAsset.id)
      })
    },
    [project.assets, generateImageHash, project.nextId],
  )

  const updateScreenColors = useCallback(
    (backgroundColor?: string, gridColor?: string) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId ? { ...screen, backgroundColor, gridColor } : screen,
        ),
      }))
    },
    [currentScreenId],
  )

  const incrementNextId = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      nextId: prev.nextId + 1,
    }))
  }, [])

  // calculateTextObjectHeight moved to lib/font-utils.ts

  const handleCreateObject = useCallback(
    (x: number, y: number, width: number, height: number) => {

      if (!width || !height) {
        console.warn("[v0] Width or height is zero, skipping object creation.")
        return
      }

      // The colours a new control starts with: roles of the screen's theme
      // (lib/control-palette.ts ROLE_PALETTE), resolved at draw time for the
      // variant shown and the depth of the device.
      const palette = ROLE_PALETTE

      switch (activeTool) {
        case "live-icon":
          addObject({
            type: "live-icon",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              topic: undefined, // Changed from topicId to topic
              valueIconPairs: [],
              backgroundColor: "transparent",
            },
          })
          break
        case "text": {
          const selectedFont = project.fonts && project.fonts.length > 0 ? project.fonts[0] : null
          console.log("=== CREATING NEW LABEL ===")
          console.log("Available fonts:", project.fonts?.map(f => ({ id: f.id, name: f.name })))
          console.log("Selected font:", selectedFont ? { id: selectedFont.id, name: selectedFont.name, size: selectedFont.size } : "NONE")
          
          addObject({
            type: "text",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: (() => {
              const f = project.fonts && project.fonts[0]
              const fontSize = f?.size || 16
              return calculateTextObjectHeight(fontSize)
            })(),
            properties: {
              text: "New Label",
              fontId: project.fonts && project.fonts.length > 0 ? project.fonts[0].id : undefined,
              fontSize: project.fonts && project.fonts.length > 0 ? project.fonts[0].size : 16,
              textAlign: "left",
              // A label is text on the screen, not a box: no background and no
              // border until someone asks for one (user, 2026-09-25).
              backgroundColor: "transparent",
              borderColor: "transparent",
              textColor: palette.text,
            },
          })
          
          console.log("Label created with fontId:", selectedFont?.id)
          console.log("=== END CREATE LABEL ===\n")
          break
        }
        case "line":
          addObject({
            type: "line",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              strokeColor: palette.stroke,
              strokeWidth: 2,
            },
          })
          break
        case "box":
          addObject({
            type: "box",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              // A panel, as the canvas's own creation path makes it.
              fillColor: palette.track,
              strokeColor: palette.stroke,
              strokeWidth: 2,
            },
          })
          break
        case "icon": {
          const { selectedIconAssetId } = project.settings
          
          // Icons must be square
          const size = Math.max(Math.abs(width), Math.abs(height))

          addObject({
            type: "icon",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(size),
            height: Math.round(size),
            properties: {
              assetId: selectedIconAssetId || null,
              iconName: "default",
              backgroundColor: "transparent",
            },
          })

          break
        }
        case "gauge":
        case "dial": {
          const smallestFont = project.fonts && project.fonts.length > 0
            ? project.fonts.reduce((smallest, font) => {
                const smallestSize = smallest?.size || Infinity
                const currentSize = font.size || 0
                return currentSize < smallestSize ? font : smallest
              }, project.fonts[0])
            : null

          // Square, like an icon - the ring is inscribed in its box.
          const arcSize = Math.round(Math.max(Math.abs(width), Math.abs(height)))
          addObject({
            type: activeTool,
            x: Math.round(x),
            y: Math.round(y),
            width: arcSize,
            height: arcSize,
            properties: {
              topic: undefined,
              setpointTopic: undefined,
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              // Half past seven round to half past four - the thermostat
              // shape, 270 degrees with a symmetric gap at the bottom.
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness: LEVEL_DEFAULT_THICKNESS,
              displayValue: "value",
              // One colour, like the bar's: the unfilled track is this mixed
              // halfway into what the ring stands on, the handle is this
              // itself, and the ring has no background of its own
              // (docs/2026-09-22-arc-look.md).
              fillColor: palette.fill,
              textColor: palette.textOnFill,
              fontSize: smallestFont?.size || 12,
              fontId: smallestFont?.id,
            },
          })
          break
        }
        case "bar":
        case "slider": {
          // Find the smallest available font
          const smallestFont = project.fonts && project.fonts.length > 0
            ? project.fonts.reduce((smallest, font) => {
                const smallestSize = smallest?.size || Infinity
                const currentSize = font.size || 0
                return currentSize < smallestSize ? font : smallest
              }, project.fonts[0])
            : null
          
          addObject({
            type: activeTool,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              topic: undefined, // Changed from topicId to topic
              direction: "left-to-right", // "left-to-right" | "bottom-to-top" | "right-to-left" | "top-to-bottom"
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              displayValue: "value", // "value" | "percentage"
              // One colour: the bar's. The track is worked out from it and the
              // screen's background, and there is no box, frame or background
              // of its own (docs/2026-09-19-slider-look.md, decision 12).
              fillColor: palette.fill,
              // Written out rather than left to the default, so the file says
              // how thick the bar is (decision 14).
              // `thickness` on both shapes since 2026-09-22; `barThickness`
              // is still read for what is already written.
              thickness: LEVEL_DEFAULT_THICKNESS,
              textColor: palette.text,
              fontSize: smallestFont?.size || 12,
              fontId: smallestFont?.id,
            },
          })
          break
        }
        case "button":
          addObject({
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
              buttonColor: palette.fill,
              fontId: project.fonts && project.fonts.length > 0 ? project.fonts[0].id : undefined,
              action: { type: "next-screen" } as HardwareButtonAction,
            },
          })
          break
        default:
          console.warn("[v0] Unknown active tool:", activeTool)
      }

      setActiveTool("select")
    },
    [activeTool, addObject, project.settings, project.fonts, setActiveTool],
  )

  const handleManageTopics = useCallback(() => {
    setProjectSettingsTab("topics")
    setShowProjectSettings(true)
  }, [])

  const handleOpenProjectSettings = useCallback((tab: string) => {
    setProjectSettingsTab(tab)
    setShowProjectSettings(true)
  }, [])

  const handleMqttDiscovery = useCallback(() => {
    setShowMqttDiscovery(true)
  }, [])

  const handleTopicsSelected = useCallback((discoveredTopics: any[]) => {

    setProject((prev) => {
      let currentNextId = prev.nextId
      const newTopics: Topic[] = discoveredTopics.map((topic) => {
        const newTopic: Topic = {
          id: `topic_${currentNextId}`,
          topic: topic.topic,
          type: topic.type,
          examples: topic.examples,
          // Discovery derives these from the payloads it saw (see
          // MqttDiscoveryDialog's mergeJsonMessage); they stay editable in
          // Manage Topics like any hand-added subtopic.
          subtopics:
            topic.type === "json"
              ? (topic.subtopics ?? []).map((s: { path: string; type: "numeric" | "text" }, i: number) => ({
                  id: `topic_${currentNextId}_sub_${i}`,
                  path: s.path,
                  type: s.type,
                }))
              : undefined,
        }
        currentNextId++
        return newTopic
      })

      return {
        ...prev,
        nextId: currentNextId, // Update nextId after creating all topics
        topics: [...prev.topics, ...newTopics],
      }
    })

  }, [])

  // The Projects panel (docs/2026-09-23-explicit-save.md): open, rename and
  // delete a saved project.

  // Opens a saved project, its newest version, saved. A load: undo starts
  // afresh. Asks about unsaved changes first; the open one is left alone.
  const openSavedProject = useCallback(
    async (name: string) => {
      if (save.savedName !== null && sameProjectName(name, save.savedName)) return
      if (!(await confirmLeave())) return
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`).catch(() => null)
      const data = res?.ok ? await res.json() : null
      if (!data) {
        toast({ title: "Could not open", description: `"${name}" could not be read.`, variant: "destructive" })
        return
      }
      // Migrated like every other door a project comes in through: a version
      // or a draft can predate a migration (colours becoming roles). The
      // saved one too, so an old project does not open as "unsaved" merely
      // because it was migrated.
      const saved: Project = migrateProject(structuredClone(data.project))
      // This browser's draft of it, if there is one, is what opens - shown
      // unsaved against the newest saved version.
      const draft = await getDraft(draftKeyForName(data.name))
      const opened: Project = draft
        ? { ...migrateProject(structuredClone(draft.project as Project)), name: data.name }
        : saved
      history.replace(opened)
      save.markSaved(data.name, saved, data.versionId)
      setCurrentScreenId(firstScreenToOpen(opened.screens)!.id)
      setSelectedObjectIds([])
      setDeviceGateError(null)
      setDeviceStaleWarning(null)
    },
    [save.savedName, save.markSaved, confirmLeave, history.replace, toast],
  )

  // Opens the draft of a project that was never saved, from the list.
  const openUntitledDraft = useCallback(
    async (key: string) => {
      if (save.savedName === null && key === untitledDraftKey && projectOpen) return
      if (!(await confirmLeave())) return
      const draft = await getDraft(key)
      if (!draft) return
      // Migrated like every other door a project comes in through.
      const opened = migrateProject(structuredClone(draft.project as Project))
      history.replace(opened)
      save.markUnnamed()
      setUntitledDraftKey(key)
      setCurrentScreenId(firstScreenToOpen(opened.screens)!.id)
      setSelectedObjectIds([])
      setDeviceGateError(null)
      setDeviceStaleWarning(null)
    },
    [save.savedName, save.markUnnamed, untitledDraftKey, projectOpen, confirmLeave, history.replace],
  )

  // The address (docs/2026-09-23-explicit-save.md, "Address"): /projects/<name>
  // opens that project on mount. An unknown name lands on the start page with
  // «No project "…"». Until that first open has run, nothing else shows, so
  // the start page does not flash up first.
  const [openingInitial, setOpeningInitial] = useState(!!initialName)
  useEffect(() => {
    if (!initialName) return
    let current = true
    fetch(`/api/projects/${encodeURIComponent(initialName)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then(async (data) => {
        if (!current) return
        if (data) await openSavedProject(data.name)
        else setDeviceGateError(`No project "${initialName}"`)
        setOpeningInitial(false)
      })
    return () => {
      current = false
    }
    // Once, for the address the page was loaded with.
  }, [])

  // From then on the address follows the editor: the saved name while a named
  // project is open, the start page's address otherwise. Replaced, never
  // pushed - no navigation, so undo and unsaved changes stay; and no history
  // entries of its own, so Back leaves the designer like any page.
  useEffect(() => {
    if (openingInitial) return
    const target = projectOpen && save.savedName !== null ? `/projects/${encodeURIComponent(save.savedName)}` : "/"
    if (decodeURIComponent(window.location.pathname) !== decodeURIComponent(target)) {
      window.history.replaceState(window.history.state, "", target)
    }
  }, [openingInitial, projectOpen, save.savedName])

  const renameSavedProject = useCallback(
    async (name: string, newName: string) => {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Renaming failed")
      if (save.savedName !== null && sameProjectName(name, save.savedName)) save.renamed(data.name, data.versionId)
    },
    [save.savedName, save.renamed],
  )

  // The open project cannot be deleted (decided 2026-09-24): open another
  // first. Anything else goes, all its versions with it, once the delete
  // dialog (delete-project-dialog.tsx) is confirmed.
  const deleteSavedProject = useCallback(
    async (name: string, backup: boolean) => {
      if (save.savedName !== null && sameProjectName(name, save.savedName)) {
        toast({
          title: "Could not delete",
          description: `"${save.savedName}" is open. Open another project to delete it.`,
          variant: "destructive",
        })
        throw new Error("open")
      }
      // The backup the delete dialog offers, ticked by default (decided
      // 2026-09-25): the newest version as a project file, before anything
      // goes. If it cannot be made, nothing is deleted.
      if (backup) {
        const res = await fetch(`/api/projects/${encodeURIComponent(name)}`).catch(() => null)
        const data = res?.ok ? await res.json() : null
        if (!data) throw new Error("The backup could not be downloaded, so nothing was deleted.")
        await downloadEditableProject(data.project)
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" }).catch(() => null)
      if (!res?.ok) throw new Error(`"${name}" could not be deleted.`)
    },
    [save.savedName, toast],
  )

  // File > New Project and the start page's New Project: after the question
  // for unsaved changes, the New Project dialog (device, then name).
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const newProject = useCallback(async () => {
    if (await confirmLeave()) setNewProjectOpen(true)
  }, [confirmLeave])

  // The New Project dialog's Create Project: builds a fresh project on the
  // chosen device, saves it under its name as its first version, and opens
  // it, saved. Throws, for the dialog to show, if the device cannot be
  // loaded or the name is taken meanwhile.
  const handleCreateProjectWithDevice = useCallback(async (ddfPath: string, name: string) => {
    const fields = await loadDeviceDescriptionByPath(ddfPath)
    const fresh: Project = {
      ...createDefaultProject(),
      name,
      screenWidth: fields.screenWidth,
      screenHeight: fields.screenHeight,
      adornment: fields.adornment,
      adornmentDrawingArea: fields.adornmentDrawingArea,
      hardwareButtons: fields.hardwareButtons,
      fonts: fields.fonts,
      embeddedDdfZipBase64: fields.ddfZipBase64,
    }
    fresh.settings = {
      ...fresh.settings,
      colorDepth: fields.colorDepth,
      deviceId: fields.deviceId,
      deviceName: fields.deviceName,
      devicePlatform: fields.devicePlatform,
      supportedObjectTypes: fields.supportedObjectTypes,
      deviceActions: fields.deviceActions,
      ddfHash: fields.ddfHash,
      // Was previously never set from the device at all - every touch-
      // capable device (including the existing m5dial) required manually
      // re-checking this in Project Settings before the Button tool
      // appeared, even though the DDF already says the device supports it.
      supportsSoftwareButtons: declaresTouch(fields.supportedObjectTypes),
      needsPageIconsInSize: fields.needsPageIconsInSize,
      pixelsPerMm: fields.pixelsPerMm,
      typographies: fields.typographies,
      screenShape: fields.screenShape,
      popupCloseRadius: fields.popupCloseRadius,
    }
    // The master starts in the first theme made for the device's depth -
    // Paper on the PaperS3 (lib/themes.ts themesFor).
    fresh.screens = fresh.screens.map((screen) =>
      screen.isMaster ? { ...screen, themeId: defaultThemeIdFor(fields.colorDepth) } : screen,
    )
    const created = await createProjectOnServer(name, fresh)
    const stored: Project = { ...fresh, name: created.name }
    history.replace(stored)
    save.markSaved(created.name, stored, created.versionId)
    // The regular screen, not the master - a fresh project should open on
    // something the user actually edits day-to-day.
    setCurrentScreenId(firstScreenToOpen(stored.screens)!.id)
    setSelectedObjectIds([])
    setDeviceGateError(null)
    setDeviceStaleWarning(null)
  }, [history.replace, save.markSaved])

  // Checked before any other field of an uploaded project.json is read -
  // an unrecognized file format can't be trusted to have any of the
  // fields below mean what this app expects them to mean. Only a newer
  // *major* is rejected: a newer minor is additive and readable by
  // construction, and an older one is readable too (whether it also wants
  // a migration is a separate question - docs/nested-provenance.md's
  // "Upgrade scripts" - and no major has happened yet, so none exists).
  const validateProjectSchemaVersion = (data: any) => {
    assertReadableGeneration(data?.systemGeneration, "project file")
  }

  // Zip-building itself lives in lib/project-zip.ts's buildEditableProjectZip()
  // (extracted 2026-08-15) so buildDeviceProjectZip() can embed this exact
  // same artifact into a device export as _source/project.zip - the two
  // must never drift into producing subtly different project.json shapes.
  const downloadProject = useCallback(async () => {
    try {
      await downloadEditableProject(project)
    } catch (error) {
      console.error("[v0] Error downloading project:", error)
    }
  }, [project])

  // Extracted out of uploadProject (2026-08-15) so the "Recover project
  // from device" flow (startup-device-gate.tsx, via a synthetic File built
  // from GET /recovery-project's bytes) can drive the exact same parsing/
  // device-resolution logic a real file-picker upload does, without
  // needing a <input type=file> or a user click - both callers share this
  // one implementation rather than risking the two drifting apart.
  const processUploadedProjectFile = useCallback(async (file: File) => {
        try {
          let projectData: any
          let loadedAssets: ProjectAsset[] = []
          let loadedFonts: ProjectFont[] = []
          // Read back from _source/ddf.zip below if the uploaded zip has
          // one - stays undefined for the bare-.json recovery branch (no
          // zip container to hold it) and for projects saved before this
          // field existed, same "undefined = predates this" convention as
          // everywhere else in this file.
          let embeddedDdfZipBase64: string | undefined = undefined

          if (file.name.toLowerCase().endsWith(".json")) {
            // Last-resort device recovery (2026-08-02): a bare project.json
            // pulled from a device's own GET /api/project (see the
            // firmware's UnifiedConfigurator::handleProjectDownload) - no
            // assets/fonts folder to draw on, since the device only ever
            // stored the rasterized PBM/BDF form, not the original SVGs.
            // Every object/topic/position still comes back; icon/font
            // *references* stay as bare IDs pointing at nothing until
            // manually re-added - better than losing the whole project.
            // The generation first: a file from a newer major is refused as
            // that, not as whatever its colours look like to this reader.
            projectData = JSON.parse(await file.text())
            validateProjectSchemaVersion(projectData)
            projectData = migrateProject(projectData)
          } else {
            // Import JSZip for extracting the zip file
            const JSZip = (await import("jszip")).default
            const zip = new JSZip()

            // Load the zip file
            const zipContent = await zip.loadAsync(file)

            // Extract project.json
            const projectJsonFile = zipContent.file("project.json")
            if (!projectJsonFile) {
              throw new Error("project.json not found in zip file")
            }

            const projectJsonContent = await projectJsonFile.async("text")
            projectData = JSON.parse(projectJsonContent)
            validateProjectSchemaVersion(projectData)
            projectData = migrateProject(projectData)

            // Read the embedded DDF back as an opaque blob (zip-in-zip,
            // never unpacked) - round-trips it through save/load so it
            // isn't silently dropped on the next download.
            const embeddedDdfEntry = zipContent.file("_source/ddf.zip")
            if (embeddedDdfEntry) {
              embeddedDdfZipBase64 = await embeddedDdfEntry.async("base64")
            }

            // Extract assets from the assets folder
            const assetsFolder = zipContent.folder("assets")

            if (assetsFolder && projectData.assets) {

              // Process each asset from the project data
              for (const assetData of projectData.assets) {
                if (assetData.path && assetData.path.startsWith("assets/")) {
                  const fileName = assetData.path.replace("assets/", "")
                  const zipEntry = assetsFolder.file(fileName)

                  if (zipEntry) {
                    // Get file extension to determine MIME type
                    const extension = fileName.split(".").pop()?.toLowerCase()
                    let mimeType = "application/octet-stream"

                    if (extension === "svg") {
                      mimeType = "image/svg+xml"
                    } else if (extension === "png") {
                      mimeType = "image/png"
                    } else if (extension === "jpg" || extension === "jpeg") {
                      mimeType = "image/jpeg"
                    } else if (extension === "gif") {
                      mimeType = "image/gif"
                    } else if (extension === "webp") {
                      mimeType = "image/webp"
                    } else if (extension === "bmp") {
                      mimeType = "image/bmp"
                    } else if (extension === "tiff") {
                      mimeType = "image/tiff"
                    }

                    // Read the file content as base64
                    const fileContent = await zipEntry.async("base64")
                    const dataUrl = `data:${mimeType};base64,${fileContent}`

                    // Create the asset with the original data format
                    const asset: ProjectAsset = {
                      id: assetData.id,
                      name: assetData.name,
                      type: assetData.type,
                      data: dataUrl,
                      size: assetData.size,
                    }

                    loadedAssets.push(asset)
                  } else {
                    console.warn("[v0] Asset file not found in zip:", fileName)
                  }
                }
              }
            }

            const fontsFolder = zipContent.folder("fonts")

            if (fontsFolder && projectData.fonts) {

              for (const fontData of projectData.fonts) {
                if (fontData.path && fontData.path.startsWith("fonts/")) {
                  const fileName = fontData.path.replace("fonts/", "")
                  const zipEntry = fontsFolder.file(fileName)

                  if (zipEntry) {
                    // Read the BDF file content as text
                    const bdfContent = await zipEntry.async("text")

                    // Create the font with the BDF model
                    const font: ProjectFont = {
                      id: fontData.id,
                      name: fontData.name,
                      displayName: fontData.displayName,
                      path: fontData.path,
                      size: fontData.size,
                      data: bdfContent,
                      internalName: fontData.internalName,
                      ascent: fontData.ascent,
                      descent: fontData.descent,
                      family: fontData.family,
                      weight: fontData.weight,
                    }

                    loadedFonts.push(font)
                  } else {
                    console.warn("[v0] Font file not found in zip:", fileName)
                  }
                }
              }
            }
          }

          // Restore the project data with loaded assets and fonts
          const restoredProject: Project = {
            ...projectData,
            assets: loadedAssets,
            fonts: loadedFonts,
            hardwareButtons: projectData.hardwareButtons || [], // Ensure hardware buttons are preserved
            embeddedDdfZipBase64,
            // A file's projectId (written 2026-08-02 to 2026-09-24) is
            // dropped: a file from outside becomes part of a project on the
            // server only by being saved under its name
            // (docs/2026-09-23-explicit-save.md).
            settings: { ...projectData.settings, projectId: undefined },
          }

          // Recalculate heights for text objects to ensure proper line height
          restoredProject.screens.forEach(screen => {
            screen.objects.forEach(obj => {
              if (obj.type === "text") {
                const fontMeta = loadedFonts.find(f => f.id === obj.properties.fontId)
                const fontSize = fontMeta?.size || obj.properties.fontSize || 16
                obj.height = calculateTextObjectHeight(fontSize)
              }
            })
            
            // Sort objects by drawing order
            screen.objects = sortObjectsByDrawingOrder(screen.objects)
          })

          // Every project must reference a device. Fall 1 (docs/nested-
          // provenance.md's "Version compatibility"): a project carrying
          // its own embedded DDF (_source/ddf.zip, read back above) is
          // self-contained and opens from that alone, regardless of what
          // this instance happens to curate - no re-resolve, no
          // instance-availability check, no staleness concern. Only a
          // project saved before that field existed falls back to
          // resolving against this instance's public/ddf/, same as before.
          const deviceId = restoredProject.settings?.deviceId
          if (!deviceId) {
            const msg = "This project has no device configured and cannot be opened."
            setDeviceGateError(msg)
            toast({ title: "No device configured", description: msg, variant: "destructive" })
            return
          }

          let finalProject: Project = restoredProject

          if (restoredProject.embeddedDdfZipBase64) {
            const fields = await resolveDeviceFromEmbeddedDdf(restoredProject.embeddedDdfZipBase64)
            const rotated = resolveRotatedScreenSize(fields, restoredProject.settings?.rotation ?? 0)
            if (rotated.rotationWasReset) {
              toast({
                title: "Rotation reset",
                description: `This device no longer supports ${restoredProject.settings?.rotation}° rotation - reset to 0°.`,
              })
            }
            finalProject = {
              ...restoredProject,
              screenWidth: rotated.screenWidth,
              screenHeight: rotated.screenHeight,
              adornment: fields.adornment,
              adornmentDrawingArea: fields.adornmentDrawingArea,
              hardwareButtons: fields.hardwareButtons,
              fonts: fields.fonts,
              settings: {
                ...restoredProject.settings,
                colorDepth: fields.colorDepth,
                deviceId: fields.deviceId,
                deviceName: fields.deviceName,
                devicePlatform: fields.devicePlatform,
                supportedObjectTypes: fields.supportedObjectTypes,
                deviceActions: fields.deviceActions,
                ddfHash: fields.ddfHash,
                rotation: rotated.rotation,
                needsPageIconsInSize: fields.needsPageIconsInSize,
                pixelsPerMm: fields.pixelsPerMm,
                typographies: fields.typographies,
                screenShape: fields.screenShape,
                popupCloseRadius: fields.popupCloseRadius,
              },
            }
            setDeviceStaleWarning(null)
          } else {
            const resolution = await resolveDeviceForProject(deviceId, restoredProject.settings?.deviceName)

            if (!resolution.ok) {
              // The device isn't available on this instance, but the
              // project file already carries a copy of its screen/font/
              // adornment data (the old, denormalized-fields fallback,
              // predating embeddedDdfZipBase64) - open with that instead
              // of hard-blocking, so projects stay portable between
              // instances. Surface this clearly rather than silently
              // risking stale/out-of-sync device data.
              const msg = `Device "${resolution.deviceName || resolution.deviceId}" (${resolution.deviceId}) is not available on this instance. Opened using the device data saved in the project file, which may be out of date - add its Device Description File to public/ddf/ to sync it.`
              setDeviceStaleWarning(msg)
              toast({ title: "Device not available on this instance", description: msg })
            } else {
              const { fields } = resolution
              const rotated = resolveRotatedScreenSize(fields, restoredProject.settings?.rotation ?? 0)
              if (rotated.rotationWasReset) {
                toast({
                  title: "Rotation reset",
                  description: `This device no longer supports ${restoredProject.settings?.rotation}° rotation - reset to 0°.`,
                })
              }
              finalProject = {
                ...restoredProject,
                screenWidth: rotated.screenWidth,
                screenHeight: rotated.screenHeight,
                adornment: fields.adornment,
                adornmentDrawingArea: fields.adornmentDrawingArea,
                hardwareButtons: fields.hardwareButtons,
                fonts: fields.fonts,
                embeddedDdfZipBase64: fields.ddfZipBase64,
                settings: {
                  ...restoredProject.settings,
                  colorDepth: fields.colorDepth,
                  deviceId: fields.deviceId,
                  deviceName: fields.deviceName,
                  devicePlatform: fields.devicePlatform,
                  supportedObjectTypes: fields.supportedObjectTypes,
                  deviceActions: fields.deviceActions,
                  ddfHash: fields.ddfHash,
                  rotation: rotated.rotation,
                  needsPageIconsInSize: fields.needsPageIconsInSize,
                  pixelsPerMm: fields.pixelsPerMm,
                  typographies: fields.typographies,
                  screenShape: fields.screenShape,
                  popupCloseRadius: fields.popupCloseRadius,
                },
              }
              setDeviceStaleWarning(null)
            }
          }

          // Update the project state. Rounded on the way in (see
          // lib/integer-geometry.ts): a file saved before the editor
          // rounded still holds fractions, and until they are gone the
          // canvas draws every 1px edge on a .5 boundary as two half-lit
          // pixel columns - blurry here long before it is a misplaced
          // object on a device.
          // Styled objects take the fonts of the device as it is now - a new
          // DDF may have come with it (docs/2026-09-30-size-scale.md).
          finalProject = resolveScale(finalProject)
          history.replace(withIntegerProjectGeometry(finalProject))
          save.markUnnamed()
          setUntitledDraftKey(newUntitledDraftKey())
          setDeviceGateError(null)

          // Opens on the first main screen - not a master, not a popup.
          const first = firstScreenToOpen(finalProject.screens)
          if (first) setCurrentScreenId(first.id)

          // Clear selection
          setSelectedObjectIds([])

        } catch (error) {
          console.error("[v0] Error uploading project:", error)
          alert("Error uploading project: " + (error as Error).message)
        }
  }, [history.replace, save.markUnnamed])

  const uploadProject = useCallback(() => {
    try {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".zip,.json"
      input.style.display = "none"
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (file) processUploadedProjectFile(file)
      }
      document.body.appendChild(input)
      input.click()
      document.body.removeChild(input)
    } catch (error) {
      console.error("[v0] Error creating upload dialog:", error)
    }
  }, [processUploadedProjectFile])

  const handleCopy = useCallback(() => {
    // selectedObjects already resolves ids recursively (findObjectById) -
    // re-filtering currentScreen.objects here (flat, top-level only, like
    // this used to) would silently find nothing for a selection nested
    // inside a tab-control's panel, leaving the clipboard empty with no
    // indication why (2026-07-26 finding: reported as "Paste" being
    // impossible to choose after copying a control from one tab and
    // switching to another - the copy itself had already failed).
    //
    // Kept at their place on the screen rather than in their parent's
    // space, so a copy from inside a group pastes where it was seen, into
    // whatever container is open when it is pasted. A panel stays as it
    // is: it only ever fills its switcher.
    if (selectedObjects.length > 0) {
      setClipboard(
        selectedObjects.map((obj) => {
          if (obj.type === "panel") return obj
          const origin = childOrigin(currentScreen.objects, findParentOf(currentScreen.objects, obj.id)?.parent?.id ?? null)
          return translateObject(obj, origin.x, origin.y)
        }),
      )
    }
  }, [selectedObjects, currentScreen.objects])

  // Cut: copied, then gone from the screen - in one step, so one undo brings
  // all of it back (reported 2026-10-03: Ctrl+X did nothing).
  const handleCut = useCallback(() => {
    if (selectedObjects.length === 0) return
    handleCopy()
    const ids = selectedObjectIds
    setProject((prev) => ({
      ...prev,
      screens: prev.screens.map((screen) =>
        screen.id === currentScreenId ? { ...screen, objects: ids.reduce((list, id) => deleteObjectById(list, id), screen.objects) } : screen,
      ),
    }))
    setSelectedObjectIds([])
  }, [selectedObjects, selectedObjectIds, handleCopy, currentScreenId, setProject])

  // Everything at the level being worked on: inside an open panel or group,
  // its objects, else the screen's.
  const handleSelectAll = useCallback(() => {
    const container = editingContainerId ? findObjectById(currentScreen.objects, editingContainerId) : null
    const allObjectIds = (container ? (container.children ?? []) : currentScreen.objects).map((obj) => obj.id)
    setSelectedObjectIds(allObjectIds)
  }, [currentScreen.objects, editingContainerId])

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return

    // Paste targets whatever panel or group is currently open for editing
    // (if any), not always the screen's top level - otherwise duplicating a
    // control from one tab-control panel into another (copy in panel 1,
    // switch to panel 2, paste) would silently land the copy outside the
    // tab-control entirely instead of where the user was actually working
    // (2026-07-26 finding). What a group cannot hold (a switcher) goes to
    // the screen instead.
    // A table put together by snapping takes nothing but through a cell: with
    // one open, the copy goes where the table stands, and that is open
    // afterwards (docs/2026-10-09-snap-tables.md, Task 6).
    const openRaw = editingContainerId ? findObjectById(currentScreen.objects, editingContainerId) : null
    const leavesTable = isSnapTable(openRaw)
    const openContainer = leavesTable ? (findParentOf(currentScreen.objects, openRaw!.id)?.parent ?? null) : openRaw
    const fitsOpenContainer = !isGroup(openContainer) || clipboard.every((obj) => obj.type !== "switcher" && obj.type !== "panel")
    const targetParentId = openContainer && fitsOpenContainer ? openContainer.id : null
    const siblings = targetParentId
      ? (findObjectById(currentScreen.objects, targetParentId)?.children ?? [])
      : currentScreen.objects
    const origin = childOrigin(currentScreen.objects, targetParentId)
    // An old table open keeps the old rule: a pasted object's cell goes with it.
    const intoOldTable = isOldTable(openContainer)
    const pastedIds: string[] = []
    // In a table, as in Word (asked 2026-10-03): an empty cell picked takes
    // the copy; over an object in a table it goes into a new row below it.
    // Several copied from one table keep their cells relative to each other
    // (lib/table.ts moveIntoTable). Where they do not fit, pasted as before.
    const intoTable: TableDrop | null = (() => {
      if (!tableContext?.cell) return null
      if (!tableContext.objectId) return { tableId: tableContext.tableId, row: tableContext.cell.row, column: tableContext.cell.column, insertRow: false }
      const standing = findObjectById(currentScreen.objects, tableContext.objectId)
      const below = tableContext.cell.row + ((standing && cellOf(standing)?.rowSpan) ?? 1)
      return { tableId: tableContext.tableId, row: below, column: tableContext.cell.column, insertRow: true }
    })()

    setProject((prev) => {
      let currentNextId = prev.nextId
      pastedIds.length = 0
      const pastedObjects: ScreenObject[] = []

      clipboard.forEach((obj) => {
        // A new id for the object and for everything inside it - a pasted
        // switcher's panels and a pasted group's children too. Only the
        // object itself got one until 2026-09-29, so a copy and its original
        // shared their inner ids and selecting one selected both.
        const fresh = withFreshIds(obj, currentNextId)
        currentNextId = fresh.nextId
        // 20 pixels right and down of the original, in the space of where
        // it lands.
        const shift = obj.type === "panel" ? { x: 20, y: 20 } : { x: 20 - origin.x, y: 20 - origin.y }
        const moved = translateObject(fresh.object, shift.x, shift.y)
        // Copied out of a table, an object pastes free: its cell means
        // nothing where it lands (an old table's cell paste aside). What a
        // copied table holds keeps its cells.
        const { cell: _cell, ...uncelled } = moved.properties ?? {}
        const newObject: ScreenObject = {
          ...moved,
          ...(intoTable || intoOldTable || !moved.properties?.cell ? {} : { properties: uncelled }),
          zIndex: Math.max(...siblings.map((o) => o.zIndex), 0) + pastedObjects.length + 1,
        }
        pastedObjects.push(newObject)
        pastedIds.push(newObject.id)
      })

      return {
        ...prev,
        nextId: currentNextId, // Update nextId after creating all pasted objects
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
          if (intoTable) {
            const placed = moveIntoTable([...screen.objects, ...pastedObjects], pastedIds, intoTable)
            if (placed) return { ...screen, objects: placed.objects }
          }
          if (targetParentId) {
            let newObjects = screen.objects
            for (const obj of pastedObjects) {
              newObjects = insertObjectIntoParent(newObjects, targetParentId, obj)
            }
            return { ...screen, objects: newObjects }
          }
          return { ...screen, objects: sortObjectsByDrawingOrder([...screen.objects, ...pastedObjects]) }
        }),
      }
    })
    if (leavesTable) setEditingContainerId(targetParentId)
    // Select the pasted objects
    setSelectedObjectIds([...pastedIds])
  }, [clipboard, currentScreen.objects, currentScreenId, editingContainerId, setProject, tableContext])

  // Ctrl+G: the selection becomes one group, in the place of its frontmost
  // object, and the group is what is selected afterwards. One setProject, so
  // one undo step.
  const groupSelection = useCallback(() => {
    const refusal = groupRefusal(currentScreen.objects, selectedObjectIds)
    if (refusal) {
      if (refusal !== "too-few") {
        toast({
          title: "Cannot group these objects",
          description:
            refusal === "different-parents"
              ? "Only objects in the same place can be grouped - not some inside a panel or group and some outside it."
              : "A switcher and its panels cannot go into a group.",
        })
      }
      return
    }
    const ids = [...selectedObjectIds]
    const created: string[] = []
    setProject((prev) => {
      created.length = 0
      const screen = prev.screens.find((sc) => sc.id === currentScreenId)
      if (!screen) return prev
      const groupId = `obj-${prev.nextId}`
      const objects = groupObjects(screen.objects, ids, groupId)
      if (!objects) return prev
      created.push(groupId)
      return {
        ...prev,
        nextId: prev.nextId + 1,
        screens: prev.screens.map((sc) => (sc.id === currentScreenId ? { ...sc, objects } : sc)),
      }
    })
    if (created.length > 0) setSelectedObjectIds([...created])
  }, [currentScreen.objects, currentScreenId, selectedObjectIds, setProject, toast])

  // Ctrl+U (or Ctrl+Shift+G): every selected group dissolved where it is, its objects
  // kept where they are on the screen - and selected.
  const ungroupSelection = useCallback(() => {
    const groupIds = selectedObjectIds.filter((id) => isGroup(findObjectById(currentScreen.objects, id)))
    if (groupIds.length === 0) return
    const released: string[] = []
    setProject((prev) => {
      released.length = 0
      const screen = prev.screens.find((sc) => sc.id === currentScreenId)
      if (!screen) return prev
      let objects = screen.objects
      for (const id of groupIds) {
        const result = ungroupObject(objects, id)
        if (!result) continue
        objects = result.objects
        released.push(...result.childIds)
      }
      return { ...prev, screens: prev.screens.map((sc) => (sc.id === currentScreenId ? { ...sc, objects } : sc)) }
    })
    const others = selectedObjectIds.filter((id) => !groupIds.includes(id))
    setSelectedObjectIds([...others, ...released])
  }, [currentScreen.objects, currentScreenId, selectedObjectIds, setProject])

  const canGroupSelection = groupRefusal(currentScreen.objects, selectedObjectIds) === null
  const canUngroupSelection = selectedObjectIds.some((id) => isGroup(findObjectById(currentScreen.objects, id)))

  // Out of the group being edited, one level: the group itself selected, and
  // the panel or group around it open if there is one. Escape does it, as a
  // click beside the group does on the canvas.
  const leaveEditedGroup = useCallback(() => {
    const group = editingContainerId ? findObjectById(currentScreen.objects, editingContainerId) : null
    // A table put together by snapping is left as a group is
    // (docs/2026-10-09-snap-tables.md): its object -> the table -> nothing.
    if (!group || !(isGroup(group) || isSnapTable(group))) return false
    setEditingContainerId(containerOf(currentScreen.objects, group.id))
    setSelectedObjectIds([group.id])
    return true
  }, [currentScreen.objects, editingContainerId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // CTRL+S / CMD+S saves (docs/2026-09-23-explicit-save.md) - also from
      // inside a field, and never the browser's own "save page". In preview
      // too: saving does not change the project.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (!projectOpen) return
        if (event.shiftKey) handleSaveAs()
        else void handleSave()
        return
      }
      // Check for CTRL+C or CMD+C (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        // Only trigger if we have selected objects and not in an input field
        if (selectedObjectIds.length > 0 && !isInputFocused()) {
          event.preventDefault()
          handleCopy()
        }
      }
      // CTRL+X or CMD+X (Mac): cut
      else if ((event.ctrlKey || event.metaKey) && event.key === "x") {
        if (selectedObjectIds.length > 0 && !isInputFocused()) {
          event.preventDefault()
          handleCut()
        }
      }
      // Check for CTRL+V or CMD+V (Mac)
      else if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        // Only trigger if we have clipboard data and not in an input field
        if (clipboard.length > 0 && !isInputFocused()) {
          event.preventDefault()
          handlePaste()
        }
      }
      // Check for CTRL+A or CMD+A (Mac)
      else if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        // Only trigger if not in an input field
        if (!isInputFocused()) {
          event.preventDefault()
          handleSelectAll()
        }
      }
      // CTRL+G groups the selection; CTRL+U ungroups it, and so does
      // CTRL+SHIFT+G, which is what other drawing programs use
      // (lib/object-groups.ts). All three are the browser's too - "find
      // next", "view source", "find previous" - which a designer has no use
      // for, so their default is prevented.
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === "g" || event.key.toLowerCase() === "u")) {
        const ungroup = event.key.toLowerCase() === "u" ? !event.shiftKey : event.shiftKey
        const group = event.key.toLowerCase() === "g" && !event.shiftKey
        if ((ungroup || group) && !isInputFocused() && !isPreviewMode && !dialogOpen()) {
          event.preventDefault()
          if (ungroup) ungroupSelection()
          else groupSelection()
        }
      }
      // Escape leaves the group being edited. Here rather than on the
      // canvas: a group is entered from the object tree as well, and then
      // the canvas does not have the keyboard.
      else if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!isInputFocused() && !isPreviewMode && !dialogOpen()) {
          // A tool waiting to be used is put down first - its hint says Esc
          // cancels (asked 2026-10-04).
          if (activeTool !== "select") setActiveTool("select")
          else leaveEditedGroup()
        }
      }
      // Enter goes into a table put together by snapping, one level down:
      // its first object, row by row (docs/2026-10-09-snap-tables.md).
      else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const target = event.target as HTMLElement | null
        const onControl = !!target?.closest?.("button, a, [role='button'], [role='menuitem']")
        if (!isInputFocused() && !onControl && !isPreviewMode && !dialogOpen() && selectedObjectIds.length === 1) {
          const table = findObjectById(currentScreen.objects, selectedObjectIds[0])
          const first = isSnapTable(table) ? firstInReadingOrder(table!.children ?? []) : undefined
          if (first) {
            event.preventDefault()
            setEditingContainerId(table!.id)
            setSelectedObjectIds([first.id])
          }
        }
      }
      // CTRL+Z undoes, CTRL+Y and CTRL+SHIFT+Z redo (docs/2026-09-23-undo.md).
      // Left to the browser inside an input, so a text field keeps its own
      // undo, and off in preview, where the project is read-only.
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
        if (!isInputFocused() && !isPreviewMode) {
          event.preventDefault()
          applyRestoredView(event.key.toLowerCase() === "y" || event.shiftKey ? history.redo() : history.undo())
        }
      }
    }

    // Helper function to check if an input field is focused
    const isInputFocused = () => {
      const activeElement = document.activeElement
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement as HTMLElement)?.isContentEditable
      )
    }

    // A dialog or a menu answers its own keys; the canvas behind it does not.
    const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedObjectIds, clipboard, handleCopy, handlePaste, handleSelectAll, isPreviewMode, applyRestoredView, history.undo, history.redo, projectOpen, handleSave, handleSaveAs, groupSelection, ungroupSelection, leaveEditedGroup, activeTool, currentScreen.objects])

  // A button in the device's frame: the screen's panel, at that button's row
  // - so whatever was selected lets go.
  const handleHardwareButtonClick = useCallback((button: HardwareButton) => {
    setSelectedObjectIds([])
    setChosenCell(null)
    setFocusedHardwareButton({ id: button.id, key: Date.now() })
  }, [])

  const handleSaveScreenButtonAction = useCallback(
    (buttonId: string, action: HardwareButtonAction | null) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? {
                ...screen,
                buttonActions: action
                  ? { ...screen.buttonActions, [buttonId]: action }
                  : (() => {
                      const newButtonActions = { ...screen.buttonActions }
                      delete newButtonActions[buttonId]
                      return newButtonActions
                    })(),
              }
            : screen,
        ),
      }))
    },
    [currentScreenId],
  )


  if (openingInitial) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center text-sm text-muted-foreground">
        Opening &quot;{initialName}&quot;...
      </div>
    )
  }

  // Every project must be tied to an available device. Until one is loaded
  // (settings.deviceId unset - on first load, with no project in the
  // address), block the editor entirely behind the start page.
  if (!project.settings.deviceId) {
    return (
      <>
        <StartupDeviceGate
          onNewProject={() => setNewProjectOpen(true)}
          onUploadProject={uploadProject}
          onRecoverProject={processUploadedProjectFile}
          error={deviceGateError}
          projects={
            <ProjectList
              openName={null}
              openUnsaved={false}
              openDraftKey={null}
              refreshKey={deviceGateError}
              onOpen={(name) => void openSavedProject(name)}
              onOpenDraft={(key) => void openUntitledDraft(key)}
              onRename={renameSavedProject}
              onDelete={deleteSavedProject}
            />
          }
        />
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onCreate={handleCreateProjectWithDevice} />
      </>
    )
  }

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-card shadow-sm flex items-center px-4">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold text-foreground pr-3">Schaltli</h1>
          {/* The name the project is saved under, with a dot while it has
              unsaved changes (docs/2026-09-23-explicit-save.md). */}
          <span
            data-testid="project-title"
            title={save.unsaved ? "Unsaved changes" : "Saved"}
            className="text-sm text-muted-foreground pr-3 max-w-64 truncate"
          >
            {save.unsaved && <span aria-label="Unsaved changes">• </span>}
            {save.displayName}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 font-normal data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
              >
                File
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => void newProject()} className="flex items-center gap-2">
                <FilePlus2 className="w-4 h-4" />
                New Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleSave()} className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                Save
                <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSaveAs} className="flex items-center gap-2">
                <SaveAll className="w-4 h-4" />
                Save As...
                <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <ExportDialog project={project}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4" />
                  Export Project
                </DropdownMenuItem>
              </ExportDialog>
              {/* Live device deploy - env-gated off on the public demo
                  instance: a public, unauthenticated deploy button could
                  only ever target this app's own operator's devices
                  (devices announce themselves only on the broker this
                  instance's own backend is wired to), which is neither
                  useful to a visitor nor free of real wear (a full
                  e-paper refresh) on real hardware.

                  Android was excluded here until 2026-09-21 - "no
                  self-update firmware path exists there yet" - which stopped
                  being true when the app learned to announce itself and to
                  take a deploy (docs/2026-09-21-android-self-announce.md). */}
              {process.env.NEXT_PUBLIC_DEPLOY_ENABLED === "true" && (
                // Deploy only binds the project to the device it went to -
                // a fact, not an edit, so it is no undo step and survives
                // every undo (carryDeviceBinding, docs/2026-09-23-undo.md).
                <DeployDialog project={project} onProjectUpdate={history.amend} onSaveBeforeDeploy={saveBeforeDeploy}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Deploy to Device
                  </DropdownMenuItem>
                </DeployDialog>
              )}
              {/* Asks about unsaved changes first. The file picker still
                  opens: the click on the question's button is a fresh user
                  gesture, which is what a picker needs. */}
              <DropdownMenuItem
                onClick={async () => {
                  if (await confirmLeave()) void uploadProject()
                }}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadProject} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <VersionHistoryDialog projectName={save.savedName} onRestoreVersion={restoreVersion}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Version History
                </DropdownMenuItem>
              </VersionHistoryDialog>
            </DropdownMenuContent>
          </DropdownMenu>
          <SaveProjectDialog
            open={saveDialog !== null}
            onOpenChange={(open) => {
              if (open) return
              setSaveDialog(null)
              finishSaveDialog(null)
            }}
            title={saveDialog === "saveAs" ? "Save Project As" : "Save Project"}
            suggestedName={save.savedName ?? project.name}
            onSave={async (target) => {
              const saved =
                target.kind === "new" ? await save.saveAsNew(target.name) : await save.saveInto(target.name)
              finishSaveDialog(saved)
            }}
          />
          <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onCreate={handleCreateProjectWithDevice} />
          <LeaveProjectDialog
            open={leavePromptOpen}
            projectName={save.displayName}
            onChoice={(choice) => {
              leaveChoiceRef.current?.(choice)
              leaveChoiceRef.current = null
            }}
          />

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-3 font-normal",
              showToolsRibbon && "bg-accent text-accent-foreground",
            )}
            onClick={() => setShowToolsRibbon((prev) => !prev)}
            aria-pressed={showToolsRibbon}
          >
            Tools
          </Button>

          <ProjectSettingsDialog
            project={project}
            currentScreenId={currentScreenId}
            onProjectUpdate={setProject}
            projectSettingsTab={projectSettingsTab}
            showProjectSettings={showProjectSettings}
            setShowProjectSettings={setShowProjectSettings}
            setShowMqttDiscovery={setShowMqttDiscovery}
            onDeviceResolved={() => setDeviceStaleWarning(null)}
            onOpenScreenIconSelector={handleScreenIconSelect}
          />

          {/* Undo and redo sit up here rather than in the tools ribbon,
              which can be hidden - these should always be at hand. Off in
              preview, like the keys (docs/2026-09-23-undo.md). */}
          <TooltipProvider>
            <div className="flex items-center ml-2 pl-2 border-l border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Undo"
                    disabled={!history.canUndo || isPreviewMode}
                    onClick={handleUndo}
                  >
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo ({shortcutPrefix}Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Redo"
                    disabled={!history.canRedo || isPreviewMode}
                    onClick={handleRedo}
                  >
                    <Redo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo ({shortcutPrefix}Y)</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        <Button variant="ghost" size="sm" className="h-8 px-3 ml-auto gap-1.5 font-normal" asChild>
          <a href={HANDBOOK_URL} target="_blank" rel="noreferrer" data-testid="help-link">
            <CircleHelp className="w-4 h-4" />
            Help
          </a>
        </Button>

        <Button
          variant={isPreviewMode ? "default" : "outline"}
          size="sm"
          className="h-8 px-3 gap-1.5"
          onClick={isPreviewMode ? exitPreviewMode : enterPreviewMode}
        >
          {isPreviewMode ? (
            <>
              <X className="w-4 h-4" />
              Exit Preview
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Preview
            </>
          )}
        </Button>
      </div>

      <div className="mt-12 mb-8 flex-1 flex flex-col min-h-0">
        {deviceStaleWarning && (
          <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-400">{deviceStaleWarning}</p>
          </div>
        )}

        {showToolsRibbon && !isPreviewMode && (
          <div className="h-24 shrink-0 border-b border-border bg-card shadow-sm flex items-center px-2 overflow-x-auto">
            <Toolbar
              orientation="horizontal"
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onCatalogEntrySelect={selectCatalogEntry}
              tableShape={tableShape}
              onTableShapeSelect={selectTableShape}
              onRowTemplateSelect={selectRowTemplate}
              supportsSoftwareButtons={project.settings.supportsSoftwareButtons || false}
              supportedObjectTypes={project.settings.supportedObjectTypes}
              navigatorPlaceable={!!currentScreen?.isMaster && !currentScreen.objects.some((o) => o.type === "navigator")}
            />
            {tableContext && (
              <TableGroup
                path={tableContext.path}
                cell={tableContext.cell}
                enabled={tableCommandsEnabled}
                onSelectLevel={selectTableLevel}
                onCommand={runTableCommand}
              />
            )}
          </div>
        )}

      <div className="flex-1 flex min-h-0">
        {!isPreviewMode && (
          <ProjectsPanel
            openName={save.savedName}
            openUnsaved={save.unsaved}
            openDraftKey={save.savedName === null ? untitledDraftKey : null}
            refreshKey={save.savedVersionId}
            onOpen={(name) => void openSavedProject(name)}
            onOpenDraft={(key) => void openUntitledDraft(key)}
            onRename={renameSavedProject}
            onDelete={deleteSavedProject}
            onNewProject={() => void newProject()}
          />
        )}
        <ScreensPanel
          project={project}
          variant={themeVariant}
          currentScreenId={isPreviewMode ? (previewScreenId ?? currentScreenId) : currentScreenId}
          onScreenChange={isPreviewMode ? setPreviewScreenId : setCurrentScreenId}
          onProjectUpdate={setProject}
          onOpenProjectSettings={handleOpenProjectSettings}
          previewMode={isPreviewMode}
          onAddAsset={addAsset}
          onIncrementNextId={() => setProject((prev) => ({ ...prev, nextId: prev.nextId + 1 }))}
        />

        <div className="flex-1 relative min-w-0 flex items-center justify-center overflow-auto">
          <Canvas
            projectScreens={project.screens}
            screen={displayedScreen}
            popupUnderlay={popupUnderlay}
            onClosePopup={() => setPreviewPopupId(null)}
            masterObjects={masterObjects}
            masterScreen={displayedScreenMaster}
            selectedObjectIds={selectedObjectIds}
            onSelectObject={onSelectObject}
            onSelectObjects={onSelectObjects}
            onUpdateObject={updateObject}
            onDeleteObject={deleteObject}
            snapGuides={currentSnapGuides}
            zoom={canvasZoom}
            offset={canvasOffset}
            onZoomChange={setCanvasZoom}
            onOffsetChange={setCanvasOffset}
            activeTool={activeTool}
            tableShape={tableShape}
            onAddObject={addObject}
            onMoveObject={moveObject}
            onMoveToTable={moveToTable}
            onSnapDrop={snapDrop}
            onSnapMoveOut={snapMoveOut}
            rowTemplate={rowTemplate}
            onInsertRow={insertRow}
            onSetTableProperties={setTableProperties}
            onSelectTableColumn={selectTableColumn}
            chosenTableColumn={tableColumnChoice}
            chosenCell={chosenCell}
            onSelectCell={setChosenCell}
            tableCommandsEnabled={tableContext ? tableCommandsEnabled : null}
            onTableCommand={runTableCommand}
            onInsertTableLine={insertTableLine}
            onToolChange={setActiveTool}
            selectedIconAssetId={project.settings.selectedIconAssetId}
            onIconToolClick={handleCanvasIconClick}
            projectAssets={project.assets}
            topics={isPreviewMode ? previewTopics : project.topics}
            combinedTopics={project.combinedTopics}
            fonts={project.fonts} // Added fonts prop to Canvas
            textScale={screenTextScale(project, currentScreen)}
            hardwareButtons={project.hardwareButtons} // Added hardware buttons prop
            onHardwareButtonClick={handleHardwareButtonClick} // Added hardware button click handler
            onManageTopics={handleManageTopics}
            onMqttDiscovery={handleMqttDiscovery}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onSelectAll={handleSelectAll}
            hasClipboard={clipboard.length > 0}
            screenWidth={project.screenWidth}
            screenHeight={project.screenHeight}
            projectName={project.name}
            numberSeparators={projectSeparators(project.settings)}
            deviceModel={project.settings.deviceName}
            deviceId={project.settings.boundInstanceId}
            adornment={project.adornment}
            showAdornment={showAdornment}
            adornmentDrawingArea={project.adornmentDrawingArea}
            adornmentRotation={project.settings.rotation ?? 0}
            screenShape={project.settings.screenShape}
            popupCloseRadius={project.settings.popupCloseRadius}
            supportedObjectTypes={project.settings.supportedObjectTypes}
            colorDepth={project.settings.colorDepth}
            theme={themeFor(displayedScreen, project.screens)}
            variant={themeVariant}
            editingContainerId={editingContainerId}
            onSetEditingContainer={setEditingContainerId}
            onAddPanel={addPanelToTabControl}
            onGroup={groupSelection}
            onUngroup={ungroupSelection}
            canGroup={canGroupSelection}
            canUngroup={canUngroupSelection}
            previewMode={isPreviewMode}
            onInsertBaustein={startBaustein}
            onPreviewButtonAction={handlePreviewButtonAction}
            onPreviewPublish={handlePreviewPublish}
            onPreviewAsk={handlePreviewAsk}
            onPreviewSetLevel={handlePreviewSetLevel}
            liveValues={isPreviewMode && previewSource === "live" ? liveValues : null}
            askedValues={isPreviewMode ? shownAskedValues : null}
          />
        </div>

        {/* Drag handle for the right panel - widened to a comfortable 4px
            hit target (the visible border stays 1px) since a 1px-wide
            drag target is nearly unhittable with a mouse. */}
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
          onMouseDown={() => setIsResizingRightPanel(true)}
        />

        <div className="shrink-0 border-l border-border bg-card flex flex-col min-h-0" style={{ width: rightPanelWidth }}>
          {isPreviewMode ? (
            <>
              <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border flex items-center justify-between gap-2">
                <span>MQTT Topic Values</span>
                <div className="flex shrink-0 rounded-md border border-border overflow-hidden" role="group" aria-label="Preview values">
                  {(["live", "simulation"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={previewSource === source}
                      onClick={() => choosePreviewSource(source)}
                      className={cn(
                        "px-2 py-0.5 text-xs",
                        previewSource === source ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      {source === "live" ? "Live" : "Simulation"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TopicValuesPanel
                  topics={project.topics}
                  previewTopicValues={previewTopicValues}
                  onSetTopicValue={handleSetPreviewTopicValue}
                  source={previewSource}
                  liveStatus={liveStatus}
                  liveValues={liveValues}
                  brokerUrl={previewMqtt.config.websocketUrl}
                  brokerError={previewMqtt.error}
                />
              </div>
            </>
          ) : (
            <>
              <div className="shrink-0 basis-64 border-b border-border flex flex-col min-h-0">
                <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                  Objects
                </div>
                <ObjectTreePanel
                  screen={currentScreen}
                  objects={currentScreen.objects}
                  selectedObjectIds={selectedObjectIds}
                  onSelectObject={onSelectObject}
                  onMoveObject={moveObject}
            onMoveToTable={moveToTable}
                  onSetEditingContainer={setEditingContainerId}
                  onToggleLocked={(id, locked) => updateObject(id, { locked: locked || undefined })}
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* The role pickers show each role in the current screen's theme,
                    in the variant the canvas shows (theme-context.tsx). */}
                <ThemeViewContext.Provider
                  value={{
                    theme: themeFor(currentScreen, project.screens),
                    variant: themeVariant,
                  }}
                >
                  <PropertyPanel
                    selectedObject={selectedObject}
                    selectedObjects={selectedObjects}
                    onUpdateObject={updateObject}
                    onDeclareTopics={declareTopics}
                    onUpdateObjects={updateObjects}
                    currentScreen={currentScreen}
                    onUpdateScreenColors={updateScreenColors}
                    onRenameScreen={renameCurrentScreen}
                    onSetScreenMaster={setCurrentScreenMaster}
                    onSetScreenShowMaster={setCurrentScreenShowMaster}
                    onPatchScreen={patchCurrentScreen}
                    screenWidth={project.screenWidth}
                    screenHeight={project.screenHeight}
                    onSetScreenType={setCurrentScreenType}
                    onClearScreenIcon={clearCurrentScreenIcon}
                    onSetScreenTheme={setCurrentScreenTheme}
                    onSetScreenTypography={setCurrentScreenTypography}
                    tableColumn={tableColumn}
                    onSetTableColumns={setTableColumns}
                    onRemoveTableColumn={removeTableColumn}
                    typographies={project.settings.typographies}
                    projectAssets={project.assets}
                    onAddAsset={addAsset}
                    topics={project.topics}
                    combinedTopics={project.combinedTopics ?? []}
                    numberSeparators={projectSeparators(project.settings)}
                    fonts={project.fonts} // Added fonts prop
                    textScale={screenTextScale(project, currentScreen)}
                    colorDepth={project.settings.colorDepth || "24bit"} // Added color depth
                    setProjectSettingsTab={setProjectSettingsTab}
                    setShowProjectSettings={setShowProjectSettings}
                    onOpenIconSelector={handleValueIconPairIconSelect}
                    onOpenIconPropertiesSelector={handleIconPropertiesIconSelect}
                    focusedHardwareButton={focusedHardwareButton}
                    justCreatedId={justCreatedId}
                    onJustCreatedFocused={() => setJustCreatedId(null)}
                    allScreens={project.screens}
                    onSaveScreenButtonAction={handleSaveScreenButtonAction}
                    supportsSoftwareButtons={project.settings.supportsSoftwareButtons || false}
                    deviceActions={project.settings.deviceActions || []}
                    hardwareButtons={project.hardwareButtons ?? []}
                    nextId={project.nextId}
                    onIncrementNextId={incrementNextId}
                    setIconSelectorContext={setIconSelectorContext}
                    setShowIconSelector={setShowIconSelector}
                    onSelectObject={onSelectObject}
                    editingTabContext={editingTabContext}
                    onSetEditingTabContext={(context) => setEditingContainerId(context?.panelId ?? null)}
                    onAddPanel={addPanelToTabControl}
                    onGroup={groupSelection}
                    canGroup={canGroupSelection}
                    onUngroup={ungroupSelection}
                  />
                </ThemeViewContext.Provider>
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 h-8 border-t border-border bg-card flex items-center justify-end px-4">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            {project.screenWidth} × {project.screenHeight}
          </span>
          {/* Which variant of the themes the canvas, the thumbnails and the
              preview show. View state: not saved, not an undo step. A grey or
              1-bit device has one variant, so there is nothing to switch
              (docs/2026-09-24-themes-model.md, criterion 4). */}
          <FooterSwitch
            label="Dark"
            checked={(project.settings.colorDepth || "24bit") === "24bit" && themeVariant === "dark"}
            onChange={(dark) => setThemeVariant(dark ? "dark" : "light")}
            disabled={(project.settings.colorDepth || "24bit") !== "24bit"}
            title={
              (project.settings.colorDepth || "24bit") === "24bit"
                ? "Show the dark variant of the themes"
                : "This device shows one variant only"
            }
          />
          <FooterSwitch
            label="Adornment"
            checked={showAdornment}
            onChange={(checked) => {
              setShowAdornment(checked)
              window.localStorage.setItem("schaltli.showAdornment", String(checked))
            }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-8">{Math.round(canvasZoom * 100)}%</span>
            <div className="w-20">
              <Slider
                value={[getCurrentZoomIndex()]}
                onValueChange={([value]) => handleZoomChange(value)}
                min={0}
                max={zoomLevels.length - 1}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <BausteinDialog
        entry={blockChoice}
        supportedObjectTypes={project.settings.supportedObjectTypes}
        onCancel={() => setBlockChoice(null)}
        onConfirm={armBlock}
      />

      <IconSelectorModal
        isOpen={showIconSelector}
        onClose={() => {
          setShowIconSelector(false)
          setIconClickPosition(null)
          setIconSelectorContext(null)
        }}
        onSelectIcon={handleIconSelect}
        existingAssets={project.assets}
        onAddAsset={addAsset}
        nextId={project.nextId}
        onIncrementNextId={() => setProject((prev) => ({ ...prev, nextId: prev.nextId + 1 }))}
      />

      <MqttDiscoveryDialog
        isOpen={showMqttDiscovery}
        onClose={() => setShowMqttDiscovery(false)}
        onTopicsSelected={handleTopicsSelected}
      />
    </div>
  )
}
