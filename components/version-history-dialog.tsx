"use client"

/**
 * Browse and restore server-side version checkpoints for the current
 * project (see app/api/projects/[projectId]/versions/route.ts). A
 * checkpoint is taken on every successful "Deploy to Device"
 * (deploy-dialog.tsx), not on every edit - the point is a meaningful set
 * of "what did this look like right before I sent it to device X"
 * moments, not noise.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Project } from "./project-editor"
import { History, Loader2, AlertCircle } from "lucide-react"

interface VersionEntry {
  timestamp: string
  sizeBytes: number
  projectName?: string
}

interface VersionHistoryDialogProps {
  project: Project
  onRestoreVersion: (project: Project) => void
  children: React.ReactNode
}

// Undoes filenameTimestamp()'s ":" -> "-" swap (versions/route.ts) to get
// back a real, parseable ISO string.
function parseVersionTimestamp(timestamp: string): Date {
  const iso = timestamp.replace(/-(\d{2})-(\d{2})\.(\d{3})Z$/, ":$1:$2.$3Z")
  return new Date(iso)
}

export function VersionHistoryDialog({ project, onRestoreVersion, children }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoringTimestamp, setRestoringTimestamp] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${project.settings.projectId}/versions`)
      .then((res) => res.json())
      .then((data) => setVersions(data.versions || []))
      .catch(() => setError("Failed to load version history"))
      .finally(() => setLoading(false))
  }, [open, project.settings.projectId])

  const handleRestore = async (timestamp: string) => {
    setRestoringTimestamp(timestamp)
    try {
      const res = await fetch(`/api/projects/${project.settings.projectId}/versions/${timestamp}`)
      if (!res.ok) throw new Error("Version not found")
      const restored = await res.json()
      onRestoreVersion(restored)
      setOpen(false)
    } catch {
      setError("Failed to restore this version")
    } finally {
      setRestoringTimestamp(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
        {children}
      </div>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Version History
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive py-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No checkpoints yet - one is saved automatically every time you deploy to a device.
          </p>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1 pr-3">
              {versions.map((v) => (
                <div
                  key={v.timestamp}
                  className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{v.projectName || "Untitled project"}</div>
                    <div className="text-xs text-muted-foreground">
                      {parseVersionTimestamp(v.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoringTimestamp !== null}
                    onClick={() => handleRestore(v.timestamp)}
                  >
                    {restoringTimestamp === v.timestamp ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Restore"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
