"use client"

/**
 * The projects on this server, as a flat list - like an explorer without
 * folders (docs/2026-09-23-explicit-save.md, "Project list"). Shown in the
 * Projects panel beside the canvas and on the start page. Clicking an entry
 * opens it; its menu (the ⋯ button, or a right click) renames it in place or
 * deletes it.
 *
 * The Delete key does nothing here, and does not reach the editor either: the
 * list sits next to the canvas, and a Delete meant for an object must never
 * delete a project - nor, pressed in the list, an object.
 */

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { checkProjectName, sameProjectName } from "@/lib/project-name"
import { cn } from "@/lib/utils"
import { formatSavedAt, type ProjectListEntry } from "./save-project-dialog"
import { Loader2, MoreHorizontal } from "lucide-react"

interface ProjectListProps {
  // The project open in the editor, highlighted; null on the start page or
  // while the open project has no name.
  openName: string | null
  openUnsaved: boolean
  // Changes whenever the list may have changed elsewhere (a save), to reload.
  refreshKey: unknown
  onOpen: (name: string) => void
  // Rejects with the reason to show beside the name.
  onRename: (name: string, newName: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}

export function ProjectList({ openName, openUnsaved, refreshKey, onOpen, onRename, onDelete }: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectListEntry[] | null>(null)
  const [reload, setReload] = useState(0)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => current && setProjects(data.projects ?? []))
      .catch(() => current && setProjects([]))
    return () => {
      current = false
    }
  }, [refreshKey, reload])

  if (projects === null) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading projects...
      </div>
    )
  }
  if (projects.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No projects saved yet.</p>
  }

  return (
    <ul aria-label="Projects" className="py-1">
      {projects.map((p) => {
        const isOpen = openName !== null && sameProjectName(p.name, openName)
        return (
          <li key={p.name} className="group relative">
            {renaming === p.name ? (
              <RenameField
                name={p.name}
                taken={(candidate) =>
                  projects.some((other) => other.name !== p.name && sameProjectName(other.name, candidate))
                }
                onDone={() => setRenaming(null)}
                onRename={async (newName) => {
                  await onRename(p.name, newName)
                  setRenaming(null)
                  setReload((n) => n + 1)
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  data-project-name={p.name}
                  aria-current={isOpen ? "true" : undefined}
                  onClick={() => onOpen(p.name)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuFor(p.name)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "F2") {
                      e.preventDefault()
                      setRenaming(p.name)
                    }
                    // Kept from the editor's own keys: see the header comment.
                    if (e.key === "Delete" || e.key === "Backspace" || e.key === "F2") e.stopPropagation()
                  }}
                  className={cn(
                    "w-full text-left pl-3 pr-8 py-1.5 hover:bg-accent focus:bg-accent focus:outline-none",
                    isOpen && "bg-primary/10",
                  )}
                >
                  <div className="text-sm font-medium truncate">
                    {isOpen && openUnsaved && <span aria-label="Unsaved changes">• </span>}
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.deviceName ?? "Unknown device"} · {formatSavedAt(p.savedAt)}
                  </div>
                  {p.deployedTo && (
                    <div className="text-xs text-muted-foreground truncate">Deployed to {p.deployedTo}</div>
                  )}
                </button>
              </>
            )}
            {/* Mounted also while renaming, so the menu that asked for the
                rename closes normally - and hands the focus to the name
                field when it does, not back to the ⋯ button (which would
                blur the field, and blurring cancels). */}
            <DropdownMenu open={menuFor === p.name} onOpenChange={(open) => setMenuFor(open ? p.name : null)}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${p.name}`}
                  hidden={renaming === p.name}
                  className="absolute right-1 top-1.5 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:bg-muted"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(e) => {
                  const field = document.querySelector<HTMLInputElement>(`input[data-rename-for="${CSS.escape(p.name)}"]`)
                  if (!field) return
                  e.preventDefault()
                  field.focus()
                  field.select()
                }}
              >
                <DropdownMenuItem onSelect={() => setRenaming(p.name)}>Rename</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    try {
                      await onDelete(p.name)
                      setReload((n) => n + 1)
                    } catch {
                      // onDelete says why itself (the open project, a
                      // failed request); the list stays as it is.
                    }
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )
      })}
    </ul>
  )
}

// The name made editable in place, as a file explorer does it. Enter
// confirms, Escape or leaving the field cancels.
function RenameField({
  name,
  taken,
  onRename,
  onDone,
}: {
  name: string
  taken: (candidate: string) => boolean
  onRename: (newName: string) => Promise<void>
  onDone: () => void
}) {
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)


  const check = checkProjectName(value)
  const problem = !check.ok
    ? check.reason
    : taken(check.name)
      ? `"${check.name}" already exists.`
      : null

  const confirm = async () => {
    if (!check.ok || problem || busy) return
    if (check.name === name) return onDone()
    setBusy(true)
    try {
      await onRename(check.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Renaming failed")
      setBusy(false)
    }
  }

  return (
    <div className="px-2 py-1">
      <Input
        ref={inputRef}
        data-rename-for={name}
        // F2 lands here directly; from the menu, its onCloseAutoFocus
        // focuses this field once the menu is closed.
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label="New name"
        value={value}
        disabled={busy}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") void confirm()
          if (e.key === "Escape") onDone()
        }}
        onBlur={() => !busy && onDone()}
        aria-invalid={(problem ?? error) !== null}
        className="h-7 text-sm"
      />
      {(problem ?? error) && (
        <p role="alert" className="text-xs text-destructive mt-1">
          {problem ?? error}
        </p>
      )}
    </div>
  )
}
