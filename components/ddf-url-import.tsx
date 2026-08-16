"use client"

/**
 * Manual "add a device from a URL" form (2026-08-16, see
 * docs/device-contract.md) - the other half of decoupling the designer from
 * any baked-in device knowledge, alongside device-scan-section.tsx's live
 * MQTT auto-discovery. Same target endpoint (app/api/ddf/fetch), just
 * without a prior `hello` to supply deviceId/ddfVersion from - the route
 * treats an omitted deviceId as trust-on-first-use, deriving it from the
 * fetched DDF's own manifest instead of cross-checking it.
 *
 * Always rendered (not gated behind NEXT_PUBLIC_DEPLOY_ENABLED like
 * DeviceScanSection) - that flag exists because DeviceScanSection talks to
 * a local MQTT broker; this is a plain server-side HTTP fetch with its own
 * SSRF guard, a different risk profile.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus } from "lucide-react"

interface DdfUrlImportProps {
  // Called after a successful import, so the Startup Gate's device list
  // picks up the newly-cached DDF - same callback shape as
  // DeviceScanSection's onDdfFetched.
  onDdfFetched: () => void
}

export function DdfUrlImport({ onDdfFetched }: DdfUrlImportProps) {
  const { toast } = useToast()
  const [url, setUrl] = useState("")
  const [importing, setImporting] = useState(false)

  const handleImport = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setImporting(true)
    try {
      const res = await fetch("/api/ddf/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Import failed (${res.status})`)
      }
      setUrl("")
      onDdfFetched()
      toast({ title: "Device added" })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't import device description",
        description: err instanceof Error ? err.message : "DDF import failed",
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="url"
        placeholder="Add device from URL (e.g. a GitHub-hosted .ddf.zip)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !importing) handleImport()
        }}
        disabled={importing}
        className="h-8 text-sm"
        data-testid="ddf-url-import-input"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={importing || !url.trim()}
        data-testid="ddf-url-import-submit"
      >
        {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add
      </Button>
    </div>
  )
}
