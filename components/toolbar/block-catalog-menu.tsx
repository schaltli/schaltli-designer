"use client"

/**
 * The Block menu's catalog (block plan Task 6b, docs/2026-09-30-block-
 * discovery.md): every entity the broker's Home Assistant discovery configs
 * announce, grouped by device, with its icon; what cannot be placed greyed
 * out with the reason, so a thing of one's own that is missing says why.
 * Read each time the menu opens.
 */

import { useEffect, useState } from "react"
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { useBlockCatalog } from "@/hooks/use-block-catalog"
import { catalogGroups, type CatalogEntry } from "@/lib/ha-discovery"
import { loadIcons } from "@/lib/icon-search"

export interface BlockCatalogMenuProps {
  open: boolean
  onSelect?: (entry: CatalogEntry) => void
}

export function BlockCatalogMenu({ open, onSelect }: BlockCatalogMenuProps) {
  const state = useBlockCatalog(open)
  const [icons, setIcons] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (state.status !== "found") return
    let current = true
    const names = state.catalog.entries.map((e) => e.icon).filter((name): name is string => !!name)
    if (names.length === 0) return
    loadIcons(names).then((found) => {
      if (current) setIcons(new Map([...found].map(([name, icon]) => [name, icon.svgUrl])))
    })
    return () => {
      current = false
    }
  }, [state])

  if (state.status !== "found") {
    const text =
      state.status === "looking"
        ? `Looking for devices on ${state.broker} …`
        : state.status === "offline"
          ? `No broker at ${state.broker}. Blocks come from the devices on one.`
          : `Nothing announces itself under ${state.prefix}/ on ${state.broker}.`
    return (
      <DropdownMenuItem disabled data-testid="block-catalog-status">
        <span className="text-xs">{text}</span>
      </DropdownMenuItem>
    )
  }

  return (
    <>
      {catalogGroups(state.catalog).map((group) => (
        <div key={group.device || "-"} data-testid="block-catalog-device" data-device={group.device}>
          {/* A device with one entity of its own name - a thing announced
              on its own - needs no heading repeating it. */}
          {!(group.entries.length + group.unsupported.length === 1 && [...group.entries, ...group.unsupported][0].name === group.device) && (
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group.device || "Other"}</DropdownMenuLabel>
          )}
          {group.entries.map((entry) => {
            const icon = entry.icon ? icons.get(entry.icon) : undefined
            return (
              <DropdownMenuItem key={entry.id} data-entry-id={entry.id} onSelect={() => onSelect?.(entry)}>
                <div className="flex items-center gap-2">
                  {icon ? <img src={icon} alt="" className="size-4 dark:invert" /> : <span className="size-4" />}
                  <span className="text-sm">{entry.name}</span>
                </div>
              </DropdownMenuItem>
            )
          })}
          {group.unsupported.map((entity) => (
            <DropdownMenuItem key={entity.id} disabled data-entry-id={entity.id}>
              <div className="flex items-start gap-2">
                <span className="size-4 shrink-0" />
                <div>
                  <div className="text-sm">{entity.name}</div>
                  <div className="text-xs text-muted-foreground">Not supported: {entity.reason}</div>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
      ))}
    </>
  )
}
