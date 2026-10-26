// Scaled values: a number times a fraction plus an offset, rounded to a
// number of decimals - what a scaled topic reads and a write format sends
// (tasks/ha-templates-stage2-plan.md, decisions 1 and 3;
// docs/2026-10-26-ha-templates.md).
//
// Written to be ported line by line to the firmware (int64_t) and the
// Android app (Long), as lib/placeholders.ts is: no float, no regular
// expression, no locale. Every intermediate fits in a signed 64-bit integer
// within the bounds below; BigInt here only so that TypeScript computes what
// the other two do (through BigInt(), not literals: tsconfig targets ES6).
// The cases all three must agree on are lib/scaled-value/vectors.json.

/** times numerator / denominator, plus offset, rounded to decimals. */
export interface Scale {
  numerator: number
  denominator: number
  /** A plain decimal, at most 6 places; absent: 0. */
  offset?: string
  /** 0-6, at least the offset's places. */
  decimals: number
}

/** What a level sends: `text` with `{value}` in it, the value scaled first where a factor is set. */
export interface WriteFormat {
  text: string
  numerator?: number
  denominator?: number
  offset?: string
  decimals?: number
}

export const MAX_FACTOR = 1_000_000
export const MAX_SIGNIFICANT_DIGITS = 12
export const MAX_FRACTION_DIGITS = 9
export const MAX_OFFSET_DIGITS = 6
export const MAX_DECIMALS = 6
/** A result and an offset stay below this. */
export const LIMIT = BigInt(1_000_000_000_000)

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9"
}

const ZERO = BigInt(0)
const ONE = BigInt(1)
const TWO = BigInt(2)
const TEN = BigInt(10)

function pow10(n: number): bigint {
  let p = ONE
  for (let i = 0; i < n; i++) p *= TEN
  return p
}

/**
 * A plain decimal - sign, digits, a point, digits, nothing else but spaces
 * around - as an integer and the places after its point; undefined where
 * it is not one, or has more digits than allowed.
 */
export function parseDecimal(text: string, maxSignificant: number, maxFraction: number): { units: bigint; places: number } | undefined {
  let start = 0
  let end = text.length
  while (start < end && text[start] === " ") start++
  while (end > start && text[end - 1] === " ") end--
  let i = start
  let negative = false
  if (text[i] === "+" || text[i] === "-") {
    negative = text[i] === "-"
    i++
  }
  let digits = ""
  let places = 0
  let seenDigit = false
  while (i < end && isDigit(text[i])) {
    digits += text[i++]
    seenDigit = true
  }
  if (i < end && text[i] === ".") {
    i++
    while (i < end && isDigit(text[i])) {
      digits += text[i++]
      places++
      seenDigit = true
    }
  }
  if (i !== end || !seenDigit || places > maxFraction) return undefined
  let first = 0
  while (first < digits.length - 1 && digits[first] === "0") first++
  if (digits.length - first > maxSignificant) return undefined
  let units = ZERO
  for (let k = first; k < digits.length; k++) units = units * TEN + BigInt(digits.charCodeAt(k) - 48)
  return { units: negative ? -units : units, places }
}

/** An integer count of 10^-decimals as a plain decimal: 2150 at 2 is "21.50"; never "-0". */
function decimalText(scaled: bigint, decimals: number): string {
  const negative = scaled < ZERO
  let digits = (negative ? -scaled : scaled).toString()
  while (digits.length <= decimals) digits = "0" + digits
  const whole = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals)
  return (negative ? "-" : "") + whole + (decimals > 0 ? "." + fraction : "")
}

function validScale(scale: Scale): { offset: bigint; offsetPlaces: number } | undefined {
  const { numerator, denominator, decimals } = scale
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || !Number.isInteger(decimals)) return undefined
  if (denominator < 1 || denominator > MAX_FACTOR || numerator < -MAX_FACTOR || numerator > MAX_FACTOR) return undefined
  if (decimals < 0 || decimals > MAX_DECIMALS) return undefined
  const offset = parseDecimal(scale.offset ?? "0", 18, MAX_OFFSET_DIGITS)
  if (!offset || offset.places > decimals) return undefined
  const whole = offset.units / pow10(offset.places)
  if (whole >= LIMIT || -whole >= LIMIT) return undefined
  return { offset: offset.units, offsetPlaces: offset.places }
}

/**
 * `value` × numerator / denominator + offset, rounded half away from zero to
 * `decimals`, as a plain decimal; undefined where the value is not a plain
 * decimal, the scale is not one this allows, or the result is out of bounds.
 */
export function scaleValue(value: string, scale: Scale): string | undefined {
  const valid = validScale(scale)
  if (!valid) return undefined
  const parsed = parseDecimal(value, MAX_SIGNIFICANT_DIGITS, MAX_FRACTION_DIGITS)
  if (!parsed) return undefined
  const k = scale.decimals

  // value × n / d = X / D: X below 10^18, D below 10^15.
  const X = parsed.units * BigInt(scale.numerator)
  const D = pow10(parsed.places) * BigInt(scale.denominator)
  const negative = X < ZERO
  const magnitude = negative ? -X : X
  const whole = magnitude / D
  if (whole >= LIMIT) return undefined
  // |X| / D × 10^k as Q + r / D, digit by digit: r stays below D, 10r below 10^16.
  let Q = whole
  let r = magnitude % D
  for (let i = 0; i < k; i++) {
    r *= TEN
    Q = Q * TEN + r / D
    r %= D
  }
  // The offset in the same units, then the whole as floor F plus rr / D, 0 ≤ rr < D.
  const offset = valid.offset * pow10(k - valid.offsetPlaces)
  let F: bigint
  let rr: bigint
  if (!negative) {
    F = Q + offset
    rr = r
  } else if (r === ZERO) {
    F = offset - Q
    rr = ZERO
  } else {
    F = offset - Q - ONE
    rr = D - r
  }
  // Half away from zero.
  let rounded: bigint
  if (F >= ZERO) rounded = F + (TWO * rr >= D ? ONE : ZERO)
  else if (rr === ZERO) rounded = F
  else rounded = -(-F - ONE + (TWO * (D - rr) >= D ? ONE : ZERO))
  const limit = LIMIT * pow10(k)
  if (rounded >= limit || -rounded >= limit) return undefined
  return decimalText(rounded, k)
}

/**
 * What a level publishes for the value set: the write format's text with the
 * value - scaled first where the format has a factor - in place of
 * `{value}`. Only `{value}` is special; every other brace stands as written.
 * Undefined where the value cannot be scaled: nothing is sent then.
 */
export function formatWrite(value: string, format: WriteFormat | undefined): string | undefined {
  if (!format) return value
  let put = value
  if (format.numerator !== undefined || format.denominator !== undefined || format.offset !== undefined) {
    const scaled = scaleValue(value, {
      numerator: format.numerator ?? 1,
      denominator: format.denominator ?? 1,
      offset: format.offset,
      decimals: format.decimals ?? 0,
    })
    if (scaled === undefined) return undefined
    put = scaled
  }
  const marker = "{value}"
  let out = ""
  let i = 0
  while (i < format.text.length) {
    if (format.text.startsWith(marker, i)) {
      out += put
      i += marker.length
    } else out += format.text[i++]
  }
  return out
}
