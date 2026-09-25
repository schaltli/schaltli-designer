"use client"

/**
 * Asks before a project is deleted from the list (decided 2026-09-25,
 * replacing "deletes at once"; docs/2026-09-23-explicit-save.md). Deleting
 * takes every version with it and nothing brings it back, so the dialog says
 * how many versions go - and by default downloads the newest one as a project
 * file first: the safety net is the default, unticked only on purpose.
 */

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DeleteProjectDialogProps {
  // The project to delete; null while the dialog is closed.
  name: string | null
  onCancel: () => void
  // Rejects with the message to show; the project then stays.
  onDelete: (name: string, backup: boolean) => Promise<void>
}

export function DeleteProjectDialog({ name, onCancel, onDelete }: DeleteProjectDialogProps) {
  const [backup, setBackup] = useState(true)
  const [versions, setVersions] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (name === null) return
    setBackup(true)
    setBusy(false)
    setError(null)
    setVersions(null)
    fetch(`/api/projects/${encodeURIComponent(name)}/versions`)
      .then((res) => (res.ok ? res.json() : { versions: [] }))
      .then((data) => setVersions((data.versions ?? []).length))
      .catch(() => setVersions(null))
  }, [name])

  const confirm = async () => {
    if (name === null || busy) return
    setBusy(true)
    setError(null)
    try {
      await onDelete(name, backup)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deleting failed")
      setBusy(false)
    }
  }

  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      {/* Radix focuses the first control on open - the checkbox. Cancel
          instead, so Enter deletes nothing. */}
      <DialogContent
        className="sm:max-w-md *:min-w-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete &quot;{name}&quot;?</DialogTitle>
          <DialogDescription>
            {versions === null
              ? "The project and all its versions are deleted."
              : `The project and all ${versions} ${versions === 1 ? "version" : "versions"} are deleted.`}{" "}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={backup}
            onChange={(e) => setBackup(e.target.checked)}
            disabled={busy}
            className="h-4 w-4"
          />
          Download latest version as a backup
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
