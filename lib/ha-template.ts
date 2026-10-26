// Home Assistant's templates, the part of them discovery configs use
// (docs/2026-10-26-ha-templates.md, survey docs/2026-10-26-template-survey.md).
//
// Only the designer evaluates them, when it reads a discovery config: a
// command template rendered for each value a switch, a button or a choice
// can send, a state template run backwards to the values a switch reads. A
// template is never stored and never reaches a device.
//
// What is understood is a subset of Jinja as Home Assistant runs it: text,
// `{{ … }}`, `{% if %}`/`{% elif %}`/`{% else %}`, `{% set %}`; literals,
// lists and dicts, attributes and items, arithmetic, comparisons, `and`,
// `or`, `not`, `x if c else y`, tests and the filters below. It computes as
// Python does - 1 == True, 7 / 2 == 3.5, str(2.0) == "2.0" - and as Home
// Assistant's own filters do (`round` to an int at precision 0, `float`
// without a default fails on text). The cases are in
// lib/ha-template/vectors.json, their results rendered by Jinja itself
// (scripts/ha-template-vectors.py). Anything else is a reason, never a guess.

// --- Values ------------------------------------------------------------------

/** A number, with Python's int or float kind: 2 and 2.0 print differently. */
export interface Num {
  num: number
  int: boolean
}

/** Jinja's undefined: a missing name, attribute or item. */
export const UNDEFINED: unique symbol = Symbol("undefined")

export type Value = string | boolean | null | Num | Value[] | Dict | typeof UNDEFINED

/** A dict, in insertion order as Python's. */
export class Dict {
  constructor(readonly entries: Map<string, Value> = new Map()) {}
}

/** Why a template cannot be followed: not understood, or not for this input. */
export class TemplateError extends Error {}

function int(n: number): Num {
  return { num: n, int: true }
}

function float(n: number): Num {
  return { num: n, int: false }
}

function isNum(v: Value): v is Num {
  return typeof v === "object" && v !== null && "num" in v
}

/** A number as Python takes it in arithmetic: a bool is 0 or 1. */
function numeric(v: Value): Num | undefined {
  if (typeof v === "boolean") return int(v ? 1 : 0)
  return isNum(v) ? v : undefined
}

/** A JSON value as Python's json.loads gives it. */
export function fromJson(json: unknown): Value {
  if (json === null) return null
  if (typeof json === "string" || typeof json === "boolean") return json
  if (typeof json === "number") return Number.isInteger(json) ? int(json) : float(json)
  if (Array.isArray(json)) return json.map(fromJson)
  if (typeof json === "object") return new Dict(new Map(Object.entries(json as object).map(([k, v]) => [k, fromJson(v)])))
  return UNDEFINED
}

/**
 * The payload Python's json.loads would read from raw JSON text, or undefined
 * where it is not JSON - Home Assistant's `value_json`. The numbers keep their
 * kind: `2.0` stays a float, which JSON.parse cannot tell from `2`.
 */
export function parseJsonValue(text: string): Value {
  let i = 0
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++
  }
  const value = (): Value => {
    ws()
    const c = text[i]
    if (c === "{") {
      i++
      const map = new Map<string, Value>()
      ws()
      if (text[i] === "}") {
        i++
        return new Dict(map)
      }
      for (;;) {
        ws()
        const key = value()
        if (typeof key !== "string") throw new TemplateError("json")
        ws()
        if (text[i++] !== ":") throw new TemplateError("json")
        map.set(key, value())
        ws()
        if (text[i] === ",") i++
        else if (text[i] === "}") {
          i++
          return new Dict(map)
        } else throw new TemplateError("json")
      }
    }
    if (c === "[") {
      i++
      const list: Value[] = []
      ws()
      if (text[i] === "]") {
        i++
        return list
      }
      for (;;) {
        list.push(value())
        ws()
        if (text[i] === ",") i++
        else if (text[i] === "]") {
          i++
          return list
        } else throw new TemplateError("json")
      }
    }
    if (c === '"') {
      const m = /^"(?:[^"\\\u0000-\u001f]|\\.)*"/.exec(text.slice(i))
      if (!m) throw new TemplateError("json")
      i += m[0].length
      return JSON.parse(m[0])
    }
    const m = /^-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (m) {
      i += m[0].length
      return m[1] || m[2] ? float(Number(m[0])) : int(Number(m[0]))
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length
        return v
      }
    }
    throw new TemplateError("json")
  }
  try {
    const v = value()
    ws()
    return i === text.length ? v : UNDEFINED
  } catch {
    return UNDEFINED
  }
}

/** Python's repr of a float: the shortest digits, fixed from 1e-4 to below 1e16. */
function floatText(n: number): string {
  if (Number.isNaN(n)) return "nan"
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf"
  if (n === 0) return Object.is(n, -0) ? "-0.0" : "0.0"
  const [mantissa, exp] = n.toExponential().split("e")
  const e = Number(exp)
  const negative = mantissa.startsWith("-")
  const digits = mantissa.replace("-", "").replace(".", "")
  let out: string
  if (e >= -5 + 1 && e < 16) {
    if (e >= digits.length - 1) out = digits + "0".repeat(e - digits.length + 1) + ".0"
    else if (e >= 0) out = `${digits.slice(0, e + 1)}.${digits.slice(e + 1)}`
    else out = `0.${"0".repeat(-e - 1)}${digits}`
  } else {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
    out = `${m}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`
  }
  return negative ? `-${out}` : out
}

function repr(v: Value): string {
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  return str(v)
}

/** Python's str(), as `{{ … }}` writes a value. */
export function str(v: Value): string {
  if (v === UNDEFINED) return ""
  if (typeof v === "string") return v
  if (typeof v === "boolean") return v ? "True" : "False"
  if (v === null) return "None"
  if (Array.isArray(v)) return `[${v.map(repr).join(", ")}]`
  if (v instanceof Dict) return `{${[...v.entries].map(([k, x]) => `${repr(k)}: ${repr(x)}`).join(", ")}}`
  return v.int ? String(v.num) : floatText(v.num)
}

function truthy(v: Value): boolean {
  if (v === UNDEFINED || v === null) return false
  if (typeof v === "string") return v !== ""
  if (typeof v === "boolean") return v
  if (Array.isArray(v)) return v.length > 0
  if (v instanceof Dict) return v.entries.size > 0
  return v.num !== 0
}

function equal(a: Value, b: Value): boolean {
  const na = numeric(a)
  const nb = numeric(b)
  if (na && nb) return na.num === nb.num
  if (typeof a === "string" || typeof b === "string") return a === b
  if (a === null || b === null || a === UNDEFINED || b === UNDEFINED) return a === b
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]))
  if (a instanceof Dict && b instanceof Dict) {
    return a.entries.size === b.entries.size && [...a.entries].every(([k, x]) => b.entries.has(k) && equal(x, b.entries.get(k)!))
  }
  return false
}

function typeName(v: Value): string {
  if (v === UNDEFINED) return "Undefined"
  if (typeof v === "string") return "str"
  if (typeof v === "boolean") return "bool"
  if (v === null) return "NoneType"
  if (Array.isArray(v)) return "list"
  if (v instanceof Dict) return "dict"
  return v.int ? "int" : "float"
}

function order(op: string, a: Value, b: Value): boolean {
  const na = numeric(a)
  const nb = numeric(b)
  let c: number
  if (na && nb) c = na.num - nb.num
  else if (typeof a === "string" && typeof b === "string") c = a < b ? -1 : a > b ? 1 : 0
  else throw new TemplateError(`${typeName(a)} ${op} ${typeName(b)}`)
  return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0
}

function contains(container: Value, item: Value): boolean {
  if (typeof container === "string") {
    if (typeof item !== "string") throw new TemplateError(`${typeName(item)} in str`)
    return container.includes(item)
  }
  if (Array.isArray(container)) return container.some((x) => equal(x, item))
  if (container instanceof Dict) return typeof item === "string" && container.entries.has(item)
  throw new TemplateError(`in ${typeName(container)}`)
}

function arithmetic(op: string, a: Value, b: Value): Value {
  if (op === "+" && typeof a === "string" && typeof b === "string") return a + b
  if (op === "+" && Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
  const na = numeric(a)
  const nb = numeric(b)
  if (!na || !nb) throw new TemplateError(`${typeName(a)} ${op} ${typeName(b)}`)
  const both = na.int && nb.int
  switch (op) {
    case "+":
      return { num: na.num + nb.num, int: both }
    case "-":
      return { num: na.num - nb.num, int: both }
    case "*":
      return { num: na.num * nb.num, int: both }
    case "/":
      if (nb.num === 0) throw new TemplateError("division by zero")
      return float(na.num / nb.num)
    case "//":
      if (nb.num === 0) throw new TemplateError("division by zero")
      return { num: Math.floor(na.num / nb.num), int: both }
    case "%": {
      if (nb.num === 0) throw new TemplateError("division by zero")
      const r = na.num % nb.num
      return { num: r !== 0 && r < 0 !== nb.num < 0 ? r + nb.num : r, int: both }
    }
    case "**":
      return { num: na.num ** nb.num, int: both && nb.num >= 0 }
  }
  throw new TemplateError(op)
}

/** Python's float() of a value; undefined where it raises. */
function toFloat(v: Value): number | undefined {
  const n = numeric(v)
  if (n) return n.num
  if (typeof v === "string") {
    const t = v.trim().replace(/_/g, "")
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t)
    if (/^[+-]?(inf|infinity)$/i.test(t)) return t.startsWith("-") ? -Infinity : Infinity
    if (/^[+-]?nan$/i.test(t)) return NaN
  }
  return undefined
}

/** Jinja's do_int: int(value), else int(float(value)); undefined where neither. */
function toInt(v: Value): number | undefined {
  const n = numeric(v)
  if (n) return Number.isFinite(n.num) ? Math.trunc(n.num) : undefined
  if (typeof v === "string") {
    const t = v.trim().replace(/_/g, "")
    if (/^[+-]?\d+$/.test(t)) return Number(t)
    const f = toFloat(v)
    return f !== undefined && Number.isFinite(f) ? Math.trunc(f) : undefined
  }
  return undefined
}

/**
 * Python's round(): the nearest, to even on an exact half - exact in the
 * double as stored, so 2.675 (stored just under) goes down, as in Python.
 */
function pyRound(x: number, precision: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21 || precision < 0 || precision > 20) return x
  const exact = Math.abs(x).toFixed(Math.min(100, precision + 60))
  const point = exact.indexOf(".")
  const after = exact.slice(point + 1 + precision)
  if (/^50*$/.test(after)) {
    const down = Number((Math.trunc(Math.abs(x) * 10 ** precision) / 10 ** precision).toFixed(precision))
    const lastDigit = Number(exact[point + precision] === "." ? exact[point - 1] : exact[point + precision])
    const magnitude = lastDigit % 2 === 0 ? down : Number((down + 10 ** -precision).toFixed(precision))
    return x < 0 ? -magnitude : magnitude
  }
  return Number(x.toFixed(precision))
}

/** cv.boolean, Home Assistant's `bool`. */
function toBool(v: Value): boolean | undefined {
  if (typeof v === "boolean") return v
  const n = numeric(v)
  if (n) return n.num !== 0
  if (typeof v === "string") {
    const t = v.toLowerCase().trim()
    if (["1", "true", "yes", "on", "enable"].includes(t)) return true
    if (["0", "false", "no", "off", "disable"].includes(t)) return false
  }
  return undefined
}

function jsonText(v: Value, sorted: boolean, spaced: boolean, ascii: boolean): string {
  const sep = spaced ? ", " : ","
  const colon = spaced ? ": " : ":"
  const quote = (s: string) => {
    let out = JSON.stringify(s)
    if (ascii) out = out.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
    return out
  }
  if (v === UNDEFINED) throw new TemplateError("Undefined to JSON")
  if (v === null) return "null"
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "string") return quote(v)
  if (Array.isArray(v)) return `[${v.map((x) => jsonText(x, sorted, spaced, ascii)).join(sep)}]`
  if (v instanceof Dict) {
    const entries = [...v.entries]
    if (sorted) entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, x]) => `${quote(k)}${colon}${jsonText(x, sorted, spaced, ascii)}`).join(sep)}}`
  }
  if (!Number.isFinite(v.num)) return spaced ? (Number.isNaN(v.num) ? "NaN" : v.num > 0 ? "Infinity" : "-Infinity") : "null"
  return v.int ? String(v.num) : floatText(v.num)
}

// --- Filters, tests, functions ------------------------------------------------

type Args = { positional: Value[]; named: Map<string, Value> }

function arg(args: Args, index: number, name: string): Value | undefined {
  return args.named.get(name) ?? args.positional[index]
}

function failOr(args: Args, index: number, name: string, what: string): Value {
  const d = arg(args, index, "default")
  if (d === undefined) throw new TemplateError(`${name}(${what})`)
  return d
}

/** Home Assistant's float, int, round, multiply, add, bool; Jinja's others. */
const FILTERS: Record<string, (v: Value, args: Args) => Value> = {
  float: (v, a) => {
    const f = toFloat(v)
    return f === undefined ? failOr(a, 0, "float", str(v)) : float(f)
  },
  int: (v, a) => {
    const n = toInt(v)
    return n !== undefined ? int(n) : failOr(a, 0, "int", str(v))
  },
  round: (v, a) => {
    const precision = numeric(arg(a, 0, "precision") ?? int(0))?.num ?? 0
    const method = arg(a, 1, "method") ?? "common"
    const f = toFloat(v)
    if (f === undefined) return failOr(a, 2, "round", str(v))
    const m = 10 ** precision
    let r: number
    if (method === "ceil") r = Math.ceil(f * m) / m
    else if (method === "floor") r = Math.floor(f * m) / m
    else if (method === "half") r = pyRound(f * 2, 0) / 2
    else r = pyRound(f, precision)
    return precision === 0 ? int(Math.trunc(r)) : float(r)
  },
  multiply: (v, a) => {
    const f = toFloat(v)
    const by = numeric(arg(a, 0, "amount") ?? UNDEFINED)
    if (f === undefined || !by) return failOr(a, 1, "multiply", str(v))
    return float(f * by.num)
  },
  add: (v, a) => {
    const f = toFloat(v)
    const by = numeric(arg(a, 0, "amount") ?? UNDEFINED)
    if (f === undefined || !by) return failOr(a, 1, "add", str(v))
    return float(f + by.num)
  },
  bool: (v, a) => {
    const b = toBool(v)
    return b === undefined ? failOr(a, 0, "bool", str(v)) : b
  },
  default: (v, a) => {
    const d = arg(a, 0, "default_value") ?? ""
    const boolean = truthy(arg(a, 1, "boolean") ?? false)
    return v === UNDEFINED || (boolean && !truthy(v)) ? d : v
  },
  string: (v) => str(v),
  lower: (v) => str(v).toLowerCase(),
  upper: (v) => str(v).toUpperCase(),
  trim: (v) => str(v).trim(),
  replace: (v, a) => str(v).split(str(arg(a, 0, "old") ?? "")).join(str(arg(a, 1, "new") ?? "")),
  abs: (v) => {
    const n = numeric(v)
    if (!n) throw new TemplateError(`abs(${typeName(v)})`)
    return { num: Math.abs(n.num), int: n.int }
  },
  length: (v) => int(typeof v === "string" || Array.isArray(v) ? v.length : v instanceof Dict ? v.entries.size : 0),
  first: (v) => (Array.isArray(v) ? (v[0] ?? UNDEFINED) : typeof v === "string" ? (v[0] ?? UNDEFINED) : UNDEFINED),
  last: (v) => (Array.isArray(v) ? (v[v.length - 1] ?? UNDEFINED) : typeof v === "string" ? (v[v.length - 1] ?? UNDEFINED) : UNDEFINED),
  join: (v, a) => {
    if (!Array.isArray(v)) throw new TemplateError("join")
    return v.map(str).join(str(arg(a, 0, "d") ?? ""))
  },
  max: (v) => extreme(v, ">"),
  min: (v) => extreme(v, "<"),
  // Jinja's own: sorted, spaced, every non-ASCII and <>&' escaped.
  tojson: (v) =>
    jsonText(v, true, true, true)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/'/g, "\\u0027"),
  // Home Assistant's (orjson): as the dict was written, compact.
  to_json: (v) => jsonText(v, false, false, false),
}
FILTERS.d = FILTERS.default
FILTERS.count = FILTERS.length

function extreme(v: Value, op: "<" | ">"): Value {
  if (!Array.isArray(v) || v.length === 0) throw new TemplateError(op === ">" ? "max" : "min")
  return v.reduce((best, x) => (order(op, x, best) ? x : best))
}

const TESTS: Record<string, (v: Value, args: Value[]) => boolean> = {
  defined: (v) => v !== UNDEFINED,
  undefined: (v) => v === UNDEFINED,
  none: (v) => v === null,
  number: (v) => typeof v === "boolean" || isNum(v),
  string: (v) => typeof v === "string",
  boolean: (v) => typeof v === "boolean",
  true: (v) => v === true,
  false: (v) => v === false,
  mapping: (v) => v instanceof Dict,
  is_number: (v) => {
    const f = toFloat(v)
    return f !== undefined && Number.isFinite(f)
  },
  eq: (v, [x]) => equal(v, x),
  equalto: (v, [x]) => equal(v, x),
  ne: (v, [x]) => !equal(v, x),
  in: (v, [x]) => contains(x, v),
}

const FUNCTIONS: Record<string, (args: Args) => Value> = {
  float: (a) => FILTERS.float(a.positional[0] ?? UNDEFINED, { positional: a.positional.slice(1), named: a.named }),
  int: (a) => FILTERS.int(a.positional[0] ?? UNDEFINED, { positional: a.positional.slice(1), named: a.named }),
  bool: (a) => FILTERS.bool(a.positional[0] ?? UNDEFINED, { positional: a.positional.slice(1), named: a.named }),
  is_number: (a) => TESTS.is_number(a.positional[0] ?? UNDEFINED, []),
  max: (a) => extreme(a.positional.length === 1 ? a.positional[0] : a.positional, ">"),
  min: (a) => extreme(a.positional.length === 1 ? a.positional[0] : a.positional, "<"),
}

// Home Assistant's own, named in the reason: they need what only it knows.
const HOME_ASSISTANT_ONLY = new Set([
  "states", "is_state", "state_attr", "is_state_attr", "has_value", "area_name", "area_id", "area_entities",
  "device_attr", "device_id", "device_entities", "expand", "now", "utcnow", "as_timestamp", "as_datetime",
  "as_local", "today_at", "relative_time", "time_since", "time_until", "integration_entities", "label_entities", "this",
])

// --- Parsing -------------------------------------------------------------------

type Expr =
  | { t: "lit"; v: Value }
  | { t: "name"; name: string }
  | { t: "attr"; of: Expr; name: string }
  | { t: "item"; of: Expr; key: Expr }
  | { t: "list"; items: Expr[] }
  | { t: "dict"; items: [Expr, Expr][] }
  | { t: "unary"; op: "-" | "+" | "not"; of: Expr }
  | { t: "bin"; op: string; a: Expr; b: Expr }
  | { t: "and" | "or"; a: Expr; b: Expr }
  | { t: "cond"; test: Expr; then: Expr; else?: Expr }
  | { t: "filter"; of: Expr; name: string; args: ArgExprs }
  | { t: "test"; of: Expr; name: string; negated: boolean; args: Expr[] }
  | { t: "call"; name: string; args: ArgExprs }
  | { t: "method"; of: Expr; name: string; args: ArgExprs }

type ArgExprs = { positional: Expr[]; named: [string, Expr][] }

type Node =
  | { t: "text"; text: string }
  | { t: "out"; expr: Expr }
  | { t: "if"; branches: { test?: Expr; body: Node[] }[] }
  | { t: "set"; name: string; expr: Expr }

/** A template parsed, ready to render with different values. */
export interface Template {
  nodes: Node[]
  source: string
}

type Token = { k: "name" | "num" | "str" | "op"; s: string; v?: Value }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const rest = src.slice(i)
    let m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)
    if (m) {
      tokens.push({ k: "name", s: m[0] })
      i += m[0].length
      continue
    }
    m = /^(\d[\d_]*\.\d[\d_]*([eE][+-]?\d+)?|\d[\d_]*[eE][+-]?\d+|\d[\d_]*)/.exec(rest)
    if (m) {
      const text = m[0].replace(/_/g, "")
      tokens.push({ k: "num", s: m[0], v: /[.eE]/.test(text) ? float(Number(text)) : int(Number(text)) })
      i += m[0].length
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let out = ""
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const e = src[j + 1]
          out += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e === "\\" || e === '"' || e === "'" ? e : `\\${e}`
          j += 2
        } else out += src[j++]
      }
      if (j >= src.length) throw new TemplateError("an unclosed string")
      tokens.push({ k: "str", s: src.slice(i, j + 1), v: out })
      i = j + 1
      continue
    }
    m = /^(\/\/|\*\*|==|!=|<=|>=|[-+*/%~<>()[\]{}.,:|=])/.exec(rest)
    if (!m) throw new TemplateError(`\`${c}\``)
    tokens.push({ k: "op", s: m[0] })
    i += m[0].length
  }
  return tokens
}

class ExprParser {
  private i = 0
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset]
  }
  private is(s: string, offset = 0): boolean {
    const t = this.peek(offset)
    return !!t && (t.k === "op" || t.k === "name") && t.s === s
  }
  private take(s: string): void {
    if (!this.is(s)) throw new TemplateError(`\`${this.peek()?.s ?? "end"}\` where \`${s}\` was expected`)
    this.i++
  }
  done(): boolean {
    return this.i >= this.tokens.length
  }
  rest(): string {
    return this.tokens
      .slice(this.i)
      .map((t) => t.s)
      .join(" ")
  }

  expression(): Expr {
    const then = this.or()
    if (this.is("if")) {
      this.i++
      const test = this.or()
      if (this.is("else")) {
        this.i++
        return { t: "cond", test, then, else: this.expression() }
      }
      return { t: "cond", test, then }
    }
    return then
  }
  private or(): Expr {
    let a = this.and()
    while (this.is("or")) {
      this.i++
      a = { t: "or", a, b: this.and() }
    }
    return a
  }
  private and(): Expr {
    let a = this.not()
    while (this.is("and")) {
      this.i++
      a = { t: "and", a, b: this.not() }
    }
    return a
  }
  private not(): Expr {
    if (this.is("not")) {
      this.i++
      return { t: "unary", op: "not", of: this.not() }
    }
    return this.compare()
  }
  private compare(): Expr {
    let a = this.math1()
    for (;;) {
      const t = this.peek()
      if (t && t.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.s)) {
        this.i++
        a = { t: "bin", op: t.s, a, b: this.math1() }
      } else if (this.is("in")) {
        this.i++
        a = { t: "bin", op: "in", a, b: this.math1() }
      } else if (this.is("not") && this.is("in", 1)) {
        this.i += 2
        a = { t: "bin", op: "not in", a, b: this.math1() }
      } else return a
    }
  }
  private math1(): Expr {
    let a = this.concat()
    while (this.is("+") || this.is("-")) {
      const op = this.peek()!.s
      this.i++
      a = { t: "bin", op, a, b: this.concat() }
    }
    return a
  }
  private concat(): Expr {
    let a = this.math2()
    while (this.is("~")) {
      this.i++
      a = { t: "bin", op: "~", a, b: this.math2() }
    }
    return a
  }
  private math2(): Expr {
    let a = this.pow()
    while (this.is("*") || this.is("/") || this.is("//") || this.is("%")) {
      const op = this.peek()!.s
      this.i++
      a = { t: "bin", op, a, b: this.pow() }
    }
    return a
  }
  private pow(): Expr {
    let a = this.unary(true)
    while (this.is("**")) {
      this.i++
      a = { t: "bin", op: "**", a, b: this.unary(true) }
    }
    return a
  }
  private unary(withFilter: boolean): Expr {
    let node: Expr
    if (this.is("-") || this.is("+")) {
      const op = this.peek()!.s as "-" | "+"
      this.i++
      node = { t: "unary", op, of: this.unary(false) }
    } else node = this.postfix(this.primary())
    return withFilter ? this.filters(node) : node
  }
  private primary(): Expr {
    const t = this.peek()
    if (!t) throw new TemplateError("an expression that ends early")
    this.i++
    if (t.k === "num" || t.k === "str") {
      let v = t.v!
      // Adjacent strings join, as in Python.
      while (typeof v === "string" && this.peek()?.k === "str") v += this.tokens[this.i++].v as string
      return { t: "lit", v }
    }
    if (t.k === "name") {
      if (t.s === "true" || t.s === "True") return { t: "lit", v: true }
      if (t.s === "false" || t.s === "False") return { t: "lit", v: false }
      if (t.s === "none" || t.s === "None") return { t: "lit", v: null }
      if (this.is("(")) return { t: "call", name: t.s, args: this.args() }
      return { t: "name", name: t.s }
    }
    if (t.s === "(") {
      const first = this.expression()
      if (this.is(",")) {
        const items = [first]
        while (this.is(",")) {
          this.i++
          if (this.is(")")) break
          items.push(this.expression())
        }
        this.take(")")
        return { t: "list", items }
      }
      this.take(")")
      return first
    }
    if (t.s === "[") {
      const items: Expr[] = []
      while (!this.is("]")) {
        items.push(this.expression())
        if (!this.is("]")) this.take(",")
      }
      this.take("]")
      return { t: "list", items }
    }
    if (t.s === "{") {
      const items: [Expr, Expr][] = []
      while (!this.is("}")) {
        const key = this.expression()
        this.take(":")
        items.push([key, this.expression()])
        if (!this.is("}")) this.take(",")
      }
      this.take("}")
      return { t: "dict", items }
    }
    throw new TemplateError(`\`${t.s}\``)
  }
  private postfix(node: Expr): Expr {
    for (;;) {
      if (this.is(".")) {
        this.i++
        const t = this.peek()
        if (!t || (t.k !== "name" && t.k !== "num")) throw new TemplateError("`.` without a name")
        this.i++
        if (t.k === "num") node = { t: "item", of: node, key: { t: "lit", v: t.v! } }
        else if (this.is("(")) node = { t: "method", of: node, name: t.s, args: this.args() }
        else node = { t: "attr", of: node, name: t.s }
      } else if (this.is("[")) {
        this.i++
        const key = this.expression()
        this.take("]")
        node = { t: "item", of: node, key }
      } else return node
    }
  }
  private filters(node: Expr): Expr {
    for (;;) {
      if (this.is("|")) {
        this.i++
        const t = this.peek()
        if (!t || t.k !== "name") throw new TemplateError("`|` without a filter")
        this.i++
        node = { t: "filter", of: node, name: t.s, args: this.is("(") ? this.args() : { positional: [], named: [] } }
      } else if (this.is("is")) {
        this.i++
        let negated = false
        if (this.is("not")) {
          this.i++
          negated = true
        }
        const t = this.peek()
        if (!t || t.k !== "name") throw new TemplateError("`is` without a test")
        this.i++
        let args: Expr[] = []
        if (this.is("(")) args = this.args().positional
        else if (this.peek() && !this.is("and") && !this.is("or") && !this.is("else") && !this.is("if") && (this.peek()!.k !== "op" || ["(", "[", "{", "-"].includes(this.peek()!.s))) {
          args = [this.unary(false)]
        }
        node = { t: "test", of: node, name: t.s, negated, args }
      } else return node
    }
  }
  private args(): ArgExprs {
    this.take("(")
    const out: ArgExprs = { positional: [], named: [] }
    while (!this.is(")")) {
      const t = this.peek()
      if (t?.k === "name" && this.is("=", 1)) {
        this.i += 2
        out.named.push([t.s, this.expression()])
      } else out.positional.push(this.expression())
      if (!this.is(")")) this.take(",")
    }
    this.take(")")
    return out
  }
}

function expr(src: string): Expr {
  const p = new ExprParser(tokenize(src))
  const e = p.expression()
  if (!p.done()) throw new TemplateError(`\`${p.rest()}\``)
  return e
}

/** What a template is made of, checked for what this subset knows; why not, as a reason. */
export function parseTemplate(source: string): Template | { unsupported: string } {
  try {
    const nodes = parseNodes(source)
    const unknown = unknownNames(nodes)
    if (unknown) return { unsupported: unknown }
    return { nodes, source }
  } catch (e) {
    if (e instanceof TemplateError) return { unsupported: e.message }
    throw e
  }
}

/**
 * Where a tag's `}}` or `%}` is: outside quotes and brackets, as Jinja's lexer
 * finds it - `{{ {"a": {"b": 1}}|tojson }}` closes at the last one.
 */
function closing(source: string, from: number, close: string): number {
  let depth = 0
  for (let i = from; i < source.length; i++) {
    const c = source[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1
      i = j
    } else if (c === "{" || c === "[" || c === "(") depth++
    else if (depth === 0 && source.startsWith(close, i)) return i
    else if (c === "}" || c === "]" || c === ")") depth--
  }
  return -1
}

function parseNodes(source: string): Node[] {
  // Tags and their whitespace control, as Jinja splits them.
  const parts: ({ text: string } | { tag: "{{" | "{%"; body: string })[] = []
  const re = /\{\{-?|\{%-?|\{#-?/g
  let at = 0
  let trimNext = false
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    let text = source.slice(at, m.index)
    if (trimNext) text = text.replace(/^\s+/, "")
    if (m[0].endsWith("-")) text = text.replace(/\s+$/, "")
    if (text) parts.push({ text })
    const open = m[0].slice(0, 2)
    const close = open === "{{" ? "}}" : open === "{%" ? "%}" : "#}"
    const end = open === "{#" ? source.indexOf(close, re.lastIndex) : closing(source, re.lastIndex, close)
    if (end === -1) throw new TemplateError(`an unclosed ${open}`)
    let body = source.slice(re.lastIndex, end)
    trimNext = body.endsWith("-")
    if (trimNext) body = body.slice(0, -1)
    if (open !== "{#") parts.push({ tag: open as "{{" | "{%", body })
    at = end + 2
    re.lastIndex = at
  }
  let text = source.slice(at)
  if (trimNext) text = text.replace(/^\s+/, "")
  if (text) parts.push({ text })

  let i = 0
  const block = (ends: string[]): { nodes: Node[]; end?: string; body?: string } => {
    const nodes: Node[] = []
    while (i < parts.length) {
      const p = parts[i++]
      if ("text" in p) {
        nodes.push({ t: "text", text: p.text })
        continue
      }
      if (p.tag === "{{") {
        nodes.push({ t: "out", expr: expr(p.body) })
        continue
      }
      const word = /^\s*(\w+)/.exec(p.body)?.[1] ?? ""
      const rest = p.body.replace(/^\s*\w+/, "")
      if (ends.includes(word)) return { nodes, end: word, body: rest }
      if (word === "if") {
        const branches: { test?: Expr; body: Node[] }[] = []
        let test: Expr | undefined = expr(rest)
        for (;;) {
          const inner = block(["elif", "else", "endif"])
          if (!inner.end) throw new TemplateError("an {% if %} without {% endif %}")
          branches.push({ test, body: inner.nodes })
          if (inner.end === "endif") break
          test = inner.end === "elif" ? expr(inner.body!) : undefined
          if (inner.end === "else") {
            const last = block(["endif"])
            if (!last.end) throw new TemplateError("an {% if %} without {% endif %}")
            branches.push({ body: last.nodes })
            break
          }
        }
        nodes.push({ t: "if", branches })
        continue
      }
      if (word === "set") {
        const assign = /^\s*([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(rest)
        if (!assign) throw new TemplateError("a {% set %} that is not one name")
        nodes.push({ t: "set", name: assign[1], expr: expr(assign[2]) })
        continue
      }
      throw new TemplateError(`a {% ${word} %} block`)
    }
    return { nodes }
  }
  const out = block([])
  return out.nodes
}

/** The first function, filter or test the subset does not know, as a reason. */
function unknownNames(nodes: Node[]): string | undefined {
  let found: string | undefined
  const visit = (e: Expr): void => {
    if (found) return
    switch (e.t) {
      case "call":
        if (HOME_ASSISTANT_ONLY.has(e.name)) found = `${e.name}()`
        else if (!FUNCTIONS[e.name]) found = `the function ${e.name}()`
        e.args.positional.forEach(visit)
        e.args.named.forEach(([, x]) => visit(x))
        return
      case "filter":
        if (!FILTERS[e.name]) found = `the filter ${e.name}`
        visit(e.of)
        e.args.positional.forEach(visit)
        e.args.named.forEach(([, x]) => visit(x))
        return
      case "test":
        if (!TESTS[e.name]) found = `the test ${e.name}`
        visit(e.of)
        e.args.forEach(visit)
        return
      case "method":
        if (!["get", "lower", "upper", "strip"].includes(e.name)) found = `the method ${e.name}()`
        visit(e.of)
        e.args.positional.forEach(visit)
        return
      case "name":
        if (HOME_ASSISTANT_ONLY.has(e.name)) found = `\`${e.name}\``
        return
      case "attr":
        return visit(e.of)
      case "item":
        visit(e.of)
        return visit(e.key)
      case "list":
        return e.items.forEach(visit)
      case "dict":
        return e.items.forEach(([k, v]) => (visit(k), visit(v)))
      case "unary":
        return visit(e.of)
      case "bin":
      case "and":
      case "or":
        visit(e.a)
        return visit(e.b)
      case "cond":
        visit(e.test)
        visit(e.then)
        if (e.else) visit(e.else)
        return
      case "lit":
        return
    }
  }
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.t === "out") visit(n.expr)
      else if (n.t === "set") visit(n.expr)
      else if (n.t === "if") n.branches.forEach((b) => (b.test && visit(b.test), walk(b.body)))
    }
  }
  walk(nodes)
  return found
}

// --- Rendering -------------------------------------------------------------------

function evalArgs(a: ArgExprs, scope: Map<string, Value>): Args {
  return { positional: a.positional.map((x) => evaluate(x, scope)), named: new Map(a.named.map(([k, x]) => [k, evaluate(x, scope)])) }
}

function lookup(of: Value, key: Value): Value {
  if (of === UNDEFINED) throw new TemplateError("an attribute of something undefined")
  if (of instanceof Dict) return typeof key === "string" ? (of.entries.get(key) ?? UNDEFINED) : UNDEFINED
  if (Array.isArray(of) || typeof of === "string") {
    const n = numeric(key)
    if (!n || !n.int || typeof key === "boolean") return UNDEFINED
    const index = n.num < 0 ? of.length + n.num : n.num
    return index >= 0 && index < of.length ? of[index] : UNDEFINED
  }
  return UNDEFINED
}

function evaluate(e: Expr, scope: Map<string, Value>): Value {
  switch (e.t) {
    case "lit":
      return e.v
    case "name":
      return scope.has(e.name) ? scope.get(e.name)! : UNDEFINED
    case "attr":
      return lookup(evaluate(e.of, scope), e.name)
    case "item":
      return lookup(evaluate(e.of, scope), evaluate(e.key, scope))
    case "list":
      return e.items.map((x) => evaluate(x, scope))
    case "dict": {
      const map = new Map<string, Value>()
      for (const [k, v] of e.items) {
        const key = evaluate(k, scope)
        if (typeof key !== "string") throw new TemplateError("a dict key that is not text")
        map.set(key, evaluate(v, scope))
      }
      return new Dict(map)
    }
    case "unary": {
      const v = evaluate(e.of, scope)
      if (e.op === "not") return !truthy(v)
      const n = numeric(v)
      if (!n) throw new TemplateError(`${e.op}${typeName(v)}`)
      return e.op === "-" ? { num: -n.num, int: n.int } : n
    }
    case "bin": {
      const a = evaluate(e.a, scope)
      const b = evaluate(e.b, scope)
      if (e.op === "==") return equal(a, b)
      if (e.op === "!=") return !equal(a, b)
      if (["<", "<=", ">", ">="].includes(e.op)) return order(e.op, a, b)
      if (e.op === "in") return contains(b, a)
      if (e.op === "not in") return !contains(b, a)
      if (e.op === "~") return str(a) + str(b)
      return arithmetic(e.op, a, b)
    }
    case "and": {
      const a = evaluate(e.a, scope)
      return truthy(a) ? evaluate(e.b, scope) : a
    }
    case "or": {
      const a = evaluate(e.a, scope)
      return truthy(a) ? a : evaluate(e.b, scope)
    }
    case "cond":
      return truthy(evaluate(e.test, scope)) ? evaluate(e.then, scope) : e.else ? evaluate(e.else, scope) : UNDEFINED
    case "filter":
      return FILTERS[e.name](evaluate(e.of, scope), evalArgs(e.args, scope))
    case "test": {
      const r = TESTS[e.name](evaluate(e.of, scope), e.args.map((x) => evaluate(x, scope)))
      return e.negated ? !r : r
    }
    case "call":
      return FUNCTIONS[e.name](evalArgs(e.args, scope))
    case "method": {
      const of = evaluate(e.of, scope)
      const args = evalArgs(e.args, scope).positional
      if (e.name === "get" && of instanceof Dict) {
        const key = args[0]
        return typeof key === "string" && of.entries.has(key) ? of.entries.get(key)! : (args[1] ?? null)
      }
      if (typeof of === "string" && e.name === "lower") return of.toLowerCase()
      if (typeof of === "string" && e.name === "upper") return of.toUpperCase()
      if (typeof of === "string" && e.name === "strip") return of.trim()
      throw new TemplateError(`${typeName(of)}.${e.name}()`)
    }
  }
}

/** Renders a parsed template with these variables; a TemplateError where Home Assistant would fail too. */
export function renderTemplate(template: Template, variables: Record<string, Value>): string {
  const scope = new Map(Object.entries(variables))
  let out = ""
  const run = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === "text") out += n.text
      else if (n.t === "out") out += str(evaluate(n.expr, scope))
      else if (n.t === "set") scope.set(n.name, evaluate(n.expr, scope))
      else {
        const branch = n.branches.find((b) => !b.test || truthy(evaluate(b.test, scope)))
        if (branch) run(branch.body)
      }
    }
  }
  run(template.nodes)
  return out
}

/** The variables of a value template for one payload: `value` and, where it is JSON, `value_json`. */
export function payloadVariables(payload: string): Record<string, Value> {
  const json = parseJsonValue(payload)
  return { value: payload, ...(json !== UNDEFINED ? { value_json: json } : {}) }
}

/**
 * Where a template reads the payload: the one `value` or `value_json` path it
 * uses, and the constants it compares that with - what running it backwards
 * needs. Undefined where it reads more than one, or reads it through a
 * method, a call or a computed key.
 */
export function readSource(template: Template): { path: (string | number)[] | "value"; constants: Value[] } | undefined {
  const paths = new Set<string>()
  let source: (string | number)[] | "value" | undefined
  const constants: Value[] = []
  let opaque = false
  const pathOf = (e: Expr): (string | number)[] | "value" | undefined => {
    if (e.t === "name") return e.name === "value_json" ? [] : e.name === "value" ? "value" : undefined
    if (e.t === "attr" || (e.t === "item" && e.key.t === "lit" && (typeof e.key.v === "string" || isNum(e.key.v)))) {
      const of = pathOf(e.of)
      if (of === undefined || of === "value") return undefined
      const key = e.t === "attr" ? e.name : e.key.t === "lit" ? (typeof e.key.v === "string" ? e.key.v : (e.key.v as Num).num) : ""
      return [...of, key]
    }
    return undefined
  }
  const usesPayload = (e: Expr): boolean => {
    let found = false
    const v = (x: Expr) => {
      if (x.t === "name" && (x.name === "value" || x.name === "value_json")) found = true
      for (const child of children(x)) v(child)
    }
    v(e)
    return found
  }
  const note = (e: Expr): boolean => {
    const p = pathOf(e)
    if (p === undefined) return false
    if (p !== "value" && p.length === 0) return false
    paths.add(JSON.stringify(p))
    source = p
    return true
  }
  const visit = (e: Expr): void => {
    if (note(e)) return
    if (e.t === "bin" && ["==", "!=", "in", "not in", "<", "<=", ">", ">="].includes(e.op)) {
      for (const [side, other] of [[e.a, e.b], [e.b, e.a]] as const) {
        if (pathOf(side) !== undefined && other.t === "lit") constants.push(other.v)
        if (pathOf(side) !== undefined && other.t === "list" && other.items.every((x) => x.t === "lit")) {
          for (const x of other.items) constants.push((x as { v: Value }).v)
        }
      }
    }
    if ((e.t === "method" || e.t === "call" || e.t === "item") && usesPayload(e) && pathOf(e) === undefined) {
      // value_json.get('a') reads the field a as well.
      if (e.t === "method" && e.name === "get" && e.args.positional[0]?.t === "lit" && typeof (e.args.positional[0] as { v: Value }).v === "string") {
        const of = pathOf(e.of)
        if (of !== undefined && of !== "value") {
          const p = [...of, (e.args.positional[0] as { v: string }).v]
          paths.add(JSON.stringify(p))
          source = p
          return
        }
      }
      if (e.t !== "call") opaque = true
    }
    for (const child of children(e)) visit(child)
  }
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.t === "out" || n.t === "set") visit(n.expr)
      else if (n.t === "if") n.branches.forEach((b) => (b.test && visit(b.test), walk(b.body)))
    }
  }
  walk(template.nodes)
  if (opaque || paths.size !== 1 || source === undefined) return undefined
  return { path: source, constants }
}

function children(e: Expr): Expr[] {
  switch (e.t) {
    case "attr":
    case "unary":
      return [e.of]
    case "item":
      return [e.of, e.key]
    case "list":
      return e.items
    case "dict":
      return e.items.flat()
    case "bin":
    case "and":
    case "or":
      return [e.a, e.b]
    case "cond":
      return [e.test, e.then, ...(e.else ? [e.else] : [])]
    case "filter":
      return [e.of, ...e.args.positional, ...e.args.named.map(([, x]) => x)]
    case "test":
      return [e.of, ...e.args]
    case "call":
      return [...e.args.positional, ...e.args.named.map(([, x]) => x)]
    case "method":
      return [e.of, ...e.args.positional]
    default:
      return []
  }
}

/** The names a template reads that it does not set itself: what it needs given. */
export function namesUsed(template: Template): Set<string> {
  const used = new Set<string>()
  const set = new Set<string>()
  const visit = (e: Expr): void => {
    if (e.t === "name" && !set.has(e.name)) used.add(e.name)
    for (const child of children(e)) visit(child)
  }
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.t === "out") visit(n.expr)
      else if (n.t === "set") {
        visit(n.expr)
        set.add(n.name)
      } else if (n.t === "if") n.branches.forEach((b) => (b.test && visit(b.test), walk(b.body)))
    }
  }
  walk(template.nodes)
  return used
}

// --- Linear templates (stage 2) -------------------------------------------------

/**
 * A template whose value is `x × numerator / denominator + offset` of one
 * value x, as a device scales it (lib/scaled-value.ts;
 * tasks/ha-templates-stage2-plan.md, decision 5). `decimals` where it rounds
 * last, `round(n)`; absent, the caller chooses. `before` and `after` are the
 * text around the one `{{ … }}` - empty for a value template.
 */
export interface LinearForm {
  /** The payload path it reads, or "value"; for a command template, the variable it writes. */
  path: (string | number)[] | "value"
  numerator: number
  denominator: number
  offset: string
  decimals?: number
  before: string
  after: string
}

// A fraction n / d, d > 0, kept reduced.
type Q = { n: bigint; d: bigint }
const ZERO_Q: Q = { n: BigInt(0), d: BigInt(1) }

function gcd(a: bigint, b: bigint): bigint {
  if (a < BigInt(0)) a = -a
  if (b < BigInt(0)) b = -b
  while (b !== BigInt(0)) [a, b] = [b, a % b]
  return a
}
function q(n: bigint, d: bigint): Q {
  if (d < BigInt(0)) [n, d] = [-n, -d]
  const g = gcd(n, d) || BigInt(1)
  return { n: n / g, d: d / g }
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d)
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d)
const neg = (a: Q): Q => ({ n: -a.n, d: a.d })
const isZero = (a: Q) => a.n === BigInt(0)

// A number literal as the exact decimal it is written as: 3.6 is 36/10, not
// the float nearest it.
function exact(v: Num): Q | undefined {
  if (!Number.isFinite(v.num)) return undefined
  const text = String(v.num)
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(text)
  if (!m) return undefined
  const digits = BigInt(m[2] + (m[3] ?? ""))
  let places = (m[3] ?? "").length - Number(m[4] ?? 0)
  let n = m[1] ? -digits : digits
  let d = BigInt(1)
  for (; places > 0; places--) d *= BigInt(10)
  for (; places < 0; places++) n *= BigInt(10)
  return q(n, d)
}

/** How many places `x` needs as a decimal, or undefined where it does not end. */
export function decimalPlaces(n: number | bigint, d: number | bigint): number | undefined {
  let den = BigInt(d) / (gcd(BigInt(n), BigInt(d)) || BigInt(1))
  let twos = 0
  let fives = 0
  while (den % BigInt(2) === BigInt(0)) (den /= BigInt(2)), twos++
  while (den % BigInt(5) === BigInt(0)) (den /= BigInt(5)), fives++
  return den === BigInt(1) ? Math.max(twos, fives) : undefined
}

/**
 * The linear form of a template, or why it is not one. `variable`: the name a
 * command template writes ("value", "position"); absent, it reads the payload
 * - `value` or one path into `value_json`.
 */
export function linearForm(template: Template, variable?: string): LinearForm | { unsupported: string } {
  const outs = template.nodes.filter((n) => n.t !== "text")
  if (outs.length !== 1 || outs[0].t !== "out") return { unsupported: outs.length === 1 ? "a {% … %} block" : "more than one {{ … }}" }
  const at = template.nodes.indexOf(outs[0])
  const textOf = (nodes: Node[]) => nodes.map((n) => (n as { text: string }).text).join("")
  const before = textOf(template.nodes.slice(0, at))
  const after = textOf(template.nodes.slice(at + 1))
  if (variable === undefined && (before.trim() !== "" || after.trim() !== "")) return { unsupported: "text outside {{ … }}" }

  let expr = outs[0].expr
  let decimals: number | undefined
  if (expr.t === "filter" && expr.name === "round") {
    const [places, method] = expr.args.positional
    const p = places === undefined ? 0 : places.t === "lit" && isNum(places.v) && places.v.int ? places.v.num : -1
    const common = method === undefined || (method.t === "lit" && method.v === "common")
    if (p < 0 || p > 6 || !common || expr.args.named.length > 0) return { unsupported: "a rounding a device does not do" }
    decimals = p
    expr = expr.of
  }

  let path: (string | number)[] | "value" | undefined
  const sourceOf = (e: Expr): (string | number)[] | "value" | undefined => {
    if (variable !== undefined) return e.t === "name" && e.name === variable ? "value" : undefined
    if (e.t === "name") return e.name === "value" ? "value" : undefined
    if (e.t === "attr" || (e.t === "item" && e.key.t === "lit" && (typeof e.key.v === "string" || isNum(e.key.v)))) {
      let of: Expr = e
      const keys: (string | number)[] = []
      while (of.t === "attr" || of.t === "item") {
        if (of.t === "attr") keys.unshift(of.name)
        else if (of.key.t === "lit" && (typeof of.key.v === "string" || isNum(of.key.v))) keys.unshift(typeof of.key.v === "string" ? of.key.v : of.key.v.num)
        else return undefined
        of = of.of
      }
      return of.t === "name" && of.name === "value_json" ? keys : undefined
    }
    return undefined
  }
  // a × x + b, where `x` says whether x is in it at all.
  type L = { a: Q; b: Q; x: boolean } | { unsupported: string }
  const lin = (e: Expr): L => {
    const source = sourceOf(e)
    if (source !== undefined) {
      if (path !== undefined && JSON.stringify(path) !== JSON.stringify(source)) return { unsupported: "more than one value" }
      path = source
      return { a: q(BigInt(1), BigInt(1)), b: ZERO_Q, x: true }
    }
    if (e.t === "lit") {
      const v = isNum(e.v) ? exact(e.v) : undefined
      return v ? { a: ZERO_Q, b: v, x: false } : { unsupported: `\`${str(e.v)}\`` }
    }
    if (e.t === "unary" && e.op !== "not") {
      const of = lin(e.of)
      if ("unsupported" in of || e.op === "+") return of
      return { a: neg(of.a), b: neg(of.b), x: of.x }
    }
    if (e.t === "filter") {
      if (e.name === "float" || e.name === "multiply") {
        const of = lin(e.of)
        if ("unsupported" in of || e.name === "float") return of
        const [by] = e.args.positional
        const factor = by ? lin(by) : undefined
        if (!factor || "unsupported" in factor || factor.x) return { unsupported: "the filter multiply" }
        return { a: mul(of.a, factor.b), b: mul(of.b, factor.b), x: of.x }
      }
      return { unsupported: e.name === "int" ? "the filter int, which cuts off" : e.name === "round" ? "a rounding before the end" : `the filter ${e.name}` }
    }
    // float(x), as rtl_433 writes it: the number itself.
    if (e.t === "call" && e.name === "float" && e.args.positional.length >= 1) return lin(e.args.positional[0])
    if (e.t === "bin" && ["+", "-", "*", "/"].includes(e.op)) {
      const a = lin(e.a)
      if ("unsupported" in a) return a
      const b = lin(e.b)
      if ("unsupported" in b) return b
      if (e.op === "+") return { a: add(a.a, b.a), b: add(a.b, b.b), x: a.x || b.x }
      if (e.op === "-") return { a: add(a.a, neg(b.a)), b: add(a.b, neg(b.b)), x: a.x || b.x }
      if (e.op === "*") {
        if (a.x && b.x) return { unsupported: "a value times itself" }
        const [v, c] = a.x ? [a, b.b] : [b, a.b]
        return { a: mul(v.a, c), b: mul(v.b, c), x: v.x }
      }
      if (b.x || isZero(b.b)) return { unsupported: b.x ? "a division by the value" : "a division by 0" }
      const by = q(b.b.d, b.b.n)
      return { a: mul(a.a, by), b: mul(a.b, by), x: a.x }
    }
    if (e.t === "bin") return { unsupported: `arithmetic (${e.op})` }
    return { unsupported: "an expression a device does not compute" }
  }

  const form = lin(expr)
  if ("unsupported" in form) return form
  if (!form.x || isZero(form.a) || path === undefined) return { unsupported: "no value in it" }
  const limit = BigInt(1_000_000)
  if (form.a.n > limit || -form.a.n > limit || form.a.d > limit) return { unsupported: "a factor too fine for a device" }
  const offsetPlaces = decimalPlaces(form.b.n, form.b.d)
  if (offsetPlaces === undefined || offsetPlaces > 6) return { unsupported: "an offset too fine for a device" }
  if (form.b.n / form.b.d >= BigInt(1e12) || -form.b.n / form.b.d >= BigInt(1e12)) return { unsupported: "an offset too large for a device" }
  let scaled = form.b.n
  for (let i = 0; i < offsetPlaces; i++) scaled *= BigInt(10)
  const units = scaled / form.b.d
  const negative = units < BigInt(0)
  let digits = (negative ? -units : units).toString()
  while (digits.length <= offsetPlaces) digits = "0" + digits
  const offset = (negative ? "-" : "") + digits.slice(0, digits.length - offsetPlaces) + (offsetPlaces > 0 ? "." + digits.slice(digits.length - offsetPlaces) : "")
  if (decimals !== undefined && decimals < offsetPlaces) return { unsupported: "a rounding coarser than its offset" }
  return { path, numerator: Number(form.a.n), denominator: Number(form.a.d), offset, ...(decimals !== undefined ? { decimals } : {}), before, after }
}
