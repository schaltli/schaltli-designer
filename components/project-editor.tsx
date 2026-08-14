"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
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
import {
  findObjectById,
  updateObjectById,
  updateObjectsById,
  deleteObjectById,
  insertObjectIntoParent,
  moveObjectToParent,
  type MoveAnchor,
} from "@/lib/object-tree"
import { cn, generateUuid } from "@/lib/utils"
import { FilePlus2, PackageCheck, Upload, Download, AlertTriangle, Play, X, Rocket, History } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { loadDeviceDescriptionByPath, resolveDeviceForProject, resolveRotatedScreenSize } from "@/lib/device-description"

export interface ScreenObject {
  id: string
  type:
    | "MqttDataField"
    | "MQTTIconField"
    | "label"
    | "icon"
    | "line"
    | "MqttDataLine"
    | "box"
    | "level-indicator"
    | "field"
    | "SoftwareButton"
    | "tab-control"
    | "panel"
    | "Switch"
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, any>
  zIndex: number
  // Only meaningful on "tab-control" (whose children must all be "panel") and
  // "panel" (whose children are arbitrary regular objects) - every other
  // type is always a leaf. Child coordinates are relative to this object's
  // own (x, y) origin, not absolute screen coordinates - this is what makes
  // moving/duplicating a tab-control (or, later, any container) a single
  // coherent operation instead of manually re-translating every descendant.
  // A "panel" has no x/y/width/height of its own beyond the defaults - it
  // always fills its parent tab-control's box exactly, since only one panel
  // is ever shown at a time in that same screen region.
  children?: ScreenObject[]
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
  nextId: number // Added nextId for incremental ID generation
  screenWidth: number
  screenHeight: number
  adornment?: string // SVG data for project adornment
  adornmentDrawingArea?: {
    // Information about the drawing-area element in the adornment SVG
    x: number
    y: number
    width: number
    height: number
    svgViewBox: { x: number; y: number; width: number; height: number }
  }
}

export interface ProjectScreen {
  id: string
  name: string
  objects: ScreenObject[]
  backgroundImageAssetId?: string // Reference to asset ID instead of storing base64 directly
  backgroundColor?: string // Screen background color
  gridColor?: string // Grid color (auto-calculated if not set)
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
}

export interface ProjectAsset {
  id: string
  name: string
  type: "svg" | "icon" | "image"
  data: string
  size?: number
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
}

export interface PropertyPanelProps {
  selectedObject: ScreenObject | null
  selectedObjects: ScreenObject[]
  onUpdateObject: (objectId: string, updates: Partial<ScreenObject>) => void
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenObject>) => void
  currentScreen: ProjectScreen
  onUpdateScreenBackground: (backgroundImageAssetId: string | undefined) => void
  onUpdateScreenColors: (backgroundColor?: string, gridColor?: string) => void
  calculateOptimalGridColor: (backgroundColor: string) => string
  projectAssets: ProjectAsset[]
  onAddOrFindAsset: (file: File, dataUrl: string) => Promise<string>
  onAddAsset: (asset: ProjectAsset) => void
  topics: Topic[]
  fonts: ProjectFont[] // Added fonts prop to PropertyPanelProps
  colorDepth: "1bit" | "4bit" | "24bit" // Added color depth for color picker
  setProjectSettingsTab: (tab: string) => void
  setShowProjectSettings: (show: boolean) => void
  onOpenIconSelector: (pairIndex: number) => void
  onOpenIconPropertiesSelector?: () => void // Added handler for icon properties selector
  // Hardware button props
  showHardwareButtonPanel: boolean
  selectedHardwareButton: HardwareButton | null
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
  // Server-side autosave/version-history key (2026-08-02) - generated once
  // via generateUuid() the moment a new project is created, stable for
  // that project's whole lifetime regardless of which physical device it
  // later gets deployed to. See app/api/projects/[projectId]/*.
  projectId: string
  // Set/updated on every successful "Deploy to Device" (deploy-dialog.tsx)
  // to the target device's own MQTT instanceId - lets a later session
  // recover "what project is currently on device X" without knowing its
  // projectId, via app/api/projects/by-instance/[instanceId]. Undefined
  // until the project has been deployed at least once.
  boundInstanceId?: string
  // See DeviceDescriptionFile.needsPageIconsInSize's own comment - a device
  // opts into per-screen icons being baked into the export (e.g. for an
  // on-device screen-switch navigator), and says at what square pixel size.
  // Undefined = device doesn't want them, export omits page icons entirely.
  needsPageIconsInSize?: number
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
}

export interface JsonSubtopic {
  id: string
  path: string // JSONPath shorthand member/index syntax into the JSON payload, e.g. "temp", "$.temp", "nested.temp", "readings[0].value" - see lib/json-path.ts
  label?: string // defaults to `path` when unset
  type: "numeric" | "text" // the type of the VALUE once extracted
}

export interface HardwareButton {
  id: string
  name: string
  svgElementId: string // Reference to SVG element with ID starting with "button"
  shape: "round" | "rectangular"
  // The action this button triggers everywhere, unless a specific screen
  // overrides it via ProjectScreen.buttonActions (see project-editor.tsx's
  // ProjectScreen interface) - the only place a per-button action is
  // stored. Configured in Project Settings > Hardware Buttons.
  defaultAction?: HardwareButtonAction
  width?: number // Button width in pixels
  height?: number // Button height in pixels
  x?: number // Button X position
  y?: number // Button Y position
}

export interface HardwareButtonAction {
  type: "next-screen" | "previous-screen" | "goto-screen" | "send-mqtt" | "goto-setup-mode"
  targetScreenId?: string // For goto-screen
  mqttTopic?: string // For send-mqtt
  mqttMessage?: string // For send-mqtt
}

// Compact one-line summary of an action - used wherever a default/override
// action needs to be shown at a glance (hardware-button-side-panel.tsx's
// "overridden by" status, project-settings-dialog.tsx's adornment tooltip)
// without duplicating the same switch in both places.
export function describeHardwareButtonAction(action: HardwareButtonAction, screens: ProjectScreen[]): string {
  switch (action.type) {
    case "next-screen":
      return "Next Screen"
    case "previous-screen":
      return "Previous Screen"
    case "goto-screen":
      return `Go to "${screens.find((s) => s.id === action.targetScreenId)?.name ?? action.targetScreenId ?? "?"}"`
    case "send-mqtt":
      return `Send MQTT (${action.mqttTopic ?? ""})`
    case "goto-setup-mode":
      return "Enter Setup Mode"
    default:
      return action.type
  }
}

// Utility functions for color extraction and recoloration
export interface ColorRecoloration {
  originalColor: string
  newColor: string
}

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

function createDefaultProject(): Project {
  return {
    name: "New Project",
    screenWidth: 400,
    screenHeight: 300,
    screens: [
      {
        id: "screen-1",
        name: "Screen 1",
        objects: [],
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
      projectId: generateUuid(),
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

export function ProjectEditor() {
  // Limit zoom to integer multiples (1x, 2x, 3x, 4x, 5x) for pixel-perfect rendering
  // This ensures all coordinate calculations are integers, preventing anti-aliasing blur
  const zoomLevels = [100, 200, 300, 400, 500]

  useEffect(() => {
    // Component mounted
    return () => {
      // Component unmounting
    }
  }, [])

  const [project, setProject] = useState<Project>(createDefaultProject)

  const [currentScreenId, setCurrentScreenId] = useState("screen-1")
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([])
  // Which tab-control's which panel is currently "open" for editing its
  // children in the canvas - set by clicking a tab in that tab-control's
  // tab strip (only visible once the tab-control itself is selected).
  // Transient UI state, not part of the project data: while set, the
  // canvas renders/interacts with this specific panel's children instead
  // of falling back to evaluating the tab-control's condition against the
  // topic's preview value. Cleared whenever selection moves to something
  // outside this tab-control's currently-open panel (see
  // clearEditingTabContextUnlessRelated below) - matches the earlier
  // design: "sobald ich den tab deaktiviere, wird nur der aktivierte tab
  // (bestimmt durch den ersten Testwert) angezeigt".
  const [editingTabContext, setEditingTabContext] = useState<{ tabControlId: string; panelId: string } | null>(null)
  const [canvasZoom, setCanvasZoom] = useState(1) // Start at 100% (1x)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  // Right panel (Objects/Property/Topic-values) width, resizable by
  // dragging its left edge - see the handle rendered just before it below.
  // Default was previously a fixed w-80 (320px); 480 is that same value
  // 50% wider, per request (2026-08-15).
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
  const [activeTool, setActiveTool] = useState<
    | "select"
    | "MqttDataField"
    | "MQTTIconField"
    | "label"
    | "icon"
    | "line"
    | "MqttDataLine"
    | "box"
    | "level-indicator"
    | "background"
    | "SoftwareButton"
    | "tab-control"
    | "Switch"
  >("select")
  const [showIconSelector, setShowIconSelector] = useState(false)
  const [iconClickPosition, setIconClickPosition] = useState<{ x: number; y: number } | null>(null)
  const [iconSelectorContext, setIconSelectorContext] = useState<{
    type: "canvas" | "value-icon-pair" | "icon-properties" | "software-button" | "screen-icon" | "switch-state"
    pairIndex?: number
    screenId?: string
    stateIndex?: number
    // Which of a Switch state's two icon slots this selection targets -
    // only meaningful for type "switch-state". Defaults to "normal" (not
    // required at every call site, since it was added after "switch-state"
    // itself - see the Active Icon addition, 2026-08-14).
    slot?: "normal" | "active"
  } | null>(null)
  const [projectSettingsTab, setProjectSettingsTab] = useState<string>("")
  const [showProjectSettings, setShowProjectSettings] = useState<boolean>(false)
  const [showMqttDiscovery, setShowMqttDiscovery] = useState(false)
  const [showToolsRibbon, setShowToolsRibbon] = useState(true)
  const [deviceGateError, setDeviceGateError] = useState<string | null>(null)
  // Set when a project's referenced device isn't available on this instance
  // but was opened anyway using the data embedded in the project file.
  const [deviceStaleWarning, setDeviceStaleWarning] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const { toast } = useToast()

  // Autosave/version-history recovery (2026-08-02) - server-side rather
  // than IndexedDB/localStorage, see app/api/projects/[projectId]/
  // autosave/route.ts's header comment for why. localStorage only ever
  // stores this one small pointer (never the project itself), so
  // recovery still works even after the tab that made the autosave is
  // long gone, as long as the same server is reachable.
  const LAST_PROJECT_ID_KEY = "screenbee-last-project-id"
  const [restorableAutosave, setRestorableAutosave] = useState<Project | null>(null)
  const [restoreDismissed, setRestoreDismissed] = useState(false)
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Check once, on mount, whether there's a recoverable autosave from a
  // previous session.
  useEffect(() => {
    const lastId = typeof window !== "undefined" ? localStorage.getItem(LAST_PROJECT_ID_KEY) : null
    if (!lastId) return
    fetch(`/api/projects/${lastId}/autosave`)
      .then((res) => (res.ok ? res.json() : null))
      .then((restored) => {
        if (restored) setRestorableAutosave(restored)
      })
      .catch(() => {
        // No autosave, or server unreachable - fall through to the normal gate.
      })
  }, [])

  // Remember which project is active so a future reload can offer to
  // restore it - only once it's a real, gate-passed project (has a
  // deviceId), not the transient default createDefaultProject() state.
  useEffect(() => {
    if (project.settings.deviceId && typeof window !== "undefined") {
      localStorage.setItem(LAST_PROJECT_ID_KEY, project.settings.projectId)
    }
  }, [project.settings.deviceId, project.settings.projectId])

  // Debounced autosave - fires on every project change once past the
  // device gate, coalesced so rapid edits (dragging an object, typing)
  // don't each trigger their own request. Best-effort: a failed autosave
  // shouldn't interrupt editing, the next edit just retries.
  useEffect(() => {
    if (!project.settings.deviceId) return
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current)
    autosaveTimeoutRef.current = setTimeout(() => {
      fetch(`/api/projects/${project.settings.projectId}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      }).catch(() => {})
    }, 3000)
    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current)
    }
  }, [project])
  const [clipboard, setClipboard] = useState<ScreenObject[]>([]) // Added clipboard state for copy/paste functionality
  const [showHardwareButtonPanel, setShowHardwareButtonPanel] = useState(false)
  const [selectedHardwareButton, setSelectedHardwareButton] = useState<HardwareButton | null>(null)

  // Preview mode: buttons become functional (next/previous/goto-screen,
  // send-mqtt) and the right panel switches from editing properties to
  // simulating incoming topic values - see handlePreviewButtonAction and
  // TopicValuesPanel. previewScreenId is a separate navigation cursor from
  // currentScreenId on purpose: pressing a "next screen" button while
  // previewing must not change which screen you're actually editing, the
  // same way the firmware's own currentScreenIndex_ is independent of
  // whatever the designer has open. previewTopicValues is a runtime-only
  // override (never written back into project.topics / never exported) -
  // it exists purely to simulate "a message just arrived on this topic"
  // without needing a real MQTT broker connection.
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [previewScreenId, setPreviewScreenId] = useState<string | null>(null)
  const [previewTopicValues, setPreviewTopicValues] = useState<Record<string, string>>({})

  const enterPreviewMode = useCallback(() => {
    setPreviewScreenId(currentScreenId)
    setPreviewTopicValues({})
    // Clear every editing-only UI state that would otherwise be stranded
    // on screen once the property panel (which normally owns closing them)
    // is swapped out for the Topic Values panel - most importantly the
    // hardware-button config panel, which Canvas's previewMode prop no
    // longer has any way to close since it stops calling
    // onHardwareButtonClick entirely once preview mode is active.
    setShowHardwareButtonPanel(false)
    setSelectedHardwareButton(null)
    setSelectedObjectIds([])
    setEditingTabContext(null)
    setIsPreviewMode(true)
  }, [currentScreenId])

  const exitPreviewMode = useCallback(() => {
    setIsPreviewMode(false)
  }, [])

  // Runs a HardwareButtonAction the same way the firmware's own
  // Application::dispatchButtonAction does - a SoftwareButton click or a
  // hardware-button-overlay click in preview mode both funnel through this
  // (see Canvas's previewMode prop). Deliberately local-only: send-mqtt
  // never opens a real broker connection, it just applies the message to
  // previewTopicValues as if it had just arrived, so preview mode can
  // never affect a real device. A toast surfaces what happened either way,
  // since a send-mqtt to a topic nothing on screen displays would
  // otherwise look like the button did nothing at all.
  const handlePreviewButtonAction = useCallback(
    (action: HardwareButtonAction) => {
      if (action.type === "next-screen" || action.type === "previous-screen") {
        // Master screens aren't part of the normal screen sequence - see
        // ProjectScreen.isMaster.
        const screens = project.screens.filter((s) => !s.isMaster)
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
      } else if (action.type === "send-mqtt") {
        const { mqttTopic, mqttMessage } = action
        if (!mqttTopic) return
        setPreviewTopicValues((prev) => ({ ...prev, [mqttTopic]: mqttMessage ?? "" }))
        toast({ title: "→ Simulated MQTT publish", description: `${mqttTopic} = ${mqttMessage ?? ""}` })
      } else if (action.type === "goto-setup-mode") {
        // Nothing to actually enter in a browser preview - setup mode is a
        // device-side WiFi AP state, not a screen. Just confirms the button
        // is wired correctly.
        toast({ title: "→ Would enter setup mode", description: "Only happens on a real device" })
      }
    },
    [project.screens, previewScreenId, toast],
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
    setEditingTabContext(null)
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

  // The screen actually shown on canvas (see `previewScreen` above) may
  // have a master assigned - resolve its objects here so Canvas can draw
  // them merged in without needing to know about the master mechanism or
  // the full screens array itself. Respects the per-screen "Show master"
  // toggle (default true) and resolves to nothing if the referenced master
  // was deleted (masterScreenId nulled out on delete, but defensive here
  // too).
  const displayedScreen = isPreviewMode ? previewScreen : currentScreen
  const masterObjects = useMemo(() => {
    if (!displayedScreen.masterScreenId || displayedScreen.showMaster === false) return []
    const master = project.screens.find((s) => s.id === displayedScreen.masterScreenId && s.isMaster)
    return master?.objects ?? []
  }, [displayedScreen.masterScreenId, displayedScreen.showMaster, project.screens])

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

  const selectedObjects = useMemo(() => {
    return selectedObjectIds
      .map((id) => findObjectById(currentScreen.objects, id))
      .filter((obj): obj is ScreenObject => obj !== null)
  }, [selectedObjectIds, currentScreen.objects])

  // Clears editingTabContext unless the newly-selected id is either the
  // currently-open panel itself (clicking its tab in the strip selects the
  // panel to show its condition in the property panel, and must not
  // immediately re-close what it just opened) or a descendant of that panel
  // (selecting a child while already editing it). Selecting the tab-control
  // itself deliberately DOES exit editing - see canvas.tsx's handleMouseDown,
  // where clicking empty space inside the container (but not on any child)
  // selects the tab-control precisely so you can move/resize the container
  // instead of continuing to work on the panel's contents. Any other
  // selection - a different object, a different tab-control, nothing at all
  // - exits too.
  const clearEditingTabContextUnlessRelated = useCallback(
    (id: string | null) => {
      setEditingTabContext((prev) => {
        if (!prev) return prev
        if (id === null) return null
        if (id === prev.panelId) return prev
        const tabControl = findObjectById(currentScreen.objects, prev.tabControlId)
        const panel = tabControl?.children?.find((p) => p.id === prev.panelId)
        if (panel && findObjectById(panel.children ?? [], id)) return prev
        return null
      })
    },
    [currentScreen.objects],
  )

  const onSelectObject = useCallback((id: string | null, modifierKey = false) => {
    clearEditingTabContextUnlessRelated(id)

    if (id === null) {
      setSelectedObjectIds([])
      // Close hardware button side panel when clearing selection
      setShowHardwareButtonPanel(false)
      setSelectedHardwareButton(null)
      return
    }

    // Close hardware button side panel when selecting any object
    setShowHardwareButtonPanel(false)
    setSelectedHardwareButton(null)

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
  }, [clearEditingTabContextUnlessRelated])

  const onSelectObjects = useCallback((ids: string[]) => {
    setSelectedObjectIds(ids)
  }, [])

  const updateObject = useCallback(
    (objectId: string, updates: Partial<ScreenObject>) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: updateObjectById(screen.objects, objectId, updates) }
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
            ? { ...screen, objects: updateObjectsById(screen.objects, objectIds, updates) }
            : screen,
        ),
      }))
    },
    [currentScreenId],
  )

  const updateScreenBackground = useCallback(
    (backgroundImageAssetId: string | undefined) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId ? { ...screen, backgroundImageAssetId } : screen,
        ),
      }))
    },
    [currentScreenId],
  )

  // parentId: when set, the new object is appended to that object's
  // .children (e.g. the panel currently open for editing in a tab-control)
  // instead of the screen's own top-level objects. zIndex is still scoped
  // to siblings at whichever level the object actually lands in - a
  // top-level object's zIndex is only ever compared against other
  // top-level objects, a panel-child's only against its own siblings (see
  // lib/object-order.ts's sortChildrenByZIndex on the render side).
  const addObject = useCallback(
    (object: Omit<ScreenObject, "id" | "zIndex">, parentId?: string) => {
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
    },
    [currentScreen.objects, currentScreenId, project.nextId],
  )

  // Adds a new panel to a tab-control and immediately opens it for editing
  // (sets editingTabContext + selects the new panel) - a plain addObject()
  // call can't do the "select what you just created" part here, since it
  // only returns void and the new id (obj-${nextId}) needs to be known
  // synchronously to set editingTabContext in the same interaction, not
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

      setEditingTabContext({ tabControlId, panelId: newPanel.id })
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
  // edited itself) would leave editingTabContext pointing at a now-stale
  // relationship, so clear it defensively; the user can re-open editing via
  // the tab strip if they're still working on that panel.
  const moveObject = useCallback(
    (objectId: string, newParentId: string | null, anchor: MoveAnchor) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: moveObjectToParent(screen.objects, objectId, newParentId, anchor) }
            : screen,
        ),
      }))
      setEditingTabContext(null)
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

        addObject(newIconObject)
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
    [iconClickPosition, iconSelectorContext, selectedObject, addObject, updateObject, setProject],
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

  const calculateOptimalGridColor = useCallback((backgroundColor: string): string => {
    const hex = backgroundColor.replace("#", "")
    const r = Number.parseInt(hex.substr(0, 2), 16)
    const g = Number.parseInt(hex.substr(2, 2), 16)
    const b = Number.parseInt(hex.substr(4, 2), 16)

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

    if (luminance > 0.5) {
      const gridValue = Math.max(0, Math.floor(luminance * 255 - 80))
      const hexValue = gridValue.toString(16).padStart(2, '0')
      return `#${hexValue}${hexValue}${hexValue}`
    } else {
      const gridValue = Math.min(255, Math.floor(luminance * 255 + 120))
      const hexValue = gridValue.toString(16).padStart(2, '0')
      return `#${hexValue}${hexValue}${hexValue}`
    }
  }, [])

  // calculateTextObjectHeight moved to lib/font-utils.ts

  const handleCreateObject = useCallback(
    (x: number, y: number, width: number, height: number) => {

      if (!width || !height) {
        console.warn("[v0] Width or height is zero, skipping object creation.")
        return
      }

      switch (activeTool) {
        case "MqttDataField":
          addObject({
            type: "MqttDataField",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: (() => {
              const f = project.fonts && project.fonts[0]
              const fontSize = f?.size || 16
              return calculateTextObjectHeight(fontSize)
            })(),
            properties: {
              topic: undefined, // Changed from topicId to topic
              fontId: project.fonts && project.fonts.length > 0 ? project.fonts[0].id : undefined,
              fontSize: project.fonts && project.fonts.length > 0 ? project.fonts[0].size : undefined,
              textAlign: "left",
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              textColor: "#000000",
            },
          })
          break
        case "MQTTIconField":
          addObject({
            type: "MQTTIconField",
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
        case "label": {
          const selectedFont = project.fonts && project.fonts.length > 0 ? project.fonts[0] : null
          console.log("=== CREATING NEW LABEL ===")
          console.log("Available fonts:", project.fonts?.map(f => ({ id: f.id, name: f.name })))
          console.log("Selected font:", selectedFont ? { id: selectedFont.id, name: selectedFont.name, size: selectedFont.size } : "NONE")
          
          addObject({
            type: "label",
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
              backgroundColor: "transparent",
              borderColor: "#cccccc",
              textColor: "#000000",
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
              strokeColor: "#000000",
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
              fillColor: "transparent",
              strokeColor: "#000000",
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
        case "level-indicator": {
          // Find the smallest available font
          const smallestFont = project.fonts && project.fonts.length > 0
            ? project.fonts.reduce((smallest, font) => {
                const smallestSize = smallest?.size || Infinity
                const currentSize = font.size || 0
                return currentSize < smallestSize ? font : smallest
              }, project.fonts[0])
            : null
          
          addObject({
            type: "level-indicator",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              topic: undefined, // Changed from topicId to topic
              barDirection: "left-to-right", // "left-to-right" | "bottom-to-top" | "right-to-left" | "top-to-bottom"
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              displayValue: "value", // "value" | "percentage"
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              fillColor: "#4CAF50",
              textColor: "#000000",
              fontSize: smallestFont?.size || 12,
              fontId: smallestFont?.id,
            },
          })
          break
        }
        case "SoftwareButton":
          addObject({
            type: "SoftwareButton",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              text: "Button",
              iconAssetId: null,
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              textColor: "#000000",
              fontId: project.fonts && project.fonts.length > 0 ? project.fonts[0].id : undefined,
              fontWeight: "normal",
              borderWidth: 1,
              cornerRadius: 4,
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

  const newProject = useCallback(() => {
    if (!window.confirm("Start a new project? Unsaved changes will be lost.")) {
      return
    }
    // Reset to a device-less project - the StartupDeviceGate reappears
    // automatically (it shows whenever settings.deviceId is unset) and forces
    // a device to be chosen before the editor becomes usable again.
    const fresh = createDefaultProject()
    setProject(fresh)
    setCurrentScreenId(fresh.screens[0].id)
    setSelectedObjectIds([])
    setDeviceGateError(null)
    setDeviceStaleWarning(null)
  }, [])

  // Used by the StartupDeviceGate's "Create Project" action: builds a fresh
  // project and immediately loads the chosen device onto it.
  const handleCreateProjectWithDevice = useCallback(async (ddfPath: string) => {
    if (!ddfPath) return
    setCreatingProject(true)
    setDeviceGateError(null)
    try {
      const fields = await loadDeviceDescriptionByPath(ddfPath, [])
      const fresh: Project = {
        ...createDefaultProject(),
        screenWidth: fields.screenWidth,
        screenHeight: fields.screenHeight,
        adornment: fields.adornment,
        adornmentDrawingArea: fields.adornmentDrawingArea,
        hardwareButtons: fields.hardwareButtons,
        fonts: fields.fonts,
      }
      fresh.settings = {
        ...fresh.settings,
        colorDepth: fields.colorDepth,
        deviceId: fields.deviceId,
        deviceName: fields.deviceName,
        devicePlatform: fields.devicePlatform,
        supportedObjectTypes: fields.supportedObjectTypes,
        // Was previously never set from the device at all - every touch-
        // capable device (including the existing m5dial) required manually
        // re-checking this in Project Settings before the Button tool
        // appeared, even though the DDF already says the device supports it.
        supportsSoftwareButtons: fields.supportedObjectTypes.includes("SoftwareButton"),
        needsPageIconsInSize: fields.needsPageIconsInSize,
      }
      setProject(fresh)
      setCurrentScreenId(fresh.screens[0].id)
      setSelectedObjectIds([])
      setDeviceStaleWarning(null)
    } catch (error) {
      console.error("[v0] Error creating project with device:", error)
      setDeviceGateError(error instanceof Error ? error.message : "Failed to load the selected device.")
    } finally {
      setCreatingProject(false)
    }
  }, [])

  const downloadProject = useCallback(async () => {
    try {
      const projectData = {
        ...project,
        screens: project.screens.map((screen) => ({
          ...screen,
          objects: screen.objects.map((obj) => {
            // Remove valueIconPairs from MqttDataField objects (only MQTTIconField should have it)
            if (obj.type === "MqttDataField") {
              const { valueIconPairs, ...cleanedProperties } = obj.properties as any
              return {
                ...obj,
                properties: cleanedProperties,
              }
            }
            return obj
          }),
        })),
        // Modify assets to remove data field and add path field
        assets: project.assets.map((asset, index) => {
          // Get proper file extension based on MIME type
          let extension = "bin"
          if (asset.data.startsWith("data:")) {
            const [header] = asset.data.split(",")
            const mimeType = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream"

            if (mimeType.includes("svg")) {
              extension = "svg"
            } else if (mimeType.includes("png")) {
              extension = "png"
            } else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
              extension = "jpg"
            } else if (mimeType.includes("gif")) {
              extension = "gif"
            } else if (mimeType.includes("webp")) {
              extension = "webp"
            } else if (mimeType.includes("bmp")) {
              extension = "bmp"
            } else if (mimeType.includes("tiff")) {
              extension = "tiff"
            }
          }

          // Create a meaningful filename
          let fileName = asset.name
          fileName = fileName.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim()

          if (!fileName || fileName.length < 2) {
            fileName = `${asset.type}_${index + 1}`
          }

          if (!fileName.toLowerCase().endsWith(`.${extension}`)) {
            fileName = `${fileName}.${extension}`
          }

          // Return asset without data field, but with path field
          return {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            size: asset.size,
            path: `assets/${fileName}`, // Added path field pointing to assets folder
          }
        }),
        fonts: (project.fonts || []).map((font) => {
          // BDF font model: {id,name,displayName,path,size,data,internalName,ascent,descent}
          return {
            id: font.id,
            name: font.name,
            displayName: font.displayName,
            path: font.path,
            size: font.size,
            internalName: font.internalName,
            ascent: font.ascent,
            descent: font.descent,
          }
        }),
        hardwareButtons: project.hardwareButtons || [],
        // Include metadata
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
      }

      // Create a zip file using JSZip
      const JSZip = (await import("jszip")).default
      const zip = new JSZip()

      // Add project.json to the root
      zip.file("project.json", JSON.stringify(projectData, null, 2))

      // Create assets folder and add all assets
      const assetsFolder = zip.folder("assets")
      if (assetsFolder) {
        project.assets.forEach((asset, index) => {
          // Extract the actual file data from data URLs
          if (asset.data.startsWith("data:")) {
            const [header, base64Data] = asset.data.split(",")
            const mimeType = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream"

            // Get proper file extension based on MIME type
            let extension = "bin"
            if (mimeType.includes("svg")) {
              extension = "svg"
            } else if (mimeType.includes("png")) {
              extension = "png"
            } else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
              extension = "jpg"
            } else if (mimeType.includes("gif")) {
              extension = "gif"
            } else if (mimeType.includes("webp")) {
              extension = "webp"
            } else if (mimeType.includes("bmp")) {
              extension = "bmp"
            } else if (mimeType.includes("tiff")) {
              extension = "tiff"
            }

            // Create a meaningful filename
            let fileName = asset.name

            // Clean the filename to remove invalid characters
            fileName = fileName.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim()

            // If the name is empty or too generic, use asset type + index
            if (!fileName || fileName.length < 2) {
              fileName = `${asset.type}_${index + 1}`
            }

            // Ensure the filename doesn't already have the extension
            if (!fileName.toLowerCase().endsWith(`.${extension}`)) {
              fileName = `${fileName}.${extension}`
            }

            // Convert base64 to binary and add to zip
            assetsFolder.file(fileName, base64Data, { base64: true })
          } else {
            // Handle non-data URL assets (if any) - save as text files
            const cleanName = asset.name.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim() || `asset_${index + 1}`
            assetsFolder.file(`${cleanName}.txt`, asset.data)
          }
        })
      }

      const fontsFolder = zip.folder("fonts")
      if (fontsFolder && project.fonts) {
        project.fonts.forEach((font) => {
          // BDF fonts: save the BDF data
          if (font.data && font.path) {
            const fileName = font.path.replace("fonts/", "")
            fontsFolder.file(fileName, font.data)
          }
        })
      }

      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: "blob" })

      // Create download link
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_project.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

    } catch (error) {
      console.error("[v0] Error downloading project:", error)
    }
  }, [project])

  const uploadProject = useCallback(async () => {
    try {
      // Create a file input element
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".zip,.json"
      input.style.display = "none"

      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
          let projectData: any
          let loadedAssets: ProjectAsset[] = []
          let loadedFonts: ProjectFont[] = []

          if (file.name.toLowerCase().endsWith(".json")) {
            // Last-resort device recovery (2026-08-02): a bare project.json
            // pulled from a device's own GET /api/project (see the
            // firmware's UnifiedConfigurator::handleProjectDownload) - no
            // assets/fonts folder to draw on, since the device only ever
            // stored the rasterized PBM/BDF form, not the original SVGs.
            // Every object/topic/position still comes back; icon/font
            // *references* stay as bare IDs pointing at nothing until
            // manually re-added - better than losing the whole project.
            projectData = JSON.parse(await file.text())
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
            settings: {
              ...projectData.settings,
              // A project exported before 2026-08-02 has no projectId -
              // give it one now so autosave/version history has something
              // stable to key off of going forward (nothing to recover
              // from its past, since the field never existed then).
              projectId: projectData.settings?.projectId || generateUuid(),
            },
          }

          // Recalculate heights for text objects to ensure proper line height
          restoredProject.screens.forEach(screen => {
            screen.objects.forEach(obj => {
              if (obj.type === "label" || obj.type === "MqttDataField") {
                const fontMeta = loadedFonts.find(f => f.id === obj.properties.fontId)
                const fontSize = fontMeta?.size || obj.properties.fontSize || 16
                obj.height = calculateTextObjectHeight(fontSize)
              }
            })
            
            // Sort objects by drawing order
            screen.objects = sortObjectsByDrawingOrder(screen.objects)
          })

          // Every project must reference a device, and that device must be
          // available on this instance (public/ddf/). Re-resolve it fresh
          // from the local DDF rather than trusting whatever was embedded in
          // the uploaded file, so the project always reflects this
          // instance's current, authoritative device data.
          const deviceId = restoredProject.settings?.deviceId
          if (!deviceId) {
            const msg = "This project has no device configured and cannot be opened."
            setDeviceGateError(msg)
            toast({ title: "No device configured", description: msg, variant: "destructive" })
            return
          }

          const resolution = await resolveDeviceForProject(
            deviceId,
            restoredProject.settings?.deviceName,
            restoredProject.hardwareButtons || [],
          )

          let finalProject: Project = restoredProject

          if (!resolution.ok) {
            // The device isn't available on this instance, but the project
            // file already carries a full copy of its screen/font/adornment
            // data (embedded when it was originally saved) - open with that
            // instead of hard-blocking, so projects stay portable between
            // instances. Surface this clearly rather than silently risking
            // stale/out-of-sync device data.
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
              settings: {
                ...restoredProject.settings,
                colorDepth: fields.colorDepth,
                deviceId: fields.deviceId,
                deviceName: fields.deviceName,
                supportedObjectTypes: fields.supportedObjectTypes,
                rotation: rotated.rotation,
                needsPageIconsInSize: fields.needsPageIconsInSize,
              },
            }
            setDeviceStaleWarning(null)
          }

          // Update the project state
          setProject(finalProject)
          setDeviceGateError(null)

          // Set the first screen as current if available
          if (finalProject.screens.length > 0) {
            setCurrentScreenId(finalProject.screens[0].id)
          }

          // Clear selection
          setSelectedObjectIds([])

        } catch (error) {
          console.error("[v0] Error uploading project:", error)
          alert("Error uploading project: " + (error as Error).message)
        }
      }

      // Trigger file selection
      document.body.appendChild(input)
      input.click()
      document.body.removeChild(input)
    } catch (error) {
      console.error("[v0] Error creating upload dialog:", error)
    }
  }, [])

  const handleCopy = useCallback(() => {
    // selectedObjects already resolves ids recursively (findObjectById) -
    // re-filtering currentScreen.objects here (flat, top-level only, like
    // this used to) would silently find nothing for a selection nested
    // inside a tab-control's panel, leaving the clipboard empty with no
    // indication why (2026-07-26 finding: reported as "Paste" being
    // impossible to choose after copying a control from one tab and
    // switching to another - the copy itself had already failed).
    if (selectedObjects.length > 0) {
      setClipboard(selectedObjects)
    }
  }, [selectedObjects])

  const handleSelectAll = useCallback(() => {
    const allObjectIds = currentScreen.objects.map((obj) => obj.id)
    setSelectedObjectIds(allObjectIds)
  }, [currentScreen.objects])

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return

    // Paste targets whatever panel is currently open for editing (if any),
    // not always the screen's top level - otherwise duplicating a control
    // from one tab-control panel into another (copy in panel 1, switch to
    // panel 2, paste) would silently land the copy outside the
    // tab-control entirely instead of where the user was actually working
    // (2026-07-26 finding).
    const targetParentId = editingTabContext?.panelId ?? null
    const siblings = targetParentId
      ? (findObjectById(currentScreen.objects, targetParentId)?.children ?? [])
      : currentScreen.objects

    setProject((prev) => {
      let currentNextId = prev.nextId
      const newObjectIds: string[] = []
      const pastedObjects: ScreenObject[] = []

      clipboard.forEach((obj) => {
        const newId = `obj-${currentNextId}`
        const newObject: ScreenObject = {
          ...obj,
          id: newId,
          x: obj.x + 20, // Offset 20 pixels right
          y: obj.y + 20, // Offset 20 pixels down
          zIndex: Math.max(...siblings.map((o) => o.zIndex), 0) + pastedObjects.length + 1,
        }
        pastedObjects.push(newObject)
        newObjectIds.push(newId)
        currentNextId++
      })

      // Select the pasted objects
      setSelectedObjectIds(newObjectIds)

      return {
        ...prev,
        nextId: currentNextId, // Update nextId after creating all pasted objects
        screens: prev.screens.map((screen) => {
          if (screen.id !== currentScreenId) return screen
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
  }, [clipboard, currentScreen.objects, currentScreenId, editingTabContext])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for CTRL+C or CMD+C (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        // Only trigger if we have selected objects and not in an input field
        if (selectedObjectIds.length > 0 && !isInputFocused()) {
          event.preventDefault()
          handleCopy()
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

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedObjectIds, clipboard, handleCopy, handlePaste, handleSelectAll])

  const handleHardwareButtonClick = useCallback((button: HardwareButton) => {
    setSelectedHardwareButton(button)
    setShowHardwareButtonPanel(true)
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


  // Offer a recovered autosave before the normal device gate - this is
  // exactly the "project's on the device but I can't get back to it"
  // moment (see project_screenbee_rename-adjacent session discussion,
  // 2026-08-02): a prior session's work, recovered from this server
  // rather than a file the user has to remember to have exported.
  if (restorableAutosave && !restoreDismissed && !project.settings.deviceId) {
    return (
      <div className="fixed inset-0 z-40 bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-border rounded-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Continue where you left off?</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Found an autosaved project{restorableAutosave.name ? ` "${restorableAutosave.name}"` : ""} from a
            previous session.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setRestoreDismissed(true)}>
              Start Fresh Instead
            </Button>
            <Button
              onClick={() => {
                setProject(restorableAutosave)
                setCurrentScreenId(restorableAutosave.screens[0]?.id || "screen-1")
              }}
            >
              Restore Project
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Every project must be tied to an available device. Until one is loaded
  // (settings.deviceId unset - e.g. on first load, or after File > New
  // Project resets the project), block the editor entirely behind the gate.
  if (!project.settings.deviceId) {
    return (
      <StartupDeviceGate
        onCreateProject={handleCreateProjectWithDevice}
        onUploadProject={uploadProject}
        error={deviceGateError}
        creating={creatingProject}
      />
    )
  }

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-card shadow-sm flex items-center px-4">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-semibold text-foreground pr-3">ScreenBee</h1>

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
              <DropdownMenuItem onClick={newProject} className="flex items-center gap-2">
                <FilePlus2 className="w-4 h-4" />
                New Project
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
                  e-paper refresh) on real hardware. Android-only excluded
                  for now - no self-update firmware path exists there yet. */}
              {process.env.NEXT_PUBLIC_DEPLOY_ENABLED === "true" && project.settings.devicePlatform !== "android" && (
                <DeployDialog project={project} onProjectUpdate={setProject}>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Deploy to Device
                  </DropdownMenuItem>
                </DeployDialog>
              )}
              <DropdownMenuItem onClick={uploadProject} className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadProject} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <VersionHistoryDialog project={project} onRestoreVersion={setProject}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Version History
                </DropdownMenuItem>
              </VersionHistoryDialog>
            </DropdownMenuContent>
          </DropdownMenu>

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
        </div>

        <Button
          variant={isPreviewMode ? "default" : "outline"}
          size="sm"
          className="h-8 px-3 ml-auto gap-1.5"
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
              supportsSoftwareButtons={project.settings.supportsSoftwareButtons || false}
              supportedObjectTypes={project.settings.supportedObjectTypes}
            />
          </div>
        )}

      <div className="flex-1 flex min-h-0">
        <ScreensPanel
          project={project}
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
            screen={isPreviewMode ? previewScreen : currentScreen}
            masterObjects={masterObjects}
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
            onAddObject={addObject}
            onToolChange={setActiveTool}
            selectedIconAssetId={project.settings.selectedIconAssetId}
            onIconToolClick={handleCanvasIconClick}
            projectAssets={project.assets}
            topics={isPreviewMode ? previewTopics : project.topics}
            fonts={project.fonts} // Added fonts prop to Canvas
            hardwareButtons={project.hardwareButtons} // Added hardware buttons prop
            onHardwareButtonClick={handleHardwareButtonClick} // Added hardware button click handler
            onManageTopics={handleManageTopics}
            onMqttDiscovery={handleMqttDiscovery}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onSelectAll={handleSelectAll}
            hasClipboard={clipboard.length > 0}
            screenWidth={project.screenWidth}
            screenHeight={project.screenHeight}
            adornment={project.adornment}
            adornmentDrawingArea={project.adornmentDrawingArea}
            adornmentRotation={project.settings.rotation ?? 0}
            supportedObjectTypes={project.settings.supportedObjectTypes}
            colorDepth={project.settings.colorDepth}
            editingTabContext={editingTabContext}
            onSetEditingTabContext={setEditingTabContext}
            onAddPanel={addPanelToTabControl}
            previewMode={isPreviewMode}
            onPreviewButtonAction={handlePreviewButtonAction}
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
              <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                MQTT Topic Values
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TopicValuesPanel
                  topics={project.topics}
                  previewTopicValues={previewTopicValues}
                  onSetTopicValue={handleSetPreviewTopicValue}
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
                  objects={currentScreen.objects}
                  selectedObjectIds={selectedObjectIds}
                  onSelectObject={onSelectObject}
                  onMoveObject={moveObject}
                  onSetEditingTabContext={setEditingTabContext}
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PropertyPanel
                  selectedObject={selectedObject}
                  selectedObjects={selectedObjects}
                  onUpdateObject={updateObject}
                  onUpdateObjects={updateObjects}
                  currentScreen={currentScreen}
                  onUpdateScreenBackground={updateScreenBackground}
                  onUpdateScreenColors={updateScreenColors}
                  calculateOptimalGridColor={calculateOptimalGridColor}
                  projectAssets={project.assets}
                  onAddOrFindAsset={addOrFindAsset}
                  onAddAsset={addAsset}
                  topics={project.topics}
                  fonts={project.fonts} // Added fonts prop
                  colorDepth={project.settings.colorDepth || "24bit"} // Added color depth
                  setProjectSettingsTab={setProjectSettingsTab}
                  setShowProjectSettings={setShowProjectSettings}
                  onOpenIconSelector={handleValueIconPairIconSelect}
                  onOpenIconPropertiesSelector={handleIconPropertiesIconSelect}
                  showHardwareButtonPanel={showHardwareButtonPanel}
                  selectedHardwareButton={selectedHardwareButton}
                  allScreens={project.screens}
                  onSaveScreenButtonAction={handleSaveScreenButtonAction}
                  nextId={project.nextId}
                  onIncrementNextId={incrementNextId}
                  setIconSelectorContext={setIconSelectorContext}
                  setShowIconSelector={setShowIconSelector}
                  onSelectObject={onSelectObject}
                  editingTabContext={editingTabContext}
                  onSetEditingTabContext={setEditingTabContext}
                  onAddPanel={addPanelToTabControl}
                />
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
