"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Where devices download a project or a firmware from, said in the Deploy
 * dialog and changeable there (lib/device-address.ts, #70). The designer
 * finds the address itself; behind NAT, in a VM, the one it finds is inside
 * the VM, and a deploy stops at «Downloading» - which is exactly where
 * someone is looking when they need this.
 */
export function DeviceAddressLine() {
  const [detected, setDetected] = useState<string | null>(null)
  const [configured, setConfigured] = useState("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/device-address", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return
        setDetected(body.detected ?? null)
        setConfigured(body.configured ?? "")
      })
      .catch(() => {})
  }, [])

  if (detected === null) return null
  const shown = configured || detected

  const save = async () => {
    setError(null)
    const res = await fetch("/api/device-address", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: draft }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    if (!res || !res.ok) {
      setError(body.error || "The address could not be saved")
      return
    }
    setConfigured(body.configured ?? "")
    setEditing(false)
  }

  return (
    <div className="text-xs text-muted-foreground space-y-1" data-testid="device-address">
      {editing ? (
        <>
          <div className="flex gap-2 items-center">
            <Input
              id="deviceAddress"
              aria-label="Address devices download from"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={detected}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <p>
            For a designer in a VM behind NAT: the address of the computer around it and the port forwarded to the designer. Empty uses
            the address found here, {detected}.
          </p>
          {error && <p className="text-destructive">{error}</p>}
        </>
      ) : (
        <p>
          {`Devices download from ${shown}${configured ? " (set by hand)" : ""}. `}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setDraft(configured)
              setEditing(true)
            }}
          >
            Change address
          </button>
        </p>
      )}
    </div>
  )
}
