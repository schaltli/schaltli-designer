"use client"

// The options step between picking a catalog entry in the Block menu and
// dragging its rectangle (docs/2026-09-30-block-discovery.md): how the entry
// is to look, and its icon. Insert arms the Block tool; the rectangle dragged
// next places the block.
//
// The entry comes from the broker's discovery configs (lib/ha-discovery.ts),
// so there is nothing left to ask about which instance it is - the entity is
// the instance, and its name is the label.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchIconSvgData, loadIcons, searchIcons, suggestIcon, type IconMatch } from "@/lib/icon-search"
import { catalogLooks, lookSupported, type BausteinOptions } from "@/lib/bausteine"
import { readTopicsOf, type CatalogEntry } from "@/lib/ha-discovery"
import { useRetainedValues } from "@/hooks/use-block-catalog"
import { splitTopicPath, extractJsonField } from "@/lib/json-path"
import { cn } from "@/lib/utils"

interface BausteinDialogProps {
  entry: CatalogEntry | null
  /** What the device draws; a look needing anything else is greyed out. */
  supportedObjectTypes?: string[]
  onCancel: () => void
  /** The options, and what the broker holds on the entry's topics. */
  onConfirm: (options: BausteinOptions, values: Record<string, string>) => void
}

export function BausteinDialog({ entry, supportedObjectTypes, onCancel, onConfirm }: BausteinDialogProps) {
  const [options, setOptions] = useState<BausteinOptions | null>(null)
  // The icon is suggested once the entry is picked: the one its config names,
  // else a search on its name. A pick by hand wins over a suggestion still on
  // its way.
  const [iconStatus, setIconStatus] = useState<"searching" | "done" | "failed">("done")
  const [iconSearch, setIconSearch] = useState<{ query: string; results: IconMatch[] } | null>(null)
  const iconRequestRef = useRef(0)
  // Read while the options are chosen: the placed block's first examples.
  const values = useRetainedValues(entry ? readTopicsOf([entry]) : null)

  useEffect(() => {
    iconRequestRef.current++
    setIconSearch(null)
    if (!entry) {
      setOptions(null)
      return
    }
    const control = entry.controls[0]
    const look = catalogLooks(control).find((l) => lookSupported(l, supportedObjectTypes)) ?? catalogLooks(control)[0]
    setOptions({ label: entry.name, look: look.id, icon: null })

    const request = iconRequestRef.current
    setIconStatus("searching")
    const suggestion = entry.icon
      ? loadIcons([entry.icon]).then(async (found) => {
          const match = found.get(entry.icon!)
          return match ? { name: match.name, ...(await fetchIconSvgData(match)) } : null
        })
      : suggestIcon([entry.name])
    suggestion
      .then((icon) => {
        if (request !== iconRequestRef.current) return
        setOptions((current) => (current ? { ...current, icon } : current))
        setIconStatus("done")
      })
      .catch(() => {
        if (request === iconRequestRef.current) setIconStatus("failed")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  if (!entry || !options) return null
  const control = entry.controls[0]
  const looks = catalogLooks(control)

  const setIcon = (icon: BausteinOptions["icon"]) => {
    iconRequestRef.current++
    setIconStatus("done")
    setOptions({ ...options, icon })
  }
  const runIconSearch = (query: string) => {
    setIconSearch({ query, results: iconSearch?.results ?? [] })
    if (query.trim().length < 2) return
    searchIcons(query, 12)
      .then((results) => setIconSearch((current) => (current && current.query === query ? { query, results } : current)))
      .catch(() => setIconSearch((current) => (current && current.query === query ? { query, results: [] } : current)))
  }
  const topics = [
    "read" in control && control.read ? control.read : undefined,
    "write" in control ? control.write : undefined,
  ].filter((t): t is string => !!t)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert {entry.name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border border-border px-3 py-2" data-testid="baustein-chosen">
          <div className="text-sm font-medium">{entry.name}</div>
          {topics.map((topic) => {
            // What it holds now, where the broker retained it: the entry is live.
            const { topic: base, path } = splitTopicPath(topic)
            const now = values[base] === undefined ? undefined : path ? extractJsonField(values[base], path) : values[base]
            return (
              <div key={topic} className="text-xs text-muted-foreground font-mono truncate">
                {topic}
                {now !== undefined && <span data-testid="baustein-value">: {now}</span>}
              </div>
            )
          })}
        </div>

        {looks.length > 1 && (
          <Choice label="Look">
            {looks.map((look) => {
              const supported = lookSupported(look, supportedObjectTypes)
              return (
                <ChoiceButton
                  key={look.id}
                  testId={`baustein-look-${look.id}`}
                  selected={options.look === look.id}
                  disabled={!supported}
                  title={supported ? undefined : `This device does not draw a ${look.label}.`}
                  onClick={() => setOptions({ ...options, look: look.id })}
                >
                  {look.label}
                </ChoiceButton>
              )
            })}
          </Choice>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Icon</span>
          <div className="flex items-center gap-2" data-testid="baustein-icon">
            {options.icon ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={options.icon.data} alt="" className="h-6 w-6 dark:invert" data-testid="baustein-icon-preview" />
                <span className="text-xs font-mono text-muted-foreground truncate">{options.icon.name}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground" data-testid="baustein-icon-status">
                {iconStatus === "searching"
                  ? "Looking for an icon ..."
                  : iconStatus === "failed"
                    ? "No icon: the icon service did not answer."
                    : "No icon"}
              </span>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant="outline" size="sm" onClick={() => runIconSearch(iconSearch?.query ?? "")}>
                Change...
              </Button>
              <Button variant="outline" size="sm" disabled={!options.icon} onClick={() => setIcon(null)}>
                None
              </Button>
            </div>
          </div>
          {iconSearch && (
            <div className="flex flex-col gap-1">
              <Input
                autoFocus
                aria-label="Search icons"
                placeholder="Search icons, e.g. water"
                value={iconSearch.query}
                onChange={(e) => runIconSearch(e.target.value)}
                className="h-8"
              />
              <div className="flex flex-wrap gap-1">
                {iconSearch.results.map((match) => (
                  <button
                    key={match.name}
                    type="button"
                    title={match.name}
                    data-testid={`baustein-icon-option-${match.name}`}
                    className="rounded border border-border p-1 hover:bg-accent"
                    onClick={() =>
                      fetchIconSvgData(match)
                        .then(({ data, size }) => {
                          setIcon({ name: match.name, data, size })
                          setIconSearch(null)
                        })
                        .catch(() => setIconStatus("failed"))
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={match.svgUrl} alt={match.name} className="h-6 w-6 dark:invert" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" data-testid="baustein-insert" onClick={() => onConfirm(options, values)}>
            Insert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// A row of mutually exclusive buttons, the chosen one filled. A look the
// device cannot draw stays in the row, disabled, with the reason as its
// tooltip.
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function ChoiceButton({
  testId,
  selected,
  disabled,
  title,
  onClick,
  children,
}: {
  testId: string
  selected: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={testId}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1 text-sm",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  )
}
