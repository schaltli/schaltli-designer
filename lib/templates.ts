// Templates (2026-11-13): a project to begin with instead of an empty one,
// like Word's. New Project offers, for any device, Empty or From template,
// and lists the templates made for the device chosen. Shared by the browser
// and the server: no node:fs here, the store is lib/template-store.ts.
//
// A template is a project without what a project takes from its device - the
// device's description, fonts, size, buttons and the device fields of its
// settings - so that a project made from it gets those from the device chosen
// in the dialog, as an empty one does. Two places hold them: templates/ in
// the repo, shipped with every installation and read-only, and
// <data>/templates/, where File > Save as Template puts the user's own.

export const TEMPLATE_FORMAT = 1

export interface TemplateContent {
  screens: unknown[]
  topics: unknown[]
  combinedTopics?: unknown[]
  assets: unknown[]
  nextId: number
  snapGuides?: unknown[]
  settings: Record<string, unknown>
}

/** A template as stored: its name, the device it is made for, its content. */
export interface Template extends TemplateContent {
  format: number
  name: string
  deviceId: string
}

/** A template as the list shows it. `shipped`: one of the installation's own, not the user's. */
export interface TemplateSummary {
  name: string
  deviceId: string
  shipped: boolean
}

// The device's own, filled in from its description when a project is made.
export const DEVICE_SETTINGS = [
  "colorDepth", "deviceId", "deviceName", "devicePlatform", "supportedObjectTypes", "deviceActions",
  "supportedFeatures", "ddfHash", "supportsSoftwareButtons", "needsPageIconsInSize", "pixelsPerMm",
  "typographies", "screenShape", "screenMotion", "popupCloseRadius", "boundInstanceId",
]

interface ProjectLike {
  screens: unknown[]
  topics?: unknown[]
  combinedTopics?: unknown[]
  assets?: unknown[]
  nextId: number
  snapGuides?: unknown[]
  settings?: Record<string, unknown>
}

/**
 * A template from a project: its screens, the topics its objects use, its
 * icons and the settings that are not the device's. `deviceId` is the
 * device the project is made for, which a template is offered for.
 */
export function templateFromProject(name: string, project: ProjectLike): Template {
  const settings = Object.fromEntries(Object.entries(project.settings ?? {}).filter(([k]) => !DEVICE_SETTINGS.includes(k)))
  const screens = structuredClone(project.screens)
  const text = JSON.stringify(screens)
  const topics = (project.topics ?? []).filter((t) => {
    const topic = (t as { topic?: string }).topic ?? ""
    return text.includes(`"${topic}`) || text.includes(`:${topic}`) || text.includes(`${topic}"`)
  })
  return {
    format: TEMPLATE_FORMAT,
    name,
    deviceId: String(project.settings?.deviceId ?? ""),
    screens,
    topics: structuredClone(topics),
    ...(project.combinedTopics?.length ? { combinedTopics: structuredClone(project.combinedTopics) } : {}),
    assets: structuredClone(project.assets ?? []),
    nextId: project.nextId,
    snapGuides: structuredClone(project.snapGuides ?? []),
    settings: structuredClone(settings),
  }
}

/**
 * `fresh` - a project just made for the chosen device - with the template's
 * screens, topics, icons and settings. The device's own stays: its size,
 * fonts, buttons, description and the device fields of its settings.
 */
export function withTemplate<P extends { screens: unknown[]; topics: unknown[]; assets: unknown[]; nextId: number; settings: object; combinedTopics?: unknown[]; snapGuides?: unknown[] }>(
  fresh: P,
  content: TemplateContent,
): P {
  const c = structuredClone(content)
  const settings = Object.fromEntries(Object.entries(c.settings ?? {}).filter(([k]) => !DEVICE_SETTINGS.includes(k)))
  return {
    ...fresh,
    screens: c.screens,
    topics: c.topics,
    ...(c.combinedTopics ? { combinedTopics: c.combinedTopics } : {}),
    assets: c.assets,
    nextId: Math.max(fresh.nextId, c.nextId),
    ...(c.snapGuides ? { snapGuides: c.snapGuides } : {}),
    settings: { ...fresh.settings, ...settings },
  }
}
