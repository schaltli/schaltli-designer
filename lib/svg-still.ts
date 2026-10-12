// An icon that draws itself, as a still picture of how it ends.
//
// Iconify's line-md icons (and others) animate with SMIL: a stroke dashed
// away and drawn in, a part at opacity 0 switched on after a second. A still
// picture - what the canvas draws, and every device - shows how they start,
// which is nothing (the user, 2026-10-12: an energy diagram's engine icon
// stayed blank). So an icon is stored as its end: each animation that holds
// its end (`fill="freeze"`) puts its last value on its element, and every
// animation element goes.
//
// Plain text processing, no DOM: it runs on import in the browser and in
// migrateProject (lib/object-types.ts), which also runs where there is no
// DOMParser. An icon without animation comes back untouched, to the byte.

const ANIMATION = /^(animate|set|animateTransform|animateMotion|animateColor)$/

/** An attribute's value in a tag's text, or undefined. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)
  return m ? (m[2] ?? m[3]) : undefined
}

/** A start tag with `name` set to `value`: replaced where it is, else added at the end. */
function withAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`)
  if (re.test(tag)) return tag.replace(re, `$1"${value}"`)
  return tag.replace(/\s*(\/?)>$/, (_, slash: string) => ` ${name}="${value}"${slash ? "/" : ""}>`)
}

/** Where an animation ends, or undefined if it does not hold its end. */
function endValue(tag: string, kind: string): string | undefined {
  if (kind !== "set" && attr(tag, "fill") !== "freeze") return undefined
  const to = attr(tag, "to")
  if (to !== undefined) return to
  const values = attr(tag, "values")
  if (values === undefined) return undefined
  const list = values.split(";").map((v) => v.trim()).filter((v) => v !== "")
  return list[list.length - 1]
}

/** The SVG as its animations end; untouched when it has none. */
export function stillSvg(svg: string): string {
  if (!/<(animate|set|animateTransform|animateMotion|animateColor)\b/.test(svg)) return svg
  const tags = [...svg.matchAll(/<[^>]+>/g)]
  // Open elements: the index into `tags` of their start tag.
  const open: number[] = []
  const replaced = new Map<number, string>()
  const dropped = new Set<number>()
  let skipping = -1 // depth of an animation element being dropped with its content
  for (let i = 0; i < tags.length; i++) {
    const text = tags[i][0]
    if (text.startsWith("<?") || text.startsWith("<!")) continue
    const closing = text.startsWith("</")
    const name = /^<\/?\s*([\w:-]+)/.exec(text)?.[1] ?? ""
    const selfClosing = text.endsWith("/>")
    if (skipping >= 0) {
      dropped.add(i)
      if (closing && open.length - 1 === skipping) {
        open.pop()
        skipping = -1
      } else if (closing) open.pop()
      else if (!selfClosing) open.push(i)
      continue
    }
    if (closing) {
      open.pop()
      continue
    }
    if (ANIMATION.test(name)) {
      const target = open[open.length - 1]
      const attribute = attr(text, "attributeName")
      const end = endValue(text, name)
      if (target !== undefined && end !== undefined) {
        const current = replaced.get(target) ?? tags[target][0]
        if (name === "animateTransform" && attribute) {
          const type = attr(text, "type") ?? "translate"
          replaced.set(target, withAttr(current, attribute, `${type}(${end})`))
        } else if (attribute && name !== "animateMotion") {
          replaced.set(target, withAttr(current, attribute, end))
        }
      }
      dropped.add(i)
      if (!selfClosing) {
        open.push(i)
        skipping = open.length - 1
      }
      continue
    }
    if (!selfClosing) open.push(i)
  }
  let out = ""
  let at = 0
  tags.forEach((m, i) => {
    const start = m.index!
    out += svg.slice(at, start)
    if (!dropped.has(i)) out += replaced.get(i) ?? m[0]
    at = start + m[0].length
  })
  return out + svg.slice(at)
}

/** An icon asset's data URL with its SVG still; anything else, or an SVG without animation, untouched. */
export function stillIconData(data: string): string {
  try {
    if (data.startsWith("data:image/svg+xml;base64,")) {
      const svg = decodeBase64(data.slice("data:image/svg+xml;base64,".length))
      const still = stillSvg(svg)
      return still === svg ? data : `data:image/svg+xml;base64,${encodeBase64(still)}`
    }
    if (data.startsWith("data:image/svg+xml,")) {
      const svg = decodeURIComponent(data.slice("data:image/svg+xml,".length))
      const still = stillSvg(svg)
      return still === svg ? data : `data:image/svg+xml,${encodeURIComponent(still)}`
    }
  } catch {
    // Unreadable: as it was, as the renderers have always taken it.
  }
  return data
}

// UTF-8 safe, in the browser and in Node alike.
function decodeBase64(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
