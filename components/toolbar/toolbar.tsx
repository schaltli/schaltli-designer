"use client"

import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SoftwareButtonIcon } from "@/components/icons/software-button-icon"
import { cn } from "@/lib/utils"
import { MousePointer2, Type, Square, Minus, Image as ImageIcon } from "lucide-react"

// MQTT-branded icons (signal glyph + shape) - kept custom since lucide has no
// direct equivalent for "MQTT-connected field" vs. a plain field/box.
const MqttFieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M 9.9068723,0.10407346 H 7.3069114 A 13.375344,12.760007 0 0 1 9.0626824,1.4743019 13.88978,13.250776 0 0 1 10.421309,3.0079566 V 0.59484256 A 0.51443632,0.4907695 0 0 0 9.9068723,0.10407346 m -6.0106739,0 H 0.64701886 A 0.51443632,0.4907695 0 0 0 0.13258249,0.59484256 V 1.0762876 A 9.3730295,8.94182 0 0 1 9.4696008,9.9194636 H 9.9068723 A 0.51443632,0.4907695 0 0 0 10.417708,9.4252586 V 6.0850806 A 11.101536,10.590806 0 0 0 3.8961984,0.10407346 M 0.13258249,2.5746066 V 4.1725528 A 6.1130468,5.831814 0 0 1 6.202931,9.9194636 H 7.9417256 A 7.7937104,7.4351581 0 0 0 0.13258249,2.5746066 m 0,3.096756 v 3.757331 a 0.51443632,0.4907695 0 0 0 0.51443637,0.49077 H 4.6699106 A 4.532184,4.3236793 0 0 0 0.13258249,5.6713626"
      style={{ strokeWidth: 0.502464 }}
    />
    <g fill="none" transform="matrix(0.81960276,0,0,0.78189666,5.7502192,6.6561689)">
      <path d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0" />
      <path d="M 9,3 H 21 V 15 H 16 C 16,10.896 13.105,8 9,8 Z" />
      <path stroke="currentColor" strokeWidth="2" d="M 9,8 V 3 h 12 v 12 h -5" />
      <path stroke="currentColor" strokeWidth="2" d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0 z" />
    </g>
  </svg>
)

const MqttDataFieldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M 9.9068723,0.10407346 H 7.3069114 A 13.375344,12.760007 0 0 1 9.0626824,1.4743019 13.88978,13.250776 0 0 1 10.421309,3.0079566 V 0.59484256 A 0.51443632,0.4907695 0 0 0 9.9068723,0.10407346 m -6.0106739,0 H 0.64701886 A 0.51443632,0.4907695 0 0 0 0.13258249,0.59484256 V 1.0762876 A 9.3730295,8.94182 0 0 1 9.4696008,9.9194636 H 9.9068723 A 0.51443632,0.4907695 0 0 0 10.417708,9.4252586 V 6.0850806 A 11.101536,10.590806 0 0 0 3.8961984,0.10407346 M 0.13258249,2.5746066 V 4.1725528 A 6.1130468,5.831814 0 0 1 6.202931,9.9194636 H 7.9417256 A 7.7937104,7.4351581 0 0 0 0.13258249,2.5746066 m 0,3.096756 v 3.757331 a 0.51443632,0.4907695 0 0 0 0.51443637,0.49077 H 4.6699106 A 4.532184,4.3236793 0 0 0 0.13258249,5.6713626"
      style={{ strokeWidth: 0.502464 }}
    />
    <rect
      fill="none"
      stroke="currentColor"
      strokeWidth="0.948578"
      strokeLinejoin="round"
      width="20.380749"
      height="11.497723"
      x="2.6259356"
      y="11.243801"
      rx="2.3691332"
      ry="1.6319343"
    />
  </svg>
)

const LevelIndicatorIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M 9.9068723,0.10407346 H 7.3069114 A 13.375344,12.760007 0 0 1 9.0626824,1.4743019 13.88978,13.250776 0 0 1 10.421309,3.0079566 V 0.59484256 A 0.51443632,0.4907695 0 0 0 9.9068723,0.10407346 m -6.0106739,0 H 0.64701886 A 0.51443632,0.4907695 0 0 0 0.13258249,0.59484256 V 1.0762876 A 9.3730295,8.94182 0 0 1 9.4696008,9.9194636 H 9.9068723 A 0.51443632,0.4907695 0 0 0 10.417708,9.4252586 V 6.0850806 A 11.101536,10.590806 0 0 0 3.8961984,0.10407346 M 0.13258249,2.5746066 V 4.1725528 A 6.1130468,5.831814 0 0 1 6.202931,9.9194636 H 7.9417256 A 7.7937104,7.4351581 0 0 0 0.13258249,2.5746066 m 0,3.096756 v 3.757331 a 0.51443632,0.4907695 0 0 0 0.51443637,0.49077 H 4.6699106 A 4.532184,4.3236793 0 0 0 0.13258249,5.6713626"
      style={{ strokeWidth: 0.502464 }}
    />
    <rect
      fill="none"
      stroke="currentColor"
      strokeWidth="0.948578"
      strokeLinejoin="round"
      width="20.380749"
      height="11.497723"
      x="2.6259356"
      y="11.243801"
      rx="2.3691332"
      ry="1.6319343"
    />
    <rect
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="0.898033"
      strokeLinejoin="round"
      width="12.122783"
      height="7.6149778"
      x="4.7219868"
      y="13.163074"
      rx="2.1955082"
      ry="0.49714473"
    />
  </svg>
)

type ToolType = "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "SoftwareButton"

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
      icon: Minus,
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

  const toolGroups: { label: string; tools: ToolDef[] }[] = [
    { label: "Select", tools: [selectTool] },
    { label: "MQTT", tools: mqttGroup },
    { label: "Static", tools: staticGroup },
    { label: "Graphics", tools: graphicsGroup },
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
              isHorizontal ? "h-14 w-16 flex-col gap-1 px-1 py-2 font-normal" : "w-12 h-12 p-0",
              isDisabled && "opacity-40 cursor-not-allowed",
            )}
            onClick={() => handleToolClick(tool.type, isDisabled)}
            aria-disabled={isDisabled}
          >
            <Icon className={isHorizontal ? "w-5 h-5 shrink-0" : "w-6 h-6"} />
            {isHorizontal && <span className="text-[10px] leading-none truncate max-w-full">{tool.shortLabel}</span>}
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
