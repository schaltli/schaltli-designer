// Where templates live (lib/templates.ts). Server-only - node:fs.
//
//   <repo>/templates/*.json          shipped with the installation, read-only
//   <data>/templates/<name>.json     the user's own, from File > Save as Template
//
// A template is one file: icons and all, a few hundred kilobytes, written
// rarely - no versions and no blobs as a project has. Names follow the
// project name rule, compared without case; a name is either shipped or the
// user's, never both, so the list can never show two of the same.

import { readdir, readFile, mkdir, unlink } from "node:fs/promises"
import { join } from "node:path"
import { checkProjectName, projectNameKey } from "./project-name"
import { ProjectStoreError, writeFileAtomic } from "./project-store"
import { TEMPLATE_FORMAT, type Template, type TemplateSummary } from "./templates"

async function readTemplates(dir: string): Promise<Template[]> {
  let files: string[]
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
  const read = await Promise.all(
    files.map(async (f) => {
      try {
        const t = JSON.parse(await readFile(join(dir, f), "utf-8")) as Template
        return t && t.format === TEMPLATE_FORMAT && typeof t.name === "string" && Array.isArray(t.screens) ? t : null
      } catch {
        return null
      }
    }),
  )
  return read.filter((t): t is Template => t !== null)
}

export function createTemplateStore(
  root: string = join(process.cwd(), ".data"),
  shippedDir: string = join(process.cwd(), "templates"),
) {
  const userDir = join(root, "templates")

  async function all(): Promise<{ template: Template; shipped: boolean }[]> {
    const [shipped, own] = await Promise.all([readTemplates(shippedDir), readTemplates(userDir)])
    return [...shipped.map((template) => ({ template, shipped: true })), ...own.map((template) => ({ template, shipped: false }))]
  }

  async function find(name: string) {
    const key = projectNameKey(name)
    return (await all()).find((t) => projectNameKey(t.template.name) === key) ?? null
  }

  return {
    /** All templates, or those made for `deviceId`; shipped first, then by name. */
    async list(deviceId?: string): Promise<TemplateSummary[]> {
      return (await all())
        .filter((t) => !deviceId || t.template.deviceId === deviceId)
        .map((t) => ({ name: t.template.name, deviceId: t.template.deviceId, shipped: t.shipped }))
        .sort((a, b) => Number(b.shipped) - Number(a.shipped) || a.name.localeCompare(b.name))
    },

    async read(name: string): Promise<Template> {
      const found = await find(name)
      if (!found) throw new ProjectStoreError("not-found", `No template "${name}"`)
      return found.template
    },

    /** Saves the user's template under `template.name`; refused if the name is taken. */
    async create(template: Template): Promise<TemplateSummary> {
      const check = checkProjectName(template.name)
      if (!check.ok) throw new ProjectStoreError("invalid-name", check.reason)
      if (!template.deviceId) throw new ProjectStoreError("invalid-name", "The project has no device.")
      const taken = await find(check.name)
      if (taken) {
        throw new ProjectStoreError("taken", `"${taken.template.name}" already exists.`, taken.template.name)
      }
      await mkdir(userDir, { recursive: true })
      await writeFileAtomic(join(userDir, `${check.name}.json`), JSON.stringify({ ...template, format: TEMPLATE_FORMAT, name: check.name }))
      return { name: check.name, deviceId: template.deviceId, shipped: false }
    },

    /** Removes one of the user's templates; a shipped one stays. */
    async remove(name: string): Promise<void> {
      const found = await find(name)
      if (!found) throw new ProjectStoreError("not-found", `No template "${name}"`)
      if (found.shipped) throw new ProjectStoreError("taken", `"${found.template.name}" comes with the designer and stays.`)
      await unlink(join(userDir, `${found.template.name}.json`))
    },
  }
}

export type TemplateStore = ReturnType<typeof createTemplateStore>
