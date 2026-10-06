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
