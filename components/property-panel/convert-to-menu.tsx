"use client"

// «Convert to» beside the object's type in the Properties panel
// (docs/2026-11-05-quick-blocks.md, lib/convert-object.ts): the other type of
// its family; one that cannot be had greyed, with the reason under it - a
// disabled item takes no hover, so a tooltip would never show.

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { ScreenObject } from "@/components/project-editor"
import { convertTargets, type ConvertibleType } from "@/lib/convert-object"
import { objectTypeLabel } from "@/lib/object-types"

export function ConvertToMenu({
  object,
  supportedObjectTypes,
  onConvert,
}: {
  object: ScreenObject
  supportedObjectTypes?: readonly string[]
  onConvert: (type: ConvertibleType) => void
}) {
  const targets = convertTargets(object, supportedObjectTypes)
  if (targets.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs font-normal" data-testid="convert-to">
          Convert to
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Convert to</DropdownMenuLabel>
        {targets.map((t) => (
          <DropdownMenuItem
            key={t.type}
            disabled={!!t.disabled}
            data-testid={`convert-to-${t.type}`}
            className="flex flex-col items-start"
            onSelect={() => onConvert(t.type)}
          >
            <span>{objectTypeLabel(t.type)}</span>
            {t.disabled && <span className="text-xs text-muted-foreground">{t.disabled}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
