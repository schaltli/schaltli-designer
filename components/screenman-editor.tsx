"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Canvas } from "./canvas/canvas"
import { Toolbar } from "./toolbar/toolbar"
import { PropertyPanel } from "./property-panel/property-panel"
import { Slider } from "./ui/slider"
import { Button } from "./ui/button"
import { IconSelectorModal } from "./icon-selector-modal"
import { ScreensDropdown } from "./screens-dropdown"
import { ProjectSettingsDialog } from "./project-settings-dialog"
import { MqttDiscoveryDialog } from "./mqtt-discovery-dialog"
import { HardwareButtonSidePanel } from "./hardware-button-side-panel"
import { DownloadIcon } from "./icons/download-icon"
import { UploadIcon } from "./icons/upload-icon"
import { ExportDialog } from "./export-dialog"
import { calculateTextObjectHeight } from "@/lib/font-utils"
import { insertObjectInOrder, sortObjectsByDrawingOrder } from "@/lib/object-order"

export interface ScreenmanObject {
  id: string
  type: "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "field" | "SoftwareButton"
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, any>
  zIndex: number
}

export interface SnapGuide {
  id: string
  type: "vertical" | "horizontal"
  position: number
  visible: boolean
}

export interface ScreenmanProject {
  name: string
  screens: ScreenmanScreen[]
  assets: ScreenmanAsset[]
  fonts: ScreenmanFont[] // Added fonts to the project interface
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

export interface ScreenmanScreen {
  id: string
  name: string
  objects: ScreenmanObject[]
  backgroundImageAssetId?: string // Reference to asset ID instead of storing base64 directly
  backgroundColor?: string // Screen background color
  gridColor?: string // Grid color (auto-calculated if not set)
  buttonActions?: Record<string, HardwareButtonAction> // Screen-specific button actions (buttonId -> action)
}

export interface ScreenmanAsset {
  id: string
  name: string
  type: "svg" | "icon" | "image"
  data: string
  size?: number
}

export interface ScreenmanFont {
  id: string
  name: string
  displayName: string
  path: string // Path within the project, e.g., "fonts/myfont.bdf"
  size: number // Font size in pixels
  data?: string // Font data (e.g., BDF content) - only loaded when project is active
  internalName?: string // Internal font name from fontmap.json (e.g., "u8g2_font_helvR08_tf")
  ascent?: number // Font ascent in pixels
  descent?: number // Font descent in pixels
}

export interface PropertyPanelProps {
  selectedObject: ScreenmanObject | null
  selectedObjects: ScreenmanObject[]
  onUpdateObject: (objectId: string, updates: Partial<ScreenmanObject>) => void
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenmanObject>) => void
  currentScreen: ScreenmanScreen
  onUpdateScreenBackground: (backgroundImageAssetId: string | undefined) => void
  onUpdateScreenColors: (backgroundColor?: string, gridColor?: string) => void
  calculateOptimalGridColor: (backgroundColor: string) => string
  projectAssets: ScreenmanAsset[]
  onAddOrFindAsset: (file: File, dataUrl: string) => Promise<string>
  onAddAsset: (asset: ScreenmanAsset) => void
  topics: Topic[]
  fonts: ScreenmanFont[] // Added fonts prop to PropertyPanelProps
  colorDepth: "1bit" | "4bit" | "24bit" // Added color depth for color picker
  setProjectSettingsTab: (tab: string) => void
  setShowProjectSettings: (show: boolean) => void
  onOpenIconSelector: (pairIndex: number) => void
  onOpenIconPropertiesSelector?: () => void // Added handler for icon properties selector
  // Hardware button props
  showHardwareButtonPanel: boolean
  selectedHardwareButton: HardwareButton | null
  allScreens: ScreenmanScreen[]
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
}

export interface Topic {
  id: string // Unique identifier for the topic
  topic: string // Topic name/path
  type: "numeric" | "text"
  examples: string[]
}

export interface HardwareButton {
  id: string
  name: string
  svgElementId: string // Reference to SVG element with ID starting with "button"
  shape: "round" | "rectangular"
  defaultAction?: HardwareButtonAction // Default action for all screens
  action?: HardwareButtonAction // Current action for this button
  width?: number // Button width in pixels
  height?: number // Button height in pixels
  x?: number // Button X position
  y?: number // Button Y position
}

export interface HardwareButtonAction {
  type: "next-screen" | "previous-screen" | "goto-screen" | "send-mqtt"
  targetScreenId?: string // For goto-screen
  mqttTopic?: string // For send-mqtt
  mqttMessage?: string // For send-mqtt
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

export function ScreenmanEditor() {
  // Limit zoom to integer multiples (1x, 2x, 3x, 4x, 5x) for pixel-perfect rendering
  // This ensures all coordinate calculations are integers, preventing anti-aliasing blur
  const zoomLevels = [100, 200, 300, 400, 500]

  useEffect(() => {
    // Component mounted
    return () => {
      // Component unmounting
    }
  }, [])

  const [project, setProject] = useState<ScreenmanProject>({
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
  })

  const [currentScreenId, setCurrentScreenId] = useState("screen-1")
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([])
  const [canvasZoom, setCanvasZoom] = useState(1) // Start at 100% (1x)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [activeTool, setActiveTool] = useState<
    "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "background" | "SoftwareButton"
  >("select")
  const [showIconSelector, setShowIconSelector] = useState(false)
  const [iconClickPosition, setIconClickPosition] = useState<{ x: number; y: number } | null>(null)
  const [iconSelectorContext, setIconSelectorContext] = useState<{
    type: "canvas" | "value-icon-pair" | "icon-properties" | "software-button"
    pairIndex?: number
  } | null>(null)
  const [projectSettingsTab, setProjectSettingsTab] = useState<string>("")
  const [showProjectSettings, setShowProjectSettings] = useState<boolean>(false)
  const [showMqttDiscovery, setShowMqttDiscovery] = useState(false)
  const [clipboard, setClipboard] = useState<ScreenmanObject[]>([]) // Added clipboard state for copy/paste functionality
  const [showHardwareButtonPanel, setShowHardwareButtonPanel] = useState(false)
  const [selectedHardwareButton, setSelectedHardwareButton] = useState<HardwareButton | null>(null)

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

  const selectedObject = useMemo(() => {
    if (!selectedObjectIds.length) return null
    const found = currentScreen.objects.find((obj) => obj.id === selectedObjectIds[0]) || null
    return found
  }, [selectedObjectIds, currentScreen.objects])

  const selectedObjects = useMemo(() => {
    return currentScreen.objects.filter((obj) => selectedObjectIds.includes(obj.id))
  }, [selectedObjectIds, currentScreen.objects])

  const onSelectObject = useCallback((id: string | null, modifierKey = false) => {
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
  }, [])

  const onSelectObjects = useCallback((ids: string[]) => {
    setSelectedObjectIds(ids)
  }, [])

  const updateObject = useCallback(
    (objectId: string, updates: Partial<ScreenmanObject>) => {
      setProject((prev) => {
        const updatedProject = {
          ...prev,
          screens: prev.screens.map((screen) =>
            screen.id === currentScreenId
              ? {
                  ...screen,
                  objects: screen.objects.map((obj) => {
                    if (obj.id === objectId) {
                      return { ...obj, ...updates }
                    }
                    return obj
                  }),
                }
              : screen,
          ),
        }
        return updatedProject
      })
    },
    [currentScreenId],
  )

  const updateObjects = useCallback(
    (objectIds: string[], updates: Partial<ScreenmanObject>) => {
      setProject((prev) => {
        const updatedProject = {
          ...prev,
          screens: prev.screens.map((screen) =>
            screen.id === currentScreenId
              ? {
                  ...screen,
                  objects: screen.objects.map((obj) => {
                    if (objectIds.includes(obj.id)) {
                      return { ...obj, ...updates }
                    }
                    return obj
                  }),
                }
              : screen,
          ),
        }
        return updatedProject
      })
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

  const addObject = useCallback(
    (object: Omit<ScreenmanObject, "id" | "zIndex">) => {

      const newObject: ScreenmanObject = {
        ...object,
        id: `obj-${project.nextId}`,
        zIndex: Math.max(...currentScreen.objects.map((o) => o.zIndex), 0) + 1,
      }


      setProject((prev) => {
        const updatedProject = {
          ...prev,
          nextId: prev.nextId + 1, // Increment nextId
          screens: prev.screens.map((screen) =>
            screen.id === currentScreenId 
              ? { ...screen, objects: insertObjectInOrder(screen.objects, newObject) }
              : screen,
          ),
        }
        return updatedProject
      })

      setSelectedObjectIds([newObject.id])

      setTimeout(() => {
      }, 100)
    },
    [currentScreen.objects, currentScreenId, selectedObjectIds, project.nextId],
  )

  const deleteObject = useCallback(
    (objectId: string) => {
      setProject((prev) => ({
        ...prev,
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId
            ? { ...screen, objects: screen.objects.filter((obj) => obj.id !== objectId) }
            : screen,
        ),
      }))

      setSelectedObjectIds((prev) => prev.filter((id) => id !== objectId))
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
    (asset: ScreenmanAsset) => {
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

  const handleIconSelect = useCallback(
    (assetId: string, iconName: string) => {

      if (iconSelectorContext?.type === "canvas" && iconClickPosition) {
        const newIconObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
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
      }

      setIconSelectorContext(null)
      setShowIconSelector(false)
    },
    [iconClickPosition, iconSelectorContext, selectedObject, addObject, updateObject],
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

        const newAsset: ScreenmanAsset = {
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
        const newTopic = {
          id: `topic_${currentNextId}`,
          topic: topic.topic,
          type: topic.type,
          examples: topic.examples,
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
      input.accept = ".zip"
      input.style.display = "none"

      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
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
          const projectData = JSON.parse(projectJsonContent)

          // Extract assets from the assets folder
          const assetsFolder = zipContent.folder("assets")
          const loadedAssets: ScreenmanAsset[] = []

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
                  const asset: ScreenmanAsset = {
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
          const loadedFonts: ScreenmanFont[] = []

          if (fontsFolder && projectData.fonts) {

            for (const fontData of projectData.fonts) {
              if (fontData.path && fontData.path.startsWith("fonts/")) {
                const fileName = fontData.path.replace("fonts/", "")
                const zipEntry = fontsFolder.file(fileName)

                if (zipEntry) {
                  // Read the BDF file content as text
                  const bdfContent = await zipEntry.async("text")

                  // Create the font with the BDF model
                  const font: ScreenmanFont = {
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

          // Restore the project data with loaded assets and fonts
          const restoredProject: ScreenmanProject = {
            ...projectData,
            assets: loadedAssets,
            fonts: loadedFonts,
            hardwareButtons: projectData.hardwareButtons || [], // Ensure hardware buttons are preserved
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

          // Update the project state
          setProject(restoredProject)

          // Set the first screen as current if available
          if (restoredProject.screens.length > 0) {
            setCurrentScreenId(restoredProject.screens[0].id)
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
    const objectsToCopy = currentScreen.objects.filter((obj) => selectedObjectIds.includes(obj.id))
    if (objectsToCopy.length > 0) {
      setClipboard(objectsToCopy)
    }
  }, [currentScreen.objects, selectedObjectIds])

  const handleSelectAll = useCallback(() => {
    const allObjectIds = currentScreen.objects.map((obj) => obj.id)
    setSelectedObjectIds(allObjectIds)
  }, [currentScreen.objects])

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return

    setProject((prev) => {
      let currentNextId = prev.nextId
      const newObjectIds: string[] = []
      const pastedObjects: ScreenmanObject[] = []

      clipboard.forEach((obj) => {
        const newId = `obj-${currentNextId}`
        const newObject: ScreenmanObject = {
          ...obj,
          id: newId,
          x: obj.x + 20, // Offset 20 pixels right
          y: obj.y + 20, // Offset 20 pixels down
          zIndex: Math.max(...currentScreen.objects.map((o) => o.zIndex), 0) + pastedObjects.length + 1,
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
        screens: prev.screens.map((screen) =>
          screen.id === currentScreenId 
            ? { ...screen, objects: sortObjectsByDrawingOrder([...screen.objects, ...pastedObjects]) }
            : screen,
        ),
      }
    })
  }, [clipboard, currentScreen.objects, currentScreenId])

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

  
  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground">Screenman</h1>
          <div className="flex items-center gap-2">
            <ProjectSettingsDialog
              project={project}
              currentScreenId={currentScreenId}
              onProjectUpdate={setProject}
              projectSettingsTab={projectSettingsTab}
              showProjectSettings={showProjectSettings}
              setShowProjectSettings={setShowProjectSettings}
              showMqttDiscovery={showMqttDiscovery}
              setShowMqttDiscovery={setShowMqttDiscovery}
              onTopicsSelected={handleTopicsSelected}
            />
          </div>
          <span className="text-sm text-muted-foreground">{project.name}</span>
          <ScreensDropdown
            project={project}
            currentScreenId={currentScreenId}
            onScreenChange={setCurrentScreenId}
            onProjectUpdate={setProject}
            onOpenProjectSettings={handleOpenProjectSettings}
          />
        </div>

        <div className="flex items-center gap-2">
          <ExportDialog project={project}>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 bg-transparent"
            >
              <svg
                className="w-4 h-4"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14,2 14,8 20,8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
              Export Project
            </Button>
          </ExportDialog>
          <Button
            variant="outline"
            size="sm"
            onClick={uploadProject}
            className="flex items-center gap-2 bg-transparent"
          >
            <UploadIcon className="w-4 h-4" />
            Upload Project
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadProject}
            className="flex items-center gap-2 bg-transparent"
          >
            <DownloadIcon className="w-4 h-4" />
            Download Project
          </Button>
        </div>
      </div>

      <div className="flex-1 flex mt-12 mb-8">
        <div className="w-16 border-r border-border bg-card">
          <Toolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            supportsSoftwareButtons={project.settings.supportsSoftwareButtons || false}
            supportedObjectTypes={project.settings.supportedObjectTypes}
          />
        </div>

        <div className="flex-1 relative min-w-0 flex items-center justify-center overflow-auto">
          <Canvas
            screen={currentScreen}
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
            topics={project.topics}
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
            supportedObjectTypes={project.settings.supportedObjectTypes}
          />
        </div>

        <div className="w-80 border-l border-border bg-card">
          <div className="flex-1 border-b border-border">
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
            />
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

      {showHardwareButtonPanel && selectedHardwareButton && (
        <HardwareButtonSidePanel
          button={selectedHardwareButton}
          currentScreen={currentScreen}
          allScreens={project.screens}
          onClose={() => {
            setShowHardwareButtonPanel(false)
            setSelectedHardwareButton(null)
          }}
          onSave={handleSaveScreenButtonAction}
        />
      )}
    </div>
  )
}
