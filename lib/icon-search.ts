// Shared Iconify search + SVG fetch - used by icon-selector-modal.tsx (the
// manual "Select icon" browser) and screens-panel.tsx (the New Screen
// dialog's automatic search-as-you-type suggestion, 2026-08-17). Iconify's
// public search API needs no key and is already this app's only icon
// source, so both call sites hit the same endpoints; this just factors out
// the fetch/parse logic that used to live only inside the modal.

export interface IconMatch {
  name: string
  svgUrl: string
}

interface IconifySearchResponse {
  icons: string[]
  total: number
  limit: number
  start: number
}

export async function searchIcons(query: string, limit = 50): Promise<IconMatch[]> {
  if (!query.trim()) return []

  const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`)
  if (!response.ok) {
    throw new Error("Failed to search icons")
  }
  const data: IconifySearchResponse = await response.json()
  if (!data.icons || data.icons.length === 0) return []

  // Icon name format is "prefix:name".
  return data.icons.slice(0, limit).map((iconName) => {
    const [prefix, name] = iconName.split(":")
    return { name: iconName, svgUrl: `https://api.iconify.design/${prefix}/${name}.svg` }
  })
}

// Fetches an icon's real SVG and returns it as the same base64-data-URL
// shape ProjectAsset.data expects - the caller still owns assigning an id
// (and whether/when to actually commit it as an asset).
export async function fetchIconSvgData(icon: IconMatch): Promise<{ data: string; size: number }> {
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
