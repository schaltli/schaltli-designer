import { test, expect } from "@playwright/test"
import vectors from "../lib/ha-template/vectors.json"
import { fromJson, linearForm, namesUsed, parseTemplate, payloadVariables, readSource, renderTemplate, TemplateError, type Template, type Value } from "../lib/ha-template"

// Home Assistant's templates as the designer evaluates them
// (docs/2026-10-26-ha-templates.md). The expected results are Jinja's own,
// rendered by scripts/ha-template-vectors.py with Home Assistant's filters -
// not taken from lib/ha-template.ts. Pure: no browser.

interface Case {
  template: string
  payload?: string
  variables?: Record<string, unknown>
  unsupported?: boolean
  result?: string
  error?: string
}

function render(c: Case): { result: string } | { error: true } {
  const parsed = parseTemplate(c.template)
  if ("unsupported" in parsed) throw new Error(`${c.template}: ${parsed.unsupported}`)
  const variables: Record<string, Value> =
    c.payload !== undefined ? payloadVariables(c.payload) : Object.fromEntries(Object.entries(c.variables ?? {}).map(([k, v]) => [k, fromJson(v)]))
  try {
    return { result: renderTemplate(parsed, variables) }
  } catch (e) {
    if (e instanceof TemplateError) return { error: true }
    throw e
  }
}

test.describe("Home Assistant templates, as Jinja renders them", () => {
  for (const c of (vectors as { cases: Case[] }).cases) {
    test(c.template, () => {
      if (c.unsupported) {
        expect(parseTemplate(c.template)).toHaveProperty("unsupported")
        return
      }
      expect(render(c)).toEqual(c.error !== undefined ? { error: true } : { result: c.result })
    })
  }
})

test.describe("what a template needs", () => {
  test("why one cannot be followed names what is missing", () => {
    expect(parseTemplate("{{ states('sensor.x') }}")).toEqual({ unsupported: "states()" })
    expect(parseTemplate("{{ this.state }}")).toEqual({ unsupported: "`this`" })
    expect(parseTemplate("{{ value | regex_replace('a', 'b') }}")).toEqual({ unsupported: "the filter regex_replace" })
    expect(parseTemplate("{% for x in y %}{% endfor %}")).toEqual({ unsupported: "a {% for %} block" })
    expect(parseTemplate("{% if value %}a")).toEqual({ unsupported: "an {% if %} without {% endif %}" })
    expect(parseTemplate("{{ value.split(',') }}")).toEqual({ unsupported: "the method split()" })
  })

  test("the names it reads and does not set itself", () => {
    const t = parseTemplate('{% set on = value == "ON" %}{ "action": "{{ value }}", "code": "{{ code }}", "on": {{ on }} }')
    if ("unsupported" in t) throw new Error(t.unsupported)
    expect([...namesUsed(t)].sort()).toEqual(["code", "value"])
  })

  test("where it reads the payload, and what it compares that with", () => {
    const source = (template: string) => {
      const t = parseTemplate(template)
      if ("unsupported" in t) throw new Error(t.unsupported)
      return readSource(t)
    }
    expect(source("{% if value_json.output %}ON{% else %}OFF{% endif %}")).toEqual({ path: ["output"], constants: [] })
    expect(source('{{ "OFF" if value_json["value"] == 0 else "ON" }}')).toEqual({ path: ["value"], constants: [{ num: 0, int: true }] })
    expect(source("{{ 'on' if value in ['1', 'yes'] else 'off' }}")).toEqual({ path: "value", constants: ["1", "yes"] })
    expect(source("{{ 'on' if value_json.get('unlocked') else 'off' }}")).toEqual({ path: ["unlocked"], constants: [] })
    expect(source("{{ value_json.a.b[0] }}")).toEqual({ path: ["a", "b", 0], constants: [] })
    // Two fields, or a field it computes the name of: no one source.
    expect(source("{{ value_json.a if value_json.b else 'x' }}")).toBeUndefined()
    expect(source("{{ value_json[value_json.k] }}")).toBeUndefined()
  })
})

// Stage 2 (tasks/ha-templates-stage2-plan.md, decision 5): a template that is
// x × a / b + c of one value, as the scale a device computes - exact, the
// literals read as the decimals they are written as - or why it is not one.
test.describe("a linear template", () => {
  const form = (source: string, variable?: string) => linearForm(parseTemplate(source) as Template, variable)

  test("a path, a factor, an offset and a rounding last", () => {
    expect(form("{{ value_json.a.b * 3.6 }}")).toEqual({ path: ["a", "b"], numerator: 18, denominator: 5, offset: "0", before: "", after: "" })
    expect(form("{{ (float(value|float) * 3.6) | round(2) }}")).toMatchObject({ path: "value", numerator: 18, denominator: 5, decimals: 2 })
    expect(form("{{ (value | float(0) / 2.55) | round(0) }}")).toMatchObject({ path: "value", numerator: 20, denominator: 51, decimals: 0 })
    expect(form('{{ value_json["temp"] - 273.15 }}')).toMatchObject({ path: ["temp"], numerator: 1, denominator: 1, offset: "-273.15" })
    expect(form("{{ -(value_json.x / 4) + 1 }}")).toMatchObject({ numerator: -1, denominator: 4, offset: "1" })
    expect(form("{{ value | float | multiply(0.3922) | round(0) }}")).toMatchObject({ numerator: 1961, denominator: 5000, decimals: 0 })
  })

  test("a command template: the text around the one expression of its variable", () => {
    expect(form('{"interval":{{value*1000}},"save":true}', "value")).toEqual({
      path: "value",
      numerator: 1000,
      denominator: 1,
      offset: "0",
      before: '{"interval":',
      after: ',"save":true}',
    })
    expect(form('{ "position": {{ position }} }', "position")).toMatchObject({ numerator: 1, denominator: 1, before: '{ "position": ', after: " }" })
  })

  test("what a device cannot compute, and why", () => {
    expect(form("{{ value_json.x * value_json.x }}")).toEqual({ unsupported: "a value times itself" })
    expect(form("{{ value_json.a + value_json.b }}")).toEqual({ unsupported: "more than one value" })
    expect(form("{{ value_json.x | int }}")).toEqual({ unsupported: "the filter int, which cuts off" })
    expect(form("{{ 10 / value_json.x }}")).toEqual({ unsupported: "a division by the value" })
    expect(form("{{ ((value_json.f - 32) * 5 / 9) | round(1) }}")).toEqual({ unsupported: "an offset too fine for a device" })
    expect(form("{{ value_json.x * 0.0000001 }}")).toEqual({ unsupported: "a factor too fine for a device" })
    expect(form("{{ (value_json.x - 273.15) | round(1) }}")).toEqual({ unsupported: "a rounding coarser than its offset" })
    expect(form("{{ value_json.x | round(1, 'floor') }}")).toEqual({ unsupported: "a rounding a device does not do" })
    expect(form("{{ 42 }}")).toEqual({ unsupported: "no value in it" })
    expect(form("x {{ value_json.x }}")).toEqual({ unsupported: "text outside {{ … }}" })
    expect(form("{{ value_json.x }} {{ value_json.y }}")).toEqual({ unsupported: "more than one {{ … }}" })
  })
})
