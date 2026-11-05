"use client"

import { useEffect, useRef, useState, type ComponentType } from "react"
import { OPEN_BLOCK_MENU_EVENT } from "@/components/listen-viewer"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { OBJECT_ICONS } from "@/components/icons/object-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { BlockTiles } from "@/components/toolbar/block-tiles"
import type { CatalogEntry } from "@/lib/ha-discovery"
import { MousePointer2, Rows3, SquareStack } from "lucide-react"
import { ROW_TEMPLATES, type RowTemplate } from "@/lib/snap-table"
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
  // Not a type either: a row of several objects, one per role, carried as
  // one (docs/2026-10-09-snap-tables.md, module snap-table-rows).
  | "row"
  // Not a type either: a free area with the look Card (docs/2026-11-03-card.md).
  | "card"

type RibbonTab = "parts" | "prebuilt"
const RIBBON_TAB_KEY = "schaltli.ribbonTab"

// The row templates, as the menu names them.
const ROW_TEMPLATE_LABELS: Record<RowTemplate, string> = {
  "icon-label-switch": "Icon · Label · Switch",
  "label-switch": "Label · Switch",
  "icon-switch": "Icon · Switch",
  "label-button": "Label · Button",
}

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
  // A catalog entry's tile pressed on the Prebuilt tab: the Block tool takes
  // it with its defaults and carries it (docs/2026-11-05-quick-blocks.md). Separate from onToolChange because the tool
  // needs to know which entry.
  onCatalogEntrySelect?: (entry: CatalogEntry) => void
  // The entry the Block tool holds, its tile shown pressed as a tool's is.
  armedEntryId?: string
  // A row template picked in the Row menu, which arms the Row tool.
  onRowTemplateSelect?: (template: RowTemplate) => void
  // A tool's tile pressed: carried onto the screen with the button held, its
  // object comes along (docs/2026-11-05-quick-blocks.md, decision 7).
  onToolPress?: (tool: ToolType) => void
  supportsSoftwareButtons?: boolean
  // Object types the loaded device's firmware actually renders (from a Device
  // Description File). Tools outside this list are shown but disabled, since
  // placing them would create objects invisible on the real device.
  // undefined = no device loaded, no restriction.
  supportedObjectTypes?: string[]
  // Whether the screen being edited may take a navigator: a master that has
  // none yet (docs/2026-10-08-navigator.md decision 1).
  navigatorPlaceable?: boolean
  // "vertical" (default) is the classic left-sidebar layout (icon-only tiles);
  // "horizontal" is a ribbon-style row with a label under each icon, grouped
  // like Word's ribbon (a vertical divider + group caption per group).
  orientation?: "vertical" | "horizontal"
}

export function Toolbar({
  activeTool,
  onToolChange,
  onCatalogEntrySelect,
  armedEntryId,
  onRowTemplateSelect,
  onToolPress,
  supportsSoftwareButtons = false,
  supportedObjectTypes,
  navigatorPlaceable = false,
  orientation = "vertical",
}: ToolbarProps) {
  // The ribbon's two tabs (docs/2026-11-05-quick-blocks.md, decision 1):
  // the parts one by one, and the prebuilt assemblies the broker's devices
  // announce. The one last open is remembered per browser, read after the
  // first render so the server's and the browser's agree.
  const [tab, setTab] = useState<RibbonTab>("parts")
  useEffect(() => {
    try {
      if (window.localStorage.getItem(RIBBON_TAB_KEY) === "prebuilt") setTab("prebuilt")
    } catch {
      // No storage: Parts, as the first time.
    }
  }, [])
  const showTab = (next: RibbonTab) => {
    setTab(next)
    try {
      window.localStorage.setItem(RIBBON_TAB_KEY, next)
    } catch {
      // Not remembered, still shown.
    }
  }
  // «Listen to Broker» points here when devices announce themselves
  // (docs/2026-10-14-topic-discovery.md, decision 8).
  useEffect(() => {
    const open = () => showTab("prebuilt")
    window.addEventListener(OPEN_BLOCK_MENU_EVENT, open)
    return () => window.removeEventListener(OPEN_BLOCK_MENU_EVENT, open)
  }, [])
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
        tool("text", "Text", "Text, with placeholders for values from topics and the screen's own facts"),
        tool("icon", "Icon", "A picture from the asset library, fixed or chosen by a value"),
        tool("bar", "Bar", "A level to read, as a bar"),
        tool("gauge", "Gauge", "A level to read, as an arc"),
        tool("energy-diagram", "Energy diagram", "Where the energy comes from and goes: a Sankey or a Flow of nodes"),
        tool("chart", "Chart", "Values over time: curves, a band of when something ran, or bars per day"),
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
        tool("text-field", "Text field", "A text a finger types on a keyboard, bound to a read and a write topic"),
        tool("time-field", "Time field", "A time of day a finger sets on a picker, bound to a read and a write topic"),
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
    {
      label: "Arrange",
      tools: [
        tool("switcher", "Switcher", "Shows one of its panels, chosen by a value"),
        tool("navigator", "Navigator", "A bar of every screen along an edge, on a master: a tap opens a screen"),
      ],
    },
    // Tables: no tool of their own - a table forms when two objects snap
    // together (docs/2026-10-09-snap-tables.md, the Table tool gone with
    // module old-table-removal); here the Row tool, rendered beside, and a
    // free area. A free area went from the tools on 2026-10-04, since a
    // screen is free (docs/2026-10-03-free-screens.md), and came back on
    // 2026-10-05: in a table's cell or a switcher's panel it is the one
    // place things stand where they are put, and it may have a background
    // of its own.
    {
      label: "Tables",
      tools: [
        tool("free", "Free", "An area where what is put into it stays where it is placed - in a table's cell too - with a background of its own"),
        {
          type: "card",
          icon: SquareStack,
          shortLabel: "Card",
          label: "Card",
          description: "A free area that looks like a card: panel, edge, round corners and padding from Settings › Cards",
        },
      ],
    },
  ]
  // What the device does not declare is not shown - not shown-disabled
  // (decision 11). A group with nothing left in it goes too.
  const offered = (t: ToolDef) =>
    (t.type !== "navigator" || navigatorPlaceable) &&
    (t.type === "select" ||
    isLayoutOnlyType(t.type) ||
    t.type === "card" ||
    // Offered on a device that does not declare it too (tasks/charts-designer-plan.md
    // D7): a chart can be built and seen in the preview; Deploy refuses it there.
    (t.type === "chart" && !(supportedObjectTypes ?? []).includes("chart")) ||
    supportedObjectTypes === undefined ||
    supportedObjectTypes.includes(t.type))
  const toolGroups = groups
    .map((group) => ({ ...group, tools: group.tools.filter(offered) }))
    .filter((group) => group.tools.length > 0)

  // Whether the tile pressed last held its tool already: a second click on
  // a tool in hand gives it up (docs/2026-11-05-quick-blocks.md, decision 7)
  // - read at the press, since the press itself puts the tool in hand.
  const pressedWasActive = useRef(false)
  const handleToolClick = (toolType: ToolType, disabled: boolean) => {
    if (disabled) return
    onToolChange(pressedWasActive.current && toolType !== "select" ? "select" : toolType)
    pressedWasActive.current = false
  }

  const isHorizontal = orientation === "horizontal"
  const tooltipSide = isHorizontal ? "bottom" : "right"

  // The Row tool: a menu of rows - an icon, a label, a control - each carried
  // as one and put into a table by role. A row with a part the device does
  // not render is shown disabled, as a tool is.
  const renderRowButton = () => {
    const isActive = activeTool === "row"
    const renders = (template: RowTemplate) =>
      supportedObjectTypes === undefined || ROW_TEMPLATES[template].every((type) => supportedObjectTypes.includes(type))
    return (
      <DropdownMenu key="row">
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isActive ? "default" : "ghost"}
                size="sm"
                data-testid="row-tool"
                className={cn(isHorizontal ? "h-14 w-20 flex-col gap-0.5 px-1 py-1 font-normal" : "w-14 h-14 p-0")}
              >
                <Rows3 className={isHorizontal ? "size-6 shrink-0" : "size-9"} />
                {isHorizontal && <span className="text-[10px] leading-tight text-center whitespace-nowrap">Row</span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            <div className="text-sm">
              <div className="font-medium">Row</div>
              <div className="text-muted-foreground text-xs">Several objects at once, each into the column of its kind</div>
            </div>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Row template</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(ROW_TEMPLATES) as RowTemplate[]).map((template) => (
            <DropdownMenuItem
              key={template}
              data-testid={`row-template-${template}`}
              disabled={!renders(template)}
              onSelect={() => onRowTemplateSelect?.(template)}
            >
              {ROW_TEMPLATE_LABELS[template]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderToolButton = (tool: ToolDef) => {
    const Icon = tool.icon
    const isActive = activeTool === tool.type
    // "select" is always available; other tools are disabled if the loaded
    // device's firmware doesn't render that object type.
    const isDisabled =
      tool.type !== "select" &&
      !isLayoutOnlyType(tool.type) &&
      // A card is a free area: layout-only, as Free is.
      tool.type !== "card" &&
      tool.type !== "chart" &&
      supportedObjectTypes !== undefined &&
      !supportedObjectTypes.includes(tool.type)

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
            onMouseDown={(e) => {
              if (e.button !== 0 || isDisabled || tool.type === "select") return
              pressedWasActive.current = activeTool === tool.type
              // No text selection or native drag while the tile is carried away.
              e.preventDefault()
              onToolPress?.(tool.type)
            }}
            data-tool={tool.type}
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
        <div className="flex flex-col">
          <div role="tablist" aria-label="Ribbon" className="flex gap-1 px-2 pt-1">
            {(["parts", "prebuilt"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                data-testid={`ribbon-tab-${t}`}
                onClick={() => showTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-xs",
                  tab === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "parts" ? "Parts" : "Prebuilt"}
              </button>
            ))}
          </div>
          <div className="flex flex-row items-stretch gap-1 px-2 pb-1 pt-1 min-h-[5.25rem]">
            {tab === "prebuilt" ? (
              <BlockTiles active onSelect={onCatalogEntrySelect} armedEntryId={armedEntryId} supportedObjectTypes={supportedObjectTypes} />
            ) : (
            toolGroups.map((group, index) => (
              <div
                key={group.label}
                className={cn(
                  "flex flex-col items-center justify-between px-2",
                  index > 0 && "border-l border-border ml-1 pl-3",
                )}
              >
                <div className="flex items-stretch gap-1">
                  {group.tools.map(renderToolButton)}
                  {group.label === "Tables" && onRowTemplateSelect && renderRowButton()}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{group.label}</div>
              </div>
            ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {toolGroups.flatMap((group) => group.tools).map(renderToolButton)}
          {onRowTemplateSelect && renderRowButton()}
        </div>
      )}
    </TooltipProvider>
  )
}
