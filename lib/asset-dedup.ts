/**
 * One file per picture in a device's project zip.
 *
 * The export bakes a picture per screen, object and variant - a master's
 * switch icon once for every screen that shows it, light and dark, normal
 * and active - and many come out byte for byte the same: the starter on the
 * 4" carried 278 files with 88 different contents (2026-11-15). Every file
 * costs a board's LittleFS time to create, find and delete, and the 4"
 * then took over three minutes to install it, unanswering all the while.
 *
 * So identical files go into the zip once, under the first name, and every
 * path in project.json that named another copy names that one instead.
 */

import type JSZip from "jszip"

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Removes every file under `assets/` whose bytes another file there already
 * has, keeping the first by name. Returns what each removed path (as
 * project.json writes it, "assets/<name>") now is.
 */
export async function dedupAssets(zip: JSZip): Promise<Map<string, string>> {
  const files = zip.file(/^assets\//).filter((f) => !f.dir).sort((a, b) => a.name.localeCompare(b.name))
  const kept = new Map<number, Array<{ name: string; bytes: Uint8Array }>>()
  const moved = new Map<string, string>()
  for (const file of files) {
    const bytes = await file.async("uint8array")
    const sameSize = kept.get(bytes.length) ?? []
    const twin = sameSize.find((k) => sameBytes(k.bytes, bytes))
    if (twin) {
      moved.set(file.name, twin.name)
      zip.remove(file.name)
    } else {
      sameSize.push({ name: file.name, bytes })
      kept.set(bytes.length, sameSize)
    }
  }
  return moved
}

/** project.json's text with every moved asset path pointing at the file kept. */
export function withMovedAssets(json: string, moved: Map<string, string>): string {
  if (moved.size === 0) return json
  return json.replace(/"(assets\/[^"]+)"/g, (whole, path: string) => {
    const to = moved.get(path)
    return to ? `"${to}"` : whole
  })
}
