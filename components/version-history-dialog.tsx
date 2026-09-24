"use client"

/**
 * The versions of the open project (docs/2026-09-23-explicit-save.md,
 * "Versions"). Every save is one; a deploy marks the version it sent. Restore
 * opens a version as unsaved changes on top of the newest one - like a
 * checkout in git: nothing is removed, and saving makes it the newest.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { Project } from "./project-editor"
import { formatSavedAt } from "./save-project-dialog"
import { History, Loader2, AlertCircle } from "lucide-react"

interface VersionEntry {
  versionId: string
  savedAt: string
  deviceName: string | null
  deployedTo?: string[]
}

interface VersionHistoryDialogProps {
  // The name the open project is saved under; null while it has none.
  projectName: string | null
  onRestoreVersion: (project: Project) => void
  children: React.ReactNode
}

const projectUrl = (name: string) => `/api/projects/${encodeURIComponent(name)}`

export function VersionHistoryDialog({ projectName, onRestoreVersion, children }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    if (!open || projectName === null) return
    setLoading(true)
    setError(null)
    fetch(`${projectUrl(projectName)}/versions`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setVersions(data.versions || []))
      .catch(() => setError("Failed to load version history"))
      .finally(() => setLoading(false))
  }, [open, projectName])

  const handleRestore = async (versionId: string) => {
    if (projectName === null) return
    setRestoring(versionId)
    try {
      const res = await fetch(`${projectUrl(projectName)}/versions/${versionId}`)
      if (!res.ok) throw new Error("Version not found")
      onRestoreVersion((await res.json()).project)
      setOpen(false)
    } catch {
      setError("Failed to restore this version")
    } finally {
      setRestoring(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
        {children}
      </div>
      <DialogContent className="max-w-lg *:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Version History
          </DialogTitle>
        </DialogHeader>

        {projectName === null ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Save the project to start its version history.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive py-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <ul className="space-y-1 pr-3" aria-label="Versions">
              {versions.map((v) => (
                <li
                  key={v.versionId}
                  className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{formatSavedAt(v.savedAt)}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.deviceName ?? "Unknown device"}
                      {v.deployedTo && ` · Deployed to ${v.deployedTo.join(", ")}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoring !== null}
                    onClick={() => handleRestore(v.versionId)}
                  >
                    {restoring === v.versionId ? <Loader2 className="w-3 h-3 animate-spin" /> : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
