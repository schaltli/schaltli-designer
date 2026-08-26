import type { Project } from "@/components/project-editor"

// An object coordinate is a whole pixel, everywhere, always.
//
// Found on a real Waveshare on 2026-08-26: the "Licht" screen held three
// switches at 79, 150.5 and 222, and the middle one - the only one with a
// fraction - was drawn hard against the left edge of the panel while the
// designer showed all three where they belonged. The fraction came from
// "Distribute H", which divided the available space and wrote the raw
// quotient. The jump came from the firmware, whose ProjectLoader does
//
//     obj.x = objJson["x"] | 0;      // obj.x is int
//
// and ArduinoJson's `|` yields the default whenever the stored value is not
// the requested type. A double of 150.5 is not an int, so x became 0.
//
// The device is only the loud half. On the designer's own canvas a 1px
// stroke on a .5 boundary straddles two pixel columns and is drawn as two
// half-lit ones, so a fraction is a blurred edge long before it is a
// misplaced object.
//
// TypeScript cannot express the constraint usefully: `number` is a double,
// there is no integer type, and ScreenObject is an interface rather than a
// class - the objects are plain literals spread through `{ ...obj }`, with
// no constructor any write funnels through. A branded `Px` type would say
// it, at the cost of every numeric literal in the codebase, and would still
// not cover the boundary the fraction actually arrived from: a saved
// project file, parsed as plain `number`. So the guarantee is made where it
// can run - at the two boundaries that own it, both calling this module
// rather than each rounding in its own way:
//
//   * loading a project (components/project-editor.tsx), which repairs a
//     file saved before the editor rounded, or written by hand
//   * building a device export (lib/project-zip.ts), which is the last
//     point that still knows the difference
//
// Everything in between already rounds: canvas.tsx's drag, resize and snap
// paths always have, the property panels parse with parseInt, and
// multi-selection-properties.tsx's distribute/align round since the same
// day this was found.

// Children are a container's (tab-control/panel) coordinates relative to
// its own origin - a nested object is exactly as capable of holding a
// fraction as a top-level one.
export function withIntegerGeometry<
  T extends { x: number; y: number; width: number; height: number; children?: any[] },
>(obj: T): T {
  const rounded: T = {
    ...obj,
    x: Math.round(obj.x),
    y: Math.round(obj.y),
    width: Math.round(obj.width),
    height: Math.round(obj.height),
  }
  if (Array.isArray(obj.children)) {
    rounded.children = obj.children.map(withIntegerGeometry)
  }
  return rounded
}

export function withIntegerProjectGeometry(project: Project): Project {
  return {
    ...project,
    screens: (project.screens || []).map((screen) => ({
      ...screen,
      objects: (screen.objects || []).map(withIntegerGeometry),
    })),
  }
}
