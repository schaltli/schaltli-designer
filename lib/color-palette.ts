// Color palette utilities based on screen color depth

export interface ColorPaletteEntry {
  id: string // Hex color value (e.g., "#FF0000")
  name: string // Display name (e.g., "red" or "gray 7")
  hex: string // Same as id, for convenience
}

// Monochrome palette (1-bit)
export const MONOCHROME_PALETTE: ColorPaletteEntry[] = [
  { id: "#000000", name: "black", hex: "#000000" },
  { id: "#FFFFFF", name: "white", hex: "#FFFFFF" },
]

// 4-bit Grayscale palette (16 shades)
export const GRAYSCALE_4BIT_PALETTE: ColorPaletteEntry[] = [
  { id: "#000000", name: "0 - black", hex: "#000000" },
  { id: "#111111", name: "1 - gray", hex: "#111111" },
  { id: "#222222", name: "2 - gray", hex: "#222222" },
  { id: "#333333", name: "3 - gray", hex: "#333333" },
  { id: "#444444", name: "4 - gray", hex: "#444444" },
  { id: "#555555", name: "5 - gray", hex: "#555555" },
  { id: "#666666", name: "6 - gray", hex: "#666666" },
  { id: "#777777", name: "7 - gray", hex: "#777777" },
  { id: "#888888", name: "8 - gray", hex: "#888888" },
  { id: "#999999", name: "9 - gray", hex: "#999999" },
  { id: "#AAAAAA", name: "10 - gray", hex: "#AAAAAA" },
  { id: "#BBBBBB", name: "11 - gray", hex: "#BBBBBB" },
  { id: "#CCCCCC", name: "12 - gray", hex: "#CCCCCC" },
  { id: "#DDDDDD", name: "13 - gray", hex: "#DDDDDD" },
  { id: "#EEEEEE", name: "14 - gray", hex: "#EEEEEE" },
  { id: "#FFFFFF", name: "15 - white", hex: "#FFFFFF" },
]

// X11 Named Colors for 24-bit RGB
export const X11_COLOR_PALETTE: ColorPaletteEntry[] = [
  { id: "#F0F8FF", name: "AliceBlue", hex: "#F0F8FF" },
  { id: "#FAEBD7", name: "AntiqueWhite", hex: "#FAEBD7" },
  { id: "#00FFFF", name: "Aqua", hex: "#00FFFF" },
  { id: "#7FFFD4", name: "Aquamarine", hex: "#7FFFD4" },
  { id: "#F0FFFF", name: "Azure", hex: "#F0FFFF" },
  { id: "#F5F5DC", name: "Beige", hex: "#F5F5DC" },
  { id: "#FFE4C4", name: "Bisque", hex: "#FFE4C4" },
  { id: "#000000", name: "Black", hex: "#000000" },
  { id: "#FFEBCD", name: "BlanchedAlmond", hex: "#FFEBCD" },
  { id: "#0000FF", name: "Blue", hex: "#0000FF" },
  { id: "#8A2BE2", name: "BlueViolet", hex: "#8A2BE2" },
  { id: "#A52A2A", name: "Brown", hex: "#A52A2A" },
  { id: "#DEB887", name: "BurlyWood", hex: "#DEB887" },
  { id: "#5F9EA0", name: "CadetBlue", hex: "#5F9EA0" },
  { id: "#7FFF00", name: "Chartreuse", hex: "#7FFF00" },
  { id: "#D2691E", name: "Chocolate", hex: "#D2691E" },
  { id: "#FF7F50", name: "Coral", hex: "#FF7F50" },
  { id: "#6495ED", name: "CornflowerBlue", hex: "#6495ED" },
  { id: "#FFF8DC", name: "Cornsilk", hex: "#FFF8DC" },
  { id: "#DC143C", name: "Crimson", hex: "#DC143C" },
  { id: "#00FFFF", name: "Cyan", hex: "#00FFFF" },
  { id: "#00008B", name: "DarkBlue", hex: "#00008B" },
  { id: "#008B8B", name: "DarkCyan", hex: "#008B8B" },
  { id: "#B8860B", name: "DarkGoldenrod", hex: "#B8860B" },
  { id: "#A9A9A9", name: "DarkGray", hex: "#A9A9A9" },
  { id: "#006400", name: "DarkGreen", hex: "#006400" },
  { id: "#BDB76B", name: "DarkKhaki", hex: "#BDB76B" },
  { id: "#8B008B", name: "DarkMagenta", hex: "#8B008B" },
  { id: "#556B2F", name: "DarkOliveGreen", hex: "#556B2F" },
  { id: "#FF8C00", name: "DarkOrange", hex: "#FF8C00" },
  { id: "#9932CC", name: "DarkOrchid", hex: "#9932CC" },
  { id: "#8B0000", name: "DarkRed", hex: "#8B0000" },
  { id: "#E9967A", name: "DarkSalmon", hex: "#E9967A" },
  { id: "#8FBC8F", name: "DarkSeaGreen", hex: "#8FBC8F" },
  { id: "#483D8B", name: "DarkSlateBlue", hex: "#483D8B" },
  { id: "#2F4F4F", name: "DarkSlateGray", hex: "#2F4F4F" },
  { id: "#00CED1", name: "DarkTurquoise", hex: "#00CED1" },
  { id: "#9400D3", name: "DarkViolet", hex: "#9400D3" },
  { id: "#FF1493", name: "DeepPink", hex: "#FF1493" },
  { id: "#00BFFF", name: "DeepSkyBlue", hex: "#00BFFF" },
  { id: "#696969", name: "DimGray", hex: "#696969" },
  { id: "#1E90FF", name: "DodgerBlue", hex: "#1E90FF" },
  { id: "#B22222", name: "FireBrick", hex: "#B22222" },
  { id: "#FFFAF0", name: "FloralWhite", hex: "#FFFAF0" },
  { id: "#228B22", name: "ForestGreen", hex: "#228B22" },
  { id: "#FF00FF", name: "Fuchsia", hex: "#FF00FF" },
  { id: "#DCDCDC", name: "Gainsboro", hex: "#DCDCDC" },
  { id: "#F8F8FF", name: "GhostWhite", hex: "#F8F8FF" },
  { id: "#FFD700", name: "Gold", hex: "#FFD700" },
  { id: "#DAA520", name: "Goldenrod", hex: "#DAA520" },
  { id: "#808080", name: "Gray", hex: "#808080" },
  { id: "#008000", name: "Green", hex: "#008000" },
  { id: "#ADFF2F", name: "GreenYellow", hex: "#ADFF2F" },
  { id: "#F0FFF0", name: "Honeydew", hex: "#F0FFF0" },
  { id: "#FF69B4", name: "HotPink", hex: "#FF69B4" },
  { id: "#CD5C5C", name: "IndianRed", hex: "#CD5C5C" },
  { id: "#4B0082", name: "Indigo", hex: "#4B0082" },
  { id: "#FFFFF0", name: "Ivory", hex: "#FFFFF0" },
  { id: "#F0E68C", name: "Khaki", hex: "#F0E68C" },
  { id: "#E6E6FA", name: "Lavender", hex: "#E6E6FA" },
  { id: "#FFF0F5", name: "LavenderBlush", hex: "#FFF0F5" },
  { id: "#7CFC00", name: "LawnGreen", hex: "#7CFC00" },
  { id: "#FFFACD", name: "LemonChiffon", hex: "#FFFACD" },
  { id: "#ADD8E6", name: "LightBlue", hex: "#ADD8E6" },
  { id: "#F08080", name: "LightCoral", hex: "#F08080" },
  { id: "#E0FFFF", name: "LightCyan", hex: "#E0FFFF" },
  { id: "#FAFAD2", name: "LightGoldenrodYellow", hex: "#FAFAD2" },
  { id: "#D3D3D3", name: "LightGray", hex: "#D3D3D3" },
  { id: "#90EE90", name: "LightGreen", hex: "#90EE90" },
  { id: "#FFB6C1", name: "LightPink", hex: "#FFB6C1" },
  { id: "#FFA07A", name: "LightSalmon", hex: "#FFA07A" },
  { id: "#20B2AA", name: "LightSeaGreen", hex: "#20B2AA" },
  { id: "#87CEFA", name: "LightSkyBlue", hex: "#87CEFA" },
  { id: "#778899", name: "LightSlateGray", hex: "#778899" },
  { id: "#B0C4DE", name: "LightSteelBlue", hex: "#B0C4DE" },
  { id: "#FFFFE0", name: "LightYellow", hex: "#FFFFE0" },
  { id: "#00FF00", name: "Lime", hex: "#00FF00" },
  { id: "#32CD32", name: "LimeGreen", hex: "#32CD32" },
  { id: "#FAF0E6", name: "Linen", hex: "#FAF0E6" },
  { id: "#FF00FF", name: "Magenta", hex: "#FF00FF" },
  { id: "#800000", name: "Maroon", hex: "#800000" },
  { id: "#66CDAA", name: "MediumAquamarine", hex: "#66CDAA" },
  { id: "#0000CD", name: "MediumBlue", hex: "#0000CD" },
  { id: "#BA55D3", name: "MediumOrchid", hex: "#BA55D3" },
  { id: "#9370DB", name: "MediumPurple", hex: "#9370DB" },
  { id: "#3CB371", name: "MediumSeaGreen", hex: "#3CB371" },
  { id: "#7B68EE", name: "MediumSlateBlue", hex: "#7B68EE" },
  { id: "#00FA9A", name: "MediumSpringGreen", hex: "#00FA9A" },
  { id: "#48D1CC", name: "MediumTurquoise", hex: "#48D1CC" },
  { id: "#C71585", name: "MediumVioletRed", hex: "#C71585" },
  { id: "#191970", name: "MidnightBlue", hex: "#191970" },
  { id: "#F5FFFA", name: "MintCream", hex: "#F5FFFA" },
  { id: "#FFE4E1", name: "MistyRose", hex: "#FFE4E1" },
  { id: "#FFE4B5", name: "Moccasin", hex: "#FFE4B5" },
  { id: "#FFDEAD", name: "NavajoWhite", hex: "#FFDEAD" },
  { id: "#000080", name: "Navy", hex: "#000080" },
  { id: "#FDF5E6", name: "OldLace", hex: "#FDF5E6" },
  { id: "#808000", name: "Olive", hex: "#808000" },
  { id: "#6B8E23", name: "OliveDrab", hex: "#6B8E23" },
  { id: "#FFA500", name: "Orange", hex: "#FFA500" },
  { id: "#FF4500", name: "OrangeRed", hex: "#FF4500" },
  { id: "#DA70D6", name: "Orchid", hex: "#DA70D6" },
  { id: "#EEE8AA", name: "PaleGoldenrod", hex: "#EEE8AA" },
  { id: "#98FB98", name: "PaleGreen", hex: "#98FB98" },
  { id: "#AFEEEE", name: "PaleTurquoise", hex: "#AFEEEE" },
  { id: "#DB7093", name: "PaleVioletRed", hex: "#DB7093" },
  { id: "#FFEFD5", name: "PapayaWhip", hex: "#FFEFD5" },
  { id: "#FFDAB9", name: "PeachPuff", hex: "#FFDAB9" },
  { id: "#CD853F", name: "Peru", hex: "#CD853F" },
  { id: "#FFC0CB", name: "Pink", hex: "#FFC0CB" },
  { id: "#DDA0DD", name: "Plum", hex: "#DDA0DD" },
  { id: "#B0E0E6", name: "PowderBlue", hex: "#B0E0E6" },
  { id: "#800080", name: "Purple", hex: "#800080" },
  { id: "#FF0000", name: "Red", hex: "#FF0000" },
  { id: "#BC8F8F", name: "RosyBrown", hex: "#BC8F8F" },
  { id: "#4169E1", name: "RoyalBlue", hex: "#4169E1" },
  { id: "#8B4513", name: "SaddleBrown", hex: "#8B4513" },
  { id: "#FA8072", name: "Salmon", hex: "#FA8072" },
  { id: "#F4A460", name: "SandyBrown", hex: "#F4A460" },
  { id: "#2E8B57", name: "SeaGreen", hex: "#2E8B57" },
  { id: "#FFF5EE", name: "SeaShell", hex: "#FFF5EE" },
  { id: "#A0522D", name: "Sienna", hex: "#A0522D" },
  { id: "#C0C0C0", name: "Silver", hex: "#C0C0C0" },
  { id: "#87CEEB", name: "SkyBlue", hex: "#87CEEB" },
  { id: "#6A5ACD", name: "SlateBlue", hex: "#6A5ACD" },
  { id: "#708090", name: "SlateGray", hex: "#708090" },
  { id: "#FFFAFA", name: "Snow", hex: "#FFFAFA" },
  { id: "#00FF7F", name: "SpringGreen", hex: "#00FF7F" },
  { id: "#4682B4", name: "SteelBlue", hex: "#4682B4" },
  { id: "#D2B48C", name: "Tan", hex: "#D2B48C" },
  { id: "#008080", name: "Teal", hex: "#008080" },
  { id: "#D8BFD8", name: "Thistle", hex: "#D8BFD8" },
  { id: "#FF6347", name: "Tomato", hex: "#FF6347" },
  { id: "#40E0D0", name: "Turquoise", hex: "#40E0D0" },
  { id: "#EE82EE", name: "Violet", hex: "#EE82EE" },
  { id: "#F5DEB3", name: "Wheat", hex: "#F5DEB3" },
  { id: "#FFFFFF", name: "White", hex: "#FFFFFF" },
  { id: "#F5F5F5", name: "WhiteSmoke", hex: "#F5F5F5" },
  { id: "#FFFF00", name: "Yellow", hex: "#FFFF00" },
  { id: "#9ACD32", name: "YellowGreen", hex: "#9ACD32" },
]

/**
 * Get the color palette based on screen color depth
 */
export function getColorPaletteForDepth(colorDepth: "1bit" | "4bit" | "24bit"): ColorPaletteEntry[] {
  switch (colorDepth) {
    case "1bit":
      return MONOCHROME_PALETTE
    case "4bit":
      return GRAYSCALE_4BIT_PALETTE
    case "24bit":
      return X11_COLOR_PALETTE
    default:
      return X11_COLOR_PALETTE
  }
}

/**
 * Find the closest color in a palette to a given hex color
 */
export function findClosestPaletteColor(hexColor: string, palette: ColorPaletteEntry[]): ColorPaletteEntry {
  if (hexColor === "transparent") {
    // Return black as default for transparent
    return palette.find(c => c.id === "#000000") || palette[0]
  }

  // Normalize the hex color
  const normalized = hexColor.toUpperCase().startsWith("#") ? hexColor.toUpperCase() : `#${hexColor.toUpperCase()}`
  
  // Try exact match first
  const exact = palette.find(c => c.id.toUpperCase() === normalized)
  if (exact) return exact

  // If no exact match, find closest by RGB distance
  const parseHex = (hex: string) => {
    const clean = hex.replace("#", "")
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    }
  }

  const target = parseHex(normalized)
  let closest = palette[0]
  let minDistance = Infinity

  palette.forEach(color => {
    const c = parseHex(color.hex)
    const distance = Math.sqrt(
      Math.pow(c.r - target.r, 2) +
      Math.pow(c.g - target.g, 2) +
      Math.pow(c.b - target.b, 2)
    )
    if (distance < minDistance) {
      minDistance = distance
      closest = color
    }
  })

  return closest
}

/**
 * Convert a color to the nearest palette color based on color depth
 */
export function convertColorToPalette(
  color: string,
  colorDepth: "1bit" | "4bit" | "24bit"
): string {
  if (color === "transparent") return "transparent"
  
  const palette = getColorPaletteForDepth(colorDepth)
  const closest = findClosestPaletteColor(color, palette)
  return closest.hex
}
