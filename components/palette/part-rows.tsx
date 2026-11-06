"use client"

/**
 * The palette's Parts tab (docs/2026-11-06-palette.md): one row per object
 * type, in the groups of what a person wants to do - show, operate, draw,
 * arrange, tables - as the ribbon had them. The line between Show and
 * Operate is the touch line: an e-paper DDF declares nothing from Operate
 * (docs/2026-09-20-control-split.md, decision 10). What the loaded device
 * does not render is not shown - not shown-disabled (decision 11) - and a
 * group with nothing left in it goes too. No Select (placing ends in
 * selecting) and no Row (decisions 7 and 11 of the palette's spec).
 */

import { useRef, type ComponentType } from "react"
import { SquareStack } from "lucide-react"
import { OBJECT_ICONS } from "@/components/icons/object-icons"
import { objectTypeLabel, type ObjectType } from "@/lib/object-types"
import { isLayoutOnlyType } from "@/lib/layout"
import { matches, PaletteGroup, PaletteRow, PaletteScroll, type PaletteListProps } from "@/components/palette/palette"

export type PartType = ObjectType | "card"

interface PartDef {
  type: PartType
  icon: ComponentType<{ className?: string }>
  label: string
  description: string
}

const part = (type: ObjectType, description: string): PartDef => ({ type, icon: OBJECT_ICONS[type], label: objectTypeLabel(type), description })

const GROUPS: { label: string; parts: PartDef[] }[] = [
  {
    label: "Show",
    parts: [
      part("text", "Text, with placeholders for values from topics and the screen's own facts"),
      part("icon", "A picture from the asset library, fixed or chosen by a value"),
      part("bar", "A level to read, as a bar"),
      part("gauge", "A level to read, as an arc"),
      part("energy-diagram", "Where the energy comes from and goes: a Sankey or a Flow of nodes"),
      part("chart", "Values over time: curves, a band of when something ran, or bars per day"),
    ],
  },
  {
    label: "Operate",
    parts: [
      part("slider", "A level a finger sets, as a bar"),
      part("dial", "A level a finger sets, as an arc"),
      part("switch", "On or off: a knob in a track, bound to a read and a write topic"),
      part("button-group", "One of several states, side by side, bound to a read and a write topic"),
      part("button", "Does something when pressed"),
      part("text-field", "A text a finger types on a keyboard, bound to a read and a write topic"),
      part("time-field", "A time of day a finger sets on a picker, bound to a read and a write topic"),
    ],
  },
  {
    label: "Draw",
    parts: [part("line", "A line through any number of points"), part("live-line", "A line whose thickness and arrows follow a value"), part("box", "A rectangle")],
  },
  {
    label: "Arrange",
    parts: [part("switcher", "Shows one of its panels, chosen by a value"), part("navigator", "A bar of every screen along an edge, on a master: a tap opens a screen")],
  },
  // Tables: no tool of their own - a table forms when two objects snap
  // together (docs/2026-10-09-snap-tables.md); here a free area, and one
  // that looks like a card.
  {
    label: "Tables",
    parts: [
      part("free", "An area where what is put into it stays where it is placed - in a table's cell too - with a background of its own"),
      { type: "card", icon: SquareStack, label: "Card", description: "A free area that looks like a card: panel, edge, round corners and padding from Settings › Cards" },
    ],
  },
]

export interface PartRowsProps {
  list: PaletteListProps
  activeTool: string
  // Pressed: in hand, carried with the button held (docs/2026-11-05-quick-blocks.md, decision 7).
  onPress: (type: PartType) => void
  // Clicked: in hand, or given up when it already was.
  onChange: (type: PartType | "select") => void
  supportedObjectTypes?: string[]
  // Whether the screen being edited may take a navigator: a master that has
  // none yet (docs/2026-10-08-navigator.md decision 1).
  navigatorPlaceable?: boolean
}

export function PartRows({ list, activeTool, onPress, onChange, supportedObjectTypes, navigatorPlaceable = false }: PartRowsProps) {
  // Whether the row pressed last held its part already: a second click on a
  // part in hand gives it up - read at the press, since the press itself
  // puts the part in hand.
  const pressedWasActive = useRef(false)
  const offered = (p: PartDef) =>
    (p.type !== "navigator" || navigatorPlaceable) &&
    (isLayoutOnlyType(p.type) ||
      p.type === "card" ||
      // Offered where the device does not declare it too (tasks/charts-designer-plan.md
      // D7): a chart can be built and seen in the preview; Deploy refuses it there.
      p.type === "chart" ||
      supportedObjectTypes === undefined ||
      supportedObjectTypes.includes(p.type))
  const query = list.query.trim()
  const groups = GROUPS.map((g) => {
    const whole = !!query && matches(g.label, query)
    return { label: g.label, parts: g.parts.filter(offered).filter((p) => !query || whole || matches(p.label, query)) }
  }).filter((g) => g.parts.length > 0)
  const first = groups[0]?.label

  return (
    <PaletteScroll>
      {groups.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Nothing matches «{query}».</p>}
      {groups.map((group, index) => (
        <PaletteGroup
          key={group.label}
          testId="part-group"
          name={group.label}
          count={group.parts.length}
          open={!!query || list.isOpen(group.label, index)}
          onToggle={(open) => list.toggle(group.label, open, first)}
        >
          {group.parts.map((p) => {
            const Icon = p.icon
            return (
              <PaletteRow
                key={p.type}
                label={p.label}
                tip={p.description}
                armed={activeTool === p.type}
                data={{ "data-tool": p.type }}
                icon={<Icon className="size-[18px]" />}
                onPress={() => {
                  pressedWasActive.current = activeTool === p.type
                  onPress(p.type)
                }}
                onClick={() => {
                  onChange(pressedWasActive.current ? "select" : p.type)
                  pressedWasActive.current = false
                }}
              />
            )
          })}
        </PaletteGroup>
      ))}
    </PaletteScroll>
  )
}
