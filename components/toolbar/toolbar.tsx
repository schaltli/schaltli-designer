"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LevelIndicatorIcon } from "../icons/level-indicator-icon"

const MousePointer = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="m13 13 6 6" />
  </svg>
)

const Type = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="4,7 4,4 20,4 20,7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
)

const Square = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
)

const Minus = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
  </svg>
)

const ImageIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

const NumericFieldIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect
      style={{ fill: "none", strokeWidth: 1.62814 }}
      width="22.137486"
      height="17.871861"
      x="0.86094511"
      y="3.7203202"
    />
    <g transform="matrix(0.03281595,0,0,0.03281595,0.09278901,11.855946)" style={{ fill: "currentColor" }}>
      <g style={{ fill: "currentColor" }}>
        <path
          d="m 7.1,180.6 v 117.1 c 0,8.4 6.8,15.3 15.3,15.3 H 142 C 141,239.8 80.9,180.7 7.1,180.6 Z"
          style={{ fill: "currentColor" }}
        />
        <path
          d="m 7.1,84.1 v 49.8 c 99,0.9 179.4,80.7 180.4,179.1 h 51.7 C 238.2,186.6 134.5,84.2 7.1,84.1 Z"
          style={{ fill: "currentColor" }}
        />
        <path
          d="M 312.9,297.6 V 193.5 C 278.1,107.2 207.3,38.9 119,7.1 H 22.4 C 14,7.1 7.1,13.9 7.1,22.4 v 15 c 152.6,0.9 276.6,124 277.6,275.6 h 13 c 8.4,-0.1 15.2,-6.9 15.2,-15.4 z"
          style={{ fill: "currentColor" }}
        />
        <path
          d="m 272.6,49.8 c 14.5,14.4 28.6,31.7 40.4,47.8 V 22.4 C 313,14 306.2,7.1 297.7,7.1 h -77.3 c 18,12.6 36.2,26.8 52.2,42.7 z"
          style={{ fill: "currentColor" }}
        />
      </g>
    </g>
    <path
      style={{ fontSize: "18px", fontFamily: "Bahnschrift", fill: "currentColor", strokeWidth: 1.5 }}
      d="M 19.825195,6.2519531 V 19.03125 H 18.032227 V 8.203125 L 16.212891,9.3193359 V 7.4648437 l 1.819336,-1.2128906 z"
      aria-label="1"
    />
  </svg>
)

const MqttIconFieldIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#22c55e"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect
      style={{ fill: "none", strokeWidth: 1.62814 }}
      width="22.137486"
      height="17.871861"
      x="0.86094511"
      y="3.7203202"
    />
    <g transform="matrix(0.03281595,0,0,0.03281595,0.09278901,11.855946)" style={{ fill: "#22c55e" }}>
      <g style={{ fill: "#22c55e" }}>
        <path
          d="m 7.1,180.6 v 117.1 c 0,8.4 6.8,15.3 15.3,15.3 H 142 C 141,239.8 80.9,180.7 7.1,180.6 Z"
          style={{ fill: "#22c55e" }}
        />
        <path
          d="m 7.1,84.1 v 49.8 c 99,0.9 179.4,80.7 180.4,179.1 h 51.7 C 238.2,186.6 134.5,84.2 7.1,84.1 Z"
          style={{ fill: "#22c55e" }}
        />
        <path
          d="M 312.9,297.6 V 193.5 C 278.1,107.2 207.3,38.9 119,7.1 H 22.4 C 14,7.1 7.1,13.9 7.1,22.4 v 15 c 152.6,0.9 276.6,124 277.6,275.6 h 13 c 8.4,-0.1 15.2,-6.9 15.2,-15.4 z"
          style={{ fill: "#22c55e" }}
        />
        <path
          d="m 272.6,49.8 c 14.5,14.4 28.6,31.7 40.4,47.8 V 22.4 C 313,14 306.2,7.1 297.7,7.1 h -77.3 c 18,12.6 36.2,26.8 52.2,42.7 z"
          style={{ fill: "#22c55e" }}
        />
      </g>
    </g>
    <path
      style={{ fontSize: "18px", fontFamily: "Bahnschrift", fill: "#22c55e", strokeWidth: 1.5 }}
      d="M 19.825195,6.2519531 V 19.03125 H 18.032227 V 8.203125 L 16.212891,9.3193359 V 7.4648437 l 1.819336,-1.2128906 z"
      aria-label="1"
    />
  </svg>
)

interface ToolbarProps {
  activeTool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator"
  onToolChange: (
    tool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator",
  ) => void
}

type ToolType = "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator"

export function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  const tools = [
    {
      type: "select" as const,
      icon: MousePointer,
      label: "Select",
      description: "Select and move objects",
    },
    {
      type: "MqttDataField" as const,
      icon: NumericFieldIcon,
      label: "MQTT Data Field",
      description: "Create a field to display MQTT data values",
    },
    {
      type: "MQTTIconField" as const,
      icon: MqttIconFieldIcon,
      label: "MQTT Icon Field",
      description: "Create a field to display MQTT data as icons",
    },
    {
      type: "label" as const,
      icon: Type,
      label: "Label",
      description: "Create text label",
    },
    {
      type: "icon" as const,
      icon: ImageIcon,
      label: "Icon",
      description: "Click on canvas to select and place icon",
    },
    {
      type: "line" as const,
      icon: Minus,
      label: "Line",
      description: "Create line",
    },
    {
      type: "box" as const,
      icon: Square,
      label: "Box",
      description: "Create rectangle",
    },
    {
      type: "level-indicator" as const,
      icon: LevelIndicatorIcon,
      label: "Level Indicator",
      description: "Create a level indicator with calibration points",
    },
  ]

  const handleToolClick = (toolType: ToolType) => {
    onToolChange(toolType)
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1 p-2">
        {tools.map((tool) => {
          const Icon = tool.icon
          const isActive = activeTool === tool.type

          return (
            <Tooltip key={tool.type}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className="w-12 h-12 p-0"
                  onClick={() => handleToolClick(tool.type)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-sm">
                  <div className="font-medium">{tool.label}</div>
                  <div className="text-muted-foreground text-xs">{tool.description}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
