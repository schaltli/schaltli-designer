"use client"

// The neighbours of the screen in the preview, drawn at the screen's own size
// and out of sight, for the preview's swipe to slide the screen against
// (docs/2026-10-17-screen-graph.md, the preview's swipe, user 2026-10-18).
// The same drawing the screens list's thumbnails are made of; the canvas
// takes each one's pixels by its side.

import { forwardRef } from "react"
import type { Project } from "../project-editor"
import { ScreenThumbnail } from "../screens-panel/screen-thumbnail"
import { resolveMasterScreen } from "@/lib/master-screen"
import { projectSeparators } from "@/lib/placeholders"
import { neighboursOf } from "@/lib/screen-graph"
import { themeFor, type Variant } from "@/lib/themes"

interface SwipeNeighboursProps {
  project: Project
  screenId: string
  variant: Variant
}

export const SwipeNeighbours = forwardRef<HTMLDivElement, SwipeNeighboursProps>(function SwipeNeighbours(
  { project, screenId, variant },
  ref,
) {
  const neighbours = Object.entries(neighboursOf(project.screens, screenId))
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed"
      style={{ left: -100000, top: 0, width: project.screenWidth, visibility: "hidden" }}
    >
      {neighbours.map(([side, id]) => {
        const screen = project.screens.find((s) => s.id === id)
        if (!screen) return null
        const masterScreen = resolveMasterScreen(screen, project.screens)
        return (
          <div key={side} data-swipe-neighbour={side}>
            <ScreenThumbnail
              screen={screen}
              projectScreens={project.screens}
              masterObjects={masterScreen?.objects ?? []}
              masterScreen={masterScreen}
              screenWidth={project.screenWidth}
              screenHeight={project.screenHeight}
              projectName={project.name}
              numberSeparators={projectSeparators(project.settings)}
              deviceModel={project.settings.deviceName}
              fonts={project.fonts}
              projectAssets={project.assets}
              topics={project.topics}
              combinedTopics={project.combinedTopics}
              colorDepth={project.settings.colorDepth}
              theme={themeFor(screen, project.screens)}
              variant={variant}
              adornmentDrawingArea={project.adornmentDrawingArea}
              adornmentRotation={project.settings.rotation ?? 0}
            />
          </div>
        )
      })}
    </div>
  )
})
