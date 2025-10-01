// XLFD (X Logical Font Description) Parser
// Parses font names from BDF files according to the XLFD specification

export interface XLFDFont {
  // Raw XLFD string
  xlfd: string

  // Parsed fields
  foundry: string
  familyName: string
  weightName: string
  slant: string
  setwidthName: string
  addStyleName: string
  pixelSize: number | null
  pointSize: number | null
  resolutionX: number | null
  resolutionY: number | null
  spacing: string
  averageWidth: number | null
  charsetRegistry: string
  charsetEncoding: string

  // Computed values
  pointSizePt: number | null // point_size_dp / 10.0
  avgWidthPx: number | null // average_width_tenths / 10.0
  isScalable: boolean // pixel_size==0 or average_width==0
}

export function parseXLFD(input: string): XLFDFont | null {
  try {
    let s = input.trim()

    // Strip "FONT " prefix if present
    if (s.startsWith("FONT ")) {
      s = s.substring(5).trim()
    }

    // If it doesn't start with hyphen, treat it as a simple font name
    if (!s.startsWith("-")) {
      console.warn("[v0] Non-standard FONT tag detected, using as simple name:", s)
      return {
        xlfd: s,
        foundry: "",
        familyName: s, // Use the simple name as family name
        weightName: "",
        slant: "",
        setwidthName: "",
        addStyleName: "",
        pixelSize: null,
        pointSize: null,
        resolutionX: null,
        resolutionY: null,
        spacing: "",
        averageWidth: null,
        charsetRegistry: "",
        charsetEncoding: "",
        pointSizePt: null,
        avgWidthPx: null,
        isScalable: false,
      }
    }

    // Split on hyphens
    const parts = s.split("-")

    // Should have 15 parts (first is empty due to leading hyphen, then 14 fields)
    if (parts.length !== 15) {
      console.warn(
        "[v0] XLFD has incorrect number of fields (expected 14, got:",
        parts.length - 1,
        "), using partial data",
      )
      // Return a partial XLFD with whatever data we have
      return {
        xlfd: s,
        foundry: parts[1] || "",
        familyName: parts[2] || s, // Fallback to full string if no family name
        weightName: parts[3] || "",
        slant: parts[4] || "",
        setwidthName: parts[5] || "",
        addStyleName: parts[6] || "",
        pixelSize: null,
        pointSize: null,
        resolutionX: null,
        resolutionY: null,
        spacing: parts[11] || "",
        averageWidth: null,
        charsetRegistry: parts[13] || "",
        charsetEncoding: parts[14] || "",
        pointSizePt: null,
        avgWidthPx: null,
        isScalable: false,
      }
    }

    // Parse numeric fields
    const parseNumeric = (value: string): number | null => {
      if (!value || value === "*") return null
      const num = Number.parseInt(value, 10)
      return isNaN(num) ? null : num
    }

    const pixelSize = parseNumeric(parts[7])
    const pointSize = parseNumeric(parts[8])
    const resolutionX = parseNumeric(parts[9])
    const resolutionY = parseNumeric(parts[10])
    const averageWidth = parseNumeric(parts[12])

    return {
      xlfd: s,
      foundry: parts[1] || "",
      familyName: parts[2] || "",
      weightName: parts[3] || "",
      slant: parts[4] || "",
      setwidthName: parts[5] || "",
      addStyleName: parts[6] || "",
      pixelSize,
      pointSize,
      resolutionX,
      resolutionY,
      spacing: parts[11] || "",
      averageWidth,
      charsetRegistry: parts[13] || "",
      charsetEncoding: parts[14] || "",
      pointSizePt: pointSize !== null ? pointSize / 10.0 : null,
      avgWidthPx: averageWidth !== null ? averageWidth / 10.0 : null,
      isScalable: pixelSize === 0 || averageWidth === 0,
    }
  } catch (error) {
    console.error("[v0] Error parsing XLFD:", error)
    return {
      xlfd: input,
      foundry: "",
      familyName: input,
      weightName: "",
      slant: "",
      setwidthName: "",
      addStyleName: "",
      pixelSize: null,
      pointSize: null,
      resolutionX: null,
      resolutionY: null,
      spacing: "",
      averageWidth: null,
      charsetRegistry: "",
      charsetEncoding: "",
      pointSizePt: null,
      avgWidthPx: null,
      isScalable: false,
    }
  }
}

export function formatXLFDDisplayName(xlfd: XLFDFont): string {
  const parts: string[] = []

  if (xlfd.familyName) parts.push(xlfd.familyName)
  if (xlfd.weightName && xlfd.weightName !== "medium") parts.push(xlfd.weightName)
  if (xlfd.slant && xlfd.slant !== "r") {
    const slantMap: Record<string, string> = {
      i: "Italic",
      o: "Oblique",
      ri: "Reverse Italic",
      ro: "Reverse Oblique",
    }
    parts.push(slantMap[xlfd.slant] || xlfd.slant)
  }
  if (xlfd.pixelSize) parts.push(`${xlfd.pixelSize}px`)

  return parts.join(" ") || xlfd.xlfd
}
