import { resolveColor, themeFor, type ThemedScreen } from "@/lib/themes"

// Popup screens (docs/2026-10-06-popup-screens.md): a screen of its own,
// designed at the display's size, out of next/previous navigation and out of
// every «Go to Screen» picker, opened over the current screen by «Open
// Popup». It keeps a master for its theme only - «Show master» is always off,
// so it shows no master's objects and inherits no button actions.

export type ScreenType = "main" | "popup"

interface TypedScreen {
  screenType?: "popup"
  isMaster?: boolean
}

export function isPopup(screen: TypedScreen | undefined): boolean {
  return screen?.screenType === "popup"
}

/** A screen in next/previous order and a «Go to Screen» target: neither a master nor a popup. */
export function isMainScreen(screen: TypedScreen | undefined): boolean {
  return !!screen && !screen.isMaster && !isPopup(screen)
}

/** The screen a project opens on: its first main screen, else its first one. */
export function firstScreenToOpen<S extends TypedScreen & { id: string }>(screens: S[]): S | undefined {
  return screens.find(isMainScreen) ?? screens[0]
}

const SWIPE_BUTTON_IDS = ["swipe-left", "swipe-right", "swipe-up", "swipe-down"]

/**
 * The screen turned into the given type. A popup's «Show master» goes off
 * and its swipe actions go: on a popup a swipe always closes it. Back to a
 * main screen nothing comes back - «Show master» stays off for the user to
 * turn on.
 */
export function withScreenType<
  S extends TypedScreen & { showMaster?: boolean; buttonActions?: Record<string, unknown> },
>(screen: S, type: ScreenType): S {
  if (type === "main") {
    const { screenType: _dropped, ...rest } = screen
    return rest as S
  }
  const buttonActions = screen.buttonActions
    ? Object.fromEntries(Object.entries(screen.buttonActions).filter(([id]) => !SWIPE_BUTTON_IDS.includes(id)))
    : undefined
  return {
    ...screen,
    screenType: "popup",
    showMaster: false,
    ...(buttonActions && Object.keys(buttonActions).length > 0 ? { buttonActions } : { buttonActions: undefined }),
  }
}

/**
 * Where a popup's content is designed: a fence centred on the display, a
 * rectangle on a rectangular one and a circle on a round one, with 80 % of the
 * display's area inside. Keeping the content in it is the designer's care,
 * not enforced. A circle is given by its bounding square. Display pixels.
 */
export interface PopupFence {
  shape: "rect" | "circle"
  x: number
  y: number
  width: number
  height: number
}

export const POPUP_FENCE_AREA = 0.8

/** Whether a point (display pixels) lies inside the fence. */
export function insideFence(fence: PopupFence, p: { x: number; y: number }): boolean {
  if (fence.shape === "circle") {
    const r = fence.width / 2
    return (p.x - fence.x - r) ** 2 + (p.y - fence.y - r) ** 2 <= r * r
  }
  return p.x >= fence.x && p.x < fence.x + fence.width && p.y >= fence.y && p.y < fence.y + fence.height
}

export function popupFence(display: {
  screenWidth: number
  screenHeight: number
  screenShape?: "rect" | "round"
}): PopupFence {
  // Each side by √0.8 keeps the shape and leaves 80 % of the area.
  const k = Math.sqrt(POPUP_FENCE_AREA)
  const { screenWidth: w, screenHeight: h } = display
  if (display.screenShape === "round") {
    const d = Math.round(Math.min(w, h) * k)
    return { shape: "circle", x: Math.round((w - d) / 2), y: Math.round((h - d) / 2), width: d, height: d }
  }
  const fw = Math.round(w * k)
  const fh = Math.round(h * k)
  return { shape: "rect", x: Math.round((w - fw) / 2), y: Math.round((h - fh) / 2), width: fw, height: fh }
}

interface ActionLike {
  type: string
  targetScreenId?: string
}
interface ObjectWithAction {
  properties?: Record<string, unknown>
  children?: ObjectWithAction[]
}

/**
 * The project as a device should get it: an «Open a popup» whose target is not
 * a popup (deleted, never chosen, or a main screen) is dropped, on hardware
 * buttons and on software buttons at any depth. Such a button does nothing; an
 * absent action already means that everywhere, as for an adjust-level whose
 * target is gone (lib/hardware-button-actions.ts exportedButtonAction).
 */
export function withoutDeadPopupActions<
  P extends {
    screens: Array<TypedScreen & { id: string; objects: ObjectWithAction[]; buttonActions?: Record<string, ActionLike> }>
  },
>(project: P): P {
  const popupIds = new Set(project.screens.filter(isPopup).map((s) => s.id))
  const dead = (action: unknown) => {
    const a = action as ActionLike | undefined
    return a?.type === "open-popup" && !popupIds.has(a.targetScreenId ?? "")
  }
  const clean = (objects: ObjectWithAction[]): ObjectWithAction[] =>
    objects.map((obj) => {
      let next = obj
      if (obj.properties && dead(obj.properties.action)) {
        const { action: _dropped, ...properties } = obj.properties
        next = { ...obj, properties }
      }
      return obj.children?.length ? { ...next, children: clean(obj.children) } : next
    })
  return {
    ...project,
    screens: project.screens.map((screen) => ({
      ...screen,
      objects: clean(screen.objects),
      ...(screen.buttonActions
        ? { buttonActions: Object.fromEntries(Object.entries(screen.buttonActions).filter(([, a]) => !dead(a))) }
        : {}),
    })),
  }
}

// Popups leave screens[] for popups[], in both exports (lib/project-zip.ts,
// lib/android-export.ts): a device that does not know them skips the key and
// pages exactly as before. Each was exported as a screen is - it shows no
// master, so nothing is merged and its button actions are its own - and gets
// the colours a device may frame it in, resolved in its theme: the theme's
// outline for a border, black for a scrim. The fence is one per project. A
// project without popups gets neither key, and its export stays byte for byte
// what it was.
export function withPopupsApart<E extends { screens: Array<{ id: string }> }>(
  exported: E,
  project: {
    screenWidth: number
    screenHeight: number
    settings: { screenShape?: "rect" | "round" }
    screens: Array<ThemedScreen & { screenType?: "popup" }>
  },
  colorDepth: "1bit" | "4bit" | "24bit" | undefined,
) {
  const popups = project.screens.filter(isPopup)
  if (popups.length === 0) return exported
  const dark = colorDepth === undefined || colorDepth === "24bit"
  const byId = new Map(exported.screens.map((s) => [s.id, s]))
  return {
    ...exported,
    screens: exported.screens.filter((s) => !popups.some((p) => p.id === s.id)),
    popups: popups.map((popup) => {
      const theme = themeFor(popup, project.screens)
      return {
        ...byId.get(popup.id)!,
        borderColor: resolveColor("outline", theme, "light", colorDepth),
        ...(dark ? { borderColorDark: resolveColor("outline", theme, "dark", colorDepth) } : {}),
        scrimColor: "#000000",
      }
    }),
    popupFence: popupFence({
      screenWidth: project.screenWidth,
      screenHeight: project.screenHeight,
      screenShape: project.settings.screenShape,
    }),
  }
}
