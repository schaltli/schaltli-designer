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
    width="24"
    height="24"
    viewBox="0 0 24 24"
    style={{ width: "24px", height: "24px" }}
  >
    <g fill="none" transform="matrix(1.1763083,0,0,1.1221918,-2.1739121,-1.4048485)">
      <path
        d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0"
      />
      <path
        d="M 9,3 H 21 V 15 H 16 C 16,10.896 13.105,8 9,8 Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="2"
        d="M 9,8 V 3 h 12 v 12 h -5"
      />
      <path
        stroke="currentColor"
        strokeWidth="2"
        d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0 z"
      />
    </g>
  </svg>
)

const MqttFieldIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    style={{ width: "24px", height: "24px" }}
  >
    <path
      fill="currentColor"
      d="M 9.9068723,0.10407346 H 7.3069114 A 13.375344,12.760007 0 0 1 9.0626824,1.4743019 13.88978,13.250776 0 0 1 10.421309,3.0079566 V 0.59484256 A 0.51443632,0.4907695 0 0 0 9.9068723,0.10407346 m -6.0106739,0 H 0.64701886 A 0.51443632,0.4907695 0 0 0 0.13258249,0.59484256 V 1.0762876 A 9.3730295,8.94182 0 0 1 9.4696008,9.9194636 H 9.9068723 A 0.51443632,0.4907695 0 0 0 10.417708,9.4252586 V 6.0850806 A 11.101536,10.590806 0 0 0 3.8961984,0.10407346 M 0.13258249,2.5746066 V 4.1725528 A 6.1130468,5.831814 0 0 1 6.202931,9.9194636 H 7.9417256 A 7.7937104,7.4351581 0 0 0 0.13258249,2.5746066 m 0,3.096756 v 3.757331 a 0.51443632,0.4907695 0 0 0 0.51443637,0.49077 H 4.6699106 A 4.532184,4.3236793 0 0 0 0.13258249,5.6713626"
      style={{ strokeWidth: 0.502464 }}
    />
    <g fill="none" transform="matrix(0.81960276,0,0,0.78189666,5.7502192,6.6561689)">
      <path
        d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0"
      />
      <path
        d="M 9,3 H 21 V 15 H 16 C 16,10.896 13.105,8 9,8 Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="2"
        d="M 9,8 V 3 h 12 v 12 h -5"
      />
      <path
        stroke="currentColor"
        strokeWidth="2"
        d="m 3,14.5 a 6.5,6.5 0 1 0 13,0 6.5,6.5 0 0 0 -13,0 z"
      />
    </g>
  </svg>
)

const MqttDataFieldIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    style={{ width: "24px", height: "24px" }}
  >
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

const LevelIndicatorIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    style={{ width: "24px", height: "24px" }}
  >
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
      icon: MqttDataFieldIcon,
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
