"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

interface AddTtfFontDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (font: { id: string; name: string; size: number; url: string; baselineOffset: number }) => void
  mode?: "add" | "edit"
  initialFont?: { id: string; name: string; size: number; url: string; baselineOffset?: number } | null
}

export function AddTtfFontDialog({ isOpen, onClose, onAdd, mode = "add", initialFont = null }: AddTtfFontDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [size, setSize] = useState<number>(initialFont?.size ?? 20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const objectUrlRef = useRef<string>("") // temporary object URL for preview
  const dataUrlRef = useRef<string>("") // persisted data URL for storage

  const familyName = useMemo(() => {
    const fallback = "CustomFont"
    if (file) {
      const n = file.name || fallback
      return n.replace(/\.ttf$/i, "") || fallback
    }
    if (initialFont?.name) return initialFont.name
    return fallback
  }, [file, initialFont])

  useEffect(() => {
    if (isOpen) {
      // Seed preview with existing font when editing
      if (mode === "edit" && initialFont?.url) {
        dataUrlRef.current = initialFont.url
        setSize(initialFont.size)
      }
      setError(null)
    }
  }, [isOpen, mode, initialFont])

  useEffect(() => {
    const renderPreview = async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const rootStyles = getComputedStyle(document.documentElement)
      const bgColorRaw = rootStyles.getPropertyValue("--background").trim()
      const fgColorRaw = rootStyles.getPropertyValue("--foreground").trim()
      const parseHSL = (hslString: string) => {
        const match = hslString.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/)
        if (match) {
          return `hsl(${match[1]}, ${match[2]}%, ${match[3]}%)`
        }
        return hslString
      }
      const bgColor = bgColorRaw.includes(" ") ? parseHSL(bgColorRaw) : bgColorRaw || "#ffffff"
      const fgColor = fgColorRaw.includes(" ") ? parseHSL(fgColorRaw) : fgColorRaw || "#000000"

      const previewText = "Fröhliche Kühe hüpfen über blühende Äcker – völlig überrascht vom Ölpreis!"

      try {
        setError(null)
        if (file) {
          setLoading(true)

          // Build preview object URL and persisted data URL from local file
          let ttfArrayBuffer: ArrayBuffer | null = null
          if (file.name.toLowerCase().endsWith(".zip")) {
            // @ts-ignore dynamic import available in Next.js client
            const JSZip = (await import("jszip")).default
            const zip = await JSZip.loadAsync(file)
            const ttfEntry = Object.values(zip.files).find((f: any) => !f.dir && f.name.toLowerCase().endsWith(".ttf")) as any
            if (!ttfEntry) throw new Error("No TTF found in zip")
            ttfArrayBuffer = await ttfEntry.async("arraybuffer")
          } else {
            ttfArrayBuffer = await file.arrayBuffer()
          }
          const ttfBlob = new Blob([ttfArrayBuffer!], { type: "font/ttf" })
          // Clean previous object URL
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = ""
          }
          const previewUrl = URL.createObjectURL(ttfBlob)
          objectUrlRef.current = previewUrl
          // Create persisted data URL
          const buffer = new Uint8Array(ttfArrayBuffer!)
          let binary = ""
          for (let i = 0; i < buffer.byteLength; i++) binary += String.fromCharCode(buffer[i])
          const base64 = btoa(binary)
          dataUrlRef.current = `data:font/ttf;base64,${base64}`

          const ff = new FontFace(familyName, `url(${previewUrl})`)
          await ff.load()
          ;(document as any).fonts.add(ff)
        } else if (mode === "edit" && initialFont?.url) {
          // Load existing font for preview when no new file selected
          try {
            const ff = new FontFace(familyName, `url(${initialFont.url})`)
            await ff.load()
            ;(document as any).fonts.add(ff)
            dataUrlRef.current = initialFont.url
          } catch (e) {
            // ignore preview load error
          }
        }

        // Render preview such that the actual glyph pixel height equals the selected size
        const padding = 16
        const dpr = (window.devicePixelRatio || 1)

        // Step 1: start at requested size and measure ascent+descent
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.font = `${size}px ${familyName}`
        let mt = ctx.measureText(previewText)
        const asc = (mt as any).actualBoundingBoxAscent || size * 0.8
        const desc = (mt as any).actualBoundingBoxDescent || size * 0.2
        const heightAtSize = asc + desc

        // Step 2: compute correction so pixel height == size
        const correction = size / Math.max(1, heightAtSize)
        const correctedFontPx = Math.max(1, size * correction)

        // Re-measure width at corrected size (this scales width naturally)
        ctx.font = `${correctedFontPx}px ${familyName}`
        mt = ctx.measureText(previewText)

        // Set canvas backing store with DPR for crispness
        const cssWidth = Math.max(400, Math.ceil(mt.width + padding * 2))
        const cssHeight = Math.ceil(size + padding * 2)
        canvas.width = Math.ceil(cssWidth * dpr)
        canvas.height = Math.ceil(cssHeight * dpr)
        // Fit canvas inside container while preserving aspect ratio
        // Do NOT scale the preview by container width; clip instead. Keep CSS size = intrinsic size
        // so the painted text height matches the selected px value. Parent has overflow:hidden.
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
        canvas.style.boxSizing = "border-box"
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        // Background
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, cssWidth, cssHeight)
        // Clip to canvas area to prevent overflow
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, cssWidth, cssHeight)
        ctx.clip()

        // Draw text with corrected size and baseline placement
        ctx.fillStyle = fgColor
        ctx.textBaseline = "alphabetic"
        ctx.font = `${correctedFontPx}px ${familyName}`
        // Ensure exact painted height via pixel-scan top alignment
        const temp = document.createElement("canvas")
        const tctx = temp.getContext("2d")!
        temp.width = Math.ceil((mt.width + padding * 2) * dpr)
        temp.height = Math.ceil((size + padding * 2) * dpr)
        tctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        tctx.fillStyle = "#000"
        tctx.textBaseline = "alphabetic"
        tctx.font = `${correctedFontPx}px ${familyName}`
        tctx.fillText(previewText, padding, padding + size)
        const idata = tctx.getImageData(0, 0, temp.width, temp.height)
        let minY = idata.height, maxY = -1
        for (let y = 0; y < idata.height; y++) {
          const row = y * idata.width * 4
          for (let x = 0; x < idata.width; x++) {
            if (idata.data[row + x * 4 + 3] !== 0) {
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }
        const painted = maxY >= minY ? maxY - minY + 1 : size * dpr
        const delta = size * dpr - painted
        const baseline = padding + size + (-delta / dpr)
        ctx.fillText(previewText, padding, baseline)
        ctx.restore()
      } catch (e: any) {
        setError("Failed to load font preview")
        const padding = 16
        canvas.width = 520
        canvas.height = size + padding * 2
        ctx.fillStyle = "#fff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = "#e11d48"
        ctx.font = "12px sans-serif"
        ctx.fillText("Preview error - check URL", 10, 24)
      } finally {
        setLoading(false)
      }
    }

    // Debounce a bit to avoid too many loads
    const id = setTimeout(() => {
      if (isOpen) void renderPreview()
    }, 150)
    return () => clearTimeout(id)
  }, [file, size, familyName, isOpen])

  const canAdd = (mode === "edit" ? !!(file || initialFont) : !!file) && size >= 3 && size <= 72 && !loading

  const handleAdd = () => {
    if (!canAdd) return
    const finalUrl = dataUrlRef.current
    
    // Calculate baseline offset (ascent) for this font at this size
    const tempCanvas = document.createElement("canvas")
    const tempCtx = tempCanvas.getContext("2d")!
    tempCtx.font = `${size}px ${familyName}`
    const metrics = tempCtx.measureText("Hg")
    const baselineOffset = (metrics as any).actualBoundingBoxAscent || size * 0.8
    
    console.log(`[Font Metrics] ${familyName} at ${size}px: baselineOffset=${baselineOffset.toFixed(2)}px`)
    
    // In edit mode, preserve the id; in add mode, leave id empty for caller to assign
    onAdd({ 
      id: mode === "edit" && initialFont ? initialFont.id : "", 
      name: familyName, 
      size, 
      url: finalUrl,
      baselineOffset 
    })
    onClose()
    // reset fields
    setTimeout(() => {
      setFile(null)
      setSize(20)
      setError(null)
      setLoading(false)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ""
      dataUrlRef.current = ""
    }, 0)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[min(90vw,40rem)] max-h-[85vh] grid grid-rows-[auto,1fr,auto] overflow-hidden">
        <DialogHeader className="flex items-center justify-between gap-2 p-6 border-b">
          <DialogTitle className="text-lg font-semibold">{mode === "edit" ? "Edit Font" : "Add TTF Font"}</DialogTitle>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ring-offset-background focus:ring-ring rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </DialogHeader>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex gap-4 items-end pr-2">
            <div className="w-[360px] shrink-0">
              <Label htmlFor="ttfFile" className="text-sm font-medium">Upload TTF (or ZIP)</Label>
              <Input id="ttfFile" type="file" accept=".ttf,.zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="w-28 shrink-0 mr-1">
              <Label className="text-sm font-medium">Size</Label>
              <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 72 - 3 + 1 }, (_, i) => 3 + i).map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full">
            <div ref={previewContainerRef} className="border rounded-md bg-muted/40 p-4 overflow-hidden w-full h-28">
              <canvas ref={canvasRef} className="block w-full h-full" style={{ boxSizing: "border-box" }} />
              {error && <div className="text-xs text-destructive mt-2">{error}</div>}
            </div>
          </div>
        </div>

        <DialogFooter className="bg-background border-t p-4 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!canAdd}>Add Font</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

