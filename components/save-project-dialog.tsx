"use client"

/**
 * The Save dialog (docs/2026-09-23-explicit-save.md, "Save dialog"): asks
 * for the name a project is saved under - the first time it is saved, and on
 * every Save As. It shows the projects already on the server, like a file
 * dialog shows the folder, so a name is chosen knowing what is there.
 * Clicking one puts its name in the field; saving under a name that exists
 * asks «Replace "…"?» first. Replacing adds a version to that project, so its
 * earlier versions stay - as git keeps a file's history when it gets
 * entirely new content.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkProjectName, sameProjectName } from "@/lib/project-name"
import { Loader2 } from "lucide-react"

export interface ProjectListEntry {
  name: string
  deviceName: string | null
  savedAt: string
  deployedTo?: string
}

// Where a save goes: a new project, or a new version of one that exists.
export type SaveTarget = { kind: "new"; name: string } | { kind: "replace"; name: string }

interface SaveProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  suggestedName: string
  // Resolves once saved; rejects with the message to show.
  onSave: (target: SaveTarget) => Promise<void>
}

export function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function SaveProjectDialog({ open, onOpenChange, title, suggestedName, onSave }: SaveProjectDialogProps) {
  const [name, setName] = useState(suggestedName)
  const [projects, setProjects] = useState<ProjectListEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Set while the second step asks whether to replace this project.
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(suggestedName)
    setSaveError(null)
    setConfirmReplace(null)
    setProjects(null)
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
  }, [open, suggestedName])

  const check = checkProjectName(name)
  const existing = check.ok ? projects?.find((p) => sameProjectName(p.name, check.name)) : undefined
  const problem = !check.ok && name.trim() !== "" ? check.reason : null

  const save = async (target: SaveTarget) => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(target)
      onOpenChange(false)
    } catch (error) {
      setConfirmReplace(null)
      setSaveError(error instanceof Error ? error.message : "Saving failed")
    } finally {
      setSaving(false)
    }
  }

  const submit = () => {
    if (!check.ok || saving || projects === null) return
    if (existing) setConfirmReplace(existing.name)
    else void save({ kind: "new", name: check.name })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent is a grid; *:min-w-0 keeps long project names from
          widening its rows past the dialog (they truncate instead). */}
      <DialogContent className="sm:max-w-md *:min-w-0">
        {confirmReplace !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>Replace &quot;{confirmReplace}&quot;?</DialogTitle>
              <DialogDescription>
                This project becomes the newest version of &quot;{confirmReplace}&quot;. Its earlier versions stay in
                Version History.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmReplace(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void save({ kind: "replace", name: confirmReplace })} disabled={saving}>
                {saving ? "Saving..." : "Replace"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>

            {/* A plain scrolling box, not ScrollArea: Radix's viewport wraps
                its content in a display:table that grows with the longest
                name, so `truncate` never took and rows ran out of the dialog. */}
            <div className="border border-border rounded-md">
              <div className="h-48 overflow-y-auto">
                {projects === null ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading projects...
                  </div>
                ) : projects.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No projects saved yet.</p>
                ) : (
                  <ul aria-label="Saved projects">
                    {projects.map((p) => (
                      <li key={p.name}>
                        <button
                          type="button"
                          onClick={() => setName(p.name)}
                          className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
                        >
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.deviceName ?? "Unknown device"} · {formatSavedAt(p.savedAt)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className="space-y-2"
            >
              <Label htmlFor="save-project-name">Name</Label>
              <Input
                id="save-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-invalid={problem !== null}
                aria-describedby="save-project-name-problem"
              />
              <p id="save-project-name-problem" role="alert" className="text-sm text-destructive min-h-5">
                {problem ?? saveError}
              </p>
            </form>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!check.ok || saving || projects === null}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
