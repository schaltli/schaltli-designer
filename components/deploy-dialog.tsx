"use client"

/**
 * Deploy a project straight to a physical device over MQTT, instead of the
 * "Export Project" zip download + manual setup-mode upload today's users
 * are stuck with. Design settled via a full grilling session (2026-08-01,
 * see the designer repo's plan history): the browser uploads the built zip
 * to this app's own backend (app/api/deploy), then publishes a *retained*
 * MQTT trigger naming that zip's URL + a CRC32 - the device downloads it
 * itself, verifies it, and only then applies it. No write endpoint on the
 * device at all.
 *
 * Device discovery, online/offline liveness, and live deploy progress all
 * ride the same WebSocket MQTT connection (useMqttConnection, shared with
 * components/mqtt-discovery-dialog.tsx) - no separate protocol.
 */

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DesignerVersionLine } from "@/components/designer-version-line"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, generateUuid } from "@/lib/utils"
import { useMqttConnection } from "@/hooks/use-mqtt-connection"
import { buildDeviceProjectZip } from "@/lib/project-zip"
import { exportAndroidProject } from "@/lib/android-export"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"
import { crc32 } from "@/lib/crc32"
import { loadDeviceDescriptionByPath } from "@/lib/device-description"
import { projectOnDevice } from "@/lib/project-device"
import { planDeploy, type ProjectNeed } from "@/lib/deploy-plan"
import {
  PLACEHOLDER_GENERATION,
  POPUP_GENERATION,
  LIVE_VALUE_GENERATION,
  NAVIGATOR_GENERATION,
  SYSTEM_GENERATION,
  SYSTEM_GENERATION_STRING,
  formatGeneration,
  generationBelow,
  parseGeneration,
} from "@/lib/system-generation"
import { projectUsesLivePlaceholders } from "@/lib/render-screen"
import { liveValuesNotOnDevices } from "@/lib/object-text"
import { navigatorNotOnDevices } from "@/lib/navigator-entries"
import { popupOpeners } from "@/lib/popup"
import { collectObjectTypes } from "@/lib/object-tree"
import { firmwareStanding, type FirmwareStanding } from "@/lib/firmware-build"
import { FirmwareUpdateSection, type ReleaseImage } from "./firmware-update-section"
import type { Project } from "./project-editor"
import { Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2, Rocket, AlertTriangle } from "lucide-react"

interface DeployDialogProps {
  project: Project
  children: React.ReactNode
  // Lets a successful deploy bind this project to the target device's
  // instanceId - a no-op if omitted, so this stays backward compatible with
  // any other DeployDialog caller.
  onProjectUpdate?: (project: Project) => void
  // An edit of the project, undoable like any other: moving it onto another
  // device («Switch this project to …», #62). Without it that is not offered.
  onProjectChange?: (project: Project) => void
  // Deploy saves first (docs/2026-09-23-explicit-save.md): resolves to the
  // version that is then sent and marked as deployed, or null when the save
  // was cancelled or failed - and then nothing is sent. Without it the
  // dialog deploys the project as it is and marks nothing.
  onSaveBeforeDeploy?: () => Promise<{ name: string; versionId: string; project: Project } | null>
}

interface DiscoveredDevice {
  instanceId: string
  deviceId: string
  name?: string
  firmwareVersion?: string
  // "android" for a phone, absent for a board - the device says so in its
  // own hello, the same word its DDF uses. Read before any DDF is fetched,
  // because what the firmware section may offer depends on it.
  platform?: "firmware" | "android"
  online: boolean
  // From the device's own "hello" - present only on firmware that
  // self-announces its DDF (see device-scan-section.tsx's identical
  // convention). Used below to check placed object types against this
  // specific device's actual supportedObjectTypes before deploy -
  // docs/nested-provenance.md's "Version compatibility" > Fall 2, step 3.
  ddfHash?: string
  ddfUrl?: string
  // The Systemstand the device's firmware declares it can read (see
  // lib/system-generation.ts). Checked before uploading anything, so a
  // device too old to read this project says so up front instead of after
  // downloading a zip it will refuse. Absent on firmware that doesn't
  // announce one yet - then there is nothing to check and the deploy
  // proceeds exactly as before.
  systemGeneration?: string
  // The build the device runs (docs/2026-09-15-firmware-ota.md, decision 6),
  // compared with the release shipped with this designer. Absent on firmware
  // from before 2026-09-15.
  firmwareBuild?: string
}

type DeployStatusState =
  | "queued"
  | "downloading"
  | "download_complete"
  | "verifying"
  | "applying"
  | "rebooting"
  // A phone has nothing to reboot: it puts the new screen up under whoever
  // is looking at it, and says so (2026-09-21-android-self-announce.md).
  | "applied"
  | "error"
  | "busy"
  | "up_to_date"

interface DeployStatus {
  deployId: string
  state: DeployStatusState
  percent?: number
  error?: string
}

export function DeployDialog({ project: openProject, children, onProjectUpdate, onProjectChange, onSaveBeforeDeploy }: DeployDialogProps) {
  // What the dialog shows and checks is the open project; what a deploy
  // sends is the version the save before it returned (handleDeploy).
  const project = openProject
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<Map<string, DiscoveredDevice>>(new Map())
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null)
  // The object types this project places that the selected device's live
  // description does not declare - a block, since 2026-10-10 (#66): rather
  // nothing on the device than a project with holes in it.
  const [unsupportedTypes, setUnsupportedTypes] = useState<string[]>([])
  // Where devices reach this machine, for naming the broker an offline device
  // should be set to (app/api/firmware/release).
  const [deviceHost, setDeviceHost] = useState<string | null>(null)
  // «Firmware…»: the install from a file and the release on its own, folded
  // away - Deploy brings a board up to the release by itself (#66).
  const [showFirmware, setShowFirmware] = useState(false)
  // The firmware release shipped with this designer, per device id
  // (app/api/firmware/release), and whether the progress view is showing a
  // project deploy or a firmware update - both report on deploy-status.
  const [firmwareRelease, setFirmwareRelease] = useState<Record<string, ReleaseImage>>({})
  const [firmwareReleaseTag, setFirmwareReleaseTag] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<"deploy" | "firmware">("deploy")
  const [firmwareError, setFirmwareError] = useState<string | null>(null)

  const activeDeployIdRef = useRef<string | null>(null)
  // Read inside the MQTT message handler, which is registered once per
  // connection and would only ever see the first render's statusKind.
  const activeKindRef = useRef<"deploy" | "firmware">("deploy")
  const { config, setConfig, isConnecting, isConnected, error: connectionError, connect, disconnect, clientRef } =
    useMqttConnection("schaltli-deploy")

  useEffect(() => {
    if (!open) {
      disconnect()
      setDevices(new Map())
      setSelectedInstanceId(null)
      setDeployStatus(null)
      setDeployError(null)
      setUnsupportedTypes([])
      setFirmwareError(null)
      setShowFirmware(false)
      activeDeployIdRef.current = null
      return
    }
    fetch("/api/firmware/release")
      .then((res) => (res.ok ? res.json() : { devices: {} }))
      .then((body) => {
        setFirmwareRelease(body.devices || {})
        setFirmwareReleaseTag(body.release || null)
        setDeviceHost(body.deviceHost || null)
      })
      .catch(() => {
        setFirmwareRelease({})
        setFirmwareReleaseTag(null)
      })
  }, [open])

  // Auto-connect the moment the dialog opens - the broker URL is derived
  // automatically now (useMqttConnection), so there's no real setup step
  // left for the common case. Deliberately keyed only on `open`, not
  // isConnected/isConnecting, so this fires once per dialog-open rather
  // than re-triggering as those flip during the attempt; the manual field
  // + Connect button below still work for editing/retrying.
  useEffect(() => {
    if (open && !isConnected && !isConnecting) {
      handleConnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleConnect() {
    connect()
      .then((client) => {
        client.subscribe(`${TOPIC_PREFIX}/+/hello`)
        client.subscribe(`${TOPIC_PREFIX}/+/status`)
        client.subscribe(`${TOPIC_PREFIX}/+/deploy-status`)

        client.on("message", (topic, message) => {
          const parts = topic.split("/")
          if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX) return
          const instanceId = parts[1]
          const leaf = parts[2]
          const payload = message.toString()

          if (leaf === "hello") {
            try {
              const hello = JSON.parse(payload)
              setDevices((prev) => {
                const next = new Map(prev)
                const existing = next.get(instanceId)
                next.set(instanceId, {
                  instanceId,
                  deviceId: hello.deviceId,
                  name: hello.name,
                  firmwareVersion: hello.firmwareVersion,
                  online: existing?.online ?? true,
                  ddfHash: hello.ddfHash,
                  ddfUrl: hello.url,
                  systemGeneration: hello.systemGeneration,
                  firmwareBuild: hello.firmwareBuild,
                  platform: hello.platform === "android" ? "android" : "firmware",
                })
                return next
              })
            } catch {
              // Malformed hello payload - ignore, device will retry on its own retained publish.
            }
            return
          }

          if (leaf === "status") {
            setDevices((prev) => {
              const existing = prev.get(instanceId)
              if (!existing) return prev
              const next = new Map(prev)
              next.set(instanceId, { ...existing, online: payload === "online" })
              return next
            })
            return
          }

          if (leaf === "deploy-status") {
            try {
              const status: DeployStatus = JSON.parse(payload)
              if (status.deployId !== activeDeployIdRef.current) return
              setDeployStatus(status)
              if (status.state === "error") {
                if (activeKindRef.current === "firmware") setFirmwareError(status.error || "Firmware update failed")
                else setDeployError(status.error || "Deploy failed")
              }
            } catch {
              // Malformed status payload - ignore.
            }
          }
        })
      })
      .catch(() => {
        // Error surfaced via connectionError already.
      })
  }

  // Every device on the broker, this project's first (#62). Until 2026-10-10
  // only those with the project's deviceId were listed, and when there was
  // none a line of device ids said what was announcing instead: tester Arno,
  // with a project made for the 4.3B and only an Android tablet, never found
  // his tablet here and loaded a board export into the app by hand, where it
  // came out cut off and without its buttons. Now the tablet is listed, says
  // what it is, and offers to move the project onto it.
  const isProjectDevice = (d: DiscoveredDevice) => d.deviceId === project.settings.deviceId
  const listedDevices = Array.from(devices.values()).sort((x, y) => Number(isProjectDevice(y)) - Number(isProjectDevice(x)))
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switchedNote, setSwitchedNote] = useState<string | null>(null)

  // Checks the selected device's *live* supportedObjectTypes (fetched
  // fresh via the same /api/ddf/fetch proxy device-scan-section.tsx uses,
  // not whatever might already be cached from project creation - a
  // device's DDF can have moved on since then) against what this project
  // actually places, once a device that self-announces its DDF is
  // selected. docs/nested-provenance.md's "Version compatibility" > Fall
  // 2, step 3. Best-effort: any failure here (fetch error, or a device
  // whose hello carries no DDF url at all) just leaves the warning
  // unset rather than blocking anything - the device's own graceful
  // skip-unknown-type fallback (ColorScreenRenderer.cpp's "not
  // implemented yet, skipping") is still the real safety net, this is
  // only meant to save the user from discovering it by staring at a
  // device that's silently missing a widget.
  useEffect(() => {
    setUnsupportedTypes([])
    if (!selectedInstanceId) return
    const device = devices.get(selectedInstanceId)
    // Another device than the project's: nothing to check against until the
    // project is moved onto it.
    if (!device?.ddfUrl || device.deviceId !== project.settings.deviceId) return

    let cancelled = false
    ;(async () => {
      try {
        const fetchRes = await fetch("/api/ddf/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: device.deviceId, ddfHash: device.ddfHash, url: device.ddfUrl }),
        })
        if (!fetchRes.ok || cancelled) return

        const fields = await loadDeviceDescriptionByPath(`/api/ddf/data/${device.deviceId}.ddf.zip`)
        if (cancelled) return

        const placedTypes = project.screens.reduce(
          (set, screen) => collectObjectTypes(screen.objects, set),
          new Set<string>(),
        )
        setUnsupportedTypes(Array.from(placedTypes).filter((type) => !fields.supportedObjectTypes.includes(type)))
      } catch {
        // Best-effort - see this effect's own comment.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedInstanceId, devices, project.screens, project.settings.deviceId])

  // A message the device sends, awaited: resolves with it, or with null after
  // `ms`. Registered before the trigger it answers is published, so a quick
  // answer is not missed.
  const awaitMessage = (match: (leaf: string, instanceId: string, payload: string) => boolean, ms: number) => {
    const client = clientRef.current
    return new Promise<string | null>((resolve) => {
      if (!client) return resolve(null)
      const onMessage = (topic: string, message: { toString(): string }) => {
        const [prefix, instanceId, leaf] = topic.split("/")
        if (prefix !== TOPIC_PREFIX) return
        const payload = message.toString()
        if (match(leaf, instanceId, payload)) done(payload)
      }
      const timer = setTimeout(() => done(null), ms)
      function done(value: string | null) {
        clearTimeout(timer)
        client!.removeListener("message", onMessage)
        resolve(value)
      }
      client.on("message", onMessage)
    })
  }
  const statusOf = (payload: string): DeployStatus | null => {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  // Published on the device's `leaf` topic, retained as the device contract
  // has it - and taken back if the device has not answered within
  // RESPONSE_MS: nothing is left lying on the broker for a device to pick up
  // days later (#66). The device clears the trigger itself as it takes it.
  const publishTrigger = async (instanceId: string, leaf: "deploy" | "firmware", id: string, body: object) => {
    const answered = awaitMessage(
      (l, i, payload) => l === "deploy-status" && i === instanceId && statusOf(payload)?.deployId === id,
      RESPONSE_MS,
    )
    clientRef.current?.publish(`${TOPIC_PREFIX}/${instanceId}/${leaf}`, JSON.stringify(body), { retain: true, qos: 1 })
    if (await answered) return true
    if (activeDeployIdRef.current !== id) return false
    clientRef.current?.publish(`${TOPIC_PREFIX}/${instanceId}/${leaf}`, "", { retain: true, qos: 1 })
    setDeployStatus({ deployId: id, state: "error", error: "The device did not respond. Nothing was sent; check that it is on and try again." })
    return false
  }

  const handleDeploy = async () => {
    if (!selectedInstanceId || !clientRef.current || !plan) return
    if (plan.kind !== "deploy" && plan.kind !== "update-and-deploy") return
    const instanceId = selectedInstanceId
    const device = selectedDevice
    setIsDeploying(true)
    setDeployError(null)
    setDeployStatus(null)

    try {
      // Saved first, and the saved version is what goes out - after a first
      // save it carries the new name the project-name placeholder shows.
      const saved = onSaveBeforeDeploy ? await onSaveBeforeDeploy() : null
      if (onSaveBeforeDeploy && !saved) return
      const project = saved?.project ?? openProject

      // Before uploading anything: a device whose firmware is an older
      // major can't read what this designer writes, and would refuse the
      // project after downloading the whole zip - with the refusal visible
      // only in its own logs. Only an older *major* blocks; a newer one
      // reads this project fine, and a newer minor is additive by
      // definition (see lib/system-generation.ts). A board about to be
      // updated is judged by the release it gets.
      const release = device ? firmwareRelease[device.deviceId] : undefined
      const deviceGeneration = plan.kind === "update-and-deploy" ? release?.systemGeneration : device?.systemGeneration
      if (deviceGeneration !== undefined && parseGeneration(deviceGeneration).major < SYSTEM_GENERATION.major) {
        throw new Error(
          `"${device?.name || device?.deviceId}" runs system generation ` +
            `${formatGeneration(parseGeneration(deviceGeneration))}, which can't read a ${SYSTEM_GENERATION_STRING} ` +
            `project - flash its firmware to a ${SYSTEM_GENERATION.major}.x build before deploying.`,
        )
      }

      // The board up to this designer's release first (#66): the update,
      // then the board back announcing that build, then the project. Any
      // step that fails ends here, and the project is not sent.
      if (plan.kind === "update-and-deploy" && device && release) {
        const updateId = generateUuid()
        activeDeployIdRef.current = updateId
        activeKindRef.current = "firmware"
        setStatusKind("firmware")
        setDeployStatus({ deployId: updateId, state: "downloading", percent: 0 })
        const finished = awaitMessage(
          (l, i, payload) => {
            const status = l === "deploy-status" && i === instanceId ? statusOf(payload) : null
            return !!status && status.deployId === updateId && ["rebooting", "error", "busy", "up_to_date"].includes(status.state)
          },
          FIRMWARE_MS,
        )
        const back = awaitMessage((l, i, payload) => {
          if (l !== "hello" || i !== instanceId) return false
          try {
            return JSON.parse(payload).firmwareBuild === release.build
          } catch {
            return false
          }
        }, FIRMWARE_MS + RETURN_MS)
        const answered = await publishTrigger(instanceId, "firmware", updateId, {
          updateId,
          url: release.url,
          sha256: release.sha256,
          size: release.size,
          deviceId: device.deviceId,
          build: release.build,
          force: false,
        })
        if (!answered) return
        const end = statusOf((await finished) ?? "")
        if (!end) {
          setDeployStatus({ deployId: updateId, state: "error", error: "The firmware update did not finish. The project was not sent." })
          return
        }
        if (end.state === "error" || end.state === "busy") {
          setDeployStatus({ ...end, error: `${end.error || "The firmware update failed"}. The project was not sent.` })
          return
        }
        if (end.state === "rebooting" && !(await back)) {
          setDeployStatus({
            deployId: updateId,
            state: "error",
            error: `The device did not come back with ${release.build}. The project was not sent.`,
          })
          return
        }
      }

      // A phone takes the same bundle the Export button writes for it -
      // JSON and PNGs, not the firmware's BMP/PBM - because the app that
      // reads it is the same either way (lib/android-export.ts, and
      // docs/2026-09-21-android-self-announce.md for why it is deployed at
      // all now). Which one is asked of the device being deployed to - its
      // hello says "platform":"android" - and only failing that of the
      // project: a project made for a board and moved to a phone kept the
      // board's platform, and the phone was sent BMPs with a white or black
      // box baked around every Switch icon (2026-09-27, in the van).
      const toPhone = device?.platform === "android" || project.settings.devicePlatform === "android"
      const zipBlob = toPhone ? await exportAndroidProject(project) : await buildDeviceProjectZip(project)
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
      const checksum = crc32(zipBytes)

      const formData = new FormData()
      formData.append("instanceId", instanceId)
      formData.append("file", zipBlob, "project.zip")

      const res = await fetch("/api/deploy", { method: "POST", body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${res.status})`)
      }
      // The server determines this URL (from its own network interfaces,
      // see lib/server-lan-address.ts), not window.location.origin - a
      // browser reached via http://localhost:3000 would otherwise hand
      // the device a URL that only ever resolves back to the device
      // itself (2026-08-01, reported live: exactly this happened).
      const { url } = await res.json()

      const deployId = generateUuid()
      activeDeployIdRef.current = deployId
      activeKindRef.current = "deploy"
      setStatusKind("deploy")
      // The device is online (#66: nothing goes to one that is not), so the
      // download is what comes; if it does not answer, publishTrigger says
      // so and takes the trigger back.
      setDeployStatus({ deployId, state: "downloading", percent: 0 })
      const answered = await publishTrigger(instanceId, "deploy", deployId, { deployId, url, crc32: checksum })
      if (!answered) return

      // Bind this project to the device it was just sent to, and mark the
      // saved version as what is on that device (which also points the
      // device at this project server-side, app/api/by-instance/). Best-
      // effort: a failed marker shouldn't fail the deploy itself, which has
      // already genuinely succeeded by this point.
      const boundProject: Project = {
        ...project,
        settings: {
          ...project.settings,
          boundInstanceId: instanceId,
          // Deliberately does *not* refresh settings.ddfHash from the
          // device's hello (the ddfVersion equivalent did, until
          // 2026-08-21). The hash records which DDF this project's fields
          // were actually derived from; copying the device's current one in
          // at deploy time would claim a project had been rebuilt against a
          // DDF it never saw - the precise lie an identity is supposed to
          // make impossible. It changes when the DDF is genuinely reloaded,
          // and not otherwise.
        },
      }
      onProjectUpdate?.(boundProject)
      if (saved) {
        fetch(`/api/projects/${encodeURIComponent(saved.name)}/deploys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: saved.versionId,
            instanceId,
            deviceName: device?.name || instanceId,
          }),
        }).catch(() => {})
      }
    } catch (error) {
      setDeployError(error instanceof Error ? error.message : "Deploy failed")
    } finally {
      setIsDeploying(false)
    }
  }

  // A firmware update, triggered exactly like a deploy: a retained message on
  // the device's firmware topic that it acts on now or on its next reconnect,
  // with progress on deploy-status under the same id (the firmware's
  // FirmwareUpdater, device-contract.md §4).
  const publishFirmwareUpdate = (fields: {
    url: string
    sha256: string
    size: number
    deviceId: string
    build?: string
    force: boolean
  }) => {
    if (!selectedInstanceId || !clientRef.current) return
    const updateId = generateUuid()
    activeDeployIdRef.current = updateId
    activeKindRef.current = "firmware"
    setStatusKind("firmware")
    setDeployStatus({ deployId: updateId, state: "downloading", percent: 0 })
    void publishTrigger(selectedInstanceId, "firmware", updateId, { updateId, ...fields })
  }

  const handleInstallRelease = (release: ReleaseImage, standing: FirmwareStanding) => {
    if (!selectedDevice) return
    setFirmwareError(null)
    publishFirmwareUpdate({
      url: release.url,
      sha256: release.sha256,
      size: release.size,
      deviceId: selectedDevice.deviceId,
      build: release.build,
      // Only an update to a newer release may be answered "up_to_date".
      // Installing the release over a development build, or over itself, is
      // a deliberate choice the device should carry out.
      force: standing !== "update-available",
    })
  }

  const handleInstallFile = async (file: File) => {
    if (!selectedDevice || !selectedInstanceId) return
    setFirmwareError(null)
    setIsDeploying(true)
    try {
      const formData = new FormData()
      formData.append("instanceId", selectedInstanceId)
      formData.append("deviceId", selectedDevice.deviceId)
      formData.append("file", file, file.name)
      const res = await fetch("/api/firmware/upload", { method: "POST", body: formData })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`)
      // Forced: a development build can carry the same build id as what runs,
      // a -dirty one especially, and still be a different image.
      publishFirmwareUpdate({ url: body.url, sha256: body.sha256, size: body.size, deviceId: body.deviceId, force: true })
    } catch (error) {
      setFirmwareError(error instanceof Error ? error.message : "Firmware upload failed")
    } finally {
      setIsDeploying(false)
    }
  }

  const selectedDevice = selectedInstanceId ? devices.get(selectedInstanceId) : null
  // A device the project is not made for: chosen, explained, never deployed to.
  const selectedForeign = !!selectedDevice && !isProjectDevice(selectedDevice)
  const deployTarget = selectedForeign ? null : selectedDevice

  // «Switch this project to …»: what Settings › Device › Load Device does
  // (lib/project-device.ts), with this device's description fetched fresh as
  // the type check above fetches it.
  const handleSwitchToDevice = async () => {
    if (!selectedDevice || !onProjectChange) return
    const device = selectedDevice
    setSwitching(true)
    setSwitchError(null)
    try {
      if (device.ddfUrl) {
        const res = await fetch("/api/ddf/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: device.deviceId, ddfHash: device.ddfHash, url: device.ddfUrl }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Could not fetch its device description (${res.status})`)
        }
      }
      const fields = await loadDeviceDescriptionByPath(`/api/ddf/data/${device.deviceId}.ddf.zip`)
      const before = `${project.screenWidth}×${project.screenHeight}`
      const moved = projectOnDevice(project, fields)
      onProjectChange(moved.project)
      const after = `${moved.screenWidth}×${moved.screenHeight}`
      setSwitchedNote(
        `This project is now made for "${device.name || fields.deviceName}". ` +
          (before === after
            ? "Its screen is the same size. "
            : `Its screen is ${after} instead of ${before}: objects stayed where they were and may lie outside or look different. `) +
          (moved.rotationWasReset ? "The rotation went back to 0°, the device does not offer it. " : "") +
          "Check your screens before you deploy.",
      )
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Switching the project failed")
    } finally {
      setSwitching(false)
    }
  }
  // What the project needs of a device, and so what Deploy does with the one
  // chosen (lib/deploy-plan.ts, #66).
  const popupOpenerNames = popupOpeners(project)
  const liveValueTexts = liveValuesNotOnDevices(project)
  const navigatorParts = navigatorNotOnDevices(project as any)
  const needs: ProjectNeed[] = [
    ...(projectUsesLivePlaceholders(project) ? [{ generation: PLACEHOLDER_GENERATION, parts: ["values in texts"] }] : []),
    ...(popupOpenerNames.length > 0 ? [{ generation: POPUP_GENERATION, parts: [`popups (${popupOpenerNames.join(", ")})`] }] : []),
    ...(liveValueTexts.length > 0 ? [{ generation: LIVE_VALUE_GENERATION, parts: liveValueTexts }] : []),
    ...(navigatorParts.length > 0 ? [{ generation: NAVIGATOR_GENERATION, parts: navigatorParts }] : []),
  ]
  const plan = deployTarget
    ? planDeploy({
        device: {
          name: deployTarget.name || deployTarget.instanceId,
          platform: deployTarget.platform,
          online: deployTarget.online,
          systemGeneration: deployTarget.systemGeneration,
          firmwareBuild: deployTarget.firmwareBuild,
          firmwareVersion: deployTarget.firmwareVersion,
        },
        release: firmwareRelease[deployTarget.deviceId],
        needs,
        unsupportedTypes,
      })
    : null

  return (
    <>
      <div onClick={() => setOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4" />
              Deploy to Device
            </DialogTitle>
          </DialogHeader>

          {!isConnected ? (
            <div className="py-4 space-y-3">
              <div>
                <label htmlFor="deploy-broker-url" className="text-sm font-medium">
                  MQTT WebSocket URL
                </label>
                <Input
                  id="deploy-broker-url"
                  value={config.websocketUrl}
                  onChange={(e) => setConfig({ ...config, websocketUrl: e.target.value })}
                  placeholder="ws://192.168.1.10:9001"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Same broker your devices publish to - shared with the MQTT Discovery dialog.
                </p>
              </div>
              {connectionError && <p className="text-sm text-destructive">{connectionError}</p>}
              <Button onClick={handleConnect} disabled={isConnecting || !config.websocketUrl} className="w-full">
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          ) : deployStatus ? (
            <div className="py-4 space-y-4">
              <DeployProgress
                status={deployStatus}
                deviceName={selectedDevice?.name || selectedInstanceId || ""}
                kind={statusKind}
              />
              {(deployStatus.state === "error" || deployStatus.state === "busy" || deployStatus.state === "up_to_date") &&
                !isDeploying && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDeployStatus(null)}>
                      Back
                    </Button>
                    {(deployStatus.state === "error" || deployStatus.state === "busy") && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setDeployStatus(null)
                          void handleDeploy()
                        }}
                      >
                        Try again
                      </Button>
                    )}
                  </div>
                )}
            </div>
          ) : (
            <div className="space-y-4">
              {!project.settings.deviceId && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  This project has no device assigned - open Project Settings and pick one first.
                </p>
              )}

              {/* A plain scrolling box: since every device on the broker is
                  listed (#62) the list can be long, and the ScrollArea grew
                  past its max height over the controls below it. */}
              <div className="max-h-64 overflow-y-auto" data-testid="deploy-devices">
                {listedDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No devices on the broker yet. Listening...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {listedDevices.map((device) => (
                      <button
                        key={device.instanceId}
                        data-testid="deploy-device"
                        onClick={() => {
                          setSelectedInstanceId(device.instanceId)
                          setSwitchError(null)
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm border",
                          selectedInstanceId === device.instanceId ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        {device.online ? (
                          <Wifi className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className={cn("flex-1 truncate", (!isProjectDevice(device) || !device.online) && "text-muted-foreground")}>
                          {device.name || device.instanceId}
                        </span>
                        {!isProjectDevice(device) && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            Other device
                          </Badge>
                        )}
                        {!device.online && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            offline
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {switchedNote && (
                <p className="text-sm text-amber-700 dark:text-amber-400" data-testid="switched-device-note">
                  {switchedNote}
                </p>
              )}

              {selectedForeign && selectedDevice && (
                <div className="rounded-md border border-amber-500/50 p-3 space-y-2" data-testid="foreign-device">
                  <p className="text-sm">
                    {`This project is made for ${project.settings.deviceName || project.settings.deviceId || "another device"} (${project.screenWidth}×${project.screenHeight}). `}
                    {`"${selectedDevice.name || selectedDevice.instanceId}" is a different device: the project would not fit it, so it cannot be deployed there as it is.`}
                  </p>
                  {onProjectChange && (
                    <Button size="sm" variant="outline" onClick={handleSwitchToDevice} disabled={switching}>
                      {switching ? "Switching..." : `Switch this project to "${selectedDevice.name || selectedDevice.instanceId}"`}
                    </Button>
                  )}
                  {switchError && <p className="text-sm text-destructive">{switchError}</p>}
                </div>
              )}

              {/* What Deploy will do (lib/deploy-plan.ts, #66): one line, or
                  why it cannot and what to do about it. */}
              {plan?.kind === "offline" && selectedDevice && (
                <p className="text-sm text-muted-foreground" data-testid="device-offline">
                  {`"${selectedDevice.name || selectedDevice.instanceId}" is offline. Switch it on and check that it is on the same network as this designer, with the broker set to ${deviceHost ?? "this designer's address"}:1883.`}
                </p>
              )}
              {plan?.kind === "blocked" && (
                <div className="text-sm text-amber-700 dark:text-amber-400 space-y-1" data-testid="deploy-blocked">
                  <p>{plan.reason}</p>
                  {plan.link && (
                    <a href={plan.link.url} target="_blank" rel="noreferrer" className="underline">
                      {plan.link.label}
                    </a>
                  )}
                </div>
              )}
              {(plan?.kind === "deploy" || plan?.kind === "update-and-deploy") && (
                <p className="text-sm text-muted-foreground" data-testid="firmware-line">
                  {plan.line}
                </p>
              )}

              {/* «Firmware…»: a firmware from a file, or the release on its
                  own - for a board, while it is online. */}
              {selectedDevice && selectedDevice.platform !== "android" && selectedDevice.online && (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setShowFirmware((v) => !v)}
                  >
                    Firmware...
                  </button>
                  {showFirmware && (
                    <FirmwareUpdateSection
                      deviceName={selectedDevice.name || selectedDevice.instanceId}
                      platform={selectedDevice.platform}
                      firmwareBuild={selectedDevice.firmwareBuild}
                      systemGeneration={selectedDevice.systemGeneration}
                      release={firmwareRelease[selectedDevice.deviceId]}
                      busy={isDeploying}
                      error={firmwareError}
                      onInstallRelease={handleInstallRelease}
                      onInstallFile={handleInstallFile}
                    />
                  )}
                </div>
              )}

              {deployError && <p className="text-sm text-destructive">{deployError}</p>}

              <Button
                onClick={handleDeploy}
                disabled={
                  !selectedInstanceId ||
                  isDeploying ||
                  !project.settings.deviceId ||
                  (plan?.kind !== "deploy" && plan?.kind !== "update-and-deploy")
                }
                className="w-full"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Working...
                  </>
                ) : plan?.kind === "update-and-deploy" ? (
                  "Update & Deploy"
                ) : (
                  "Deploy"
                )}
              </Button>
            </div>
          )}

          <DesignerVersionLine firmwareRelease={firmwareReleaseTag} className="border-t pt-2" />
        </DialogContent>
      </Dialog>
    </>
  )
}

// How long a device has to answer a trigger before it is taken back (#66).
const RESPONSE_MS = 30_000
// How long a firmware download and install may take, and the board then to
// come back announcing the new build.
const FIRMWARE_MS = 10 * 60_000
const RETURN_MS = 3 * 60_000

const STATE_LABELS: Record<DeployStatusState, string> = {
  queued: "Offline - will apply automatically when the device reconnects",
  downloading: "Downloading",
  download_complete: "Download complete",
  verifying: "Verifying",
  applying: "Applying",
  rebooting: "Rebooting",
  applied: "Done",
  error: "Failed",
  busy: "Device is busy with another deploy",
  up_to_date: "Already up to date",
}

function DeployProgress({
  status,
  deviceName,
  kind,
}: {
  status: DeployStatus
  deviceName: string
  kind: "deploy" | "firmware"
}) {
  const isDone = status.state === "rebooting" || status.state === "applied"
  const isError = status.state === "error" || status.state === "busy"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {isError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : status.state === "queued" ? (
          <WifiOff className="h-4 w-4 text-muted-foreground" />
        ) : isDone || status.state === "up_to_date" ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        <span>
          {deviceName}: {kind === "firmware" ? `Firmware update - ${STATE_LABELS[status.state]}` : STATE_LABELS[status.state]}
        </span>
      </div>

      {status.state === "downloading" && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${status.percent ?? 0}%` }}
          />
        </div>
      )}

      {status.error && <p className="text-sm text-destructive">{status.error}</p>}
    </div>
  )
}
