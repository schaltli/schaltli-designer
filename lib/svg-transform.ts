// Parses an SVG transform="..." attribute into the six numbers of its affine
// matrix, [a, b, c, d, e, f] in SVG's matrix(a,b,c,d,e,f) order.
//
// Hand-written rather than handed to `new DOMMatrix(string)`, which is what
// canvas.tsx used until 2026-09-28: DOMMatrix parses CSS <transform-list>
// syntax, not SVG's, and the two disagree exactly where Inkscape writes
// rotations. SVG's rotate() takes a bare number of degrees and an optional
// centre point - rotate(-60.8), rotate(90 270 270) - and CSS rejects both
// (it wants rotate(-60.8deg) and has no centre form). The throw was caught
// and the transform treated as identity, so the knob's redrawn rotate
// arrows (rotate(-60.816086), straight out of Inkscape 1.4) drew fine in
// every picture viewer and were unclickable on the canvas, with nothing in
// the console to say why.
//
// Returns null for anything it cannot read in full, rather than the part it
// did read: a half-applied transform list puts a button somewhere plausible
// but wrong, which is harder to notice than one that is ignored outright.

export type SvgMatrix = [number, number, number, number, number, number]

const IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0]

function multiply(m: SvgMatrix, n: SvgMatrix): SvgMatrix {
  const [a, b, c, d, e, f] = m
  const [A, B, C, D, E, F] = n
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f]
}

const rad = (deg: number) => (deg * Math.PI) / 180

function single(name: string, args: number[]): SvgMatrix | null {
  const n = args.length
  switch (name) {
    case "matrix":
      return n === 6 ? (args as SvgMatrix) : null
    case "translate":
      return n === 1 || n === 2 ? [1, 0, 0, 1, args[0], args[1] ?? 0] : null
    case "scale":
      return n === 1 || n === 2 ? [args[0], 0, 0, args[1] ?? args[0], 0, 0] : null
    case "rotate": {
      if (n !== 1 && n !== 3) return null
      const cos = Math.cos(rad(args[0]))
      const sin = Math.sin(rad(args[0]))
      const r: SvgMatrix = [cos, sin, -sin, cos, 0, 0]
      if (n === 1) return r
      const [, cx, cy] = args
      return multiply(multiply([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy])
    }
    case "skewX":
      return n === 1 ? [1, 0, Math.tan(rad(args[0])), 1, 0, 0] : null
    case "skewY":
      return n === 1 ? [1, Math.tan(rad(args[0])), 0, 1, 0, 0] : null
    default:
      return null
  }
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g
const FUNCTION = /\s*,?\s*([a-zA-Z]+)\s*\(([^)]*)\)/y

export function parseSvgTransform(transform: string): SvgMatrix | null {
  let result = IDENTITY
  let end = 0
  FUNCTION.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FUNCTION.exec(transform)) !== null) {
    end = FUNCTION.lastIndex
    const argText = match[2]
    const args = (argText.match(NUMBER) ?? []).map(Number)
    // Anything between the numbers other than separators ("12px", "1..2")
    // is not SVG transform syntax.
    if (argText.replace(NUMBER, "").replace(/[\s,]/g, "") !== "") return null
    const m = single(match[1], args)
    if (!m) return null
    result = multiply(result, m)
  }
  // The sticky regex stops at the first thing that isn't a function call;
  // only trailing whitespace may be left.
  if (transform.slice(end).trim() !== "") return null
  return result
}
