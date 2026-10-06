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
