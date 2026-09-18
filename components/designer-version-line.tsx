"use client"

/**
 * One line saying what this designer is, for the question that otherwise needs
 * an SSH session: "is my Pi up to date?"
 *
 * Three separate things, side by side rather than merged into one number
 * (lib/designer-build.ts explains why): the commit this designer was built
 * from, the system generation it speaks - the one number it shares with the
 * firmware - and the firmware release whose manifest it carries.
 *
 * The same three are served by GET /api/version for anyone asking a van's
 * designer without a browser.
 */

import { DESIGNER_BUILD, formatDesignerBuild } from "@/lib/designer-build"
import { SYSTEM_GENERATION_STRING } from "@/lib/system-generation"

interface DesignerVersionLineProps {
  /** The release named by firmware/manifest.json, when the caller already has it. */
  firmwareRelease?: string | null
  className?: string
}

export function DesignerVersionLine({ firmwareRelease, className }: DesignerVersionLineProps) {
  return (
    <p className={`text-xs text-muted-foreground ${className || ""}`} data-testid="designer-version">
      Designer {formatDesignerBuild(DESIGNER_BUILD)}
      {" · "}system {SYSTEM_GENERATION_STRING}
      {" · "}firmware {firmwareRelease ? firmwareRelease : "no release shipped"}
    </p>
  )
}
