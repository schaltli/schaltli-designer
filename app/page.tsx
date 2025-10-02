import { ScreenmanEditor } from "@/components/screenman-editor"
import { Toaster } from "@/components/ui/toaster"

export default function Home() {
  return (
    <div className="h-screen w-full">
      <ScreenmanEditor />
      <Toaster />
    </div>
  )
}
