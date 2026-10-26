// What Deploy asks of a device for a project with scaled values
// (tasks/ha-templates-stage2-plan.md, decision 4; device contract §2.11):
// the feature its description must declare, and what needs it named for the
// message - each scaled topic, used or not, as each local topic is, and each
// slider or dial with a write format. A device without it would show no value
// for the one and publish the bare number for the other.

export const SCALED_VALUES_FEATURE = "scaled-values"

interface ObjectLike {
  type: string
  properties?: Record<string, any>
  children?: ObjectLike[]
}

export function scaledValuesFeature(project: {
  combinedTopics?: readonly { name: string; mode: string }[]
  screens?: readonly { name: string; objects?: ObjectLike[] }[]
}): { feature: string; label: string } | null {
  const names = (project.combinedTopics ?? []).filter((ct) => ct.mode === "scale").map((ct) => ct.name)
  for (const screen of project.screens ?? []) {
    const walk = (objects: ObjectLike[]) => {
      for (const obj of objects) {
        if (obj.properties?.writeFormat && obj.properties?.writeTopic) {
          const name = `the ${obj.type}'s write format on ${screen.name}`
          if (!names.includes(name)) names.push(name)
        }
        if (obj.children?.length) walk(obj.children)
      }
    }
    walk(screen.objects ?? [])
  }
  return names.length > 0 ? { feature: SCALED_VALUES_FEATURE, label: `scaled values (${names.join(", ")})` } : null
}
