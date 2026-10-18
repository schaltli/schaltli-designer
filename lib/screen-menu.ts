// The screen menu is gone (docs/2026-10-17-screen-graph.md decision 6, device
// contract §2.10): the device action «Show Screen Menu» (`showScreenMenu`)
// left the knob with the screen graph - swiping to the neighbours took its
// place - and the app's navigator had taken it over already. A project that
// still binds it loses the binding when it is opened, and the editor says so
// once (SCREEN_MENU_GONE); a device that runs it from an older deploy keeps
// obeying it until its next one. The device-action mechanism itself stays.

export const SCREEN_MENU_ACTION = "showScreenMenu"

export const SCREEN_MENU_GONE = "The screen menu is gone: swipe, the ring or the navigator change screens now."

type Action = { type?: string; deviceActionId?: string } | undefined
type Obj = { properties?: Record<string, any>; children?: Obj[] }
type MenuProject = {
  screens?: { buttonActions?: Record<string, Action>; objects?: Obj[] }[]
  settings?: { deviceActions?: string[] }
}

const isMenu = (a: Action) => a?.type === "device-action" && a.deviceActionId === SCREEN_MENU_ACTION

// Every place an action is bound on an object: a button's own, and an energy
// diagram node's (docs/2026-10-11-energy-diagram.md decision 13).
function eachObjectAction(objects: Obj[] | undefined, visit: (holder: Record<string, any>, key: string) => void): void {
  for (const obj of objects ?? []) {
    const p = obj.properties
    if (p) {
      if (p.action) visit(p, "action")
      if (Array.isArray(p.nodes)) for (const node of p.nodes) if (node?.action) visit(node, "action")
    }
    eachObjectAction(obj.children, visit)
  }
}

/** Whether anything in the project binds the screen menu. */
export function usesScreenMenu(project: MenuProject): boolean {
  let found = false
  for (const screen of project.screens ?? []) {
    if (Object.values(screen.buttonActions ?? {}).some(isMenu)) found = true
    eachObjectAction(screen.objects, (holder, key) => {
      if (isMenu(holder[key])) found = true
    })
  }
  return found
}

/**
 * Takes the screen menu out of the project, in place: every binding of it,
 * and the id from the device's offered actions. Returns the project.
 */
export function withoutScreenMenu<P extends MenuProject>(project: P): P {
  for (const screen of project.screens ?? []) {
    if (screen.buttonActions) {
      for (const [id, action] of Object.entries(screen.buttonActions)) if (isMenu(action)) delete screen.buttonActions[id]
    }
    eachObjectAction(screen.objects, (holder, key) => {
      if (isMenu(holder[key])) delete holder[key]
    })
  }
  const offered = project.settings?.deviceActions
  if (Array.isArray(offered) && offered.includes(SCREEN_MENU_ACTION)) {
    project.settings!.deviceActions = offered.filter((id) => id !== SCREEN_MENU_ACTION)
  }
  return project
}
