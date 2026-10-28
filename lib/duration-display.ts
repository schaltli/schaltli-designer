// What Deploy asks of a device for a project with a dial or gauge that shows
// its value as a duration (device contract §2.12, asked for the Autoterm's
// runtime on 2026-10-28): the feature its description must declare, and the
// rings that need it named for the message. A device without it would show
// the bare number of seconds.

export const DURATION_DISPLAY_FEATURE = "duration-display"

interface ObjectLike {
  type: string
  properties?: Record<string, any>
  children?: ObjectLike[]
}

export function durationDisplayFeature(project: {
  screens?: readonly { name: string; objects?: ObjectLike[] }[]
  popups?: readonly { name: string; objects?: ObjectLike[] }[]
}): { feature: string; label: string } | null {
  const names: string[] = []
  for (const screen of [...(project.screens ?? []), ...(project.popups ?? [])]) {
    const walk = (objects: ObjectLike[]) => {
      for (const obj of objects) {
        if ((obj.type === "dial" || obj.type === "gauge") && obj.properties?.displayValue === "duration") {
          const name = `the ${obj.type} on ${screen.name}`
          if (!names.includes(name)) names.push(name)
        }
        if (obj.children?.length) walk(obj.children)
      }
    }
    walk(screen.objects ?? [])
  }
  return names.length > 0 ? { feature: DURATION_DISPLAY_FEATURE, label: `values as durations (${names.join(", ")})` } : null
}
