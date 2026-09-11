"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const Search = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

import type { ProjectAsset } from "./project-editor"
import { searchIcons as searchIconsShared, fetchIconSvgData, type IconMatch } from "@/lib/icon-search"

type IconData = IconMatch

interface IconSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectIcon: (assetId: string, iconName: string) => void // Added iconName parameter
  existingAssets: ProjectAsset[]
  onAddAsset: (asset: ProjectAsset) => void
  nextId: number // Added nextId prop
  onIncrementNextId: () => void // Added callback to increment nextId
}

export function IconSelectorModal({
  isOpen,
  onClose,
  onSelectIcon,
  existingAssets,
  onAddAsset,
  nextId, // Receive nextId
  onIncrementNextId, // Receive increment callback
}: IconSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [icons, setIcons] = useState<IconData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const searchIcons = useCallback(async (query: string) => {
    if (!query.trim()) {
      setIcons([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      setIcons(await searchIconsShared(query, 50))
    } catch (err) {
      setError("Failed to load icons. Please try again.")
      console.error("[v0] Icon search error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchIcons(searchTerm)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, searchIcons])

  // An icon from this computer, for the icons Iconify does not have: a
  // vehicle's own logo, a symbol from a manual, anything drawn in-house.
  //
  // SVG only, and that is not an arbitrary restriction. Everything downstream
  // of an "icon" asset assumes it - the tint (svg-utils.ts rewrites fill
  // attributes in the markup), the rasteriser that bakes it at the object's
  // size, and the device's own bitmap. A PNG would survive none of those.
  //
  // Stored exactly the way a fetched icon is (lib/icon-search.ts's
  // fetchIconSvgData), so nothing after this point can tell the two apart.
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    // Some systems report an empty type for .svg, so the extension counts too.
    const looksLikeSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
    if (!looksLikeSvg) {
      setError("That is not an SVG. Icons have to be SVG so they can be recoloured and rendered at any size.")
      return
    }
    // Generous for a stencil, and a guard against someone picking a huge
    // traced drawing that would bloat every export it appears in.
    if (file.size > 1024 * 1024) {
      setError("That SVG is larger than 1MB. An icon should be a small stencil.")
      return
    }

    try {
      const svgText = (await file.text()).trim()
      if (!/<svg[\s>]/i.test(svgText)) {
        setError("That file does not contain an <svg> element.")
        return
      }

      let data: string
      try {
        data = `data:image/svg+xml;base64,${btoa(svgText)}`
      } catch {
        // btoa throws on non-Latin-1 content; URL-encoding always works.
        data = `data:image/svg+xml,${encodeURIComponent(svgText)}`
      }

      const name = file.name.replace(/\.svg$/i, "")
      const existing = existingAssets.find((asset) => asset.type === "icon" && asset.data === data)
      if (existing) {
        // The same file picked twice is the same icon - reuse it rather than
        // growing the project with a byte-identical second copy.
        onSelectIcon(existing.id, existing.name)
        onClose()
        return
      }

      const newAsset: ProjectAsset = { id: `icon-${nextId}`, name, type: "icon", data, size: svgText.length }
      onAddAsset(newAsset)
      onIncrementNextId()
      onSelectIcon(newAsset.id, newAsset.name)
      setError(null)
      onClose()
    } catch (err) {
      console.error("[IconSelector] upload failed:", err)
      setError("Could not read that file.")
    }
  }

  const handleIconSelect = async (icon: IconData) => {
    try {

      // Check if icon already exists in assets
      const existingAsset = existingAssets.find((asset) => asset.type === "icon" && asset.name === icon.name)

      if (existingAsset) {
        onSelectIcon(existingAsset.id, existingAsset.name)
        onClose()
        return
      }

      const { data, size } = await fetchIconSvgData(icon)
      const newAsset: ProjectAsset = {
        id: `icon-${nextId}`,
        name: icon.name,
        type: "icon",
        data,
        size,
      }

      onAddAsset(newAsset)
      onIncrementNextId() // Increment nextId after creating asset

      onSelectIcon(newAsset.id, newAsset.name)
      onClose()
    } catch (err) {
      console.error("[v0] Failed to select icon:", err)
      setError(`Failed to select icon: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const renderIcon = (icon: IconData) => {
    return (
      <img
        src={icon.svgUrl || "/placeholder.svg"}
        alt={icon.name}
        className="w-6 h-6"
        style={{ filter: "brightness(0) saturate(100%)" }} // Make icons black for better visibility
      />
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Select Icon</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for icons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              onChange={handleUpload}
              className="hidden"
              data-testid="icon-upload"
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} title="Use an SVG from this computer">
              Upload SVG
            </Button>
          </div>

          {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">{error}</div>}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Searching icons...</span>
            </div>
          )}

          {!loading && searchTerm && icons.length === 0 && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-sm">No icons found for "{searchTerm}"</div>
              <div className="text-xs mt-1">Try a different search term</div>
            </div>
          )}

          {!loading && !searchTerm && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-sm">Enter a search term to find icons</div>
              <div className="text-xs mt-1">Try searching for "home", "user", "settings", etc.</div>
            </div>
          )}

          {icons.length > 0 && (
            <ScrollArea className="h-96">
              <div className="grid grid-cols-6 gap-3 p-2">
                {icons.map((icon) => (
                  <Button
                    key={icon.name}
                    variant="outline"
                    className="h-16 w-16 p-2 hover:bg-accent bg-transparent"
                    onClick={() => handleIconSelect(icon)}
                    title={icon.name}
                  >
                    {renderIcon(icon)}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
