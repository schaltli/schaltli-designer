"use client"

/**
 * The firmware half of the Deploy dialog, for the device selected there
 * (docs/2026-09-15-firmware-ota.md, step 6): what it runs, what the release
 * shipped with this designer carries for it, and the two ways to update -
 * that release, or an image from a file.
 *
 * Presentational. The dialog owns the MQTT connection and the progress view,
 * so a firmware update reports exactly like a project deploy does: the device
 * answers on the same deploy-status topic with the same states.
 *
 * Nothing installs without a click, and every install asks once more
 * (decision 7): an update restarts the device, and a wrong one may need a
 * cable to undo.
 */

import { useRef, useState } from "react"
import { FLASHER_URL } from "@/lib/factory-image.mjs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { firmwareStanding, type FirmwareStanding } from "@/lib/firmware-build"
import { parseGeneration } from "@/lib/system-generation"
import { AlertTriangle, Cpu, Upload } from "lucide-react"

export interface ReleaseImage {
  build: string
  file: string
  size: number
  sha256: string
  systemGeneration: string
  url: string
  available: boolean
}

interface FirmwareUpdateSectionProps {
  deviceName: string
  firmwareBuild?: string
  systemGeneration?: string
  release?: ReleaseImage
  busy: boolean
  error: string | null
  onInstallRelease: (release: ReleaseImage, standing: FirmwareStanding) => void
  onInstallFile: (file: File) => void
}

const STANDING_TEXT: Record<FirmwareStanding, string> = {
  "no-release": "No firmware release for this device ships with this designer.",
  "up-to-date": "Up to date with the release.",
  "update-available": "A newer firmware is available.",
  "device-ahead": "The device runs a development build newer than the release.",
}

export function FirmwareUpdateSection({
  deviceName,
  firmwareBuild,
  systemGeneration,
  release,
  busy,
  error,
  onInstallRelease,
  onInstallFile,
}: FirmwareUpdateSectionProps) {
  const [confirming, setConfirming] = useState<{ kind: "release" } | { kind: "file"; file: File } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const standing = firmwareStanding(firmwareBuild, release?.build)

  // A release reading another major than the device's firmware changes which
  // projects the device can read. Not a block - the device shows a clear
  // "redeploy" state if it can no longer read its project
  // (docs/nested-provenance.md, Fall 4) - but worth knowing before, not after.
  const generationChanges =
    release && systemGeneration && parseGeneration(release.systemGeneration).major !== parseGeneration(systemGeneration).major

  return (
    <div className="rounded-md border p-3 space-y-2" data-testid="firmware-section">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Cpu className="h-4 w-4" />
        Firmware
        {standing === "update-available" && release?.available && (
          <Badge variant="secondary" className="text-xs">
            update available
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Running</dt>
        <dd className="font-mono break-all">{firmwareBuild || "unknown"}</dd>
        {release && (
          <>
            <dt className="text-muted-foreground">Release</dt>
            <dd className="font-mono break-all">{release.build}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{STANDING_TEXT[standing]}</p>

      {release && !release.available && (
        <p className="text-xs text-amber-600">
          The release image has not been downloaded to this designer yet - run deploy/pekaway-install.sh again, or npm run
          firmware:fetch.
        </p>
      )}

      {generationChanges && (
        <p className="text-xs text-amber-600 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          This firmware reads system generation {release!.systemGeneration}, the device&apos;s current one {systemGeneration}.
          Its project may need to be deployed again afterwards.
        </p>
      )}

      {confirming ? (
        <div className="space-y-2 rounded-md bg-muted/50 p-2">
          <p className="text-xs">
            Install {confirming.kind === "release" ? release?.build : `"${confirming.file.name}"`} on {deviceName}? The device
            restarts when it is done, and keeps its current firmware if anything goes wrong.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                const c = confirming
                setConfirming(null)
                if (c.kind === "release" && release) onInstallRelease(release, standing)
                if (c.kind === "file") onInstallFile(c.file)
              }}
            >
              Install firmware
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          {release && standing !== "no-release" && (
            <Button
              size="sm"
              variant={standing === "update-available" ? "default" : "outline"}
              className="flex-1"
              disabled={busy || !release.available}
              onClick={() => setConfirming({ kind: "release" })}
            >
              {standing === "update-available" ? "Update firmware" : "Install release"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="h-3 w-3 mr-1" />
            From file...
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".bin,application/octet-stream"
            className="hidden"
            data-testid="firmware-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) setConfirming({ kind: "file", file })
            }}
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Everything above updates a device that is already running ScreenBee and
          on the broker. Someone whose brand-new board never appeared at all
          needs the other way in, and this is where they notice it is missing -
          so the way out of that dead end belongs here
          (docs/2026-09-18-factory-image.md, decision 10). */}
      <p className="text-xs text-muted-foreground">
        A board that never appeared has no ScreenBee to update yet.{" "}
        <a
          href={FLASHER_URL}
          target="_blank"
          rel="noreferrer"
          className="underline"
          data-testid="flasher-link"
        >
          Flash it over USB
        </a>{" "}
        from a computer first.
      </p>
    </div>
  )
}
