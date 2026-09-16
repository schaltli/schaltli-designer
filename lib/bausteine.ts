// Building blocks: a ready-made control, bound to a real value of the
// installation, placed in one go instead of drawn and wired by hand.
//
// A block is a recipe, not a template file: it says which object types it
// needs (so a device whose DDF does not declare them is not offered it),
// which state topics identify its instances, and how to turn a rectangle the
// user dragged plus one chosen instance into objects and the topics those
// objects bind to.
//
// Instances come from the broker, not from a list here: the bridge publishes
// every value the installation has under screenbee/state/... retained
// (docs/device-contract.md §4), including a name where the source knows one -
// "screenbee/state/tank/1/name = Frischwasser". So the question the wizard
// asks is not "which topic" but "which tank", and the answer carries the
// label the van itself uses.
//
// One block so far, Tank. The shape is deliberately the smallest thing that
// a second block can be added to without rewriting: the value leaf, the name
// leaf and the object it builds are all per block.

import type { ScreenObject, Topic } from "@/components/project-editor"
import type { ControlPalette } from "@/lib/control-palette"

export const STATE_PREFIX = "screenbee/state/"

export interface BausteinInstance {
  /** The instance's number as the installation counts it: tank 1, tank 2. */
  key: string
  /** What the installation calls it, where it says so - else a fallback. */
  label: string
  /** The topic the built object binds to. */
  valueTopic: string
}

export interface BausteinBuildInput {
  instance: BausteinInstance
  rect: { x: number; y: number; width: number; height: number }
  palette: ControlPalette
  /** The project's smallest font, for controls that draw their own value. */
  font?: { id: string; size: number }
}

export interface BausteinBuildResult {
  objects: Omit<ScreenObject, "id" | "zIndex">[]
  /** Topics the objects bind to, to be registered if the project lacks them. */
  topics: Omit<Topic, "id">[]
}

export interface BausteinDef {
  id: string
  label: string
  description: string
  /** Object types the device must declare, or the block is not offered. */
  requiredObjectTypes: string[]
  /** State topics under this group identify the instances. */
  group: string
  /** The leaf carrying the value, and the one carrying a display name. */
  valueLeaf: string
  nameLeaf?: string
  /** Fallback instances when no broker answers - what the API can report. */
  fallbackKeys: string[]
  fallbackLabel: (key: string) => string
  build: (input: BausteinBuildInput) => BausteinBuildResult
}

export const TANK: BausteinDef = {
  id: "tank",
  label: "Tank",
  description: "A level indicator bound to a tank's level",
  requiredObjectTypes: ["level-indicator"],
  group: "tank",
  valueLeaf: "level",
  nameLeaf: "name",
  // Pekaway's level API reports level1..level4; a system with fewer simply
  // publishes fewer, and the broker's answer is what is offered when there
  // is one.
  fallbackKeys: ["1", "2", "3", "4"],
  fallbackLabel: (key) => `Tank ${key}`,
  build: ({ instance, rect, palette, font }) => ({
    objects: [
      {
        type: "level-indicator",
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(Math.abs(rect.width)),
        height: Math.round(Math.abs(rect.height)),
        properties: {
          topic: instance.valueTopic,
          barDirection: "left-to-right",
          // The bridge publishes a tank level as a percentage, so the
          // calibration is the identity - it is still written out, because
          // an object without calibration points falls back to a different
          // rule in every renderer.
          calibrationPoints: [
            { value: 0, barSizePercent: 0 },
            { value: 100, barSizePercent: 100 },
          ],
          displayValue: "percentage",
          backgroundColor: palette.background,
          borderColor: palette.border,
          fillColor: palette.fill,
          textColor: palette.text,
          fontId: font?.id,
          fontSize: font?.size,
        },
      },
    ],
    topics: [
      {
        topic: instance.valueTopic,
        type: "numeric",
        // Examples are for designing, never for showing (decision 6 of
        // docs/2026-09-15-live-data.md): the canvas needs something to draw
        // while editing, the device and the live preview ignore these. The
        // first one is what the editor draws, so it is a half-full tank -
        // an empty one looks like a control that is not working.
        examples: ["45", "0", "100"],
      },
    ],
  }),
}

export const BAUSTEINE: BausteinDef[] = [TANK]

export function bausteinById(id: string): BausteinDef | undefined {
  return BAUSTEINE.find((b) => b.id === id)
}

// The instances a block has, read off a snapshot of retained state topics:
// every "<prefix><group>/<key>/<valueLeaf>" is one, and the sibling name
// leaf, where there is one, is its label.
export function discoverInstances(def: BausteinDef, values: Record<string, string>): BausteinInstance[] {
  const instances: BausteinInstance[] = []
  for (const topic of Object.keys(values)) {
    const prefix = `${STATE_PREFIX}${def.group}/`
    if (!topic.startsWith(prefix)) continue
    const rest = topic.slice(prefix.length).split("/")
    if (rest.length !== 2 || rest[1] !== def.valueLeaf) continue
    const key = rest[0]
    const name = def.nameLeaf ? values[`${prefix}${key}/${def.nameLeaf}`] : undefined
    instances.push({
      key,
      label: name && name.trim() !== "" ? name : def.fallbackLabel(key),
      valueTopic: topic,
    })
  }
  return instances.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
}

// What to offer when no broker answers: the same topics the bridge would
// publish, named generically. Placing one then still produces a screen that
// works the moment the van is running.
export function fallbackInstances(def: BausteinDef): BausteinInstance[] {
  return def.fallbackKeys.map((key) => ({
    key,
    label: def.fallbackLabel(key),
    valueTopic: `${STATE_PREFIX}${def.group}/${key}/${def.valueLeaf}`,
  }))
}
