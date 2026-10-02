"use client"

import { useState, type ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { OBJECT_ICONS } from "@/components/icons/object-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { BlockCatalogMenu } from "@/components/toolbar/block-catalog-menu"
import type { CatalogEntry } from "@/lib/ha-discovery"
import { MousePointer2, Blocks } from "lucide-react"
import { objectTypeLabel } from "@/lib/object-types"
import { isLayoutOnlyType } from "@/lib/layout"
import type { ObjectType } from "@/lib/object-types"


type ToolType =
  | "select"
  | ObjectType
  // Not a type of object but a recipe for several (lib/bausteine.ts): the
  // Block dialog arms the tool with an entry and its options, and the drag
  // gives it its rectangle.
  | "baustein"

interface ToolDef {
  type: ToolType
  icon: ComponentType<{ className?: string }>
  shortLabel: string
  label: string
  description: string
}

interface ToolbarProps {
  // Wider than ToolType on purpose: ToolType is what this toolbar *offers*,
  // while the editor's activeTool is every state it can be in, and those are
  // not the same set. "background" is one such state - guarded against in
  // canvas.tsx and mouse-handlers.ts, but produced by no button here. All
  // this component does with the value is compare it to decide which button
  // looks active, so a state it does not own simply matches nothing.
  activeTool: ToolType | "background"
  onToolChange: (tool: ToolType) => void
  // A catalog entry picked in the Block menu: its options come next, then
  // the Block tool places it. Separate from onToolChange because the tool
  // needs to know which entry.
  onCatalogEntrySelect?: (entry: CatalogEntry) => void
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
  onCatalogEntrySelect,
  supportsSoftwareButtons = false,
  supportedObjectTypes,
  orientation = "vertical",
}: ToolbarProps) {
  // The catalog is read while the Block menu is open, afresh each time.
  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const selectTool: ToolDef = {
    type: "select",
    icon: MousePointer2,
    shortLabel: "Select",
    label: "Select",
    description: "Select and move objects",
  }
  // One entry per object type, named and drawn from one place
  // (lib/object-types.ts, components/icons/object-icons.tsx). The groups are
  // what a person wants to do - show, operate, draw, arrange - and the line
  // between Show and Operate is the touch line: an e-paper DDF declares
  // nothing from Operate (docs/2026-09-20-control-split.md, decision 10).
  const tool = (type: ObjectType, shortLabel: string, description: string): ToolDef => ({
    type,
    icon: OBJECT_ICONS[type],
    shortLabel,
    label: objectTypeLabel(type),
    description,
  })
  const groups: { label: string; tools: ToolDef[] }[] = [
    { label: "Select", tools: [selectTool] },
    {
      label: "Show",
      tools: [
        tool("text", "Text", "Fixed text, with placeholders for the screen's own facts"),
        tool("live-text", "Live Text", "A value from a topic, shown as text"),
        tool("icon", "Icon", "A picture from the asset library"),
        tool("live-icon", "Live Icon", "One of several icons, chosen by a value"),
        tool("bar", "Bar", "A level to read, as a bar"),
        tool("gauge", "Gauge", "A level to read, as an arc"),
      ],
    },
    {
      label: "Operate",
      tools: [
        tool("slider", "Slider", "A level a finger sets, as a bar"),
        tool("dial", "Dial", "A level a finger sets, as an arc"),
        tool("switch", "Switch", "On or off: a knob in a track, bound to a read and a write topic"),
        tool("button-group", "Button Group", "One of several states, side by side, bound to a read and a write topic"),
        tool("button", "Button", "Does something when pressed"),
      ],
    },
    {
      label: "Draw",
      tools: [
        tool("line", "Line", "A line through any number of points"),
        tool("live-line", "Live Line", "A line whose thickness and arrows follow a value"),
        tool("box", "Box", "A rectangle"),
      ],
    },
    { label: "Arrange", tools: [tool("switcher", "Switcher", "Shows one of its panels, chosen by a value")] },
    // Containers that place and size what is put into them
    // (docs/2026-10-02-layout.md). The designer's alone: every device gets
    // the objects inside them.
    {
      label: "Layout",
      tools: [
        tool("vertical-stack", "Stack", "Places what is put into it one under another"),
        tool("horizontal-stack", "Row", "Places what is put into it side by side"),
        tool("grid", "Grid", "Places what is put into it in columns, so names and controls line up"),
        tool("free", "Free", "Leaves what is put into it where it is placed, as a screen does"),
        tool("spacer", "Spacer", "An empty place: a cell left empty in a grid, a space in a stack or a row"),
      ],
    },
  ]
  // What the device does not declare is not shown - not shown-disabled
  // (decision 11). A group with nothing left in it goes too.
  const offered = (t: ToolDef) =>
    t.type === "select" ||
    isLayoutOnlyType(t.type) ||
    supportedObjectTypes === undefined ||
    supportedObjectTypes.includes(t.type)
  const toolGroups = groups
    .map((group) => ({ ...group, tools: group.tools.filter(offered) }))
    .filter((group) => group.tools.length > 0)

  // One button, one menu: the blocks are data (lib/bausteine.ts), and a block
  // whose object types this device does not render is shown disabled for the
  // same reason a tool is - placing it would draw nothing on the panel.
  const renderBausteinButton = () => {
    const isActive = activeTool === "baustein"
    return (
      <DropdownMenu key="baustein" onOpenChange={setBlockMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={cn(isHorizontal ? "h-14 w-20 flex-col gap-0.5 px-1 py-1 font-normal" : "w-14 h-14 p-0")}
              >
                <Blocks className={isHorizontal ? "size-6 shrink-0" : "size-9"} />
                {isHorizontal && <span className="text-[10px] leading-tight text-center whitespace-nowrap">Block</span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            <div className="text-sm">
              <div className="font-medium">Insert a building block</div>
              <div className="text-muted-foreground text-xs">
                A ready-made control, bound to a real value of this installation
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto">
          {/* What the broker's devices announce (Home Assistant discovery). */}
          <BlockCatalogMenu open={blockMenuOpen} onSelect={onCatalogEntrySelect} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
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
      tool.type !== "select" && !isLayoutOnlyType(tool.type) && supportedObjectTypes !== undefined && !supportedObjectTypes.includes(tool.type)

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
          <div className="flex flex-col items-center justify-between px-2 border-l border-border ml-1 pl-3">
            <div className="flex items-stretch gap-1">{renderBausteinButton()}</div>
            <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">Blocks</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {toolGroups.flatMap((group) => group.tools).map(renderToolButton)}
          {renderBausteinButton()}
        </div>
      )}
    </TooltipProvider>
  )
}
