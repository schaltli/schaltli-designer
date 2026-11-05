"use client"

/**
 * The Prebuilt tab of the ribbon (docs/2026-11-05-quick-blocks.md): every
 * entity the broker's devices announce, as tiles grouped by device - the
 * device's name captioned below its group, as «Show» or «Operate» are - each
 * with its icon and its name. What cannot be placed is a greyed tile, its
 * tooltip saying why; in place of the tiles one line of text while the
 * catalog is looked for, or when there is nothing. Took over from the Block
 * menu (components/toolbar/block-catalog-menu.tsx, gone 2026-11-05).
 */

import { useEffect, useState } from "react"
import { Blocks, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePrebuiltCatalog } from "@/hooks/use-block-catalog"
import { catalogGroups, type CatalogEntry } from "@/lib/ha-discovery"
import { entryRendered } from "@/lib/bausteine"
import { loadIcons } from "@/lib/icon-search"
import { entryIcons } from "@/lib/prebuilt-icons"
import { cn } from "@/lib/utils"

export interface BlockTilesProps {
  // Whether the tab is shown: the catalog is read while it is.
  active: boolean
  onSelect?: (entry: CatalogEntry) => void
  // The entry in hand: its tile shown pressed.
  armedEntryId?: string
  // As for the tools: what the loaded device renders; undefined, no device.
  supportedObjectTypes?: string[]
}

const TILE = "h-14 w-20 flex-col gap-0.5 px-1 py-1 font-normal"

export function BlockTiles({ active, onSelect, armedEntryId, supportedObjectTypes }: BlockTilesProps) {
  const state = usePrebuiltCatalog(active)
  const [icons, setIcons] = useState<Map<string, string>>(new Map())
  // The catalog itself, not the state around it: that is new each time the
  // listener reports, the catalog only when an announcement changed.
  const catalog = state.status === "found" ? state.catalog : null

  // The icons each prebuilt comes with, asked for as soon as its tile shows,
  // so a press need not wait for them (docs/2026-11-05-quick-blocks.md).
  useEffect(() => {
    for (const entry of catalog?.entries ?? []) void entryIcons(entry)
  }, [catalog])

  useEffect(() => {
    if (!catalog) return
    let current = true
    const names = catalog.entries.map((e) => e.icon).filter((name): name is string => !!name)
    if (names.length === 0) return
    loadIcons(names).then((found) => {
      if (current) setIcons(new Map([...found].map(([name, icon]) => [name, icon.svgUrl])))
    })
    return () => {
      current = false
    }
  }, [catalog])

  // Not listening, the catalog is read once when the tab opens: a newly
  // announced device shows after this (docs/2026-11-05-quick-blocks.md,
  // decision 4). Listening, it shows by itself.
  const refresh = state.live ? null : (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className={TILE} onClick={state.refresh} data-testid="prebuilt-refresh">
          <RefreshCw className="size-6 shrink-0" />
          <span className="text-[10px] leading-tight">Refresh</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-sm">
          <div className="font-medium">Refresh</div>
          <div className="text-muted-foreground text-xs">Read again what the devices announce. With Listening on, new ones show by themselves.</div>
        </div>
      </TooltipContent>
    </Tooltip>
  )

  if (state.status !== "found") {
    const text =
      state.status === "looking"
        ? `Looking for devices on ${state.broker} …`
        : state.status === "offline"
          ? `No broker at ${state.broker}. Prebuilts come from the devices on one.`
          : `Nothing announces itself under ${state.prefix}/ on ${state.broker}.`
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-[4.5rem] items-center px-3 text-xs text-muted-foreground" data-testid="block-catalog-status">
          {text}
        </div>
        {state.status !== "looking" && refresh}
      </div>
    )
  }

  // Pressed, not clicked: carried onto the screen with the button held, or
  // hanging at the pointer once let go - as a tool's tile (decision 7).
  const tile = (key: string, label: string, opts: { icon?: string; disabled?: string; onPress?: () => void }) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <Button
          variant={armedEntryId === key ? "default" : "ghost"}
          size="sm"
          data-entry-id={key}
          data-armed={armedEntryId === key || undefined}
          aria-disabled={opts.disabled ? true : undefined}
          className={cn(TILE, opts.disabled && "opacity-40 cursor-not-allowed")}
          onMouseDown={(e) => {
            if (e.button !== 0 || opts.disabled) return
            // No text selection or native drag while the tile is carried away.
            e.preventDefault()
            opts.onPress?.()
          }}
        >
          {opts.icon ? <img src={opts.icon} alt="" className={cn("size-6 shrink-0", armedEntryId === key ? "invert dark:invert-0" : "dark:invert")} /> : <Blocks className="size-6 shrink-0 text-muted-foreground" />}
          <span className="w-full text-[10px] leading-tight text-center line-clamp-2 whitespace-normal break-words">{label}</span>
          {/* The reason, for a screen reader - the tooltip shows it. */}
          {opts.disabled && <span className="sr-only">{opts.disabled}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-sm">
          <div className="font-medium">{label}</div>
          <div className="text-muted-foreground text-xs">{opts.disabled ?? "Drag onto the screen, or click and place. Bound to this value of the installation."}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <>
      {catalogGroups(state.catalog).map((group, index) => {
        const all = [...group.entries, ...group.unsupported]
        // A device with one entity of its own name - a thing announced on its
        // own - needs no caption repeating it.
        const caption = all.length === 1 && all[0].label === group.device ? "" : group.device || "Other"
        return (
          <div
            key={group.device || "-"}
            data-testid="block-catalog-device"
            data-device={group.device}
            className={cn("flex flex-col items-center justify-between px-2", index > 0 && "border-l border-border ml-1 pl-3")}
          >
            <div className="flex items-stretch gap-1">
              {group.entries.map((entry) =>
                tile(entry.id, entry.label, {
                  icon: entry.icon ? icons.get(entry.icon) : undefined,
                  disabled: entryRendered(entry, supportedObjectTypes) ? undefined : "Not rendered by the loaded device's firmware",
                  onPress: () => onSelect?.(entry),
                }),
              )}
              {group.unsupported.map((entity) => tile(entity.id, entity.label, { disabled: `Not supported: ${entity.reason}` }))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{caption || " "}</div>
          </div>
        )
      })}
      {refresh && <div className="flex flex-col items-center justify-between px-2 border-l border-border ml-1 pl-3">{refresh}</div>}
    </>
  )
}
