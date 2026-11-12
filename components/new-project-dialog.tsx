"use client"

/**
 * New Project (docs/2026-09-23-explicit-save.md, "A project's life"): two
 * steps - the device type, then the name - opened from the start page and
 * from File > New Project. Create Project saves the new project as its first
 * version, so it exists on the server, under its name, from the start.
 *
 * A name another project has is refused here rather than offered for
 * replacing: a new, empty project replacing an existing one would bury its
 * work under an empty version.
 *
 * For a device a starter is made for (lib/starters.ts), the name step also
 * asks what to start with: an empty project, or the starter.
 */

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DeviceChooser } from "@/components/device-chooser"
import { checkProjectName, sameProjectName } from "@/lib/project-name"
import { startersFor } from "@/lib/starters"
import type { ProjectListEntry } from "./save-project-dialog"

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Resolves once the project is created and open; rejects with the message
  // to show.
  // `starterId`: the starter chosen to begin with; none for an empty project.
  onCreate: (ddfPath: string, name: string, starterId?: string) => Promise<void>
}

export function NewProjectDialog({ open, onOpenChange, onCreate }: NewProjectDialogProps) {
  const [step, setStep] = useState<"device" | "name">("device")
  const [ddfPath, setDdfPath] = useState("")
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [starterId, setStarterId] = useState("")
  const [name, setName] = useState("")
  const [projects, setProjects] = useState<ProjectListEntry[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep("device")
    setDdfPath("")
    setDeviceId(undefined)
    setStarterId("")
    setName("")
    setCreateError(null)
  }, [open])

  // The names already taken, fetched when the name step is reached.
  useEffect(() => {
    if (!open || step !== "name") return
    setProjects(null)
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
  }, [open, step])

  const check = checkProjectName(name)
  const existing = check.ok ? projects?.find((p) => sameProjectName(p.name, check.name)) : undefined
  const problem =
    !check.ok && name.trim() !== "" ? check.reason : existing ? `"${existing.name}" already exists.` : null

  const starters = startersFor(deviceId)

  const create = async () => {
    if (!check.ok || existing || creating || projects === null) return
    setCreating(true)
    setCreateError(null)
    try {
      await onCreate(ddfPath, check.name, starters.some((st) => st.id === starterId) ? starterId : undefined)
      onOpenChange(false)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the project")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      {/* DialogContent is a grid; *:min-w-0 keeps the device carousels and
          long names from widening its rows past the dialog. */}
      <DialogContent
        className={step === "device" ? "sm:max-w-3xl max-h-[90vh] overflow-y-auto *:min-w-0" : "sm:max-w-md *:min-w-0"}
      >
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            {step === "device" ? "Choose the device this project is for." : "Name the project."}
          </DialogDescription>
        </DialogHeader>

        {step === "device" ? (
          <>
            <DeviceChooser
              selectedDdfPath={ddfPath}
              onSelect={(path, id) => {
                setDdfPath(path)
                setDeviceId(id)
              }}
              onOpen={(path, id) => {
                setDdfPath(path)
                setDeviceId(id)
                setStep("name")
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("name")} disabled={!ddfPath}>
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
              className="space-y-2"
            >
              <Label htmlFor="new-project-name">Name</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                aria-invalid={problem !== null}
                aria-describedby="new-project-name-problem"
              />
              <p id="new-project-name-problem" role="alert" className="text-sm text-destructive min-h-5">
                {problem ?? createError}
              </p>
              {starters.length > 0 && (
                <fieldset className="space-y-2 pt-1">
                  <legend className="text-sm font-medium leading-none mb-2">Start with</legend>
                  {[{ id: "", label: "Empty" }, ...starters].map((choice) => (
                    <label key={choice.id || "empty"} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="new-project-start"
                        value={choice.id}
                        checked={starterId === choice.id}
                        onChange={() => setStarterId(choice.id)}
                      />
                      {choice.label}
                    </label>
                  ))}
                </fieldset>
              )}
            </form>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => setStep("device")} disabled={creating}>
                Back
              </Button>
              <Button onClick={() => void create()} disabled={!check.ok || !!existing || creating || projects === null}>
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
