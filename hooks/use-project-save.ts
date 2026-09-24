"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { sameState } from "@/lib/project-history"

// Explicit saving (docs/2026-09-23-explicit-save.md). The editor's state for
// it is two values: the name the open project is saved under (null while it
// has none - an upload, a device recovery) and the project as last saved or
// opened. Everything else - the dot, the tab title, the leave warning -
// follows from comparing that with the project being edited.

interface SavableProject {
  name: string
  settings: { boundInstanceId?: string }
}

// A deploy's device binding is a fact, not an edit (carryDeviceBinding in
// project-editor.tsx): it must not make a saved project look unsaved.
function withoutBinding<T extends SavableProject>(project: T): T {
  if (project.settings.boundInstanceId === undefined) return project
  return { ...project, settings: { ...project.settings, boundInstanceId: undefined } }
}

export class ProjectSaveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly existingName?: string,
  ) {
    super(message)
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ProjectSaveError(data.error ?? `Saving failed (${res.status})`, res.status, data.code, data.name)
  return data as { name: string; versionId: string; savedAt: string }
}

// Creates a project on the server whose first version is `project`. For New
// Project, which saves before the project is open in the editor.
export async function createProjectOnServer<T extends SavableProject>(name: string, project: T) {
  return postJson("/api/projects", { name, project: { ...project, name } })
}

// What every save hands back: where it went, and the project exactly as
// stored - which a deploy then sends, so the device gets what was saved.
export interface SaveResult<T> {
  name: string
  versionId: string
  project: T
}

// `open` is false while no project is open (the start page): nothing to save,
// nothing to warn about, and the tab keeps the app's own title.
export function useProjectSave<T extends SavableProject>(project: T, applyName: (named: T) => void, open: boolean) {
  const [savedName, setSavedName] = useState<string | null>(null)
  const [savedProject, setSavedProject] = useState<T | null>(null)
  // The version the open project was saved as or opened from; a deploy of an
  // unchanged project marks this one.
  const [savedVersionId, setSavedVersionId] = useState<string | null>(null)

  const unsaved = useMemo(
    () => savedName === null || savedProject === null || !sameState(withoutBinding(project), withoutBinding(savedProject)),
    [project, savedName, savedProject],
  )

  // The open project was just saved, or just opened, as `name`.
  const markSaved = useCallback((name: string, saved: T, versionId: string) => {
    setSavedName(name)
    setSavedProject(saved)
    setSavedVersionId(versionId)
  }, [])

  // The open project has no name on the server: a new load from outside.
  const markUnnamed = useCallback(() => {
    setSavedName(null)
    setSavedProject(null)
    setSavedVersionId(null)
  }, [])

  // Saves under a name that does not exist yet. The project takes the name
  // (it is the same field the project-name placeholder reads).
  const saveAsNew = useCallback(
    async (name: string): Promise<SaveResult<T>> => {
      const named = { ...project, name }
      const result = await postJson("/api/projects", { name, project: named })
      const stored = { ...named, name: result.name }
      applyName(stored)
      markSaved(result.name, stored, result.versionId)
      return { name: result.name, versionId: result.versionId, project: stored }
    },
    [project, applyName, markSaved],
  )

  // Adds the open project as the newest version of the project saved as
  // `name` - a Replace in the Save dialog, or a plain Save of its own name.
  // Afterwards the open project is that one.
  const saveInto = useCallback(
    async (name: string): Promise<SaveResult<T>> => {
      const named = project.name === name ? project : { ...project, name }
      const result = await postJson(`/api/projects/${encodeURIComponent(name)}/versions`, named)
      // The server answers with the folder's spelling, which wins.
      const stored = named.name === result.name ? named : { ...named, name: result.name }
      if (stored !== project) applyName(stored)
      markSaved(result.name, stored, result.versionId)
      return { name: result.name, versionId: result.versionId, project: stored }
    },
    [project, applyName, markSaved],
  )

  // The open project was renamed on the server (the Projects panel): it takes
  // the new name, and what was unsaved stays unsaved.
  const renamed = useCallback(
    (newName: string, versionId: string) => {
      setSavedName(newName)
      setSavedProject((saved) => (saved ? { ...saved, name: newName } : saved))
      setSavedVersionId(versionId)
      applyName({ ...project, name: newName })
    },
    [project, applyName],
  )

  const saveVersion = useCallback(async () => {
    if (savedName === null) throw new ProjectSaveError("The project has no name yet", 400)
    return saveInto(savedName)
  }, [savedName, saveInto])

  // The browser's own "leave site?" when the tab is closed or reloaded with
  // unsaved changes. Leaving inside the designer asks its own question.
  useEffect(() => {
    if (!open || !unsaved) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [open, unsaved])

  const displayName = savedName ?? "Untitled"
  useEffect(() => {
    document.title = open ? `${unsaved ? "• " : ""}${displayName} - Schaltli Designer` : "Schaltli Designer"
  }, [open, unsaved, displayName])

  return {
    savedName,
    savedVersionId,
    displayName,
    unsaved,
    markSaved,
    markUnnamed,
    saveAsNew,
    saveInto,
    saveVersion,
    renamed,
  }
}
