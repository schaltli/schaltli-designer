"use client"

import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SoftwareButtonIcon } from "@/components/icons/software-button-icon"
import { cn } from "@/lib/utils"
import { MousePointer2, Type, Square, Image as ImageIcon, LayoutPanelTop } from "lucide-react"

// Lines here support multiple points (properties.points, see render-line.ts),
// not just a single straight segment - a plain dash (lucide's Minus) doesn't
// communicate that, so this draws an actual bent polyline instead.
const PolylineIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 18 L10 8 L15 13 L20 5" />
  </svg>
)

// MQTT-branded icons (signal glyph + shape) - kept custom since lucide has no
// direct equivalent for "MQTT-connected field" vs. a plain field/box. Drawn
// as simple stroke-based geometry (round caps/joins, uniform weight) to match
// lucide's visual language, rather than the earlier hand-traced fill paths,
// which looked jagged/inconsistent once the toolbar icons were sized up.
const MqttSignalGlyph = () => (
  <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
    <path d="M1 3.8a7.2 7.2 0 0 1 9.4 0" />
    <path d="M2.9 6.1a4.4 4.4 0 0 1 5.6 0" />
    <circle cx="5.7" cy="8.3" r="0.9" fill="currentColor" stroke="none" />
  </g>
)

const MqttDataFieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <MqttSignalGlyph />
    <rect x="9" y="12" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
)

// Same picture-frame motif as lucide's Image icon (used by the plain "Icon"
// tool below), scaled into this icon's shape frame so the two tools read as
// the same underlying content, just MQTT-bound vs. static.
const MqttFieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <MqttSignalGlyph />
    <rect x="9" y="12" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="13.6" cy="15" r="1" fill="currentColor" stroke="none" />
    <path d="M23 18 L19 16 L11.3 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Same zigzag motif as the plain "Line" icon (PolylineIcon above), scaled
// into this icon's shape frame - same reasoning as MqttFieldIcon.
const MqttDataLineIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <MqttSignalGlyph />
    <path
      d="M9 21 L14.3 14.1 L18.6 17.5 L23 12"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const LevelIndicatorIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <MqttSignalGlyph />
    <rect x="9" y="12" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="11" y="14.5" width="9" height="4" rx="1" fill="currentColor" />
  </svg>
)

type ToolType =
  | "select"
  | "MqttDataField"
  | "MQTTIconField"
  | "label"
  | "icon"
  | "line"
  | "MqttDataLine"
  | "box"
  | "level-indicator"
  | "SoftwareButton"
  | "tab-control"

interface ToolDef {
  type: ToolType
  icon: ComponentType<{ className?: string }>
  shortLabel: string
  label: string
  description: string
}

interface ToolbarProps {
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  supportsSoftwareButtons?: boolean
  // Object types the loaded device's firmware actually renders (from a Device
  // Description File). Tools outside this list are shown but disabled, since
  // placing them would create objects invisible on the real device.
  // undefined = no device loaded, no restriction.
  supportedObjectTypes?: string[]
  // "vertical" (default) is the classic left-sidebar layout (icon-only tiles);
  // "horizontal" is a ribbon-style row with a label under each icon, grouped
  // like Word's ribbon (a vertical divider + group caption per group).
  orientation?: "vertical" | "horizontal"
}

export function Toolbar({
  activeTool,
  onToolChange,
  supportsSoftwareButtons = false,
  supportedObjectTypes,
  orientation = "vertical",
}: ToolbarProps) {
  const selectTool: ToolDef = {
    type: "select",
    icon: MousePointer2,
    shortLabel: "Select",
    label: "Select",
    description: "Select and move objects",
  }
  const mqttGroup: ToolDef[] = [
    {
      type: "MqttDataField",
      icon: MqttDataFieldIcon,
      shortLabel: "Data Field",
      label: "MQTT Data Field",
      description: "Create a field to display MQTT data values",
    },
    {
      type: "MQTTIconField",
      icon: MqttFieldIcon,
      shortLabel: "Icon Field",
      label: "MQTT Icon Field",
      description: "Create a field to display MQTT data as icons",
    },
    {
      type: "MqttDataLine",
      icon: MqttDataLineIcon,
      shortLabel: "Data Line",
      label: "MQTT Data Line",
      description: "Create a line whose width and arrowheads react to MQTT data",
    },
    {
      type: "level-indicator",
      icon: LevelIndicatorIcon,
      shortLabel: "Level",
      label: "Level Indicator",
      description: "Create a level indicator with calibration points",
    },
  ]
  const staticGroup: ToolDef[] = [
    {
      type: "label",
      icon: Type,
      shortLabel: "Label",
      label: "Label",
      description: "Add text label",
    },
    {
      type: "icon",
      icon: ImageIcon,
      shortLabel: "Icon",
      label: "Icon",
      description: "Click on canvas to select and place icon",
    },
  ]
  const graphicsGroup: ToolDef[] = [
    {
      type: "line",
      icon: PolylineIcon,
      shortLabel: "Line",
      label: "Line",
      description: "Create line",
    },
    {
      type: "box",
      icon: Square,
      shortLabel: "Box",
      label: "Box",
      description: "Create rectangle",
    },
  ]

  const layoutGroup: ToolDef[] = [
    {
      type: "tab-control",
      icon: LayoutPanelTop,
      shortLabel: "Tabs",
      label: "Tab Control",
      description: "Create a region that shows one of several panels depending on an MQTT value",
    },
  ]

  const toolGroups: { label: string; tools: ToolDef[] }[] = [
    { label: "Select", tools: [selectTool] },
    { label: "MQTT", tools: mqttGroup },
    { label: "Static", tools: staticGroup },
    { label: "Graphics", tools: graphicsGroup },
    { label: "Layout", tools: layoutGroup },
  ]

  // Add software button tool only if supported
  if (supportsSoftwareButtons) {
    toolGroups.push({
      label: "Interactive",
      tools: [
        {
          type: "SoftwareButton",
          icon: SoftwareButtonIcon,
          shortLabel: "Button",
          label: "Software Button",
          description: "Create a touchable software button",
        },
      ],
    })
  }

  const handleToolClick = (toolType: ToolType, disabled: boolean) => {
    if (disabled) return
    onToolChange(toolType)
  }

  const isHorizontal = orientation === "horizontal"
  const tooltipSide = isHorizontal ? "bottom" : "right"

  const renderToolButton = (tool: ToolDef) => {
    const Icon = tool.icon
    const isActive = activeTool === tool.type
    // "select" is always available; other tools are disabled if the loaded
    // device's firmware doesn't render that object type.
    const isDisabled =
      tool.type !== "select" && supportedObjectTypes !== undefined && !supportedObjectTypes.includes(tool.type)

    return (
      <Tooltip key={tool.type}>
        <TooltipTrigger asChild>
          <Button
            variant={isActive ? "default" : "ghost"}
            size="sm"
            className={cn(
              isHorizontal ? "h-14 w-20 flex-col gap-0.5 px-1 py-1 font-normal" : "w-14 h-14 p-0",
              isDisabled && "opacity-40 cursor-not-allowed",
            )}
            onClick={() => handleToolClick(tool.type, isDisabled)}
            aria-disabled={isDisabled}
          >
            <Icon className={isHorizontal ? "size-6 shrink-0" : "size-9"} />
            {isHorizontal && (
              <span className="text-[10px] leading-tight text-center whitespace-nowrap">{tool.shortLabel}</span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          <div className="text-sm">
            <div className="font-medium">{tool.label}</div>
            <div className="text-muted-foreground text-xs">
              {isDisabled ? "Not rendered by the loaded device's firmware" : tool.description}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider>
      {isHorizontal ? (
        <div className="flex flex-row items-stretch gap-1 p-2">
          {toolGroups.map((group, index) => (
            <div
              key={group.label}
              className={cn(
                "flex flex-col items-center justify-between px-2",
                index > 0 && "border-l border-border ml-1 pl-3",
              )}
            >
              <div className="flex items-stretch gap-1">{group.tools.map(renderToolButton)}</div>
              <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{group.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {toolGroups.flatMap((group) => group.tools).map(renderToolButton)}
        </div>
      )}
    </TooltipProvider>
  )
}
