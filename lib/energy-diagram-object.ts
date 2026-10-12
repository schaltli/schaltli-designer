// The energy diagram as an object of the designer's (docs/2026-10-11-energy-
// diagram.md): what lib/energy-diagram.ts, the pure core, does not know -
// screens, projects, exports.

import type { ScreenObject } from "@/components/project-editor"

/**
 * A project without its energy diagrams, at every depth: until the device
 * contract has the type (module `energy-contract`, generation 1.7) neither
 * the device zip nor the Android bundle carries one, so nothing half-made
 * reaches a device.
 */
export function withoutEnergyDiagrams<P extends { screens: Array<{ objects: ScreenObject[] }> }>(project: P): P {
  const keep = (objects: ScreenObject[]): ScreenObject[] =>
    objects.filter((o) => o.type !== "energy-diagram").map((o) => (o.children ? { ...o, children: keep(o.children) } : o))
  if (!project.screens.some((s) => JSON.stringify(s.objects).includes('"energy-diagram"'))) return project
  return { ...project, screens: project.screens.map((s) => ({ ...s, objects: keep(s.objects) })) }
}
