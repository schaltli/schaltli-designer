// Starters (tasks/starter-project-plan.md): a project to begin with instead
// of an empty one, offered in the New Project dialog for the devices it is
// made for. A starter is a project built in the designer on camera, kept
// under lib/starters/ by scripts/starter-from-project.js: its screens,
// topics, icons and settings, without what a project takes from its device.

export interface StarterInfo {
  id: string
  /** The choice in the dialog. Neutral: CamperUI is named as the model in the handbook and the video only. */
  label: string
  deviceIds: readonly string[]
}

export const STARTERS: readonly StarterInfo[] = [
  { id: "vanpi-4", label: 'VanPi-Starter (4")', deviceIds: ["waveshare-touch-lcd-4"] },
]

/** The starters made for a device; none for a device no starter is made for. */
export function startersFor(deviceId: string | undefined): StarterInfo[] {
  return deviceId ? STARTERS.filter((s) => s.deviceIds.includes(deviceId)) : []
}

export interface StarterContent {
  screens: unknown[]
  topics: unknown[]
  combinedTopics?: unknown[]
  assets: unknown[]
  nextId: number
  snapGuides?: unknown[]
  settings: Record<string, unknown>
}

/** A starter's content, loaded when it is chosen - not with every page. */
export async function loadStarter(id: string): Promise<StarterContent> {
  if (id === "vanpi-4") return (await import("./starters/vanpi-4.json")).default as unknown as StarterContent
  throw new Error(`There is no starter "${id}".`)
}

/**
 * `fresh` - a project just made for the chosen device - with the starter's
 * screens, topics, icons and settings. The device's own stays: its size,
 * fonts, buttons, description and the device fields of its settings.
 */
export function withStarter<P extends { screens: unknown[]; topics: unknown[]; assets: unknown[]; nextId: number; settings: object; combinedTopics?: unknown[]; snapGuides?: unknown[] }>(
  fresh: P,
  content: StarterContent,
): P {
  const c = structuredClone(content)
  return {
    ...fresh,
    screens: c.screens,
    topics: c.topics,
    ...(c.combinedTopics ? { combinedTopics: c.combinedTopics } : {}),
    assets: c.assets,
    nextId: Math.max(fresh.nextId, c.nextId),
    ...(c.snapGuides ? { snapGuides: c.snapGuides } : {}),
    settings: { ...fresh.settings, ...c.settings },
  }
}
