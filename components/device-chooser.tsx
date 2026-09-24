"use client"

// Choosing the device a new project is built on: step 1 of the New Project
// dialog (docs/2026-09-23-explicit-save.md). Moved here unchanged from the
// start page (startup-device-gate.tsx), which offered it directly until
// 2026-09-24.

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"
import { cn } from "@/lib/utils"
import { listDeviceDescriptionFiles, type DeviceDescriptionListEntry } from "@/lib/device-description"
import { DeviceScanSection } from "@/components/device-scan-section"
import { ddfName } from "@/lib/ddf-name"
import { DdfUrlImport } from "@/components/ddf-url-import"
import { ImageOff } from "lucide-react"

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
  onOpen,
}: {
  ddf: DeviceDescriptionListEntry
  isSelected: boolean
  onSelect: () => void
  /** Double click: pick this device and get on with it. */
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // A double click picks the device and goes on to the next step.
      // Choosing a device and then pressing a button below it is the whole
      // of this step, and for anyone who already knows which device they
      // want it is one step too many.
      //
      // The button below stays, and is still the only way on from the
      // keyboard - a double click is a mouse gesture and cannot be the sole
      // route to anything.
      onDoubleClick={onOpen}
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
        {ddfName(ddf.ddfHash) && (
          <span
            className="absolute top-1 right-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background"
            title={`DDF ${ddf.ddfHash}`}
          >
            {ddfName(ddf.ddfHash)}
          </span>
        )}
      </div>
      <span className="text-sm font-medium text-center leading-tight">{ddf.deviceName}</span>
    </button>
  )
}

// A titled carousel of DdfCards - curated and auto-discovered entries for
// the same deviceId are not merged into one silent "winner" (see
// app/api/ddf/list/route.ts's header comment for why that was removed);
// instead both sources get their own section here so a human can see and
// choose which copy to use.
function DdfSection({
  title,
  source,
  entries,
  selectedDdfPath,
  onSelect,
  onOpen,
}: {
  title: string
  source: "curated" | "auto-discovered"
  entries: DeviceDescriptionListEntry[]
  selectedDdfPath: string
  onSelect: (path: string) => void
  onOpen: (path: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="mb-4 last:mb-0" data-ddf-section={source}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{title}</h3>
      <Carousel opts={{ align: "start" }} className="px-10">
        <CarouselContent>
          {entries.map((ddf) => (
            <CarouselItem key={ddf.path} className="basis-1/2 sm:basis-1/3">
              <DdfCard
                ddf={ddf}
                isSelected={selectedDdfPath === ddf.path}
                onSelect={() => onSelect(ddf.path)}
                onOpen={() => onOpen(ddf.path)}
              />
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

export function DeviceChooser({
  selectedDdfPath,
  onSelect,
  onOpen,
}: {
  selectedDdfPath: string
  onSelect: (path: string) => void
  // A double click on a card: choose it and go on.
  onOpen: (path: string) => void
}) {
  const [availableDdfs, setAvailableDdfs] = useState<DeviceDescriptionListEntry[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  // null = liveness unknown (no broker connection yet, or the scan section
  // isn't mounted at all). See where it's consumed below for why that has to
  // be distinct from "an empty set".
  const [announcedDeviceIds, setAnnouncedDeviceIds] = useState<Set<string> | null>(null)
  const [showCached, setShowCached] = useState(false)

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

  // Kept per-source rather than a single deviceId->hash map (which could
  // only ever remember one), since curated and auto-discovered entries for
  // the same deviceId are now both listed side by side and are routinely
  // different bytes - see app/api/ddf/list/route.ts's header comment.
  // DeviceScanSection only cares about the auto-discovered side (it decides
  // whether *that* copy needs refetching), so that's what it gets.
  const knownDdfHashes = new Map(
    availableDdfs
      .filter((d) => d.deviceId && d.source === "auto-discovered")
      .map((d) => [d.deviceId as string, d.ddfHash]),
  )

  const curatedDdfs = availableDdfs.filter((d) => d.source === "curated")
  const discoveredDdfs = availableDdfs.filter((d) => d.source === "auto-discovered")

  // .data/ddf accumulates every DDF this instance ever fetched, and calling
  // all of them "Announced Devices" was simply false - a device that has
  // been unplugged for weeks looked exactly like one sitting on the desk.
  // Worse than untidy: two of them can carry the same device *name*, and
  // building a project on the wrong one binds it to a deviceId nothing will
  // ever announce, which only surfaces later as "no matching devices" in the
  // Deploy dialog (2026-08-21).
  //
  // So the section now means what it says: devices whose `hello` is on the
  // broker right now. The rest are still reachable - a device that is merely
  // switched off is a perfectly good thing to build a project for - but they
  // are folded away, because the common case is "show me what is here".
  //
  // announcedDeviceIds === null means the broker connection isn't up (or
  // DeviceScanSection isn't even mounted, e.g. deploy disabled). Then nothing
  // is known about liveness and everything is listed as before, rather than
  // an empty picker implying every device disappeared.
  const liveDdfs = announcedDeviceIds
    ? discoveredDdfs.filter((d) => d.deviceId && announcedDeviceIds.has(d.deviceId))
    : discoveredDdfs
  const cachedDdfs = announcedDeviceIds
    ? discoveredDdfs.filter((d) => !(d.deviceId && announcedDeviceIds.has(d.deviceId)))
    : []

  return (
    <div>
      {/* Talks to a real broker on the local network - same risk profile as
          "Deploy to Device" (components/deploy-dialog.tsx), so gated behind
          the same flag. Off entirely on the public demo instance. */}
      {process.env.NEXT_PUBLIC_DEPLOY_ENABLED === "true" && (
        <div className="flex justify-end mb-4">
          <DeviceScanSection
            knownDdfHashes={knownDdfHashes}
            onDdfFetched={loadList}
            onAnnouncedDevicesChange={setAnnouncedDeviceIds}
          />
        </div>
      )}

      {/* Always visible, regardless of whether any device is currently
          listed below - a fresh instance with zero curated DDFs and no live
          device announced hits exactly that empty state, and this is the
          only way in at that point. Not gated behind
          NEXT_PUBLIC_DEPLOY_ENABLED - see ddf-url-import.tsx's own header
          comment for why. */}
      <div className="mb-4">
        <DdfUrlImport onDdfFetched={loadList} />
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
            No devices available yet. Add one from a URL above, or wait for a live device to announce itself on the
            network.
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
            onSelect={onSelect}
            onOpen={onOpen}
          />
          <DdfSection
            title="Announced Devices"
            source="auto-discovered"
            entries={liveDdfs}
            selectedDdfPath={selectedDdfPath}
            onSelect={onSelect}
            onOpen={onOpen}
          />

          {cachedDdfs.length > 0 && (
            <div className="mb-4 last:mb-0">
              <button
                type="button"
                data-ddf-cached-toggle
                aria-expanded={showCached}
                onClick={() => setShowCached((prev) => !prev)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {showCached ? "Hide" : "Show"} {cachedDdfs.length} cached{" "}
                {cachedDdfs.length === 1 ? "device" : "devices"} not announcing right now
              </button>
              {showCached && (
                <div className="mt-2">
                  <DdfSection
                    title="Cached - not on the broker right now"
                    source="auto-discovered"
                    entries={cachedDdfs}
                    selectedDdfPath={selectedDdfPath}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
