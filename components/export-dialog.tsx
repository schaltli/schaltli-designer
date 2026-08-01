"use client"

import type React from "react"
import { useState } from "react"
import type { ScreenmanProject } from "./screenman-editor"
import { buildDeviceProjectZip } from "@/lib/project-zip"
import { exportAndroidProject } from "@/lib/android-export"

interface ExportDialogProps {
  project: ScreenmanProject
  children: React.ReactNode
}

export function ExportDialog({ project, children }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (isExporting) return

    // Android-platform devices get a generic JSON + PNG bundle instead of
    // the firmware-specific BMP/PBM + project.json path below - there's no
    // firmware repo consuming it, so none of that quantization/upload-
    // format logic applies. See lib/android-export.ts.
    if (project.settings.devicePlatform === "android") {
      try {
        setIsExporting(true)
        const zipBlob = await exportAndroidProject(project)
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${project.name || "screensmith-project"}-android.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error("Android export failed:", error)
        alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      } finally {
        setIsExporting(false)
      }
      return
    }

    try {
      setIsExporting(true)

      const zipBlob = await buildDeviceProjectZip(project)

      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${project.name || "screensmith-project"}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      console.log('Export complete!')
      setIsExporting(false)
      
    } catch (error) {
      console.error("Export failed:", error)
      alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsExporting(false)
    }
  }

  return (
    <div onClick={handleExport} style={{ display: 'inline-block', cursor: isExporting ? 'wait' : 'pointer' }}>
      {children}
    </div>
  )
}
