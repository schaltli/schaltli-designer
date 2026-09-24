"use client"

/**
 * The Projects panel, far left of the editor (docs/2026-09-23-explicit-save.md,
 * "Projects panel"): the project list, and New Project. Collapsible to a
 * narrow strip; whether it is collapsed is remembered in this browser, as the
 * right panel's width is - a per-viewer convenience, not project data.
 */

import { useEffect, useState, type ComponentProps } from "react"
import { Button } from "@/components/ui/button"
import { FilePlus2, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { ProjectList } from "./project-list"

const COLLAPSED_KEY = "schaltli.projectsPanelCollapsed"

type ProjectsPanelProps = ComponentProps<typeof ProjectList> & {
  onNewProject: () => void
}

export function ProjectsPanel({ onNewProject, ...listProps }: ProjectsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true")
    } catch {
      // No storage (private window, blocked): open, the default.
    }
  }, [])

  const toggle = (next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Not remembered then; the panel still works.
    }
  }

  if (collapsed) {
    return (
      <div className="w-9 shrink-0 border-r border-border bg-card flex flex-col items-center py-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Show projects" onClick={() => toggle(false)}>
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <aside aria-label="Projects panel" className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
      <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Projects</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New Project" title="New Project" onClick={onNewProject}>
            <FilePlus2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Hide projects" onClick={() => toggle(true)}>
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ProjectList {...listProps} />
      </div>
    </aside>
  )
}
