"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const MousePointer = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="m13 13 6 6" />
  </svg>
)

const Type = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    <polyline points="4,7 4,4 20,4 20,7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
)

const Square = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
)

const Minus = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "28px", height: "28px" }}
  >
    <path d="M5 12h14" />
  </svg>
)

const ImageIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

const NumericFieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
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

const MqttFieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    <defs>
      <marker
        style={{ overflow: "visible" }}
        id="marker1447"
        refX="0"
        refY="0"
        orient="auto-start-reverse"
        markerWidth="7.7"
        markerHeight="5.6"
        viewBox="0 0 7.7 5.6"
        preserveAspectRatio="xMidYMid"
      >
        <path
          transform="scale(0.7)"
          d="M -2,-4 9,0 -2,4 c 2,-2.33 2,-5.66 0,-8 z"
          style={{ fill: "context-stroke", fillRule: "evenodd", stroke: "none" }}
        />
      </marker>
    </defs>

    <rect
      style={{ opacity: 1, fill: "#ffffff", stroke: "#000000", strokeWidth: 1, strokeDasharray: "none" }}
      width="22.47122"
      height="12.001891"
      x="0.72933668"
      y="11.385617"
    />

    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m 6.2791657,1.6884549 a 8.1298169,8.1298169 0 0 1 2.758773,2.670878 v -2.670878 z m 2.758773,5.4189236 C 8.4152397,4.4096989 6.2700727,2.3245429 3.5520184,1.7806209 L 3.0900895,1.6884549 H 1.5354668 v 1.09209 c 3.4204055,0.260143 6.1502389,2.9899756 6.4103829,6.4103816 h 1.092089 z m 0,3.1553415 H 0.46367306 V 0.61666291 H 10.109731 V 10.26272 Z M 1.5354668,3.8560559 v 1.7031306 c 1.8032834,0.409103 3.2226365,1.828456 3.6317405,3.63174 H 6.8703377 C 6.6154977,6.3630235 4.3633693,4.1108969 1.5354668,3.8560559 M 4.0595679,9.1909265 C 3.699474,7.9809995 2.7453937,7.0269185 1.5354668,6.6668255 v 2.524101 z"
      clipRule="evenodd"
      strokeWidth="0.326559"
      stroke="currentColor"
    />

    <path
      style={{
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
        strokeLinecap: "round",
        strokeMiterlimit: 2.3,
        strokeDasharray: "none",
        markerEnd: "url(#marker1447)",
      }}
      d="m 11.357351,4.9074976 c 2.924846,0.1228604 5.948721,0.3353861 5.935735,4.7205452"
    />

    <text
      xmlSpace="preserve"
      style={{
        fontWeight: "bold",
        fontSize: "12px",
        fontFamily: "Sitka Banner, sans-serif",
        textAlign: "center",
        textAnchor: "middle",
        opacity: 1,
        fill: "#000000",
        stroke: "#000000",
        strokeWidth: 0,
        strokeLinecap: "round",
        strokeMiterlimit: 2.3,
        strokeDasharray: "none",
      }}
      x="10.749757"
      y="21.546251"
    >
      <tspan
        x="10.749757"
        y="21.546251"
        style={{ fontSize: "12px", fill: "#000000", fillOpacity: 1, strokeWidth: 0, strokeDasharray: "none" }}
      >
        abc
      </tspan>
    </text>
  </svg>
)

const LevelIndicatorIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: "24px", height: "24px" }}
  >
    {/* Container rectangle */}
    <rect x="4" y="4" width="16" height="16" rx="2" />
    {/* Level indicator bars */}
    <rect x="6" y="16" width="2" height="2" fill="currentColor" />
    <rect x="9" y="14" width="2" height="4" fill="currentColor" />
    <rect x="12" y="12" width="2" height="6" fill="currentColor" />
    <rect x="15" y="10" width="2" height="8" fill="currentColor" />
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
      icon: MqttFieldIcon,
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
                  <Icon />
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
