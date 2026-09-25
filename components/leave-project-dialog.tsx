"use client"

/**
 * Asked before an unsaved project is left inside the designer - for New
 * Project, opening another project, Upload Project
 * (docs/2026-09-23-explicit-save.md, "Leaving an unsaved project"). Closing
 * or reloading the tab is the browser's own "leave site?" instead.
 */

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type LeaveChoice = "save" | "discard" | "cancel"

interface LeaveProjectDialogProps {
  open: boolean
  projectName: string
  onChoice: (choice: LeaveChoice) => void
}

export function LeaveProjectDialog({ open, projectName, onChoice }: LeaveProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onChoice("cancel")}>
      <DialogContent className="sm:max-w-md *:min-w-0">
        <DialogHeader>
          <DialogTitle>Save changes to &quot;{projectName}&quot;?</DialogTitle>
          <DialogDescription>Your changes are lost if you don&apos;t save them.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onChoice("cancel")}>
            Cancel
          </Button>
          {/* A plain string, not Don&apos;t: the handbook quotes this label,
              and e2e/handbook-labels.spec.ts looks for it as written. */}
          <Button variant="outline" onClick={() => onChoice("discard")}>
            {"Don't Save"}
          </Button>
          <Button onClick={() => onChoice("save")} autoFocus>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
