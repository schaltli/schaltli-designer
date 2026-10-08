// A screen's icon (docs/2026-10-08-navigator.md decision 6): fixed, or live
// like an icon object - `iconLive`, a live value whose Otherwise is the
// fixed icon (`iconAssetId`, which the Knob's screen menu shows).
//
// Drawn and exported as the icon object it amounts to, so that everything
// a live icon on a screen does - evaluation, test values, baked branches,
// devices of 1.4 - holds for it without a second implementation.

import type { ScreenObject } from "@/components/project-editor"
import type { LiveValue } from "@/lib/live-value"

export interface IconScreen {
  id: string
  iconAssetId?: string
  iconLive?: LiveValue
}

/** The screen's icon as an icon object, at the origin, `size` square. */
export function screenIconObject(screen: IconScreen, size = 24): ScreenObject {
  return {
    id: `${screen.id}~icon`,
    type: "icon",
    x: 0,
    y: 0,
    width: size,
    height: size,
    zIndex: 0,
    properties: {
      assetId: screen.iconAssetId,
      ...(screen.iconLive ? { liveIconId: screen.iconLive.id, liveValues: [screen.iconLive] } : {}),
    },
  } as ScreenObject
}

/** The screen with its icon made live: Otherwise is the fixed icon, the source the first one offered. */
export function withLiveIcon<S extends IconScreen>(screen: S, source: LiveValue["source"]): S & { iconLive: LiveValue } {
  return {
    ...screen,
    iconLive: {
      id: "lv1",
      source,
      rules: [],
      ...(screen.iconAssetId ? { otherwise: { kind: "icon" as const, icon: screen.iconAssetId } } : {}),
    },
  }
}

/** The screen with its icon fixed again: the Otherwise icon stays. */
export function withFixedIcon<S extends IconScreen>(screen: S): S {
  const otherwise = screen.iconLive?.otherwise?.kind === "icon" ? screen.iconLive.otherwise.icon : undefined
  const { iconLive: _live, ...rest } = screen
  return { ...rest, iconAssetId: otherwise ?? screen.iconAssetId } as S
}
