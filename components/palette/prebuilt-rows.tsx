"use client"

/**
 * The palette's Prebuilt tab (docs/2026-11-06-palette.md): every entity the
 * broker's devices announce, a group per device - alphabetical, none first -
 * and a row per thing with its icon and its name. What cannot be placed is a
 * greyed row, its tooltip saying why. The search keeps the things whose name
 * or device holds what is typed, their groups open while it does. Took over
 * from the ribbon's tiles (components/toolbar/block-tiles.tsx).
 */

import { useEffect, useMemo, useState } from "react"
import { Blocks, RefreshCw } from "lucide-react"
import { usePrebuiltCatalog } from "@/hooks/use-block-catalog"
import { catalogGroups, type CatalogEntry } from "@/lib/ha-discovery"
import { entryRendered } from "@/lib/bausteine"
import { loadIcons } from "@/lib/icon-search"
import { entryIcons } from "@/lib/prebuilt-icons"
import { cn } from "@/lib/utils"
import { matches, PaletteFooter, PaletteGroup, PaletteRow, PaletteScroll, type PaletteListProps } from "@/components/palette/palette"

export interface PrebuiltRowsProps {
  list: PaletteListProps
  onSelect?: (entry: CatalogEntry) => void
  // The entry in hand: its row shown pressed.
  armedEntryId?: string
  // What the loaded device renders; undefined, no device.
  supportedObjectTypes?: string[]
}

export function PrebuiltRows({ list, onSelect, armedEntryId, supportedObjectTypes }: PrebuiltRowsProps) {
  // Shown, so read: the tab is mounted only while it is open.
  const state = usePrebuiltCatalog(true)
  const [icons, setIcons] = useState<Map<string, string>>(new Map())
  const catalog = state.status === "found" ? state.catalog : null

  // The icons each prebuilt comes with, asked for as soon as its row can
  // show, so a press need not wait for them (docs/2026-11-05-quick-blocks.md).
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

  const groups = useMemo(() => (catalog ? catalogGroups(catalog) : []), [catalog])

  // Not listening, the catalog is read once when the tab opens; Refresh reads
  // it again. Listening, a newly announced device shows by itself.
  const refresh = state.live ? null : (
    <button
      type="button"
      data-testid="prebuilt-refresh"
      title="Read again what the devices announce. With Listening on, new ones show by themselves."
      onClick={state.refresh}
      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-0.5 text-xs text-foreground hover:bg-accent"
    >
      <RefreshCw className="size-3" aria-hidden />
      Refresh
    </button>
  )

  if (state.status !== "found") {
    const text =
      state.status === "looking"
        ? `Looking for devices on ${state.broker} …`
        : state.status === "offline"
          ? `No broker at ${state.broker}. Prebuilts come from the devices on one.`
          : `Nothing announces itself under ${state.prefix}/ on ${state.broker}.`
    return (
      <>
        <PaletteScroll>
          <p className="px-2.5 py-3 text-xs text-muted-foreground" data-testid="block-catalog-status">
            {text}
          </p>
        </PaletteScroll>
        {state.status !== "looking" && refresh && (
          <PaletteFooter>
            <span className="flex-1" />
            {refresh}
          </PaletteFooter>
        )}
      </>
    )
  }

  const things = groups.reduce((n, g) => n + g.entries.length + g.unsupported.length, 0)
  const query = list.query.trim()
  const shown = groups
    .map((group) => {
      const name = group.device || "Other"
      const whole = !!query && matches(name, query)
      const keep = <T extends { label: string }>(items: T[]) => (!query || whole ? items : items.filter((e) => matches(e.label, query)))
      return { name, entries: keep(group.entries), unsupported: keep(group.unsupported) }
    })
    .filter((g) => g.entries.length + g.unsupported.length > 0)
  const first = shown[0]?.name

  return (
    <>
      <PaletteScroll>
        {shown.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Nothing matches «{query}».</p>}
        {shown.map((group, index) => (
          <PaletteGroup
            key={group.name}
            testId="block-catalog-device"
            name={group.name}
            count={group.entries.length + group.unsupported.length}
            // Searching, every group that holds a match is open.
            open={!!query || list.isOpen(group.name, index)}
            onToggle={(open) => list.toggle(group.name, open, first)}
          >
            {group.entries.map((entry) => {
              const icon = entry.icon ? icons.get(entry.icon) : undefined
              const armed = armedEntryId === entry.id
              return (
                <PaletteRow
                  key={entry.id}
                  label={entry.label}
                  armed={armed}
                  data={{ "data-entry-id": entry.id }}
                  tip={`${entry.label}: drag onto the screen, or click and place`}
                  disabled={entryRendered(entry, supportedObjectTypes) ? undefined : "Not rendered by the loaded device's firmware"}
                  icon={icon ? <img src={icon} alt="" className={cn("size-[18px]", armed ? "invert dark:invert-0" : "dark:invert")} /> : <Blocks className="size-[18px] text-muted-foreground" aria-hidden />}
                  onPress={() => onSelect?.(entry)}
                />
              )
            })}
            {group.unsupported.map((entity) => (
              <PaletteRow
                key={entity.id}
                label={entity.label}
                data={{ "data-entry-id": entity.id }}
                disabled={`Not supported: ${entity.reason}`}
                icon={<Blocks className="size-[18px] text-muted-foreground" aria-hidden />}
              />
            ))}
          </PaletteGroup>
        ))}
      </PaletteScroll>
      <PaletteFooter>
        <span className="flex-1" data-testid="prebuilt-count">
          {things} {things === 1 ? "thing" : "things"} from {groups.length} {groups.length === 1 ? "device" : "devices"}
        </span>
        {refresh}
      </PaletteFooter>
    </>
  )
}
