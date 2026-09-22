// Shared Iconify search + SVG fetch - used by icon-selector-modal.tsx (the
// manual "Select icon" browser) and screens-panel.tsx (the New Screen
// dialog's automatic search-as-you-type suggestion, 2026-08-17). Iconify's
// public search API needs no key and is already this app's only icon
// source, so both call sites hit the same endpoints.
//
// The icons arrive a whole collection at a time (2026-09-22), and that is the
// point of this file rather than a detail of it.
//
// Until then each search hit was its own <img src="https://api.iconify.design/
// <prefix>/<name>.svg">: fifty separate requests per search, and a fresh fifty
// on every keystroke the debounce let through. Iconify rate limits that
// endpoint per address and answers 429 once it has had enough - a 429 in an
// <img> is a torn-page tile, and since the 429 carries no CORS header the
// browser refuses it outright, so nothing in the app could even see what had
// happened. The user saw a dialog full of broken pictures and no explanation
// ("so schaut es aus wenn ich ein icon mit open suchen will").
//
// Measured that day: search 200, `mdi/home.svg` 429 with `Retry-After: 154`,
// and `mdi.json?icons=home` 200. The batch endpoint is the one that is not
// rationed, and it hands back the icons' bodies, so one request per
// collection replaces one per icon - fifteen instead of fifty for a query
// whose hits were scattered over fifteen sets, and usually far fewer.

export interface IconMatch {
  /** "prefix:name", which is also what the asset is called. */
  name: string
  /**
   * What an <img> can show: a data: URL built from the batch response, or -
   * for the rare icon a batch cannot resolve - the API's own single-icon URL.
   */
  svgUrl: string
  /** The SVG text's length, where the batch already told us. */
  size?: number
}

interface IconifySearchResponse {
  icons: string[]
  total: number
  limit: number
  start: number
}

/** What `/{prefix}.json?icons=a,b,c` answers with. */
interface IconifyCollection {
  prefix?: string
  /** The collection's grid, which every icon in it uses unless it says otherwise. */
  width?: number
  height?: number
  icons?: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, { parent: string; rotate?: number; hFlip?: boolean; vFlip?: boolean }>
}

const ICONIFY = "https://api.iconify.design"

/** Iconify's own default grid for a collection that declares none. */
const DEFAULT_GRID = 16

/**
 * What has already been fetched, for as long as the tab is open.
 *
 * Typing a word runs several searches - "o", "op", "ope", "open" - and their
 * results overlap heavily. Remembering them is what keeps the later ones
 * nearly free, and it is also what makes a search that was already made come
 * back instantly instead of over the network.
 */
const icons = new Map<string, IconMatch>()
const searches = new Map<string, IconMatch[]>()

export async function searchIcons(query: string, limit = 50): Promise<IconMatch[]> {
  const term = query.trim()
  if (!term) return []

  const key = `${term.toLowerCase()}|${limit}`
  const remembered = searches.get(key)
  if (remembered) return remembered

  const names = await searchNames(term, limit)
  if (names.length === 0) return []

  // Only what is not already known, grouped by the collection it lives in -
  // one request each, in parallel.
  const byPrefix = new Map<string, string[]>()
  for (const full of names) {
    if (icons.has(full)) continue
    const split = full.indexOf(":")
    if (split <= 0) continue
    const prefix = full.slice(0, split)
    const name = full.slice(split + 1)
    if (!name) continue
    const list = byPrefix.get(prefix)
    if (list) list.push(name)
    else byPrefix.set(prefix, [name])
  }

  const answered = new Set<string>()
  await Promise.all(
    [...byPrefix].map(async ([prefix, wanted]) => {
      if (await loadCollection(prefix, wanted)) answered.add(prefix)
    }),
  )

  const matches: IconMatch[] = []
  for (const full of names) {
    const known = icons.get(full)
    if (known) {
      matches.push(known)
      continue
    }
    // The collection answered but had nothing under this name - an alias with
    // a rotation, most likely (see resolveIcon). One request for that one
    // icon is what the picker used to do for all of them, and it is right
    // here: it is rare, and the alternative is a hole in the grid.
    //
    // A collection that did NOT answer is left out instead. Falling back
    // there would put back exactly the fifty-request storm this is here to
    // stop, at the very moment the service is asking for less.
    const split = full.indexOf(":")
    if (split > 0 && answered.has(full.slice(0, split))) {
      matches.push({ name: full, svgUrl: `${ICONIFY}/${full.slice(0, split)}/${full.slice(split + 1)}.svg` })
    }
  }

  if (matches.length === 0 && byPrefix.size > 0 && answered.size === 0) throw serviceUnreachable()
  searches.set(key, matches)
  return matches
}

async function searchNames(term: string, limit: number): Promise<string[]> {
  let response: Response
  try {
    response = await fetch(`${ICONIFY}/search?query=${encodeURIComponent(term)}&limit=${limit}`)
  } catch {
    throw serviceUnreachable()
  }
  if (!response.ok) {
    throw response.status === 429 ? serviceUnreachable() : new Error(`The icon service answered ${response.status}.`)
  }
  const data: IconifySearchResponse = await response.json()
  return data.icons ? data.icons.slice(0, limit) : []
}

/**
 * One collection's icons, in one request. False when it could not be had, so
 * the caller can tell "this icon is not in there" from "nobody answered".
 */
async function loadCollection(prefix: string, names: string[]): Promise<boolean> {
  let data: IconifyCollection
  try {
    const response = await fetch(`${ICONIFY}/${encodeURIComponent(prefix)}.json?icons=${names.map(encodeURIComponent).join(",")}`)
    if (!response.ok) return false
    data = await response.json()
  } catch {
    return false
  }

  const gridWidth = data.width ?? DEFAULT_GRID
  const gridHeight = data.height ?? DEFAULT_GRID
  for (const name of names) {
    const icon = resolveIcon(data, name)
    if (!icon) continue
    const svg = svgText(icon.body, icon.width ?? gridWidth, icon.height ?? gridHeight)
    icons.set(`${prefix}:${name}`, { name: `${prefix}:${name}`, svgUrl: svgDataUrl(svg), size: svg.length })
  }
  return true
}

/**
 * An icon out of a collection's response, following an alias to what it
 * renames.
 *
 * An alias that also rotates or flips its parent is given up on rather than
 * drawn without the transform: a wrong picture is worse than one more
 * request, and there was not a single one among fifty hits when this was
 * written. The caller asks the single-icon endpoint for those.
 */
function resolveIcon(
  data: IconifyCollection,
  name: string,
  depth = 0,
): { body: string; width?: number; height?: number } | null {
  const icon = data.icons?.[name]
  if (icon) return icon
  const alias = data.aliases?.[name]
  if (!alias || depth >= 4) return null
  if (alias.rotate || alias.hFlip || alias.vFlip) return null
  return resolveIcon(data, alias.parent, depth + 1)
}

/**
 * The same SVG the single-icon endpoint serves, down to its attributes:
 * `1em` square with the collection's grid as the viewBox. Kept identical on
 * purpose - an icon picked before this change is stored in a project as that
 * markup, and everything downstream (the tint in svg-utils.ts, the raster
 * that bakes it at the object's size) has been living with exactly it.
 */
function svgText(body: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 ${width} ${height}">${body}</svg>`
}

function svgDataUrl(svg: string): string {
  try {
    return `data:image/svg+xml;base64,${btoa(svg)}`
  } catch {
    // btoa throws on anything outside Latin-1; URL-encoding always works.
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
}

/**
 * The one failure worth naming, and the reason it cannot be named precisely.
 *
 * A rationed answer never reaches the app: Cloudflare's 429 carries no CORS
 * header, so the browser rejects it before the status is readable and fetch
 * throws the same TypeError an offline machine throws. So this says what can
 * honestly be said - and says something, which is already more than a grid of
 * torn-page tiles said.
 */
function serviceUnreachable(): Error {
  return new Error("Could not reach the icon service. It may be rate limiting - try again in a few minutes.")
}

// Fetches an icon's real SVG and returns it as the same base64-data-URL
// shape ProjectAsset.data expects - the caller still owns assigning an id
// (and whether/when to actually commit it as an asset).
//
// Usually no request at all any more: the search already has the body, so
// picking an icon is instant and cannot fail on a rationed service halfway
// through. Only the rare unresolved alias still goes out to the network.
export async function fetchIconSvgData(icon: IconMatch): Promise<{ data: string; size: number }> {
  if (icon.svgUrl.startsWith("data:")) {
    return { data: icon.svgUrl, size: icon.size ?? icon.svgUrl.length }
  }

  const svgResponse = await fetch(icon.svgUrl)
  if (!svgResponse.ok) {
    throw new Error(`Failed to fetch icon SVG: ${svgResponse.status} ${svgResponse.statusText}`)
  }
  const svgData = await svgResponse.text()

  let data: string
  try {
    data = `data:image/svg+xml;base64,${btoa(svgData.trim())}`
  } catch {
    // Base64 encoding can fail on some unicode content - URL-encoding
    // always works as a fallback (icon-selector-modal.tsx's own precedent).
    data = `data:image/svg+xml,${encodeURIComponent(svgData)}`
  }

  return { data, size: svgData.length }
}
