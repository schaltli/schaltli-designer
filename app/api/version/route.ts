import { NextResponse } from "next/server"
import { DESIGNER_BUILD } from "@/lib/designer-build"
import { readFirmwareRelease } from "@/lib/firmware-release"
import { SYSTEM_GENERATION_STRING } from "@/lib/system-generation"
import { isDemo, refuseInDemo } from "@/lib/demo-mode"

// GET /api/version - what this designer is, without an SSH session. Three
// separate things, deliberately not merged into one number
// (lib/designer-build.ts):
//
//   designer          the commit this was built from - a designer is updated by
//                     git pull, so that is its identity
//   systemGeneration  the one number it shares with the firmware: whether the
//                     two can work together at all
//   firmware          the firmware release whose manifest it ships, and that
//                     release's own commit in the firmware repository
//
// Asking a van's designer over HTTP is the point, so nothing here is cached.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const release = await readFirmwareRelease()
  return NextResponse.json({
    designer: DESIGNER_BUILD,
    systemGeneration: SYSTEM_GENERATION_STRING,
    firmware: { release: release.release, commit: release.commit ?? null },
    // Whether this is demo.schaltli.com's demo mode (lib/demo-mode.ts): the
    // client asks here rather than a build-time flag, so one build serves
    // both and the tests can switch it per request.
    ...(isDemo(request) ? { demo: true } : {}),
  })
}
