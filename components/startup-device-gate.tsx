"use client"

import { Button } from "@/components/ui/button"
import { RecoverProjectDialog } from "@/components/recover-project-dialog"
import { AlertTriangle, FilePlus2, LifeBuoy, Upload } from "lucide-react"
import { HANDBOOK_URL } from "@/lib/handbook"

// The start page, shown while no project is open. Since 2026-09-24 it no
// longer offers the device choice itself: New Project opens the two-step
// dialog (new-project-dialog.tsx, device then name) that File > New Project
// opens too (docs/2026-09-23-explicit-save.md).
interface StartupDeviceGateProps {
  // Opens the New Project dialog.
  onNewProject: () => void
  // Reuses the app's existing project-upload flow (file picker + parsing).
  onUploadProject: () => void | Promise<void>
  // Reuses the same file-parsing/device-resolution logic as onUploadProject,
  // fed a synthetic File built from a device's own retained recovery copy
  // instead of one from a file picker - see recover-project-dialog.tsx's
  // header comment for the full chain this closes.
  onRecoverProject: (file: File) => void | Promise<void>
  // Set by the parent when an upload referenced a device that isn't
  // available on this instance, or the address named no project, so the
  // reason stays visible here.
  error: string | null
  // The projects on this server (project-list.tsx), the same list the
  // editor's Projects panel shows.
  projects: React.ReactNode
}

export function StartupDeviceGate({
  onNewProject,
  onUploadProject,
  onRecoverProject,
  error,
  projects,
}: StartupDeviceGateProps) {
  return (
    // z-40, not higher: Radix popper content (Select dropdowns etc.) renders via
    // portal at z-50. This gate replaces the whole app (early return, nothing
    // else is mounted), so it never needs to sit above that - it only needs to
    // cover the page background, and must stay below z-50 or its own dropdowns
    // render invisibly underneath it.
    <div className="fixed inset-0 z-40 bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Welcome to Schaltli</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Every project is tied to a device. Start a new project for a device, or open an existing project file -
            its device will be loaded automatically.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            New here?{" "}
            <a href={HANDBOOK_URL} target="_blank" rel="noreferrer" className="underline" data-testid="handbook-link">
              Read the handbook
            </a>
            .
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FilePlus2 className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Choose a device, name the project, and start designing.</p>
          </div>
          <Button onClick={onNewProject} className="shrink-0">
            New Project...
          </Button>
        </div>

        <section aria-label="Saved projects on this server" className="border border-border rounded-lg mt-4">
          <h2 className="text-sm font-medium text-foreground px-4 pt-3 pb-1">Projects</h2>
          <div className="max-h-80 overflow-y-auto">{projects}</div>
        </section>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Open an existing project file. Its device must be available on this instance.
            </p>
          </div>
          <Button variant="outline" onClick={() => onUploadProject()} className="shrink-0">
            Choose File...
          </Button>
        </div>

        {/* Talks to a real broker on the local network - the same risk
            profile as "Deploy to Device", gated behind the same flag, off on
            the public demo instance. */}
        {process.env.NEXT_PUBLIC_DEPLOY_ENABLED === "true" && (
          <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-4 mt-4">
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Lost the project file? Pull the last deployed copy back from the device itself.
              </p>
            </div>
            <RecoverProjectDialog onRecoverProject={onRecoverProject}>
              <Button variant="outline" className="shrink-0">
                Recover from Device...
              </Button>
            </RecoverProjectDialog>
          </div>
        )}
      </div>
    </div>
  )
}
