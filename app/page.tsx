import { ProjectEditor } from "@/components/project-editor"
import { Toaster } from "@/components/ui/toaster"

export default function Home() {
  return (
    <div className="h-screen w-full">
      <ProjectEditor />
      <Toaster />
    </div>
  )
}
