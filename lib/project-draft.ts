// The draft in the browser (docs/2026-09-23-explicit-save.md, "Draft in the
// browser"): while the open project has unsaved changes, a copy of it in
// IndexedDB, so a crashed, closed or reloaded tab loses nothing. A crash net
// for this browser only - it never goes to the server, and so never to the
// Pi's SD card.
//
// Every call fails soft: without IndexedDB (a private window, blocked
// storage) there is simply no draft, and the designer works as before.

import { projectNameKey } from "./project-name"

const DB_NAME = "schaltli"
const STORE = "drafts"

export interface ProjectDraft {
  // "name:<normalised name>" for a saved project, "untitled:<random>" for one
  // that has none yet.
  key: string
  name: string | null
  deviceName: string | null
  updatedAt: string
  project: unknown
}

export function draftKeyForName(name: string): string {
  return `name:${projectNameKey(name)}`
}

export function newUntitledDraftKey(): string {
  return `untitled:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function putDraft(draft: ProjectDraft): Promise<void> {
  await run("readwrite", (store) => store.put(draft))
}

export async function getDraft(key: string): Promise<ProjectDraft | null> {
  return (await run<ProjectDraft | undefined>("readonly", (store) => store.get(key))) ?? null
}

export async function deleteDraft(key: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key))
}

export async function listDrafts(): Promise<ProjectDraft[]> {
  return (await run<ProjectDraft[]>("readonly", (store) => store.getAll())) ?? []
}
