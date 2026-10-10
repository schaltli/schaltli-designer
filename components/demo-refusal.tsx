// What the demo says when asked for something only an own Schaltli does -
// saving, deploying, versions (2026-10-10): the menu items stay where they
// are, so a visitor sees what the designer can do, and a click says why not
// here and how to get it.

import { DEMO_INSTALL_URL } from "@/hooks/use-demo-mode"

/** The toast for `why` (one sentence), with the way on. */
export function demoRefusalToast(why: string) {
  return {
    title: "Not possible in the demo",
    description: (
      <span data-testid="demo-refusal">
        {why}{" "}
        <a href={DEMO_INSTALL_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          How to install Schaltli
        </a>
      </span>
    ),
  }
}

export const DEMO_REFUSES = {
  save: "Your own Schaltli saves your projects. Here, Download Project takes your screen with you.",
  deploy: "Your own Schaltli sends a screen to the displays in your van, over its network.",
  versions: "Your own Schaltli keeps every saved version of a project.",
} as const
