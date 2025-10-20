"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface PixelOffsetTestProps {
  open: boolean
  onClose: () => void
}

export function PixelOffsetTest({ open, onClose }: PixelOffsetTestProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open) return

    // Add a small delay to ensure the dialog is fully rendered
    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) {
        console.log("[PixelTest] Canvas ref is null")
        return
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        console.log("[PixelTest] Could not get 2d context")
        return
      }

      console.log("[PixelTest] Drawing canvas...")

      // Set canvas size
      canvas.width = 1200
      canvas.height = 1200

      // Clear canvas with white background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Disable image smoothing
      ctx.imageSmoothingEnabled = false

      // Test grid: 10x10 grid of test pixels
      // Each cell tests a different sub-pixel offset from 0.0 to 0.9 in both X and Y
      const cellSize = 100 // Each test cell is 100x100 pixels
      const pixelSize = 1 // Size of the test pixel

      let testIndex = 0
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          const offsetX = col * 0.1 // 0.0, 0.1, 0.2, ... 0.9
          const offsetY = row * 0.1 // 0.0, 0.1, 0.2, ... 0.9

          const cellX = col * cellSize
          const cellY = row * cellSize

          // Draw cell border
          ctx.strokeStyle = "#e0e0e0"
          ctx.lineWidth = 1
          ctx.strokeRect(cellX, cellY, cellSize, cellSize)

          // Draw label showing the offset - make it bigger and more visible
          ctx.fillStyle = "#000000" // Black text for better visibility
          ctx.font = "bold 14px monospace" // Bigger, bolder font
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(`${offsetX.toFixed(1)}, ${offsetY.toFixed(1)}`, cellX + cellSize/2, cellY + 20)

          // Draw a SINGLE test pixel in the center of each cell
          ctx.fillStyle = "#000000"
          const centerX = cellX + cellSize / 2 + offsetX
          const centerY = cellY + cellSize / 2 + offsetY
          ctx.fillRect(centerX, centerY, pixelSize, pixelSize)

          testIndex++
        }
      }

      // Draw instructions
      ctx.fillStyle = "#000000"
      ctx.font = "14px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(
        "Each cell shows pixels drawn with a different sub-pixel offset (X, Y)",
        canvas.width / 2,
        canvas.height - 10
      )
      ctx.fillText(
        "Find the cell with the crispest pixels - that's the optimal offset!",
        canvas.width / 2,
        canvas.height - 30
      )
      
      console.log("[PixelTest] Canvas drawing completed")
    }, 100) // Small delay to ensure dialog is rendered

    return () => clearTimeout(timer)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[1300px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Pixel Offset Test - Find the Crispest Rendering</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>
              This test displays a 10x10 grid of cells, each testing a different sub-pixel offset from 0.0 to 0.9.
            </p>
            <p>
              Look for the cell where the pixels appear <strong>crispest</strong> (not blurry or anti-aliased).
            </p>
            <p>The label in each cell shows the X and Y offset values (e.g., "0.5, 0.5").</p>
          </div>
          <canvas
            ref={canvasRef}
            width={1200}
            height={1200}
            style={{
              border: "1px solid #ccc",
              display: "block",
              maxWidth: "100%",
              height: "auto",
              imageRendering: "pixelated",
            }}
          />
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

