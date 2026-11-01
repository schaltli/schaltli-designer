import JSZip from "jszip"

// A project's font data lives in its device's DDF, not beside it
// (docs/2026-11-01-4bit-fonts.md, decision 11).
//
// Every project carries its device's DDF as embeddedDdfZipBase64, and the DDF
// holds every font file the device has. The fonts in project.fonts carried
// the same bytes a second time - wherever the project went: to the server on
// every save, into the browser's draft, into the project zip and with it
// into every deploy's recovery copy. With 1-bit fonts nobody noticed; with
// the colour boards' 4-bit fonts a project passed 10 MB, saving was refused
// and boards did not come back from an install within three minutes
// (test:quick, 2026-11-01).
//
// So an open project keeps its fonts' data in memory, exactly as before - the
// renderers read it there - and everything that leaves the editor leaves out
// what the DDF can give back: slimFontData() before it goes, withFontData()
// when it comes in. A font is left out only when the DDF has the very same
// bytes at its path; a font of the project's own (a local BDF, a TTF) keeps
// its data, and so does every font of a project with no embedded DDF.

type FontLike = { path?: unknown; data?: unknown }
type ProjectLike = { fonts?: FontLike[]; embeddedDdfZipBase64?: unknown }

// The last DDF read, kept: a save and the draft after it, or an open and the
// version list, read the same one.
let cached: { base64: string; files: Promise<Map<string, string>> } | null = null

async function readFiles(base64: string): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(base64, { base64: true })
  const files = new Map<string, string>()
  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".bdf"))
      .map(async (entry) => files.set(entry.name, await entry.async("string"))),
  )
  return files
}

function ddfFiles(base64: string): Promise<Map<string, string>> {
  if (cached?.base64 !== base64) cached = { base64, files: readFiles(base64) }
  return cached.files
}

function hasDdf(project: unknown): project is ProjectLike & { fonts: FontLike[]; embeddedDdfZipBase64: string } {
  const p = project as ProjectLike | null
  return !!p && Array.isArray(p.fonts) && typeof p.embeddedDdfZipBase64 === "string" && p.embeddedDdfZipBase64.length > 0
}

/** The project as it is saved or exported: without the font data its embedded DDF holds. */
export async function slimFontData<T>(project: T): Promise<T> {
  if (!hasDdf(project)) return project
  const files = await ddfFiles(project.embeddedDdfZipBase64).catch(() => null)
  if (!files) return project
  let changed = false
  const fonts = project.fonts.map((font) => {
    if (typeof font.path !== "string" || typeof font.data !== "string") return font
    if (files.get(font.path) !== font.data) return font
    changed = true
    const { data: _fromDdf, ...rest } = font
    return rest
  })
  return changed ? { ...project, fonts } : project
}

/** The project as it is opened: every font without data given it from the embedded DDF. */
export async function withFontData<T>(project: T): Promise<T> {
  if (!hasDdf(project)) return project
  if (!project.fonts.some((font) => font.data === undefined && typeof font.path === "string")) return project
  const files = await ddfFiles(project.embeddedDdfZipBase64).catch(() => null)
  if (!files) return project
  const fonts = project.fonts.map((font) => {
    if (font.data !== undefined || typeof font.path !== "string") return font
    const data = files.get(font.path)
    return data === undefined ? font : { ...font, data }
  })
  return { ...project, fonts }
}
