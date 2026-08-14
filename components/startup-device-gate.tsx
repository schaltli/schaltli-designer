"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { cn } from "@/lib/utils"
import { listDeviceDescriptionFiles, type DeviceDescriptionListEntry } from "@/lib/device-description"
import { DeviceScanSection } from "@/components/device-scan-section"
import { AlertTriangle, FilePlus2, ImageOff, Upload } from "lucide-react"

interface StartupDeviceGateProps {
  // Called with the chosen DDF's path when the user picks a device and confirms.
  onCreateProject: (ddfPath: string) => void | Promise<void>
  // Reuses the app's existing project-upload flow (file picker + parsing).
  onUploadProject: () => void | Promise<void>
  // Set by the parent when a create/upload attempt referenced a device that
  // isn't available on this instance, so the reason stays visible here.
  error: string | null
  creating: boolean
}

// Scales the SVG to fit its thumbnail box instead of rendering at native size.
function AdornmentThumbnail({ svg }: { svg: string | null }) {
  if (!svg) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        <ImageOff className="w-6 h-6" />
      </div>
    )
  }

  const scaledSvg = svg.replace(
    /<svg([^>]*)>/,
    '<svg$1 style="max-width: 100%; max-height: 100%; width: auto; height: auto;">',
  )

  return (
    <div
      className="w-full h-full flex items-center justify-center p-2"
      dangerouslySetInnerHTML={{ __html: scaledSvg }}
    />
  )
}

// One picker card - the adornment thumbnail, device name, and a version
// badge (so the same deviceId showing up in both sections, e.g. after a
// device announces a newer copy than the curated one, is easy to tell
// apart at a glance instead of relying on remembering which section is
// which).
function DdfCard({
  ddf,
  isSelected,
  onSelect,
}: {
  ddf: DeviceDescriptionListEntry
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // The card's visible text is the device name plus a version badge,
      // and the same deviceId legitimately appears in both sections at
      // different versions - so neither is enough to address one specific
      // card from outside. These are (see e2e/helpers.ts's chooseDevice).
      data-ddf-path={ddf.path}
      data-device-id={ddf.deviceId}
      className={cn(
        "w-full flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors text-left",
        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50",
      )}
    >
      <div className="relative w-full aspect-[4/3] bg-muted/50 rounded overflow-hidden">
        <AdornmentThumbnail svg={ddf.adornmentSvg} />
        {ddf.ddfVersion && (
          <span className="absolute top-1 right-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
            v{ddf.ddfVersion}
          </span>
        )}
      </div>
      <span className="text-sm font-medium text-center leading-tight">{ddf.deviceName}</span>
    </button>
  )
}

// A titled carousel of DdfCards - startup-device-gate.tsx no longer merges
// curated and auto-discovered entries for the same deviceId into one
// silent "winner" (see app/api/ddf/list/route.ts's header comment for why
// that was removed); instead both sources get their own section here so a
// human can see and choose which copy to use.
function DdfSection({
  title,
  source,
  entries,
  selectedDdfPath,
  onSelect,
}: {
  title: string
  source: "curated" | "auto-discovered"
  entries: DeviceDescriptionListEntry[]
  selectedDdfPath: string
  onSelect: (path: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="mb-4 last:mb-0" data-ddf-section={source}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      <Carousel opts={{ align: "start" }} className="px-10">
        <CarouselContent>
          {entries.map((ddf) => (
            <CarouselItem key={ddf.path} className="basis-1/2 sm:basis-1/3">
              <DdfCard ddf={ddf} isSelected={selectedDdfPath === ddf.path} onSelect={() => onSelect(ddf.path)} />
            </CarouselItem>
          ))}
        </CarouselContent>
        {entries.length > 3 && (
          <>
            <CarouselPrevious />
            <CarouselNext />
          </>
        )}
      </Carousel>
    </div>
  )
}

export function StartupDeviceGate({ onCreateProject, onUploadProject, error, creating }: StartupDeviceGateProps) {
  const [availableDdfs, setAvailableDdfs] = useState<DeviceDescriptionListEntry[]>([])
  const [selectedDdfPath, setSelectedDdfPath] = useState<string>("")
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const loadList = () => {
    setListLoading(true)
    setListError(null)
    listDeviceDescriptionFiles()
      .then((devices) => {
        setAvailableDdfs(devices)
        if (devices.length === 0) {
          // Not necessarily an error (the folder may genuinely be empty),
          // but log it since it silently blocks project creation otherwise.
          console.warn("[v0] No devices returned from /api/ddf/list")
        }
      })
      .catch((err) => {
        console.error("[v0] Failed to load device list:", err)
        setListError(err instanceof Error ? err.message : "Failed to load the device list.")
      })
      .finally(() => setListLoading(false))
  }

  useEffect(() => {
    loadList()
  }, [])

  // Kept per-source rather than a single deviceId->version map (which could
  // only ever remember one), since curated and auto-discovered entries for
  // the same deviceId are now both listed side by side and can carry
  // different versions - see app/api/ddf/list/route.ts's header comment.
  // DeviceScanSection only cares about the auto-discovered side (it decides
  // whether *that* copy needs refetching), so that's what it gets.
  const knownDdfVersions = new Map(
    availableDdfs
      .filter((d) => d.deviceId && d.source === "auto-discovered")
      .map((d) => [d.deviceId as string, d.ddfVersion]),
  )

  const curatedDdfs = availableDdfs.filter((d) => d.source === "curated")
  const discoveredDdfs = availableDdfs.filter((d) => d.source === "auto-discovered")

  return (
    // z-40, not higher: Radix popper content (Select dropdowns etc.) renders via
    // portal at z-50. This gate replaces the whole app (early return, nothing
    // else is mounted), so it never needs to sit above that - it only needs to
    // cover the page background, and must stay below z-50 or its own dropdowns
    // render invisibly underneath it.
    <div className="fixed inset-0 z-40 bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl py-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Welcome to ScreenBee</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Every project is tied to a device. Create a new project by choosing a device, or upload an existing
            project - its device will be loaded automatically.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="border border-border rounded-lg p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FilePlus2 className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-medium text-foreground">New Project</h2>
            </div>
            {/* Talks to a real broker on the local network - same risk
                profile as "Deploy to Device" (components/deploy-dialog.tsx),
                so gated behind the same flag. Off entirely on the public
                demo instance. */}
            {process.env.NEXT_PUBLIC_DEPLOY_ENABLED === "true" && (
              <DeviceScanSection knownDdfVersions={knownDdfVersions} onDdfFetched={loadList} />
            )}
          </div>

          {listLoading ? (
            <p className="text-sm text-muted-foreground">Loading available devices...</p>
          ) : listError ? (
            <div className="text-sm space-y-2">
              <p className="text-destructive">Could not load the device list: {listError}</p>
              <Button variant="outline" size="sm" onClick={loadList}>
                Retry
              </Button>
            </div>
          ) : availableDdfs.length === 0 ? (
            <div className="text-sm space-y-2">
              <p className="text-muted-foreground">
                No devices found in <code>public/ddf/</code>. Add a Device Description File to create a project.
              </p>
              <Button variant="outline" size="sm" onClick={loadList}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <DdfSection
                title="Server DDFs"
                source="curated"
                entries={curatedDdfs}
                selectedDdfPath={selectedDdfPath}
                onSelect={setSelectedDdfPath}
              />
              <DdfSection
                title="Announced Devices"
                source="auto-discovered"
                entries={discoveredDdfs}
                selectedDdfPath={selectedDdfPath}
                onSelect={setSelectedDdfPath}
              />

              <Button onClick={() => onCreateProject(selectedDdfPath)} disabled={!selectedDdfPath || creating} className="mt-4">
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Open an existing project file. Its device must be available on this instance.
            </p>
          </div>
          <Button variant="outline" onClick={() => onUploadProject()} disabled={creating} className="shrink-0">
            Choose File...
          </Button>
        </div>
      </div>
    </div>
  )
}
