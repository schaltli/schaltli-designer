"use client"

/**
 * The Save dialog (docs/2026-09-23-explicit-save.md, "Save dialog"): asks
 * for the name a project is saved under, the first time it is saved. It
 * shows the projects already on the server - like a file dialog shows the
 * folder - so a name is chosen knowing what is there. Clicking one puts its
 * name in the field.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { checkProjectName, sameProjectName } from "@/lib/project-name"
import { Loader2 } from "lucide-react"

export interface ProjectListEntry {
  name: string
  deviceName: string | null
  savedAt: string
  deployedTo?: string
}

interface SaveProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  suggestedName: string
  // Resolves once saved; rejects with the message to show.
  onSave: (name: string) => Promise<void>
}

export function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function SaveProjectDialog({ open, onOpenChange, title, suggestedName, onSave }: SaveProjectDialogProps) {
  const [name, setName] = useState(suggestedName)
  const [projects, setProjects] = useState<ProjectListEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(suggestedName)
    setSaveError(null)
    setProjects(null)
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
  }, [open, suggestedName])

  const check = checkProjectName(name)
  const existing = check.ok ? projects?.find((p) => sameProjectName(p.name, check.name)) : undefined
  const problem = !check.ok
    ? name.trim() === ""
      ? null
      : check.reason
    : existing
      ? `"${existing.name}" already exists.`
      : null

  const submit = async () => {
    if (!check.ok || existing || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(check.name)
      onOpenChange(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Saving failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="border border-border rounded-md">
          <ScrollArea className="h-48">
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
          </ScrollArea>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
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
          <Button onClick={() => void submit()} disabled={!check.ok || !!existing || saving || projects === null}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
