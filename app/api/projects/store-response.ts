import { gzipSync } from "node:zlib"
import { NextResponse } from "next/server"
import { createProjectStore, ProjectStoreError } from "@/lib/project-store"

// Shared by the routes under app/api/projects/ and app/api/by-instance/
// (docs/2026-09-23-explicit-save.md, "API"). The routes stay thin: read the
// request, call the store, turn its errors into status codes here.

export const projectStore = createProjectStore()

const STATUS: Record<ProjectStoreError["code"], number> = {
  "invalid-name": 400,
  "invalid-version": 400,
  "invalid-instance": 400,
  "not-found": 404,
  taken: 409,
}

export function storeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProjectStoreError) {
    const body: Record<string, string> = { error: error.message, code: error.code }
    if (error.existingName) body.name = error.existingName
    return NextResponse.json(body, { status: STATUS[error.code] })
  }
  throw error
}

// A whole project as JSON, gzipped when the browser takes it. Next's own
// compression leaves route handlers' responses alone, and a project with its
// fonts and images runs to a few MB, halved by gzip - which matters over the
// van's router on a weak link, where a long download gets cut (2026-10-19).
export function projectJson(request: Request, body: unknown): Response {
  if (!/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) return NextResponse.json(body)
  return new Response(new Uint8Array(gzipSync(JSON.stringify(body))), {
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", Vary: "Accept-Encoding" },
  })
}

// A project as the client sends it: a JSON object, nothing else.
export function asProject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function badProject(): NextResponse {
  return NextResponse.json({ error: "Invalid project JSON", code: "invalid-project" }, { status: 400 })
}
