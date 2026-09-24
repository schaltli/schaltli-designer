import { ProjectEditor } from "@/components/project-editor"
import { Toaster } from "@/components/ui/toaster"

// A saved project by its address, /projects/<name>
// (docs/2026-09-23-explicit-save.md, "Address"): the same editor as the start
// page, opening that project. From then on the editor keeps the address in
// step itself (history.replaceState), without navigating.
export const dynamic = "force-dynamic"

// Decoded once, and only if it still looks encoded: a name may contain "%"
// itself ("100% Licht"), which a second decode would mangle or throw on.
function nameFrom(segment: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(segment)) return segment
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return (
    <div className="h-screen w-full">
      <ProjectEditor initialName={nameFrom(name)} />
      <Toaster />
    </div>
  )
}
