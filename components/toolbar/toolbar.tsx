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
      d="m 11.777994,1.916261 c 2.924846,0.1228604 5.948721,0.3353861 5.935735,4.7205452"
    />

    <path
      fill="currentColor"
      d="m 22.769282,22.378055 v -7.973248 c 0,-0.626469 -0.512566,-1.139035 -1.139035,-1.139035 h -7.973249 c -0.62647,0 -1.139036,0.512566 -1.139036,1.139035 v 7.973248 c 0,0.62647 0.512566,1.139036 1.139036,1.139036 h 7.973249 c 0.626469,0 1.139035,-0.512566 1.139035,-1.139036 m -6.891165,-2.858979 1.195987,1.44088 1.765506,-2.272376 c 0.113903,-0.148075 0.34171,-0.148075 0.455614,0.0057 l 1.999007,2.665343 a 0.28475888,0.28475888 0 0 1 -0.227807,0.455615 h -6.828518 c -0.239197,0 -0.370187,-0.273369 -0.222112,-0.46131 l 1.418099,-1.822457 c 0.108209,-0.148074 0.324625,-0.153769 0.444224,-0.01139"
      style={{ strokeWidth: 0.569518, stroke: "none" }}
    />
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
      d="m 11.777994,1.916261 c 2.924846,0.1228604 5.948721,0.3353861 5.935735,4.7205452"
    />

    <rect
      style={{
        opacity: 1,
        fill: "none",
        fillOpacity: 1,
        stroke: "#000000",
        strokeWidth: 1.84609,
        strokeLinecap: "round",
        strokeMiterlimit: 2.3,
        strokeDasharray: "none",
        strokeOpacity: 1,
      }}
      width="21.174065"
      height="7.6200261"
      x="1.3545439"
      y="14.30099"
    />

    <rect
      style={{
        fill: "#000000",
        fillOpacity: 1,
        stroke: "none",
        strokeWidth: 0.909948,
        strokeLinecap: "round",
        strokeMiterlimit: 2.3,
        strokeDasharray: "none",
        strokeOpacity: 1,
      }}
      width="11.749219"
      height="3.33637"
      x="3.6365874"
      y="16.489557"
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
      icon: MqttFieldIcon,
      label: "MQTT Icon Field",
      description: "Create a field to display MQTT data as icons",
    },
    {
      type: "level-indicator" as const,
      icon: LevelIndicatorIcon,
      label: "Level Indicator",
      description: "Create a level indicator with calibration points",
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
