"use client"

/**
 * File > Save as Template (lib/templates.ts): the open project as a template,
 * offered by New Project from then on for the device it is made for. It
 * shows the templates already there for this device. A name of one of the
 * user's own asks «Replace "…"?» first; a template that comes with the
 * designer is never replaced.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkProjectName, sameProjectName } from "@/lib/project-name"
import type { TemplateSummary } from "@/lib/templates"

interface SaveTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: { name?: string; settings?: { deviceId?: string; deviceName?: string } } & Record<string, unknown>
  onSaved: (name: string) => void
}

async function failure(res: Response, fallback: string): Promise<Error> {
  return new Error((await res.json().catch(() => null))?.error ?? fallback)
}

export function SaveTemplateDialog({ open, onOpenChange, project, onSaved }: SaveTemplateDialogProps) {
  const deviceId = project.settings?.deviceId
  const [name, setName] = useState("")
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(project.name ?? "")
    setSaveError(null)
    setConfirmReplace(null)
    setTemplates(null)
    fetch(`/api/templates?device=${encodeURIComponent(deviceId ?? "")}`)
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]))
    // Only when it opens: the name typed stays while the project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const check = checkProjectName(name)
  const existing = check.ok ? templates?.find((t) => sameProjectName(t.name, check.name)) : undefined
  const problem =
    !check.ok && name.trim() !== ""
      ? check.reason
      : existing?.shipped
        ? `"${existing.name}" comes with the designer. Choose another name.`
        : null

  const save = async () => {
    if (!check.ok || problem || saving || templates === null || !deviceId) return
    if (existing && confirmReplace !== existing.name) {
      setConfirmReplace(existing.name)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) {
        const res = await fetch(`/api/templates/${encodeURIComponent(existing.name)}`, { method: "DELETE" })
        if (!res.ok) throw await failure(res, "Could not replace the template")
      }
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Without what the template leaves to the device: fonts and its description are megabytes.
        body: JSON.stringify({ name: check.name, project: { ...project, fonts: undefined, embeddedDdfZipBase64: undefined } }),
      })
      if (!res.ok) throw await failure(res, "Could not save the template")
      onSaved((await res.json()).name)
      onOpenChange(false)
    } catch (error) {
      setConfirmReplace(null)
      setSaveError(error instanceof Error ? error.message : "Could not save the template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md *:min-w-0">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            New Project offers it for the {project.settings?.deviceName ?? "same device"}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="space-y-2"
        >
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setConfirmReplace(null)
            }}
            autoFocus
            aria-invalid={problem !== null}
            aria-describedby="template-name-problem"
          />
          <p id="template-name-problem" role="alert" className="text-sm text-destructive min-h-5">
            {!deviceId ? "The project has no device." : (problem ?? saveError)}
          </p>
          {templates && templates.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Templates for this device</div>
              <ul className="max-h-40 overflow-y-auto rounded-md border text-sm">
                {templates.map((t) => (
                  <li key={t.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setName(t.name)
                        setConfirmReplace(null)
                      }}
                      disabled={t.shipped}
                      className="w-full text-left px-2 py-1 hover:bg-accent disabled:text-muted-foreground disabled:hover:bg-transparent"
                    >
                      {t.name}
                      {t.shipped && <span className="ml-2 text-xs">comes with the designer</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!check.ok || !!problem || saving || templates === null || !deviceId}
            variant={confirmReplace ? "destructive" : "default"}
          >
            {saving ? "Saving..." : confirmReplace ? `Replace "${confirmReplace}"` : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
