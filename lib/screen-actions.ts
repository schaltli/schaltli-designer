import type { Project } from "@/components/project-editor"

// Duplicating and deleting a screen, once for the screens panel and «Manage
// Screens» (tasks/graph-surface-plan.md S2). Until 2026-10-17 each had its
// own copy, and the project settings' «Screens» tab a third.

function isScreenNameTaken(project: Project, name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return project.screens.some((screen) => screen.name.toLowerCase() === normalized)
}

/**
 * The project with a copy of the screen at the end of the list, named
 * «<name> Copy» (or «Copy 2», …), with fresh ids for it and its objects. A
 * copy of a docked screen is not docked: two screens cannot share a place,
 * so it lands in the main row (lib/screen-graph.ts).
 */
export function withScreenDuplicated(project: Project, screenId: string): { project: Project; newId: string } | null {
  const original = project.screens.find((s) => s.id === screenId)
  if (!original) return null
  let nextId = project.nextId || 0
  let name = `${original.name} Copy`
  let counter = 1
  while (isScreenNameTaken(project, name)) {
    counter++
    name = `${original.name} Copy ${counter}`
  }
  const copy = {
    ...original,
    id: `screen-${nextId}`,
    name,
    dock: undefined,
    objects: original.objects.map((obj) => {
      nextId++
      return { ...obj, id: `obj-${nextId}` }
    }),
  }
  nextId++
  return { project: { ...project, nextId, screens: [...project.screens, copy] }, newId: copy.id }
}

/**
 * The project without the screen, or why it may not go: the last screen, the
 * last master and a master still in use stay. Screens docked on it become
 * hidden when the editor mends the graph (lib/screen-graph.ts withGraphMended).
 */
export function withScreenDeleted(
  project: Project,
  screenId: string,
): { ok: true; project: Project } | { ok: false; title: string; description: string } {
  if (project.screens.length <= 1) return { ok: false, title: "Can't delete the last screen", description: "Every project needs a screen." }
  const screen = project.screens.find((s) => s.id === screenId)
  if (screen?.isMaster) {
    if (project.screens.filter((s) => s.isMaster).length <= 1) {
      return { ok: false, title: "Can't delete this master screen", description: "Every project needs at least one master screen." }
    }
    if (project.screens.some((s) => s.masterScreenId === screenId)) {
      return {
        ok: false,
        title: "Can't delete this master screen",
        description: "It still has screens assigned to it - reassign or delete those first.",
      }
    }
  }
  // A master can't reach here with dependents still pointing at it (guarded
  // above), so this cleanup is purely defensive.
  const screens = project.screens
    .filter((s) => s.id !== screenId)
    .map((s) => (s.masterScreenId === screenId ? { ...s, masterScreenId: undefined } : s))
  return { ok: true, project: { ...project, screens } }
}
