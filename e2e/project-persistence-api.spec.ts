import { test, expect } from "@playwright/test"

// API-level coverage for app/api/projects/* (added 2026-08-02: server-side
// autosave, version-history checkpoints, and the by-instanceId reverse
// lookup). Hit directly via request rather than through the UI:
//
// - by-instance/[instanceId] has no UI caller yet in this session's work
//   (deploy-dialog.tsx only *writes* the reverse index via autosave; nothing
//   reads it back through the editor UI), so there's no browser flow to
//   drive it through.
// - the id/timestamp validation (isValidProjectId/isValidInstanceId,
//   VALID_TIMESTAMP in lib/deploy-utils.ts and the versions/[timestamp]
//   route) exists specifically to keep untrusted route params from ever
//   reaching a filesystem path join - worth locking in directly rather than
//   only incidentally via a UI flow that never sends a malformed id.
test.describe("Projects persistence API", () => {
  test("autosave, versions, and by-instance round-trip for a valid id", async ({ request }, testInfo) => {
    const projectId = `e2e-api-${testInfo.testId}`
    const instanceId = `e2e-api-instance-${testInfo.testId}`
    const project = {
      name: "API Test Project",
      settings: { projectId, boundInstanceId: instanceId },
    }

    const autosavePost = await request.post(`/api/projects/${projectId}/autosave`, { data: project })
    expect(autosavePost.ok()).toBe(true)

    const autosaveGet = await request.get(`/api/projects/${projectId}/autosave`)
    expect(autosaveGet.ok()).toBe(true)
    expect((await autosaveGet.json()).name).toBe("API Test Project")

    // The reverse index is kept current on every autosave, not just on deploy.
    const byInstance = await request.get(`/api/projects/by-instance/${instanceId}`)
    expect(byInstance.ok()).toBe(true)
    expect((await byInstance.json()).projectId).toBe(projectId)

    const versionPost = await request.post(`/api/projects/${projectId}/versions`, { data: project })
    expect(versionPost.ok()).toBe(true)
    const { timestamp } = await versionPost.json()
    expect(timestamp).toBeTruthy()

    const versionsList = await request.get(`/api/projects/${projectId}/versions`)
    expect(versionsList.ok()).toBe(true)
    const { versions } = await versionsList.json()
    expect(versions.some((v: { timestamp: string; projectName?: string }) => v.timestamp === timestamp && v.projectName === "API Test Project")).toBe(true)

    const versionGet = await request.get(`/api/projects/${projectId}/versions/${timestamp}`)
    expect(versionGet.ok()).toBe(true)
    expect((await versionGet.json()).name).toBe("API Test Project")

    const missingVersion = await request.get(`/api/projects/${projectId}/versions/not-a-real-timestamp`)
    expect(missingVersion.status()).toBe(404)
  })

  test("unknown project/instance ids 404 instead of erroring", async ({ request }, testInfo) => {
    const unknown = await request.get(`/api/projects/e2e-api-never-saved-${testInfo.testId}/autosave`)
    expect(unknown.status()).toBe(404)

    const unknownInstance = await request.get(`/api/projects/by-instance/e2e-api-never-bound-${testInfo.testId}`)
    expect(unknownInstance.status()).toBe(404)
  })

  test("rejects malformed ids with 400 rather than touching the filesystem", async ({ request }) => {
    const badProjectId = await request.get("/api/projects/has space/autosave")
    expect(badProjectId.status()).toBe(400)

    const dottedProjectId = await request.get("/api/projects/with.dot/autosave")
    expect(dottedProjectId.status()).toBe(400)

    const badInstanceId = await request.get("/api/projects/by-instance/bad!id")
    expect(badInstanceId.status()).toBe(400)

    const badTimestamp = await request.get("/api/projects/some-valid-id/versions/bad@char")
    expect(badTimestamp.status()).toBe(400)
  })
})
