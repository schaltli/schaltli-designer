"use client"

import { useState, useEffect, useCallback } from "react"
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for icons..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
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
