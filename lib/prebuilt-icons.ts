// The icons a prebuilt comes with (docs/2026-11-05-quick-blocks.md,
// decisions 3 and 4): the one its announcement names, else one found for its
// name, and the icons its buttons name. Fetched when the Prebuilt tab shows
// the entry, not when its tile is clicked, and kept for the page - what the
// Insert dialog did each time it opened (components/baustein-dialog.tsx,
// gone 2026-11-05).

import { fetchIconSvgData, loadIcons, suggestIcon } from "@/lib/icon-search"
import { stateIconNames, type BlockIcon } from "@/lib/bausteine"
import type { CatalogEntry } from "@/lib/ha-discovery"

export interface EntryIcons {
  /** Its own icon; null where none was found or the service did not answer. */
  icon: BlockIcon | null
  /** Its buttons' icons by name; one that did not load is missing. */
  stateIcons: Record<string, BlockIcon>
}

const fetched = new Map<string, { promise: Promise<EntryIcons>; value?: EntryIcons }>()

// What decides an entry's icons: one announced again unchanged is not
// fetched twice.
const keyOf = (entry: CatalogEntry) => JSON.stringify([entry.icon ?? null, entry.label, stateIconNames(entry)])

async function fetchIcons(entry: CatalogEntry): Promise<EntryIcons> {
  const own: Promise<BlockIcon | null> = entry.icon
    ? loadIcons([entry.icon]).then(async (found) => {
        const match = found.get(entry.icon!)
        return match ? { name: match.name, ...(await fetchIconSvgData(match)) } : null
      })
    : suggestIcon([entry.label])
  const wanted = stateIconNames(entry)
  const buttons: Promise<Record<string, BlockIcon>> =
    wanted.length === 0
      ? Promise.resolve({})
      : loadIcons(wanted).then(async (found) => {
          const loaded: Record<string, BlockIcon> = {}
          for (const name of wanted) {
            const match = found.get(name)
            if (match) loaded[name] = { name, ...(await fetchIconSvgData(match)) }
          }
          return loaded
        })
  const [icon, stateIcons] = await Promise.all([own.catch(() => null), buttons.catch(() => ({}))])
  return { icon, stateIcons }
}

/** The entry's icons, fetched once per page; a fetch that failed is tried again next time. */
export function entryIcons(entry: CatalogEntry): Promise<EntryIcons> {
  const key = keyOf(entry)
  const known = fetched.get(key)
  if (known) return known.promise
  const slot: { promise: Promise<EntryIcons>; value?: EntryIcons } = { promise: Promise.resolve({ icon: null, stateIcons: {} }) }
  slot.promise = fetchIcons(entry).then((value) => {
    slot.value = value
    // Nothing found because nothing answered: asked again next time.
    if (!value.icon && Object.keys(value.stateIcons).length === 0) fetched.delete(key)
    return value
  })
  fetched.set(key, slot)
  return slot.promise
}

/** The entry's icons if they are here already, else undefined. */
export function entryIconsNow(entry: CatalogEntry): EntryIcons | undefined {
  return fetched.get(keyOf(entry))?.value
}
